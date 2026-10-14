/**
 * 按交付方式拆分的有效订单统计（D-086）
 *
 * 放在 common：activity-co（M-20 管理页统计）与 order-co（orderLeaderStat）都要用，云对象之间不互相调用。
 * 只统计有效订单的单数与份数，不出现销售额 / 实收 / GMV（红线⑧）。
 */
const { ORDER, DELIVERY, deliveryTypesOf } = require('./state')

/**
 * @returns {{ home: {order_count, total_qty}, self_pick: {order_count, total_qty} }}
 */
async function breakdown (ctx, activity) {
  const res = await ctx.db.collection('grouporder-order').aggregate()
    .match({ activity_id: activity._id, status: ORDER.VALID })
    .group({ _id: '$delivery_type', order_count: { $sum: 1 }, total_qty: { $sum: '$total_qty' } })
    .end()
  // 旧订单没有 delivery_type（_id 为 null），所属活动当时必为单一方式
  const legacy = deliveryTypesOf(activity)[0]
  const out = {
    home: { order_count: 0, total_qty: 0 },
    self_pick: { order_count: 0, total_qty: 0 }
  }
  for (const r of (res.data || [])) {
    const type = r._id || legacy
    const bucket = type === DELIVERY.SELF_PICK ? out.self_pick : out.home
    bucket.order_count += r.order_count || 0
    bucket.total_qty += r.total_qty || 0
  }
  return out
}

module.exports = { breakdown }
