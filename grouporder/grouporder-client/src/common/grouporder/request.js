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
      uni.navigateTo({ url: LOGIN_PAGE });
    },
    // 默认错误提示统一走 toast；需要跳 M-26 的由页面用 guarded 包裹
    onError: null,
  });
}

/**
 * 包一层：命中 ERR_TO_RESULT 的错误码跳 M-26，其余原样抛出交页面处理。
 * @param {Promise} p api.xxx.yyy(...) 返回的 Promise
 * @param {Object} opts { onResult: 覆盖默认跳转; silent: 不跳 M-26 只抛 }
 */
export async function guarded(p, opts = {}) {
  try {
    return await p;
  } catch (err) {
    const code = (err && err.errCode) || '';
    const resultType = ERR_TO_RESULT[code];
    if (resultType && !opts.silent) {
      gotoResult(resultType, err && err.errMsg);
    }
    throw err;
  }
}

/** 是否已登录（本地 token 未过期）。用于「提交时才要求登录」的前置判断 */
export function isLoggedIn() {
  const token = uni.getStorageSync('uni_id_token');
  const expired = uni.getStorageSync('uni_id_token_expired');
  return !!token && expired > Date.now();
}

/** 确保已登录，未登录则跳登录页并返回 false（调用方据此中断提交）*/
export function ensureLogin() {
  if (isLoggedIn()) return true;
  uni.navigateTo({ url: LOGIN_PAGE });
  return false;
}

export { api, BizError, AuthError, PartialFailedError };
export default api;
