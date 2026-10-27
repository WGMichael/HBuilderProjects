/**
 * grouporder-task-autoclose · 定时：活动自动截止
 * 触发：定时（建议每分钟）
 * 规格：DATA_MODEL §5.1、CLOUD_API §12
 *
 * - 到期活动自动置已结束；
 * - 【审核中到期直接进已结束】，之后即使审核通过也不重开；
 * - 活动在下架期间到期的同样按已结束处理，不能通过恢复重新开放；
 * - 截止时写入 retention_expire_date（该日 +3 年），订单继承（D-035）。
 */
const { state, lifecycle } = require('grouporder-common')
const { ACTIVITY } = state

const BATCH_SIZE = 100

exports.main = async () => {
  const db = uniCloud.database()
  const dbCmd = db.command
  const now = Date.now()
  // 定时函数没有登录态，构造一个最小上下文供 common 使用
  const ctx = { db, now, uid: '', roles: [], permissions: [], requestId: `autoclose_${now}` }

  const result = { scanned: 0, closed: 0, failed: 0, errors: [] }

  // 审核中与进行中的活动都要扫（索引 status + end_time）
  const { data } = await db.collection('grouporder-activity')
    .where({
      status: dbCmd.in([ACTIVITY.REVIEWING, ACTIVITY.ONGOING]),
      end_time: dbCmd.lte(now)
    })
    .field({ _id: true, status: true, end_time: true, title: true })
    .limit(BATCH_SIZE)
    .get()

  result.scanned = (data || []).length

  for (const a of (data || [])) {
    try {
      // 与「读时补截止」共用 common/lifecycle：带条件更新，并发下只有一次生效
      if (await lifecycle.closeIfExpired(ctx, a)) result.closed++
    } catch (e) {
      result.failed++
      result.errors.push({ activity_id: a._id, message: e.message })
      console.error('[autoclose] 活动自动截止失败：', a._id, e)
    }
  }

  // 一批处理不完时下一次定时继续，不在单次调用里无限循环
  result.has_more = result.scanned === BATCH_SIZE
  console.log('[autoclose]', JSON.stringify(result))
  return result
}
