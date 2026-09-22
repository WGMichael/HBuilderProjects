/**
 * 平台配置读写（DATA_MODEL §4.6、D-057）
 * 客户端不可直读本表，只能通过云函数取到必要的展示信息。
 */
const { REVIEW_MODE } = require('./state')

const KEY_REVIEW_MODE = 'review_mode'

async function get (ctx, configKey) {
  const { data } = await ctx.db.collection('grouporder-config')
    .where({ config_key: configKey }).limit(1).get()
  return data && data[0] ? data[0] : null
}

/**
 * 取当前生效的发布审核模式。
 * 表里没有记录时按【自动审核】兜底：首版默认自动，人工模式需要运营显式开启。
 */
async function getReviewMode (ctx) {
  const doc = await get(ctx, KEY_REVIEW_MODE)
  const mode = doc && doc.config_value && doc.config_value.mode
  return mode === REVIEW_MODE.MANUAL ? REVIEW_MODE.MANUAL : REVIEW_MODE.AUTO
}

/**
 * 写配置，返回前后值供审计记录（OPS §4.11）。
 * 只有超管可调用，权限在 ops-co 侧用 ops-sys-config 校验。
 */
async function set (ctx, configKey, configValue, description) {
  const old = await get(ctx, configKey)
  const payload = {
    config_key: configKey,
    config_value: configValue,
    update_uid: ctx.uid,
    update_date: ctx.now
  }
  if (description !== undefined) payload.description = description

  if (old) {
    await ctx.db.collection('grouporder-config').doc(old._id).update(payload)
  } else {
    await ctx.db.collection('grouporder-config').add(payload)
  }
  return {
    prev_state: old ? { config_value: old.config_value } : null,
    next_state: { config_value: configValue }
  }
}

module.exports = { KEY_REVIEW_MODE, get, getReviewMode, set }
