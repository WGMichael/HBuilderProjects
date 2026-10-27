/**
 * 三套状态机（DATA_MODEL §5）
 *
 * 核心约束：业务状态与治理状态【相互独立、互不改写】。
 * 本模块只提供校验，不做写入；任何方法都不得越界改对方。
 */
const { throwBiz } = require('./errors')

// 活动业务状态
const ACTIVITY = { DRAFT: 0, REVIEWING: 1, ONGOING: 2, CLOSED: 3, CANCELLED: 4 }
// 活动/商品治理状态
const GOVERNANCE = { NORMAL: 0, OFF: 1 }
// 订单状态
const ORDER = { VALID: 1, CANCELLED: 2, VOIDED: 3 }
// 审核结果
const REVIEW_RESULT = { NONE: 0, PASS: 1, REJECT: 2, WITHDRAWN: 3 }
// 截止方式
const END_TYPE = { AUTO: 1, MANUAL: 2 }
// 交付方式
const DELIVERY = { HOME: 1, SELF_PICK: 2 }
// 审核模式
const REVIEW_MODE = { AUTO: 1, MANUAL: 2 }

/**
 * 活动支持的交付方式（D-086）：[1]、[2] 或 [1, 2]。
 * 旧活动只有单值 delivery_type（D-060），读取时按单元素数组兼容，不做数据迁移。
 */
function deliveryTypesOf (activity) {
  if (!activity) return []
  if (Array.isArray(activity.delivery_types) && activity.delivery_types.length) {
    return [...new Set(activity.delivery_types)].sort()
  }
  return [activity.delivery_type || DELIVERY.HOME]
}

/** 活动是否支持某种交付方式 */
function supportsDelivery (activity, type) {
  return deliveryTypesOf(activity).includes(type)
}

/**
 * 订单的交付方式（D-086）：下单时由参与者选定并落在订单上。
 * 旧订单没有该字段，所属活动当时必为单一方式，取活动的那一种
 */
function orderDeliveryTypeOf (order, activity) {
  if (order && order.delivery_type) return order.delivery_type
  return deliveryTypesOf(activity)[0]
}

/**
 * 校验并规范化入参的交付方式集合：只允许 1 / 2，去重排序，至少一项。
 * 不合法返回 null，由调用方决定报错文案
 */
function normalizeDeliveryTypes (input) {
  if (!Array.isArray(input)) return null
  const set = [...new Set(input)].sort()
  if (!set.length || set.some(t => t !== DELIVERY.HOME && t !== DELIVERY.SELF_PICK)) return null
  return set
}

// 活动业务状态的合法迁移
const ACTIVITY_TRANSITIONS = {
  [ACTIVITY.DRAFT]: [ACTIVITY.REVIEWING, ACTIVITY.CANCELLED],
  [ACTIVITY.REVIEWING]: [ACTIVITY.DRAFT, ACTIVITY.ONGOING, ACTIVITY.CLOSED],
  [ACTIVITY.ONGOING]: [ACTIVITY.CLOSED, ACTIVITY.CANCELLED],
  [ACTIVITY.CLOSED]: [],
  [ACTIVITY.CANCELLED]: []
}

// 订单状态的合法迁移，取消与作废均为终态
const ORDER_TRANSITIONS = {
  [ORDER.VALID]: [ORDER.CANCELLED, ORDER.VOIDED],
  [ORDER.CANCELLED]: [],
  [ORDER.VOIDED]: []
}

function assertActivityTransition (from, to) {
  const allow = ACTIVITY_TRANSITIONS[from] || []
  if (!allow.includes(to)) {
    throwBiz('STATE_CHANGED', '活动当前状态不允许该操作', { from, to })
  }
}

function assertOrderTransition (from, to) {
  const allow = ORDER_TRANSITIONS[from] || []
  if (!allow.includes(to)) {
    throwBiz('STATE_CHANGED', '订单当前状态不允许该操作', { from, to })
  }
}

/**
 * 活动的起始时间（D-087）。旧活动没有 start_time，视为发布即开始，返回 0
 */
function startTimeOf (activity) {
  return (activity && activity.start_time) || 0
}

