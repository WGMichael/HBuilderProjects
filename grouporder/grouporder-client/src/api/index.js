/**
 * 群接龙云对象调用清单
 *
 * 【本文件由 tools/gen-frontend-api.js 自动生成，不要手改】
 * 新增或改名云对象方法后重跑：node tools/gen-frontend-api.js
 *
 * 这里只有方法名与转发。**入参、出参、幂等键一律查 docs/arch/CLOUD_API.md §14**，
 * 本文件刻意不重复定义参数，避免签名出现第二个事实源。
 *
 * 用法：
 *   import api from '@/api'
 *   const { activity_id } = await api.activity.activityCreateDraft({ ... })
 *   // 成功直接拿 data；失败抛 BizError，由 client.js 统一处理
 */
import { call } from './client'

/** 活动与活动内商品（grouporder-activity-co，17 个方法） */
export const activity = {
  activityCreateDraft: (params, options) => call('grouporder-activity-co', 'activityCreateDraft', params, options),
  activityUpdateDraft: (params, options) => call('grouporder-activity-co', 'activityUpdateDraft', params, options),
  activitySubmitReview: (params, options) => call('grouporder-activity-co', 'activitySubmitReview', params, options),
  activityWithdrawReview: (params, options) => call('grouporder-activity-co', 'activityWithdrawReview', params, options),
  activityGetDetail: (params, options) => call('grouporder-activity-co', 'activityGetDetail', params, options),
  activityMyList: (params, options) => call('grouporder-activity-co', 'activityMyList', params, options),
  activityClose: (params, options) => call('grouporder-activity-co', 'activityClose', params, options),
  activityCancel: (params, options) => call('grouporder-activity-co', 'activityCancel', params, options),
  activityGetShareEntry: (params, options) => call('grouporder-activity-co', 'activityGetShareEntry', params, options),
  activityCopySourceList: (params, options) => call('grouporder-activity-co', 'activityCopySourceList', params, options),
  activityCopy: (params, options) => call('grouporder-activity-co', 'activityCopy', params, options),
  goodsCreate: (params, options) => call('grouporder-activity-co', 'goodsCreate', params, options),
  goodsUpdate: (params, options) => call('grouporder-activity-co', 'goodsUpdate', params, options),
  goodsDelete: (params, options) => call('grouporder-activity-co', 'goodsDelete', params, options),
  goodsSetOnSale: (params, options) => call('grouporder-activity-co', 'goodsSetOnSale', params, options),
  goodsAdjustStock: (params, options) => call('grouporder-activity-co', 'goodsAdjustStock', params, options),
  goodsSort: (params, options) => call('grouporder-activity-co', 'goodsSort', params, options),
}

/** 订单（grouporder-order-co，9 个方法） */
export const order = {
  orderPreview: (params, options) => call('grouporder-order-co', 'orderPreview', params, options),
  orderCreate: (params, options) => call('grouporder-order-co', 'orderCreate', params, options),
  orderMyList: (params, options) => call('grouporder-order-co', 'orderMyList', params, options),
  orderGetDetail: (params, options) => call('grouporder-order-co', 'orderGetDetail', params, options),
  orderUpdate: (params, options) => call('grouporder-order-co', 'orderUpdate', params, options),
  orderCancel: (params, options) => call('grouporder-order-co', 'orderCancel', params, options),
  orderVoid: (params, options) => call('grouporder-order-co', 'orderVoid', params, options),
  orderLeaderStat: (params, options) => call('grouporder-order-co', 'orderLeaderStat', params, options),
  orderLeaderList: (params, options) => call('grouporder-order-co', 'orderLeaderList', params, options),
}

/** 商品库与分类（账号级）（grouporder-goods-co，9 个方法） */
export const goodsLib = {
  libList: (params, options) => call('grouporder-goods-co', 'libList', params, options),
  libUpdate: (params, options) => call('grouporder-goods-co', 'libUpdate', params, options),
  libDelete: (params, options) => call('grouporder-goods-co', 'libDelete', params, options),
  libCopyToActivity: (params, options) => call('grouporder-goods-co', 'libCopyToActivity', params, options),
  categoryList: (params, options) => call('grouporder-goods-co', 'categoryList', params, options),
  categoryCreate: (params, options) => call('grouporder-goods-co', 'categoryCreate', params, options),
  categoryUpdate: (params, options) => call('grouporder-goods-co', 'categoryUpdate', params, options),
  categoryDelete: (params, options) => call('grouporder-goods-co', 'categoryDelete', params, options),
  categorySort: (params, options) => call('grouporder-goods-co', 'categorySort', params, options),
}

/** 收货信息簿、绑定申诉、隐私请求、待办（grouporder-user-co，13 个方法） */
export const user = {
  addressList: (params, options) => call('grouporder-user-co', 'addressList', params, options),
  addressCreate: (params, options) => call('grouporder-user-co', 'addressCreate', params, options),
  addressUpdate: (params, options) => call('grouporder-user-co', 'addressUpdate', params, options),
  addressDelete: (params, options) => call('grouporder-user-co', 'addressDelete', params, options),
  addressSetDefault: (params, options) => call('grouporder-user-co', 'addressSetDefault', params, options),
  bindStatus: (params, options) => call('grouporder-user-co', 'bindStatus', params, options),
  appealSubmit: (params, options) => call('grouporder-user-co', 'appealSubmit', params, options),
  appealMyList: (params, options) => call('grouporder-user-co', 'appealMyList', params, options),
  privacyRequestSubmit: (params, options) => call('grouporder-user-co', 'privacyRequestSubmit', params, options),
  privacyRequestMyList: (params, options) => call('grouporder-user-co', 'privacyRequestMyList', params, options),
  todoList: (params, options) => call('grouporder-user-co', 'todoList', params, options),
  todoDismiss: (params, options) => call('grouporder-user-co', 'todoDismiss', params, options),
  meOverview: (params, options) => call('grouporder-user-co', 'meOverview', params, options),
}

