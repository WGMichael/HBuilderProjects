/**
 * 活动到期截止（DATA_MODEL §5.1）
 *
 * 定时任务 grouporder-task-autoclose 与「读时补截止」共用：
 * 审核中 / 进行中的活动只要服务端时间已过 end_time，就按同一口径置为已结束——
 * 定时任务晚跑或没跑时，团长一读到活动，数据库与显示、复制源、清单导出等下游判断就立即一致。
 * 带条件更新：与定时任务并发时只有一次生效，重复执行无副作用。
 */
const { ACTIVITY, END_TYPE } = require('./state')
const snapshot = require('./snapshot')

/** 是否已到期但尚未截止 */
function isExpiredOpen (a, now) {
  return !!a && (a.status === ACTIVITY.REVIEWING || a.status === ACTIVITY.ONGOING) &&
    !!a.end_time && now >= a.end_time
}

/**
 * 到期则截止。会就地把传入对象改为已结束，供调用方直接返回。
 * @returns {Promise<boolean>} 本次调用是否真正写入（并发下被别处抢先则为 false）
 */
async function closeIfExpired (ctx, a) {
  if (!isExpiredOpen(a, ctx.now)) return false
  const res = await ctx.db.collection('grouporder-activity')
    .where({ _id: a._id, status: a.status })
    .update({
      status: ACTIVITY.CLOSED,
      // 实际截止时间取计划截止时间，不取发现时间：延迟发现不让清单上的截止时间往后漂
      actual_end_time: a.end_time,
      end_type: END_TYPE.AUTO
    })
  if (res.updated) await snapshot.stampRetention(ctx, a._id, a.end_time)
  Object.assign(a, { status: ACTIVITY.CLOSED, actual_end_time: a.actual_end_time || a.end_time, end_type: a.end_type || END_TYPE.AUTO })
  return !!res.updated
}

/** 批量：只处理其中已到期的，逐个截止；单个失败不影响其余与主流程 */
async function closeExpiredIn (ctx, list) {
  for (const a of (list || [])) {
    if (!isExpiredOpen(a, ctx.now)) continue
    try { await closeIfExpired(ctx, a) } catch (e) { console.error('[lifecycle] 读时补截止失败：', a._id, e) }
  }
}

module.exports = { isExpiredOpen, closeIfExpired, closeExpiredIn }
