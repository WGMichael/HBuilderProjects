/**
 * 快照固化与留存期计算（DATA_MODEL §4.3、§4.4、§9）
 *
 * 收货三要素与价格、单位一律存快照而非引用：
 * 用户之后改地址簿或团长改价，历史订单内容不变。
 */
const { throwBiz, assertParam } = require('./errors')
const { DELIVERY } = require('./state')

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000

/**
 * 构造订单的收货快照。
 * 自提活动（delivery_type=2）只采集姓名与电话，不采集完整地址（D-060）。
 *
 * @param {object} activity 活动（提供 delivery_type）
 * @param {object} input { address_id, consignee_name, consignee_mobile, consignee_address }
 * @param {object} addressDoc 地址簿记录，按 address_id 取得时传入
 */
function buildConsignee (activity, input, addressDoc) {
  const selfPick = activity.delivery_type === DELIVERY.SELF_PICK

  const name = (addressDoc && addressDoc.name) || input.consignee_name
  const mobile = (addressDoc && addressDoc.mobile) || input.consignee_mobile

  assertParam(name && String(name).trim(), '请填写收货人姓名')
  assertParam(mobile && String(mobile).trim(), '请填写收货电话')

  const snapshot = {
    consignee_name: String(name).trim(),
    consignee_mobile: String(mobile).trim()
  }

  if (selfPick) {
    // 自提不采集地址，也不记录 address_id：订单不进入地址簿选择流程
    snapshot.consignee_address = ''
    snapshot.address_id = ''
  } else {
    const address = (addressDoc && addressDoc.address) || input.consignee_address
    assertParam(address && String(address).trim(), '送货上门活动必须填写完整收货地址')
    snapshot.consignee_address = String(address).trim()
    snapshot.address_id = (addressDoc && addressDoc._id) || input.address_id || ''
  }
  return snapshot
}

/**
 * 构造一条订单明细的快照。
 * price_snapshot 与 unit_snapshot 使后续改价改单位不影响历史订单与清单。
 */
function buildItem (order, goods, qty, now) {
  if (!Number.isInteger(qty) || qty < 1) {
    throwBiz('INVALID_PARAM', `商品「${goods.name}」的数量必须是正整数`)
  }
  const price = goods.price
  return {
    order_id: order._id || '',
    activity_id: order.activity_id,   // 冗余，按活动聚合
    user_id: order.user_id,           // 冗余，限购聚合键
    goods_id: goods._id,
    goods_name: goods.name,
    unit_snapshot: goods.unit || '份',
    price_snapshot: price,
    qty,
    amount: price * qty,
    status: order.status || 1,        // 冗余订单状态，聚合过滤用
    create_date: now
  }
}

/** 汇总明细得到订单的总份数与预计金额（金额单位：分） */
function summarize (items) {
  return items.reduce((acc, it) => {
    acc.total_qty += it.qty
    acc.total_amount += it.amount
    return acc
  }, { total_qty: 0, total_amount: 0 })
}

/**
 * 留存到期日（D-035、DATA_MODEL §9）：活动截止或取消之日 +3 年。
 * 订单继承所属活动的到期日，不各算各的。
 */
function retentionExpireDate (baseTime) {
  return baseTime + THREE_YEARS_MS
}

/**
 * 活动进入终态时，把到期日写到活动与其全部订单上。
 * 由 activityClose / activityCancel / 定时自动截止共同调用，口径必须一致。
 */
async function stampRetention (ctx, activityId, endTime) {
  const expire = retentionExpireDate(endTime)
  await ctx.db.collection('grouporder-activity')
    .doc(activityId)
    .update({ retention_expire_date: expire })
  await ctx.db.collection('grouporder-order')
    .where({ activity_id: activityId })
    .update({ retention_expire_date: expire })
  return expire
}

module.exports = {
  THREE_YEARS_MS,
  buildConsignee,
  buildItem,
  summarize,
  retentionExpireDate,
  stampRetention
}
