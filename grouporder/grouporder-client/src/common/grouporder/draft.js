/**
 * 删除草稿（D-090）：M-09「我发起的」与 M-20 活动管理共用
 *
 * 交互：二次确认 → 「删除中…」遮罩（服务端要删商品并逐个回收图片，耗时数秒）→
 * 成功提示 → 调用方刷新；失败一律给出原因，不静默。
 * 提示放在 hideLoading 之后：小程序 loading 与 toast 共用一层，先弹 toast 会被 hideLoading 一起关掉。
 */
// @ts-ignore
import api from './request.js';

/** 从未发布、未被处置的草稿才可删除；服务端还会校验没有订单 */
export function canDeleteDraft(a) {
  return !!a && a.status === 0 && !a.publish_date && a.governance_status !== 1;
}

/**
 * @param {object} a 活动（需 _id、title）
 * @returns {Promise<boolean>} 是否已删除
 */
export function confirmDeleteDraft(a) {
  return new Promise((resolve) => {
    uni.showModal({
      title: '删除草稿',
      content: `确认删除「${a.title || '未命名草稿'}」？删除后草稿及其中的商品将被永久删除，不可恢复。商品库里已保存的商品不受影响。`,
      confirmText: '删除',
      confirmColor: '#c7463f',
      success: async (r) => {
        if (!r.confirm) return resolve(false);
        uni.showLoading({ title: '删除中…', mask: true });
        try {
          // 静默调用：错误提示由这里统一给，避免与默认 toast 重复或被 loading 关掉
          await api.activity.activityDeleteDraft({ activity_id: a._id }, { silent: true });
          uni.hideLoading();
          uni.showToast({ title: '删除成功', icon: 'success' });
          resolve(true);
        } catch (e) {
          uni.hideLoading();
          const msg = (e && (e.errMsg || e.message)) || '请稍后重试';
          uni.showModal({ title: '删除失败', content: msg, showCancel: false });
          resolve(false);
        }
      },
      fail: () => resolve(false),
    });
  });
}

// —— 复用历史接龙（D-067、D-091）：M-31 选源 → 发起页预填，由团长决定保存草稿或确认发布 ——
// 「发起接龙」是 tabBar 页，switchTab 不能带参数，源活动 id 经本机缓存中转，读取即清除
const COPY_KEY = 'go_copy_source';
let copyMemory = '';

export function setCopySource(activityId) {
  copyMemory = activityId || '';
  try { uni.setStorageSync(COPY_KEY, copyMemory); } catch (e) {}
}

export function takeCopySource() {
  let id = copyMemory;
  try { id = uni.getStorageSync(COPY_KEY) || id; uni.removeStorageSync(COPY_KEY); } catch (e) {}
  copyMemory = '';
  return id || '';
}
