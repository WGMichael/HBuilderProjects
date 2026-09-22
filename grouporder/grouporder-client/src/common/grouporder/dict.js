/**
 * 业务枚举与中文映射（小程序端）
 *
 * 取值与 uniCloud-alipay/cloudfunctions 各云对象、DATA_MODEL 的 enum 一致。
 * 页面不要各自再写一份。
 *
 * 两条不能违反的规则（CLIENT_FRONTEND_BRIEF §6）：
 *   - 业务状态与治理状态是两个独立字段，不得合并成一个标签（红线⑦）
 *   - 统计只用白名单指标，不出现销售额 / 实收 / GMV（红线⑧）
 */

function toMap(list) {
  return list.reduce((acc, item) => {
    acc[item.value] = item.text;
    return acc;
  }, {});
}

export function labelOf(map, value, fallback = '—') {
  if (value === undefined || value === null || value === '') return fallback;
  return map[value] !== undefined ? map[value] : String(value);
}

/** 活动业务状态 grouporder-activity.status */
export const ACTIVITY_STATUS_OPTIONS = [
  { value: 0, text: '草稿' },
  { value: 1, text: '审核中' },
  { value: 2, text: '进行中' },
  { value: 3, text: '已截止' },
  { value: 4, text: '已取消' },
];
export const ACTIVITY_STATUS = toMap(ACTIVITY_STATUS_OPTIONS);

/** 治理状态（活动与商品共用）*/
export const GOVERNANCE_STATUS = toMap([
  { value: 0, text: '正常' },
  { value: 1, text: '已下架' },
]);

/** 交付方式：发布后不可改（D-060）*/
export const DELIVERY_TYPE = toMap([
  { value: 1, text: '送货上门' },
  { value: 2, text: '自提' },
]);

/** 商品售卖状态（团长经营动作）*/
export const ON_SALE = toMap([
  { value: 0, text: '停售' },
  { value: 1, text: '在售' },
]);

/** 审核结果 */
export const REVIEW_RESULT = toMap([
  { value: 0, text: '无结果' },
  { value: 1, text: '通过' },
  { value: 2, text: '不通过' },
  { value: 3, text: '已撤回' },
]);

export const REVIEW_MODE = toMap([
  { value: 1, text: '自动审核' },
  { value: 2, text: '人工审核' },
]);

/** 订单状态 */
export const ORDER_STATUS = toMap([
  { value: 1, text: '有效' },
  { value: 2, text: '已取消' },
  { value: 3, text: '已作废' },
]);

/** 举报类型（grouporder-report-co 的 REASON_TYPES）*/
export const REPORT_REASON_OPTIONS = [
  { value: 'drug', text: '药品' },
  { value: 'medical_device', text: '医疗器械' },
  { value: 'tobacco', text: '烟草' },
  { value: 'ecigarette', text: '电子烟' },
  { value: 'alcohol', text: '酒类' },
  { value: 'health_product', text: '保健品' },
  { value: 'dangerous', text: '危险品' },
  { value: 'porn_gamble', text: '色情赌博' },
  { value: 'illegal_ticket', text: '违规票务' },
  { value: 'infringement', text: '侵权' },
  { value: 'qualification', text: '需特殊资质' },
  { value: 'other', text: '其他' },
];
export const REPORT_REASON = toMap(REPORT_REASON_OPTIONS);

/** 举报状态 grouporder-report.status */
export const REPORT_STATUS = toMap([
  { value: 1, text: '待处理' },
  { value: 2, text: '处理中' },
  { value: 3, text: '已结案' },
  { value: 4, text: '复核中' },
  { value: 5, text: '复核完成' },
]);

/** 绑定申诉 */
export const APPEAL_TYPE = toMap([
  { value: 1, text: '解绑' },
  { value: 2, text: '重新绑定' },
]);
export const APPEAL_STATUS = toMap([
  { value: 1, text: '待处理' },
  { value: 2, text: '处理中' },
  { value: 3, text: '处理成功' },
  { value: 4, text: '处理失败' },
]);

/** 隐私事项 */
export const PRIVACY_CASE_TYPE = toMap([
  { value: 1, text: '账号注销' },
  { value: 2, text: '删除请求' },
  { value: 3, text: '到期匿名化' },
]);
export const PRIVACY_CASE_STATUS = toMap([
  { value: 1, text: '已登记' },
  { value: 2, text: '限制处理中' },
  { value: 3, text: '已到期待处理' },
  { value: 4, text: '已完成' },
  { value: 5, text: '执行失败' },
]);

/** 待办分档（grouporder-user-co 的 TODO，共 4 档；档 1 最紧迫）*/
export const TODO_LEVEL_LABEL = {
  1: '需尽快处理',
  2: '待跟进',
  3: '即将截止',
  4: '结果通知',
};

/** 金额：库中以「分」存整数，展示为元 */
export function fen2yuan(fen) {
  if (fen === undefined || fen === null || fen === '') return '—';
  return (Number(fen) / 100).toFixed(2);
}

export default {
  labelOf,
  fen2yuan,
  ACTIVITY_STATUS,
  GOVERNANCE_STATUS,
  DELIVERY_TYPE,
  ON_SALE,
  REVIEW_RESULT,
  REVIEW_MODE,
  ORDER_STATUS,
  REPORT_REASON,
  REPORT_STATUS,
  APPEAL_TYPE,
  APPEAL_STATUS,
  PRIVACY_CASE_TYPE,
  PRIVACY_CASE_STATUS,
  TODO_LEVEL_LABEL,
};
