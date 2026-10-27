/**
 * 会员身份与会员功能闸门（D-106）
 *
 * 「先预留、后开闸」：会员身份存 grouporder-user-ext（member_level / member_expire / member_source），
 * 哪些功能只对会员开放由平台配置 grouporder-config 的 member_gate 决定，例如 { leader_stats: true }。
 * 配置里没有该功能或值不为 true 时一律放行——首版所有功能对所有人开放，上线会员时只改配置与数据，不改代码。
 * 会员来源预留两种：运营后台设置（admin）、微信购买（wxpay）；两条通道本版都未实现。
 */
const config = require('./config')
const { throwBiz } = require('./errors')

const KEY_MEMBER_GATE = 'member_gate'
const LEVEL = { NORMAL: 0, MEMBER: 1 }
// 会员功能清单：新增会员功能时在这里登记键名，前后端与配置共用
const FEATURE = { LEADER_STATS: 'leader_stats' }

/**
 * 读会员身份；member_expire 为 0 / 缺失表示长期有效，已过期按普通用户返回（读时判定，不依赖定时任务）
 * @returns {{ is_member: boolean, level: number, expire: number, source: string }}
 */
async function getMember (ctx, uid) {
  const none = { is_member: false, level: LEVEL.NORMAL, expire: 0, source: '' }
  if (!uid) return none
  const { data } = await ctx.db.collection('grouporder-user-ext').where({ user_id: uid }).limit(1).get()
  const ext = data && data[0]
  if (!ext || ext.member_level !== LEVEL.MEMBER) return none
  const expire = ext.member_expire || 0
  if (expire && expire <= ctx.now) return Object.assign(none, { expire, source: ext.member_source || '' })
  return { is_member: true, level: LEVEL.MEMBER, expire, source: ext.member_source || '' }
}

/** 某功能当前是否只对会员开放 */
async function isGated (ctx, feature) {
  const doc = await config.get(ctx, KEY_MEMBER_GATE)
  return !!(doc && doc.config_value && doc.config_value[feature] === true)
}

/**
 * 会员功能入口校验：闸门关闭（首版）直接放行；打开后非会员抛 PRECONDITION_UNMET（detail.member_required）
 * @returns {{ gated: boolean, member: object }}
 */
async function requireFeature (ctx, uid, feature) {
  const [gated, member] = await Promise.all([isGated(ctx, feature), getMember(ctx, uid)])
  if (gated && !member.is_member) {
    throwBiz('PRECONDITION_UNMET', '该功能为会员功能', { member_required: true, feature })
  }
  return { gated, member }
}

module.exports = { KEY_MEMBER_GATE, LEVEL, FEATURE, getMember, isGated, requireFeature }
