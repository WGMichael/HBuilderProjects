/**
 * 库存与限购（DATA_MODEL §8.1、§8.2）
 *
 * 库存用【带条件的原子自增】，一次操作同时完成校验与占用，
 * 不依赖事务，结构上不可能超卖。
 */
const { throwBiz } = require('./errors')
const { GOVERNANCE } = require('./state')

/**
 * 扣减库存。
 * total_stock = 0 表示不限库存，只校验可售状态；> 0 才加库存上限条件。
 *
 * @returns {boolean} true 表示占用成功
 */
async function deduct (ctx, goods, qty) {
  const dbCmd = ctx.db.command
  const where = {
    _id: goods._id,
    on_sale: 1,
    governance_status: GOVERNANCE.NORMAL
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

module.exports = { deduct, restore, deductBatch, checkUserLimit }
