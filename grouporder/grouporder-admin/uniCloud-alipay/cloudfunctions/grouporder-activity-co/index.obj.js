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
  snapshot, goodslib, config, contentcheck, restriction, review, oplog, files, deliverystat, lifecycle, leadercontact, bindMethods
} = require('grouporder-common')
const { fileurl } = require('grouporder-common')
const crypto = require('crypto')

const { throwBiz, assertParam, ok } = errors
const { ACTIVITY, GOVERNANCE, REVIEW_RESULT, END_TYPE, DELIVERY, REVIEW_MODE, ORDER } = state

// 容量约束（D-024）
// 起止时间窗口（D-135）：起始时间最多设在 7 天之内；截止时间距起始时间不超过 7 天。
// 表单精确到分钟，留 1 分钟余量，避免卡在边界上的整点被误判
const TIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const TIME_WINDOW_SLACK_MS = 60 * 1000
const MAX_GOODS_PER_ACTIVITY = 50
// 每活动推荐上限（D-065），服务端校验，只做前端限制不够
const MAX_RECOMMEND_PER_ACTIVITY = 5
const MAX_IMAGES = 9

// 海报封面代下载的大小上限（D-117）：dataURL 会再大三分之一，控制在云函数响应限制以内
const POSTER_COVER_MAX = 3 * 1024 * 1024
// 每个账号每天按活动码查找「没查到」的次数上限（D-104，防枚举；查到的不计数）
const CODE_MISS_DAILY_LIMIT = 50

