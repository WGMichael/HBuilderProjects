/**
 * grouporder-ops-co · 运营后台全部业务方法
 * 服务对象：admin
 * 契约：docs/arch/CLOUD_API.md §10、§11
 *
 * 全对象遵守四条：
 * ① 不脱敏，返回完整姓名/电话/地址（D-072）；
 * ② 每次查询与导出都写审计，【成功与拒绝都写】（OPS §13、红线⑨）；
 * ③ 超管按权限点判断即可，无超管特例分支（D-076）；
 * ④ 运营不得代替团长经营（OPS §2.2）——本对象没有任何创建/修改活动、
 *    商品、订单、库存、价格、统计的方法。
 *
 * ⚠ 依赖 xlsx（SheetJS），用于检索结果与统计导出。部署前需 npm install。
 */
const XLSX = require('xlsx')
const {
  auth, errors, paging, idempotent, state, oplog, exportlog,
  config, goodslib, restriction, contentcheck
} = require('grouporder-common')

const { throwOps, throwBiz, assertParam, ok } = errors
const { ACTIVITY, GOVERNANCE, ORDER, REVIEW_RESULT, REVIEW_MODE } = state
const ACTION = oplog.ACTION

const REPORT_STATUS = { PENDING: 1, HANDLING: 2, CLOSED: 3, RECHECKING: 4, RECHECKED: 5 }
const APPEAL_STATUS = { PENDING: 1, HANDLING: 2, SUCCESS: 3, FAILED: 4 }
const PRIVACY_STATUS = { REGISTERED: 1, RESTRICTED: 2, EXPIRED: 3, DONE: 4, FAILED: 5 }

