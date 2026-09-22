/**
 * 内容版本与重新送审（D-043、D-048、D-057、GOODS_LIB_SPEC §5.4）
 *
 * 放在 common 的原因：libCopyToActivity 在 goods-co 里，
 * 但它向活动新增商品，按 D-048 要让活动重新进审核——这是跨对象逻辑。
 */
const { ACTIVITY, REVIEW_RESULT } = require('./state')

/**
 * 哪些改动触发重新审核（D-048）。
 * 文字、图片等内容改动 → 触发；价格、单位、总库存、每人限购、停售状态 → 不触发。
 */
const CONTENT_FIELDS = [
  'title', 'description', 'cover_image', 'images',
  'name', 'detail_images'
]

function isContentChange (patch) {
  return Object.keys(patch || {}).some(k => CONTENT_FIELDS.includes(k))
}

/**
 * 内容版本递增。审核结论绑定提交时固化的版本，
 * 团长在审核期间再次编辑会产生新版本并重新排队（OPS §4.3）。
 */
async function bumpContentVersion (ctx, activityId) {
  const dbCmd = ctx.db.command
  await ctx.db.collection('grouporder-activity').doc(activityId).update({
    content_version: dbCmd.inc(1)
  })
}

/**
 * 内容改动后按活动当前状态决定要不要重新送审。
 *
 * - 草稿：不改变任何状态，只递增版本
 * - 审核中：递增版本，重新排队（状态不变，仍是审核中）
 * - 进行中：退回审核中，审核通过前暂停接龙（D-048）
 * - 已截止 / 已取消：调用方应在更早的位置就已拒绝，这里兜底不处理
 *
 * @returns {object} { need_recheck, next_status }
 */
async function applyContentChange (ctx, activity) {
  await bumpContentVersion(ctx, activity._id)

  if (activity.status === ACTIVITY.ONGOING) {
    await ctx.db.collection('grouporder-activity').doc(activity._id).update({
      status: ACTIVITY.REVIEWING,
      review_submit_date: ctx.now,
      review_result: REVIEW_RESULT.NONE,
      review_uid: '',
      review_time: null,
      review_reason: ''
    })
    return { need_recheck: true, next_status: ACTIVITY.REVIEWING }
  }

  if (activity.status === ACTIVITY.REVIEWING) {
    await ctx.db.collection('grouporder-activity').doc(activity._id).update({
      review_submit_date: ctx.now
    })
    return { need_recheck: true, next_status: ACTIVITY.REVIEWING }
  }

  return { need_recheck: false, next_status: activity.status }
}

/**
 * 活动内容是否允许被编辑：草稿、审核中、进行中且未截止都允许（D-048）。
 */
function canEditContent (activity, now) {
  if (activity.status === ACTIVITY.CLOSED || activity.status === ACTIVITY.CANCELLED) return false
  if (activity.end_time && now >= activity.end_time) return false
  return true
}

module.exports = {
  CONTENT_FIELDS,
  isContentChange,
  bumpContentVersion,
  applyContentChange,
  canEditContent
}
