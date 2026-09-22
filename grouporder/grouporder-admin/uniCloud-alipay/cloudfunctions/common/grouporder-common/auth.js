/**
 * 鉴权（OPS §3.1、D-033、D-034、D-076）
 *
 * 三条硬规则：
 * 1. 一律以【提交时刻】的账号状态与权限为准，不依赖进入页面时的结果；
 * 2. 未登录可浏览活动非敏感内容（D-033、P1-01），因此有 optionalLogin；
 * 3. 分享入口有效不等于授予敏感数据权限，服务端逐次鉴权（D-034）。
 *
 * D-076 之后超管按权限点判断即可，本模块【不做任何超管特例分支】。
 */
const uniIdCommon = require('uni-id-common')
const { throwBiz, throwOps } = require('./errors')

/**
 * 在云对象 _before 中构造请求上下文。
 * 同一次请求内 now 只取一次，全链路复用，避免跨秒导致状态判定不一致（§8.4）。
 *
 * @param {object} cloudObj 云对象 this
 * @param {object} opts { admin: 是否后台对象 }
 */
async function createContext (cloudObj, opts = {}) {
  const clientInfo = cloudObj.getClientInfo()
  const uniID = uniIdCommon.createInstance({ clientInfo })
  const token = cloudObj.getUniIdToken()

  const ctx = {
    uid: null,
    roles: [],
    permissions: [],
    tokenValid: false,
    tokenError: null,
    isAdmin: !!opts.admin,
    clientInfo,
    // request_id：审计与幂等都要用（DATA_MODEL §10.8）
    requestId: (cloudObj.getCloudInfo && cloudObj.getCloudInfo().requestId) ||
      `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    now: Date.now(),
    uniID,
    db: uniCloud.database()
  }

  if (token) {
    try {
      const payload = await uniID.checkToken(token)
      if (payload.errCode) {
        ctx.tokenError = payload.errCode
      } else {
        ctx.uid = payload.uid
        ctx.roles = payload.role || []
        ctx.permissions = payload.permission || []
        ctx.tokenValid = true
      }
    } catch (e) {
      ctx.tokenError = 'TOKEN_INVALID'
    }
  }
  return ctx
}

/** 必须登录 */
function requireLogin (ctx) {
  if (!ctx.tokenValid || !ctx.uid) {
    throwBiz(ctx.isAdmin ? 'OPS_UNAUTHENTICATED' : 'UNAUTHENTICATED')
  }
  return ctx.uid
}

/** 可选登录：未登录返回 null，用于活动详情等允许游客浏览的方法 */
function optionalLogin (ctx) {
  return ctx.tokenValid ? ctx.uid : null
}

/**
 * 必须是该活动的团长本人。
 * 每次都重新读活动，不接受调用方传入的团长 id。
 */
async function requireLeader (ctx, activityId) {
  const uid = requireLogin(ctx)
  if (!activityId) throwBiz('INVALID_PARAM', '缺少活动标识')
  const { data } = await ctx.db.collection('grouporder-activity').doc(activityId).get()
  const activity = data && data[0]
  if (!activity) throwBiz('NOT_FOUND', '活动不存在或已删除')
  if (activity.leader_uid !== uid) throwBiz('FORBIDDEN', '只有活动发起人可以执行该操作')
  return activity
}

/**
 * 后台权限点校验（OPS §3.1）。
 * 以提交时刻的 token 载荷为准；账号被停用时 checkToken 本身会失败。
 */
function requirePermission (ctx, permissionId) {
  requireLogin(ctx)
  const list = Array.isArray(permissionId) ? permissionId : [permissionId]
  const hit = list.some(p => ctx.permissions.includes(p))
  if (!hit) {
    throwOps('FORBIDDEN', '当前账号没有该操作的权限', { required: list })
  }
  return true
}

/** 只判断有没有，不抛异常。用于工作台按权限裁剪待办档位 */
function hasPermission (ctx, permissionId) {
  return ctx.permissions.includes(permissionId)
}

module.exports = {
  createContext,
  requireLogin,
  optionalLogin,
  requireLeader,
  requirePermission,
  hasPermission
}
