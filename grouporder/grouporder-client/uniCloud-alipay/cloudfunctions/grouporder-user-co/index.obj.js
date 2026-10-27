/**
 * grouporder-user-co · 收货信息簿、绑定申诉、隐私请求、待办
 * 服务对象：client
 * 契约：docs/arch/CLOUD_API.md §7
 *
 * 登录、注册、改密、微信授权全部走 uni-id-co（uni-id-pages 现成），本对象不重复实现。
 * grouporder-address 全表禁止客户端直读，只走本对象（DATA_MODEL §8.5）。
 */
const {
  auth, errors, paging, idempotent, state, leadercontact, membership, bindMethods
} = require('grouporder-common')
const { fileurl } = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors
const { ACTIVITY, GOVERNANCE, ORDER, REVIEW_RESULT } = state

const DAY_MS = 24 * 60 * 60 * 1000
// 「已结束还有未收款 / 未取货」只提醒近这么多天结束的活动，更早的不再打扰（D-134）
const CLOSED_PENDING_DAYS = 30

// 待办四档优先级（DATA_MODEL §4.8 说明 3）
const TODO = {
  ACTIVITY_OFFLINE: { key: 'activity_offline', level: 1 },
  REVIEW_REJECTED: { key: 'review_rejected', level: 1 },
  JOINED_CANCELLED: { key: 'joined_cancelled', level: 2 },
  JOINED_OFFLINE: { key: 'joined_offline', level: 2 },
  // D-134：去掉「待生成清单」（不是每个团长都要清单，且活动结束后会一直挂着）；
  // 改为「已结束，还有未收款 / 未取货」——只对团长在该场标记过至少一单的活动提醒
  CLOSED_PENDING: { key: 'closed_pending', level: 2 },
  ENDING_SOON_LEADER: { key: 'ending_soon_leader', level: 3 },
  ENDING_SOON_JOINER: { key: 'ending_soon_joiner', level: 3 },
  // D-134：草稿一律进待办（不再等 24 小时）；审核未通过的草稿已有一档提醒，不重复
  DRAFT: { key: 'draft', level: 3 },
  REPORT_RESULT: { key: 'report_result', level: 4 },
  APPEAL_RESULT: { key: 'appeal_result', level: 4 }
}

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

  async _getOwnAddress (uid, addressId) {
    assertParam(addressId, '缺少收货信息标识')
    const { data } = await this.db.collection('grouporder-address').doc(addressId).get()
    const addr = data && data[0]
    if (!addr || addr.deleted === 1) throwBiz('NOT_FOUND', '收货信息不存在或已删除')
    if (addr.user_id !== uid) throwBiz('FORBIDDEN', '无权操作他人的收货信息')
    return addr
  },

  /** 同一用户至多一条为默认：设新默认前先清掉旧的 */
  async _clearDefault (uid, exceptId) {
    const where = { user_id: uid, deleted: 0, is_default: 1 }
    if (exceptId) where._id = this.dbCmd.neq(exceptId)
    await this.db.collection('grouporder-address').where(where).update({ is_default: 0 })
  },

  _validateAddressInput (params, required) {
    const out = {}
    const check = (field, label, maxLen) => {
      if (params[field] === undefined) {
        if (required) assertParam(false, `请填写${label}`)
        return
      }
      const v = String(params[field]).trim()
      assertParam(v, `请填写${label}`)
      assertParam(v.length <= maxLen, `${label}过长`)
      out[field] = v
    }
    check('name', '收货人姓名', 50)
    // 电话只做必填与格式校验，不验证真实性，也不用于账号身份核验（D-029、P1-02）
    check('mobile', '收货电话', 20)
    check('address', '完整收货地址', 200)
    if (out.mobile) {
      assertParam(/^[0-9+\-\s()]{5,20}$/.test(out.mobile), '收货电话格式不正确')
    }
    return out
  },

  // ==========================================================================
  // 收货信息簿（M-15 / M-16）
  // 订单保存的是快照，改地址簿不影响历史订单。
  // ==========================================================================

  async addressList () {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    // 地址簿不设条数上限：分批读完（M-16 编辑也从这份列表里按 id 取记录）
    const data = await paging.fetchAll(() => this.db.collection('grouporder-address')
      .where({ user_id: uid, deleted: 0 })
      .orderBy('is_default', 'desc')
      .orderBy('create_date', 'asc')
      .orderBy('_id', 'asc'))
    return ok({
      list: (data || []).map(a => ({
        _id: a._id,
        name: a.name,
        mobile: a.mobile,
        address: a.address,
        is_default: a.is_default || 0,
        create_date: a.create_date
      })),
      total: (data || []).length,
      asOf: ctx.now
    })
  },

  async addressCreate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const fields = this._validateAddressInput(params, true)

    const { total } = await this.db.collection('grouporder-address')
      .where({ user_id: uid, deleted: 0 }).count()
    // 首条自动成为默认（D-013）
    const isDefault = params.is_default === 1 || total === 0 ? 1 : 0
    if (isDefault) await this._clearDefault(uid)

    const res = await this.db.collection('grouporder-address').add(Object.assign({
      user_id: uid,
      is_default: isDefault,
      deleted: 0,
      create_date: ctx.now,
      update_date: ctx.now
    }, fields))
    return ok({ address_id: res.id, is_default: isDefault })
  },

  async addressUpdate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const addr = await this._getOwnAddress(uid, params.address_id)

    const fields = this._validateAddressInput(params, false)
    assertParam(Object.keys(fields).length > 0 || params.is_default !== undefined, '没有需要修改的内容')

    if (params.is_default === 1 && addr.is_default !== 1) {
      await this._clearDefault(uid, addr._id)
      fields.is_default = 1
    }
    fields.update_date = ctx.now
    await this.db.collection('grouporder-address').doc(addr._id).update(fields)
    return ok({ address_id: addr._id })
  },

  /**
   * 软删除（DATA_MODEL §4.5）：订单已有独立快照，软删是为了保住 order.address_id 的追溯链。
   * 删掉默认项后，按 create_date 升序把最早创建的剩余记录设为默认（D-046）。
   */
  async addressDelete (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const addr = await this._getOwnAddress(uid, params.address_id)

    await this.db.collection('grouporder-address').doc(addr._id).update({
      deleted: 1,
      is_default: 0,
      update_date: ctx.now
    })

    let newDefaultId = null
    if (addr.is_default === 1) {
      const { data } = await this.db.collection('grouporder-address')
        .where({ user_id: uid, deleted: 0 })
        .orderBy('create_date', 'asc').limit(1).get()
      if (data && data[0]) {
        await this.db.collection('grouporder-address').doc(data[0]._id).update({ is_default: 1 })
        newDefaultId = data[0]._id
      }
      // 无剩余记录时允许地址簿为空（D-046）
    }
    return ok({ address_id: addr._id, deleted: true, new_default_id: newDefaultId })
  },

  async addressSetDefault (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const addr = await this._getOwnAddress(uid, params.address_id)
    if (addr.is_default === 1) return ok({ address_id: addr._id, changed: false })

    await this._clearDefault(uid, addr._id)
    await this.db.collection('grouporder-address').doc(addr._id)
      .update({ is_default: 1, update_date: ctx.now })
    return ok({ address_id: addr._id, changed: true })
  },

  // ==========================================================================
  // 绑定与申诉
  // ==========================================================================

  /**
   * 微信与平台账号绑定状态（M-05）
   * 微信身份【只存摘要】，不返回完整凭证。
   * 云对象内 this 只能调到 _ 开头的方法，本对象内部复用走 _bindStatus。
   */
  bindStatus () {
    return this._bindStatus()
  },

  async _bindStatus () {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const { data } = await this.db.collection('uni-id-users')
      .where({ _id: uid })
      .field({ username: true, nickname: true, wx_openid: true, wx_unionid: true, status: true })
      .limit(1).get()
    const user = data && data[0]
    if (!user) throwBiz('NOT_FOUND', '账号不存在')

    const openid = user.wx_openid && (user.wx_openid.mp || user.wx_openid.app || user.wx_openid.h5)
    const digest = v => {
      if (!v) return ''
      const s = String(v)
      return s.length <= 8 ? '****' : `${s.slice(0, 4)}****${s.slice(-4)}`
    }

    return ok({
      user_id: uid,
      has_username: !!user.username,
      nickname: user.nickname || '',
      wechat_bound: !!openid,
      // 只给摘要，不回完整凭证
      wechat_digest: digest(openid),
      account_status: user.status === undefined ? 0 : user.status,
      asOf: ctx.now
    })
  },

  /**
   * 提交绑定异常申诉（M-05 / M-07）
   * 幂等：同一用户的待处理/处理中申诉只保留一条，重复提交返回最新状态。
   * 【收货电话不得用于身份核验】（D-029、P1-02）。
   */
  async appealSubmit (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    assertParam(params.appeal_type === 1 || params.appeal_type === 2, '申诉类型只能是解绑或重新绑定')

    const pending = await this.db.collection('grouporder-bind-appeal')
      .where({ applicant_uid: uid, status: this.dbCmd.in([1, 2]) })
      .orderBy('create_date', 'desc').limit(1).get()
    if (pending.data && pending.data.length) {
      const a = pending.data[0]
      return ok({ appeal_id: a._id, appeal_no: a.appeal_no, status: a.status, duplicated: true })
    }

    const bind = await this._bindStatus()
    const appealNo = idempotent.buildBizNo('APL', ctx.now)
    const res = await this.db.collection('grouporder-bind-appeal').add({
      appeal_no: appealNo,
      applicant_uid: uid,
      wx_identity: bind.data ? bind.data.wechat_digest : '',
      target_account_uid: params.target_account_uid || '',
      current_binding: bind.data
        ? { wechat_bound: bind.data.wechat_bound, has_username: bind.data.has_username }
        : {},
      appeal_type: params.appeal_type,
      status: 1,
      create_date: ctx.now
    })
    return ok({ appeal_id: res.id, appeal_no: appealNo, status: 1, duplicated: false })
  },

  /**
   * 查看申诉结果（M-07）
   * 失败原因摘要向用户展示，【不含内部信息】——只回 fail_reason，不回 identity_verify_result。
   */
  async appealMyList (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date']
    })

    const coll = this.db.collection('grouporder-bind-appeal').where({ applicant_uid: uid })
    const [listRes, countRes] = await Promise.all([
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])
    const list = (listRes.data || []).map(a => ({
      _id: a._id,
      appeal_no: a.appeal_no,
      appeal_type: a.appeal_type,
      status: a.status,
      fail_reason: a.fail_reason || '',
      handle_time: a.handle_time || null,
      create_date: a.create_date
    }))
    return ok(paging.wrap(list, countRes.total, ctx.now))
  },

  // ==========================================================================
  // 隐私请求（M-08）
  // ==========================================================================

  /**
   * 注销 / 删除 / 匿名化请求
   * 前置条件校验（D-056）：仍是审核中或进行中活动的团长、
   * 或在尚未截止/取消的活动中仍有有效订单 → PRECONDITION_UNMET 并【列出需先处理的对象】。
   */
  async privacyRequestSubmit (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const caseType = params.case_type
    assertParam([1, 2, 3].includes(caseType), '请求类型不合法')

    const blockers = []

    // ① 仍是审核中或进行中活动的团长
    const { data: myActivities } = await this.db.collection('grouporder-activity')
      .where({ leader_uid: uid, status: this.dbCmd.in([ACTIVITY.REVIEWING, ACTIVITY.ONGOING]) })
      .field({ _id: true, title: true, status: true, end_time: true })
      .limit(50).get()
    for (const a of (myActivities || [])) {
      blockers.push({
        type: 'activity',
        id: a._id,
        title: a.title,
        status: a.status,
        action: a.status === ACTIVITY.REVIEWING ? '请先撤回审核或取消该活动' : '请先取消或等待该活动结束'
      })
    }

    // ② 在尚未截止/取消的活动中仍有有效订单（本人订单分批读完，不只看前若干张）
    const myOrders = await paging.fetchAll(() => this.db.collection('grouporder-order')
      .where({ user_id: uid, status: ORDER.VALID })
      .field({ _id: true, order_no: true, activity_id: true })
      .orderBy('_id', 'asc'))
    if (myOrders.length) {
      const acts = await paging.fetchAllByIds(myOrders.map(o => o.activity_id), ids =>
        this.db.collection('grouporder-activity')
          .where({
            _id: this.dbCmd.in(ids),
            status: this.dbCmd.in([ACTIVITY.REVIEWING, ACTIVITY.ONGOING])
          })
          .field({ _id: true, title: true })
          .orderBy('_id', 'asc'))
      const openMap = new Map(acts.map(a => [a._id, a]))
      for (const o of myOrders) {
        const a = openMap.get(o.activity_id)
        if (!a) continue
        blockers.push({
          type: 'order',
          id: o._id,
          order_no: o.order_no,
          title: a.title,
          action: '请先取消该订单或等待活动结束'
        })
      }
    }

    if (blockers.length) {
      throwBiz('PRECONDITION_UNMET',
        '你还有未处理完的活动或订单，请先处理后再提交',
        { blockers })
    }

    // 幂等：已有未完成的同类事项时返回既有记录
    const existed = await this.db.collection('grouporder-privacy-case')
      .where({ target_uid: uid, case_type: caseType, status: this.dbCmd.in([1, 2, 3]) })
      .orderBy('create_date', 'desc').limit(1).get()
    if (existed.data && existed.data.length) {
      const c = existed.data[0]
      return ok({ case_id: c._id, case_no: c.case_no, status: c.status, duplicated: true })
    }

    const caseNo = idempotent.buildBizNo('PRV', ctx.now)
    const res = await this.db.collection('grouporder-privacy-case').add({
      case_no: caseNo,
      case_type: caseType,
      target_uid: uid,
      status: 1,
      restricted: 0,
      operator_uid: uid,
      create_date: ctx.now
    })
    return ok({ case_id: res.id, case_no: caseNo, status: 1, duplicated: false })
  },

  /**
   * 查看本人的注销 / 删除 / 匿名化事项进度（M-08）
   * 与 appealMyList 对称：只回状态与执行结果摘要，不回运营内部字段。
   */
  async privacyRequestMyList (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date']
    })

    const coll = this.db.collection('grouporder-privacy-case').where({ target_uid: uid })
    const [listRes, countRes] = await Promise.all([
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])
    const list = (listRes.data || []).map(c => ({
      _id: c._id,
      case_no: c.case_no,
      case_type: c.case_type,
      status: c.status,
      restricted: c.restricted || 0,
      // 三年期限只读，运营不能延长缩短，用户侧同样只看不改
      retention_start: c.retention_start || null,
      retention_expire: c.retention_expire || null,
      execute_time: c.execute_time || null,
      create_date: c.create_date
    }))
    return ok(paging.wrap(list, countRes.total, ctx.now))
  },

  // ==========================================================================
  // 待办（M-27）
  // 派生视图，不建待办表（D-062）：实时聚合活动/订单/举报/申诉四类状态。
  // 云对象内 this 只能调到 _ 开头的方法，本对象内部复用走 _todoList。
  // ==========================================================================

  todoList () {
    return this._todoList()
  },

  async _todoList () {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const soon = ctx.now + DAY_MS

    const [dismissed, leadActs, myOrders, myReports, myAppeals] = await Promise.all([
      // 已关闭的待办与团长活动只增不减，分批读完：固定上限会让旧待办重新冒出、新活动的待办丢失
      paging.fetchAll(() => this.db.collection('grouporder-todo-dismiss').where({ user_id: uid })
        .field({ todo_key: true }).orderBy('_id', 'asc')),
      paging.fetchAll(() => this.db.collection('grouporder-activity')
        .where({ leader_uid: uid, status: this.dbCmd.neq(ACTIVITY.CANCELLED) })
        .field({ _id: true, title: true, status: true, governance_status: true,
                 review_result: true, review_reason: true, end_time: true, actual_end_time: true,
                 create_date: true, publish_date: true })
        .orderBy('_id', 'asc')),
      // 本人有效订单分批读完：历史订单只增不减，固定上限会漏掉新参与的活动
      paging.fetchAll(() => this.db.collection('grouporder-order')
        .where({ user_id: uid, status: ORDER.VALID })
        .field({ _id: true, activity_id: true })
        .orderBy('_id', 'asc')),
      this.db.collection('grouporder-report')
        .where({ reporter_uid: uid, status: this.dbCmd.in([3, 5]) })
        .field({ _id: true, report_no: true, status: true, close_time: true })
        .limit(50).get(),
      this.db.collection('grouporder-bind-appeal')
        .where({ applicant_uid: uid, status: this.dbCmd.in([3, 4]) })
        .field({ _id: true, appeal_no: true, status: true, handle_time: true })
        .limit(50).get()
    ])

    const dismissedKeys = new Set(dismissed.map(d => d.todo_key))
    const items = []
    const push = (meta, objectId, title, desc, extra) => {
      const key = `${meta.key}:${objectId}`
      if (dismissedKeys.has(key)) return
      items.push(Object.assign({
        todo_key: key,
        type: meta.key,
        level: meta.level,
        object_id: objectId,
        title,
        description: desc || '',
        create_date: (extra && extra.time) || ctx.now
      }, extra || {}))
    }

    // 团长侧
    for (const a of leadActs) {
      if (a.governance_status === GOVERNANCE.OFF) {
        push(TODO.ACTIVITY_OFFLINE, a._id, a.title, '活动已被平台下架')
      }
      if (a.status === ACTIVITY.DRAFT && a.review_result === REVIEW_RESULT.REJECT) {
        push(TODO.REVIEW_REJECTED, a._id, a.title, a.review_reason || '发布审核不通过')
      }
      if (a.status === ACTIVITY.ONGOING && a.end_time > ctx.now && a.end_time <= soon) {
        push(TODO.ENDING_SOON_LEADER, a._id, a.title, '活动将在 24 小时内截止', { time: a.end_time })
      }
      if (a.status === ACTIVITY.DRAFT && a.review_result !== REVIEW_RESULT.REJECT) {
        push(TODO.DRAFT, a._id, a.title || '未命名草稿', a.publish_date ? '活动已撤回为草稿，修改后可重新提交审核' : '草稿还没发布，继续编辑后提交审核', { time: a.create_date })
      }
    }

    // 已结束但还有未收款 / 未取货（D-134）：只看近 CLOSED_PENDING_DAYS 天结束的活动，
    // 且团长在该场至少标记过一单（说明在用收款 / 取货记录，D-100），没用这个功能的团长不打扰
    const recentClosed = leadActs.filter(a => a.status === ACTIVITY.CLOSED &&
      (a.actual_end_time || a.end_time || 0) >= ctx.now - CLOSED_PENDING_DAYS * DAY_MS)
    if (recentClosed.length) {
      const actMap = new Map(recentClosed.map(a => [a._id, a]))
      for (const part of paging.chunk(recentClosed.map(a => a._id), 100)) {
        const agg = await this.db.collection('grouporder-order').aggregate()
          .match({ activity_id: this.dbCmd.in(part), status: ORDER.VALID })
          .group({ _id: '$activity_id', total: { $sum: 1 }, paid: { $sum: '$leader_paid' }, delivered: { $sum: '$leader_delivered' } })
          .limit(paging.AGG_LIMIT)
          .end()
        for (const r of (agg.data || [])) {
          const paid = r.paid || 0
          const delivered = r.delivered || 0
          const unpaid = r.total - paid
          const undelivered = r.total - delivered
          if (paid + delivered === 0 || (unpaid <= 0 && undelivered <= 0)) continue
          const a = actMap.get(r._id)
          const parts = []
          if (unpaid > 0) parts.push(`${unpaid} 单未收款`)
          if (undelivered > 0) parts.push(`${undelivered} 单未取货`)
          push(TODO.CLOSED_PENDING, r._id, a.title, '活动已结束，还有 ' + parts.join('、'), {
            time: a.actual_end_time || a.end_time,
            // 点开时预选的子 tab：先处理收款
            mark: unpaid > 0 ? 'unpaid' : 'undelivered'
          })
        }
      }
    }

    // 参与者侧：按本人有效订单所在的活动
    const joinedIds = [...new Set(myOrders.map(o => o.activity_id))]
    if (joinedIds.length) {
      const joined = await paging.fetchAllByIds(joinedIds, ids =>
        this.db.collection('grouporder-activity')
          .where({ _id: this.dbCmd.in(ids) })
          .field({ _id: true, title: true, status: true, governance_status: true,
                   end_time: true, cancel_reason: true, leader_uid: true })
          .orderBy('_id', 'asc'))
      for (const a of joined) {
        if (a.leader_uid === uid) continue  // 团长侧已经出过条目，不重复
        if (a.status === ACTIVITY.CANCELLED) {
          push(TODO.JOINED_CANCELLED, a._id, a.title, a.cancel_reason || '活动已被团长取消')
        } else if (a.governance_status === GOVERNANCE.OFF) {
          push(TODO.JOINED_OFFLINE, a._id, a.title, '你参与的活动已被平台下架')
        } else if (a.status === ACTIVITY.ONGOING && a.end_time > ctx.now && a.end_time <= soon) {
          push(TODO.ENDING_SOON_JOINER, a._id, a.title, '活动将在 24 小时内截止', { time: a.end_time })
        }
      }
    }

    // 举报与申诉有结果
    for (const r of (myReports.data || [])) {
      push(TODO.REPORT_RESULT, r.report_no, '举报有处理结果', '', { time: r.close_time || ctx.now })
    }
    for (const a of (myAppeals.data || [])) {
      push(TODO.APPEAL_RESULT, a.appeal_no, '账号申诉有处理结果', '', { time: a.handle_time || ctx.now })
    }

    // 按四档优先级排序，同档按时间正序（先到先处理）
    items.sort((x, y) => x.level - y.level || x.create_date - y.create_date)

    const byLevel = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const it of items) byLevel[it.level]++

    return ok({
      list: items,
      total: items.length,
      count_by_level: byLevel,
      asOf: ctx.now
    })
  },

  /**
   * 关闭一条待办（M-27）
   * 写 grouporder-todo-dismiss，(user_id, todo_key) 唯一索引保证重复关闭幂等。
   */
  async todoDismiss (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const key = String(params.todo_key || '').trim()
    assertParam(key, '缺少待办标识')

    const doc = await idempotent.runOnce(ctx, {
      collection: 'grouporder-todo-dismiss',
      // 唯一索引是 (user_id, todo_key)，两列都要进查询条件：
      // 同一条待办（如「24 小时内截止」）会同时出现在多个用户的列表里，
      // 只按 todo_key 判重会让第二个用户关不掉自己的待办
      keyQuery: { user_id: uid, todo_key: key },
      create: async () => {
        const res = await this.db.collection('grouporder-todo-dismiss').add({
          user_id: uid,
          todo_key: key,
          dismiss_time: ctx.now
        })
        return { _id: res.id, todo_key: key }
      }
    })
    return ok({ todo_key: doc.todo_key || key, dismissed: true })
  },

  /**
   * 个人中心概览（M-08）
   * 聚合入口数量角标，只读。
   */
  async meOverview () {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)

    const [lead, joinedOrders, addrCount, libCount, todo, member] = await Promise.all([
      this.db.collection('grouporder-activity')
        .where({ leader_uid: uid }).count(),
      this.db.collection('grouporder-order')
        .where({ user_id: uid, status: ORDER.VALID }).count(),
      this.db.collection('grouporder-address')
        .where({ user_id: uid, deleted: 0 }).count(),
      this.db.collection('grouporder-goods-lib')
        .where({ user_id: uid, deleted: 0 }).count(),
      this._todoList(),
      membership.getMember(ctx, uid)
    ])

    const ongoing = await this.db.collection('grouporder-activity')
      .where({ leader_uid: uid, status: ACTIVITY.ONGOING }).count()

    return ok({
      user_id: uid,
      lead_activity_count: lead.total || 0,
      lead_ongoing_count: ongoing.total || 0,
      joined_order_count: joinedOrders.total || 0,
      address_count: addrCount.total || 0,
      goods_lib_count: libCount.total || 0,
      todo_count: todo.data ? todo.data.total : 0,
      // 会员身份（D-106 预留）：首版前端不展示，会员上线后用于「我的」顶部
      member: { is_member: member.is_member, expire: member.expire },
      asOf: ctx.now
    })
  },

  /**
   * 团长名片（M-08 → 团长名片，D-103 / D-109）
   * 账号级，显示在本人发起的所有活动页与参与者订单详情；未填的项为空串 / null。
   * 从未保存过名片（has_card = false）时附带账号昵称与头像（account_*），供设置页预填。
   */
  async leaderContactGet () {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const card = await leadercontact.getOwn(ctx, uid)
    if (!card.has_card) {
      const { data } = await this.db.collection('uni-id-users')
        .where({ _id: uid })
        .field({ nickname: true, username: true, avatar_file: true })
        .limit(1).get()
      const u = (data && data[0]) || {}
      card.account_nickname = u.nickname || u.username || ''
      card.account_avatar = u.avatar_file && u.avatar_file.url ? u.avatar_file : null
    }
    return ok(Object.assign(card, { asOf: ctx.now }))
  },

  /**
   * 保存团长名片（D-103 / D-109）：{ nickname?, avatar?, mobile?, wechat? }，空串 / null 即清除该项。
   * 电话、微信号只接受号码与微信号格式；昵称同步文本检测，不通过拒绝保存；头像写库后送图片检测。
   */
  async leaderContactSet (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const card = await leadercontact.set(ctx, uid, leadercontact.normalize(params))
    return ok(Object.assign(card, { asOf: ctx.now }))
  }
}
