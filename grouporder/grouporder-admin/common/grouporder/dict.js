/**
 * 业务枚举与中文映射
 *
 * 全部取自 uniCloud-alipay/database/grouporder-*.schema.json 的 enum 定义，
 * 页面不要各自再写一份，改枚举时只改这里。
 *
 * 两条不能违反的规则：
 *   - 业务状态与治理状态是两个独立字段，不得合并成一个标签（BRIEF §6.3）
 *   - 商品的「售卖状态」是团长的经营动作，「治理状态」是平台动作，同样分列
 */

/** 把 [{value,text}] 形式的选项表转成 { value: text } */
function toMap(list) {
  return list.reduce((acc, item) => {
    acc[item.value] = item.text;
    return acc;
  }, {});
}

/** 取中文名，未知值回退为原值，避免页面显示 undefined */
export function labelOf(map, value, fallback = '—') {
  if (value === undefined || value === null || value === '') return fallback;
  return map[value] !== undefined ? map[value] : String(value);
}

// ——— 活动 grouporder-activity ———
export const ACTIVITY_STATUS_OPTIONS = [
  { value: 0, text: '草稿' },
  { value: 1, text: '审核中' },
  { value: 2, text: '进行中' },
  { value: 3, text: '已截止' },
  { value: 4, text: '已取消' },
];
export const ACTIVITY_STATUS = toMap(ACTIVITY_STATUS_OPTIONS);

export const GOVERNANCE_STATUS_OPTIONS = [
  { value: 0, text: '正常' },
  { value: 1, text: '已下架' },
];
export const GOVERNANCE_STATUS = toMap(GOVERNANCE_STATUS_OPTIONS);

export const DELIVERY_TYPE_OPTIONS = [
  { value: 1, text: '送货上门' },
  { value: 2, text: '自提' },
];
export const DELIVERY_TYPE = toMap(DELIVERY_TYPE_OPTIONS);

export const REVIEW_MODE_OPTIONS = [
  { value: 1, text: '自动审核' },
  { value: 2, text: '人工审核' },
];
export const REVIEW_MODE = toMap(REVIEW_MODE_OPTIONS);

export const REVIEW_RESULT_OPTIONS = [
  { value: 0, text: '无结果' },
  { value: 1, text: '通过' },
  { value: 2, text: '不通过' },
  { value: 3, text: '已撤回' },
];
export const REVIEW_RESULT = toMap(REVIEW_RESULT_OPTIONS);

export const END_TYPE = toMap([
  { value: 1, text: '定时自动' },
  { value: 2, text: '团长手动提前' },
]);

/** 文本与图片检测状态（activity.text_check_status / img_check_status、goods.img_check_status） */
export const CHECK_STATUS_OPTIONS = [
  { value: 0, text: '待检测' },
  { value: 1, text: '通过' },
  { value: 2, text: '待人工复核' },
  { value: 3, text: '已拦截' },
];
export const CHECK_STATUS = toMap(CHECK_STATUS_OPTIONS);

// ——— 商品 grouporder-goods ———
export const ON_SALE_OPTIONS = [
  { value: 0, text: '停售' },
  { value: 1, text: '在售' },
];
export const ON_SALE = toMap(ON_SALE_OPTIONS);

// ——— 举报 grouporder-report ———
export const REPORT_STATUS_OPTIONS = [
  { value: 1, text: '待处理' },
  { value: 2, text: '处理中' },
  { value: 3, text: '已结案' },
  { value: 4, text: '复核中' },
  { value: 5, text: '复核完成' },
];
export const REPORT_STATUS = toMap(REPORT_STATUS_OPTIONS);

/** 审核结论 6 选 1，理由必填（OPS §5.1） */
export const REPORT_CONCLUSION_OPTIONS = [
  { value: 1, text: '无违规', desc: '结案，不产生任何处置' },
  { value: 2, text: '警告发布者', desc: '处置记录，不改变账号状态' },
  { value: 3, text: '下架单个商品', desc: '活动内其他商品继续参与' },
  { value: 4, text: '下架整个活动', desc: '禁止新建订单或扩大已有订单数量，不删除任何数据' },
  { value: 5, text: '临时限制发布', desc: '需填写起止时间' },
  { value: 6, text: '永久限制发布', desc: '无自动结束时间' },
];
export const REPORT_CONCLUSION = toMap(REPORT_CONCLUSION_OPTIONS);

// ——— 内容检测 grouporder-content-check ———
export const CHECK_OBJECT_TYPE = { activity: '活动', goods: '商品' };
export const CHECK_CONTENT_TYPE = { text: '文本', image: '图片' };

export const CHECK_RESULT_OPTIONS = [
  { value: 1, text: '通过' },
  { value: 2, text: '命中需人工' },
  { value: 3, text: '明确违规拦截' },
];
export const CHECK_RESULT = toMap(CHECK_RESULT_OPTIONS);

/** 内容检测复核 4 状态（OPS §5.2） */
export const CHECK_REVIEW_STATUS_OPTIONS = [
  { value: 1, text: '待复核' },
  { value: 2, text: '已放行' },
  { value: 3, text: '维持拦截' },
  { value: 4, text: '已处置' },
];
export const CHECK_REVIEW_STATUS = toMap(CHECK_REVIEW_STATUS_OPTIONS);

