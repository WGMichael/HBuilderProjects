/**
 * grouporder-activity-co · 活动与活动内商品的全生命周期
 * 服务对象：client（团长 + 参与者）
 * 契约：docs/arch/CLOUD_API.md §4
 *
 * 本对象不调用任何其他云对象；跨对象逻辑一律走 common。
 * 商品的 governance_status 只能由 grouporder-ops-co 设置，本对象所有方法都不得改写它。
 */
const {
  auth, errors, paging, idempotent, state,
  snapshot, goodslib, config, contentcheck, restriction, review, oplog
} = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors
const { ACTIVITY, GOVERNANCE, REVIEW_RESULT, END_TYPE, DELIVERY, REVIEW_MODE } = state

// 容量约束（D-024）
const MAX_GOODS_PER_ACTIVITY = 50
// 每活动推荐上限（D-065），服务端校验，只做前端限制不够
const MAX_RECOMMEND_PER_ACTIVITY = 5
const MAX_IMAGES = 9
// 活动复制的幂等窗口：schema 已定稿、活动表无幂等键字段，
// 以「同一团长 + 同一源活动 + 窗口内的草稿」判重，覆盖网络重试（AC-AC-013）
const COPY_IDEMPOTENT_WINDOW_MS = 60 * 1000

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

  /** 读活动并校验存在 */
  async _getActivity (activityId) {
    assertParam(activityId, '缺少活动标识')
    const { data } = await this.db.collection('grouporder-activity').doc(activityId).get()
    const activity = data && data[0]
    if (!activity) throwBiz('NOT_FOUND', '活动不存在或已删除')
    return activity
  },

  /** 按 sort ASC, create_date ASC 取活动内商品（GOODS_LIB_SPEC §5.7，两处排序必须一致） */
  async _listGoods (activityId, includeGoverned = true) {
    const where = { activity_id: activityId }
    if (!includeGoverned) where.governance_status = GOVERNANCE.NORMAL
    const { data } = await this.db.collection('grouporder-goods')
      .where(where)
      .orderBy('sort', 'asc')
      .orderBy('create_date', 'asc')
      .limit(MAX_GOODS_PER_ACTIVITY + 10)
      .get()
    return data || []
  },

  /** 校验活动内容可编辑，并在内容类改动后处理重新送审 */
  async _assertEditable (activity) {
    if (!review.canEditContent(activity, this.ctx.now)) {
      if (activity.status === ACTIVITY.CANCELLED) throwBiz('ACTIVITY_CANCELLED')
      throwBiz('ACTIVITY_CLOSED', '活动已截止，不能再修改内容')
    }
    if (activity.governance_status === GOVERNANCE.OFF) {
      throwBiz('ACTIVITY_OFFLINE', '活动已被平台下架，不能修改内容')
    }
  },

  /** 校验图片数量上限（D-041） */
  _assertImages (list, label) {
    if (list && list.length > MAX_IMAGES) {
      throwBiz('INVALID_PARAM', `${label}最多 ${MAX_IMAGES} 张`)
    }
  },

  /**
   * 团长对商品的改价、改单位、停售、库存调整需要留下前后值
   * （D-018、D-026、DATA_MODEL §4.2 说明 5）。
   * goods 表没有承载前后值的字段，因此写入 grouporder-oplog——
   * 客户端的经营变动同样要留痕，这不是后台专属的约束。
   * action_type 取 §10.8 第 11 类；operator_uid 是团长本人，operator_roles 为空数组。
   */
  async _writeLeaderTrace (actionType, goods, prevState, nextState, reason) {
    await oplog.write(this.ctx, {
      action_type: actionType,
      result: oplog.RESULT.SUCCESS,
      object_type: 'goods',
      object_id: goods._id,
      reason: reason || '',
      prev_state: prevState,
      next_state: nextState
    })
  },

  // ==========================================================================
  // 4.1 活动
  // ==========================================================================

  /**
   * 新建草稿（M-10）
   * delivery_type 必填；草稿不占用任何公开入口。
   */
  async activityCreateDraft (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    // 创建与提交发布都要校验发布权限，这是必经路径（DATA_MODEL §10.0）
    await restriction.assertCanPublish(ctx, uid)

    const title = String(params.title || '').trim()
    assertParam(title.length >= 1 && title.length <= 50, '活动标题为 1–50 字')
    assertParam(params.cover_image, '活动必须包含封面图')
    assertParam(
      params.delivery_type === DELIVERY.HOME || params.delivery_type === DELIVERY.SELF_PICK,
      '请选择交付方式'
    )
    const description = String(params.description || '')
    assertParam(description.length <= 500, '活动说明不超过 500 字')
    this._assertImages(params.images, '轮播图')
    assertParam(params.end_time && params.end_time > ctx.now, '截止时间必须晚于当前时间')

    const shortCode = await idempotent.allocShortCode(ctx)
    const doc = {
      title,
      description,
      cover_image: params.cover_image,
      images: params.images || [],
      short_code: shortCode,
      delivery_type: params.delivery_type,
      leader_uid: uid,
      status: ACTIVITY.DRAFT,
      review_result: REVIEW_RESULT.NONE,
      content_version: 1,
      end_time: params.end_time,
      governance_status: GOVERNANCE.NORMAL,
      ever_governed: 0,
      text_check_status: 0,
      img_check_status: 0,
      anonymized: 0,
      create_date: ctx.now
    }
    const res = await this.db.collection('grouporder-activity').add(doc)
    return ok({ activity_id: res.id, short_code: shortCode })
  },

  /**
   * 编辑草稿 / 编辑活动资料（M-10）
   * delivery_type 发布后不可改（D-060）。
   * 内容类改动会按 D-048 触发重新审核。
   */
  async activityUpdateDraft (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    await this._assertEditable(activity)

    const patch = {}
    if (params.title !== undefined) {
      const t = String(params.title).trim()
      assertParam(t.length >= 1 && t.length <= 50, '活动标题为 1–50 字')
      patch.title = t
    }
    if (params.description !== undefined) {
      assertParam(String(params.description).length <= 500, '活动说明不超过 500 字')
      patch.description = String(params.description)
    }
    if (params.cover_image !== undefined) {
      assertParam(params.cover_image, '活动必须包含封面图')
      patch.cover_image = params.cover_image
    }
    if (params.images !== undefined) {
      this._assertImages(params.images, '轮播图')
      patch.images = params.images
    }
    if (params.end_time !== undefined) {
      assertParam(params.end_time > ctx.now, '截止时间必须晚于当前时间')
      patch.end_time = params.end_time
    }
    if (params.delivery_type !== undefined && params.delivery_type !== activity.delivery_type) {
      // 已发布过就锁死：订单收货快照的口径必须稳定
      if (activity.publish_date) throwBiz('DELIVERY_TYPE_LOCKED')
      assertParam(
        params.delivery_type === DELIVERY.HOME || params.delivery_type === DELIVERY.SELF_PICK,
        '交付方式不合法'
      )
      patch.delivery_type = params.delivery_type
    }

    assertParam(Object.keys(patch).length > 0, '没有需要修改的内容')
    await this.db.collection('grouporder-activity').doc(activity._id).update(patch)

    let recheck = { need_recheck: false, next_status: activity.status }
    if (review.isContentChange(patch)) {
      recheck = await review.applyContentChange(ctx, activity)
    }
    return ok({ activity_id: activity._id, need_recheck: recheck.need_recheck, status: recheck.next_status })
  },

  /**
   * 提交审核（M-12）
   * 把平台配置的 review_mode 固化到 activity.review_mode（D-057）；
   * 自动模式下文本检测通过即置进行中、review_uid 为空；人工模式进审核中。
   * 图片检测异步，不阻塞放行（D-058）。
   */
  async activitySubmitReview (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    await restriction.assertCanPublish(ctx, activity.leader_uid)

    state.assertActivityTransition(activity.status, ACTIVITY.REVIEWING)
    if (activity.governance_status === GOVERNANCE.OFF) throwBiz('ACTIVITY_OFFLINE')
    assertParam(activity.end_time > ctx.now, '截止时间已过，请先修改截止时间')

    const goodsList = await this._listGoods(activity._id)
    assertParam(goodsList.length > 0, '活动至少需要一个商品才能提交发布')

    // 固化审核模式：之后平台改配置不影响本次审核（D-057）
    const mode = await config.getReviewMode(ctx)

    await this.db.collection('grouporder-activity').doc(activity._id).update({
      status: ACTIVITY.REVIEWING,
      review_mode: mode,
      review_submit_date: ctx.now,
      review_result: REVIEW_RESULT.NONE,
      review_uid: '',
      review_time: null,
      review_reason: ''
    })

    const checkResult = await contentcheck.checkOnSubmit(ctx, activity, goodsList)

    // 自动模式 + 文本通过 → 直接放行；review_uid 保持为空
    if (mode === REVIEW_MODE.AUTO && checkResult.textPass) {
      const patch = {
        status: ACTIVITY.ONGOING,
        review_result: REVIEW_RESULT.PASS,
        review_time: ctx.now,
        review_uid: ''
      }
      // 首次成功发布才写 publish_date（OPS §11.2 的「已发布活动数」以它为准）
      if (!activity.publish_date) patch.publish_date = ctx.now
      await this.db.collection('grouporder-activity').doc(activity._id).update(patch)
      return ok({ status: ACTIVITY.ONGOING, review_mode: mode, auto_passed: true })
    }

    // 人工模式，或自动模式下文本命中需人工判断 → 留在审核中，进待审队列
    return ok({
      status: ACTIVITY.REVIEWING,
      review_mode: mode,
      auto_passed: false,
      blocked: checkResult.blocked
    })
  },

  /** 撤回审核（M-12）：审核中 → 草稿 */
  async activityWithdrawReview (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    state.assertActivityTransition(activity.status, ACTIVITY.DRAFT)

    await this.db.collection('grouporder-activity').doc(activity._id).update({
      status: ACTIVITY.DRAFT,
      review_result: REVIEW_RESULT.WITHDRAWN,
      review_time: ctx.now
    })
    return ok({ status: ACTIVITY.DRAFT })
  },

  /**
   * 活动详情（M-13 / M-20）
   * 同一方法按身份返回不同字段：
   * - 参与者：非敏感内容 + 各商品已购份数 + 有效总份数
   * - 团长：另得统计与管理入口
   * 草稿与审核中仅团长可见（内容运营走 ops-co，不走本方法）。
   * 未登录可浏览非敏感内容（D-033）。
   */
  async activityGetDetail (params = {}) {
    const ctx = this.ctx
    const uid = auth.optionalLogin(ctx)

    let activity
    if (params.activity_id) {
      activity = await this._getActivity(params.activity_id)
    } else if (params.short_code) {
      const { data } = await this.db.collection('grouporder-activity')
        .where({ short_code: String(params.short_code).toUpperCase() }).limit(1).get()
      activity = data && data[0]
      if (!activity) throwBiz('NOT_FOUND', '活动不存在或已删除')
    } else {
      throwBiz('INVALID_PARAM', '缺少活动标识')
    }

    const isLeader = !!uid && uid === activity.leader_uid

    // 审核通过前不对外可见（D-043）
    if (!isLeader && (activity.status === ACTIVITY.DRAFT || activity.status === ACTIVITY.REVIEWING)) {
      throwBiz('FORBIDDEN', '活动尚未发布')
    }

    // 治理下架对普通访问者显示下架状态，但不隐藏内容、不改业务状态
    const goodsList = await this._listGoods(activity._id)
    const validTotalQty = goodsList.reduce((s, g) => s + (g.sold_qty || 0), 0)

    const base = {
      _id: activity._id,
      title: activity.title,
      description: activity.description,
      cover_image: activity.cover_image,
      images: activity.images || [],
      short_code: activity.short_code,
      delivery_type: activity.delivery_type,
      status: activity.status,
      governance_status: activity.governance_status,
      end_time: activity.end_time,
      actual_end_time: activity.actual_end_time || null,
      create_date: activity.create_date,
      publish_date: activity.publish_date || null,
      // 所有访问者可见（D-036、D-016）
      valid_total_qty: validTotalQty,
      goods: goodsList.map(g => ({
        _id: g._id,
        name: g.name,
        description: g.description,
        cover_image: g.cover_image,
        detail_images: g.detail_images || [],
        price: g.price,
        unit: g.unit,
        total_stock: g.total_stock,
        sold_qty: g.sold_qty,
        per_user_limit: g.per_user_limit,
        on_sale: g.on_sale,
        governance_status: g.governance_status,
        is_recommend: g.is_recommend || 0,
        sort: g.sort || 0,
        // 剩余量不落库，仅按需计算；total_stock = 0 表示不限
        remain_qty: g.total_stock > 0 ? Math.max(0, g.total_stock - (g.sold_qty || 0)) : null
      })),
      is_leader: isLeader,
      // 是否还能接龙：用服务端时间判定
      joinable: activity.status === ACTIVITY.ONGOING &&
        activity.governance_status === GOVERNANCE.NORMAL &&
        ctx.now < activity.end_time
    }

    if (!isLeader) return ok(base)

    // 团长视角：补统计与审核/治理信息。不出现销售额、实收、GMV
    const [orderAgg, itemAgg] = await Promise.all([
      this.db.collection('grouporder-order')
        .where({ activity_id: activity._id, status: 1 }).count(),
      this.db.collection('grouporder-order-item').aggregate()
        .match({ activity_id: activity._id, status: 1 })
        .group({ _id: null, qty: { $sum: '$qty' }, amount: { $sum: '$amount' } })
        .end()
    ])
    const agg = (itemAgg.data && itemAgg.data[0]) || { qty: 0, amount: 0 }

    return ok(Object.assign(base, {
      review_mode: activity.review_mode || null,
      review_result: activity.review_result || 0,
      review_reason: activity.review_reason || '',
      content_version: activity.content_version,
      governance_reason: activity.governance_reason || '',
      ever_governed: activity.ever_governed || 0,
      cancel_reason: activity.cancel_reason || '',
      stat: {
        valid_order_count: orderAgg.total || 0,
        valid_total_qty: agg.qty || 0,
        estimated_amount: agg.amount || 0,
        asOf: ctx.now
      }
    }))
  },

  /**
   * 我发起的（M-09）
   * 业务状态与治理状态双维度筛选，两者分列不合并。
   */
  async activityMyList (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date', 'end_time', 'publish_date']
    })

    const where = { leader_uid: uid }
    if (p.filters.status !== undefined && p.filters.status !== null && p.filters.status !== '') {
      where.status = p.filters.status
    }
    if (p.filters.governance_status !== undefined && p.filters.governance_status !== null && p.filters.governance_status !== '') {
      where.governance_status = p.filters.governance_status
    }

    const coll = this.db.collection('grouporder-activity').where(where)
    const [listRes, countRes] = await Promise.all([
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])

    const ids = (listRes.data || []).map(a => a._id)
    // 列表页展示有效总份数，按活动聚合一次，避免逐条查询
    let qtyMap = {}
    if (ids.length) {
      const agg = await this.db.collection('grouporder-order-item').aggregate()
        .match({ activity_id: this.dbCmd.in(ids), status: 1 })
        .group({ _id: '$activity_id', qty: { $sum: '$qty' } })
        .end()
      qtyMap = (agg.data || []).reduce((m, r) => { m[r._id] = r.qty; return m }, {})
    }

    const list = (listRes.data || []).map(a => ({
      _id: a._id,
      title: a.title,
      cover_image: a.cover_image,
      short_code: a.short_code,
      status: a.status,
      governance_status: a.governance_status,
      review_result: a.review_result || 0,
      review_reason: a.review_reason || '',
      delivery_type: a.delivery_type,
      end_time: a.end_time,
      actual_end_time: a.actual_end_time || null,
      publish_date: a.publish_date || null,
      create_date: a.create_date,
      valid_total_qty: qtyMap[a._id] || 0
    }))
    return ok(paging.wrap(list, countRes.total, ctx.now))
  },

  /**
   * 手动截止（M-23）
   * 不可逆；截止后不可再取消（D-027）。
   */
  async activityClose (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    state.assertActivityTransition(activity.status, ACTIVITY.CLOSED)

    await this.db.collection('grouporder-activity').doc(activity._id).update({
      status: ACTIVITY.CLOSED,
      actual_end_time: ctx.now,
      end_type: END_TYPE.MANUAL
    })
    // 留存到期日：活动截止之日 +3 年，订单继承（D-035）
    const expire = await snapshot.stampRetention(ctx, activity._id, ctx.now)
    return ok({ status: ACTIVITY.CLOSED, actual_end_time: ctx.now, retention_expire_date: expire })
  },

  /**
   * 取消活动（M-23）
   * 仅允许草稿或进行中；已截止不可取消（D-027）；进行中必须填原因。
   */
  async activityCancel (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    state.assertActivityTransition(activity.status, ACTIVITY.CANCELLED)

    const reason = String(params.reason || '').trim()
    if (activity.status === ACTIVITY.ONGOING) {
      assertParam(reason, '取消进行中的活动必须填写原因')
    }

    await this.db.collection('grouporder-activity').doc(activity._id).update({
      status: ACTIVITY.CANCELLED,
      cancel_uid: ctx.uid,
      cancel_time: ctx.now,
      cancel_reason: reason
    })
    const expire = await snapshot.stampRetention(ctx, activity._id, ctx.now)
    return ok({ status: ACTIVITY.CANCELLED, retention_expire_date: expire })
  },

  /**
   * 取分享入口参数（M-12 / M-13）
   * 入口载体是 activity_id（ObjectId 本身不可枚举）；short_code 只用于口头引用与订单号。
   * 入口有效不等于授予敏感数据权限，服务端逐次鉴权（D-034）。
   */
  async activityGetShareEntry (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)

    // 审核通过前不生成可分享入口（D-043）
    if (activity.status !== ACTIVITY.ONGOING) {
      throwBiz('FORBIDDEN', '活动审核通过并进行中后才能分享')
    }
    if (activity.governance_status === GOVERNANCE.OFF) throwBiz('ACTIVITY_OFFLINE')

    return ok({
      activity_id: activity._id,
      short_code: activity.short_code,
      title: activity.title,
      cover_image: activity.cover_image,
      end_time: activity.end_time,
      asOf: ctx.now
    })
  },

  /**
   * 可复制的历史活动（M-31）
   * 仅本人发起；草稿与审核中不可作为源；被平台下架的活动一律不可作为源（D-067、AC-AC-006）。
   */
  async activityCopySourceList (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date', 'end_time']
    })

    const where = {
      leader_uid: uid,
      status: this.dbCmd.in([ACTIVITY.ONGOING, ACTIVITY.CLOSED, ACTIVITY.CANCELLED]),
      governance_status: GOVERNANCE.NORMAL
    }
    const coll = this.db.collection('grouporder-activity').where(where)
    const [listRes, countRes] = await Promise.all([
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])

    const list = (listRes.data || []).map(a => ({
      _id: a._id,
      title: a.title,
      cover_image: a.cover_image,
      status: a.status,
      delivery_type: a.delivery_type,
      end_time: a.end_time,
      publish_date: a.publish_date || null,
      create_date: a.create_date
    }))
    return ok(paging.wrap(list, countRes.total, ctx.now))
  },

  /**
   * 复制为新草稿（M-31 / M-09「再来一次」）
   * DATA_MODEL §4.10。被治理下架的商品不进新草稿并在出参列出（AC-AC-005）。
   */
  async activityCopy (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    await restriction.assertCanPublish(ctx, uid)

    const source = await this._getActivity(params.source_activity_id)
    // 必须是本人发起（AC-AC-012）
    if (source.leader_uid !== uid) throwBiz('FORBIDDEN', '只能复制自己发起过的活动')
    // 被平台下架的活动不可作为源（AC-AC-006）
    if (source.governance_status === GOVERNANCE.OFF) {
      throwBiz('ACTIVITY_OFFLINE', '该活动已被平台下架，不能作为复制来源')
    }
    // 草稿与审核中不可作为源（AC-AC-007）
    if (source.status === ACTIVITY.DRAFT || source.status === ACTIVITY.REVIEWING) {
      throwBiz('PRECONDITION_UNMET', '草稿与审核中的活动不能作为复制来源')
    }

    // 幂等（AC-AC-013）：活动表 schema 已定稿、没有幂等键字段，且不允许为此加字段，
    // 因此按「同一团长 + 同一标题 + 窗口内的草稿」判重。标题是原样复制的，
    // 窗口内重复出现同名草稿只可能来自同一次请求的重试。
    const dup = await this.db.collection('grouporder-activity').where({
      leader_uid: uid,
      status: ACTIVITY.DRAFT,
      title: source.title,
      create_date: this.dbCmd.gte(ctx.now - COPY_IDEMPOTENT_WINDOW_MS)
    }).limit(1).get().catch(() => ({ data: [] }))
    if (dup.data && dup.data[0]) {
      const existed = dup.data[0]
      const cnt = await this.db.collection('grouporder-goods')
        .where({ activity_id: existed._id }).count()
      return ok({ activity_id: existed._id, copied_count: cnt.total || 0, excluded: [], duplicated: true })
    }

    // 截止时间按源活动的时长节奏推算（D-067）
    const base = source.publish_date || source.create_date
    let duration = source.end_time - base
    if (!(duration > 0)) duration = 3 * 24 * 60 * 60 * 1000  // 兜底 3 天
    const endTime = ctx.now + duration

    const shortCode = await idempotent.allocShortCode(ctx)
    const newActivity = await this.db.collection('grouporder-activity').add({
      title: source.title,                 // 不自动加「副本」后缀
      description: source.description || '',
      cover_image: source.cover_image,
      images: source.images || [],
      short_code: shortCode,
      delivery_type: source.delivery_type,
      leader_uid: uid,
      status: ACTIVITY.DRAFT,              // 一律置为草稿
      review_result: REVIEW_RESULT.NONE,
      content_version: 1,
      end_time: endTime,
      governance_status: GOVERNANCE.NORMAL,
      ever_governed: 0,
      text_check_status: 0,
      img_check_status: 0,
      anonymized: 0,
      create_date: ctx.now
      // 不写 source_activity_id：DATA_MODEL §4.10 明确不加该字段
    })

    const sourceGoods = await this._listGoods(source._id)
    const excluded = []
    let copied = 0
    for (const g of sourceGoods) {
      if (g.governance_status === GOVERNANCE.OFF) {
        // 绕过治理的路径必须堵死（AC-AC-005）
        excluded.push({ name: g.name, reason: '该商品已被平台下架' })
        continue
      }
      await this.db.collection('grouporder-goods').add({
        activity_id: newActivity.id,
        lib_id: g.lib_id || '',            // 来源仍是同一条库记录，治理链路保持连通
        is_recommend: g.is_recommend || 0,
        name: g.name,
        description: g.description || '',
        cover_image: g.cover_image,
        detail_images: g.detail_images || [],
        price: g.price,                    // 预填，须逐项确认
        unit: g.unit || '份',
        total_stock: g.total_stock,        // 预填，须逐项确认
        sold_qty: 0,                       // 初始化
        per_user_limit: g.per_user_limit,  // 预填，须逐项确认
        on_sale: 1,                        // 上一场的停售是当时的经营决定
        governance_status: GOVERNANCE.NORMAL,
        ever_ordered: 0,
        sort: g.sort || 0,                 // 保持团长原先的排列
        img_check_status: 0,
        create_date: ctx.now
      })
      copied++
    }
    // 复制不触发商品库沉淀、不递增 use_count、不改 last_used_time（AC-AC-010）

    return ok({
      activity_id: newActivity.id,
      copied_count: copied,
      excluded,
      end_time: endTime,
      duplicated: false
    })
  },

  // ==========================================================================
  // 4.2 活动内商品
  // 商品的 governance_status 只能由 grouporder-ops-co 设置，以下方法一律不改写它。
  // ==========================================================================

  /**
   * 新增商品（M-11）
   * 保存时自动沉淀到商品库（common/goodslib.sinkToLib）。
   * total_stock = 0 表示不限库存，per_user_limit = 0 表示不限购（D-044）。
   */
  async goodsCreate (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    await this._assertEditable(activity)

    const name = String(params.name || '').trim()
    assertParam(name.length >= 1 && name.length <= 50, '商品名称为 1–50 字')
    assertParam(String(params.description || '').length <= 500, '商品说明不超过 500 字')
    assertParam(params.cover_image, '商品必须包含封面图')
    this._assertImages(params.detail_images, '详情图')
    assertParam(Number.isInteger(params.price) && params.price >= 0, '商品单价必须是不小于 0 的整数（单位：分）')
    assertParam(Number.isInteger(params.total_stock) && params.total_stock >= 0, '总库存必须是不小于 0 的整数')
    assertParam(Number.isInteger(params.per_user_limit) && params.per_user_limit >= 0, '每人限购必须是不小于 0 的整数')
    const unit = String(params.unit || '份').trim()
    assertParam(unit, '商品单位不能为空')

    const existing = await this._listGoods(activity._id)
    assertParam(existing.length < MAX_GOODS_PER_ACTIVITY,
      `一个活动最多 ${MAX_GOODS_PER_ACTIVITY} 个商品，当前已有 ${existing.length} 个`)

    const isRecommend = params.is_recommend === 1 ? 1 : 0
    if (isRecommend) {
      const cnt = existing.filter(g => g.is_recommend === 1).length
      assertParam(cnt < MAX_RECOMMEND_PER_ACTIVITY,
        `每个活动最多标记 ${MAX_RECOMMEND_PER_ACTIVITY} 个推荐商品，请先取消其他推荐`)
    }

    // 新增商品的 sort 取当前最大值 +1，保证正常路径下 sort 永远有有效值
    const maxSort = existing.reduce((m, g) => Math.max(m, g.sort || 0), 0)

    const doc = {
      activity_id: activity._id,
      lib_id: params.lib_id || '',
      is_recommend: isRecommend,
      name,
      description: String(params.description || ''),
      cover_image: params.cover_image,
      detail_images: params.detail_images || [],
      price: params.price,
      unit,
      total_stock: params.total_stock,
      sold_qty: 0,
      per_user_limit: params.per_user_limit,
      on_sale: 1,
      governance_status: GOVERNANCE.NORMAL,
      ever_ordered: 0,
      sort: maxSort + 1,
      img_check_status: 0,
      create_date: ctx.now
    }
    const res = await this.db.collection('grouporder-goods').add(doc)
    doc._id = res.id

    // 自动沉淀；失败不影响商品保存（GOODS_LIB_SPEC §4.4）
    const libId = await goodslib.sinkToLib(ctx, doc, activity.leader_uid)

    // 图片异步送检，不阻塞（D-058）
    await contentcheck.submitImages(ctx, {
      objectType: contentcheck.OBJECT_TYPE.GOODS,
      objectId: res.id,
      contentVersion: activity.content_version || 1,
      fileIds: [doc.cover_image, ...(doc.detail_images || [])].map(f => (f && f.fileID) || f)
    })

    // 新增商品属于内容改动，按 D-048 触发重新审核
    const recheck = await review.applyContentChange(ctx, activity)

    return ok({
      goods_id: res.id,
      lib_id: libId,
      sort: doc.sort,
      need_recheck: recheck.need_recheck,
      activity_status: recheck.next_status
    })
  },

  /**
   * 编辑商品（M-11 / M-22）
   * ever_ordered = 1 时改价需二次确认并记录前后值（D-018、D-026）；禁止删除。
   * 有限库存不得低于 sold_qty。
   */
  async goodsUpdate (params = {}) {
    const ctx = this.ctx
    assertParam(params.goods_id, '缺少商品标识')
    const { data } = await this.db.collection('grouporder-goods').doc(params.goods_id).get()
    const goods = data && data[0]
    if (!goods) throwBiz('NOT_FOUND', '商品不存在')

    const activity = await auth.requireLeader(ctx, goods.activity_id)
    await this._assertEditable(activity)
    if (goods.governance_status === GOVERNANCE.OFF) {
      throwBiz('GOODS_OFFLINE', '该商品已被平台下架，不能修改')
    }

    const patch = {}
    const traces = []

    if (params.name !== undefined) {
      const n = String(params.name).trim()
      assertParam(n.length >= 1 && n.length <= 50, '商品名称为 1–50 字')
      patch.name = n
    }
    if (params.description !== undefined) {
      assertParam(String(params.description).length <= 500, '商品说明不超过 500 字')
      patch.description = String(params.description)
    }
    if (params.cover_image !== undefined) {
      assertParam(params.cover_image, '商品必须包含封面图')
      patch.cover_image = params.cover_image
    }
    if (params.detail_images !== undefined) {
      this._assertImages(params.detail_images, '详情图')
      patch.detail_images = params.detail_images
    }
    if (params.unit !== undefined) {
      const u = String(params.unit).trim()
      assertParam(u, '商品单位不能为空')
      if (u !== goods.unit) traces.push([oplog.ACTION.GOODS_UNIT_CHANGED, { unit: goods.unit }, { unit: u }, '修改商品单位'])
      patch.unit = u
    }
    if (params.price !== undefined && params.price !== goods.price) {
      assertParam(Number.isInteger(params.price) && params.price >= 0, '商品单价必须是不小于 0 的整数（单位：分）')
      if (goods.ever_ordered === 1) {
        // 已产生过有效明细：允许改价，但必须二次确认并记录前后值
        assertParam(params.confirm_price_change === true,
          '该商品已产生过订单，改价需要二次确认', { require_confirm: true, prev_price: goods.price })
      }
      traces.push([oplog.ACTION.GOODS_PRICE_CHANGED, { price: goods.price }, { price: params.price },
        goods.ever_ordered === 1 ? '已产生订单的商品改价（已二次确认）' : '改价'])
      patch.price = params.price
    }
    if (params.is_recommend !== undefined) {
      const want = params.is_recommend === 1 ? 1 : 0
      if (want === 1 && goods.is_recommend !== 1) {
        const siblings = await this._listGoods(activity._id)
        const cnt = siblings.filter(g => g.is_recommend === 1 && g._id !== goods._id).length
        assertParam(cnt < MAX_RECOMMEND_PER_ACTIVITY,
          `每个活动最多标记 ${MAX_RECOMMEND_PER_ACTIVITY} 个推荐商品，请先取消其他推荐`)
      }
      patch.is_recommend = want
    }
    // 库存与限购统一走 goodsAdjustStock，这里不接受，避免两条路径口径不一致
    assertParam(params.total_stock === undefined && params.per_user_limit === undefined,
      '库存与每人限购请使用 goodsAdjustStock 调整')
    assertParam(Object.keys(patch).length > 0, '没有需要修改的内容')

    await this.db.collection('grouporder-goods').doc(goods._id).update(patch)
    for (const [action, prev, next, reason] of traces) {
      await this._writeLeaderTrace(action, goods, prev, next, reason)
    }

    const merged = Object.assign({}, goods, patch)
    // 改图后重新送检（D-058）
    if (patch.cover_image !== undefined || patch.detail_images !== undefined) {
      await this.db.collection('grouporder-goods').doc(goods._id).update({ img_check_status: 0 })
      await contentcheck.submitImages(ctx, {
        objectType: contentcheck.OBJECT_TYPE.GOODS,
        objectId: goods._id,
        contentVersion: activity.content_version || 1,
        fileIds: [merged.cover_image, ...(merged.detail_images || [])].map(f => (f && f.fileID) || f)
      })
    }
    // 商品保存即沉淀，同名记录会被更新
    await goodslib.sinkToLib(ctx, merged, activity.leader_uid)

    // 只有文字与图片改动触发重新审核；价格、单位、库存、限购、停售不触发（D-048）
    let recheck = { need_recheck: false, next_status: activity.status }
    if (review.isContentChange(patch)) {
      recheck = await review.applyContentChange(ctx, activity)
    }
    return ok({ goods_id: goods._id, need_recheck: recheck.need_recheck, activity_status: recheck.next_status })
  },

  /**
   * 删除商品（M-22）
   * 仅 ever_ordered = 0 可删（D-026）。
   * 删除不触碰云存储文件——同一 fileID 可能被商品库与其他活动引用（GOODS_LIB_SPEC §6）。
   */
  async goodsDelete (params = {}) {
    const ctx = this.ctx
    assertParam(params.goods_id, '缺少商品标识')
    const { data } = await this.db.collection('grouporder-goods').doc(params.goods_id).get()
    const goods = data && data[0]
    if (!goods) throwBiz('NOT_FOUND', '商品不存在')

    const activity = await auth.requireLeader(ctx, goods.activity_id)
    await this._assertEditable(activity)

    const cap = state.goodsCapability(goods, activity, ctx.now)
    if (!cap.canDelete) {
      throwBiz('PRECONDITION_UNMET', '该商品已产生过订单，不能删除，只能停止售卖')
    }

    await this.db.collection('grouporder-goods').doc(goods._id).remove()

    const recheck = await review.applyContentChange(ctx, activity)
    return ok({ deleted: true, need_recheck: recheck.need_recheck, activity_status: recheck.next_status })
  },

  /**
   * 停售 / 恢复售卖（M-22）
   * 停售只阻止新增与扩大，已有明细保留并进入清单（D-019、D-050）；
   * 活动已截止或已取消时禁止恢复（D-028）。
   */
  async goodsSetOnSale (params = {}) {
    const ctx = this.ctx
    assertParam(params.goods_id, '缺少商品标识')
    assertParam(params.on_sale === 0 || params.on_sale === 1, '参数 on_sale 只能是 0 或 1')

    const { data } = await this.db.collection('grouporder-goods').doc(params.goods_id).get()
    const goods = data && data[0]
    if (!goods) throwBiz('NOT_FOUND', '商品不存在')

    const activity = await auth.requireLeader(ctx, goods.activity_id)
    if (goods.governance_status === GOVERNANCE.OFF) {
      throwBiz('GOODS_OFFLINE', '该商品已被平台下架，恢复售卖须由平台处理')
    }
    if (goods.on_sale === params.on_sale) {
      // 重复操作不重复生效，返回当前状态
      return ok({ goods_id: goods._id, on_sale: goods.on_sale, changed: false })
    }

    if (params.on_sale === 1) {
      const cap = state.goodsCapability(goods, activity, ctx.now)
      if (!cap.canRestoreOnSale) {
        throwBiz('ACTIVITY_CLOSED', '活动已截止或已取消，不能恢复售卖')
      }
    }

    await this.db.collection('grouporder-goods').doc(goods._id).update({ on_sale: params.on_sale })
    await this._writeLeaderTrace(oplog.ACTION.GOODS_ON_SALE_CHANGED, goods,
      { on_sale: goods.on_sale }, { on_sale: params.on_sale },
      params.on_sale === 1 ? '恢复售卖' : '停售')

    // 停售与恢复不触发重新审核（D-048）
    return ok({ goods_id: goods._id, on_sale: params.on_sale, changed: true })
  },

  /**
   * 调整库存与限购（M-22）
   * 可取消库存上限（置 0）、增加库存、减少至不低于 sold_qty。
   */
  async goodsAdjustStock (params = {}) {
    const ctx = this.ctx
    assertParam(params.goods_id, '缺少商品标识')
    const { data } = await this.db.collection('grouporder-goods').doc(params.goods_id).get()
    const goods = data && data[0]
    if (!goods) throwBiz('NOT_FOUND', '商品不存在')

    const activity = await auth.requireLeader(ctx, goods.activity_id)
    if (state.isActivityFinal(activity)) {
      throwBiz('ACTIVITY_CLOSED', '活动已截止或已取消，不能再调整库存与限购')
    }
    if (goods.governance_status === GOVERNANCE.OFF) throwBiz('GOODS_OFFLINE')

    const patch = {}
    if (params.total_stock !== undefined && params.total_stock !== goods.total_stock) {
      assertParam(Number.isInteger(params.total_stock) && params.total_stock >= 0,
        '总库存必须是不小于 0 的整数')
      // 0 表示取消上限；有限库存不得低于已购买份数
      if (params.total_stock > 0) {
        assertParam(params.total_stock >= (goods.sold_qty || 0),
          `总库存不能低于已购买份数 ${goods.sold_qty || 0}`,
          { sold_qty: goods.sold_qty || 0 })
      }
      patch.total_stock = params.total_stock
    }
    if (params.per_user_limit !== undefined && params.per_user_limit !== goods.per_user_limit) {
      assertParam(Number.isInteger(params.per_user_limit) && params.per_user_limit >= 0,
        '每人限购必须是不小于 0 的整数')
      patch.per_user_limit = params.per_user_limit
    }
    assertParam(Object.keys(patch).length > 0, '没有需要调整的内容')

    await this.db.collection('grouporder-goods').doc(goods._id).update(patch)
    await this._writeLeaderTrace(oplog.ACTION.GOODS_STOCK_CHANGED, goods,
      { total_stock: goods.total_stock, per_user_limit: goods.per_user_limit },
      { total_stock: patch.total_stock !== undefined ? patch.total_stock : goods.total_stock,
        per_user_limit: patch.per_user_limit !== undefined ? patch.per_user_limit : goods.per_user_limit },
      '调整库存与每人限购')

    return ok(Object.assign({ goods_id: goods._id }, patch))
  },

  /**
   * 商品拖拽排序（M-22，GOODS_LIB_SPEC §5.7、AC-GL-018）
   * 按拖拽后的可视顺序【整体重写】该活动全部商品的 sort，从 1 连续递增，
   * 不允许出现部分有值、部分为默认值的混合状态。
   * is_recommend 不进入排序表达式，本次不分区。
   */
  async goodsSort (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    if (state.isActivityFinal(activity)) {
      throwBiz('ACTIVITY_CLOSED', '活动已截止或已取消，不能再调整商品顺序')
    }

    const ids = params.goods_ids
    assertParam(Array.isArray(ids) && ids.length > 0, '缺少排序后的商品顺序')

    const current = await this._listGoods(activity._id)
    const currentIds = current.map(g => g._id)
    // 必须是全量重写：数量与集合都要与当前一致，否则会漏掉未提交的商品
    assertParam(ids.length === currentIds.length,
      '排序必须提交该活动的全部商品', { expected: currentIds.length, received: ids.length })
    const set = new Set(currentIds)
    for (const id of ids) {
      assertParam(set.has(id), '排序列表包含不属于该活动的商品', { goods_id: id })
      set.delete(id)
    }
    assertParam(set.size === 0, '排序列表存在重复商品')

    for (let i = 0; i < ids.length; i++) {
      await this.db.collection('grouporder-goods').doc(ids[i]).update({ sort: i + 1 })
    }
    // 排序不是内容改动，不触发重新审核
    return ok({ activity_id: activity._id, sorted: ids.length, asOf: ctx.now })
  }
}
