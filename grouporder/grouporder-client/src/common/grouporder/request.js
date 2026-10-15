/**
 * 小程序端云对象调用适配层
 *
 * 底层复用 src/api（自动生成的方法清单 + 手写 client.js：实例缓存、{errCode,data} 拆包、
 * PARTIAL_FAILED 单独成异常类）。本文件只做小程序端特有的两件事：
 *   1. 把「对象级」错误码（不存在 / 无权 / 已截止 / 已取消 / 已下架）引到 M-26 统一结果页；
 *   2. 未登录时按 D-033「提交时才要求登录」跳登录页，登录后能回到原位置。
 *
 * 入参与出参一律以云对象实现为准（uniCloud-alipay/cloudfunctions/grouporder-*-co）。
 */

import api from '@/api/index.js';
import { configure, BizError, AuthError, PartialFailedError } from '@/api/client.js';

/** M-26 六类结果态 */
export const RESULT_TYPE = {
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
  OFFLINE: 'offline',
  UNKNOWN: 'unknown',
};

const RESULT_PAGE = '/pages/common/result';
const LOGIN_PAGE = '/uni_modules/uni-id-pages/pages/login/login-withpwd';

/** 错误码 → M-26 结果态（CLOUD_API §2.3）。未列入的走 toast/ modal，不跳结果页 */
const ERR_TO_RESULT = {
  NOT_FOUND: RESULT_TYPE.NOT_FOUND,
  FORBIDDEN: RESULT_TYPE.FORBIDDEN,
  ACTIVITY_CLOSED: RESULT_TYPE.CLOSED,
  ACTIVITY_CANCELLED: RESULT_TYPE.CANCELLED,
  ACTIVITY_OFFLINE: RESULT_TYPE.OFFLINE,
  GOODS_OFFLINE: RESULT_TYPE.OFFLINE,
  STATE_CHANGED: RESULT_TYPE.UNKNOWN,
};

/** 跳 M-26。detail 会作为补充说明展示 */
export function gotoResult(type, detail) {
  const q = ['type=' + encodeURIComponent(type)];
  if (detail) q.push('detail=' + encodeURIComponent(detail));
  uni.redirectTo({ url: RESULT_PAGE + '?' + q.join('&') });
}

/**
 * App 启动时调用一次：把 client.js 的会话失效钩子接到登录页。
 * 登录页登录成功后由 uni-id-pages 自行 navigateBack，回到原位置（D-033）。
 */
export function setupRequest() {
  configure({
    onUnauthenticated() {
      // 服务端判定会话失效：清掉本地 token，isLoggedIn 随之为 false，
      // 否则本地未过期的旧 token 会让页面一再发请求、一再被拉去登录
      try { uni.removeStorageSync('uni_id_token'); uni.removeStorageSync('uni_id_token_expired'); } catch (e) {}
      gotoLogin();
    },
    // 默认错误提示统一走 toast；需要跳 M-26 的由页面用 guarded 包裹
    onError: null,
  });
}

/**
 * 包一层：命中 ERR_TO_RESULT 的错误码跳 M-26，其余原样抛出交页面处理。
 * @param {Promise} p api.xxx.yyy(...) 返回的 Promise
 * @param {Object} opts { silent: 不跳 M-26 只抛; stay: 这些错误码不跳 M-26（页内写操作用，如某条地址 / 库记录刚被删，
 *                        只提示不整页替换，避免丢掉正在编辑的内容） }
 */
export async function guarded(p, opts = {}) {
  try {
    return await p;
  } catch (err) {
    const code = (err && err.errCode) || '';
    const resultType = ERR_TO_RESULT[code];
    if (resultType && !opts.silent && !(opts.stay && opts.stay.includes(code))) {
      gotoResult(resultType, err && err.errMsg);
    }
    throw err;
  }
}

/**
 * 打开登录页。同一时刻只开一个：页面并发的多个请求同时失效、或已在登录 / 注册页时不重复压栈
 */
let lastLoginNav = 0;
let loginFrom = ''; // 触发登录的页面 route，供 tab 页判断「是从登录页返回」
function gotoLogin() {
  const pages = getCurrentPages();
  const top = pages[pages.length - 1];
  if (top && String(top.route || '').indexOf('uni_modules/uni-id-pages/') === 0) return;
  if (Date.now() - lastLoginNav < 1500) return;
  lastLoginNav = Date.now();
  loginFrom = (top && top.route) || '';
  uni.navigateTo({ url: LOGIN_PAGE });
}

/**
 * 当前页是否刚从「由本页触发的登录」返回（读取即清除）。
 * 发起接龙 tab 用它区分「登录回来」与「从其他 tab 切入」，前者保留已填表单（D-061）
 */
export function consumeLoginReturn(route) {
  const hit = !!loginFrom && loginFrom === route;
  if (hit) loginFrom = '';
  return hit;
}

/** 是否已登录（本地 token 未过期）。用于「提交时才要求登录」的前置判断 */
export function isLoggedIn() {
  const token = uni.getStorageSync('uni_id_token');
  const expired = uni.getStorageSync('uni_id_token_expired');
  return !!token && expired > Date.now();
}

// 登录后继续的操作（D-096）：未登录时记下「回来后要做什么」，登录成功回到原页面后由该页面取出接着做。
// 存本机缓存而不是内存：H5 登录过程中刷新页面也不丢
const LOGIN_INTENT_KEY = 'go_login_intent';
const LOGIN_INTENT_TTL = 30 * 60 * 1000; // 超过 30 分钟视为放弃，不再自动继续

/**
 * 确保已登录，未登录则跳登录页并返回 false（调用方据此中断提交）
 * @param {object} [intent] 登录后要继续的操作，如 { type: 'order', activity_id, items }；由原页面用 takeLoginIntent 取回
 */
export function ensureLogin(intent) {
  if (isLoggedIn()) return true;
  try {
    if (intent) uni.setStorageSync(LOGIN_INTENT_KEY, Object.assign({}, intent, { at: Date.now() }));
    else uni.removeStorageSync(LOGIN_INTENT_KEY);
  } catch (e) {}
  gotoLogin();
  return false;
}

/**
 * 已登录时取出登录前记下的操作（读取即清除）；未登录、已过期或不匹配时返回 null。
 * 未登录时不清除：用户从登录页返回后再次去登录，仍可继续
 * @param {Function} match (intent) => boolean，判断是否属于当前页面
 */
export function takeLoginIntent(match) {
  if (!isLoggedIn()) return null;
  let intent = null;
  try { intent = uni.getStorageSync(LOGIN_INTENT_KEY) || null; } catch (e) {}
  if (!intent) return null;
  const expired = !intent.at || Date.now() - intent.at > LOGIN_INTENT_TTL;
  if (expired || (match && !match(intent))) {
    if (expired) { try { uni.removeStorageSync(LOGIN_INTENT_KEY); } catch (e) {} }
    return null;
  }
  try { uni.removeStorageSync(LOGIN_INTENT_KEY); } catch (e) {}
  return intent;
}

export { api, BizError, AuthError, PartialFailedError };
export default api;