/**
 * 违规类型选项。
 *
 * ⚠ OPS §6.1 与 §7 都要求「选择违规类型」，但**文档中没有给出这份清单**，
 * grouporder-activity.governance_type / grouporder-restriction.violation_type
 * 在 schema 里也只是无枚举的 string。下面是按举报类型语境拟的占位清单，
 * **待产品负责人确认**后再定稿；「其他」一项允许手工填写，避免清单不全时无法处置。
 */
export const VIOLATION_TYPE_OPTIONS = [
  { value: '需特殊资质商品', text: '需特殊资质商品' },
  { value: '禁售商品', text: '禁售商品' },
  { value: '违法违禁内容', text: '违法违禁内容' },
  { value: '虚假宣传', text: '虚假宣传' },
  { value: '侵犯他人权益', text: '侵犯他人权益' },
  { value: '重复发布受限商品', text: '重复发布受限商品' },
  { value: '其他', text: '其他（需在原因中说明）' },
];

// ——— 发布者处置 grouporder-restriction / grouporder-user-ext ———
export const RESTRICTION_ACTION_OPTIONS = [
  { value: 1, text: '警告', desc: '记录违规类型、原因、关联事项与时间，不改变账号登录及参与能力，也不作为账号状态' },
  { value: 2, text: '临时限制发布', desc: '在明确的起止时间内禁止创建或发布新活动' },
  { value: 3, text: '永久限制发布', desc: '无自动结束时间，禁止创建或发布新活动' },
  { value: 4, text: '解除限制', desc: '基于复核结论解除当前发布限制，保留原处置记录' },
];
export const RESTRICTION_ACTION = toMap(RESTRICTION_ACTION_OPTIONS);

export const PUBLISH_RESTRICTION_OPTIONS = [
  { value: 0, text: '正常' },
  { value: 1, text: '临时限制发布' },
  { value: 2, text: '永久限制发布' },
];
export const PUBLISH_RESTRICTION = toMap(PUBLISH_RESTRICTION_OPTIONS);

// ——— 订单 grouporder-order ———
export const ORDER_STATUS_OPTIONS = [
  { value: 1, text: '有效' },
  { value: 2, text: '已取消' },
  { value: 3, text: '已作废' },
];
export const ORDER_STATUS = toMap(ORDER_STATUS_OPTIONS);

// ——— Excel 事件 grouporder-export-log ———
export const EXPORT_EVENT_OPTIONS = [
  { value: 1, text: '生成成功' },
  { value: 2, text: '生成失败' },
  { value: 3, text: '下载成功' },
  { value: 4, text: '下载失败' },
  { value: 5, text: '权限拒绝' },
];
export const EXPORT_EVENT = toMap(EXPORT_EVENT_OPTIONS);

// ——— 操作日志 grouporder-oplog ———
export const OPLOG_RESULT_OPTIONS = [
  { value: 1, text: '成功' },
  { value: 0, text: '失败' },
];
export const OPLOG_RESULT = toMap(OPLOG_RESULT_OPTIONS);

// ——— 绑定申诉 grouporder-bind-appeal ———
export const APPEAL_TYPE_OPTIONS = [
  { value: 1, text: '解绑' },
  { value: 2, text: '重新绑定' },
];
export const APPEAL_TYPE = toMap(APPEAL_TYPE_OPTIONS);

export const APPEAL_STATUS_OPTIONS = [
  { value: 1, text: '待处理' },
  { value: 2, text: '处理中' },
  { value: 3, text: '处理成功' },
  { value: 4, text: '处理失败' },
];
export const APPEAL_STATUS = toMap(APPEAL_STATUS_OPTIONS);

// ——— 隐私事项 grouporder-privacy-case ———
export const PRIVACY_CASE_TYPE_OPTIONS = [
  { value: 1, text: '账号注销' },
  { value: 2, text: '删除请求' },
  { value: 3, text: '到期匿名化' },
];
export const PRIVACY_CASE_TYPE = toMap(PRIVACY_CASE_TYPE_OPTIONS);

export const PRIVACY_CASE_STATUS_OPTIONS = [
  { value: 1, text: '已登记' },
  { value: 2, text: '限制处理中' },
  { value: 3, text: '已到期待处理' },
  { value: 4, text: '已完成' },
  { value: 5, text: '执行失败' },
];
export const PRIVACY_CASE_STATUS = toMap(PRIVACY_CASE_STATUS_OPTIONS);

/**
 * uni-tag 的语义色。治理状态与拦截类一律用 error，
 * 色值本身由 uni-tag 按 type 取 uni.scss 的标准值，页面不要写死颜色。
 */
export const TAG_TYPE = {
  normal: 'success',
  warning: 'warning',
  danger: 'error',
  plain: 'default',
  primary: 'primary',
};

/** 金额：库中以「分」存整数，展示为元（D-013 不做支付，金额只用于预计合计） */
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
  REVIEW_MODE,
  REVIEW_RESULT,
  END_TYPE,
  CHECK_STATUS,
  ON_SALE,
  REPORT_STATUS,
  REPORT_CONCLUSION,
  CHECK_RESULT,
  CHECK_REVIEW_STATUS,
  RESTRICTION_ACTION,
  PUBLISH_RESTRICTION,
  ORDER_STATUS,
  EXPORT_EVENT,
  OPLOG_RESULT,
  APPEAL_TYPE,
  APPEAL_STATUS,
  PRIVACY_CASE_TYPE,
  PRIVACY_CASE_STATUS,
};
