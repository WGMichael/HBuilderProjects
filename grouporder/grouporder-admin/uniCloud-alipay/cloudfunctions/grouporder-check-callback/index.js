/**
 * grouporder-check-callback · 内容检测异步回调
 * 触发：内容安全服务的异步回调（HTTP 触发）
 * 规格：D-058、DATA_MODEL §10.3、CLOUD_API §12
 *
 * 图片异步检测【不阻塞审核放行】。回调命中时：
 * - 把对应商品（或整个活动）转为治理下架并留痕；
 * - 【不回退业务状态、不删除已有订单和明细】；
 * - 商品被下架时同步反写商品库封禁（D-064、GOODS_LIB_SPEC §8）。
 *
 * ⚠ 入参形态取决于最终选用的内容安全服务商，文档未指定。
 *   本函数按 { trace_id, result, hit_reason } 的通用形态解析，
 *   接入具体服务时只需改 parsePayload 与 verifySignature。
 *
 * 调用防护（回调结果会直接下架内容，不能让任何人伪造）：
 * ① 拒绝客户端调用：uniCloud 云函数 context.SOURCE 标识调用来源，
 *    'client' = 前端 uniCloud.callFunction，'http' = URL 化访问，'function' = 其他云函数调用，
 *    'timing' = 定时触发，'server' = 云端控制台/HBuilderX 上传运行。客户端来源一律拒绝。
 * ② 其余来源必须携带签名：密钥取自 uni-config-center 的 grouporder-check-callback/config.json
 *    （{ "secret": "..." }）；未配置密钥时一律拒绝——宁可回调失效，也不放行未验签的处置。
 */
const crypto = require('crypto')
const { contentcheck, goodslib, oplog, state } = require('grouporder-common')
const { GOVERNANCE } = state

// 签名时间戳允许的偏差：防止截获的回调被长期重放
const SIGN_TTL_MS = 5 * 60 * 1000

/** 读取回调密钥；模块或配置不存在都视为未配置 */
function getSecret () {
  try {
    const createConfig = require('uni-config-center')
    const secret = createConfig({ pluginId: 'grouporder-check-callback' }).config('secret')
    return typeof secret === 'string' ? secret : ''
  } catch (e) {
    console.error('[check-callback] 读取 uni-config-center 配置失败：', e.message)
    return ''
  }
}

/**
 * 验签（内部约定，接入真实服务商时按其签名规则改写本函数）：
 * sign = HMAC-SHA256(secret, `${trace_id}|${result}|${timestamp}`) 的 hex，
 * timestamp 为毫秒时间戳；sign / timestamp 可放在请求头 x-gc-sign / x-gc-timestamp 或回调体里。
 */
