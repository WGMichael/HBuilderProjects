/**
 * grouporder-ops-co 调用适配层（运营后台专用）
 *
 * 底层复用 js_sdk/grouporder-api：那里已经做了 importObject 实例缓存、
 * { errCode, data } 的归一化，以及 PARTIAL_FAILED 单独成类（不允许被当成功处理）。
 * 本文件只加后台特有的一件事：把鉴权类错误引到 A-02 访问结果页，
 * 而不是各业务页自己画提示（OPS §4.1）。
 *
 * 入参与出参一律以云对象实现为准（uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js）。
 * 列表方法统一 { page, pageSize, filters, orderBy } → { list, total, asOf }（CLOUD_API §2.2）。
 */

import { ops } from '@/js_sdk/grouporder-api/index.js';

/** 服务端强制的分页上限，与 common/grouporder-common/paging.js 保持一致 */
export const MAX_PAGE_SIZE = 100;

/** 访问结果态，取值与 components/grouporder-result 的 type 一一对应（A-02 四类） */
export const RESULT_TYPE = {
  ACCOUNT_DISABLED: 'account_disabled',
  FORBIDDEN: 'forbidden',
  SESSION_EXPIRED: 'session_expired',
  OBJECT_CHANGED: 'object_changed',
};

const RESULT_PAGE = '/pages/grouporder/result/index';

/**
 * 错误码 → 处理方式。action：
 *   redirect 跳 A-02 结果页 ｜ toast 轻提示 ｜ modal 模态 ｜ silent 交调用方处理
 */
export const ERROR_ACTIONS = {
  UNAUTHENTICATED: { action: 'redirect', result: RESULT_TYPE.SESSION_EXPIRED },
  FORBIDDEN: { action: 'redirect', result: RESULT_TYPE.FORBIDDEN },
  NOT_FOUND: { action: 'redirect', result: RESULT_TYPE.OBJECT_CHANGED },
  STATE_CHANGED: { action: 'redirect', result: RESULT_TYPE.OBJECT_CHANGED },
  TARGET_CLOSED: { action: 'redirect', result: RESULT_TYPE.OBJECT_CHANGED },
  INVALID_PARAM: { action: 'toast' },
  DUPLICATE: { action: 'silent' },
  PARTIAL_FAILED: { action: 'modal', fallbackMsg: '部分记录处理失败，请刷新后逐条确认，勿按整体成功处理。' },
  // CLOUD_API §2.3 未定义「账号已停用」的错误码；下面是当前可观察到的取值，待契约补齐后核对
  'uni-id-account-banned': { action: 'redirect', result: RESULT_TYPE.ACCOUNT_DISABLED },
  ACCOUNT_DISABLED: { action: 'redirect', result: RESULT_TYPE.ACCOUNT_DISABLED },
};

/** 后台业务码沿用通用码、前缀 OPS_（CLOUD_API §2.3） */
function normalizeErrCode(errCode) {
  const code = String(errCode || '');
  return code.indexOf('OPS_') === 0 ? code.slice(4) : code;
}

function gotoResultPage(resultType, detail) {
  const query = ['type=' + encodeURIComponent(resultType)];
  if (detail) query.push('detail=' + encodeURIComponent(detail));
  uni.redirectTo({
    url: RESULT_PAGE + '?' + query.join('&'),
    fail: (err) => {
      uni.showModal({ content: (err && err.errMsg) || '页面跳转失败', showCancel: false });
    },
  });
}

/**
 * 按错误码做默认处理，返回被采用的 action。
 * @param {Error|Object} err BizError 或形如 { errCode, errMsg }
 */
export function handleOpsError(err, overrides = {}) {
  const rawCode = (err && err.errCode) || '';
  const code = normalizeErrCode(rawCode);
  const rule = overrides[rawCode] || overrides[code] || ERROR_ACTIONS[rawCode] || ERROR_ACTIONS[code] || { action: 'modal' };
  const message = (err && err.errMsg) || rule.fallbackMsg || '请求服务失败';

  switch (rule.action) {
    case 'redirect':
      gotoResultPage(rule.result, message);
      break;
    case 'toast':
      uni.showToast({ title: message, icon: 'none', duration: 2500 });
      break;
    case 'modal':
      uni.showModal({ content: message, showCancel: false });
      break;
    case 'silent':
    default:
      break;
  }
  return rule.action;
}

/**
 * 调用 grouporder-ops-co 的一个方法。
 * @param {String} method 方法名，须存在于 js_sdk/grouporder-api 的 ops 清单中
 * @param {Object} params 入参
 * @param {Object} options
 *        - silent 不做任何默认提示，错误全部交调用方处理
 *        - errorActions 按错误码覆盖默认处理
 *        - loadingTitle 传入则期间显示 loading
 * @returns {Promise<Object>} resolve 为方法的 data；失败时抛出 BizError
 */
export async function callOps(method, params = {}, options = {}) {
  const { silent = false, errorActions = {}, loadingTitle = '' } = options;
  if (typeof ops[method] !== 'function') {
    const err = { errCode: 'INVALID_PARAM', errMsg: '未定义的云对象方法：' + method };
    if (!silent) handleOpsError(err);
    throw err;
  }

  if (loadingTitle) uni.showLoading({ title: loadingTitle, mask: true });
  try {
    // silent: true —— 提示由本文件按错误码分派，不用 client.js 的默认 toast
    return await ops[method](params, { silent: true });
  } catch (err) {
    if (!silent) handleOpsError(err, errorActions);
    throw err;
  } finally {
    if (loadingTitle) uni.hideLoading();
  }
}

/**
 * 列表类方法的薄封装。
 * filters 是**扁平的值对象**（如 { status: 2, report_no: 'RP-…', start_date, end_date }），
 * 不是 { field: { type, value } }——云对象按 p.filters.<字段> 直接取值。
 */
export async function callOpsList(method, query = {}, options = {}) {
  const { page = 1, pageSize = 20, filters = {}, orderBy = null } = query;
  const params = {
    page,
    pageSize: Math.min(pageSize, MAX_PAGE_SIZE),
    filters,
  };
  if (orderBy && orderBy.field) params.orderBy = orderBy;

  const data = (await callOps(method, params, options)) || {};
  return {
    list: data.list || [],
    total: typeof data.total === 'number' ? data.total : 0,
    asOf: data.asOf || null,
  };
}

export default { callOps, callOpsList, handleOpsError, RESULT_TYPE, ERROR_ACTIONS, MAX_PAGE_SIZE };
