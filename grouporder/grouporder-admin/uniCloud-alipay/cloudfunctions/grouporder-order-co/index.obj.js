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
  auth, errors, paging, idempotent, state, stock, snapshot
} = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors
const { ACTIVITY, GOVERNANCE, ORDER, DELIVERY } = state

module.exports = {
  async _before () {
    this.ctx = await auth.createContext(this, { admin: false })
    this.db = this.ctx.db
    this.dbCmd = this.ctx.db.command
  },

  _after (error, result) {
    if (error) return errors.normalize(error)
    return result
  },

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  async _getActivity (activityId) {
    assertParam(activityId, '缺少活动标识')
    const { data } = await this.db.collection('grouporder-activity').doc(activityId).get()
    const activity = data && data[0]
    if (!activity) throwBiz('NOT_FOUND', '活动不存在或已删除')
    return activity
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
   */
  async orderPreview (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const activity = await this._getActivity(params.activity_id)
    state.assertActivityJoinable(activity, ctx.now)

    const items = this._normalizeItems(params.items)
    const goodsMap = await this._loadGoods(activity._id, items.map(i => i.goods_id))

    const lines = []
    const unavailable = []
    let totalQty = 0
    let totalAmount = 0

    for (const it of items) {
      const goods = goodsMap.get(it.goods_id)
      // 逐项收集不可选原因，一次性告诉用户，而不是遇到第一个就中断
      if (goods.governance_status === GOVERNANCE.OFF) {
        unavailable.push({ goods_id: goods._id, name: goods.name, errCode: 'GOODS_OFFLINE' })
        continue
      }
      if (goods.on_sale !== 1) {
        unavailable.push({ goods_id: goods._id, name: goods.name, errCode: 'GOODS_OFF_SALE' })
        continue
      }
      if (goods.total_stock > 0 && (goods.sold_qty || 0) + it.qty > goods.total_stock) {
        unavailable.push({
          goods_id: goods._id, name: goods.name, errCode: 'STOCK_NOT_ENOUGH',
          remain_qty: Math.max(0, goods.total_stock - (goods.sold_qty || 0))
        })
        continue
      }
      try {
        await stock.checkUserLimit(ctx, {
          activityId: activity._id, goods, userId: uid, addQty: it.qty
        })
      } catch (e) {
        unavailable.push({
          goods_id: goods._id, name: goods.name,
          errCode: 'LIMIT_EXCEEDED', per_user_limit: goods.per_user_limit
        })
        continue
      }
      const amount = goods.price * it.qty
      lines.push({
        goods_id: goods._id,
        goods_name: goods.name,
        unit: goods.unit,
        price: goods.price,
        qty: it.qty,
        amount
      })
      totalQty += it.qty
      totalAmount += amount
    }

    return ok({
      activity_id: activity._id,
      delivery_type: activity.delivery_type,
      // 自提活动不采集完整地址（D-060）
      need_address: activity.delivery_type === DELIVERY.HOME,
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
   * 固化价格与收货快照；自提活动不采集地址。
   */
  async orderCreate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const key = String(params.idempotent_key || '').trim()
    assertParam(key, '缺少幂等键')

    // 重试先走这条路径，返回首次结果而不是报错
    const existed = await this.db.collection('grouporder-order')
      .where({ idempotent_key: key }).limit(1).get()
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

    // 2) 收货快照：自提只要姓名电话，送货上门必须有完整地址
    const addressDoc = await this._loadAddress(uid, params.address_id)
    const consignee = snapshot.buildConsignee(activity, params, addressDoc)

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

    let orderId, orderNo
    try {
      orderNo = idempotent.buildOrderNo(activity.short_code, ctx.now)
      const res = await this.db.collection('grouporder-order').add(Object.assign({
        order_no: orderNo,
        idempotent_key: key,
        activity_id: activity._id,
        user_id: uid,
        status: ORDER.VALID,
        buyer_remark: remark,
        total_qty: sum.total_qty,
        total_amount: sum.total_amount,
        anonymized: 0,
        create_date: ctx.now
      }, consignee))
      orderId = res.id
    } catch (e) {
      for (const p of plans) await stock.restore(ctx, p.goods._id, p.qty)
      if (idempotent.isDuplicateKeyError(e)) {
        const again = await this.db.collection('grouporder-order')
          .where({ idempotent_key: key }).limit(1).get()
        if (again.data && again.data.length) {
          const o = again.data[0]
          return ok({ order_id: o._id, order_no: o.order_no, total_qty: o.total_qty, total_amount: o.total_amount, duplicated: true })
        }
      }
      throw e
    }

    for (const item of draftItems) {
      item.order_id = orderId
      await this.db.collection('grouporder-order-item').add(item)
    }

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

    const coll = this.db.collection('grouporder-order').where(where)
    const [listRes, countRes] = await Promise.all([
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])
    const orders = listRes.data || []
    if (!orders.length) return ok(paging.wrap([], 0, ctx.now))

    const activityIds = [...new Set(orders.map(o => o.activity_id))]
    const { data: activities } = await this.db.collection('grouporder-activity')
      .where({ _id: this.dbCmd.in(activityIds) }).limit(activityIds.length).get()
    const actMap = new Map((activities || []).map(a => [a._id, a]))

    const { data: items } = await this.db.collection('grouporder-order-item')
      .where({ order_id: this.dbCmd.in(orders.map(o => o._id)) }).limit(500).get()
    const itemMap = new Map()
    for (const it of (items || [])) {
      if (!itemMap.has(it.order_id)) itemMap.set(it.order_id, [])
      itemMap.get(it.order_id).push({
        goods_id: it.goods_id, goods_name: it.goods_name,
        unit: it.unit_snapshot, price: it.price_snapshot, qty: it.qty, amount: it.amount
      })
    }

    // 按活动分组返回，组内保持订单的时间倒序
    const groups = []
    const groupIndex = new Map()
    for (const o of orders) {
      const a = actMap.get(o.activity_id)
      if (!groupIndex.has(o.activity_id)) {
        groupIndex.set(o.activity_id, groups.length)
        groups.push({
          activity_id: o.activity_id,
          title: a ? a.title : '',
          cover_image: a ? a.cover_image : null,
          activity_status: a ? a.status : null,
          governance_status: a ? a.governance_status : null,
          delivery_type: a ? a.delivery_type : null,
          end_time: a ? a.end_time : null,
          orders: []
        })
      }
      groups[groupIndex.get(o.activity_id)].orders.push({
        _id: o._id,
        order_no: o.order_no,
        status: o.status,
        total_qty: o.total_qty,
        total_amount: o.total_amount,
        create_date: o.create_date,
        items: itemMap.get(o._id) || []
      })
    }
    return ok(paging.wrap(groups, countRes.total, ctx.now))
  },

  /** 订单详情（M-19）：返回收货快照 */
  async orderGetDetail (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const order = await this._getOwnOrder(uid, params.order_id)
    const items = await this._getItems(order._id)
    const activity = await this._getActivity(order.activity_id)

    return ok({
      _id: order._id,
      order_no: order.order_no,
      status: order.status,
      activity: {
        _id: activity._id,
        title: activity.title,
        status: activity.status,
        governance_status: activity.governance_status,
        delivery_type: activity.delivery_type,
        end_time: activity.end_time
      },
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
   * 截止前允许改数量、移除商品、换收货信息、改备注（D-049）。
   * 扩大数量要重新走库存与限购校验；移除全部明细时不保存空订单。
   */
  async orderUpdate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const order = await this._getOwnOrder(uid, params.order_id)
    if (order.status !== ORDER.VALID) {
      throwBiz('STATE_CHANGED', '该订单已取消或已作废，不能再修改')
    }

    const activity = await this._getActivity(order.activity_id)
    // 缩小类操作只要求「截止前」；停售与下架不阻止缩小（D-019、D-050）
    state.assertActivityShrinkable(activity, ctx.now)

    const oldItems = await this._getItems(order._id)
    const oldMap = new Map(oldItems.map(it => [it.goods_id, it]))

    const patch = {}
    let itemsChanged = false
    let newLines = null

    if (params.items !== undefined) {
      const targets = this._normalizeItems(params.items)
      itemsChanged = true

      const goodsMap = await this._loadGoods(activity._id, targets.map(t => t.goods_id))
      const increases = []
      const decreases = []

      for (const t of targets) {
        const goods = goodsMap.get(t.goods_id)
        const oldQty = oldMap.has(t.goods_id) ? oldMap.get(t.goods_id).qty : 0
        const delta = t.qty - oldQty
        if (delta > 0) {
          // 新增或扩大：活动与商品都必须处于可参与状态
          state.assertActivityJoinable(activity, ctx.now)
          state.assertGoodsSelectable(goods)
          // 限购按改后的总量算，并排除本单已有明细，避免把自己算两遍
          await stock.checkUserLimit(ctx, {
            activityId: activity._id, goods, userId: uid,
            addQty: t.qty, excludeOrderId: order._id
          })
          increases.push({ goods, qty: delta })
        } else if (delta < 0) {
          decreases.push({ goods_id: t.goods_id, qty: -delta })
        }
      }
      // 被整条移除的商品
      for (const it of oldItems) {
        if (!targets.find(t => t.goods_id === it.goods_id)) {
          decreases.push({ goods_id: it.goods_id, qty: it.qty })
        }
      }

      // 先占用，失败即整体放弃，不改任何明细
      const deducted = await stock.deductBatch(ctx, increases)
      if (!deducted.ok) {
        const g = deducted.failed
        throwBiz('STOCK_NOT_ENOUGH', `商品「${g.name}」库存不足或已停售`, { goods_id: g._id })
      }
      for (const d of decreases) await stock.restore(ctx, d.goods_id, d.qty)

      // 重写明细：价格按【当前商品价格】重新取快照，与新下单口径一致
      await this.db.collection('grouporder-order-item').where({ order_id: order._id }).remove()
      newLines = targets.map(t => snapshot.buildItem(
        { _id: order._id, activity_id: activity._id, user_id: uid, status: ORDER.VALID },
        goodsMap.get(t.goods_id), t.qty, ctx.now
      ))
      for (const line of newLines) {
        await this.db.collection('grouporder-order-item').add(line)
      }
      const sum = snapshot.summarize(newLines)
      patch.total_qty = sum.total_qty
      patch.total_amount = sum.total_amount
    }

    if (params.address_id !== undefined || params.consignee_name !== undefined ||
        params.consignee_mobile !== undefined || params.consignee_address !== undefined) {
      const addressDoc = await this._loadAddress(uid, params.address_id)
      Object.assign(patch, snapshot.buildConsignee(activity, {
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

    assertParam(Object.keys(patch).length > 0 || itemsChanged, '没有需要修改的内容')
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

    const items = await this._getItems(order._id)

    // 先改状态再返还：状态改动带条件，可挡住并发重复取消导致的多次返还
    const res = await this.db.collection('grouporder-order')
      .where({ _id: order._id, status: ORDER.VALID })
      .update({
        status: ORDER.CANCELLED,
        cancel_time: ctx.now,
        cancel_reason: String(params.reason || '')
      })
    if (!res.updated) throwBiz('STATE_CHANGED', '订单状态已变化，请刷新后重试')

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

    const items = await this._getItems(order._id)
    const res = await this.db.collection('grouporder-order')
      .where({ _id: order._id, status: ORDER.VALID })
      .update({
        status: ORDER.VOIDED,
        void_uid: ctx.uid,
        void_time: ctx.now,
        void_reason: reason
      })
    if (!res.updated) throwBiz('STATE_CHANGED', '订单状态已变化，请刷新后重试')

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

    const [orderCount, cancelCount, voidCount, itemAgg, goodsAgg] = await Promise.all([
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
        .end()
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
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])
    const orders = listRes.data || []

    let itemMap = new Map()
    if (orders.length) {
      const { data: items } = await this.db.collection('grouporder-order-item')
        .where({ order_id: this.dbCmd.in(orders.map(o => o._id)) }).limit(500).get()
      for (const it of (items || [])) {
        if (!itemMap.has(it.order_id)) itemMap.set(it.order_id, [])
        itemMap.get(it.order_id).push({
          goods_id: it.goods_id, goods_name: it.goods_name,
          unit: it.unit_snapshot, price: it.price_snapshot, qty: it.qty, amount: it.amount
        })
      }
    }

    const selfPick = activity.delivery_type === DELIVERY.SELF_PICK
    const list = orders.map(o => ({
      _id: o._id,
      order_no: o.order_no,
      status: o.status,
      consignee_name: o.consignee_name,
      consignee_mobile: o.consignee_mobile,
      // 自提活动没有地址列，不返回空串以外的内容
      consignee_address: selfPick ? '' : (o.consignee_address || ''),
      buyer_remark: o.buyer_remark || '',
      total_qty: o.total_qty,
      total_amount: o.total_amount,
      create_date: o.create_date,
      void_reason: o.void_reason || '',
      items: itemMap.get(o._id) || []
    }))

    return ok(paging.wrap(list, countRes.total, ctx.now))
  }
}
