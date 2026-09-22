/**
 * 云对象调用的统一入口
 *
 * 本文件【手写，不由生成脚本覆盖】。生成的是同目录的 index.js（方法名与转发）。
 *
 * 承担三件事：
 * 1. importObject 实例缓存——每次调用都 import 会重复建对象；
 * 2. 把 { errCode, data } 的约定拆开：成功直接给 data，失败统一抛错，
 *    页面里不用每次写 if (res.errCode !== 0)；
 * 3. 三类错误码的统一处置，尤其是 PARTIAL_FAILED——
 *    契约规定**部分失败不得显示整体成功**，靠各页面自觉一定会漏。
 *
 * 入参与出参一律查 docs/arch/CLOUD_API.md §14，本文件不重复定义。
 */

/** 需要跳登录的错误码（客户端与后台各一个前缀） */
const AUTH_CODES = ['UNAUTHENTICATED', 'OPS_UNAUTHENTICATED']

/** 业务异常。errCode 取 CLOUD_API §2.3，detail 为服务端给的补充信息 */
export class BizError extends Error {
  constructor (errCode, errMsg, detail) {
    super(errMsg || errCode)
    this.name = 'BizError'
    this.errCode = errCode
    this.errMsg = errMsg || errCode
    this.detail = detail || {}
  }
}

/**
 * 部分失败。单独成类是为了让调用方【无法】把它当成功处理：
 * detail 里有 created[] 与 failed[]，两边都要展示。
 */
export class PartialFailedError extends BizError {
  constructor (errMsg, detail) {
    super('PARTIAL_FAILED', errMsg, detail)
    this.name = 'PartialFailedError'
    this.succeeded = (detail && (detail.created || detail.succeeded)) || []
    this.failed = (detail && detail.failed) || []
  }
}

/** 会话失效。抛出前会先走 onUnauthenticated 钩子 */
export class AuthError extends BizError {
  constructor (errCode, errMsg) {
    super(errCode, errMsg)
    this.name = 'AuthError'
  }
}

const hooks = {
  /** 会话失效时的处理，由 App 启动时注入（跳登录页、清本地态等） */
  onUnauthenticated: null,
  /** 统一错误提示。返回 true 表示已自行处理，不再走默认 toast */
  onError: null,
  /** 默认提示实现，便于在 H5 / 小程序 / 后台各自替换 */
  toast: (msg) => {
    if (typeof uni !== 'undefined' && uni.showToast) {
      uni.showToast({ title: msg, icon: 'none', duration: 2500 })
    } else {
      console.warn('[grouporder-api]', msg)
    }
  }
}

/** App 启动时调用一次 */
export function configure (options = {}) {
  Object.assign(hooks, options)
}

const objectCache = new Map()

function getObject (name) {
  if (!objectCache.has(name)) {
    // customUI: true —— 错误提示由本文件统一控制，不用 uniCloud 的默认弹窗，
    // 否则 PARTIAL_FAILED 会被当普通错误弹掉，丢掉成功的那部分
    objectCache.set(name, uniCloud.importObject(name, { customUI: true }))
  }
  return objectCache.get(name)
}

/**
 * uniCloud 在 errCode 非 0 时可能 resolve 也可能 reject，
 * 两条路径都要归一到同一个形状，否则页面上会出现两套判断。
 */
function normalize (raw) {
  if (!raw || typeof raw !== 'object') {
    return { errCode: 'INVALID_PARAM', errMsg: '服务返回异常' }
  }
  if (raw.errCode !== undefined) return raw
  if (raw.result && raw.result.errCode !== undefined) return raw.result
  return { errCode: 'INVALID_PARAM', errMsg: raw.message || '服务返回异常' }
}

/**
 * @param {string} objName 云对象名
 * @param {string} method  方法名
 * @param {object} params  入参，见 CLOUD_API §14
 * @param {object} options { silent: 不弹默认提示, raw: 返回完整 {errCode,data} 而不抛错 }
 */
export async function call (objName, method, params, options = {}) {
  let res
  try {
    res = await getObject(objName)[method](params === undefined ? {} : params)
    res = normalize(res)
  } catch (e) {
    res = normalize(e)
  }

  if (options.raw) return res
  if (res.errCode === 0) return res.data

  if (AUTH_CODES.includes(res.errCode)) {
    if (hooks.onUnauthenticated) hooks.onUnauthenticated(res)
    throw new AuthError(res.errCode, res.errMsg)
  }

  if (res.errCode === 'PARTIAL_FAILED') {
    const err = new PartialFailedError(res.errMsg, res.detail)
    // 部分失败默认也提示：调用方即使忘了 catch，也不会静默显示成功
    if (!options.silent && !(hooks.onError && hooks.onError(err))) {
      hooks.toast(res.errMsg || '部分操作未成功')
    }
    throw err
  }

  const err = new BizError(res.errCode, res.errMsg, res.detail)
  if (!options.silent && !(hooks.onError && hooks.onError(err))) {
    hooks.toast(res.errMsg || '操作失败')
  }
  throw err
}

export default { call, configure, BizError, PartialFailedError, AuthError }
