/**
 * grouporder-task-autoclose · 定时：活动自动截止
 * 触发：定时（建议每分钟）
 * 规格：DATA_MODEL §5.1、CLOUD_API §12
 *
 * - 到期活动自动置已截止；
 * - 【审核中到期直接进已截止】，之后即使审核通过也不重开；
 * - 活动在下架期间到期的同样按已截止处理，不能通过恢复重新开放；
 * - 截止时写入 retention_expire_date（该日 +3 年），订单继承（D-035）。
 */
const { state, snapshot } = require('grouporder-common')
const { ACTIVITY, END_TYPE } = state

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
      // 带条件更新：并发下只有一次生效，重复执行不会覆盖已有结果
      const res = await db.collection('grouporder-activity')
        .where({ _id: a._id, status: a.status })
        .update({
          status: ACTIVITY.CLOSED,
          // 实际截止时间取计划截止时间，而不是任务的执行时间——
          // 任务延迟不应让清单上的截止时间往后漂
          actual_end_time: a.end_time,
          end_type: END_TYPE.AUTO
        })
      if (!res.updated) continue

      await snapshot.stampRetention(ctx, a._id, a.end_time)
      result.closed++
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
