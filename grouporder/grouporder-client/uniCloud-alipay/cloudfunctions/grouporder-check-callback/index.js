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
 *   接入具体服务时只需改 parsePayload。
 */
const { contentcheck, goodslib, oplog, state } = require('grouporder-common')
const { GOVERNANCE } = state

/** 把服务商回调体归一为内部形态。接入真实服务时只改这里 */
function parsePayload (event) {
  let body = event
  if (typeof event.body === 'string') {
    try { body = JSON.parse(event.body) } catch (e) { body = {} }
  } else if (event.body) {
    body = event.body
  }
  return {
    traceId: body.trace_id || body.traceId || body.trace_ids || '',
    // 1 通过 2 命中需人工 3 明确违规拦截
    result: Number(body.result || body.check_result || contentcheck.RESULT.PASS),
    hitReason: body.hit_reason || body.label || ''
  }
}

exports.main = async (event) => {
  const db = uniCloud.database()
  const now = Date.now()
  const { traceId, result, hitReason } = parsePayload(event)

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

  const targetColl = record.object_type === 'goods' ? 'grouporder-goods' : 'grouporder-activity'
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

  const { data: targetData } = await db.collection(targetColl).doc(record.object_id).get()
  const target = targetData && targetData[0]
  if (!target) return { errCode: 'NOT_FOUND', errMsg: 'target not found' }

  if (target.governance_status === GOVERNANCE.OFF) {
    return { errCode: 0, data: { trace_id: traceId, already_off: true } }
  }

  // 系统身份的上下文：操作人为空，角色为空，审计里体现为系统动作
  const ctx = {
    db, now, uid: '', roles: [], permissions: [],
    requestId: `check_callback_${traceId}`
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
