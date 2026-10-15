/**
 * 库存与限购（DATA_MODEL §8.1、§8.2）
 *
 * 库存用【带条件的原子自增】，一次操作同时完成校验与占用，
 * 不依赖事务，结构上不可能超卖。
 */
const { throwBiz } = require('./errors')
const { GOVERNANCE } = require('./state')
const { AGG_LIMIT } = require('./paging')

// 团长并发调整库存导致条件不成立时，按最新库存重试的总次数（含首次）
const MAX_DEDUCT_ATTEMPTS = 3

/**
 * 按给定的商品快照尝试一次占用。
 * 条件里同时带上读到的 total_stock：团长在此期间调小（或从不限改为有限）库存时本次不成立，
 * 由调用方重读后按新库存重试，避免按旧上限放行造成超卖。
 */
async function tryDeduct (ctx, goods, qty) {
  const dbCmd = ctx.db.command
  const where = {
    _id: goods._id,
    on_sale: 1,
    governance_status: GOVERNANCE.NORMAL
  }
  if (typeof goods.total_stock === 'number') {
    where.total_stock = goods.total_stock
  }
  if (goods.total_stock > 0) {
    // 占用后不得超过总库存
    where.sold_qty = dbCmd.lte(goods.total_stock - qty)
  }
  const res = await ctx.db.collection('grouporder-goods')
    .where(where)
    .update({ sold_qty: dbCmd.inc(qty) })
  return res.updated > 0
}

/**
 * 扣减库存。
 * total_stock = 0 表示不限库存，只校验可售状态；> 0 才加库存上限条件。
 * 失败时重读商品：只有 total_stock 已被改过才按新值重试，停售、下架或确实卖完直接失败。
 *
 * @returns {boolean} true 表示占用成功
 */
async function deduct (ctx, goods, qty) {
  let current = goods
  for (let attempt = 1; ; attempt++) {
    if (await tryDeduct(ctx, current, qty)) return true
    if (attempt >= MAX_DEDUCT_ATTEMPTS) return false
    const { data } = await ctx.db.collection('grouporder-goods').doc(goods._id).get()
    const latest = data && data[0]
    if (!latest || latest.total_stock === current.total_stock) return false
    current = latest
  }
}

/**
 * 返还库存（取消、作废、改单减量）。
 * 不带任何条件：返还是无条件必须成功的动作，商品此时可能已停售或已下架。
 */
async function restore (ctx, goodsId, qty) {
  if (!qty) return
  const dbCmd = ctx.db.command
  await ctx.db.collection('grouporder-goods')
    .doc(goodsId)
    .update({ sold_qty: dbCmd.inc(-qty) })
}

/**
 * 批量占用；任一失败则把已占用的逐个回退，返回失败的商品。
 * 不依赖事务就必须手写补偿，这一步漏掉会造成库存虚占。
 *
 * @param {Array} plans [{ goods, qty }]
 * @returns {object} { ok: boolean, failed: goods|null }
 */
async function deductBatch (ctx, plans) {
  const done = []
  for (const plan of plans) {
    if (plan.qty <= 0) continue
    const success = await deduct(ctx, plan.goods, plan.qty)
    if (!success) {
      for (const d of done) await restore(ctx, d.goods._id, d.qty)
      return { ok: false, failed: plan.goods }
    }
    done.push(plan)
  }
  return { ok: true, failed: null }
}

/**
 * 每人限购（§8.2）。
 * 按 activity_id + goods_id + user_id + status=1 聚合求和，【按商品分别计算】。
 * per_user_limit = 0 时跳过。
 *
 * @param {string} excludeOrderId 改单时排除本单已有明细，避免把自己算进去
 */
async function checkUserLimit (ctx, { activityId, goods, userId, addQty, excludeOrderId }) {
  if (!goods.per_user_limit || goods.per_user_limit <= 0) return

  const where = {
    activity_id: activityId,
    goods_id: goods._id,
    user_id: userId,
    status: 1
  }
  if (excludeOrderId) {
    where.order_id = ctx.db.command.neq(excludeOrderId)
  }
  const res = await ctx.db.collection('grouporder-order-item')
    .aggregate()
    .match(where)
    .group({ _id: null, total: { $sum: '$qty' } })
    .end()

  const bought = (res.data && res.data[0] && res.data[0].total) || 0
  if (bought + addQty > goods.per_user_limit) {
    throwBiz('LIMIT_EXCEEDED',
      `商品「${goods.name}」每人限购 ${goods.per_user_limit} ${goods.unit || '份'}，你已购 ${bought}`,
      { goods_id: goods._id, limit: goods.per_user_limit, bought })
  }
}

/**
 * 限购事后复核（§8.2）：明细写入后，按与 checkUserLimit 相同的口径
 * （activity_id + goods_id + user_id + status=1 求和）聚合本人总量，【已包含本单】。
 * 先查后扣在同一用户并发提交多单时会被绕过，写入后再复核一次，超出的一方回滚。
 * 并发双方可能同时看到超限而都回滚——宁可让用户重试，也不放过超限。
 *
 * @param {Array} goodsList 本次新增或扩大份数的商品（只复核这些）
 * @returns {object|null} 第一个超限的 { goods, total }，都未超限返回 null
 */
async function findLimitExceeded (ctx, { activityId, goodsList, userId }) {
  const limited = (goodsList || []).filter(g => g && g.per_user_limit > 0)
  if (!limited.length) return null

  const res = await ctx.db.collection('grouporder-order-item')
    .aggregate()
    .match({
      activity_id: activityId,
      goods_id: ctx.db.command.in(limited.map(g => g._id)),
      user_id: userId,
      status: 1
    })
    .group({ _id: '$goods_id', total: { $sum: '$qty' } })
    // 显式上限：不依赖平台默认返回条数
    .limit(AGG_LIMIT)
    .end()

  const totals = new Map((res.data || []).map(r => [r._id, r.total || 0]))
  for (const g of limited) {
    const total = totals.get(g._id) || 0
    if (total > g.per_user_limit) return { goods: g, total }
  }
  return null
}

/** 事后复核超限时抛出的统一异常；调用方须先回滚本单再调用 */
function throwLimitExceeded (goods) {
  throwBiz('LIMIT_EXCEEDED',
    `商品「${goods.name}」每人限购 ${goods.per_user_limit} ${goods.unit || '份'}，本次提交后将超出，请调整数量后重试`,
    { goods_id: goods._id, limit: goods.per_user_limit })
}

module.exports = { deduct, restore, deductBatch, checkUserLimit, findLimitExceeded, throwLimitExceeded }
