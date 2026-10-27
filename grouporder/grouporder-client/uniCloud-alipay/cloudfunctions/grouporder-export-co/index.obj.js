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
const { auth, errors, state, exportlog, paging, leadercontact, bindMethods } = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors
const { ACTIVITY, ORDER, DELIVERY } = state

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

  /** 仅团长本人、仅已结束活动才能出清单 */
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

  /** 时间戳 → 北京时间 YYYY-MM-DD HH:mm（云函数运行在 UTC，不能直接用本地时区）；dateOnly 只要 YYYYMMDD */
  _time (ts, dateOnly) {
    if (!ts) return ''
    const d = new Date(Number(ts) + 8 * 3600 * 1000)
    const p = n => String(n).padStart(2, '0')
    const ymd = [d.getUTCFullYear(), p(d.getUTCMonth() + 1), p(d.getUTCDate())]
    if (dateOnly) return ymd.join('')
    return `${ymd.join('-')} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  },

  /** 清单「类别」列：大类-小类；老数据只有小类时只显示小类（D-149） */
  _categoryText (g) {
    const sub = g.category_name || ''
    const parent = g.category_parent_name || ''
    if (!sub) return '未分类'
    return parent ? `${parent}-${sub}` : sub
  },

  /** 团长名称：优先团长名片昵称，其次账号昵称 */
  async _leaderInfo (activity) {
    const card = (await leadercontact.get(this.ctx, activity.leader_uid)) || {}
    let name = card.nickname || ''
    if (!name) {
      const { data } = await this.db.collection('uni-id-users').doc(activity.leader_uid).field({ nickname: true }).get()
      name = (data && data[0] && data[0].nickname) || ''
    }
    return { name, mobile: card.mobile || '', wechat: card.wechat || '' }
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
      // 显式上限：不依赖平台默认返回条数，商品多时不截断
      .limit(paging.AGG_LIMIT)
      .end()
    const aggMap = new Map((agg.data || []).map(r => [r._id, r]))

    // 停售与被下架的商品，已有明细继续保留并进入清单（D-019、D-050）；
    // 没人买的商品（0 份）不进清单，预览与 Excel 同口径（D-149）
    const goodsSummary = (goodsList || []).map(g => {
      const r = aggMap.get(g._id)
      return {
        goods_id: g._id,
        goods_name: g.name,
        category_text: this._categoryText(g),
        unit: g.unit,
        price: g.price,
        sold_qty: r ? r.qty : 0,
        amount: r ? r.amount : 0,
        on_sale: g.on_sale,
        governance_status: g.governance_status
      }
    }).filter(g => g.sold_qty > 0)

    // 有效订单与明细分批读完，不设条数上限：清单少一行就是团长漏发一单
    const orders = await paging.fetchAll(() => this.db.collection('grouporder-order')
      .where({ activity_id: activity._id, status: ORDER.VALID })
      .orderBy('create_date', 'asc').orderBy('_id', 'asc'))

    const items = await paging.fetchAllByIds(orders.map(o => o._id), ids =>
      this.db.collection('grouporder-order-item')
        .where({ order_id: this.dbCmd.in(ids), status: ORDER.VALID })
        .orderBy('_id', 'asc'))
    const orderMap = new Map((orders || []).map(o => [o._id, o]))

    // 参与者明细：每条商品明细一行，同一订单的订单号与收货信息在多行重复（D-053）
    const detail = items.map(it => {
      const o = orderMap.get(it.order_id) || {}
      // 交付方式按订单自身（D-086）；自提单不输出地址
      const deliveryType = state.orderDeliveryTypeOf(o, activity)
      return {
        order_no: o.order_no || '',
        // 接龙码（D-115）：参与者取货时报的 4 位码；从未被查看过的老订单可能还没有
        order_code: o.order_code || '',
        delivery_type: deliveryType,
        consignee_name: o.consignee_name || '',
        consignee_mobile: o.consignee_mobile || '',
        consignee_address: deliveryType === DELIVERY.SELF_PICK ? '' : (o.consignee_address || ''),
        buyer_remark: o.buyer_remark || '',
        goods_name: it.goods_name,
        unit: it.unit_snapshot,
        price: it.price_snapshot,
        qty: it.qty,
        amount: it.amount,
        // 团长记录（D-100）：仅团长自己的对账记录，不影响清单口径
        leader_paid: o.leader_paid === 1 ? 1 : 0,
        leader_delivered: o.leader_delivered === 1 ? 1 : 0,
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
      delivery_types: state.deliveryTypesOf(activity),
      // 只支持自提的活动清单不输出地址列（D-060）；两种都支持时保留地址列，自提单留空（D-086）
      has_address_column: state.supportsDelivery(activity, DELIVERY.HOME),
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
      const withAddress = state.supportsDelivery(activity, DELIVERY.HOME)

      const leader = await this._leaderInfo(activity)
      const DELIVERY_TEXT = { [DELIVERY.HOME]: '送货上门', [DELIVERY.SELF_PICK]: '自提' }
      const c = v => this._cell(v)
      // 单表三段（D-149）：活动信息 → 商品汇总 → 参与者明细，段与段之间空一行
      const rows = []

      // 一、活动信息：两列「项目 | 内容」
      rows.push([c('活动信息')])
      const info = [
        ['活动名称', activity.title],
        ['活动短码', activity.short_code],
        ['团长', leader.name],
        ['团长电话', leader.mobile],
        ['团长微信', leader.wechat],
        ['开始时间', this._time(state.startTimeOf(activity))],
        ['截止时间', this._time(activity.actual_end_time || activity.end_time)],
        ['交付方式', state.deliveryTypesOf(activity).map(t => DELIVERY_TEXT[t] || '').filter(Boolean).join('、')]
      ]
      if (state.supportsDelivery(activity, DELIVERY.SELF_PICK) && activity.pickup_address) {
        info.push(['自提地址', activity.pickup_address])
      }
      info.push(
        ['有效订单数', collected.valid_order_count],
        ['总份数', collected.valid_total_qty],
        ['预计金额(元)', this._money(collected.estimated_amount)],
        ['清单生成时间', this._time(ctx.now)]
      )
      for (const [k, v] of info) rows.push([c(k), c(v)])
      rows.push([])

      // 二、商品汇总：每个有人买的商品一行（D-053、D-149）
      rows.push([c('商品汇总')])
      rows.push(['商品名称', '类别', '单位', '单价(元)', '已购买份数', '预计金额(元)', '备注'].map(c))
      for (const g of collected.goodsSummary) {
        const marks = []
        if (g.on_sale !== 1) marks.push('已停售')
        if (g.governance_status === 1) marks.push('已下架')
        rows.push([
          c(g.goods_name),
          c(g.category_text),
          c(g.unit),
          c(this._money(g.price)),
          c(g.sold_qty),
          c(this._money(g.amount)),
          c(marks.join('、'))
        ])
      }
      rows.push([c('合计'), c(''), c(''), c(''), c(collected.valid_total_qty), c(this._money(collected.estimated_amount)), c('')])
      rows.push([])

      // 三、参与者明细：每条商品明细一行；「交付方式」列按订单自身（D-086）。
      // 不输出订单号：接龙码同活动内唯一且是取货时报的号；老订单没有接龙码时用订单号兜底，保证同一订单的几行能对上（D-149）
      rows.push([c('参与者明细')])
      const header = ['接龙码', '交付方式', '收货人', '联系电话']
      if (withAddress) header.push('收货地址')
      header.push('商品名称', '单位', '单价(元)', '数量', '小计(元)', '买家备注', '收款记录', '取货记录')
      rows.push(header.map(c))
      for (const d of collected.detail) {
        const row = [
          c(d.order_code || d.order_no),
          c(DELIVERY_TEXT[d.delivery_type] || ''),
          c(d.consignee_name),
          c(d.consignee_mobile)
        ]
        if (withAddress) row.push(c(d.consignee_address))
        row.push(
          c(d.goods_name),
          c(d.unit),
          c(this._money(d.price)),
          c(d.qty),
          c(this._money(d.amount)),
          c(d.buyer_remark),   // 用户自由输入，文本型写入
          // 团长记录以生成清单时为准（D-100）；记录变化不使清单版本失效，需要最新记录时重新生成
          c(d.leader_paid ? '已收款' : ''),
          c(d.leader_delivered ? '已取货' : '')
        )
        rows.push(row)
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '接龙清单')
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

      // 文件名「日期_活动名」（D-149），下载时浏览器取路径最后一段作文件名；
      // 同一天可多次生成，每个版本单独一层目录（生成时间戳）避免同名覆盖
      const safeTitle = String(activity.title || '接龙清单').replace(/[\\/:*?"<>|#%\s]+/g, '_').slice(0, 40) || '接龙清单'
      const upload = await uniCloud.uploadFile({
        cloudPath: `grouporder/export/${activity._id}/${ctx.now}/${this._time(ctx.now, true)}_${safeTitle}.xlsx`,
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
