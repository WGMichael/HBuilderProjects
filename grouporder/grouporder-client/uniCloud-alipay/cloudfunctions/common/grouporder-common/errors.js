/**
 * 错误码与统一出参构造（CLOUD_API §2.1、§2.3）
 * 前端按 errCode === 0 判成功、按 errCode 分支处理异常，不解析 errMsg 文本。
 */

// 通用码（两端共用）
const COMMON = {
  UNAUTHENTICATED: '未登录或会话已失效',
  FORBIDDEN: '无权操作该对象',
  NOT_FOUND: '对象不存在或已删除',
  STATE_CHANGED: '状态已被他人修改，请刷新后重试',
  DUPLICATE: '重复提交',
  INVALID_PARAM: '参数不合法',
  PARTIAL_FAILED: '部分操作失败'
}

// 客户端业务码
const CLIENT = {
  ACTIVITY_CLOSED: '活动已截止',
  ACTIVITY_CANCELLED: '活动已被团长取消',
  ACTIVITY_OFFLINE: '活动已被平台下架',
  GOODS_OFF_SALE: '商品已停售',
  GOODS_OFFLINE: '商品已被平台下架',
  STOCK_NOT_ENOUGH: '库存不足',
  LIMIT_EXCEEDED: '超出每人限购数量',
  DELIVERY_TYPE_LOCKED: '交付方式在发布后不可修改',
  PRECONDITION_UNMET: '前置条件不满足'
}

// 后台业务码：通用码加 OPS_ 前缀，另加 OPS_TARGET_CLOSED
const OPS_EXTRA = {
  OPS_TARGET_CLOSED: '目标活动已截止或已被取消，本次处置中止'
}

const MESSAGES = Object.assign({}, COMMON, CLIENT, OPS_EXTRA)
for (const key of Object.keys(COMMON)) {
  MESSAGES['OPS_' + key] = COMMON[key]
}

class BizError extends Error {
  constructor (errCode, errMsg, detail) {
    super(errMsg || MESSAGES[errCode] || errCode)
    this.name = 'BizError'
    this.errCode = errCode
    this.errMsg = errMsg || MESSAGES[errCode] || errCode
    this.detail = detail || {}
  }
}

/** 抛出业务异常，由云对象 _after 统一转为出参 */
function throwBiz (errCode, errMsg, detail) {
  throw new BizError(errCode, errMsg, detail)
}

/** 后台专用：自动补 OPS_ 前缀 */
function throwOps (errCode, errMsg, detail) {
  const code = errCode.startsWith('OPS_') ? errCode : 'OPS_' + errCode
  throw new BizError(code, errMsg, detail)
}

function ok (data) {
  return { errCode: 0, data: data === undefined ? null : data }
}

function fail (errCode, errMsg, detail) {
  return {
    errCode,
    errMsg: errMsg || MESSAGES[errCode] || errCode,
    detail: detail || {}
  }
}

/** 把任意异常规整成统一出参；非业务异常不外泄内部信息 */
function normalize (err) {
  if (err instanceof BizError) return fail(err.errCode, err.errMsg, err.detail)
  if (err && err.errCode) return fail(err.errCode, err.errMsg, err.detail)
  console.error('[grouporder] 未捕获异常：', err && err.stack ? err.stack : err)
  return fail('INVALID_PARAM', '服务处理失败，请稍后重试')
}

/** 断言入参，不满足即抛 INVALID_PARAM */
function assertParam (cond, msg, detail) {
  if (!cond) throwBiz('INVALID_PARAM', msg, detail)
}

module.exports = { MESSAGES, BizError, throwBiz, throwOps, ok, fail, normalize, assertParam }