module.exports = {
  async _before () {
    bindMethods(this, module.exports)
    this.ctx = await auth.createContext(this, { admin: false })
    this.db = this.ctx.db
    this.dbCmd = this.ctx.db.command
  },

  async _after (error, result) {
    // 使用中自动续期登录（auth.attachNewToken）
    if (error) return auth.attachNewToken(this.ctx, errors.normalize(error))
    // 图片地址以 fileID 为准换成新的访问地址（D-119，common/fileurl）
    return auth.attachNewToken(this.ctx, await fileurl.refresh(result))
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
      throwBiz('ACTIVITY_CLOSED', '活动已结束，不能再修改内容')
    }
    if (activity.governance_status === GOVERNANCE.OFF) {
      throwBiz('ACTIVITY_OFFLINE', '活动已被平台下架，不能修改内容')
    }
  },

  /**
   * 提取并校验自提点四字段（D-077）
   *
   * 仅支持自提的活动承载这四个字段（D-086：可与送货上门同时支持）。不支持自提时一律写空串，
   * 避免团长在草稿阶段先勾了自提填了地址、又取消勾选时留下无人可见的残留。
   * pickup_address 的「自提必填」不在这里卡——草稿阶段允许慢慢填，
   * 真正的门槛设在 activitySubmitReview。
   *
   * @param {object}  params       入参
   * @param {boolean} hasSelfPick  该活动最终是否支持自提
   * @param {boolean} partial      true 时只取 params 里显式传了的键（增量更新用）
   */
  _pickPickup (params, hasSelfPick, partial = false) {
    const LIMITS = {
      pickup_address: [200, '自提地址'],
      pickup_time_desc: [100, '自提时间说明'],
      pickup_contact_name: [20, '自提现场联系人'],
      pickup_contact_mobile: [20, '自提现场联系电话']
    }
    const patch = {}
    if (!hasSelfPick) {
      // 增量更新时交付方式没动过，不必反复清空
      if (partial) return patch
      for (const k of Object.keys(LIMITS)) patch[k] = ''
      return patch
    }
    for (const k of Object.keys(LIMITS)) {
      if (partial && params[k] === undefined) continue
      const [max, label] = LIMITS[k]
      const v = String(params[k] || '').trim()
      assertParam(v.length <= max, `${label}不超过 ${max} 字`)
      patch[k] = v
    }
    return patch
  },

  /**
   * 取入参的交付方式集合（D-086）：delivery_types 为 [1]、[2] 或 [1, 2]；
   * 兼容旧客户端只传单值 delivery_type。都没传返回 undefined
   */
  _deliveryTypesParam (params) {
    let raw
    if (params.delivery_types !== undefined) raw = params.delivery_types
    else if (params.delivery_type !== undefined) raw = [params.delivery_type]
    else return undefined
    const types = state.normalizeDeliveryTypes(raw)
    assertParam(types, '请至少选择一种交付方式（送货上门 / 自提）')
    return types
  },

  /**
   * 起止时间窗口校验（D-135）。start 为 0 / 缺失时按当前时间算（发布即开始）。
   * checkAhead：是否校验「起始时间距现在不超过 7 天」——只在起始时间本次被设置 / 提交审核时校验，
   * 已开始的活动起始时间早于现在，不受影响
   */
  _assertTimeWindow (start, end, now, checkAhead = true) {
    const s = start || now
    if (checkAhead) assertParam(s - now <= TIME_WINDOW_MS + TIME_WINDOW_SLACK_MS, '起始时间最多只能设在 7 天之内')
    assertParam(end - s <= TIME_WINDOW_MS + TIME_WINDOW_SLACK_MS, '截止时间距起始时间不能超过 7 天')
  },

  /**
   * 取入参的起始时间（D-087）：未传 / 空值 / 0 取默认值（当前时间），否则必须是数字时间戳
   */
  _startTimeParam (raw, fallback) {
    if (raw === undefined || raw === null || raw === '' || raw === 0) return fallback
    assertParam(Number.isFinite(raw), '起始时间格式不正确')
    return raw
  },

  /**
   * 活动创建的幂等闸门（D-081）：同一 idempotent_key 只建一次，重试返回首次结果。
   * 键由客户端为每一次「新建草稿 / 复制」意图生成；命中他人的记录视为非法键，不泄露对方活动
   */
  async _createActivityOnce (key, uid, create, onExisting) {
    assertParam(typeof key === 'string' && key.length >= 8 && key.length <= 64, '缺少或非法的创建幂等键')
    return idempotent.runOnce(this.ctx, {
      collection: 'grouporder-activity',
      keyQuery: { idempotent_key: key },
      create,
      onExisting: async (doc) => {
        if (doc.leader_uid !== uid) throwBiz('FORBIDDEN', '幂等键无效，请刷新后重试')
        return onExisting(doc)
      }
    })
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
   * delivery_types 必填，至少一种（D-086）；草稿不占用任何公开入口。
   */
  async activityCreateDraft (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    // 创建与提交发布都要校验发布权限，这是必经路径（DATA_MODEL §10.0）
    await restriction.assertCanPublish(ctx, uid)

    const title = String(params.title || '').trim()
    assertParam(title.length >= 1 && title.length <= 50, '活动标题为 1–50 字')
    // 封面图不在建草稿时卡：团长可以先加商品、最后再传图，门槛设在 activitySubmitReview（D-041）
    const deliveryTypes = this._deliveryTypesParam(params)
    assertParam(deliveryTypes, '请至少选择一种交付方式（送货上门 / 自提）')
    const description = String(params.description || '')
    assertParam(description.length <= 500, '活动说明不超过 500 字')
    this._assertImages(params.images, '轮播图')
    // 时间入参必须是数字时间戳：字符串等会在比较时被隐式转换，写进库后排序与定时截止都会出错
    assertParam(Number.isFinite(params.end_time), '截止时间格式不正确')
    assertParam(params.end_time > ctx.now, '截止时间必须晚于当前时间')
    // 起始时间（D-087）：默认当前时间；草稿阶段允许早于当前（发布时已过即视为立即开始）
    const startTime = this._startTimeParam(params.start_time, ctx.now)
    assertParam(startTime < params.end_time, '起始时间必须早于截止时间')
    this._assertTimeWindow(startTime, params.end_time, ctx.now)

    return this._createActivityOnce(params.idempotent_key, uid, async () => {
      const shortCode = await idempotent.allocShortCode(ctx)
      const doc = {
        idempotent_key: params.idempotent_key,
        title,
        description,
        cover_image: params.cover_image || null,
        images: params.images || [],
        short_code: shortCode,
        // D-086：支持的交付方式集合；旧单值字段 delivery_type 不再写入
        delivery_types: deliveryTypes,
        leader_uid: uid,
        status: ACTIVITY.DRAFT,
        review_result: REVIEW_RESULT.NONE,
        content_version: 1,
        start_time: startTime,
        end_time: params.end_time,
        governance_status: GOVERNANCE.NORMAL,
        ever_governed: 0,
        text_check_status: 0,
        img_check_status: 0,
        anonymized: 0,
        create_date: ctx.now
      }
      // 自提点四字段（D-077）：自提收、送货上门写空
      Object.assign(doc, this._pickPickup(params, deliveryTypes.includes(DELIVERY.SELF_PICK)))

      const res = await this.db.collection('grouporder-activity').add(doc)
      // create_date 供客户端拼图片的云存储路径（创建日期/活动ID/）
      return ok({ activity_id: res.id, short_code: shortCode, create_date: doc.create_date, duplicated: false })
    }, async (existed) => ok({
      activity_id: existed._id, short_code: existed.short_code, create_date: existed.create_date, duplicated: true
    }))
  },

  /**
   * 编辑草稿 / 编辑活动资料（M-10）
   * 交付方式集合发布后不可改（D-060、D-086）。
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
      // 草稿阶段允许暂不传封面；发布过的活动不能把封面清掉
      if (activity.publish_date) assertParam(params.cover_image, '活动必须包含封面图')
      patch.cover_image = params.cover_image || null
    }
    if (params.images !== undefined) {
      this._assertImages(params.images, '轮播图')
      patch.images = params.images
    }
    if (params.end_time !== undefined) {
      assertParam(Number.isFinite(params.end_time), '截止时间格式不正确')
      // 表单只精确到分钟：同一分钟视为未改（D-120），整表保存时不误判、也不因已临近截止而报错
      if (Math.floor(params.end_time / 60000) !== Math.floor((activity.end_time || 0) / 60000)) {
        assertParam(params.end_time > ctx.now, '截止时间必须晚于当前时间')
        patch.end_time = params.end_time
      }
    }
    // 起始时间（D-087）。表单只精确到分钟，按分钟比较才算真正改动，避免整表保存时误判
    if (params.start_time !== undefined) {
      const prevStart = state.startTimeOf(activity)
      const nextStart = this._startTimeParam(params.start_time, ctx.now)
      if (Math.floor(nextStart / 60000) !== Math.floor(prevStart / 60000)) {
        if (activity.publish_date) {
          // 发布后：已开始的不能改；未开始的可以改，但不能改到当前时间之前（不触发重新审核）
          assertParam(ctx.now < prevStart, '活动已开始，不能再修改起始时间')
          assertParam(nextStart >= ctx.now, '起始时间不能早于当前时间')
        }
        patch.start_time = nextStart
      }
    }
    if (patch.start_time !== undefined || patch.end_time !== undefined) {
      const nextS = patch.start_time !== undefined ? patch.start_time : state.startTimeOf(activity)
      const nextE = patch.end_time !== undefined ? patch.end_time : activity.end_time
      assertParam(!nextS || nextS < nextE, '起始时间必须早于截止时间')
      // 没有起始时间的老活动按发布时间算（发布即开始）；起始时间本次改了才校验「7 天之内」
      this._assertTimeWindow(nextS || activity.publish_date || ctx.now, nextE, ctx.now, patch.start_time !== undefined)
    }
    const currentTypes = state.deliveryTypesOf(activity)
    const wantTypes = this._deliveryTypesParam(params)
    if (wantTypes && wantTypes.join() !== currentTypes.join()) {
      // 已发布过就锁死：已有参与者按当时可选的方式下了单（D-086）
      if (activity.publish_date) throwBiz('DELIVERY_TYPE_LOCKED')
      patch.delivery_types = wantTypes
    }

    // 自提点四字段（D-077）。交付方式在本次请求里改过就全量重算（收全或清空），
    // 没改过则只收显式传来的键，避免把没出现在表单里的字段误清
    const nextTypes = patch.delivery_types || currentTypes
    Object.assign(patch, this._pickPickup(params, nextTypes.includes(DELIVERY.SELF_PICK), patch.delivery_types === undefined))

    // 只保留真正变化的字段（D-120）：编辑页整表提交，若按「带了哪些字段」判断，团长只延长截止时间或改自提点
    // 也会因为带着标题、封面而被当成内容改动、打回审核中。图片按 fileID 比较（地址会刷新，D-119），其余按值比较
    const sameFiles = (a, b) => files.fileIdsOf(a).join('|') === files.fileIdsOf(b).join('|')
    for (const k of Object.keys(patch)) {
      if (k === 'cover_image' || k === 'images') {
        if (sameFiles(patch[k], activity[k] || (k === 'images' ? [] : null))) delete patch[k]
        continue
      }
      const prev = activity[k] === undefined || activity[k] === null ? '' : activity[k]
      const next = patch[k] === undefined || patch[k] === null ? '' : patch[k]
      if (Array.isArray(prev) || Array.isArray(next)) {
        if (JSON.stringify(prev) === JSON.stringify(next)) delete patch[k]
      } else if (prev === next) {
        delete patch[k]
      }
    }
    if (!Object.keys(patch).length) {
      return ok({ activity_id: activity._id, need_recheck: false, status: activity.status, unchanged: true })
    }
    await this.db.collection('grouporder-activity').doc(activity._id).update(files.toDbPatch(ctx, patch))

    // 换下来的封面 / 轮播图，无人引用时从云存储删除
    if (patch.cover_image !== undefined || patch.images !== undefined) {
      const merged = Object.assign({}, activity, patch)
      await files.releaseFiles(ctx,
        files.fileIdsOf(activity.cover_image, activity.images),
        files.fileIdsOf(merged.cover_image, merged.images)
      )
    }

    let recheck = { need_recheck: false, next_status: activity.status }
    if (review.isContentChange(patch)) {
      recheck = await review.applyContentChange(ctx, activity)
    }
    return ok({ activity_id: activity._id, need_recheck: recheck.need_recheck, status: recheck.next_status })
  },

  /**
   * 修改自提点（D-077）
   *
   * 独立于 activityUpdateDraft 的理由：自提点是活动级共享信息、不进订单快照，
   * 全场参与者看的是同一份，因此【发布后允许随时改、即时对所有人生效、
   * 不触发重新审核】（类比价格与库存调整 D-048），不受 _assertEditable
   * 那套「内容改动」限制。交付方式集合的「发布后锁死」与此无关，不受影响。
   *
   * 已结束的活动仍可改：截止后参与者正要去取货，地址写错了更需要纠正。
   * 已取消的活动没有履约可言，拒绝。
   */
  async activityUpdatePickup (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)

    if (activity.status === ACTIVITY.CANCELLED) throwBiz('ACTIVITY_CANCELLED')
    if (activity.governance_status === GOVERNANCE.OFF) {
      throwBiz('ACTIVITY_OFFLINE', '活动已被平台下架，不能修改自提点')
    }
    assertParam(state.supportsDelivery(activity, DELIVERY.SELF_PICK), '只有支持自提的活动才需要设置自提点')

    const patch = this._pickPickup(params, true, true)
    assertParam(Object.keys(patch).length > 0, '没有需要修改的内容')
    // 已发布过就不许把地址抹空——参与者靠它取货
    if (activity.publish_date && patch.pickup_address !== undefined) {
      assertParam(patch.pickup_address, '自提地址不能为空')
    }

    const prev = {}
    for (const k of Object.keys(patch)) prev[k] = activity[k] || ''

    await this.db.collection('grouporder-activity').doc(activity._id).update(patch)

    // 自提点是用户可控文本，送检但【不阻塞】（D-077）：
    // 命中只留记录交由运营复核，不回滚本次修改，否则地址纠错会被卡住
    await contentcheck.checkText(ctx, {
      objectType: contentcheck.OBJECT_TYPE.ACTIVITY,
      objectId: activity._id,
      contentVersion: activity.content_version || 1,
      snapshot: patch
    })

    // 发布后即时生效且不重新审核，留痕是唯一的追溯依据
    await oplog.write(ctx, {
      action_type: oplog.ACTION.ACTIVITY_PICKUP_CHANGED,
      object_type: 'activity',
      object_id: activity._id,
      prev_state: prev,
      next_state: patch
    })

    return ok({ activity_id: activity._id })
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
    assertParam(state.startTimeOf(activity) < activity.end_time, '起始时间必须早于截止时间')
    // 草稿可能存了很久：提交时按当下再校验一次时间窗口（D-135）；起始时间已过的按现在算
    this._assertTimeWindow(Math.max(state.startTimeOf(activity), ctx.now), activity.end_time, ctx.now)

    // 资料齐全性统一在发布时检查，编辑过程中不拦（D-041）
    assertParam(files.fileIdsOf(activity.cover_image).length > 0, '请先上传活动封面图')
    const goodsList = await this._listGoods(activity._id)
    assertParam(goodsList.length > 0, '活动至少需要一个商品才能提交发布')
    const noCover = goodsList.find(g => !files.fileIdsOf(g.cover_image).length)
    assertParam(!noCover, `商品「${noCover && noCover.name}」缺少封面图`)
    // 支持自提就必须先告诉参与者去哪取（D-077、D-086）
    if (state.supportsDelivery(activity, DELIVERY.SELF_PICK)) {
      assertParam(String(activity.pickup_address || '').trim(), '自提活动请先填写自提地址')
    }

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

    // 只认 activity_id（D-083 方案 1）。
    // 原先还有一条 short_code 查询分支，已移除：短码是 4 位 / 32 字符表，
    // 空间仅 32^4 ≈ 105 万，而本方法走 optionalLogin——未登录即可查，
    // 两者叠加等于允许脚本遍历短码批量拉取全平台进行中活动的标题、商品、
    // 价格与自提点真实地址（D-077），变相公开了活动列表，与 D-059 相悖。
    // 本方法仍只认 activity_id。按活动码查找由 D-104 另设 activityFindByCode：
    // 须登录、每日限次、新活动码 6 位，且只回 activity_id，打开后仍经本方法的可见性校验。
    assertParam(params.activity_id, '缺少活动标识')
    const activity = await this._getActivity(params.activity_id)
    // 读时补截止：已过截止时间而定时任务还没扫到的，当场按同一口径截止（common/lifecycle）
    await lifecycle.closeExpiredIn(ctx, [activity])

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
      delivery_types: state.deliveryTypesOf(activity),
      // 自提点是活动级共享信息，参与者侧详情 / 下单 / 结果页都要展示（D-077）
      pickup_address: activity.pickup_address || '',
      pickup_time_desc: activity.pickup_time_desc || '',
      pickup_contact_name: activity.pickup_contact_name || '',
      pickup_contact_mobile: activity.pickup_contact_mobile || '',
      status: activity.status,
      governance_status: activity.governance_status,
      start_time: activity.start_time || null,
      end_time: activity.end_time,
      // 已发布但未到起始时间：能看不能下单（D-087）
      not_started: state.isNotStarted(activity, ctx.now),
      // 服务端当前时间：前端据此算时差，到起止时间点时按服务端时间更新显示
      asOf: ctx.now,
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
        category_name: g.category_name || '', // 展示小类（买家详情按它分组）
        sort: g.sort || 0,
        // 剩余量不落库，仅按需计算；total_stock = 0 表示不限
        remain_qty: g.total_stock > 0 ? Math.max(0, g.total_stock - (g.sold_qty || 0)) : null
      })),
      is_leader: isLeader,
      // 是否还能接龙：用服务端时间判定
      joinable: activity.status === ACTIVITY.ONGOING &&
        activity.governance_status === GOVERNANCE.NORMAL &&
        ctx.now >= state.startTimeOf(activity) &&
        ctx.now < activity.end_time
    }

    // 团长联系方式（D-103）：账号级，对能看到本活动的人公开；被平台下架的活动不再向访问者展示，
    // 避免下架后仍借联系方式私下成交（团长本人始终可见，便于在预览里核对）
    base.leader_contact = (isLeader || activity.governance_status !== GOVERNANCE.OFF)
      ? await leadercontact.get(ctx, activity.leader_uid)
      : null

    // 本人在本活动各商品的已购份数（有效订单，含正在修改的那一单），{ goods_id: qty }。
    // 详情页 ＋ 号据此按「限购 − 已购」算最多还能买几份；口径同 stock.checkUserLimit，服务端下单仍会校验
    base.my_bought_qty = {}
    if (uid) {
      const agg = await this.db.collection('grouporder-order-item').aggregate()
        .match({ activity_id: activity._id, user_id: uid, status: ORDER.VALID })
        .group({ _id: '$goods_id', total: { $sum: '$qty' } })
        .end()
      for (const r of (agg.data || [])) base.my_bought_qty[r._id] = r.total || 0
    }

    if (!isLeader) return ok(base)

    // 团长视角：补统计与审核/治理信息。不出现销售额、实收、GMV
    const [orderAgg, itemAgg, byDelivery] = await Promise.all([
      this.db.collection('grouporder-order')
        .where({ activity_id: activity._id, status: 1 }).count(),
      this.db.collection('grouporder-order-item').aggregate()
        .match({ activity_id: activity._id, status: 1 })
        .group({ _id: null, qty: { $sum: '$qty' }, amount: { $sum: '$amount' } })
        .end(),
      deliverystat.breakdown(ctx, activity)
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
      // 授权复制（D-155）：有令牌即已授权；令牌只给团长本人，用于拼分享链接
      copy_token: activity.copy_token || '',
      stat: {
        valid_order_count: orderAgg.total || 0,
        valid_total_qty: agg.qty || 0,
        estimated_amount: agg.amount || 0,
        // 按交付方式拆分的有效单数与份数（D-086）
        by_delivery: byDelivery,
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

    // 读时补截止：列表里已到期未截止的，当场截止，状态与下游判断立即一致（common/lifecycle）
    await lifecycle.closeExpiredIn(ctx, listRes.data || [])
    const ids = (listRes.data || []).map(a => a._id)
    // 列表页展示有效总份数，按活动聚合一次，避免逐条查询
    let qtyMap = {}
    if (ids.length) {
      const agg = await this.db.collection('grouporder-order-item').aggregate()
        .match({ activity_id: this.dbCmd.in(ids), status: 1 })
        .group({ _id: '$activity_id', qty: { $sum: '$qty' } })
        // 显式上限：不依赖平台默认返回条数
        .limit(paging.AGG_LIMIT)
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
      delivery_types: state.deliveryTypesOf(a),
      start_time: a.start_time || null,
      end_time: a.end_time,
      not_started: state.isNotStarted(a, ctx.now),
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

    // 带当前状态条件更新：定时任务可能刚把活动自动截止并写了截止信息，不能被覆盖
    const res = await this.db.collection('grouporder-activity')
      .where({ _id: activity._id, status: activity.status })
      .update({
        status: ACTIVITY.CLOSED,
        actual_end_time: ctx.now,
        end_type: END_TYPE.MANUAL
      })
    if (!res.updated) throwBiz('STATE_CHANGED')
    // 留存到期日：活动截止之日 +3 年，订单继承（D-035）
    const expire = await snapshot.stampRetention(ctx, activity._id, ctx.now)
    return ok({ status: ACTIVITY.CLOSED, actual_end_time: ctx.now, retention_expire_date: expire })
  },

  /**
   * 取消活动（M-23）
   * 仅允许草稿或开始前的进行中活动；已结束不可取消（D-027）；进行中必须填原因。
   * D-111：活动一旦到了起始时间（含没有 start_time、发布即开始的老活动）就不能取消，只能截止。
   */
  async activityCancel (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    state.assertActivityTransition(activity.status, ACTIVITY.CANCELLED)

    const ongoing = activity.status === ACTIVITY.ONGOING
    if (ongoing && !state.isNotStarted(activity, ctx.now)) {
      throwBiz('PRECONDITION_UNMET', '活动已开始，不能取消；如需提前结束，请截止活动')
    }
    const reason = String(params.reason || '').trim()
    if (ongoing) {
      assertParam(reason, '取消进行中的活动必须填写原因')
    }

    // 带当前状态条件更新：期间被定时任务截止或被其他请求改了状态时，不覆盖已写的截止信息；
    // 进行中的再带「起始时间未到」条件，卡在开始那一刻的请求不会越过 D-111
    const where = { _id: activity._id, status: activity.status }
    if (ongoing) where.start_time = this.dbCmd.gt(ctx.now)
    const res = await this.db.collection('grouporder-activity')
      .where(where)
      .update({
        status: ACTIVITY.CANCELLED,
        cancel_uid: ctx.uid,
        cancel_time: ctx.now,
        cancel_reason: reason
      })
    if (!res.updated) throwBiz('STATE_CHANGED')
    const expire = await snapshot.stampRetention(ctx, activity._id, ctx.now)
    return ok({ status: ACTIVITY.CANCELLED, retention_expire_date: expire })
  },

  /**
   * 删除草稿（M-09 / M-20，D-090）
   *
   * 只允许删除【从未发布过、没有任何订单、未被治理过】的草稿：它从未对外公开，
   * 没有订单、清单、审核结论需要保留，因此真正删除，不走 D-027 的「取消并保留记录」。
   * 发布过的活动一律不可删除，只能取消或截止（D-027、D-035）。
   * 连同草稿内商品一起删除，并回收三表都已无人引用的图片；商品库记录不受影响（复制不是引用）。
   */
  async activityDeleteDraft (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)

    if (activity.status !== ACTIVITY.DRAFT || activity.publish_date) {
      throwBiz('PRECONDITION_UNMET', '只有从未发布过的草稿可以删除，发布过的活动请使用取消或截止')
    }
    if (activity.ever_governed === 1 || activity.governance_status === GOVERNANCE.OFF) {
      throwBiz('PRECONDITION_UNMET', '该草稿曾被平台处置，不能删除')
    }
    const { total: orderCount } = await this.db.collection('grouporder-order')
      .where({ activity_id: activity._id }).count()
    if (orderCount > 0) throwBiz('PRECONDITION_UNMET', '该活动已有订单记录，不能删除')

    const goodsList = await this._listGoods(activity._id)
    const fileIds = files.fileIdsOf(activity.cover_image, activity.images)
    for (const g of goodsList) fileIds.push(...files.fileIdsOf(g.cover_image, g.detail_images))

    await this.db.collection('grouporder-goods').where({ activity_id: activity._id }).remove()
    await this.db.collection('grouporder-activity').doc(activity._id).remove()

    // 删除记录后再回收：仍被商品库或其他活动引用的文件会被保留（GOODS_LIB_SPEC §6）
    await files.releaseFiles(ctx, fileIds, [])
    return ok({ activity_id: activity._id, deleted: true, goods_deleted: goodsList.length })
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
   * 仅本人发起、业务状态为已结束（自动截止与团长提前截止均可）的活动可作为源；
   * 草稿、审核中、进行中、已取消不可；被平台下架的活动一律不可（D-085 取代 D-080，AC-AC-006）。
   */
  async activityCopySourceList (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date', 'end_time']
    })

    // 复制源只认已结束：先把本人已到期而定时任务还没扫到的活动补截止，避免刚到点的活动查不到
    const { data: expired } = await this.db.collection('grouporder-activity')
      .where({ leader_uid: uid, status: this.dbCmd.in([ACTIVITY.REVIEWING, ACTIVITY.ONGOING]), end_time: this.dbCmd.lte(ctx.now) })
      .field({ _id: true, status: true, end_time: true })
      .limit(50).get()
    await lifecycle.closeExpiredIn(ctx, expired || [])

    const where = {
      leader_uid: uid,
      status: ACTIVITY.CLOSED,
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
      delivery_types: state.deliveryTypesOf(a),
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
    // 只有已结束的活动可作为源（D-085，取代 D-080 与 AC-AC-007 的范围）
    if (source.status !== ACTIVITY.CLOSED) {
      throwBiz('PRECONDITION_UNMET', '只有已结束的活动才能作为复制来源')
    }

    // 幂等（AC-AC-013、D-081）：同一 idempotent_key 只复制一次，取代原「同团长 + 同标题 + 60 秒」弱判重
    return this._createActivityOnce(params.idempotent_key, uid,
      () => this._copyFrom(source, uid, params.idempotent_key),
      async (existed) => {
        const cnt = await this.db.collection('grouporder-goods')
          .where({ activity_id: existed._id }).count()
        return ok({ activity_id: existed._id, copied_count: cnt.total || 0, excluded: [], end_time: existed.end_time, duplicated: true })
      })
  },

  /**
   * activityCopy 的实际复制：新建草稿并逐个复制未被下架的商品。
   * opts.forOther = true：授权复制给他人（D-155）。内容完整照搬（含自提点），只清空商品的 lib_id——
   * 它指向原团长的商品库记录，留着会让他人商品被下架时反写封禁原团长的库记录（goodslib.blockLibByGoods），
   * 商品库同步（D-143）也靠它认商品。复制给他人同样不沉淀商品库（不是他的商品）。
   */
  async _copyFrom (source, uid, idempotentKey, opts = {}) {
    const ctx = this.ctx
    // 截止时间按源活动的时长节奏推算（D-067）；新草稿起始时间取当前时间（D-087），
    // 时长 = 源截止 − 源起始；旧活动没有起始时间时沿用发布时间 / 创建时间
    const base = source.start_time || source.publish_date || source.create_date
    let duration = source.end_time - base
    if (!(duration > 0)) duration = 3 * 24 * 60 * 60 * 1000  // 兜底 3 天
    // 源活动时长超过 7 天的（D-135 之前创建）按 7 天预填
    duration = Math.min(duration, TIME_WINDOW_MS)
    const endTime = ctx.now + duration

    const shortCode = await idempotent.allocShortCode(ctx)
    const newActivity = await this.db.collection('grouporder-activity').add({
      idempotent_key: idempotentKey,
      title: source.title,                 // 不自动加「副本」后缀
      description: source.description || '',
      cover_image: source.cover_image,
      images: source.images || [],
      short_code: shortCode,
      delivery_types: state.deliveryTypesOf(source),
      // 自提点随活动复制（D-077，DATA_MODEL §4.10）：定期自提团取货点通常不变，
      // 不复制正好丢了最该留的东西；不支持自提的活动这四项本就是空串
      pickup_address: source.pickup_address || '',
      pickup_time_desc: source.pickup_time_desc || '',
      pickup_contact_name: source.pickup_contact_name || '',
      pickup_contact_mobile: source.pickup_contact_mobile || '',
      leader_uid: uid,
      status: ACTIVITY.DRAFT,              // 一律置为草稿
      review_result: REVIEW_RESULT.NONE,
      content_version: 1,
      start_time: ctx.now,
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
        // 本人复制：来源仍是同一条库记录，治理链路保持连通；复制给他人：断开（见方法说明）
        lib_id: opts.forOther ? '' : (g.lib_id || ''),
        // 授权复制来的商品打标记（D-155 修订）：复制者之后编辑保存也不沉淀到他的商品库；本人再复制时沿用标记
        copy_origin: opts.forOther ? 1 : (g.copy_origin || 0),
        category_name: g.category_name || '',               // 分类快照随商品带过去（D-066 修订、D-149）
        category_parent_name: g.category_parent_name || '',
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
  // 授权复制（D-155）：团长授权后，他人凭链接一键复制并发布一模一样的接龙
  // ==========================================================================

  /** 授权复制的来源活动须审核通过（进行中 / 已结束）且未被平台下架 */
  _assertCopyable (activity) {
    if (activity.governance_status === GOVERNANCE.OFF) throwBiz('ACTIVITY_OFFLINE', '该活动已被平台下架，不能复制')
    if (activity.status !== ACTIVITY.ONGOING && activity.status !== ACTIVITY.CLOSED) {
      throwBiz('PRECONDITION_UNMET', '只有审核通过的活动才能授权复制')
    }
  },

  /** 凭令牌取来源活动；令牌无效（未授权 / 已取消授权）一律按不存在处理，不暴露活动是否存在 */
  async _getCopySource (token) {
    const t = String(token || '').trim()
    assertParam(/^[a-f0-9]{24}$/.test(t), '复制链接无效')
    const { data } = await this.db.collection('grouporder-activity').where({ copy_token: t }).limit(1).get()
    const source = data && data[0]
    if (!source) throwBiz('NOT_FOUND', '复制链接已失效：团长已取消授权或链接有误')
    this._assertCopyable(source)
    return source
  },

  /** 新活动的起止时间：起始 = 现在，截止 = 现在 + 源活动时长（最长 7 天，兜底 3 天），同 _copyFrom */
  _copyTimes (source, now) {
    const base = source.start_time || source.publish_date || source.create_date
    let duration = source.end_time - base
    if (!(duration > 0)) duration = 3 * 24 * 60 * 60 * 1000
    duration = Math.min(duration, TIME_WINDOW_MS)
    return { start_time: now, end_time: now + duration }
  },

  /**
   * 开启 / 取消授权复制（M-20「⋯ → 授权复制」）
   * 入参 { activity_id, enable }。开启：已有令牌沿用，没有则生成；取消：清空令牌，旧链接立即失效。
   * 再次开启会生成新令牌（取消前转出去的链接不会复活）。
   */
  async activityCopyAuthorize (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    if (params.enable === false) {
      await this.db.collection('grouporder-activity').doc(activity._id).update({ copy_token: '', copy_auth_time: 0 })
      return ok({ activity_id: activity._id, copy_token: '', asOf: ctx.now })
    }
    this._assertCopyable(activity)
    let token = activity.copy_token || ''
    if (!token) {
      token = crypto.randomBytes(12).toString('hex')
      await this.db.collection('grouporder-activity').doc(activity._id).update({ copy_token: token, copy_auth_time: ctx.now })
    }
    return ok({ activity_id: activity._id, copy_token: token, title: activity.title, cover_image: activity.cover_image, asOf: ctx.now })
  },

  /**
   * 复制预览（复制落地页）：须登录；只读，不写库。
   * 返回将要生成的接龙内容（与原活动一致）与自动计算的起止时间；不返回销量、订单与原团长信息。
   */
  async activityCopyPreview (params = {}) {
    const ctx = this.ctx
    auth.requireLogin(ctx)
    const source = await this._getCopySource(params.token)
    const goodsList = (await this._listGoods(source._id)).filter(g => g.governance_status !== GOVERNANCE.OFF)
    const times = this._copyTimes(source, ctx.now)
    return ok({
      title: source.title,
      description: source.description || '',
      cover_image: source.cover_image,
      images: source.images || [],
      delivery_types: state.deliveryTypesOf(source),
      pickup_address: source.pickup_address || '',
      pickup_time_desc: source.pickup_time_desc || '',
      pickup_contact_name: source.pickup_contact_name || '',
      pickup_contact_mobile: source.pickup_contact_mobile || '',
      // 预览口径：将要生成的是一场待发布的新活动（go-activity-view 按 status 0 显示「待发布」）
      status: ACTIVITY.DRAFT,
      governance_status: GOVERNANCE.NORMAL,
      start_time: times.start_time,
      end_time: times.end_time,
      goods: goodsList.map(g => ({
        _id: g._id,
        name: g.name,
        description: g.description || '',
        cover_image: g.cover_image,
        detail_images: g.detail_images || [],
        price: g.price,
        unit: g.unit,
        total_stock: g.total_stock,
        sold_qty: 0,
        per_user_limit: g.per_user_limit,
        on_sale: 1,
        governance_status: GOVERNANCE.NORMAL,
        is_recommend: g.is_recommend || 0,
        category_name: g.category_name || '',
        sort: g.sort || 0,
        remain_qty: g.total_stock > 0 ? g.total_stock : null
      })),
      asOf: ctx.now
    })
  },

  /**
   * 凭授权链接复制（复制落地页）：须登录、须有发布权限。
   * 完整复制原活动为本人的新活动。submit 默认 true =「直接发布」：复制后直接提交审核（走平台审核，同正常发起）；
   * submit = false =「修改后再发布」（D-155 修订）：只生成草稿，由复制者在编辑页修改后走正常发布流程。
   * 幂等：同一 idempotent_key 只生成一场；重复提交返回已生成的那一场。
   * 提交审核失败时新活动保留为草稿，返回 submit_error 说明原因。
   */
  async activityCopyByToken (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    await restriction.assertCanPublish(ctx, uid)
    const source = await this._getCopySource(params.token)

    let created = null
    await this._createActivityOnce(params.idempotent_key, uid,
      async () => {
        const r = await this._copyFrom(source, uid, params.idempotent_key, { forOther: true })
        created = r.data
        return r
      },
      async (existed) => ok({ activity_id: existed._id, duplicated: true }))

    if (!created) {
      // 重复提交：返回已生成的那一场当前状态
      const { data } = await this.db.collection('grouporder-activity')
        .where({ idempotent_key: params.idempotent_key }).limit(1).get()
      const a = data && data[0]
      return ok({ activity_id: a && a._id, status: a && a.status, duplicated: true })
    }
    if (params.submit === false) {
      return ok({ activity_id: created.activity_id, status: ACTIVITY.DRAFT, excluded: created.excluded })
    }
    if (!created.copied_count) {
      return ok({ activity_id: created.activity_id, status: ACTIVITY.DRAFT, submit_error: '原活动没有可复制的商品，已保存为草稿' })
    }
    try {
      const sub = await this.activitySubmitReview({ activity_id: created.activity_id })
      const d = (sub && sub.data) || {}
      return ok({ activity_id: created.activity_id, status: d.status, auto_passed: !!d.auto_passed, excluded: created.excluded })
    } catch (e) {
      return ok({ activity_id: created.activity_id, status: ACTIVITY.DRAFT, submit_error: (e && e.errMsg) || '提交审核失败，已保存为草稿' })
    }
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
    // 归入的商品库小类（D-088）；同时把小类名快照到活动商品，买家详情按它分组（D-066 修订）
    const libCategoryId = params.lib_category_id
    const libCategory = await goodslib.assertOwnCategory(ctx, activity.leader_uid, libCategoryId)
    this._assertImages(params.detail_images, '详情图')
    assertParam(Number.isInteger(params.price) && params.price >= 0, '商品单价必须是不小于 0 的整数（单位：分）')
    assertParam(Number.isInteger(params.total_stock) && params.total_stock >= 0, '总库存必须是不小于 0 的整数')
    assertParam(Number.isInteger(params.per_user_limit) && params.per_user_limit >= 0, '每人限购必须是不小于 0 的整数')
    const unit = String(params.unit || '份').trim()
    assertParam(unit, '商品单位不能为空')

    const existing = await this._listGoods(activity._id)
    assertParam(existing.length < MAX_GOODS_PER_ACTIVITY,
      `一个活动最多 ${MAX_GOODS_PER_ACTIVITY} 个商品，当前已有 ${existing.length} 个`)
    // 同一活动内商品不重名（D-093）：与「从商品库添加」的去重同一口径
    if (existing.some(g => String(g.name || '').trim() === name)) {
      throwBiz('DUPLICATE', `本次接龙已有「${name}」，请换一个名称`)
    }

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
      category_name: libCategory ? (libCategory.name || '') : '', // 展示小类快照
      category_parent_name: await goodslib.parentNameOf(ctx, libCategory), // 大类快照，仅用于 Excel 清单「类别」列（D-149）
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
    // 商品库已有同名商品时，团长可选择「不更新商品库」（D-094）：sync_to_lib === false 则只存活动、不沉淀
    const libId = params.sync_to_lib === false
      ? ''
      : await goodslib.sinkToLib(ctx, doc, activity.leader_uid, { categoryId: libCategoryId })

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
    // 归入的商品库小类（D-088）；undefined 表示保持原分类。小类名同步快照到活动商品（D-066 修订）
    const libCategoryId = params.lib_category_id
    const libCategory = await goodslib.assertOwnCategory(ctx, activity.leader_uid, libCategoryId)

    const patch = {}
    const traces = []
    // 只有值真正变化的字段才进 patch：前端编辑页每次都整表提交，若照单全收，
    // 只改价格 / 库存也会被判为内容改动而触发重审（D-048）、图片被重复送检
    const sameFiles = (a, b) => files.fileIdsOf(a).join('|') === files.fileIdsOf(b).join('|')

    if (params.name !== undefined) {
      const n = String(params.name).trim()
      assertParam(n.length >= 1 && n.length <= 50, '商品名称为 1–50 字')
      // 改名时同一活动内不重名（D-093）；名称没变不查
      if (n !== String(goods.name || '').trim()) {
        const siblings = await this._listGoods(activity._id)
        if (siblings.some(g => g._id !== goods._id && String(g.name || '').trim() === n)) {
          throwBiz('DUPLICATE', `本次接龙已有「${n}」，请换一个名称`)
        }
      }
      if (n !== String(goods.name || '').trim()) patch.name = n
    }
    if (params.description !== undefined) {
      assertParam(String(params.description).length <= 500, '商品说明不超过 500 字')
      if (String(params.description) !== String(goods.description || '')) patch.description = String(params.description)
    }
    if (params.cover_image !== undefined) {
      assertParam(params.cover_image, '商品必须包含封面图')
      if (!sameFiles(params.cover_image, goods.cover_image)) patch.cover_image = params.cover_image
    }
    if (params.detail_images !== undefined) {
      this._assertImages(params.detail_images, '详情图')
      if (!sameFiles(params.detail_images || [], goods.detail_images || [])) patch.detail_images = params.detail_images
    }
    if (params.unit !== undefined) {
      const u = String(params.unit).trim()
      assertParam(u, '商品单位不能为空')
      if (u !== goods.unit) {
        traces.push([oplog.ACTION.GOODS_UNIT_CHANGED, { unit: goods.unit }, { unit: u }, '修改商品单位'])
        patch.unit = u
      }
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
    // 展示小类随之更新（lib_category_id 省略=保持不变）。category_name 不在 review.CONTENT_FIELDS，不触发重审（与推荐同理）
    if (libCategoryId !== undefined) {
      const newCatName = libCategory ? (libCategory.name || '') : ''
      if (newCatName !== String(goods.category_name || '')) patch.category_name = newCatName
      const newParentName = await goodslib.parentNameOf(ctx, libCategory)
      if (newParentName !== String(goods.category_parent_name || '')) patch.category_parent_name = newParentName
    }
    // 库存与限购统一走 goodsAdjustStock，这里不接受，避免两条路径口径不一致
    assertParam(params.total_stock === undefined && params.per_user_limit === undefined,
      '库存与每人限购请使用 goodsAdjustStock 调整')
    // 什么都没变（如只改了商品库分类）：不写商品，只做下面的沉淀
    if (Object.keys(patch).length) {
      await this.db.collection('grouporder-goods').doc(goods._id).update(files.toDbPatch(ctx, patch))
    }
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
    // 商品保存即沉淀，同名记录会被更新；授权复制来的商品不沉淀（不是复制者自己的商品，D-155 修订）
    if (goods.copy_origin !== 1) {
      await goodslib.sinkToLib(ctx, merged, activity.leader_uid, { categoryId: libCategoryId })
    }

    // 沉淀之后再回收：同名库记录已换成新图，旧图若再无人引用才删
    if (patch.cover_image !== undefined || patch.detail_images !== undefined) {
      await files.releaseFiles(ctx,
        files.fileIdsOf(goods.cover_image, goods.detail_images),
        files.fileIdsOf(merged.cover_image, merged.detail_images)
      )
    }

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
   * 活动已结束或已取消时禁止恢复（D-028）。
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
        throwBiz('ACTIVITY_CLOSED', '活动已结束或已取消，不能恢复售卖')
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
      throwBiz('ACTIVITY_CLOSED', '活动已结束或已取消，不能再调整库存与限购')
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

    // 调为有限库存时带条件写入：上面的 sold_qty 是先读的值，期间可能有人下单，
    // 由数据库在写入时再判一次「已购不超过新库存」，与下单扣减（带 total_stock 条件）互斥，不会超卖
    const where = { _id: goods._id }
    if (patch.total_stock > 0) where.sold_qty = this.dbCmd.lte(patch.total_stock)
    const res = await this.db.collection('grouporder-goods').where(where).update(patch)
    if (!res.updated) {
      const latest = await this.db.collection('grouporder-goods').doc(goods._id).get()
      const soldQty = (latest.data && latest.data[0] && latest.data[0].sold_qty) || 0
      throwBiz('STATE_CHANGED', `已购数量已超过新库存（当前已购 ${soldQty}），请刷新后重试`, { sold_qty: soldQty })
    }
    await this._writeLeaderTrace(oplog.ACTION.GOODS_STOCK_CHANGED, goods,
      { total_stock: goods.total_stock, per_user_limit: goods.per_user_limit },
      { total_stock: patch.total_stock !== undefined ? patch.total_stock : goods.total_stock,
        per_user_limit: patch.per_user_limit !== undefined ? patch.per_user_limit : goods.per_user_limit },
      '调整库存与每人限购')
    // 活动里保存过的值即下次复用的默认值：同步到同名库记录（GOODS_LIB_SPEC §4.2）；授权复制来的商品不写商品库（D-155 修订）
    if (goods.copy_origin !== 1) {
      await goodslib.syncStockToLib(ctx, Object.assign({}, goods, patch), activity.leader_uid)
    }

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
      throwBiz('ACTIVITY_CLOSED', '活动已结束或已取消，不能再调整商品顺序')
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
  },

  /**
   * 按活动码查找活动（「接龙」tab「我参与的」搜索，D-104）
   *
   * 修订 D-083：活动码重新可用于查找，但只回 activity_id，打开后仍走 activityGetDetail 的可见性校验。
   * 防枚举：① 必须登录；② 新活动码 6 位（约 10.7 亿种），老活动 4 位保留；③ 每个账号每天最多
   * CODE_MISS_DAILY_LIMIT 次「没查到」——查到的不计数，正常用户拿的是真实活动码，等于不限次数，
   * 而猜号的程序几乎每次都落空，很快触顶（格式不对的也不计）；④ 只命中审核通过、未被下架、未取消的活动
   * （进行中含未开始、已结束），团长本人的活动不限状态；其余情况一律回「没有找到」，不透露是否存在。
   * 活动码有唯一索引，一个号只对应一个活动。
   */
  async activityFindByCode (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const code = idempotent.normalizeShortCode(params.code)
    if (!code) throwBiz('INVALID_PARAM', '活动码是 6 位（早期活动为 4 位）字母或数字，不含 0、O、1、I')

    const used = await this._codeMissCount(uid)
    if (used >= CODE_MISS_DAILY_LIMIT) {
      throwBiz('PRECONDITION_UNMET', `今天没查到的次数已达 ${CODE_MISS_DAILY_LIMIT} 次，请核对活动码明天再试，或请团长直接发活动链接`)
    }

    const { data } = await this.db.collection('grouporder-activity').where({ short_code: code }).limit(1).get()
    const activity = data && data[0]
    const visible = !!activity && (activity.leader_uid === uid || (
      (activity.status === ACTIVITY.ONGOING || activity.status === ACTIVITY.CLOSED) &&
      activity.governance_status !== GOVERNANCE.OFF
    ))
    if (!visible) {
      const missed = await this._recordCodeMiss(uid)
      throwBiz('NOT_FOUND', '没有找到这个活动码对应的活动，请核对后重试', { remaining: Math.max(0, CODE_MISS_DAILY_LIMIT - missed) })
    }

    return ok({ activity_id: activity._id, title: activity.title, asOf: ctx.now })
  },

  /** 今天（UTC+8）的日期串，活动码落空计数按它切换 */
  _codeSearchToday () {
    return new Date(this.ctx.now + 8 * 3600 * 1000).toISOString().slice(0, 10)
  },

  /** 本账号今天已「没查到」的次数（D-104） */
  async _codeMissCount (uid) {
    const { data } = await this.db.collection('grouporder-user-ext').where({ user_id: uid }).limit(1).get()
    const ext = data && data[0]
    return ext && ext.code_search_day === this._codeSearchToday() ? (ext.code_search_count || 0) : 0
  },

  /**
   * 记一次「没查到」（D-104），返回记完后今天的累计次数。
   * 当天已有计数用原子 inc；跨天时带「不是今天」条件重置为 1，并发时只有一方重置，另一方重走 inc。
   * 先查额度、落空后再记，并发下可能略超上限几次，对防枚举无影响
   */
  async _recordCodeMiss (uid) {
    const ctx = this.ctx
    const cmd = this.dbCmd
    const coll = this.db.collection('grouporder-user-ext')
    const today = this._codeSearchToday()
    const inc = await coll.where({ user_id: uid, code_search_day: today }).update({ code_search_count: cmd.inc(1) })
    if (!inc.updated) {
      const { data } = await coll.where({ user_id: uid }).limit(1).get()
      const ext = data && data[0]
      if (!ext) {
        await coll.add({ user_id: uid, publish_restriction: 0, code_search_day: today, code_search_count: 1, create_date: ctx.now, update_date: ctx.now })
        return 1
      }
      const reset = await coll.where({ _id: ext._id, code_search_day: cmd.neq(today) })
        .update({ code_search_day: today, code_search_count: 1 })
      if (!reset.updated) return this._recordCodeMiss(uid)
      return 1
    }
    return this._codeMissCount(uid)
  },

  /**
   * 海报用封面图（D-117）：云端代为下载本活动封面，转成 dataURL 返回。
   * 浏览器直接读云存储图片受跨域限制，画进 canvas 后无法导出，海报只能退回默认头图；
   * 云函数下载不受跨域限制。只取该活动保存的封面（不接受任意 URL，杜绝被当作代理），仅团长本人可调，
   * 图片超过 POSTER_COVER_MAX 不返回（前端退回默认头图）。
   */
  async activityPosterCover (params = {}) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, params.activity_id)
    const cover = activity.cover_image
    if (!cover || (!cover.fileID && !cover.url)) return ok({ data_url: '' })

    // 优先用 fileID 换一个新的访问地址，避免存的 url 过期
    let url = cover.url || ''
    if (cover.fileID) {
      try {
        const r = await uniCloud.getTempFileURL({ fileList: [cover.fileID] })
        const f = r && r.fileList && r.fileList[0]
        if (f && f.tempFileURL) url = f.tempFileURL
      } catch (e) { /* 换取失败就用存的 url */ }
    }
    if (!/^https?:\/\//.test(url)) return ok({ data_url: '' })

    try {
      const res = await uniCloud.httpclient.request(url, { method: 'GET', timeout: 8000 })
      const buf = res && res.data
      const type = String((res && res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || '').split(';')[0].trim()
      if (!res || res.status !== 200 || !buf || !buf.length || buf.length > POSTER_COVER_MAX || !/^image\//.test(type)) {
        return ok({ data_url: '' })
      }
      return ok({ data_url: `data:${type};base64,${Buffer.from(buf).toString('base64')}` })
    } catch (e) {
      console.error('[activity-co] 海报封面下载失败', e)
      return ok({ data_url: '' })
    }
  }
}
