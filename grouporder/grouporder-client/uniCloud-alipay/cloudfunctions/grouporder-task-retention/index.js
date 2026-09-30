/**
 * grouporder-task-retention · 定时：三年留存到期
 * 触发：定时（每日）
 * 规格：D-035、DATA_MODEL §9、CLOUD_API §12
 *
 * 到期后删除或匿名化收货信息与账号关联，置 anonymized = 1；
 * 活动数量、份数、金额等【不可识别个人的汇总数据可长期保留】。
 *
 * 本函数只做匿名化，【不删除订单与明细】——汇总口径要保住。
 */
const BATCH_SIZE = 100

// 匿名化后的占位值。保留字段结构，避免下游读到 undefined
const ANONYMIZED = {
  consignee_name: '[已匿名化]',
  consignee_mobile: '',
  consignee_address: '',
  buyer_remark: '',
  address_id: ''
}

exports.main = async () => {
  const db = uniCloud.database()
  const dbCmd = db.command
  const now = Date.now()
  const result = { orders_anonymized: 0, cases_updated: 0, failed: 0, errors: [] }

  // ① 到期订单：匿名化收货三要素与账号关联
  const { data: orders } = await db.collection('grouporder-order')
    .where({
      retention_expire_date: dbCmd.lte(now),
      anonymized: dbCmd.neq(1)
    })
    .field({ _id: true, activity_id: true, order_no: true })
    .limit(BATCH_SIZE)
    .get()

  for (const o of (orders || [])) {
    try {
      // 只写 schema 已定义的字段；anonymized = 1 本身即到期标记
      await db.collection('grouporder-order').doc(o._id).update(
        Object.assign({ anonymized: 1 }, ANONYMIZED))
      result.orders_anonymized++
    } catch (e) {
      result.failed++
      result.errors.push({ order_id: o._id, message: e.message })
      console.error('[retention] 订单匿名化失败：', o._id, e)
    }
  }

  // ② 到期活动：标记 anonymized，活动本身不含个人信息，只做标记以便追溯
  try {
    await db.collection('grouporder-activity')
      .where({ retention_expire_date: dbCmd.lte(now), anonymized: dbCmd.neq(1) })
      .update({ anonymized: 1 })
  } catch (e) {
    result.failed++
    result.errors.push({ stage: 'activity', message: e.message })
  }

  // ③ 隐私事项：到期的登记事项推进为「已到期待处理」，供运营在 A-16 跟踪
  //    运营不能任意延长、缩短或绕过期限，因此这里只推进状态、不改期限
  try {
    const res = await db.collection('grouporder-privacy-case')
      .where({
        retention_expire: dbCmd.lte(now),
        status: dbCmd.in([1, 2])   // 已登记 / 限制处理中
      })
      .update({ status: 3 })       // 已到期待处理
    result.cases_updated = res.updated || 0
  } catch (e) {
    result.failed++
    result.errors.push({ stage: 'privacy_case', message: e.message })
  }

  result.has_more = (orders || []).length === BATCH_SIZE
  console.log('[retention]', JSON.stringify(result))
  return result
}
