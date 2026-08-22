/**
 * tabBar 相关工具
 */
import { cartStore } from '@/store'

/** 购物车在 tabBar.list 中的位置（首页0/分类1/购物车2/我的3） */
const CART_TAB_INDEX = 2

/**
 * 同步购物车角标到原生 tabBar。
 * 注意：uni.setTabBarBadge 仅在「当前页为 tabBar 页」时可用，否则报 not TabBar page。
 * 所以本函数应在 tab 页的 onShow 里调用；非 tab 页调用会走 fail，静默忽略即可。
 */
export function syncCartBadge() {
  const n = cartStore.badge.value
  if (n > 0) {
    uni.setTabBarBadge({
      index: CART_TAB_INDEX,
      text: n > 99 ? '99+' : String(n),
      fail: () => {} // 非 tab 页调用会失败，忽略；下次 tab 页 onShow 会再同步
    })
  } else {
    uni.removeTabBarBadge({ index: CART_TAB_INDEX, fail: () => {} })
  }
}
