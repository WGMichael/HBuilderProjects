/**
 * 打开「接龙」tab 的指定子页（待办 / 我发起的 / 我参与的）
 *
 * 「接龙」是 tabBar 页，switchTab 不能带参数：目标子页经本机缓存中转，jielong 在 onShow 时读取即清除。
 */
const KEY = 'go_hall_sub';
export const HALL_SUBS = ['todo', 'lead', 'join'];
let memory = '';

export function openHallSub(sub) {
  if (!HALL_SUBS.includes(sub)) return;
  memory = sub;
  try { uni.setStorageSync(KEY, sub); } catch (e) {}
  uni.switchTab({ url: '/pages/hall/jielong' });
}

export function takeHallSub() {
  let sub = memory;
  try { sub = uni.getStorageSync(KEY) || sub; uni.removeStorageSync(KEY); } catch (e) {}
  memory = '';
  return HALL_SUBS.includes(sub) ? sub : '';
}
