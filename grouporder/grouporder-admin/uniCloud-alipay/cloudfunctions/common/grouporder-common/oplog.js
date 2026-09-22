/**
 * 统一操作日志（OPS §13、DATA_MODEL §10.8）
 *
 * 三条硬约束：
 * 1. 后台方法【成功与拒绝都要写】；
 * 2. action_type 只能取 §10.8 枚举表的值，不自行命名；
 * 3. 不记录密码等凭证，不记录可继续使用的下载地址（D-071③），
 *    除必要证据外不重复保存完整姓名、电话、地址。
 */
const { buildBizNo } = require('./idempotent')

// §10.8 枚举表。取值一律从这里引用，禁止在业务代码里写字符串字面量。
const ACTION = {
  // 1 运营账号状态与角色
  //   登录成功/失败【不在本表】：uni-id-co 已在服务端写 uni-id-log
  //   （lib/utils/login.js 的 postLogin 与 preLogin 的 catch），客户端伪造不了，
  //   比再造一份可靠。A-14 登录日志 tab 直接读那张表（ADM-13 已裁定两页不合并）。
  ACCOUNT_DISABLED: 'account_disabled',
  ROLE_CHANGED: 'role_changed',
  // 1b 活动发布审核
  ACTIVITY_REVIEW_PASS: 'activity_review_pass',
  ACTIVITY_REVIEW_REJECT: 'activity_review_reject',
  ACTIVITY_REVIEW_FAILED: 'activity_review_failed',
  // 1c 平台配置
  CONFIG_CHANGED: 'config_changed',
  // 2 举报处理
  REPORT_CLAIM: 'report_claim',
  REPORT_CONCLUDE: 'report_conclude',
  REPORT_CLOSE: 'report_close',
  REPORT_RECHECK: 'report_recheck',
  REPORT_RESULT_CHANGED: 'report_result_changed',
  // 3 内容检测复核
  DETECT_VIEW: 'detect_view',
  DETECT_RECHECK: 'detect_recheck',
  DETECT_HANDLE: 'detect_handle',
  // 4 活动与商品治理
  ACTIVITY_GOVERNANCE_OFF: 'activity_governance_off',
  ACTIVITY_GOVERNANCE_ON: 'activity_governance_on',
  GOODS_GOVERNANCE_OFF: 'goods_governance_off',
  GOODS_GOVERNANCE_ON: 'goods_governance_on',
  GOODS_LIB_BLOCKED: 'goods_lib_blocked',
  GOVERNANCE_FAILED: 'governance_failed',
  // 5 发布者处置
  PUBLISHER_WARN: 'publisher_warn',
  PUBLISHER_LIMIT_TEMP: 'publisher_limit_temp',
  PUBLISHER_LIMIT_PERM: 'publisher_limit_perm',
  PUBLISHER_LIMIT_RELEASE: 'publisher_limit_release',
  // 6 对象查看（§11 批 C「按对象类型」：订单以外的三类各有自己的取值）
  ORDER_DETAIL_VIEW: 'order_detail_view',
  ORDER_DETAIL_DENIED: 'order_detail_denied',
  ACTIVITY_DETAIL_VIEW: 'activity_detail_view',
  ACTIVITY_DETAIL_DENIED: 'activity_detail_denied',
  GOODS_DETAIL_VIEW: 'goods_detail_view',
  GOODS_DETAIL_DENIED: 'goods_detail_denied',
  USER_DETAIL_VIEW: 'user_detail_view',
  USER_DETAIL_DENIED: 'user_detail_denied',
  // 7 账号解绑与重新绑定
  BIND_RELEASE: 'bind_release',
  BIND_REBIND: 'bind_rebind',
  BIND_DENIED: 'bind_denied',
  BIND_DUPLICATED: 'bind_duplicated',
  // 8 Excel 事件与下载
  EXPORT_LOG_QUERY: 'export_log_query',
  EXPORT_DOWNLOAD: 'export_download',
  // 9 运营统计
  STAT_QUERY: 'stat_query',
  STAT_DENIED: 'stat_denied',
  STAT_PERMISSION_CHANGED: 'stat_permission_changed',
  // 10 隐私事项
  PRIVACY_CASE_CREATE: 'privacy_case_create',
  PRIVACY_CASE_UPDATE: 'privacy_case_update',
  // 11 团长在客户端的商品经营变动（DATA_MODEL §4.2 说明 5）。
  //    operator_uid 为团长本人，operator_roles 为空数组——这不是后台操作。
  GOODS_PRICE_CHANGED: 'goods_price_changed',
  GOODS_UNIT_CHANGED: 'goods_unit_changed',
  GOODS_ON_SALE_CHANGED: 'goods_on_sale_changed',
  GOODS_STOCK_CHANGED: 'goods_stock_changed'
}

const RESULT = { SUCCESS: 1, FAIL: 0 }

// 这些键一旦出现在 prev_state / next_state 里一律剔除，防止凭证或下载地址进日志
const FORBIDDEN_KEYS = [
  'password', 'token', 'secret', 'passwordSecret', 'tokenSecret',
  'url', 'fileURL', 'fileUrl', 'download_url', 'downloadUrl', 'tempFileURL'
]

function sanitize (obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sanitize)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.some(f => k.toLowerCase() === f.toLowerCase())) continue
    out[k] = (v && typeof v === 'object') ? sanitize(v) : v
  }
  return out
}

/**
 * 写一条审计。失败不得影响主流程返回，但必须打服务端日志——
 * 审计链路断掉是 D-072 之后唯一约束手段的失效，不能静默。
 *
 * @param {object} entry
 *   action_type  取 ACTION 枚举
 *   result       RESULT.SUCCESS / RESULT.FAIL
 *   object_type  被操作对象类型
 *   object_id    对象稳定内部标识
 *   case_no      关联举报/申诉/事项编号
 *   reason       操作原因或失败原因摘要
 *   prev_state / next_state  无变化时也要明确记录
 */
async function write (ctx, entry) {
  try {
    const doc = {
      log_no: buildBizNo('LOG', ctx.now),
      operate_time: ctx.now,
      operator_uid: ctx.uid || '',
      operator_roles: ctx.roles || [],          // 当时生效的角色
      operator_permissions: (ctx.permissions || []).join(','),
      action_type: entry.action_type,
      result: entry.result === undefined ? RESULT.SUCCESS : entry.result,
      object_type: entry.object_type || '',
      object_id: entry.object_id || '',
      case_no: entry.case_no || '',
      reason: entry.reason || '',
      prev_state: sanitize(entry.prev_state === undefined ? null : entry.prev_state),
      next_state: sanitize(entry.next_state === undefined ? null : entry.next_state),
      // 同一次请求内的多条日志共用 request_id，用于识别重复请求与联动动作
      request_id: entry.request_id || ctx.requestId
    }
    await ctx.db.collection('grouporder-oplog').add(doc)
    return doc.log_no
  } catch (e) {
    console.error('[oplog] 审计写入失败，action=', entry && entry.action_type, e)
    return null
  }
}

/** 成功分支的简写 */
function success (ctx, entry) {
  return write(ctx, Object.assign({}, entry, { result: RESULT.SUCCESS }))
}

/** 拒绝或失败分支的简写 */
function denied (ctx, entry) {
  return write(ctx, Object.assign({}, entry, { result: RESULT.FAIL }))
}

module.exports = { ACTION, RESULT, write, success, denied, sanitize }