/**
 * 是否「已发布但未开始」（D-087）：业务状态仍是进行中，只是服务端时间还没到起始时间。
 * 不新增业务状态，状态机、定时任务与状态筛选都不受影响
 */
function isNotStarted (activity, now) {
  return !!activity && activity.status === ACTIVITY.ONGOING && now < startTimeOf(activity)
}

/**
 * 活动是否可参与（下单、扩大订单）。
 * 一律用服务端时间判断起止（§8.4、D-087），不看 status 字段是否已被定时任务改过。
 */
function assertActivityJoinable (activity, now) {
  if (!activity) throwBiz('NOT_FOUND')
  if (activity.status === ACTIVITY.CANCELLED) throwBiz('ACTIVITY_CANCELLED')
  if (activity.governance_status === GOVERNANCE.OFF) throwBiz('ACTIVITY_OFFLINE')
  if (activity.status !== ACTIVITY.ONGOING) throwBiz('ACTIVITY_CLOSED', '活动尚未开始接龙或已结束')
  // 定时任务可能还没扫到，以服务端时间为准
  if (activity.end_time && now >= activity.end_time) throwBiz('ACTIVITY_CLOSED')
  if (activity.status === ACTIVITY.CLOSED) throwBiz('ACTIVITY_CLOSED')
  // 未到起始时间：能看不能下单（D-087）
  if (now < startTimeOf(activity)) throwBiz('ACTIVITY_NOT_STARTED', undefined, { start_time: startTimeOf(activity) })
}

/**
 * 活动是否处于「可减少 / 可移除」的窗口：截止前。
 * 停售、下架都不阻止缩小订单（D-019、D-050），因此这里只看截止与取消。
 */
function assertActivityShrinkable (activity, now) {
  if (!activity) throwBiz('NOT_FOUND')
  if (activity.status === ACTIVITY.CANCELLED) throwBiz('ACTIVITY_CANCELLED')
  if (activity.status === ACTIVITY.CLOSED) throwBiz('ACTIVITY_CLOSED')
  if (activity.end_time && now >= activity.end_time) throwBiz('ACTIVITY_CLOSED')
}

/** 商品是否允许被新增或扩大数量 */
function assertGoodsSelectable (goods) {
  if (!goods) throwBiz('NOT_FOUND', '商品不存在')
  if (goods.governance_status === GOVERNANCE.OFF) {
    throwBiz('GOODS_OFFLINE', `商品「${goods.name}」已被平台下架`, { goods_id: goods._id })
  }
  if (goods.on_sale !== 1) {
    throwBiz('GOODS_OFF_SALE', `商品「${goods.name}」已停售`, { goods_id: goods._id })
  }
}

/** 活动是否已到达终态（已结束 / 已取消） */
function isActivityFinal (activity) {
  return activity.status === ACTIVITY.CLOSED || activity.status === ACTIVITY.CANCELLED
}

/**
 * 商品经营动作的可执行性（DATA_MODEL §5.3）
 * @returns {object} { canDelete, canRestoreOnSale, minStock }
 */
function goodsCapability (goods, activity, now) {
  const everOrdered = goods.ever_ordered === 1
  const finalState = isActivityFinal(activity) || (activity.end_time && now >= activity.end_time)
  return {
    // 产生过有效明细即永久禁止删除（D-026），sold_qty 回落到 0 也不放开
    canDelete: !everOrdered,
    // 活动已结束或已取消时禁止恢复售卖（D-028）
    canRestoreOnSale: !finalState && activity.status === ACTIVITY.ONGOING,
    // 有限库存不得低于已购买份数
    minStock: goods.sold_qty || 0
  }
}

module.exports = {
  ACTIVITY,
  GOVERNANCE,
  ORDER,
  REVIEW_RESULT,
  END_TYPE,
  DELIVERY,
  REVIEW_MODE,
  deliveryTypesOf,
  supportsDelivery,
  startTimeOf,
  isNotStarted,
  orderDeliveryTypeOf,
  normalizeDeliveryTypes,
  assertActivityTransition,
  assertOrderTransition,
  assertActivityJoinable,
  assertActivityShrinkable,
  assertGoodsSelectable,
  isActivityFinal,
  goodsCapability
}
