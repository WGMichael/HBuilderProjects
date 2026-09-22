/**
 * grouporder-report-co · 举报提交与结果查看
 * 服务对象：client
 * 契约：docs/arch/CLOUD_API.md §9、OPS §5.1
 *
 * 举报提交本身【不修改任何治理状态】，只有审核结论成立后才由 ops-co 执行处置（D-054）。
 * content_snapshot 必须是举报时的内容，不能用当前内容替换历史证据。
 */
const { auth, errors, paging, idempotent } = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors

// grouporder-report.status：1 待处理 2 处理中 3 已结案 4 复核中 5 复核完成
const STATUS = { PENDING: 1, HANDLING: 2, CLOSED: 3, RECHECKING: 4, RECHECKED: 5 }
// conclusion：1 无违规 2 警告发布者 3 下架商品 4 下架活动 5 临时限制发布 6 永久限制发布
const CONCLUSION_TEXT = {
  1: '经核实未发现违规',
  2: '已对发布者作出警告',
  3: '相关商品已下架',
  4: '该活动已下架',
  5: '已对发布者作出临时发布限制',
  6: '已对发布者作出永久发布限制'
}
// 负面清单分类（DECISIONS §4）
const REASON_TYPES = [
  'drug', 'medical_device', 'tobacco', 'ecigarette', 'alcohol', 'health_product',
  'dangerous', 'porn_gamble', 'illegal_ticket', 'infringement', 'qualification', 'other'
]

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

  /**
   * 提交举报（M-25）
   * 可举报活动或其中商品；提交即生成【内容快照】作为证据。
   * 幂等：同一人对同一对象的未结案举报只保留一条，重复提交返回当前结果。
   */
  async reportSubmit (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)

    assertParam(params.activity_id, '缺少被举报的活动')
    assertParam(REASON_TYPES.includes(params.reason_type), '请选择举报类型')
    const desc = String(params.reason_desc || '')
    assertParam(desc.length <= 500, '举报描述不超过 500 字')

    const { data: actData } = await this.db.collection('grouporder-activity')
      .doc(params.activity_id).get()
    const activity = actData && actData[0]
    if (!activity) throwBiz('NOT_FOUND', '活动不存在或已删除')

    let goods = null
    if (params.goods_id) {
      const { data } = await this.db.collection('grouporder-goods').doc(params.goods_id).get()
      goods = data && data[0]
      if (!goods || goods.activity_id !== activity._id) {
        throwBiz('NOT_FOUND', '所举报的商品不存在或不属于该活动')
      }
    }

    // 幂等：同一举报人 + 同一对象 + 未结案
    const dupWhere = {
      reporter_uid: uid,
      activity_id: activity._id,
      goods_id: params.goods_id || '',
      status: this.dbCmd.in([STATUS.PENDING, STATUS.HANDLING, STATUS.RECHECKING])
    }
    const dup = await this.db.collection('grouporder-report').where(dupWhere).limit(1).get()
    if (dup.data && dup.data.length) {
      const r = dup.data[0]
      return ok({ report_id: r._id, report_no: r.report_no, status: r.status, duplicated: true })
    }

    // 举报时的内容快照，不能事后用当前内容替换
    const snapshotDoc = {
      activity_title: activity.title,
      activity_description: activity.description || '',
      activity_cover: activity.cover_image || null,
      activity_images: activity.images || [],
      content_version: activity.content_version || 1,
      captured_at: ctx.now
    }
    if (goods) {
      snapshotDoc.goods_name = goods.name
      snapshotDoc.goods_description = goods.description || ''
      snapshotDoc.goods_cover = goods.cover_image || null
      snapshotDoc.goods_detail_images = goods.detail_images || []
      snapshotDoc.goods_price = goods.price
    }

    // 同一活动的关联举报，可关联查看但不合并、不覆盖原始记录
    const { data: related } = await this.db.collection('grouporder-report')
      .where({ activity_id: activity._id })
      .field({ _id: true }).limit(20).get()

    const reportNo = idempotent.buildBizNo('RPT', ctx.now)
    const res = await this.db.collection('grouporder-report').add({
      report_no: reportNo,
      activity_id: activity._id,
      goods_id: params.goods_id || '',
      publisher_uid: activity.leader_uid,
      reporter_uid: uid,
      reason_type: params.reason_type,
      reason_desc: desc,
      content_snapshot: snapshotDoc,
      content_check_id: '',
      status: STATUS.PENDING,
      related_report_ids: (related || []).map(r => r._id),
      create_date: ctx.now
    })

    return ok({ report_id: res.id, report_no: reportNo, status: STATUS.PENDING, duplicated: false })
  },

  /** 我的举报（M-25） */
  async reportMyList (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'create_date', direction: 'desc' },
      allowOrderFields: ['create_date']
    })

    const where = { reporter_uid: uid }
    if (p.filters.status) where.status = p.filters.status

    const coll = this.db.collection('grouporder-report').where(where)
    const [listRes, countRes] = await Promise.all([
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])

    const list = (listRes.data || []).map(r => ({
      _id: r._id,
      report_no: r.report_no,
      activity_id: r.activity_id,
      goods_id: r.goods_id || '',
      // 快照只回展示用的标题，证据字段不下发给举报人
      activity_title: (r.content_snapshot && r.content_snapshot.activity_title) || '',
      goods_name: (r.content_snapshot && r.content_snapshot.goods_name) || '',
      reason_type: r.reason_type,
      status: r.status,
      has_result: r.status === STATUS.CLOSED || r.status === STATUS.RECHECKED,
      create_date: r.create_date
    }))
    return ok(paging.wrap(list, countRes.total, ctx.now))
  },

  /**
   * 查看处理结果（M-25）
   * 结果摘要【不含内部敏感信息】：只给结论的对外说法，不给 conclusion_reason、
   * 不给处理人、不给内部备注。有结果时进入待办（M-27）。
   */
  async reportGetResult (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    assertParam(params.report_id || params.report_no, '缺少举报标识')

    let report
    if (params.report_id) {
      const { data } = await this.db.collection('grouporder-report').doc(params.report_id).get()
      report = data && data[0]
    } else {
      const { data } = await this.db.collection('grouporder-report')
        .where({ report_no: String(params.report_no) }).limit(1).get()
      report = data && data[0]
    }
    if (!report) throwBiz('NOT_FOUND', '举报记录不存在')
    if (report.reporter_uid !== uid) throwBiz('FORBIDDEN', '无权查看他人的举报')

    const finished = report.status === STATUS.CLOSED || report.status === STATUS.RECHECKED
    let resultSummary = ''
    if (finished && report.conclusion) {
      resultSummary = CONCLUSION_TEXT[report.conclusion] || '已处理完毕'
    }

    return ok({
      _id: report._id,
      report_no: report.report_no,
      status: report.status,
      finished,
      // 对外说法，不含内部理由与处理人
      result_summary: resultSummary,
      close_time: report.close_time || null,
      create_date: report.create_date,
      asOf: ctx.now
    })
  }
}
