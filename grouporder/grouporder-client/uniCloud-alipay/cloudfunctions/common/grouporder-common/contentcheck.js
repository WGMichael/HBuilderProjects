/**
 * 内容检测（D-043、D-058、DATA_MODEL §10.3）
 *
 * 本模块承担三件事：
 * 1. 送检的【发起】与 grouporder-content-check 记录的写入；
 * 2. trace_id 的生成与异步回调的匹配；
 * 3. 文本同步、图片异步的分工——图片检测【不阻塞审核放行】。
 *
 * ⚠ 检测服务供应商在现有文档中未指定（PRD / DECISIONS / DATA_MODEL 均无结论）。
 *   因此 invokeProvider 目前是待接入的适配层：默认按【通过】处理并在服务端打日志，
 *   接入真实接口时只改这一个函数，其余链路与表结构不动。
 */

const CONTENT_TYPE = { TEXT: 'text', IMAGE: 'image' }
const OBJECT_TYPE = { ACTIVITY: 'activity', GOODS: 'goods' }
// check_result：1 通过 2 命中需人工 3 明确违规拦截
const RESULT = { PASS: 1, NEED_REVIEW: 2, BLOCKED: 3 }
// status：1 待复核 2 已放行 3 维持拦截 4 已处置
const STATUS = { PENDING: 1, RELEASED: 2, KEPT: 3, HANDLED: 4 }
// 对象表上的 *_check_status：0 待检 1 通过 2 待人工复核 3 已拦截
const CHECK_STATUS = { PENDING: 0, PASS: 1, NEED_REVIEW: 2, BLOCKED: 3 }

function genTraceId (now) {
  return `trace_${now}_${Math.random().toString(36).slice(2, 12)}`
}

/**
 * 供应商适配层。接入真实内容安全接口时只改这里。
 * @returns {object} { check_result, hit_reason }
 */
async function invokeProvider (contentType, payload) {
  console.warn('[contentcheck] 内容检测服务尚未接入，本次按通过处理。contentType=', contentType)
  return { check_result: RESULT.PASS, hit_reason: '' }
}

/** 写一条检测记录 */
async function createRecord (ctx, doc) {
  const record = {
    object_type: doc.object_type,
    object_id: doc.object_id,
    content_type: doc.content_type,
    // content_version 在 schema 中是 string，活动上是 int，写入时统一转字符串
    content_version: String(doc.content_version),
    content_snapshot: doc.content_snapshot || {},
    trace_id: doc.trace_id || '',
    check_time: ctx.now,
    check_result: doc.check_result,
    hit_reason: doc.hit_reason || '',
    status: doc.status,
    create_date: ctx.now
  }
  const res = await ctx.db.collection('grouporder-content-check').add(record)
  return Object.assign({ _id: res.id }, record)
}

/**
 * 文本检测：同步返回，影响放行。
 * 自动审核模式下文本通过即可放行（D-058）。
 */
async function checkText (ctx, { objectType, objectId, contentVersion, snapshot }) {
  const ret = await invokeProvider(CONTENT_TYPE.TEXT, snapshot)
  const status = ret.check_result === RESULT.PASS ? STATUS.RELEASED : STATUS.PENDING
  const record = await createRecord(ctx, {
    object_type: objectType,
    object_id: objectId,
    content_type: CONTENT_TYPE.TEXT,
    content_version: contentVersion,
    content_snapshot: snapshot,
    check_result: ret.check_result,
    hit_reason: ret.hit_reason,
    status
  })
  return record
}

/**
 * 图片送检：异步，【不阻塞审核放行】（D-058）。
 * 只登记记录并返回 trace_id，结果由 grouporder-check-callback 回填。
 */
async function submitImages (ctx, { objectType, objectId, contentVersion, fileIds }) {
  const files = (fileIds || []).filter(Boolean)
  if (!files.length) return null
  const traceId = genTraceId(ctx.now)
  await createRecord(ctx, {
    object_type: objectType,
    object_id: objectId,
    content_type: CONTENT_TYPE.IMAGE,
    content_version: contentVersion,
    content_snapshot: { files },
    trace_id: traceId,
    check_result: RESULT.PASS,   // 未回调前不作违规判断
    hit_reason: '',
    status: STATUS.PENDING
  })
  // 真实接入后在此提交异步检测任务，携带 traceId 作为回调匹配键
  console.warn('[contentcheck] 图片异步检测尚未接入，trace_id=', traceId)
  return traceId
}

/**
 * 活动提交审核时的一次性送检：活动文本 + 活动图片 + 各商品文本与图片。
 * 返回文本检测是否整体通过，决定自动模式下能否直接放行。
 */
async function checkOnSubmit (ctx, activity, goodsList) {
  const version = activity.content_version || 1

  const activityText = await checkText(ctx, {
    objectType: OBJECT_TYPE.ACTIVITY,
    objectId: activity._id,
    contentVersion: version,
    snapshot: { title: activity.title, description: activity.description || '' }
  })

  let textPass = activityText.check_result === RESULT.PASS
  const blocked = []
  if (!textPass) blocked.push({ type: 'activity', id: activity._id, reason: activityText.hit_reason })

  for (const g of goodsList) {
    const r = await checkText(ctx, {
      objectType: OBJECT_TYPE.GOODS,
      objectId: g._id,
      contentVersion: version,
      snapshot: { name: g.name, description: g.description || '' }
    })
    if (r.check_result !== RESULT.PASS) {
      textPass = false
      blocked.push({ type: 'goods', id: g._id, name: g.name, reason: r.hit_reason })
    }
  }

  // 图片一律异步，不参与放行判定
  await submitImages(ctx, {
    objectType: OBJECT_TYPE.ACTIVITY,
    objectId: activity._id,
    contentVersion: version,
    fileIds: [activity.cover_image, ...(activity.images || [])].map(f => (f && f.fileID) || f)
  })
  for (const g of goodsList) {
    await submitImages(ctx, {
      objectType: OBJECT_TYPE.GOODS,
      objectId: g._id,
      contentVersion: version,
      fileIds: [g.cover_image, ...(g.detail_images || [])].map(f => (f && f.fileID) || f)
    })
  }

  const textStatus = textPass ? CHECK_STATUS.PASS : CHECK_STATUS.NEED_REVIEW
  await ctx.db.collection('grouporder-activity').doc(activity._id).update({
    text_check_status: textStatus
  })

  return { textPass, blocked }
}

module.exports = {
  CONTENT_TYPE,
  OBJECT_TYPE,
  RESULT,
  STATUS,
  CHECK_STATUS,
  genTraceId,
  invokeProvider,
  createRecord,
  checkText,
  submitImages,
  checkOnSubmit
}