module.exports = {
  async _before () {
    this.ctx = await auth.createContext(this, { admin: true })
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

  /**
   * 权限校验 + 拒绝留痕。
   * 鉴权以【提交时刻】的账号状态与权限为准，不依赖进入页面时的结果（OPS §3.1）。
   * deniedAction 为空表示该动作在 §10.8 没有对应的拒绝类型，此时只拒绝不写日志。
   */
  async _perm (permissionId, opts = {}) {
    try {
      auth.requirePermission(this.ctx, permissionId)
    } catch (e) {
      if (opts.deniedAction) {
        await oplog.denied(this.ctx, {
          action_type: opts.deniedAction,
          object_type: opts.objectType || '',
          object_id: opts.objectId || '',
          reason: `权限不足：需要 ${permissionId}`,
          prev_state: null,
          next_state: null
        })
      }
      throw e
    }
  },

  async _mustGet (collection, id, label) {
    assertParam(id, `缺少${label}标识`)
    const { data } = await this.db.collection(collection).doc(id).get()
    const doc = data && data[0]
    if (!doc) throwOps('NOT_FOUND', `${label}不存在或已删除`)
    return doc
  },

  /** 后台通用列表查询 */
  async _query (collection, where, p) {
    const coll = this.db.collection(collection).where(where)
    const [listRes, countRes] = await Promise.all([
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])
    return { list: listRes.data || [], total: countRes.total || 0 }
  },

  /** 把时间范围筛选转成 where 片段；起止非法时阻止查询并指出问题（OPS §12.2） */
  _dateRange (filters, field) {
    const { start_date: s, end_date: e } = filters || {}
    if (!s && !e) return null
    if (s && e) assertParam(s <= e, '开始日期不能晚于结束日期', { start_date: s, end_date: e })
    const cmd = this.dbCmd
    if (s && e) return { [field]: cmd.gte(s).and(cmd.lte(e)) }
    if (s) return { [field]: cmd.gte(s) }
    return { [field]: cmd.lte(e) }
  },

  /** 导出：生成 xlsx 并换取临时地址。地址只回本次请求，不落库不进日志 */
  async _exportRows (sheetName, header, rows, cloudPathPrefix) {
    const cell = v => ({ t: 's', v: v === null || v === undefined ? '' : String(v) })
    const aoa = [header.map(cell)].concat(rows.map(r => r.map(cell)))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName)
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const upload = await uniCloud.uploadFile({
      cloudPath: `${cloudPathPrefix}/${this.ctx.now}.xlsx`,
      fileContent: buffer
    })
    const granted = await exportlog.grantTempUrl(upload.fileID)
    return { url: granted.url, expires_in: granted.expiresIn, row_count: rows.length }
  },

  _money (cents) {
    const n = Number(cents) || 0
    const sign = n < 0 ? '-' : ''
    const abs = Math.abs(n)
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  },

  // ==========================================================================
  // 批 A · 治理主链路
  // ==========================================================================

  /**
   * 活动详情 + 商品（A-07）
   * 双状态独立字段：业务状态与治理状态分列展示，不合并。
   */
  async activityDetail (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-activity', {
      deniedAction: ACTION.ACTIVITY_DETAIL_DENIED,
      objectType: 'activity',
      objectId: params.activity_id
    })
    const activity = await this._mustGet('grouporder-activity', params.activity_id, '活动')

    const [goodsRes, orderCount, itemAgg, reportRes, checkRes] = await Promise.all([
      this.db.collection('grouporder-goods').where({ activity_id: activity._id })
        .orderBy('sort', 'asc').orderBy('create_date', 'asc').limit(60).get(),
      this.db.collection('grouporder-order')
        .where({ activity_id: activity._id, status: ORDER.VALID }).count(),
      this.db.collection('grouporder-order-item').aggregate()
        .match({ activity_id: activity._id, status: ORDER.VALID })
        .group({ _id: null, qty: { $sum: '$qty' }, amount: { $sum: '$amount' } }).end(),
      this.db.collection('grouporder-report').where({ activity_id: activity._id })
        .orderBy('create_date', 'desc').limit(20).get(),
      this.db.collection('grouporder-content-check')
        .where({ object_type: 'activity', object_id: activity._id })
        .orderBy('create_date', 'desc').limit(20).get()
    ])
    const agg = (itemAgg.data && itemAgg.data[0]) || { qty: 0, amount: 0 }

    // 查看即留痕
    await oplog.success(ctx, {
      action_type: ACTION.ACTIVITY_DETAIL_VIEW,
      object_type: 'activity',
      object_id: activity._id,
      reason: '查看活动详情',
      prev_state: null,
      next_state: null
    })

    return ok({
      activity: {
        _id: activity._id,
        title: activity.title,
        description: activity.description || '',
        cover_image: activity.cover_image,
        images: activity.images || [],
        short_code: activity.short_code,
        delivery_type: activity.delivery_type,
        leader_uid: activity.leader_uid,
        // 业务状态
        status: activity.status,
        publish_date: activity.publish_date || null,
        end_time: activity.end_time,
        actual_end_time: activity.actual_end_time || null,
        cancel_reason: activity.cancel_reason || '',
        // 审核
        review_mode: activity.review_mode || null,
        review_result: activity.review_result || 0,
        review_uid: activity.review_uid || '',
        review_reason: activity.review_reason || '',
        content_version: activity.content_version,
        // 治理状态，与业务状态分列
        governance_status: activity.governance_status,
        governance_uid: activity.governance_uid || '',
        governance_time: activity.governance_time || null,
        governance_type: activity.governance_type || '',
        governance_reason: activity.governance_reason || '',
        ever_governed: activity.ever_governed || 0,
        text_check_status: activity.text_check_status || 0,
        img_check_status: activity.img_check_status || 0,
        create_date: activity.create_date,
        retention_expire_date: activity.retention_expire_date || null
      },
      goods: (goodsRes.data || []).map(g => ({
        _id: g._id,
        name: g.name,
        description: g.description || '',
        cover_image: g.cover_image,
        detail_images: g.detail_images || [],
        price: g.price,
        unit: g.unit,
        total_stock: g.total_stock,
        sold_qty: g.sold_qty,
        per_user_limit: g.per_user_limit,
        lib_id: g.lib_id || '',
        // 团长停售与平台下架分开展示
        on_sale: g.on_sale,
        governance_status: g.governance_status,
        governance_reason: g.governance_reason || '',
        ever_ordered: g.ever_ordered,
        img_check_status: g.img_check_status || 0
      })),
      stat: {
        valid_order_count: orderCount.total || 0,
        valid_total_qty: agg.qty || 0,
        estimated_amount: agg.amount || 0
      },
      reports: (reportRes.data || []).map(r => ({
        _id: r._id, report_no: r.report_no, status: r.status,
        reason_type: r.reason_type, conclusion: r.conclusion || null, create_date: r.create_date
      })),
      content_checks: (checkRes.data || []).map(c => ({
        _id: c._id, content_type: c.content_type, content_version: c.content_version,
        check_result: c.check_result, status: c.status, hit_reason: c.hit_reason || '',
        check_time: c.check_time
      })),
      asOf: ctx.now
    })
  },

  /**
   * 治理下架的共同实现（A-09）。
   * 活动与商品的校验、留痕与联动规则不同，因此公开方法拆成两个，
   * 共同部分下沉到这里，避免两份实现漂移。
   */
  async _governanceOff (objectType, params) {
    const ctx = this.ctx
    const isGoods = objectType === 'goods'
    const actionType = isGoods ? ACTION.GOODS_GOVERNANCE_OFF : ACTION.ACTIVITY_GOVERNANCE_OFF

    await this._perm('ops-content-activity', {
      deniedAction: ACTION.GOVERNANCE_FAILED,
      objectType,
      objectId: params.object_id
    })

    const violationType = String(params.violation_type || '').trim()
    const reason = String(params.reason || '').trim()
    if (!violationType || !reason) {
      await oplog.denied(ctx, {
        action_type: ACTION.GOVERNANCE_FAILED,
        object_type: objectType,
        object_id: params.object_id || '',
        case_no: params.case_no || '',
        reason: '违规类型与原因必填',
        prev_state: null,
        next_state: null
      })
      throwOps('INVALID_PARAM', '违规类型与下架原因必填')
    }

    const collection = isGoods ? 'grouporder-goods' : 'grouporder-activity'
    const target = await this._mustGet(collection, params.object_id, isGoods ? '商品' : '活动')

    if (target.governance_status === GOVERNANCE.OFF) {
      // 重复处置不重复生效，返回当前结果（OPS §12.2）
      return ok({ object_type: objectType, object_id: target._id, governance_status: GOVERNANCE.OFF, changed: false })
    }

    const activity = isGoods
      ? await this._mustGet('grouporder-activity', target.activity_id, '活动')
      : target

    const patch = {
      governance_status: GOVERNANCE.OFF,
      governance_uid: ctx.uid,
      governance_time: ctx.now,
      governance_reason: reason
    }
    if (!isGoods) {
      // governance_type 与 ever_governed 只有活动表有
      patch.governance_type = violationType
      patch.ever_governed = 1   // 历史标记，置 1 后不回退
    }
    // 带条件更新，挡住并发下的重复处置
    const res = await this.db.collection(collection)
      .where({ _id: target._id, governance_status: GOVERNANCE.NORMAL })
      .update(patch)
    if (!res.updated) {
      return ok({ object_type: objectType, object_id: target._id, governance_status: GOVERNANCE.OFF, changed: false })
    }

    let blockedLibIds = []
    if (isGoods) {
      // 不做这一步，违规商品可从商品库无限复制到新活动，绕过治理（D-064）
      blockedLibIds = await goodslib.blockLibByGoods(ctx, target, activity.leader_uid, params.case_no)
    }

    await oplog.success(ctx, {
      action_type: actionType,
      object_type: objectType,
      object_id: target._id,
      case_no: params.case_no || '',
      reason,
      prev_state: { governance_status: GOVERNANCE.NORMAL },
      next_state: { governance_status: GOVERNANCE.OFF, violation_type: violationType }
    })

    const out = {
      object_type: objectType,
      object_id: target._id,
      governance_status: GOVERNANCE.OFF,
      changed: true
    }
    if (isGoods) out.blocked_lib_ids = blockedLibIds
    return ok(out)
  },

  /** 治理恢复的共同实现（A-09） */
  async _governanceOn (objectType, params) {
    const ctx = this.ctx
    const isGoods = objectType === 'goods'
    const actionType = isGoods ? ACTION.GOODS_GOVERNANCE_ON : ACTION.ACTIVITY_GOVERNANCE_ON

    await this._perm('ops-content-activity', {
      deniedAction: ACTION.GOVERNANCE_FAILED,
      objectType,
      objectId: params.object_id
    })

    const collection = isGoods ? 'grouporder-goods' : 'grouporder-activity'
    const target = await this._mustGet(collection, params.object_id, isGoods ? '商品' : '活动')
    if (target.governance_status === GOVERNANCE.NORMAL) {
      return ok({ object_type: objectType, object_id: target._id, governance_status: GOVERNANCE.NORMAL, changed: false })
    }

    const activity = isGoods
      ? await this._mustGet('grouporder-activity', target.activity_id, '活动')
      : target

    // 三种禁止情形（OPS §6.2）：一律拒绝并留痕
    let blockReason = ''
    if (activity.status === ACTIVITY.CANCELLED) blockReason = '团长已取消该活动，不能恢复为可参与状态'
    else if (activity.status === ACTIVITY.CLOSED) blockReason = '活动已截止，不能恢复为可参与状态'
    else if (activity.end_time && ctx.now >= activity.end_time) blockReason = '活动在下架期间已到达截止时间，按已截止处理'

    if (blockReason) {
      await oplog.denied(ctx, {
        action_type: ACTION.GOVERNANCE_FAILED,
        object_type: objectType,
        object_id: target._id,
        case_no: params.case_no || '',
        reason: blockReason,
        prev_state: { governance_status: GOVERNANCE.OFF },
        next_state: { governance_status: GOVERNANCE.OFF }
      })
      throwOps('TARGET_CLOSED', blockReason)
    }

    const res = await this.db.collection(collection)
      .where({ _id: target._id, governance_status: GOVERNANCE.OFF })
      .update({
        governance_status: GOVERNANCE.NORMAL,
        governance_uid: ctx.uid,
        governance_time: ctx.now,
        governance_reason: String(params.reason || '复核后恢复')
      })
    if (!res.updated) {
      return ok({ object_type: objectType, object_id: target._id, governance_status: GOVERNANCE.NORMAL, changed: false })
    }

    let released = []
    if (isGoods) {
      released = await goodslib.unblockLibByGoods(ctx, target, activity.leader_uid, params.case_no)
    }

    await oplog.success(ctx, {
      action_type: actionType,
      object_type: objectType,
      object_id: target._id,
      case_no: params.case_no || '',
      reason: String(params.reason || '复核后恢复'),
      prev_state: { governance_status: GOVERNANCE.OFF },
      next_state: { governance_status: GOVERNANCE.NORMAL }
    })

    const out = {
      object_type: objectType,
      object_id: target._id,
      governance_status: GOVERNANCE.NORMAL,
      changed: true
    }
    if (isGoods) out.released_lib_ids = released
    return ok(out)
  },

  /**
   * 整个活动治理下架（A-09）
   * 违规类型与原因必填；写 `governance_type` 与 `ever_governed`（历史标记，不回退）。
   * 下架后禁止新建订单或扩大已有订单数量，但
   * 【不改写业务状态，不删除订单、商品或历史快照】（OPS §6.1）。
   */
  async activityGovernanceOff (params = {}) {
    return this._governanceOff('activity', params)
  },

  /**
   * 单个商品治理下架（A-09）
   * 与活动下架分开的理由：商品下架须【同步反写发布者的商品库封禁】（D-064），
   * 且不写 `governance_type` / `ever_governed`（商品表没有这两个字段）。
   * 单商品下架只禁止新增或扩大该商品，其他正常商品继续参与。
   */
  async goodsGovernanceOff (params = {}) {
    return this._governanceOff('goods', params)
  },

  /**
   * 活动治理恢复（A-09）
   * 三种禁止情形必须拒绝：① 团长已取消；② 活动已截止；③ 下架期间到达截止时间。
   */
  async activityGovernanceOn (params = {}) {
    return this._governanceOn('activity', params)
  },

  /**
   * 商品治理恢复（A-09）
   * 一并把发布者商品库中对应记录的禁止复用标记置回正常（D-064、OPS §6.2）。
   */
  async goodsGovernanceOn (params = {}) {
    return this._governanceOn('goods', params)
  },

  /** 举报列表（A-08），5 状态 */
  async reportList (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-report')
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'asc' },
      allowOrderFields: ['create_date', 'close_time']
    })

    const where = {}
    if (p.filters.status) where.status = p.filters.status
    if (p.filters.report_no) where.report_no = String(p.filters.report_no)
    if (p.filters.activity_id) where.activity_id = p.filters.activity_id
    if (p.filters.publisher_uid) where.publisher_uid = p.filters.publisher_uid
    if (p.filters.handler_uid) where.handler_uid = p.filters.handler_uid
    const range = this._dateRange(p.filters, 'create_date')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-report', where, p)
    return ok(paging.wrap(list.map(r => ({
      _id: r._id,
      report_no: r.report_no,
      activity_id: r.activity_id,
      goods_id: r.goods_id || '',
      activity_title: (r.content_snapshot && r.content_snapshot.activity_title) || '',
      publisher_uid: r.publisher_uid,
      reporter_uid: r.reporter_uid,
      reason_type: r.reason_type,
      status: r.status,
      handler_uid: r.handler_uid || '',
      conclusion: r.conclusion || null,
      claim_time: r.claim_time || null,
      close_time: r.close_time || null,
      create_date: r.create_date
    })), total, ctx.now))
  },

  /**
   * 举报详情（A-08）
   * 只读：查看被举报内容快照、检测记录与历史处置，【不改变任何状态】。
   * 领取动作单独走 reportClaim，避免打开详情就占坑。
   */
  async reportDetail (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-report')
    const report = await this._mustGet('grouporder-report', params.report_id, '举报')

    const [related, reviews, checks, restrictions] = await Promise.all([
      this.db.collection('grouporder-report')
        .where({ activity_id: report.activity_id, _id: this.dbCmd.neq(report._id) })
        .orderBy('create_date', 'desc').limit(20).get(),
      this.db.collection('grouporder-report-review')
        .where({ report_id: report._id }).orderBy('create_date', 'desc').limit(20).get(),
      this.db.collection('grouporder-content-check')
        .where({ object_id: this.dbCmd.in([report.activity_id, report.goods_id || '__none__']) })
        .orderBy('create_date', 'desc').limit(20).get(),
      this.db.collection('grouporder-restriction')
        .where({ target_uid: report.publisher_uid })
        .orderBy('create_date', 'desc').limit(20).get()
    ])

    return ok({
      report,
      // 关联举报可关联查看，但不得删除、覆盖或静默合并原始记录
      related_reports: (related.data || []).map(r => ({
        _id: r._id, report_no: r.report_no, status: r.status,
        reason_type: r.reason_type, create_date: r.create_date
      })),
      reviews: reviews.data || [],
      content_checks: checks.data || [],
      publisher_restrictions: restrictions.data || [],
      asOf: ctx.now
    })
  },

  /**
   * 领取举报（A-08，OPS §5.1 第 3 步）
   * 写 handler_uid 与 claim_time，这是写操作，因此独立于 reportDetail。
   * 并发下以带条件更新保证只有一人领取成功。
   */
  async reportClaim (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-report', {
      deniedAction: ACTION.REPORT_CLAIM,
      objectType: 'report',
      objectId: params.report_id
    })
    const report = await this._mustGet('grouporder-report', params.report_id, '举报')

    if (report.status !== REPORT_STATUS.PENDING) {
      if (report.handler_uid === ctx.uid) {
        return ok({ report_id: report._id, status: report.status, handler_uid: report.handler_uid, changed: false })
      }
      await oplog.denied(ctx, {
        action_type: ACTION.REPORT_CLAIM,
        object_type: 'report',
        object_id: report._id,
        case_no: report.report_no,
        reason: '该举报已被他人领取或已结案',
        prev_state: { status: report.status, handler_uid: report.handler_uid || '' },
        next_state: { status: report.status, handler_uid: report.handler_uid || '' }
      })
      throwOps('STATE_CHANGED', '该举报已被他人领取或状态已变化')
    }

    const res = await this.db.collection('grouporder-report')
      .where({ _id: report._id, status: REPORT_STATUS.PENDING })
      .update({
        status: REPORT_STATUS.HANDLING,
        handler_uid: ctx.uid,
        claim_time: ctx.now
      })
    if (!res.updated) throwOps('STATE_CHANGED', '该举报已被他人领取')

    await oplog.success(ctx, {
      action_type: ACTION.REPORT_CLAIM,
      object_type: 'report',
      object_id: report._id,
      case_no: report.report_no,
      reason: '领取举报',
      prev_state: { status: REPORT_STATUS.PENDING, handler_uid: '' },
      next_state: { status: REPORT_STATUS.HANDLING, handler_uid: ctx.uid }
    })
    return ok({ report_id: report._id, status: REPORT_STATUS.HANDLING, handler_uid: ctx.uid, changed: true })
  },

  /**
   * 举报结论与结案（A-08）
   * 结论 6 选 1；理由必填。
   * ⚠ 本方法【只记录结论并结案，不自动执行处置】——下架走 activityGovernanceOff、
   *   发布限制走 publisherRestrict，两者都可带 case_no 关联本举报。
   *   OPS §5.1 只写到「审核成立后才能执行下架」，未规定是否自动联动，此处不自行裁决。
   */
  async reportConclude (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-report', {
      deniedAction: ACTION.REPORT_CONCLUDE,
      objectType: 'report',
      objectId: params.report_id
    })
    const report = await this._mustGet('grouporder-report', params.report_id, '举报')

    const conclusion = params.conclusion
    assertParam([1, 2, 3, 4, 5, 6].includes(conclusion), '请选择处理结论')
    const reason = String(params.conclusion_reason || '').trim()
    assertParam(reason, '结论理由必填')

    if (report.status === REPORT_STATUS.CLOSED) {
      // 已产生相同处置结果的重复提交返回当前结果，不重复执行
      return ok({
        report_id: report._id, status: report.status,
        conclusion: report.conclusion, changed: false
      })
    }
    if (report.status !== REPORT_STATUS.HANDLING) {
      throwOps('STATE_CHANGED', '请先领取该举报再提交结论')
    }
    if (report.handler_uid && report.handler_uid !== ctx.uid) {
      throwOps('FORBIDDEN', '该举报由其他运营处理中')
    }

    const res = await this.db.collection('grouporder-report')
      .where({ _id: report._id, status: REPORT_STATUS.HANDLING })
      .update({
        status: REPORT_STATUS.CLOSED,
        conclusion,
        conclusion_reason: reason,
        close_time: ctx.now
      })
    if (!res.updated) throwOps('STATE_CHANGED', '举报状态已被他人修改，请刷新后重试')

    await oplog.success(ctx, {
      action_type: ACTION.REPORT_CONCLUDE,
      object_type: 'report',
      object_id: report._id,
      case_no: report.report_no,
      reason,
      prev_state: { status: REPORT_STATUS.HANDLING, conclusion: report.conclusion || null },
      next_state: { status: REPORT_STATUS.CLOSED, conclusion }
    })
    await oplog.success(ctx, {
      action_type: ACTION.REPORT_CLOSE,
      object_type: 'report',
      object_id: report._id,
      case_no: report.report_no,
      reason: '结案',
      prev_state: { status: REPORT_STATUS.HANDLING },
      next_state: { status: REPORT_STATUS.CLOSED }
    })

    // 结论成立时提示还需执行的处置动作，由运营在对应页面完成
    const pending = []
    if (conclusion === 3) pending.push({ action: 'activityGovernanceOff', object_type: 'goods', hint: '请在活动详情中下架对应商品' })
    if (conclusion === 4) pending.push({ action: 'activityGovernanceOff', object_type: 'activity', hint: '请下架整个活动' })
    if (conclusion === 2) pending.push({ action: 'publisherRestrict', restriction_type: 1, hint: '请执行发布者警告' })
    if (conclusion === 5) pending.push({ action: 'publisherRestrict', restriction_type: 2, hint: '请执行临时限制发布' })
    if (conclusion === 6) pending.push({ action: 'publisherRestrict', restriction_type: 3, hint: '请执行永久限制发布' })

    return ok({
      report_id: report._id,
      report_no: report.report_no,
      status: REPORT_STATUS.CLOSED,
      conclusion,
      changed: true,
      pending_actions: pending
    })
  },

  /**
   * 举报复核（A-08）
   * 创建新的复核记录，【不覆盖原结论】；原举报、原结论与原操作日志继续保留。
   */
  async reportRecheck (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-report', {
      deniedAction: ACTION.REPORT_RECHECK,
      objectType: 'report',
      objectId: params.report_id
    })
    const report = await this._mustGet('grouporder-report', params.report_id, '举报')

    // 发起复核
    if (!params.review_conclusion) {
      if (report.status !== REPORT_STATUS.CLOSED) {
        throwOps('STATE_CHANGED', '只有已结案的举报才能发起复核')
      }
      const reviewNo = idempotent.buildBizNo('RVW', ctx.now)
      const res = await this.db.collection('grouporder-report-review').add({
        review_no: reviewNo,
        report_id: report._id,
        original_conclusion: report.conclusion,      // 原结论快照，不随原表变化
        original_reason: report.conclusion_reason || '',
        apply_uid: ctx.uid,
        apply_reason: String(params.apply_reason || ''),
        status: 1,
        create_date: ctx.now
      })
      await this.db.collection('grouporder-report')
        .doc(report._id).update({ status: REPORT_STATUS.RECHECKING })

      await oplog.success(ctx, {
        action_type: ACTION.REPORT_RECHECK,
        object_type: 'report',
        object_id: report._id,
        case_no: report.report_no,
        reason: String(params.apply_reason || '发起复核'),
        prev_state: { status: REPORT_STATUS.CLOSED },
        next_state: { status: REPORT_STATUS.RECHECKING, review_no: reviewNo }
      })
      return ok({ review_id: res.id, review_no: reviewNo, status: REPORT_STATUS.RECHECKING })
    }

    // 提交复核结论
    assertParam([1, 2, 3, 4, 5, 6].includes(params.review_conclusion), '请选择复核结论')
    const reviewReason = String(params.review_reason || '').trim()
    assertParam(reviewReason, '复核理由必填')

    const { data } = await this.db.collection('grouporder-report-review')
      .where({ report_id: report._id, status: 1 })
      .orderBy('create_date', 'desc').limit(1).get()
    const reviewDoc = data && data[0]
    if (!reviewDoc) throwOps('NOT_FOUND', '没有进行中的复核记录')

    await this.db.collection('grouporder-report-review').doc(reviewDoc._id).update({
      status: 2,
      reviewer_uid: ctx.uid,
      review_conclusion: params.review_conclusion,
      review_reason: reviewReason,
      review_time: ctx.now
    })
    await this.db.collection('grouporder-report')
      .doc(report._id).update({ status: REPORT_STATUS.RECHECKED })

    const changed = params.review_conclusion !== reviewDoc.original_conclusion
    await oplog.success(ctx, {
      action_type: changed ? ACTION.REPORT_RESULT_CHANGED : ACTION.REPORT_RECHECK,
      object_type: 'report',
      object_id: report._id,
      case_no: report.report_no,
      reason: reviewReason,
      // 原结论保留在复核记录里，此处只记状态迁移
      prev_state: { conclusion: reviewDoc.original_conclusion, status: REPORT_STATUS.RECHECKING },
      next_state: { review_conclusion: params.review_conclusion, status: REPORT_STATUS.RECHECKED }
    })

    return ok({
      review_id: reviewDoc._id,
      review_no: reviewDoc.review_no,
      status: REPORT_STATUS.RECHECKED,
      result_changed: changed
    })
  },

  /** 内容检测复核列表（A-08），4 状态 */
  async checkList (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-report', { deniedAction: ACTION.DETECT_VIEW })
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'asc' },
      allowOrderFields: ['create_date', 'check_time']
    })

    const where = {}
    if (p.filters.status) where.status = p.filters.status
    if (p.filters.object_type) where.object_type = p.filters.object_type
    if (p.filters.object_id) where.object_id = p.filters.object_id
    if (p.filters.check_result) where.check_result = p.filters.check_result
    const range = this._dateRange(p.filters, 'create_date')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-content-check', where, p)

    await oplog.success(ctx, {
      action_type: ACTION.DETECT_VIEW,
      object_type: 'content_check',
      object_id: '',
      reason: '查询内容检测记录',
      prev_state: null,
      next_state: null
    })
    return ok(paging.wrap(list, total, ctx.now))
  },

  /**
   * 内容检测复核与处置（A-08）
   * 复核看到的是【被检测时的内容版本】，不能用当前内容替换历史证据。
   */
  async checkHandle (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-report', {
      deniedAction: ACTION.DETECT_HANDLE,
      objectType: 'content_check',
      objectId: params.check_id
    })
    const record = await this._mustGet('grouporder-content-check', params.check_id, '检测记录')

    const nextStatus = params.status
    assertParam([contentcheck.STATUS.RELEASED, contentcheck.STATUS.KEPT, contentcheck.STATUS.HANDLED].includes(nextStatus),
      '复核结论只能是已放行、维持拦截或已处置')
    const reason = String(params.review_reason || '').trim()
    assertParam(reason, '复核理由必填')

    if (record.status !== contentcheck.STATUS.PENDING) {
      return ok({ check_id: record._id, status: record.status, changed: false })
    }

    await this.db.collection('grouporder-content-check').doc(record._id).update({
      status: nextStatus,
      reviewer_uid: ctx.uid,
      review_conclusion: String(params.review_conclusion || ''),
      review_reason: reason,
      review_time: ctx.now
    })

    await oplog.success(ctx, {
      action_type: nextStatus === contentcheck.STATUS.HANDLED ? ACTION.DETECT_HANDLE : ACTION.DETECT_RECHECK,
      object_type: 'content_check',
      object_id: record._id,
      reason,
      prev_state: { status: contentcheck.STATUS.PENDING },
      next_state: { status: nextStatus }
    })

    // 处置动作本身（下架）仍走 activityGovernanceOff，此处不越界执行
    return ok({ check_id: record._id, status: nextStatus, changed: true })
  },

  /**
   * 发布者处置（A-10）
   * 警告 / 临时 / 永久 / 解除。
   * 警告是处置记录，【不改变账号状态】；发布限制只作用于发起和发布活动。
   * 对已有活动是否下架必须逐个形成内容处置结论，不能通过限制发布者静默改变。
   */
  async publisherRestrict (params = {}) {
    const ctx = this.ctx
    const typeMap = {
      1: ACTION.PUBLISHER_WARN,
      2: ACTION.PUBLISHER_LIMIT_TEMP,
      3: ACTION.PUBLISHER_LIMIT_PERM,
      4: ACTION.PUBLISHER_LIMIT_RELEASE
    }
    const actionType = typeMap[params.restriction_type]
    assertParam(actionType, '处置类型不合法')

    await this._perm('ops-content-report', {
      deniedAction: actionType,
      objectType: 'user',
      objectId: params.target_uid
    })
    assertParam(params.target_uid, '缺少被处置的发布者')

    const result = await restriction.apply(ctx, {
      targetUid: params.target_uid,
      actionType: params.restriction_type,
      reason: params.reason,
      violationType: params.violation_type,
      effectiveFrom: params.effective_from,
      effectiveTo: params.effective_to,
      relatedReportId: params.related_report_id
    })

    await oplog.success(ctx, {
      action_type: actionType,
      object_type: 'user',
      object_id: params.target_uid,
      case_no: result.case_no || params.related_report_id || '',
      reason: String(params.reason || ''),
      prev_state: { publish_restriction: result.prev_status },
      next_state: { publish_restriction: result.next_status }
    })

    return ok(result)
  },

  // ==========================================================================
  // 批 B · 发布审核
  // ==========================================================================

  /**
   * 待审活动列表（A-17）
   * 队列来源由平台配置的审核模式决定（D-057）：
   * 人工模式下全部提交发布的活动进队列；自动模式下仅检测命中、需人工判断的进队列。
   */
  async reviewList (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-review')
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'review_submit_date', direction: 'asc' },
      allowOrderFields: ['review_submit_date', 'create_date']
    })

    const where = { status: ACTIVITY.REVIEWING }
    if (p.filters.leader_uid) where.leader_uid = p.filters.leader_uid
    if (p.filters.keyword) {
      where.title = new RegExp(String(p.filters.keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }
    if (p.filters.review_mode) where.review_mode = p.filters.review_mode
    const range = this._dateRange(p.filters, 'review_submit_date')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-activity', where, p)
    return ok(paging.wrap(list.map(a => ({
      _id: a._id,
      title: a.title,
      cover_image: a.cover_image,
      short_code: a.short_code,
      leader_uid: a.leader_uid,
      review_mode: a.review_mode || null,
      // 审核结论绑定提交时固化的内容版本
      content_version: a.content_version,
      review_submit_date: a.review_submit_date || null,
      text_check_status: a.text_check_status || 0,
      img_check_status: a.img_check_status || 0,
      governance_status: a.governance_status,
      end_time: a.end_time,
      create_date: a.create_date
    })), total, ctx.now))
  },

  /**
   * 待审活动详情（A-17）
   * 按【提交时固化的内容版本】展示；运营在审核页不得修改活动或商品的任何业务字段。
   */
  async reviewDetail (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-content-review')
    const activity = await this._mustGet('grouporder-activity', params.activity_id, '活动')

    const [goodsRes, checkRes] = await Promise.all([
      this.db.collection('grouporder-goods').where({ activity_id: activity._id })
        .orderBy('sort', 'asc').orderBy('create_date', 'asc').limit(60).get(),
      this.db.collection('grouporder-content-check')
        .where({ content_version: String(activity.content_version) })
        .orderBy('create_date', 'desc').limit(60).get()
    ])

    return ok({
      activity: {
        _id: activity._id,
        title: activity.title,
        description: activity.description || '',
        cover_image: activity.cover_image,
        images: activity.images || [],
        leader_uid: activity.leader_uid,
        delivery_type: activity.delivery_type,
        status: activity.status,
        review_mode: activity.review_mode || null,
        review_submit_date: activity.review_submit_date || null,
        content_version: activity.content_version,
        end_time: activity.end_time
      },
      goods: goodsRes.data || [],
      // 只展示与当前待审版本关联的检测记录
      content_checks: (checkRes.data || []).filter(c =>
        c.object_id === activity._id ||
        (goodsRes.data || []).some(g => g._id === c.object_id)
      ),
      asOf: ctx.now
    })
  },

  /**
   * 提交审核结论（A-17）
   * 通过 → 进行中并允许分享；不通过 → 退回草稿并向团长展示原因（原因必填）。
   * 审核结论绑定提交时固化的内容版本；团长期间再次编辑会产生新版本，
   * 运营不得用新版本内容替换正在审核版本的结论。
   */
  async reviewSubmit (params = {}) {
    const ctx = this.ctx
    const pass = params.pass === true
    await this._perm('ops-content-review', {
      deniedAction: ACTION.ACTIVITY_REVIEW_FAILED,
      objectType: 'activity',
      objectId: params.activity_id
    })

    const activity = await this._mustGet('grouporder-activity', params.activity_id, '活动')
    const reason = String(params.reason || '').trim()
    if (!pass) assertParam(reason, '审核不通过必须填写原因')

    const fail = async (msg) => {
      await oplog.denied(ctx, {
        action_type: ACTION.ACTIVITY_REVIEW_FAILED,
        object_type: 'activity',
        object_id: activity._id,
        reason: msg,
        prev_state: { status: activity.status, content_version: activity.content_version },
        next_state: { status: activity.status, content_version: activity.content_version }
      })
      throwOps('STATE_CHANGED', msg)
    }

    if (activity.status !== ACTIVITY.REVIEWING) await fail('该活动不在审核中，可能已被撤回或已处理')
    // 审核期间团长再次编辑会递增版本，结论必须绑定提交时的版本
    if (params.content_version !== undefined && params.content_version !== activity.content_version) {
      await fail('活动内容已更新，请重新打开最新版本再审核')
    }
    // 审核中到达截止时间直接进已截止，之后即使审核通过也不重开
    if (activity.end_time && ctx.now >= activity.end_time) {
      await this.db.collection('grouporder-activity').doc(activity._id).update({
        status: ACTIVITY.CLOSED,
        actual_end_time: activity.end_time,
        end_type: state.END_TYPE.AUTO
      })
      await fail('活动在审核期间已到达截止时间，按已截止处理')
    }

    const patch = {
      review_uid: ctx.uid,
      review_time: ctx.now,
      review_reason: reason
    }
    if (pass) {
      patch.status = ACTIVITY.ONGOING
      patch.review_result = REVIEW_RESULT.PASS
      if (!activity.publish_date) patch.publish_date = ctx.now
    } else {
      patch.status = ACTIVITY.DRAFT
      patch.review_result = REVIEW_RESULT.REJECT
    }

    const res = await this.db.collection('grouporder-activity')
      .where({ _id: activity._id, status: ACTIVITY.REVIEWING, content_version: activity.content_version })
      .update(patch)
    if (!res.updated) await fail('活动状态或内容版本已变化，请刷新后重试')

    await oplog.success(ctx, {
      action_type: pass ? ACTION.ACTIVITY_REVIEW_PASS : ACTION.ACTIVITY_REVIEW_REJECT,
      object_type: 'activity',
      object_id: activity._id,
      reason,
      prev_state: { status: ACTIVITY.REVIEWING, content_version: activity.content_version },
      next_state: { status: patch.status, review_result: patch.review_result, content_version: activity.content_version }
    })

    return ok({ activity_id: activity._id, status: patch.status, review_result: patch.review_result })
  },

  /** 平台配置读取（A-18） */
  async configGet (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-sys-config')
    const key = params.config_key || config.KEY_REVIEW_MODE
    const doc = await config.get(ctx, key)
    return ok({
      config_key: key,
      config_value: doc ? doc.config_value : { mode: REVIEW_MODE.AUTO },
      description: doc ? (doc.description || '') : '',
      update_uid: doc ? (doc.update_uid || '') : '',
      update_date: doc ? (doc.update_date || null) : null,
      exists: !!doc,
      asOf: ctx.now
    })
  },

  /**
   * 平台配置修改（A-18）
   * 【只影响之后新提交的审核】（D-057）——已在审核中的活动沿用提交时固化的模式。
   * 记前后值写入审计。
   */
  async configSet (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-sys-config', {
      deniedAction: ACTION.CONFIG_CHANGED,
      objectType: 'config',
      objectId: params.config_key || config.KEY_REVIEW_MODE
    })

    const key = params.config_key || config.KEY_REVIEW_MODE
    assertParam(params.config_value && typeof params.config_value === 'object', '配置值不合法')
    if (key === config.KEY_REVIEW_MODE) {
      assertParam(
        params.config_value.mode === REVIEW_MODE.AUTO || params.config_value.mode === REVIEW_MODE.MANUAL,
        '发布审核模式只能是自动或人工'
      )
    }

    const change = await config.set(ctx, key, params.config_value, params.description)
    await oplog.success(ctx, {
      action_type: ACTION.CONFIG_CHANGED,
      object_type: 'config',
      object_id: key,
      reason: String(params.reason || '修改平台配置'),
      prev_state: change.prev_state,
      next_state: change.next_state
    })
    return ok({ config_key: key, prev: change.prev_state, next: change.next_state })
  },

  // ==========================================================================
  // 批 C · 检索与统计
  // 不脱敏（D-072），每次查询与导出都写审计（红线⑨）。
  // ==========================================================================

  /**
   * 订单检索（A-04）
   * 返回【完整明文】姓名、电话、地址；自提活动没有地址。
   * 成功写 order_detail_view，拒绝写 order_detail_denied。
   */
  async searchOrders (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-search', { deniedAction: ACTION.ORDER_DETAIL_DENIED, objectType: 'order' })
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date', 'total_amount', 'total_qty']
    })

    const where = {}
    // 按稳定的内部标识查询，不能仅依赖昵称或收货人姓名识别（OPS §4.5）
    if (p.filters.order_no) where.order_no = String(p.filters.order_no)
    if (p.filters.activity_id) where.activity_id = p.filters.activity_id
    if (p.filters.user_id) where.user_id = p.filters.user_id
    if (p.filters.status) where.status = p.filters.status
    if (p.filters.consignee_mobile) where.consignee_mobile = String(p.filters.consignee_mobile)
    const range = this._dateRange(p.filters, 'create_date')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-order', where, p)

    let actMap = new Map()
    if (list.length) {
      const ids = [...new Set(list.map(o => o.activity_id))]
      const { data } = await this.db.collection('grouporder-activity')
        .where({ _id: this.dbCmd.in(ids) })
        .field({ _id: true, title: true, delivery_type: true, leader_uid: true, short_code: true })
        .limit(ids.length).get()
      actMap = new Map((data || []).map(a => [a._id, a]))
    }

    await oplog.success(ctx, {
      action_type: ACTION.ORDER_DETAIL_VIEW,
      object_type: 'order',
      object_id: p.filters.order_no || p.filters.activity_id || '(批量检索)',
      reason: `订单检索，命中 ${total} 条`,
      prev_state: null,
      next_state: null
    })

    return ok(paging.wrap(list.map(o => {
      const a = actMap.get(o.activity_id)
      return {
        _id: o._id,
        order_no: o.order_no,
        activity_id: o.activity_id,
        activity_title: a ? a.title : '',
        activity_short_code: a ? a.short_code : '',
        leader_uid: a ? a.leader_uid : '',
        delivery_type: a ? a.delivery_type : null,
        user_id: o.user_id,
        status: o.status,
        // 完整明文，不脱敏（D-072）
        consignee_name: o.consignee_name,
        consignee_mobile: o.consignee_mobile,
        consignee_address: o.consignee_address || '',
        buyer_remark: o.buyer_remark || '',
        total_qty: o.total_qty,
        total_amount: o.total_amount,
        create_date: o.create_date,
        cancel_time: o.cancel_time || null,
        void_time: o.void_time || null,
        void_reason: o.void_reason || '',
        retention_expire_date: o.retention_expire_date || null,
        anonymized: o.anonymized || 0
      }
    }), total, ctx.now))
  },

  /** 活动检索（A-04） */
  async searchActivities (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-search', { deniedAction: ACTION.ACTIVITY_DETAIL_DENIED, objectType: 'activity' })
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date', 'publish_date', 'end_time']
    })

    const where = {}
    if (p.filters.activity_id) where._id = p.filters.activity_id
    if (p.filters.short_code) where.short_code = String(p.filters.short_code).toUpperCase()
    if (p.filters.leader_uid) where.leader_uid = p.filters.leader_uid
    if (p.filters.status !== undefined && p.filters.status !== '') where.status = p.filters.status
    if (p.filters.governance_status !== undefined && p.filters.governance_status !== '') {
      where.governance_status = p.filters.governance_status
    }
    if (p.filters.keyword) {
      where.title = new RegExp(String(p.filters.keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }
    const range = this._dateRange(p.filters, p.filters.date_field === 'publish_date' ? 'publish_date' : 'create_date')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-activity', where, p)

    await oplog.success(ctx, {
      action_type: ACTION.ACTIVITY_DETAIL_VIEW,
      object_type: 'activity',
      object_id: p.filters.activity_id || '(批量检索)',
      reason: `活动检索，命中 ${total} 条`,
      prev_state: null,
      next_state: null
    })

    return ok(paging.wrap(list.map(a => ({
      _id: a._id,
      title: a.title,
      short_code: a.short_code,
      leader_uid: a.leader_uid,
      delivery_type: a.delivery_type,
      // 业务状态与治理状态分列，不合并
      status: a.status,
      governance_status: a.governance_status,
      ever_governed: a.ever_governed || 0,
      review_result: a.review_result || 0,
      publish_date: a.publish_date || null,
      end_time: a.end_time,
      actual_end_time: a.actual_end_time || null,
      create_date: a.create_date
    })), total, ctx.now))
  },

  /** 商品检索（A-04） */
  async searchGoods (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-search', { deniedAction: ACTION.GOODS_DETAIL_DENIED, objectType: 'goods' })
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date', 'sold_qty', 'price']
    })

    const where = {}
    if (p.filters.goods_id) where._id = p.filters.goods_id
    if (p.filters.activity_id) where.activity_id = p.filters.activity_id
    if (p.filters.governance_status !== undefined && p.filters.governance_status !== '') {
      where.governance_status = p.filters.governance_status
    }
    if (p.filters.on_sale !== undefined && p.filters.on_sale !== '') where.on_sale = p.filters.on_sale
    if (p.filters.keyword) {
      where.name = new RegExp(String(p.filters.keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }

    const { list, total } = await this._query('grouporder-goods', where, p)

    await oplog.success(ctx, {
      action_type: ACTION.GOODS_DETAIL_VIEW,
      object_type: 'goods',
      object_id: p.filters.goods_id || '(批量检索)',
      reason: `商品检索，命中 ${total} 条`,
      prev_state: null,
      next_state: null
    })
    return ok(paging.wrap(list, total, ctx.now))
  },

  /**
   * 用户检索（A-04）
   * 展示账号类型、微信绑定状态、发布限制状态及关联治理事项。
   * 密码等凭证字段一律不取。
   */
  async searchUsers (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-search', { deniedAction: ACTION.USER_DETAIL_DENIED, objectType: 'user' })
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'register_date', direction: 'desc' },
      allowOrderFields: ['register_date', 'last_login_date']
    })

    const where = {}
    if (p.filters.user_id) where._id = p.filters.user_id
    if (p.filters.username) where.username = String(p.filters.username)
    if (p.filters.nickname) {
      where.nickname = new RegExp(String(p.filters.nickname).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }

    const coll = this.db.collection('uni-id-users').where(where)
    const [listRes, countRes] = await Promise.all([
      coll.field({
        _id: true, username: true, nickname: true, avatar_file: true,
        status: true, register_date: true, last_login_date: true,
        wx_openid: true, role: true
      }).orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])
    const users = listRes.data || []

    let extMap = new Map()
    if (users.length) {
      const { data } = await this.db.collection('grouporder-user-ext')
        .where({ user_id: this.dbCmd.in(users.map(u => u._id)) })
        .limit(users.length).get()
      extMap = new Map((data || []).map(e => [e.user_id, e]))
    }

    await oplog.success(ctx, {
      action_type: ACTION.USER_DETAIL_VIEW,
      object_type: 'user',
      object_id: p.filters.user_id || '(批量检索)',
      reason: `用户检索，命中 ${countRes.total || 0} 条`,
      prev_state: null,
      next_state: null
    })

    return ok(paging.wrap(users.map(u => {
      const ext = extMap.get(u._id)
      const openid = u.wx_openid && (u.wx_openid.mp || u.wx_openid.app || u.wx_openid.h5)
      // 读取时若临时限制已到期即视为正常，不依赖定时任务准点执行
      let pr = ext ? (ext.publish_restriction || 0) : 0
      if (pr === 1 && ext && ext.restriction_expire && ctx.now >= ext.restriction_expire) pr = 0
      return {
        _id: u._id,
        username: u.username || '',
        nickname: u.nickname || '',
        status: u.status === undefined ? 0 : u.status,
        wechat_bound: !!openid,
        roles: u.role || [],
        register_date: u.register_date || null,
        last_login_date: u.last_login_date || null,
        publish_restriction: pr,
        restriction_expire: ext ? (ext.restriction_expire || null) : null,
        restriction_case_no: ext ? (ext.restriction_case_no || '') : ''
      }
    }), countRes.total, ctx.now))
  },

  /**
   * 导出检索结果（A-04）
   * D-072 起导出完全放开，但每次导出都写审计。
   */
  async exportSearchResult (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-search', { deniedAction: ACTION.EXPORT_DOWNLOAD, objectType: 'search' })
    const target = params.target || 'orders'
    assertParam(['orders', 'activities', 'goods', 'users'].includes(target), '导出对象不合法')

    // 导出取全量（上限 100 条/页 × 最多 50 页），不改变检索口径
    const query = Object.assign({}, params, { page: 1, pageSize: paging.MAX_PAGE_SIZE })
    const rows = []
    let header = []
    let sheetName = ''
    let total = 0

    const fetchAll = async (fn, mapRow) => {
      for (let page = 1; page <= 50; page++) {
        const res = await fn(Object.assign({}, query, { page }))
        if (res.errCode !== 0) throw Object.assign(new Error(res.errMsg), res)
        total = res.data.total
        for (const r of res.data.list) rows.push(mapRow(r))
        if (page * paging.MAX_PAGE_SIZE >= total) break
      }
    }

    if (target === 'orders') {
      sheetName = '订单检索结果'
      header = ['订单号', '活动', '活动短码', '状态', '收货人', '联系电话', '收货地址', '买家备注', '总份数', '预计金额(元)', '下单时间']
      await fetchAll(this.searchOrders.bind(this), o => [
        o.order_no, o.activity_title, o.activity_short_code, o.status,
        o.consignee_name, o.consignee_mobile, o.consignee_address, o.buyer_remark,
        o.total_qty, this._money(o.total_amount), new Date(o.create_date).toLocaleString('zh-CN')
      ])
    } else if (target === 'activities') {
      sheetName = '活动检索结果'
      header = ['活动标题', '短码', '团长', '业务状态', '治理状态', '曾被下架', '发布时间', '截止时间']
      await fetchAll(this.searchActivities.bind(this), a => [
        a.title, a.short_code, a.leader_uid, a.status, a.governance_status, a.ever_governed,
        a.publish_date ? new Date(a.publish_date).toLocaleString('zh-CN') : '',
        new Date(a.end_time).toLocaleString('zh-CN')
      ])
    } else if (target === 'goods') {
      sheetName = '商品检索结果'
      header = ['商品名称', '所属活动', '单价(元)', '单位', '总库存', '已购买份数', '在售', '治理状态']
      await fetchAll(this.searchGoods.bind(this), g => [
        g.name, g.activity_id, this._money(g.price), g.unit,
        g.total_stock === 0 ? '不限' : g.total_stock, g.sold_qty, g.on_sale, g.governance_status
      ])
    } else {
      sheetName = '用户检索结果'
      header = ['用户标识', '用户名', '昵称', '账号状态', '微信绑定', '发布限制', '注册时间']
      await fetchAll(this.searchUsers.bind(this), u => [
        u._id, u.username, u.nickname, u.status, u.wechat_bound ? '已绑定' : '未绑定',
        u.publish_restriction, u.register_date ? new Date(u.register_date).toLocaleString('zh-CN') : ''
      ])
    }

    const out = await this._exportRows(sheetName, header, rows, `grouporder/ops-export/${target}`)

    await oplog.success(ctx, {
      action_type: ACTION.EXPORT_DOWNLOAD,
      object_type: 'search',
      object_id: target,
      reason: `导出${sheetName}，共 ${rows.length} 行`,
      prev_state: null,
      next_state: null   // 地址不进日志（D-071③）
    })
    return ok(Object.assign({ target, total }, out, { asOf: ctx.now }))
  },

  /**
   * 团长汇总（A-05）
   * 指标白名单：已发布活动数、各业务状态活动数、当前已下架活动数、
   * 累计有效订单数、有效总份数、预计金额、最近发起时间。
   * 不得出现「实际销售量 / 销售额 / 实收金额」等名称（OPS §11.1）。
   * ops-stat-view 是独立权限点，默认关闭。
   */
  async statOverview (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-stat-view', { deniedAction: ACTION.STAT_DENIED, objectType: 'stat' })
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'publish_date', direction: 'desc' },
      allowOrderFields: ['publish_date', 'create_date']
    })

    const actWhere = {}
    if (p.filters.leader_uid) actWhere.leader_uid = p.filters.leader_uid
    // 活动范围默认按发布时间筛选（OPS §4.6）
    const range = this._dateRange(p.filters, 'publish_date')
    if (range) Object.assign(actWhere, range)

    const { data: activities } = await this.db.collection('grouporder-activity')
      .where(actWhere)
      .field({ _id: true, leader_uid: true, status: true, governance_status: true,
               ever_governed: true, publish_date: true, create_date: true })
      .limit(1000).get()

    const byLeader = new Map()
    for (const a of (activities || [])) {
      if (!byLeader.has(a.leader_uid)) {
        byLeader.set(a.leader_uid, {
          leader_uid: a.leader_uid,
          published_activity_count: 0,
          draft_count: 0, reviewing_count: 0, ongoing_count: 0, closed_count: 0, cancelled_count: 0,
          governance_off_count: 0, ever_governed_count: 0,
          valid_order_count: 0, valid_total_qty: 0, estimated_amount: 0,
          last_publish_date: null,
          _activity_ids: []
        })
      }
      const row = byLeader.get(a.leader_uid)
      row._activity_ids.push(a._id)
      // 已发布活动数以首次 publish_date 是否存在为准，草稿与从未通过审核的不计入
      if (a.publish_date) {
        row.published_activity_count++
        // 最近发起时间取最近一次成功发布的时间，不用草稿创建时间
        if (!row.last_publish_date || a.publish_date > row.last_publish_date) {
          row.last_publish_date = a.publish_date
        }
      }
      if (a.status === ACTIVITY.DRAFT) row.draft_count++
      else if (a.status === ACTIVITY.REVIEWING) row.reviewing_count++
      else if (a.status === ACTIVITY.ONGOING) row.ongoing_count++
      else if (a.status === ACTIVITY.CLOSED) row.closed_count++
      else if (a.status === ACTIVITY.CANCELLED) row.cancelled_count++
      if (a.governance_status === GOVERNANCE.OFF) row.governance_off_count++
      // 曾被下架是单独的历史标记，不与业务状态混为一类
      if (a.ever_governed === 1) row.ever_governed_count++
    }

    const allIds = (activities || []).map(a => a._id)
    if (allIds.length) {
      const [orderAgg, itemAgg] = await Promise.all([
        this.db.collection('grouporder-order').aggregate()
          .match({ activity_id: this.dbCmd.in(allIds), status: ORDER.VALID })
          .group({ _id: '$activity_id', cnt: { $sum: 1 } }).end(),
        this.db.collection('grouporder-order-item').aggregate()
          .match({ activity_id: this.dbCmd.in(allIds), status: ORDER.VALID })
          .group({ _id: '$activity_id', qty: { $sum: '$qty' }, amount: { $sum: '$amount' } }).end()
      ])
      const orderMap = new Map((orderAgg.data || []).map(r => [r._id, r.cnt]))
      const itemMap = new Map((itemAgg.data || []).map(r => [r._id, r]))
      for (const row of byLeader.values()) {
        for (const id of row._activity_ids) {
          row.valid_order_count += orderMap.get(id) || 0
          const it = itemMap.get(id)
          if (it) { row.valid_total_qty += it.qty; row.estimated_amount += it.amount }
        }
      }
    }

    const rows = [...byLeader.values()].map(r => { delete r._activity_ids; return r })
    rows.sort((a, b) => (b.last_publish_date || 0) - (a.last_publish_date || 0))
    const pageRows = rows.slice(p.skip, p.skip + p.pageSize)

    await oplog.success(ctx, {
      action_type: ACTION.STAT_QUERY,
      object_type: 'stat',
      object_id: p.filters.leader_uid || '(全部团长)',
      reason: `团长汇总查询，范围 ${p.filters.start_date || '不限'} ~ ${p.filters.end_date || '不限'}`,
      prev_state: null,
      next_state: null   // 日志中不复制收货信息
    })

    // asOf 为数据截至时间，统计类必须返回（OPS §12.2）
    return ok(paging.wrap(pageRows, rows.length, ctx.now))
  },

  /**
   * 下钻到活动与商品层（A-06）
   * 取消订单数与作废订单数单独展示，不并入有效指标。
   */
  async statActivityDrill (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-stat-view', { deniedAction: ACTION.STAT_DENIED, objectType: 'stat' })

    if (params.activity_id) {
      const activity = await this._mustGet('grouporder-activity', params.activity_id, '活动')
      const [valid, cancelled, voided, itemAgg, goodsAgg, reported] = await Promise.all([
        this.db.collection('grouporder-order').where({ activity_id: activity._id, status: ORDER.VALID }).count(),
        this.db.collection('grouporder-order').where({ activity_id: activity._id, status: ORDER.CANCELLED }).count(),
        this.db.collection('grouporder-order').where({ activity_id: activity._id, status: ORDER.VOIDED }).count(),
        this.db.collection('grouporder-order-item').aggregate()
          .match({ activity_id: activity._id, status: ORDER.VALID })
          .group({ _id: null, qty: { $sum: '$qty' }, amount: { $sum: '$amount' } }).end(),
        this.db.collection('grouporder-order-item').aggregate()
          .match({ activity_id: activity._id, status: ORDER.VALID })
          .group({ _id: '$goods_id', goods_name: { $first: '$goods_name' },
                   qty: { $sum: '$qty' }, amount: { $sum: '$amount' } }).end(),
        this.db.collection('grouporder-report').where({ activity_id: activity._id }).count()
      ])
      const agg = (itemAgg.data && itemAgg.data[0]) || { qty: 0, amount: 0 }

      await oplog.success(ctx, {
        action_type: ACTION.STAT_QUERY,
        object_type: 'activity',
        object_id: activity._id,
        reason: '活动统计下钻',
        prev_state: null,
        next_state: null
      })

      return ok({
        activity: {
          _id: activity._id, title: activity.title, short_code: activity.short_code,
          leader_uid: activity.leader_uid, status: activity.status,
          governance_status: activity.governance_status, ever_governed: activity.ever_governed || 0,
          publish_date: activity.publish_date || null, end_time: activity.end_time,
          // 已取消活动只能看取消前历史快照，明确标注仅供追溯
          history_snapshot_only: activity.status === ACTIVITY.CANCELLED
        },
        valid_order_count: valid.total || 0,
        cancelled_order_count: cancelled.total || 0,
        voided_order_count: voided.total || 0,
        valid_total_qty: agg.qty || 0,
        estimated_amount: agg.amount || 0,
        ever_reported: (reported.total || 0) > 0,
        goods_summary: (goodsAgg.data || []).map(g => ({
          goods_id: g._id, goods_name: g.goods_name,
          sold_qty: g.qty, estimated_amount: g.amount
        })),
        asOf: ctx.now
      })
    }

    // 未指定活动时，按团长列出其活动
    assertParam(params.leader_uid, '请指定团长或活动')
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'publish_date', direction: 'desc' },
      allowOrderFields: ['publish_date', 'create_date', 'end_time']
    })
    const where = { leader_uid: params.leader_uid }
    const range = this._dateRange(p.filters, 'publish_date')
    if (range) Object.assign(where, range)
    const { list, total } = await this._query('grouporder-activity', where, p)

    const ids = list.map(a => a._id)
    let orderMap = new Map()
    let itemMap = new Map()
    if (ids.length) {
      const [oa, ia] = await Promise.all([
        this.db.collection('grouporder-order').aggregate()
          .match({ activity_id: this.dbCmd.in(ids), status: ORDER.VALID })
          .group({ _id: '$activity_id', cnt: { $sum: 1 } }).end(),
        this.db.collection('grouporder-order-item').aggregate()
          .match({ activity_id: this.dbCmd.in(ids), status: ORDER.VALID })
          .group({ _id: '$activity_id', qty: { $sum: '$qty' }, amount: { $sum: '$amount' } }).end()
      ])
      orderMap = new Map((oa.data || []).map(r => [r._id, r.cnt]))
      itemMap = new Map((ia.data || []).map(r => [r._id, r]))
    }

    await oplog.success(ctx, {
      action_type: ACTION.STAT_QUERY,
      object_type: 'user',
      object_id: params.leader_uid,
      reason: '团长活动列表统计',
      prev_state: null,
      next_state: null
    })

    return ok(paging.wrap(list.map(a => {
      const it = itemMap.get(a._id)
      return {
        _id: a._id, title: a.title, short_code: a.short_code,
        status: a.status, governance_status: a.governance_status,
        publish_date: a.publish_date || null, end_time: a.end_time,
        valid_order_count: orderMap.get(a._id) || 0,
        valid_total_qty: it ? it.qty : 0,
        estimated_amount: it ? it.amount : 0
      }
    }), total, ctx.now))
  },

  /** 统计导出（A-05 / A-06），导出不受限制但每次写审计 */
  async statExport (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-stat-view', { deniedAction: ACTION.STAT_DENIED, objectType: 'stat' })

    const res = params.activity_id || params.leader_uid
      ? await this.statActivityDrill(params)
      : await this.statOverview(Object.assign({}, params, { page: 1, pageSize: paging.MAX_PAGE_SIZE }))
    if (res.errCode !== 0) return res

    let header, rows, sheetName
    if (params.activity_id) {
      sheetName = '活动商品汇总'
      header = ['商品名称', '已购买份数', '预计金额(元)']
      rows = res.data.goods_summary.map(g => [g.goods_name, g.sold_qty, this._money(g.estimated_amount)])
    } else if (params.leader_uid) {
      sheetName = '团长活动统计'
      header = ['活动标题', '短码', '业务状态', '治理状态', '有效订单数', '有效总份数', '预计金额(元)']
      rows = res.data.list.map(a => [a.title, a.short_code, a.status, a.governance_status,
        a.valid_order_count, a.valid_total_qty, this._money(a.estimated_amount)])
    } else {
      sheetName = '团长汇总'
      header = ['团长标识', '已发布活动数', '进行中', '已截止', '已取消', '当前已下架',
        '累计有效订单数', '有效总份数', '预计金额(元)', '最近发起时间']
      rows = res.data.list.map(r => [r.leader_uid, r.published_activity_count, r.ongoing_count,
        r.closed_count, r.cancelled_count, r.governance_off_count,
        r.valid_order_count, r.valid_total_qty, this._money(r.estimated_amount),
        r.last_publish_date ? new Date(r.last_publish_date).toLocaleString('zh-CN') : ''])
    }

    const out = await this._exportRows(sheetName, header, rows, 'grouporder/ops-stat')
    await oplog.success(ctx, {
      action_type: ACTION.EXPORT_DOWNLOAD,
      object_type: 'stat',
      object_id: params.activity_id || params.leader_uid || '(团长汇总)',
      reason: `导出${sheetName}，共 ${rows.length} 行`,
      prev_state: null,
      next_state: null
    })
    return ok(Object.assign({}, out, { asOf: ctx.now }))
  },

  // ==========================================================================
  // 批 D · 账号与隐私事项
  // ==========================================================================

  /** 绑定申诉列表（A-12），4 状态 */
  async appealList (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-privacy-appeal')
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'asc' },
      allowOrderFields: ['create_date', 'handle_time']
    })

    const where = {}
    if (p.filters.status) where.status = p.filters.status
    if (p.filters.appeal_no) where.appeal_no = String(p.filters.appeal_no)
    if (p.filters.applicant_uid) where.applicant_uid = p.filters.applicant_uid
    const range = this._dateRange(p.filters, 'create_date')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-bind-appeal', where, p)
    return ok(paging.wrap(list, total, ctx.now))
  },

  /**
   * 绑定申诉详情（A-12）
   * 微信身份【只返回摘要】，不返回完整凭证。
   */
  async appealDetail (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-privacy-appeal')
    const appeal = await this._mustGet('grouporder-bind-appeal', params.appeal_id, '申诉')

    // 双方是否均有业务数据：提交时重新计算，不用申诉记录里的旧值
    const hasData = async (uid) => {
      if (!uid) return false
      const [a, o] = await Promise.all([
        this.db.collection('grouporder-activity').where({ leader_uid: uid }).count(),
        this.db.collection('grouporder-order').where({ user_id: uid }).count()
      ])
      return (a.total || 0) > 0 || (o.total || 0) > 0
    }
    const [applicantHasData, targetHasData] = await Promise.all([
      hasData(appeal.applicant_uid),
      hasData(appeal.target_account_uid)
    ])

    return ok({
      appeal,
      applicant_has_data: applicantHasData,
      target_has_data: targetHasData,
      // 双方均有业务数据时不受理（D-055）
      both_have_data: applicantHasData && targetHasData,
      asOf: ctx.now
    })
  },

  /**
   * 处理解绑 / 重新绑定（A-12）
   * 双方均有业务数据不受理（D-055）：不执行解绑、重新绑定、合并或迁移。
   * 解绑与重新绑定【不改变任何活动、订单、限购统计或收货信息的归属】。
   * 提交时重新检查绑定状态，防止并发覆盖新的绑定关系。
   */
  async appealResolve (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-privacy-appeal', {
      deniedAction: ACTION.BIND_DENIED,
      objectType: 'bind_appeal',
      objectId: params.appeal_id
    })
    const appeal = await this._mustGet('grouporder-bind-appeal', params.appeal_id, '申诉')

    const verifyResult = String(params.identity_verify_result || '').trim()
    assertParam(verifyResult, '必须记录身份核验过程与结果')

    if (appeal.status === APPEAL_STATUS.SUCCESS || appeal.status === APPEAL_STATUS.FAILED) {
      // 重复提交返回最新状态，不重复解绑
      await oplog.write(ctx, {
        action_type: ACTION.BIND_DUPLICATED,
        result: oplog.RESULT.SUCCESS,
        object_type: 'bind_appeal',
        object_id: appeal._id,
        case_no: appeal.appeal_no,
        reason: '重复提交，返回最新状态',
        prev_state: { status: appeal.status },
        next_state: { status: appeal.status }
      })
      return ok({ appeal_id: appeal._id, status: appeal.status, changed: false })
    }

    const detail = await this.appealDetail({ appeal_id: appeal._id })
    if (detail.data.both_have_data) {
      await this.db.collection('grouporder-bind-appeal').doc(appeal._id).update({
        status: APPEAL_STATUS.FAILED,
        handler_uid: ctx.uid,
        identity_verify_result: verifyResult,
        both_have_data: 1,
        fail_reason: '两个账号均已有业务数据，本版不支持解绑、重新绑定或数据合并，请继续分别使用原账号',
        handle_time: ctx.now
      })
      await oplog.write(ctx, {
        action_type: ACTION.BIND_DENIED,
        result: oplog.RESULT.SUCCESS,
        object_type: 'bind_appeal',
        object_id: appeal._id,
        case_no: appeal.appeal_no,
        reason: '双方均有业务数据，不受理',
        prev_state: { status: appeal.status },
        next_state: { status: APPEAL_STATUS.FAILED }
      })
      return ok({ appeal_id: appeal._id, status: APPEAL_STATUS.FAILED, changed: true, denied: true })
    }

    const approve = params.approve === true
    if (!approve) {
      const failReason = String(params.fail_reason || '').trim()
      assertParam(failReason, '拒绝时必须填写不含内部敏感信息的原因摘要')
      await this.db.collection('grouporder-bind-appeal').doc(appeal._id).update({
        status: APPEAL_STATUS.FAILED,
        handler_uid: ctx.uid,
        identity_verify_result: verifyResult,
        fail_reason: failReason,
        handle_time: ctx.now
      })
      await oplog.write(ctx, {
        action_type: ACTION.BIND_DENIED,
        result: oplog.RESULT.SUCCESS,
        object_type: 'bind_appeal',
        object_id: appeal._id,
        case_no: appeal.appeal_no,
        reason: failReason,
        prev_state: { status: appeal.status },
        next_state: { status: APPEAL_STATUS.FAILED }
      })
      return ok({ appeal_id: appeal._id, status: APPEAL_STATUS.FAILED, changed: true })
    }

    // 解绑 / 重新绑定只改 uni-id-users 的微信身份字段，
    // 不触碰活动、订单、限购统计与收货信息的归属
    const isRelease = appeal.appeal_type === 1
    const userColl = this.db.collection('uni-id-users')
    const { data: userData } = await userColl
      .where({ _id: appeal.applicant_uid })
      .field({ _id: true, wx_openid: true, wx_unionid: true }).limit(1).get()
    const user = userData && userData[0]
    if (!user) throwOps('NOT_FOUND', '申诉人账号不存在')

    const prev = { wx_bound: !!(user.wx_openid && Object.keys(user.wx_openid).length) }
    if (isRelease) {
      await userColl.doc(appeal.applicant_uid).update({ wx_openid: {}, wx_unionid: '' })
    } else {
      assertParam(params.target_account_uid, '重新绑定必须指定目标账号')
      // 一个微信身份最多绑定一个平台账号：先确认目标账号当前未被占用
      const { data: occupied } = await userColl
        .where({ _id: params.target_account_uid })
        .field({ _id: true, wx_openid: true }).limit(1).get()
      const target = occupied && occupied[0]
      if (!target) throwOps('NOT_FOUND', '目标账号不存在')
      if (target.wx_openid && Object.keys(target.wx_openid).length) {
        throwOps('STATE_CHANGED', '目标账号已绑定其他微信身份，请刷新后重试')
      }
      await userColl.doc(params.target_account_uid)
        .update({ wx_openid: user.wx_openid || {}, wx_unionid: user.wx_unionid || '' })
      await userColl.doc(appeal.applicant_uid).update({ wx_openid: {}, wx_unionid: '' })
    }

    await this.db.collection('grouporder-bind-appeal').doc(appeal._id).update({
      status: APPEAL_STATUS.SUCCESS,
      handler_uid: ctx.uid,
      identity_verify_result: verifyResult,
      handle_reason: String(params.handle_reason || ''),
      handle_time: ctx.now
    })

    await oplog.success(ctx, {
      action_type: isRelease ? ACTION.BIND_RELEASE : ACTION.BIND_REBIND,
      object_type: 'bind_appeal',
      object_id: appeal._id,
      case_no: appeal.appeal_no,
      reason: String(params.handle_reason || ''),
      prev_state: prev,
      next_state: { wx_bound: !isRelease, target_account_uid: params.target_account_uid || '' }
    })

    return ok({ appeal_id: appeal._id, status: APPEAL_STATUS.SUCCESS, changed: true })
  },

  /** 隐私事项列表（A-16），5 状态 */
  async privacyCaseList (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-privacy-case')
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'asc' },
      allowOrderFields: ['create_date', 'retention_expire']
    })

    const where = {}
    if (p.filters.status) where.status = p.filters.status
    if (p.filters.case_type) where.case_type = p.filters.case_type
    if (p.filters.case_no) where.case_no = String(p.filters.case_no)
    if (p.filters.target_uid) where.target_uid = p.filters.target_uid
    const range = this._dateRange(p.filters, 'create_date')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-privacy-case', where, p)
    return ok(paging.wrap(list, total, ctx.now))
  },

  /**
   * 登记隐私事项（A-16）
   * 三年期限【只读】：不允许运营任意延长、缩短或绕过（OPS §15）。
   * retention_start / retention_expire 由系统按 D-035 计算，不接受入参。
   */
  async privacyCaseCreate (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-privacy-case', {
      deniedAction: ACTION.PRIVACY_CASE_CREATE,
      objectType: 'privacy_case',
      objectId: params.target_uid
    })
    assertParam([1, 2, 3].includes(params.case_type), '事项类型不合法')
    assertParam(params.target_uid, '缺少对象用户')

    // 保存期起点取该用户最近一次活动截止或取消之日；没有则以登记时间为起点
    const { data: acts } = await this.db.collection('grouporder-activity')
      .where({
        leader_uid: params.target_uid,
        status: this.dbCmd.in([ACTIVITY.CLOSED, ACTIVITY.CANCELLED])
      })
      .field({ retention_expire_date: true, actual_end_time: true, cancel_time: true })
      .orderBy('create_date', 'desc').limit(50).get()

    let retentionExpire = null
    for (const a of (acts || [])) {
      if (a.retention_expire_date && (!retentionExpire || a.retention_expire_date > retentionExpire)) {
        retentionExpire = a.retention_expire_date
      }
    }
    const retentionStart = retentionExpire ? retentionExpire - (3 * 365 * 24 * 60 * 60 * 1000) : ctx.now
    if (!retentionExpire) retentionExpire = retentionStart + (3 * 365 * 24 * 60 * 60 * 1000)

    const caseNo = idempotent.buildBizNo('PRV', ctx.now)
    const res = await this.db.collection('grouporder-privacy-case').add({
      case_no: caseNo,
      case_type: params.case_type,
      target_uid: params.target_uid,
      retention_start: retentionStart,
      retention_expire: retentionExpire,
      status: PRIVACY_STATUS.REGISTERED,
      restricted: 0,
      operator_uid: ctx.uid,
      create_date: ctx.now
    })

    await oplog.success(ctx, {
      action_type: ACTION.PRIVACY_CASE_CREATE,
      object_type: 'privacy_case',
      object_id: res.id,
      case_no: caseNo,
      reason: String(params.reason || '登记隐私事项'),
      prev_state: null,
      next_state: { case_type: params.case_type, status: PRIVACY_STATUS.REGISTERED }
    })
    return ok({ case_id: res.id, case_no: caseNo, retention_start: retentionStart, retention_expire: retentionExpire })
  },

  /**
   * 更新隐私事项状态（A-16）
   * 只允许推进状态与记录执行结果；【期限字段一律不可改】。
   */
  async privacyCaseUpdate (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-privacy-case', {
      deniedAction: ACTION.PRIVACY_CASE_UPDATE,
      objectType: 'privacy_case',
      objectId: params.case_id
    })
    const doc = await this._mustGet('grouporder-privacy-case', params.case_id, '隐私事项')

    // 明确拒绝任何改期限的尝试，而不是静默忽略
    assertParam(params.retention_start === undefined && params.retention_expire === undefined,
      '保存期限由系统按规则计算，不允许延长、缩短或绕过')

    const patch = {}
    if (params.status !== undefined) {
      assertParam([1, 2, 3, 4, 5].includes(params.status), '状态不合法')
      patch.status = params.status
    }
    if (params.restricted !== undefined) patch.restricted = params.restricted === 1 ? 1 : 0
    if (params.execute_result !== undefined) {
      patch.execute_result = String(params.execute_result)
      patch.execute_time = ctx.now
    }
    assertParam(Object.keys(patch).length > 0, '没有需要更新的内容')

    await this.db.collection('grouporder-privacy-case').doc(doc._id).update(patch)
    await oplog.success(ctx, {
      action_type: ACTION.PRIVACY_CASE_UPDATE,
      object_type: 'privacy_case',
      object_id: doc._id,
      case_no: doc.case_no,
      reason: String(params.reason || '更新隐私事项状态'),
      prev_state: { status: doc.status, restricted: doc.restricted || 0 },
      next_state: patch
    })
    return ok({ case_id: doc._id, status: patch.status !== undefined ? patch.status : doc.status })
  },

  // ==========================================================================
  // 批 E · 审计
  // ==========================================================================

  /**
   * Excel 事件查询（A-13）
   * 【不返回下载地址】——本表存的是 file_version，页面也不展示可继续使用的地址。
   */
  async exportLogList (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-audit-export', { deniedAction: ACTION.EXPORT_LOG_QUERY, objectType: 'export_log' })
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date']
    })

    const where = {}
    if (p.filters.activity_id) where.activity_id = p.filters.activity_id
    if (p.filters.leader_uid) where.leader_uid = p.filters.leader_uid
    if (p.filters.request_uid) where.request_uid = p.filters.request_uid
    if (p.filters.event_type) where.event_type = p.filters.event_type
    const range = this._dateRange(p.filters, 'create_date')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-export-log', where, p)

    // 版本失效是派生状态（D-051）：按活动取最近一次作废时间，与版本生成时间比较
    const invalidAt = new Map()
    for (const id of [...new Set(list.map(r => r.activity_id))]) {
      invalidAt.set(id, await exportlog.lastInvalidatingTime(ctx, id))
    }

    await oplog.success(ctx, {
      action_type: ACTION.EXPORT_LOG_QUERY,
      object_type: 'export_log',
      object_id: p.filters.activity_id || '(全部)',
      reason: `Excel 事件查询，命中 ${total} 条`,
      prev_state: null,
      next_state: null
    })

    return ok(paging.wrap(list.map(r => ({
      _id: r._id,
      activity_id: r.activity_id,
      leader_uid: r.leader_uid,
      request_uid: r.request_uid,
      // 生成标识，不是地址
      file_version: r.file_version,
      event_type: r.event_type,
      permission_check_result: r.permission_check_result || '',
      link_valid_result: r.link_valid_result || '',
      fail_reason: r.fail_reason || '',
      invalidated: (invalidAt.get(r.activity_id) || 0) > r.create_date,
      request_id: r.request_id || '',
      create_date: r.create_date
    })), total, ctx.now))
  },

  /**
   * 后台下载清单（A-13，D-073）
   * 重新鉴权 + 重新换取新的临时地址；【不提供重新生成入口】。
   * 每次下载另写一条 export_download 审计，请求人记当前运营账号，不冒充团长。
   */
  async exportDownload (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-audit-export', {
      deniedAction: ACTION.EXPORT_DOWNLOAD,
      objectType: 'export_log',
      objectId: params.file_version
    })

    const fileVersion = String(params.file_version || '').trim()
    assertParam(fileVersion, '缺少清单版本标识')

    const { data } = await this.db.collection('grouporder-export-log')
      .where({ file_version: fileVersion, event_type: exportlog.EVENT.GENERATE_OK })
      .orderBy('create_date', 'desc').limit(1).get()
    const record = data && data[0]
    if (!record) throwOps('NOT_FOUND', '该清单版本不存在')

    try {
      // 不复用记录中的历史地址（含已过期的），每次重新换取
      const granted = await exportlog.grantTempUrl(fileVersion)

      await exportlog.write(ctx, {
        activity_id: record.activity_id,
        leader_uid: record.leader_uid,
        request_uid: ctx.uid,      // 运营账号，不冒充团长
        file_version: fileVersion,
        event_type: exportlog.EVENT.DOWNLOAD_OK,
        permission_check_result: '通过',
        link_valid_result: '已换取新的临时地址'
      })
      await oplog.success(ctx, {
        action_type: ACTION.EXPORT_DOWNLOAD,
        object_type: 'export_log',
        object_id: record._id,
        reason: `后台下载活动 ${record.activity_id} 的清单`,
        prev_state: null,
        next_state: null   // 地址不写入日志（D-071③）
      })
      return ok({ url: granted.url, expires_in: granted.expiresIn, asOf: ctx.now })
    } catch (e) {
      await exportlog.write(ctx, {
        activity_id: record.activity_id,
        leader_uid: record.leader_uid,
        request_uid: ctx.uid,
        file_version: fileVersion,
        event_type: exportlog.EVENT.DOWNLOAD_FAIL,
        fail_reason: e.errMsg || e.message
      })
      await oplog.denied(ctx, {
        action_type: ACTION.EXPORT_DOWNLOAD,
        object_type: 'export_log',
        object_id: record._id,
        reason: e.errMsg || e.message,
        prev_state: null,
        next_state: null
      })
      throw e
    }
  },

  /**
   * 操作日志查询（A-14）
   * 【无写方法】——本对象不提供任何写入、修改或删除 grouporder-oplog 的入口，
   * schema 的 update 与 delete 对所有角色关闭，超管同样没有。
   * 本方法自身的查询【不写日志】，否则查日志会无限产生新日志。
   */
  async oplogList (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-audit-oplog')
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'operate_time', direction: 'desc' },
      allowOrderFields: ['operate_time']
    })

    const where = {}
    if (p.filters.operator_uid) where.operator_uid = p.filters.operator_uid
    if (p.filters.action_type) where.action_type = p.filters.action_type
    if (p.filters.object_type) where.object_type = p.filters.object_type
    if (p.filters.object_id) where.object_id = p.filters.object_id
    if (p.filters.case_no) where.case_no = String(p.filters.case_no)
    if (p.filters.request_id) where.request_id = String(p.filters.request_id)
    if (p.filters.result !== undefined && p.filters.result !== '') where.result = p.filters.result
    const range = this._dateRange(p.filters, 'operate_time')
    if (range) Object.assign(where, range)

    const { list, total } = await this._query('grouporder-oplog', where, p)
    return ok(paging.wrap(list, total, ctx.now))
  },

  // ==========================================================================
  // 批 F · 工作台
  // ==========================================================================

  /**
   * 工作台待办（A-03）
   * 三档【派生视图】，不建待办表，【不提供关闭或忽略】（D-070）——
   * 消退完全依赖各对象的状态机。
   * 只展示本人有权处理的事项；无权处理的不展示也不计入角标。
   */
  async workbenchTodo () {
    const ctx = this.ctx
    await this._perm('ops-workbench')

    const canReport = auth.hasPermission(ctx, 'ops-content-report')
    const canReview = auth.hasPermission(ctx, 'ops-content-review')
    const canAppeal = auth.hasPermission(ctx, 'ops-privacy-appeal')
    const canPrivacy = auth.hasPermission(ctx, 'ops-privacy-case')

    const empty = { total: 0, data: [] }
    const [reports, checks, reviews, appeals, privacies] = await Promise.all([
      canReport ? this.db.collection('grouporder-report')
        .where({ status: REPORT_STATUS.PENDING })
        .orderBy('create_date', 'asc').limit(50).get() : empty,
      canReport ? this.db.collection('grouporder-content-check')
        .where({ status: contentcheck.STATUS.PENDING })
        .orderBy('create_date', 'asc').limit(50).get() : empty,
      canReview ? this.db.collection('grouporder-activity')
        .where({ status: ACTIVITY.REVIEWING })
        .orderBy('review_submit_date', 'asc').limit(50).get() : empty,
      canAppeal ? this.db.collection('grouporder-bind-appeal')
        .where({ status: this.dbCmd.in([APPEAL_STATUS.PENDING, APPEAL_STATUS.HANDLING]) })
        .orderBy('create_date', 'asc').limit(50).get() : empty,
      canPrivacy ? this.db.collection('grouporder-privacy-case')
        .where({ status: this.dbCmd.in([PRIVACY_STATUS.REGISTERED, PRIVACY_STATUS.RESTRICTED, PRIVACY_STATUS.EXPIRED]) })
        .orderBy('create_date', 'asc').limit(50).get() : empty
    ])

    // 档 1：违规内容仍在线上，每延迟一分钟风险多一分
    const level1 = []
    for (const r of (reports.data || [])) {
      level1.push({ type: 'report', id: r._id, no: r.report_no, title: '举报待处理',
        summary: (r.content_snapshot && r.content_snapshot.activity_title) || '',
        create_date: r.create_date })
    }
    for (const c of (checks.data || [])) {
      level1.push({ type: 'content_check', id: c._id, no: '', title: '内容检测复核待处理',
        summary: `${c.object_type} / ${c.content_type}`, create_date: c.create_date })
    }
    // 档 2：团长在等待，但内容尚未公开
    const level2 = (reviews.data || []).map(a => ({
      type: 'review', id: a._id, no: a.short_code, title: '活动发布审核待审',
      summary: a.title, create_date: a.review_submit_date || a.create_date
    }))
    // 档 3：需人工核验，本就无法快速处理
    const level3 = []
    for (const a of (appeals.data || [])) {
      level3.push({ type: 'bind_appeal', id: a._id, no: a.appeal_no, title: '账号绑定申诉',
        summary: '', create_date: a.create_date })
    }
    for (const c of (privacies.data || [])) {
      level3.push({ type: 'privacy_case', id: c._id, no: c.case_no, title: '隐私与注销事项',
        summary: '', create_date: c.create_date })
    }

    // 同档内按提交时间正序（先到先处理）
    const byTime = (a, b) => a.create_date - b.create_date
    level1.sort(byTime); level2.sort(byTime); level3.sort(byTime)

    return ok({
      levels: [
        { level: 1, label: '举报与内容检测', count: level1.length, items: level1 },
        { level: 2, label: '活动发布审核', count: level2.length, items: level2 },
        { level: 3, label: '账号与隐私事项', count: level3.length, items: level3 }
      ],
      // 导航角标只统计第 1、2 档合计
      badge_count: level1.length + level2.length,
      asOf: ctx.now
    })
  },

  // ==========================================================================
  // 运营账号写操作
  // A-15 页面的【读】仍走 unicloud-db 直连 uni-id-*（那些表 read: true），
  // 【写】收归本对象，否则 OPS §13 要求的 account_disabled / role_changed /
  // stat_permission_changed 三类事件架构上无处写入。
  // ==========================================================================

  /**
   * 启用 / 停用运营账号（A-15）
   * 停用后立即失去后台访问能力，未完成操作不得继续提交。
   * 账号只停用不删除（ops-super 刻意不含 DELETE_UNI_ID_USERS）。
   */
  async accountSetStatus (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-sys-account', {
      deniedAction: ACTION.ACCOUNT_DISABLED,
      objectType: 'user',
      objectId: params.user_id
    })
    assertParam(params.user_id, '缺少账号标识')
    // 0 正常 1 禁用（uni-id-users.status）
    assertParam(params.status === 0 || params.status === 1, '账号状态只能是启用或停用')
    // 账号不能修改自己的状态，避免把自己锁死或自行提权
    if (params.user_id === ctx.uid) throwOps('FORBIDDEN', '不能修改自己的账号状态')

    const { data } = await this.db.collection('uni-id-users')
      .where({ _id: params.user_id })
      .field({ _id: true, username: true, status: true, role: true }).limit(1).get()
    const user = data && data[0]
    if (!user) throwOps('NOT_FOUND', '账号不存在')

    const prevStatus = user.status === undefined ? 0 : user.status
    if (prevStatus === params.status) {
      return ok({ user_id: user._id, status: prevStatus, changed: false })
    }

    await this.db.collection('uni-id-users').doc(user._id).update({ status: params.status })
    await oplog.success(ctx, {
      action_type: ACTION.ACCOUNT_DISABLED,
      object_type: 'user',
      object_id: user._id,
      reason: String(params.reason || (params.status === 1 ? '停用运营账号' : '启用运营账号')),
      // 记录删除/停用前的角色快照
      prev_state: { status: prevStatus, role: user.role || [] },
      next_state: { status: params.status, role: user.role || [] }
    })
    return ok({ user_id: user._id, status: params.status, changed: true })
  },

  /**
   * 授予 / 撤销运营角色（A-15）
   * 同一账号可兼任多个角色，撤销其一不影响其余。
   * 账号不能修改自己的角色（OPS §4.9）。
   * 统计权限的增减单独再写一条 stat_permission_changed（OPS §13 第 11 条）。
   */
  async roleAssign (params = {}) {
    const ctx = this.ctx
    await this._perm('ops-sys-role', {
      deniedAction: ACTION.ROLE_CHANGED,
      objectType: 'user',
      objectId: params.user_id
    })
    assertParam(params.user_id, '缺少账号标识')
    assertParam(Array.isArray(params.roles), '角色必须是数组')
    if (params.user_id === ctx.uid) throwOps('FORBIDDEN', '不能修改自己的角色')

    const { data } = await this.db.collection('uni-id-users')
      .where({ _id: params.user_id })
      .field({ _id: true, username: true, role: true }).limit(1).get()
    const user = data && data[0]
    if (!user) throwOps('NOT_FOUND', '账号不存在')

    // 校验角色都存在，避免写入拼错的 role_id
    const { data: roleDocs } = await this.db.collection('uni-id-roles')
      .where({ role_id: this.dbCmd.in(params.roles) }).limit(20).get()
    const known = new Set((roleDocs || []).map(r => r.role_id))
    for (const r of params.roles) {
      assertParam(known.has(r), '角色不存在', { role_id: r })
    }
    // 内置 admin 绕过权限体系、操作无法归因，不允许通过本接口授予（ADM-03）
    assertParam(!params.roles.includes('admin'), '不允许授予内置 admin 角色')

    const prevRoles = user.role || []
    const nextRoles = [...new Set(params.roles)]
    if (prevRoles.length === nextRoles.length && prevRoles.every(r => nextRoles.includes(r))) {
      return ok({ user_id: user._id, roles: prevRoles, changed: false })
    }

    await this.db.collection('uni-id-users').doc(user._id).update({ role: nextRoles })
    await oplog.success(ctx, {
      action_type: ACTION.ROLE_CHANGED,
      object_type: 'user',
      object_id: user._id,
      reason: String(params.reason || '调整运营角色'),
      prev_state: { role: prevRoles },
      next_state: { role: nextRoles }
    })

    // 「运营统计查看」是独立权限点，增减要单独留痕
    const hadStat = await this._rolesHaveStat(prevRoles)
    const hasStat = await this._rolesHaveStat(nextRoles)
    if (hadStat !== hasStat) {
      await oplog.success(ctx, {
        action_type: ACTION.STAT_PERMISSION_CHANGED,
        object_type: 'user',
        object_id: user._id,
        reason: hasStat ? '获得运营统计查看权限' : '撤销运营统计查看权限',
        prev_state: { 'ops-stat-view': hadStat },
        next_state: { 'ops-stat-view': hasStat }
      })
    }

    return ok({ user_id: user._id, roles: nextRoles, changed: true, stat_permission: hasStat })
  },

  /** 判断一组角色是否含 ops-stat-view 权限点 */
  async _rolesHaveStat (roles) {
    if (!roles || !roles.length) return false
    const { data } = await this.db.collection('uni-id-roles')
      .where({ role_id: this.dbCmd.in(roles) }).limit(20).get()
    return (data || []).some(r => (r.permission || []).includes('ops-stat-view'))
  }
}
