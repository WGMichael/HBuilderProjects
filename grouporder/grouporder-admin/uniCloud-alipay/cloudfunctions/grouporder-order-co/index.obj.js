/**
 * grouporder-order-co · 订单、改单、取消作废、团长统计
 * 服务对象：client
 * 契约：docs/arch/CLOUD_API.md §5
 *
 * 三条最容易出错的地方，实现时都在下方标注：
 * - 库存用带条件的原子自增，失败要手写补偿（不依赖事务）
 * - 限购按商品分别计算，改单时要排除本单已有明细
 * - 订单状态变更必须同步更新其全部明细的冗余 status
 */
const {
  auth, errors, paging, idempotent, state, stock, snapshot, deliverystat, lifecycle, bindMethods
} = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors
const { ACTIVITY, GOVERNANCE, ORDER, DELIVERY } = state

// 订单编辑锁时长（毫秒）：改单、下单写明细期间持有，云函数异常退出时到期自动失效
const EDIT_LOCK_MS = 30000

module.exports = {
  async _before () {
    bindMethods(this, module.exports)
    this.ctx = await auth.createContext(this, { admin: false })
    this.db = this.ctx.db
    this.dbCmd = this.ctx.db.command
  },

  _after (error, result) {
    // 使用中自动续期登录（auth.attachNewToken）
    if (error) return auth.attachNewToken(this.ctx, errors.normalize(error))
    return auth.attachNewToken(this.ctx, result)
  },

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  /**
   * 确定本单交付方式（D-086）：活动只支持一种时可不传；支持两种时必须由参与者选定，
   * 且只能是活动支持的方式
   */
  _resolveDeliveryType (activity, input) {
    const types = state.deliveryTypesOf(activity)
    if (input === undefined || input === null || input === '') {
      assertParam(types.length === 1, '请选择交付方式（送货上门 / 自提）')
      return types[0]
    }
    assertParam(types.includes(input), '该活动不支持所选的交付方式')
    return input
  },

  /** 自提点：活动级共享信息，【不进订单快照】，每次读活动最新值（D-077） */
  _pickupOf (activity) {
    return {
      address: activity.pickup_address || '',
      time_desc: activity.pickup_time_desc || '',
      contact_name: activity.pickup_contact_name || '',
      contact_mobile: activity.pickup_contact_mobile || ''
    }
  },

  async _getActivity (activityId) {
    assertParam(activityId, '缺少活动标识')
    const { data } = await this.db.collection('grouporder-activity').doc(activityId).get()
    const activity = data && data[0]
    if (!activity) throwBiz('NOT_FOUND', '活动不存在或已删除')
    return activity
  },

  /**
   * 改单时一条明细的金额（D-018）：本单原有的份数保留下单时的价格快照，只有新增的份数按商品当前价计。
   * price_snapshot 保留原价（有原明细时），金额 = 原份数 × 原价 + 新增份数 × 现价
   */
  _linePrice (goods, qty, oldItem) {
    if (!oldItem) return { price: goods.price, amount: goods.price * qty }
    const keep = Math.min(qty, oldItem.qty)
    return { price: oldItem.price_snapshot, amount: keep * oldItem.price_snapshot + (qty - keep) * goods.price }
  },

  /** 归一化入参明细并去重合并同一商品 */
  _normalizeItems (rawItems) {
    assertParam(Array.isArray(rawItems) && rawItems.length > 0, '请至少选择一个商品')
    const merged = new Map()
    for (const it of rawItems) {
      assertParam(it && it.goods_id, '明细缺少商品标识')
      const qty = parseInt(it.qty, 10)
      assertParam(Number.isInteger(qty) && qty >= 1, '商品数量必须是正整数')
      merged.set(it.goods_id, (merged.get(it.goods_id) || 0) + qty)
    }
    return Array.from(merged.entries()).map(([goods_id, qty]) => ({ goods_id, qty }))
  },

  /** 按 id 批量读商品，并校验都属于该活动 */
  async _loadGoods (activityId, goodsIds) {
    const { data } = await this.db.collection('grouporder-goods')
      .where({ _id: this.dbCmd.in(goodsIds), activity_id: activityId })
      .limit(goodsIds.length)
      .get()
    const map = new Map((data || []).map(g => [g._id, g]))
    for (const id of goodsIds) {
      if (!map.has(id)) throwBiz('NOT_FOUND', '所选商品不存在或不属于该活动', { goods_id: id })
    }
    return map
  },

  /** 取地址簿记录并校验归属 */
  async _loadAddress (uid, addressId) {
    if (!addressId) return null
    const { data } = await this.db.collection('grouporder-address').doc(addressId).get()
    const addr = data && data[0]
    if (!addr || addr.deleted === 1) throwBiz('NOT_FOUND', '收货信息不存在或已删除')
    if (addr.user_id !== uid) throwBiz('FORBIDDEN', '无权使用该条收货信息')
    return addr
  },

  /** 订单状态变更时同步明细的冗余 status（DATA_MODEL §4.4 说明 2） */
  async _syncItemStatus (orderId, status) {
    await this.db.collection('grouporder-order-item')
      .where({ order_id: orderId })
      .update({ status })
  },

  /** 读订单并校验本人 */
  async _getOwnOrder (uid, orderId) {
    assertParam(orderId, '缺少订单标识')
    const { data } = await this.db.collection('grouporder-order').doc(orderId).get()
    const order = data && data[0]
    if (!order) throwBiz('NOT_FOUND', '订单不存在')
    if (order.user_id !== uid) throwBiz('FORBIDDEN', '无权操作他人的订单')
    return order
  },

  /**
   * 按订单分批读完明细，返回 Map(order_id → 列表展示用明细[])。
   * 一页订单的明细条数 = 订单数 × 每单商品数，不能用单次固定上限读取
   */
  async _itemsByOrder (orderIds) {
    const items = await paging.fetchAllByIds(orderIds, ids =>
      this.db.collection('grouporder-order-item').where({ order_id: this.dbCmd.in(ids) }).orderBy('_id', 'asc'))
    const map = new Map()
    for (const it of items) {
      if (!map.has(it.order_id)) map.set(it.order_id, [])
      map.get(it.order_id).push({
        goods_id: it.goods_id, goods_name: it.goods_name,
        unit: it.unit_snapshot, price: it.price_snapshot, qty: it.qty, amount: it.amount
      })
    }
    return map
  },

  /**
   * 订单「未被锁定」条件：editing_until 不存在（老数据）或已过期（释放后置 0 也落在这里）。
   * 用 exists(false) 兼容没有该字段的旧订单；lt 不匹配缺失字段，两者缺一不可
   */
  _lockFree (now) {
    return this.dbCmd.or([
      { editing_until: this.dbCmd.exists(false) },
      { editing_until: this.dbCmd.lt(now) }
    ])
  },

  /** 带订单编辑锁条件的状态更新：取消 / 作废与改单互斥 */
  async _updateIfUnlocked (orderId, patch, now) {
    const res = await this.db.collection('grouporder-order')
      .where(this.dbCmd.and([{ _id: orderId, status: ORDER.VALID }, this._lockFree(now)]))
      .update(patch)
    return res.updated > 0
  },

  /** 释放编辑锁：只释放自己持有的那把，锁已过期被他人重新获取时不误放 */
  async _releaseLock (orderId, lockUntil) {
    try {
      await this.db.collection('grouporder-order')
        .where({ _id: orderId, editing_until: lockUntil })
        .update({ editing_until: 0 })
    } catch (e) {
      // 释放失败不影响本次结果，锁到期自动失效
      console.error('[grouporder] 释放订单编辑锁失败：', orderId, e && e.message)
    }
  },

  /**
   * 下单回滚：删本单明细与订单、归还本单占用的库存。
   * 先删明细再还库存：删除失败时宁可库存虚占，也不留下占着名额却没有库存的有效明细
   */
  async _rollbackCreate (orderId, plans) {
    try {
      await this.db.collection('grouporder-order-item').where({ order_id: orderId }).remove()
      await this.db.collection('grouporder-order').doc(orderId).remove()
      for (const p of plans) await stock.restore(this.ctx, p.goods._id, p.qty)
    } catch (e) {
      console.error('[grouporder] 下单回滚失败，需人工核对：', orderId, e && e.stack ? e.stack : e)
    }
  },

  async _getItems (orderId) {
    const { data } = await this.db.collection('grouporder-order-item')
      .where({ order_id: orderId }).limit(200).get()
    return data || []
  },

  // ==========================================================================
  // 方法
  // ==========================================================================

  /**
   * 确认订单页试算（M-14）
   * 校验库存、限购、活动状态，返回预计金额，【不落库】。
   * 试算不占用库存，因此提交时仍可能失败——这是有意的，占用只在 orderCreate 发生。
   * 改单时传 order_id：库存与限购排除本单已有明细，否则自己的份数会被算两遍（与 orderUpdate 口径一致）。
   */
  async orderPreview (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const activity = await this._getActivity(params.activity_id)
    state.assertActivityJoinable(activity, ctx.now)

    const items = this._normalizeItems(params.items)
    const goodsMap = await this._loadGoods(activity._id, items.map(i => i.goods_id))

    let excludeOrderId
    let ownQty = new Map()
    let ownItems = new Map()
    if (params.order_id) {
      const own = await this._getOwnOrder(uid, params.order_id)
      assertParam(own.activity_id === activity._id, '订单与活动不匹配')
      excludeOrderId = own._id
      const oldItems = await this._getItems(own._id)
      ownQty = new Map(oldItems.map(it => [it.goods_id, it.qty]))
      ownItems = new Map(oldItems.map(it => [it.goods_id, it]))
    }

    const lines = []
    const unavailable = []
    let totalQty = 0
    let totalAmount = 0

    for (const it of items) {
      const goods = goodsMap.get(it.goods_id)
      const oldItem = ownItems.get(goods._id)
      // 改单时不增加份数的商品：停售、下架、库存与限购都不阻止保留或减少（D-019、D-050），照常计入
      if (oldItem && it.qty <= oldItem.qty) {
        const lp = this._linePrice(goods, it.qty, oldItem)
        lines.push({ goods_id: goods._id, goods_name: oldItem.goods_name, unit: oldItem.unit_snapshot, price: lp.price, qty: it.qty, amount: lp.amount })
        totalQty += it.qty
        totalAmount += lp.amount
        continue
      }
      // 逐项收集不可选原因，一次性告诉用户，而不是遇到第一个就中断
      if (goods.governance_status === GOVERNANCE.OFF) {
        unavailable.push({ goods_id: goods._id, name: goods.name, errCode: 'GOODS_OFFLINE' })
        continue
      }
      if (goods.on_sale !== 1) {
        unavailable.push({ goods_id: goods._id, name: goods.name, errCode: 'GOODS_OFF_SALE' })
        continue
      }
      const othersSold = (goods.sold_qty || 0) - (ownQty.get(goods._id) || 0)
      if (goods.total_stock > 0 && othersSold + it.qty > goods.total_stock) {
        unavailable.push({
          goods_id: goods._id, name: goods.name, errCode: 'STOCK_NOT_ENOUGH',
          remain_qty: Math.max(0, goods.total_stock - othersSold)
        })
        continue
      }
      try {
        await stock.checkUserLimit(ctx, {
          activityId: activity._id, goods, userId: uid, addQty: it.qty, excludeOrderId
        })
      } catch (e) {
        unavailable.push({
          goods_id: goods._id, name: goods.name,
          errCode: 'LIMIT_EXCEEDED', per_user_limit: goods.per_user_limit
        })
        continue
      }
      // 改单时本单原有份数保留原价，新增份数按现价（D-018，与 orderUpdate 同口径）
      const { price, amount } = this._linePrice(goods, it.qty, oldItem)
      lines.push({
        goods_id: goods._id,
        goods_name: goods.name,
        unit: goods.unit,
        price,
        qty: it.qty,
        amount
      })
      totalQty += it.qty
      totalAmount += amount
    }

    return ok({
      activity_id: activity._id,
      // 可选的交付方式（D-086）：只有一种时下单无需选择；自提不采集完整地址（D-060）
      delivery_types: state.deliveryTypesOf(activity),
      // 支持自提时带上自提点，供参与者选择前了解去哪取（D-077）
      pickup: state.supportsDelivery(activity, DELIVERY.SELF_PICK) ? this._pickupOf(activity) : null,
      items: lines,
      unavailable,
      total_qty: totalQty,
      total_amount: totalAmount,
      asOf: ctx.now
    })
  },

  /**
   * 提交订单（M-14）
   * 幂等键必传；库存带条件原子自增；限购按商品分别计算；
   * 固化价格与收货快照；交付方式由参与者选定并落在订单上，自提不采集地址（D-086）。
   */
  async orderCreate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const key = String(params.idempotent_key || '').trim()
    assertParam(key, '缺少幂等键')

    // 重试先走这条路径，返回首次结果而不是报错；带上 user_id，别人的幂等键撞上也不会返回他人订单
    const existed = await this.db.collection('grouporder-order')
      .where({ idempotent_key: key, user_id: uid }).limit(1).get()
    if (existed.data && existed.data.length) {
      const o = existed.data[0]
      return ok({ order_id: o._id, order_no: o.order_no, total_qty: o.total_qty, total_amount: o.total_amount, duplicated: true })
    }

    const activity = await this._getActivity(params.activity_id)
    // 写入前重新校验活动 status / end_time / governance_status（§8.4）
    state.assertActivityJoinable(activity, ctx.now)

    const items = this._normalizeItems(params.items)
    const goodsMap = await this._loadGoods(activity._id, items.map(i => i.goods_id))

    // 1) 可售状态与限购：全部通过后才动库存
    for (const it of items) {
      const goods = goodsMap.get(it.goods_id)
      state.assertGoodsSelectable(goods)
      await stock.checkUserLimit(ctx, {
        activityId: activity._id, goods, userId: uid, addQty: it.qty
      })
    }

    // 2) 交付方式与收货快照：自提只要姓名电话，送货上门必须有完整地址
    const deliveryType = this._resolveDeliveryType(activity, params.delivery_type)
    const addressDoc = deliveryType === DELIVERY.HOME ? await this._loadAddress(uid, params.address_id) : null
    const consignee = snapshot.buildConsignee(deliveryType, params, addressDoc)

    const remark = String(params.buyer_remark || '')
    assertParam(remark.length <= 200, '买家备注不超过 200 字')

    // 3) 库存原子占用；任一失败即回退已占用的部分
    const plans = items.map(it => ({ goods: goodsMap.get(it.goods_id), qty: it.qty }))
    const deducted = await stock.deductBatch(ctx, plans)
    if (!deducted.ok) {
      const g = deducted.failed
      throwBiz('STOCK_NOT_ENOUGH', `商品「${g.name}」库存不足或已停售`, { goods_id: g._id })
    }

    // 4) 落库。唯一索引冲突说明并发重复提交，必须把已占用的库存还回去
    const draftItems = items.map(it => snapshot.buildItem(
      { activity_id: activity._id, user_id: uid, status: ORDER.VALID },
      goodsMap.get(it.goods_id), it.qty, ctx.now
    ))
    const sum = snapshot.summarize(draftItems)

    // 订单带编辑锁落库：写明细与限购复核期间，取消 / 改单都拿不到锁，不会对着半成品操作
    const lockUntil = ctx.now + EDIT_LOCK_MS
    // 订单号尾部是随机数，同一活动同一天单量大时可能撞上唯一索引：
    // 撞的是订单号（而非幂等键）就换号重试，最多 5 次
    let orderId, orderNo
    for (let attempt = 1; ; attempt++) {
      try {
        orderNo = idempotent.buildOrderNo(activity.short_code, ctx.now)
        const res = await this.db.collection('grouporder-order').add(Object.assign({
          order_no: orderNo,
          idempotent_key: key,
          activity_id: activity._id,
          user_id: uid,
          status: ORDER.VALID,
          delivery_type: deliveryType,
          buyer_remark: remark,
          total_qty: sum.total_qty,
          total_amount: sum.total_amount,
          anonymized: 0,
          editing_until: lockUntil,
          create_date: ctx.now
        }, consignee))
        orderId = res.id
        break
      } catch (e) {
        if (idempotent.isDuplicateKeyError(e)) {
          const again = await this.db.collection('grouporder-order')
            .where({ idempotent_key: key, user_id: uid }).limit(1).get()
          if (again.data && again.data.length) {
            // 并发重复提交：首单已落库，还回本次占用的库存，返回首单
            for (const p of plans) await stock.restore(ctx, p.goods._id, p.qty)
            const o = again.data[0]
            return ok({ order_id: o._id, order_no: o.order_no, total_qty: o.total_qty, total_amount: o.total_amount, duplicated: true })
          }
          // 订单号撞号：库存仍占着，换号重试
          if (attempt < 5) continue
        }
        for (const p of plans) await stock.restore(ctx, p.goods._id, p.qty)
        throw e
      }
    }

    // 写明细中途失败会留下无明细的订单（重试只会拿到 duplicated），必须整单回滚
    try {
      for (const item of draftItems) {
        item.order_id = orderId
        await this.db.collection('grouporder-order-item').add(item)
      }
    } catch (e) {
      await this._rollbackCreate(orderId, plans)
      throw e
    }

    // 限购事后复核：同一用户用不同幂等键并发下单时，上面的先查后扣会被绕过
    const exceeded = await stock.findLimitExceeded(ctx, {
      activityId: activity._id, goodsList: plans.map(p => p.goods), userId: uid
    })
    if (exceeded) {
      await this._rollbackCreate(orderId, plans)
      stock.throwLimitExceeded(exceeded.goods)
    }
    await this._releaseLock(orderId, lockUntil)

    // ever_ordered 置 1 后永不回退，即使明细后来全部取消（D-026）
    await this.db.collection('grouporder-goods')
      .where({ _id: this.dbCmd.in(items.map(i => i.goods_id)) })
      .update({ ever_ordered: 1 })

    return ok({
      order_id: orderId,
      order_no: orderNo,
      total_qty: sum.total_qty,
      total_amount: sum.total_amount,
      duplicated: false
    })
  },

  /**
   * 我参与的（M-18）
   * 按活动分组，一个活动下可有本人多张订单（D-014）。
   * 分页单位是【活动分组】而不是订单：先取本人全部订单（只取列表要的字段，分批读完），
   * 按活动归组、组按最近一次下单时间倒序，再对组分页；同一活动的订单不会被拆到两页。
   * total 为分组数。只为当前页的组读活动与明细。
   */
  async orderMyList (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date']
    })

    const where = { user_id: uid }
    if (p.filters.status) where.status = p.filters.status
    if (p.filters.activity_id) where.activity_id = p.filters.activity_id

    // 1) 本人订单分批读完：单次读取有条数上限，不能只读第一批
    const orders = await paging.fetchAll(() => this.db.collection('grouporder-order').where(where)
      .field({ order_no: true, activity_id: true, status: true, delivery_type: true, total_qty: true, total_amount: true, create_date: true })
      .orderBy('create_date', 'desc').orderBy('_id', 'asc'))

    // 2) 按活动归组；订单已按下单时间倒序，组的先后即最近一次下单的先后
    const groupMap = new Map()
    for (const o of orders) {
      if (!groupMap.has(o.activity_id)) groupMap.set(o.activity_id, [])
      groupMap.get(o.activity_id).push(o)
    }
    const allGroups = [...groupMap.entries()]
    const pageGroups = allGroups.slice(p.skip, p.skip + p.pageSize)
    if (!pageGroups.length) return ok(paging.wrap([], allGroups.length, ctx.now))

    // 3) 只为当前页读活动与明细；in 查询按批，避免单次 id 过多
    const activities = await paging.fetchAllByIds(pageGroups.map(([id]) => id), ids =>
      this.db.collection('grouporder-activity').where({ _id: this.dbCmd.in(ids) }).orderBy('_id', 'asc'))
    const actMap = new Map(activities.map(a => [a._id, a]))
    // 读时补截止：已过截止时间的活动此刻即显示为已截止，不等定时任务
    await lifecycle.closeExpiredIn(ctx, [...actMap.values()])

    const pageOrderIds = pageGroups.reduce((acc, [, list]) => acc.concat(list.map(o => o._id)), [])
    const itemMap = await this._itemsByOrder(pageOrderIds)

    // 4) 组装：组内保持订单的时间倒序
    const groups = pageGroups.map(([activityId, list]) => {
      const a = actMap.get(activityId)
      return {
        activity_id: activityId,
        title: a ? a.title : '',
        cover_image: a ? a.cover_image : null,
        activity_status: a ? a.status : null,
        governance_status: a ? a.governance_status : null,
        // 已发布但未到起始时间（D-087）：不是独立状态，供列表标「未开始」
        not_started: a ? state.isNotStarted(a, ctx.now) : false,
        delivery_types: a ? state.deliveryTypesOf(a) : [],
        start_time: a ? a.start_time || null : null,
        end_time: a ? a.end_time : null,
        orders: list.map(o => ({
          _id: o._id,
          order_no: o.order_no,
          status: o.status,
          delivery_type: state.orderDeliveryTypeOf(o, a),
          total_qty: o.total_qty,
          total_amount: o.total_amount,
          create_date: o.create_date,
          items: itemMap.get(o._id) || []
        }))
      }
    })
    return ok(paging.wrap(groups, allGroups.length, ctx.now))
  },

  /** 订单详情（M-19）：返回收货快照 */
  async orderGetDetail (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const order = await this._getOwnOrder(uid, params.order_id)
    const items = await this._getItems(order._id)
    const activity = await this._getActivity(order.activity_id)
    const deliveryType = state.orderDeliveryTypeOf(order, activity)

    return ok({
      _id: order._id,
      order_no: order.order_no,
      status: order.status,
      // 本单交付方式（D-086）；活动支持的全部方式供改单时切换
      delivery_type: deliveryType,
      activity: {
        _id: activity._id,
        title: activity.title,
        status: activity.status,
        governance_status: activity.governance_status,
        delivery_types: state.deliveryTypesOf(activity),
        end_time: activity.end_time
      },
      // 自提点不随订单快照固化：团长改了地址，已下单的人看到的也要是新地址（D-077）
      pickup: deliveryType === DELIVERY.SELF_PICK ? this._pickupOf(activity) : null,
      // 收货快照：改地址簿不影响历史订单
      consignee_name: order.consignee_name,
      consignee_mobile: order.consignee_mobile,
      consignee_address: order.consignee_address || '',
      buyer_remark: order.buyer_remark || '',
      total_qty: order.total_qty,
      total_amount: order.total_amount,
      cancel_time: order.cancel_time || null,
      cancel_reason: order.cancel_reason || '',
      void_time: order.void_time || null,
      void_reason: order.void_reason || '',
      create_date: order.create_date,
      items: items.map(it => ({
        goods_id: it.goods_id,
        goods_name: it.goods_name,
        unit: it.unit_snapshot,
        price: it.price_snapshot,
        qty: it.qty,
        amount: it.amount
      })),
      // 截止前才允许改单与取消
      editable: order.status === ORDER.VALID &&
        activity.status === ACTIVITY.ONGOING &&
        ctx.now < activity.end_time,
      asOf: ctx.now
    })
  },

  /**
   * 改单（M-19）
   * 截止前允许改数量、移除商品、换收货信息、换交付方式（D-086）、改备注（D-049）。
   * 扩大数量要重新走库存与限购校验；移除全部明细时不保存空订单。
   * 全程持有订单编辑锁（editing_until）：连点两次修改、改单与取消 / 作废并发时只有一方能进行，
   * 避免明细重复、库存多扣、订单已取消而明细仍被改写。
   */
  async orderUpdate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const order = await this._getOwnOrder(uid, params.order_id)
    if (order.status !== ORDER.VALID) {
      throwBiz('STATE_CHANGED', '该订单已取消或已作废，不能再修改')
    }

    // 带条件获取编辑锁：仍有效且无人持锁（或锁已过期）才能拿到
    const lockUntil = ctx.now + EDIT_LOCK_MS
    const locked = await this._updateIfUnlocked(order._id, { editing_until: lockUntil }, ctx.now)
    if (!locked) {
      const latest = await this._getOwnOrder(uid, order._id)
      if (latest.status !== ORDER.VALID) throwBiz('STATE_CHANGED', '该订单已取消或已作废，不能再修改')
      throwBiz('STATE_CHANGED', '订单正在处理中，请稍后重试')
    }
    try {
      return await this._applyOrderUpdate(uid, order._id, params)
    } finally {
      await this._releaseLock(order._id, lockUntil)
    }
  },

  /** 改单主体，只能在持有编辑锁时调用 */
  async _applyOrderUpdate (uid, orderId, params) {
    const ctx = this.ctx
    // 持锁后重读：锁外读到的订单可能已被上一次改单改过
    const order = await this._getOwnOrder(uid, orderId)
    const activity = await this._getActivity(order.activity_id)
    // 缩小类操作只要求「截止前」；停售与下架不阻止缩小（D-019、D-050）
    state.assertActivityShrinkable(activity, ctx.now)

    // 1) 交付方式、收货信息、备注先校验并算好：入参不合法时还没动过库存与明细
    const patch = {}
    // 换交付方式（D-086）：只能在活动支持的方式之间切换；换了就必须按新口径重建收货快照
    const prevDelivery = state.orderDeliveryTypeOf(order, activity)
    let nextDelivery = prevDelivery
    if (params.delivery_type !== undefined && params.delivery_type !== prevDelivery) {
      nextDelivery = this._resolveDeliveryType(activity, params.delivery_type)
      patch.delivery_type = nextDelivery
    }

    if (nextDelivery !== prevDelivery ||
        params.address_id !== undefined || params.consignee_name !== undefined ||
        params.consignee_mobile !== undefined || params.consignee_address !== undefined) {
      const addressDoc = nextDelivery === DELIVERY.HOME ? await this._loadAddress(uid, params.address_id) : null
      Object.assign(patch, snapshot.buildConsignee(nextDelivery, {
        consignee_name: params.consignee_name !== undefined ? params.consignee_name : order.consignee_name,
        consignee_mobile: params.consignee_mobile !== undefined ? params.consignee_mobile : order.consignee_mobile,
        consignee_address: params.consignee_address !== undefined ? params.consignee_address : order.consignee_address,
        address_id: params.address_id
      }, addressDoc))
    }

    if (params.buyer_remark !== undefined) {
      const r = String(params.buyer_remark)
      assertParam(r.length <= 200, '买家备注不超过 200 字')
      patch.buyer_remark = r
    }

    const itemsChanged = params.items !== undefined
    assertParam(Object.keys(patch).length > 0 || itemsChanged, '没有需要修改的内容')

    if (itemsChanged) {
      const targets = this._normalizeItems(params.items)
      const targetIds = new Set(targets.map(t => t.goods_id))
      const oldItems = await this._getItems(order._id)
      const oldMap = new Map(oldItems.map(it => [it.goods_id, it]))

      const goodsMap = await this._loadGoods(activity._id, targets.map(t => t.goods_id))
      const increases = [] // { goods, qty: 增量, target: 改后数量 }
      const decreases = [] // { goods_id, qty: 减量, target: 改后数量，0 表示整条移除 }

      for (const t of targets) {
        const goods = goodsMap.get(t.goods_id)
        const oldQty = oldMap.has(t.goods_id) ? oldMap.get(t.goods_id).qty : 0
        const delta = t.qty - oldQty
        if (delta > 0) {
          // 新增或扩大：活动与商品都必须处于可参与状态
          state.assertActivityJoinable(activity, ctx.now)
          state.assertGoodsSelectable(goods)
          // 限购按改后的总量算，并排除本单已有明细，避免把自己算两遍（先查快速拒绝，写入后还有复核）
          await stock.checkUserLimit(ctx, {
            activityId: activity._id, goods, userId: uid,
            addQty: t.qty, excludeOrderId: order._id
          })
          increases.push({ goods, qty: delta, target: t.qty })
        } else if (delta < 0) {
          decreases.push({ goods_id: t.goods_id, qty: -delta, target: t.qty })
        }
      }
      // 被整条移除的商品
      for (const it of oldItems) {
        if (!targetIds.has(it.goods_id)) decreases.push({ goods_id: it.goods_id, qty: it.qty, target: 0 })
      }

      // 2) 先占用增量库存，失败即整体放弃，不改任何明细
      const deducted = await stock.deductBatch(ctx, increases)
      if (!deducted.ok) {
        const g = deducted.failed
        throwBiz('STOCK_NOT_ENOUGH', `商品「${g.name}」库存不足或已停售`, { goods_id: g._id })
      }

      // 明细金额口径（D-018）：数量没变的不动，保留下单时的名称、单位与价格快照；
      // 数量变了的原份数保留原价、新增份数按现价；移除的删掉；新加的按现价建快照
      const itemColl = this.db.collection('grouporder-order-item')
      const lineMap = new Map()

      // 3) 先写增量明细再复核限购：并发的另一单做事后复核时能看到本单的新份数。
      //    减量放到复核之后，复核失败只需撤回增量，不必把已归还的库存再占回来
      const written = []
      try {
        for (const inc of increases) {
          const old = oldMap.get(inc.goods._id)
          if (old) {
            const lp = this._linePrice(inc.goods, inc.target, old)
            await itemColl.doc(old._id).update({ qty: inc.target, amount: lp.amount })
            written.push({ old })
            lineMap.set(old.goods_id, Object.assign({}, old, { qty: inc.target, amount: lp.amount }))
            continue
          }
          const line = snapshot.buildItem(
            { _id: order._id, activity_id: activity._id, user_id: uid, status: ORDER.VALID },
            inc.goods, inc.target, ctx.now
          )
          const res = await itemColl.add(line)
          written.push({ newId: res.id })
          lineMap.set(line.goods_id, line)
        }
        const exceeded = await stock.findLimitExceeded(ctx, {
          activityId: activity._id, goodsList: increases.map(i => i.goods), userId: uid
        })
        if (exceeded) stock.throwLimitExceeded(exceeded.goods)
      } catch (e) {
        // 撤回增量：明细恢复到改单前，归还本次占用的库存
        try {
          for (const w of written) {
            if (w.newId) await itemColl.doc(w.newId).remove()
            else await itemColl.doc(w.old._id).update({ qty: w.old.qty, amount: w.old.amount })
          }
          for (const inc of increases) await stock.restore(ctx, inc.goods._id, inc.qty)
        } catch (re) {
          console.error('[grouporder] 改单撤回失败，需人工核对：', order._id, re && re.stack ? re.stack : re)
        }
        throw e
      }

      // 4) 减量与移除：先改明细再还库存，中途失败时宁可库存虚占也不超卖
      for (const d of decreases) {
        const old = oldMap.get(d.goods_id)
        if (d.target === 0) {
          await itemColl.doc(old._id).remove()
        } else {
          const lp = this._linePrice(goodsMap.get(d.goods_id), d.target, old)
          await itemColl.doc(old._id).update({ qty: d.target, amount: lp.amount })
          lineMap.set(d.goods_id, Object.assign({}, old, { qty: d.target, amount: lp.amount }))
        }
        await stock.restore(ctx, d.goods_id, d.qty)
      }

      // 改单新加的商品同样要置 ever_ordered（D-026），否则该商品仍可被删除
      const addedIds = increases.filter(i => !oldMap.has(i.goods._id)).map(i => i.goods._id)
      if (addedIds.length) {
        await this.db.collection('grouporder-goods')
          .where({ _id: this.dbCmd.in(addedIds) })
          .update({ ever_ordered: 1 })
      }

      const newLines = targets.map(t => lineMap.get(t.goods_id) || oldMap.get(t.goods_id))
      const sum = snapshot.summarize(newLines)
      patch.total_qty = sum.total_qty
      patch.total_amount = sum.total_amount
    }

    await this.db.collection('grouporder-order').doc(order._id).update(patch)

    return ok({
      order_id: order._id,
      total_qty: patch.total_qty !== undefined ? patch.total_qty : order.total_qty,
      total_amount: patch.total_amount !== undefined ? patch.total_amount : order.total_amount
    })
  },

  /**
   * 参与者取消整单（M-19）
   * 截止前；返还库存；终态不可逆；取消后仍可新建订单，原记录保留（D-025）。
   */
  async orderCancel (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const order = await this._getOwnOrder(uid, params.order_id)
    state.assertOrderTransition(order.status, ORDER.CANCELLED)

    const activity = await this._getActivity(order.activity_id)
    state.assertActivityShrinkable(activity, ctx.now)

    // 先改状态再返还：状态改动带条件，可挡住并发重复取消导致的多次返还；
    // 同时要求订单未被编辑锁占用，与进行中的改单 / 下单互斥
    const updated = await this._updateIfUnlocked(order._id, {
      status: ORDER.CANCELLED,
      cancel_time: ctx.now,
      cancel_reason: String(params.reason || '')
    }, ctx.now)
    if (!updated) throwBiz('STATE_CHANGED', '订单状态已变化或正在处理中，请稍后刷新重试')

    // 状态改成功后再读明细：此后改单拿不到锁，明细不会再变，返还的就是最终份数
    const items = await this._getItems(order._id)
    for (const it of items) await stock.restore(ctx, it.goods_id, it.qty)
    await this._syncItemStatus(order._id, ORDER.CANCELLED)

    return ok({ order_id: order._id, status: ORDER.CANCELLED })
  },

  /**
   * 团长作废整单（M-20 / M-21）
   * 仅团长、仅截止后、原因必填；返还库存；使已有 Excel 清单版本失效（D-051）。
   */
  async orderVoid (params = {}) {
    const ctx = this.ctx
    auth.requireLogin(ctx)
    assertParam(params.order_id, '缺少订单标识')

    const { data } = await this.db.collection('grouporder-order').doc(params.order_id).get()
    const order = data && data[0]
    if (!order) throwBiz('NOT_FOUND', '订单不存在')

    // 团长本人校验：跨活动一律拒绝
    const activity = await auth.requireLeader(ctx, order.activity_id)
    state.assertOrderTransition(order.status, ORDER.VOIDED)

    const closed = activity.status === ACTIVITY.CLOSED ||
      (activity.end_time && ctx.now >= activity.end_time)
    if (!closed) throwBiz('PRECONDITION_UNMET', '活动截止后才能作废订单')

    const reason = String(params.reason || '').trim()
    assertParam(reason, '作废原因必填')

    // 与取消同理：带有效状态与编辑锁条件，成功后再读明细返还
    const updated = await this._updateIfUnlocked(order._id, {
      status: ORDER.VOIDED,
      void_uid: ctx.uid,
      void_time: ctx.now,
      void_reason: reason
    }, ctx.now)
    if (!updated) throwBiz('STATE_CHANGED', '订单状态已变化或正在处理中，请稍后刷新重试')

    const items = await this._getItems(order._id)
    for (const it of items) await stock.restore(ctx, it.goods_id, it.qty)
    await this._syncItemStatus(order._id, ORDER.VOIDED)

    // 统计口径变了，既有清单版本即刻失效（D-051）。
    // 失效是派生状态：export-co 按「版本生成时间 < 最近一次作废时间」现场判定，
    // 因此这里不需要也不应该回写任何标记（schema 无该字段）。

    return ok({ order_id: order._id, status: ORDER.VOIDED, export_versions_invalidated: true })
  },

  /**
   * 团长统计（M-21）
   * 有效订单数、有效总份数、商品汇总、预计金额。
   * 【不出现销售额 / 实收 / GMV】——平台没有支付能力，不能确认实际成交。
   */
  async orderLeaderStat (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)

    const [orderCount, cancelCount, voidCount, itemAgg, goodsAgg, byDelivery] = await Promise.all([
      this.db.collection('grouporder-order').where({ activity_id: activity._id, status: ORDER.VALID }).count(),
      this.db.collection('grouporder-order').where({ activity_id: activity._id, status: ORDER.CANCELLED }).count(),
      this.db.collection('grouporder-order').where({ activity_id: activity._id, status: ORDER.VOIDED }).count(),
      this.db.collection('grouporder-order-item').aggregate()
        .match({ activity_id: activity._id, status: ORDER.VALID })
        .group({ _id: null, qty: { $sum: '$qty' }, amount: { $sum: '$amount' } })
        .end(),
      this.db.collection('grouporder-order-item').aggregate()
        .match({ activity_id: activity._id, status: ORDER.VALID })
        .group({
          _id: '$goods_id',
          goods_name: { $first: '$goods_name' },
          unit: { $first: '$unit_snapshot' },
          qty: { $sum: '$qty' },
          amount: { $sum: '$amount' }
        })
        // 显式上限：不依赖平台默认返回条数，商品多时不截断
        .limit(paging.AGG_LIMIT)
        .end(),
      deliverystat.breakdown(ctx, activity)
    ])

    const total = (itemAgg.data && itemAgg.data[0]) || { qty: 0, amount: 0 }
    // 商品汇总与活动详情页用同一排序口径（sort ASC, create_date ASC）
    const goodsList = await this.db.collection('grouporder-goods')
      .where({ activity_id: activity._id })
      .orderBy('sort', 'asc').orderBy('create_date', 'asc').limit(60).get()
    const aggMap = new Map((goodsAgg.data || []).map(r => [r._id, r]))

    return ok({
      activity_id: activity._id,
      title: activity.title,
      status: activity.status,
      governance_status: activity.governance_status,
      valid_order_count: orderCount.total || 0,
      cancelled_order_count: cancelCount.total || 0,
      voided_order_count: voidCount.total || 0,
      valid_total_qty: total.qty || 0,
      estimated_amount: total.amount || 0,
      // 按交付方式拆分的有效单数与份数（D-086）
      delivery_types: state.deliveryTypesOf(activity),
      by_delivery: byDelivery,
      goods_summary: (goodsList.data || []).map(g => {
        const r = aggMap.get(g._id)
        return {
          goods_id: g._id,
          goods_name: g.name,
          unit: g.unit,
          sold_qty: r ? r.qty : 0,
          estimated_amount: r ? r.amount : 0,
          on_sale: g.on_sale,
          governance_status: g.governance_status
        }
      }),
      asOf: ctx.now
    })
  },

  /**
   * 团长看参与者明细（M-21）
   * 团长可读【本人活动】履约所需的收货字段（D-016）；跨活动读取一律拒绝。
   */
  async orderLeaderList (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'asc' },
      allowOrderFields: ['create_date', 'total_qty', 'total_amount']
    })

    const where = { activity_id: activity._id }
    where.status = p.filters.status || ORDER.VALID

    const coll = this.db.collection('grouporder-order').where(where)
    const [listRes, countRes] = await Promise.all([
      // 加 _id 作次排序：同一时间的订单翻页时顺序稳定，不重复不遗漏
      coll.orderBy(p.orderBy.field, p.orderBy.direction).orderBy('_id', 'asc').skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])
    const orders = listRes.data || []

    // 本页订单的明细分批读完（每单可有多件商品）
    const itemMap = await this._itemsByOrder(orders.map(o => o._id))

    const list = orders.map(o => {
      const deliveryType = state.orderDeliveryTypeOf(o, activity)
      return {
        _id: o._id,
        order_no: o.order_no,
        status: o.status,
        delivery_type: deliveryType,
        consignee_name: o.consignee_name,
        consignee_mobile: o.consignee_mobile,
        // 自提单没有地址，不返回空串以外的内容
        consignee_address: deliveryType === DELIVERY.SELF_PICK ? '' : (o.consignee_address || ''),
        buyer_remark: o.buyer_remark || '',
        total_qty: o.total_qty,
        total_amount: o.total_amount,
        create_date: o.create_date,
        void_reason: o.void_reason || '',
        items: itemMap.get(o._id) || []
      }
    })

    return ok(paging.wrap(list, countRes.total, ctx.now))
  }
}
