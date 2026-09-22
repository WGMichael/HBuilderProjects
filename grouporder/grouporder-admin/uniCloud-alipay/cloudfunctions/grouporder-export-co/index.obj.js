/**
 * grouporder-export-co · 清单预览、Excel 生成与下载
 * 服务对象：client（团长）
 * 契约：docs/arch/CLOUD_API.md §8
 *
 * 三条硬约束（D-071、OPS §10）：
 * - 临时下载地址有效期 30 分钟，【每次下载重新校验权限并重新换取】，不缓存不复用；
 * - 地址不写入任何日志或页面；
 * - 文件按 file_version 版本化，订单作废使既有版本失效（D-051）。
 *
 * ⚠ 依赖 xlsx（SheetJS）。首次部署前需在本目录执行 npm install，
 *   或在 HBuilderX 中右键该云对象「管理依赖」安装。
 */
const XLSX = require('xlsx')
const { auth, errors, state, exportlog } = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors
const { ACTIVITY, ORDER, DELIVERY } = state

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

  /** 仅团长本人、仅已截止活动才能出清单 */
  async _requireClosedOwnActivity (activityId) {
    const ctx = this.ctx
    const activity = await auth.requireLeader(ctx, activityId)
    const closed = activity.status === ACTIVITY.CLOSED ||
      (activity.end_time && ctx.now >= activity.end_time)
    if (activity.status === ACTIVITY.CANCELLED) {
      // 已取消活动不生成有效履约清单（D-052）
      throwBiz('ACTIVITY_CANCELLED', '活动已取消，不生成履约清单')
    }
    if (!closed) throwBiz('PRECONDITION_UNMET', '活动截止后才能生成接龙清单')
    return activity
  },

  /**
   * Excel 公式注入防护（D-039、D-071⑤）。
   * 所有用户可控文本（买家备注、收货人姓名、地址、商品名）一律以【文本型单元格】写入，
   * 绝不设置 f 属性，Excel 不会把 = + - @ 开头的内容当公式求值。
   */
  _cell (value) {
    const v = value === null || value === undefined ? '' : String(value)
    return { t: 's', v }
  },

  /** 分为单位的金额转成两位小数字符串，避免浮点误差进入清单 */
  _money (cents) {
    const n = Number(cents) || 0
    const sign = n < 0 ? '-' : ''
    const abs = Math.abs(n)
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
  },

  /** 汇总数据：商品汇总 + 参与者明细，两处共用，保证预览与导出口径一致 */
  async _collect (activity) {
    // 商品汇总排序与活动详情页一致：sort ASC, create_date ASC
    const { data: goodsList } = await this.db.collection('grouporder-goods')
      .where({ activity_id: activity._id })
      .orderBy('sort', 'asc').orderBy('create_date', 'asc').limit(60).get()

    const agg = await this.db.collection('grouporder-order-item').aggregate()
      .match({ activity_id: activity._id, status: ORDER.VALID })
      .group({
        _id: '$goods_id',
        qty: { $sum: '$qty' },
        amount: { $sum: '$amount' }
      })
      .end()
    const aggMap = new Map((agg.data || []).map(r => [r._id, r]))

    // 停售与被下架的商品，已有明细继续保留并进入清单（D-019、D-050）
    const goodsSummary = (goodsList || []).map(g => {
      const r = aggMap.get(g._id)
      return {
        goods_id: g._id,
        goods_name: g.name,
        unit: g.unit,
        price: g.price,
        sold_qty: r ? r.qty : 0,
        amount: r ? r.amount : 0,
        on_sale: g.on_sale,
        governance_status: g.governance_status
      }
    })

    const { data: orders } = await this.db.collection('grouporder-order')
      .where({ activity_id: activity._id, status: ORDER.VALID })
      .orderBy('create_date', 'asc').limit(600).get()

    let items = []
    if (orders && orders.length) {
      const { data } = await this.db.collection('grouporder-order-item')
        .where({ order_id: this.dbCmd.in(orders.map(o => o._id)), status: ORDER.VALID })
        .limit(2000).get()
      items = data || []
    }
    const orderMap = new Map((orders || []).map(o => [o._id, o]))

    // 参与者明细：每条商品明细一行，同一订单的订单号与收货信息在多行重复（D-053）
    const detail = items.map(it => {
      const o = orderMap.get(it.order_id) || {}
      return {
        order_no: o.order_no || '',
        consignee_name: o.consignee_name || '',
        consignee_mobile: o.consignee_mobile || '',
        consignee_address: o.consignee_address || '',
        buyer_remark: o.buyer_remark || '',
        goods_name: it.goods_name,
        unit: it.unit_snapshot,
        price: it.price_snapshot,
        qty: it.qty,
        amount: it.amount,
        create_date: o.create_date || 0
      }
    }).sort((a, b) => a.create_date - b.create_date || a.order_no.localeCompare(b.order_no))

    const totals = detail.reduce((acc, d) => {
      acc.qty += d.qty
      acc.amount += d.amount
      return acc
    }, { qty: 0, amount: 0 })

    return {
      goodsSummary,
      detail,
      valid_order_count: (orders || []).length,
      valid_total_qty: totals.qty,
      estimated_amount: totals.amount
    }
  },

  // ==========================================================================
  // 方法
  // ==========================================================================

  /**
   * 清单预览（M-24）
   * 商品汇总 + 参与者明细；【不生成文件】。
   */
  async listPreview (params = {}) {
    const ctx = this.ctx
    const activity = await this._requireClosedOwnActivity(params.activity_id)
    const collected = await this._collect(activity)
    const versions = await exportlog.listVersions(ctx, activity._id)

    return ok({
      activity_id: activity._id,
      title: activity.title,
      short_code: activity.short_code,
      delivery_type: activity.delivery_type,
      // 自提活动的清单不输出地址列（D-060）
      has_address_column: activity.delivery_type === DELIVERY.HOME,
      actual_end_time: activity.actual_end_time || activity.end_time,
      goods_summary: collected.goodsSummary,
      detail: collected.detail,
      valid_order_count: collected.valid_order_count,
      valid_total_qty: collected.valid_total_qty,
      estimated_amount: collected.estimated_amount,
      // 已生成的版本，供前端选择下载；不含任何下载地址
      versions: versions.map((v, i) => ({
        file_version: v.file_version,
        version_no: versions.length - i,
        create_date: v.create_date,
        invalidated: v.invalidated
      })),
      asOf: ctx.now
    })
  },

  /**
   * 生成 Excel（M-24）
   * 写 grouporder-export-log；公式注入防护；按 file_version 版本化。
   */
  async listGenerate (params = {}) {
    const ctx = this.ctx
    let activity
    try {
      activity = await this._requireClosedOwnActivity(params.activity_id)
    } catch (e) {
      // 权限或前置条件失败同样要留痕（OPS §10）
      await exportlog.write(ctx, {
        activity_id: params.activity_id || '',
        leader_uid: ctx.uid || '',
        event_type: exportlog.EVENT.PERMISSION_DENIED,
        permission_check_result: '拒绝',
        fail_reason: e.errMsg || e.message
      })
      throw e
    }

    try {
      const collected = await this._collect(activity)
      const withAddress = activity.delivery_type === DELIVERY.HOME

      // Sheet 1 商品汇总：每个商品一行（D-053）
      const sheet1 = [
        ['商品名称', '单位', '单价(元)', '已购买份数', '预计金额(元)', '备注'].map(h => this._cell(h))
      ]
      for (const g of collected.goodsSummary) {
        const marks = []
        if (g.on_sale !== 1) marks.push('已停售')
        if (g.governance_status === 1) marks.push('已下架')
        sheet1.push([
          this._cell(g.goods_name),
          this._cell(g.unit),
          this._cell(this._money(g.price)),
          this._cell(g.sold_qty),
          this._cell(this._money(g.amount)),
          this._cell(marks.join('、'))
        ])
      }
      sheet1.push([
        this._cell('合计'), this._cell(''), this._cell(''),
        this._cell(collected.valid_total_qty),
        this._cell(this._money(collected.estimated_amount)),
        this._cell('')
      ])

      // Sheet 2 参与者明细：每条商品明细一行
      const header2 = ['订单号', '收货人', '联系电话']
      if (withAddress) header2.push('收货地址')
      header2.push('商品名称', '单位', '单价(元)', '数量', '小计(元)', '买家备注')
      const sheet2 = [header2.map(h => this._cell(h))]
      for (const d of collected.detail) {
        const row = [
          this._cell(d.order_no),
          this._cell(d.consignee_name),
          this._cell(d.consignee_mobile)
        ]
        if (withAddress) row.push(this._cell(d.consignee_address))
        row.push(
          this._cell(d.goods_name),
          this._cell(d.unit),
          this._cell(this._money(d.price)),
          this._cell(d.qty),
          this._cell(this._money(d.amount)),
          this._cell(d.buyer_remark)   // 用户自由输入，文本型写入
        )
        sheet2.push(row)
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1), '商品汇总')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2), '参与者明细')
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      const stamp = new Date(ctx.now)
      const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`
      const upload = await uniCloud.uploadFile({
        cloudPath: `grouporder/export/${activity._id}/${ymd}_${ctx.now}.xlsx`,
        fileContent: buffer
      })

      // file_version 存生成标识（此处用云存储 fileID），【绝不是下载地址】
      await exportlog.write(ctx, {
        activity_id: activity._id,
        leader_uid: activity.leader_uid,
        file_version: upload.fileID,
        event_type: exportlog.EVENT.GENERATE_OK,
        permission_check_result: '通过'
      })

      return ok({
        activity_id: activity._id,
        file_version: upload.fileID,
        valid_order_count: collected.valid_order_count,
        valid_total_qty: collected.valid_total_qty,
        row_count: collected.detail.length,
        asOf: ctx.now
      })
    } catch (e) {
      await exportlog.write(ctx, {
        activity_id: activity._id,
        leader_uid: activity.leader_uid,
        event_type: exportlog.EVENT.GENERATE_FAIL,
        fail_reason: e.errMsg || e.message
      })
      throw e
    }
  },

  /**
   * 下载（M-24）
   * 每次【重新校验权限并重新换取临时地址】（30 分钟，D-071① ③）；
   * 不得缓存或复用；地址不写入任何日志或页面。
   */
  async listDownload (params = {}) {
    const ctx = this.ctx
    const fileVersion = String(params.file_version || '').trim()
    assertParam(fileVersion, '缺少清单版本标识')

    let activity
    try {
      // 团长身份、活动业务状态与治理状态在两次下载之间都可能变化，因此每次都重新校验
      activity = await this._requireClosedOwnActivity(params.activity_id)
    } catch (e) {
      await exportlog.write(ctx, {
        activity_id: params.activity_id || '',
        leader_uid: ctx.uid || '',
        file_version: fileVersion,
        event_type: exportlog.EVENT.PERMISSION_DENIED,
        permission_check_result: '拒绝',
        fail_reason: e.errMsg || e.message
      })
      throw e
    }

    // 版本必须属于该活动，且未失效
    const { data } = await this.db.collection('grouporder-export-log')
      .where({
        activity_id: activity._id,
        file_version: fileVersion,
        event_type: exportlog.EVENT.GENERATE_OK
      })
      .orderBy('create_date', 'desc').limit(1).get()
    const record = data && data[0]
    if (!record) {
      await exportlog.write(ctx, {
        activity_id: activity._id,
        leader_uid: activity.leader_uid,
        file_version: fileVersion,
        event_type: exportlog.EVENT.DOWNLOAD_FAIL,
        fail_reason: '版本不存在'
      })
      throwBiz('NOT_FOUND', '该清单版本不存在')
    }
    // 失效为派生判定：版本生成后若有订单被作废，统计口径已变（D-051）
    if (await exportlog.isVersionInvalidated(ctx, activity._id, record.create_date)) {
      await exportlog.write(ctx, {
        activity_id: activity._id,
        leader_uid: activity.leader_uid,
        file_version: fileVersion,
        event_type: exportlog.EVENT.DOWNLOAD_FAIL,
        link_valid_result: '版本已失效',
        fail_reason: '订单变动导致统计口径变化'
      })
      throwBiz('STATE_CHANGED', '该清单版本已失效，请重新生成最新清单')
    }

    try {
      const granted = await exportlog.grantTempUrl(fileVersion)
      await exportlog.write(ctx, {
        activity_id: activity._id,
        leader_uid: activity.leader_uid,
        file_version: fileVersion,
        event_type: exportlog.EVENT.DOWNLOAD_OK,
        permission_check_result: '通过',
        link_valid_result: '已换取新的临时地址'
      })
      // 地址只回给本次请求，不落库、不进日志
      return ok({ url: granted.url, expires_in: granted.expiresIn, asOf: ctx.now })
    } catch (e) {
      await exportlog.write(ctx, {
        activity_id: activity._id,
        leader_uid: activity.leader_uid,
        file_version: fileVersion,
        event_type: exportlog.EVENT.DOWNLOAD_FAIL,
        fail_reason: e.errMsg || e.message
      })
      throw e
    }
  }
}
