/**
 * 清单 Excel 的事件记录与临时地址换取（OPS §10、D-071、D-073）
 *
 * 硬约束：
 * - 表里存的是 file_version（生成标识/版本号），【绝不写入任何下载地址】；
 * - 每次下载都重新校验权限并重新换取临时地址，有效期 30 分钟，不缓存不复用；
 * - 地址不写入任何日志或页面。
 *
 * 本模块被 grouporder-export-co（团长侧）与 grouporder-ops-co（后台侧）共用，
 * 两处换地址的逻辑只能有一份。
 */

const EVENT = {
  GENERATE_OK: 1,
  GENERATE_FAIL: 2,
  DOWNLOAD_OK: 3,
  DOWNLOAD_FAIL: 4,
  PERMISSION_DENIED: 5
}

// D-071①：临时下载地址有效期 30 分钟
const TEMP_URL_TTL_SECONDS = 30 * 60
// D-071②：文件在云存储保留 60 天
const FILE_RETENTION_DAYS = 60

/**
 * 写一条 Excel 事件。
 * @param {object} entry { activity_id, leader_uid, file_version, event_type,
 *                         permission_check_result, link_valid_result, fail_reason }
 */
async function write (ctx, entry) {
  try {
    const doc = {
      activity_id: entry.activity_id,
      leader_uid: entry.leader_uid,
      request_uid: entry.request_uid || ctx.uid || '',
      file_version: entry.file_version || '',
      event_type: entry.event_type,
      permission_check_result: entry.permission_check_result || '',
      link_valid_result: entry.link_valid_result || '',
      fail_reason: entry.fail_reason || '',
      request_id: entry.request_id || ctx.requestId,
      create_date: ctx.now
    }
    // 兜底：任何看起来像地址的值都不许落库
    for (const [k, v] of Object.entries(doc)) {
      if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
        doc[k] = '[已屏蔽]'
      }
    }
    await ctx.db.collection('grouporder-export-log').add(doc)
  } catch (e) {
    console.error('[exportlog] 事件写入失败：', e)
  }
}

/**
 * 换取临时下载地址。调用方必须在调用前【重新完成权限校验】。
 * 返回值只回给前端当次使用，不得写入日志、不得缓存。
 */
async function grantTempUrl (fileID) {
  const res = await uniCloud.getTempFileURL({
    fileList: [fileID],
    maxAge: TEMP_URL_TTL_SECONDS
  })
  const item = res.fileList && res.fileList[0]
  if (!item || !item.tempFileURL) {
    const err = new Error('临时下载地址换取失败')
    err.errCode = 'NOT_FOUND'
    throw err
  }
  return { url: item.tempFileURL, expiresIn: TEMP_URL_TTL_SECONDS }
}

/**
 * 某活动最近一次「使统计口径变化」的时间（D-051）。
 * 目前只有团长作废订单会触发，取最近一次 void_time。
 */
async function lastInvalidatingTime (ctx, activityId) {
  const { data } = await ctx.db.collection('grouporder-order')
    .where({ activity_id: activityId, status: 3 })
    .field({ void_time: true })
    .orderBy('void_time', 'desc')
    .limit(1)
    .get()
  return (data && data[0] && data[0].void_time) || 0
}

/**
 * 判断某个清单版本是否已失效。
 *
 * 失效是【派生状态】而不是落库字段：版本生成后若有订单被作废，统计口径即已变化。
 * 之所以不加落库标记，是因为 grouporder-export-log 的 schema 已定稿、
 * 没有承载该状态的字段，而派生判定不需要改表，也不会出现标记漏写的幽灵状态
 * （同 DATA_MODEL §4.1 说明 7 与 D-062 的一贯取舍）。
 */
async function isVersionInvalidated (ctx, activityId, versionCreateDate) {
  const t = await lastInvalidatingTime(ctx, activityId)
  return t > versionCreateDate
}

/** 取该活动当前的清单版本列表，失效状态按 §D-051 现场推导 */
async function listVersions (ctx, activityId) {
  const [gen, invalidAt] = await Promise.all([
    ctx.db.collection('grouporder-export-log')
      .where({ activity_id: activityId, event_type: EVENT.GENERATE_OK })
      .orderBy('create_date', 'desc')
      .limit(50)
      .get(),
    lastInvalidatingTime(ctx, activityId)
  ])
  return (gen.data || []).map(d => ({
    file_version: d.file_version,
    create_date: d.create_date,
    invalidated: invalidAt > d.create_date
  }))
}

module.exports = {
  EVENT,
  TEMP_URL_TTL_SECONDS,
  FILE_RETENTION_DAYS,
  write,
  grantTempUrl,
  lastInvalidatingTime,
  isVersionInvalidated,
  listVersions
}
