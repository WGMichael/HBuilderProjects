/**
 * grouporder-task-retention · 定时：三年留存到期
 * 触发：定时（每日）
 * 规格：D-035、DATA_MODEL §9、CLOUD_API §12
 *
 * 到期后删除或匿名化收货信息与账号关联，置 anonymized = 1；
 * 活动数量、份数、金额等【不可识别个人的汇总数据可长期保留】。
 *
 * 本函数只做匿名化，【不删除订单与明细】——汇总口径要保住。
 *
 * 单次执行在时间预算内循环处理多批，直到没有到期未匿名化的订单；
 * 已处理的订单 anonymized = 1，不会被下一批重复选中。
 *
 * ⚠ 账号关联（user_id）暂未匿名化：D-035 / DATA_MODEL §9 要求匿名化「账号关联」，
 *   但未规定字段与占位值（user_id 在订单与明细两表都是必填，且参与限购、我的订单等查询），
 *   待文档明确后再补。
 */
const BATCH_SIZE = 100
// 单次执行的时间预算：package.json 中 timeout = 60 秒，留出余量写日志并返回
const TIME_BUDGET_MS = 50 * 1000
// 单次执行中失败订单的上限：超过即停止，避免同一批异常数据反复重试耗尽预算
const MAX_FAILED = 200

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
  const result = { orders_anonymized: 0, cases_updated: 0, failed: 0, batches: 0, errors: [] }

  // ① 到期订单：匿名化收货信息（账号关联见文件头说明）
  // 本次执行中失败的订单排除出后续批次，否则会被反复选中
  const failedIds = []
  let hasMore = true
  while (hasMore && Date.now() - now < TIME_BUDGET_MS && failedIds.length < MAX_FAILED) {
    const where = {
      retention_expire_date: dbCmd.lte(now),
      anonymized: dbCmd.neq(1)
    }
    if (failedIds.length) where._id = dbCmd.nin(failedIds)
    const { data: orders } = await db.collection('grouporder-order')
      .where(where)
      .field({ _id: true })
      .limit(BATCH_SIZE)
      .get()
    const ids = (orders || []).map(o => o._id)
    hasMore = ids.length === BATCH_SIZE
    if (!ids.length) break
    result.batches++

    // 只写 schema 已定义的字段；anonymized = 1 本身即到期标记。
    // 整批一次更新；带 anonymized 条件，并发重入时不重复计数
    const patch = Object.assign({ anonymized: 1 }, ANONYMIZED)
    try {
      const res = await db.collection('grouporder-order')
        .where({ _id: dbCmd.in(ids), anonymized: dbCmd.neq(1) })
        .update(patch)
      result.orders_anonymized += res.updated || 0
    } catch (e) {
      // 整批失败时逐条重试，定位具体失败的订单
      console.error('[retention] 批量匿名化失败，改为逐条处理：', e)
      for (const id of ids) {
        try {
          await db.collection('grouporder-order').doc(id).update(patch)
          result.orders_anonymized++
        } catch (err) {
          failedIds.push(id)
          result.failed++
          if (result.errors.length < 20) result.errors.push({ order_id: id, message: err.message })
          console.error('[retention] 订单匿名化失败：', id, err)
        }
      }
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

  // 预算用尽或失败过多而提前停止时为 true，剩余部分由次日继续
  result.has_more = hasMore
  console.log('[retention]', JSON.stringify(result))
  return result
}