/** 清单预览、生成与下载（grouporder-export-co，3 个方法） */
export const exportList = {
  listPreview: (params, options) => call('grouporder-export-co', 'listPreview', params, options),
  listGenerate: (params, options) => call('grouporder-export-co', 'listGenerate', params, options),
  listDownload: (params, options) => call('grouporder-export-co', 'listDownload', params, options),
}

/** 举报（grouporder-report-co，3 个方法） */
export const report = {
  reportSubmit: (params, options) => call('grouporder-report-co', 'reportSubmit', params, options),
  reportMyList: (params, options) => call('grouporder-report-co', 'reportMyList', params, options),
  reportGetResult: (params, options) => call('grouporder-report-co', 'reportGetResult', params, options),
}

/** 运营后台（仅 admin 工程使用）（grouporder-ops-co，38 个方法） */
export const ops = {
  activityDetail: (params, options) => call('grouporder-ops-co', 'activityDetail', params, options),
  activityGovernanceOff: (params, options) => call('grouporder-ops-co', 'activityGovernanceOff', params, options),
  goodsGovernanceOff: (params, options) => call('grouporder-ops-co', 'goodsGovernanceOff', params, options),
  activityGovernanceOn: (params, options) => call('grouporder-ops-co', 'activityGovernanceOn', params, options),
  goodsGovernanceOn: (params, options) => call('grouporder-ops-co', 'goodsGovernanceOn', params, options),
  reportList: (params, options) => call('grouporder-ops-co', 'reportList', params, options),
  reportDetail: (params, options) => call('grouporder-ops-co', 'reportDetail', params, options),
  reportClaim: (params, options) => call('grouporder-ops-co', 'reportClaim', params, options),
  reportConclude: (params, options) => call('grouporder-ops-co', 'reportConclude', params, options),
  reportRecheck: (params, options) => call('grouporder-ops-co', 'reportRecheck', params, options),
  checkList: (params, options) => call('grouporder-ops-co', 'checkList', params, options),
  checkHandle: (params, options) => call('grouporder-ops-co', 'checkHandle', params, options),
  publisherRestrict: (params, options) => call('grouporder-ops-co', 'publisherRestrict', params, options),
  reviewList: (params, options) => call('grouporder-ops-co', 'reviewList', params, options),
  reviewDetail: (params, options) => call('grouporder-ops-co', 'reviewDetail', params, options),
  reviewSubmit: (params, options) => call('grouporder-ops-co', 'reviewSubmit', params, options),
  configGet: (params, options) => call('grouporder-ops-co', 'configGet', params, options),
  configSet: (params, options) => call('grouporder-ops-co', 'configSet', params, options),
  searchOrders: (params, options) => call('grouporder-ops-co', 'searchOrders', params, options),
  searchActivities: (params, options) => call('grouporder-ops-co', 'searchActivities', params, options),
  searchGoods: (params, options) => call('grouporder-ops-co', 'searchGoods', params, options),
  searchUsers: (params, options) => call('grouporder-ops-co', 'searchUsers', params, options),
  exportSearchResult: (params, options) => call('grouporder-ops-co', 'exportSearchResult', params, options),
  statOverview: (params, options) => call('grouporder-ops-co', 'statOverview', params, options),
  statActivityDrill: (params, options) => call('grouporder-ops-co', 'statActivityDrill', params, options),
  statExport: (params, options) => call('grouporder-ops-co', 'statExport', params, options),
  appealList: (params, options) => call('grouporder-ops-co', 'appealList', params, options),
  appealDetail: (params, options) => call('grouporder-ops-co', 'appealDetail', params, options),
  appealResolve: (params, options) => call('grouporder-ops-co', 'appealResolve', params, options),
  privacyCaseList: (params, options) => call('grouporder-ops-co', 'privacyCaseList', params, options),
  privacyCaseCreate: (params, options) => call('grouporder-ops-co', 'privacyCaseCreate', params, options),
  privacyCaseUpdate: (params, options) => call('grouporder-ops-co', 'privacyCaseUpdate', params, options),
  exportLogList: (params, options) => call('grouporder-ops-co', 'exportLogList', params, options),
  exportDownload: (params, options) => call('grouporder-ops-co', 'exportDownload', params, options),
  oplogList: (params, options) => call('grouporder-ops-co', 'oplogList', params, options),
  workbenchTodo: (params, options) => call('grouporder-ops-co', 'workbenchTodo', params, options),
  accountSetStatus: (params, options) => call('grouporder-ops-co', 'accountSetStatus', params, options),
  roleAssign: (params, options) => call('grouporder-ops-co', 'roleAssign', params, options),
}

/** 合计 92 个方法 */
export default { activity, order, goodsLib, user, exportList, report, ops }
