/**
 * 返回上一页的兜底：H5 刷新后页面栈只剩当前页，navigateBack 会失败、用户停在原地。
 * 有上一页就正常返回；没有就 redirectTo 兜底页（tab 页用 switchTab）。
 */
const TAB_PAGES = ['/pages/hall/jielong', '/pages/hall/faqi', '/pages/hall/my'];

/**
 * @param {string} fallback 栈里没有上一页时去的页面（含参数）
 * @param {number} delta 正常情况下返回几层
 */
export function safeBack(fallback, delta = 1) {
  const n = getCurrentPages().length;
  if (n > delta) {
    uni.navigateBack({ delta });
    return;
  }
  const url = fallback || '/pages/hall/jielong';
  if (TAB_PAGES.includes(url.split('?')[0])) uni.switchTab({ url });
  else uni.redirectTo({ url });
}

/**
 * 返回到栈中最近的某个页面（route 不带开头的 /）；栈里没有就 redirectTo fallback。
 * 用于「改单完成回订单详情」这类跨多层返回，不依赖固定 delta。
 */
export function backTo(route, fallback) {
  const pages = getCurrentPages();
  for (let i = pages.length - 2; i >= 0; i--) {
    if (pages[i].route === route) {
      uni.navigateBack({ delta: pages.length - 1 - i });
      return;
    }
  }
  safeBack(fallback, pages.length);
}
