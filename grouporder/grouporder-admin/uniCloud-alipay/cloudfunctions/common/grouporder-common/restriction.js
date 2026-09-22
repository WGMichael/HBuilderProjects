/**
 * 发布者处置与发布限制（OPS §7、DATA_MODEL §10.4、§10.9）
 *
 * 分工固定：
 * - grouporder-restriction  处置流水，审计依据，只追加不修改
 * - grouporder-user-ext     当前状态，校验依据，随流水在同一操作序列内更新
 * 两者不可互相替代。
 *
 * 临时限制到期【不依赖定时任务准点执行】：读取时当前时间超过 restriction_expire
 * 即视为正常（§10.9）。
 */
const { throwBiz } = require('./errors')
const { buildBizNo } = require('./idempotent')

// grouporder-restriction.action_type
const ACTION = { WARN: 1, LIMIT_TEMP: 2, LIMIT_PERM: 3, RELEASE: 4 }
// grouporder-user-ext.publish_restriction
const STATUS = { NORMAL: 0, TEMP: 1, PERM: 2 }

/** 读当前发布权限状态；到期的临时限制在读取时即视为正常 */
async function getStatus (ctx, uid) {
  const { data } = await ctx.db.collection('grouporder-user-ext')
    .where({ user_id: uid }).limit(1).get()
  const ext = data && data[0]
  if (!ext) return { status: STATUS.NORMAL, expire: null, caseNo: '', doc: null }

  let status = ext.publish_restriction || STATUS.NORMAL
  if (status === STATUS.TEMP && ext.restriction_expire && ctx.now >= ext.restriction_expire) {
    status = STATUS.NORMAL
  }
  return {
    status,
    expire: ext.restriction_expire || null,
    caseNo: ext.restriction_case_no || '',
    doc: ext
  }
}

/**
 * 创建与提交发布活动时都要校验（DATA_MODEL §10.0）。
 * 这是必经路径，两个入口都不能漏。
 */
async function assertCanPublish (ctx, uid) {
  const { status, expire } = await getStatus(ctx, uid)
  if (status === STATUS.PERM) {
    throwBiz('FORBIDDEN', '当前账号已被永久限制发布活动')
  }
  if (status === STATUS.TEMP) {
    throwBiz('FORBIDDEN', '当前账号处于临时发布限制中，限制期结束后可继续发起活动', {
      restriction_expire: expire
    })
  }
  return true
}

/** upsert grouporder-user-ext 的当前状态 */
async function setStatus (ctx, uid, patch) {
  const coll = ctx.db.collection('grouporder-user-ext')
  const { data } = await coll.where({ user_id: uid }).limit(1).get()
  if (data && data[0]) {
    await coll.doc(data[0]._id).update(Object.assign({ update_date: ctx.now }, patch))
  } else {
    await coll.add(Object.assign({
      user_id: uid,
      publish_restriction: STATUS.NORMAL,
      create_date: ctx.now,
      update_date: ctx.now
    }, patch))
  }
}

/**
 * 执行一次处置，写流水 + 同步当前状态。
 *
 * 警告是处置记录，【不改变账号状态】（OPS §7）。
 * 相同状态的重复操作不重复生效，返回当前结果。
 *
 * @param {object} input { targetUid, actionType, reason, violationType,
 *                         effectiveFrom, effectiveTo, relatedReportId }
 * @returns {object} { changed, case_no, prev_status, next_status }
 */
async function apply (ctx, input) {
  const { targetUid, actionType, reason } = input
  if (!reason || !String(reason).trim()) {
    throwBiz('INVALID_PARAM', '处置原因必填')
  }

  const current = await getStatus(ctx, targetUid)
  const prevStatus = current.status

  let nextStatus = prevStatus
  let expire = current.expire
  switch (actionType) {
    case ACTION.WARN:
      // 警告不改变账号状态
      break
    case ACTION.LIMIT_TEMP:
      if (!input.effectiveTo || input.effectiveTo <= ctx.now) {
        throwBiz('INVALID_PARAM', '临时限制必须指定一个晚于当前时间的截止时间')
      }
      nextStatus = STATUS.TEMP
      expire = input.effectiveTo
      break
    case ACTION.LIMIT_PERM:
      nextStatus = STATUS.PERM
      expire = null
      break
    case ACTION.RELEASE:
      if (prevStatus === STATUS.NORMAL) {
        // 重复解除：不重复生效，返回当前结果
        return { changed: false, case_no: current.caseNo, prev_status: prevStatus, next_status: prevStatus }
      }
      nextStatus = STATUS.NORMAL
      expire = null
      break
    default:
      throwBiz('INVALID_PARAM', '未知的处置类型')
  }

  const caseNo = buildBizNo('RST', ctx.now)
  await ctx.db.collection('grouporder-restriction').add({
    case_no: caseNo,
    target_uid: targetUid,
    action_type: actionType,
    violation_type: input.violationType || '',
    reason: String(reason).trim(),
    related_report_id: input.relatedReportId || '',
    effective_from: actionType === ACTION.LIMIT_TEMP ? (input.effectiveFrom || ctx.now) : null,
    effective_to: actionType === ACTION.LIMIT_TEMP ? input.effectiveTo : null,
    operator_uid: ctx.uid,
    prev_status: prevStatus,
    next_status: nextStatus,
    create_date: ctx.now
  })

  // 警告不写当前状态表，避免把处置记录误读成账号状态
  if (actionType !== ACTION.WARN) {
    await setStatus(ctx, targetUid, {
      publish_restriction: nextStatus,
      restriction_expire: expire,
      restriction_case_no: caseNo
    })
  }

  return {
    changed: actionType === ACTION.WARN ? true : prevStatus !== nextStatus,
    case_no: caseNo,
    prev_status: prevStatus,
    next_status: nextStatus
  }
}

module.exports = { ACTION, STATUS, getStatus, assertCanPublish, setStatus, apply }