function verifySignature (event, body, payload, now) {
  const secret = getSecret()
  if (!secret) return { ok: false, reason: 'callback secret not configured' }
  const headers = (event && event.headers) || {}
  const sign = String(headers['x-gc-sign'] || body.sign || '')
  const timestamp = Number(headers['x-gc-timestamp'] || body.timestamp)
  if (!sign || !Number.isFinite(timestamp)) return { ok: false, reason: 'missing signature' }
  if (Math.abs(now - timestamp) > SIGN_TTL_MS) return { ok: false, reason: 'signature expired' }
  const expected = crypto.createHmac('sha256', secret)
    .update(`${payload.traceId}|${payload.result}|${timestamp}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(sign)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad signature' }
  return { ok: true }
}

/** 把服务商回调体归一为内部形态。接入真实服务时只改这里 */
function parsePayload (event) {
  let body = event || {}
  if (typeof body.body === 'string') {
    let raw = body.body
    // URL 化访问时请求体可能是 base64 编码
    if (body.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8')
    try { body = JSON.parse(raw) } catch (e) { body = {} }
  } else if (body.body) {
    body = body.body
  }
  return {
    body,
    traceId: body.trace_id || body.traceId || body.trace_ids || '',
    // 1 通过 2 命中需人工 3 明确违规拦截
    result: Number(body.result || body.check_result || contentcheck.RESULT.PASS),
    hitReason: body.hit_reason || body.label || ''
  }
}

exports.main = async (event, context) => {
  const db = uniCloud.database()
  const now = Date.now()

  // ① 客户端不得直接调用本回调（否则可伪造违规结果下架任意内容）
  const source = context && context.SOURCE
  if (source === 'client') {
    console.error('[check-callback] 拒绝客户端调用')
    return { errCode: 'FORBIDDEN', errMsg: 'client call not allowed' }
  }

  const payload = parsePayload(event)
  const { traceId, result, hitReason } = payload

  // ② 验签通过才处理
  const sig = verifySignature(event, payload.body, payload, now)
  if (!sig.ok) {
    console.error('[check-callback] 验签失败，忽略：', sig.reason, 'source=', source)
    return { errCode: 'FORBIDDEN', errMsg: sig.reason }
  }

  if (!traceId) {
    console.error('[check-callback] 回调缺少 trace_id，忽略：', JSON.stringify(event).slice(0, 500))
    return { errCode: 'INVALID_PARAM', errMsg: 'missing trace_id' }
  }

  // trace_id 上有索引，异步回调按它匹配
  const { data } = await db.collection('grouporder-content-check')
    .where({ trace_id: traceId }).limit(1).get()
  const record = data && data[0]
  if (!record) {
    console.error('[check-callback] 未找到 trace_id 对应的检测记录：', traceId)
    return { errCode: 'NOT_FOUND', errMsg: 'check record not found' }
  }

  // 回调可能重复投递，已处理过的记录直接返回成功
  if (record.check_result && record.check_result !== contentcheck.RESULT.PASS &&
      record.status !== contentcheck.STATUS.PENDING) {
    return { errCode: 0, data: { duplicated: true } }
  }

  const passed = result === contentcheck.RESULT.PASS
  const checkStatus = passed
    ? contentcheck.CHECK_STATUS.PASS
    : (result === contentcheck.RESULT.BLOCKED
      ? contentcheck.CHECK_STATUS.BLOCKED
      : contentcheck.CHECK_STATUS.NEED_REVIEW)

  await db.collection('grouporder-content-check').doc(record._id).update({
    check_result: result,
    hit_reason: hitReason,
    check_time: now,
    // 通过即放行；命中需人工的进入内容运营待办
    status: passed ? contentcheck.STATUS.RELEASED : contentcheck.STATUS.PENDING
  })

  // 按送检对象类型找表：商品库送检的 object_id 是库记录 id（goods_lib），不能当活动商品更新
  const targetColl = contentcheck.collectionOf(record.object_type)
  if (!targetColl) {
    console.error('[check-callback] 未知的送检对象类型：', record.object_type)
    return { errCode: 'INVALID_PARAM', errMsg: 'unknown object_type' }
  }
  await db.collection(targetColl).doc(record.object_id)
    .update({ img_check_status: checkStatus })
    .catch(e => console.error('[check-callback] 回写检测状态失败：', e))

  if (passed) {
    return { errCode: 0, data: { trace_id: traceId, passed: true } }
  }

  // 明确违规才转治理下架；「命中需人工」只进待办，不自动下架
  if (result !== contentcheck.RESULT.BLOCKED) {
    return { errCode: 0, data: { trace_id: traceId, passed: false, need_manual_review: true } }
  }

  // 系统身份的上下文：操作人为空，角色为空，审计里体现为系统动作
  const ctx = {
    db, now, uid: '', roles: [], permissions: [],
    requestId: `check_callback_${traceId}`
  }

  const { data: targetData } = await db.collection(targetColl).doc(record.object_id).get()
  const target = targetData && targetData[0]
  if (!target) return { errCode: 'NOT_FOUND', errMsg: 'target not found' }

  // 商品库记录没有治理下架状态：img_check_status = 已拦截（上面已回写）即不可复用（libList.selectable），
  // 团长须换图后重新送检；不置 governance_blocked，那是「商品被平台下架」的反写标记（D-064）
  if (record.object_type === contentcheck.OBJECT_TYPE.GOODS_LIB) {
    await oplog.success(ctx, {
      action_type: oplog.ACTION.GOODS_LIB_BLOCKED,
      object_type: 'goods_lib',
      object_id: target._id,
      case_no: record._id,
      reason: `商品库图片内容检测异步回调命中：${hitReason || '违规内容'}`,
      prev_state: { img_check_status: target.img_check_status || 0 },
      next_state: { img_check_status: checkStatus }
    })
    return { errCode: 0, data: { trace_id: traceId, lib_img_blocked: true } }
  }

  if (target.governance_status === GOVERNANCE.OFF) {
    return { errCode: 0, data: { trace_id: traceId, already_off: true } }
  }

  const res = await db.collection(targetColl)
    .where({ _id: target._id, governance_status: GOVERNANCE.NORMAL })
    .update({
      governance_status: GOVERNANCE.OFF,
      governance_time: now,
      governance_reason: `图片内容检测命中：${hitReason || '违规内容'}`,
      // 活动才有这两个字段
      ...(record.object_type === 'activity'
        ? { governance_type: 'content_check', ever_governed: 1 }
        : {})
    })
  if (!res.updated) {
    return { errCode: 0, data: { trace_id: traceId, already_off: true } }
  }

  let blocked = []
  if (record.object_type === 'goods') {
    const { data: actData } = await db.collection('grouporder-activity')
      .doc(target.activity_id).get().catch(() => ({ data: [] }))
    const leaderUid = actData && actData[0] ? actData[0].leader_uid : ''
    if (leaderUid) {
      // 图片被判定命中的商品，其商品库记录同样封禁（GOODS_LIB_SPEC §8）
      blocked = await goodslib.blockLibByGoods(ctx, target, leaderUid, record._id)
    }
  }

  await oplog.success(ctx, {
    action_type: record.object_type === 'goods'
      ? oplog.ACTION.GOODS_GOVERNANCE_OFF
      : oplog.ACTION.ACTIVITY_GOVERNANCE_OFF,
    object_type: record.object_type,
    object_id: target._id,
    case_no: record._id,
    reason: `图片内容检测异步回调命中：${hitReason || '违规内容'}`,
    prev_state: { governance_status: GOVERNANCE.NORMAL },
    next_state: { governance_status: GOVERNANCE.OFF }
  })

  // 不回退业务状态、不删除已有订单和明细
  return {
    errCode: 0,
    data: { trace_id: traceId, governance_off: true, blocked_lib_ids: blocked }
  }
}
