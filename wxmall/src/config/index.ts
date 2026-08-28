/**
 * 全局运行配置
 * 数据层通过 USE_MOCK 决定数据来源：
 *   true  -> 本地 mock 假数据（开发/演示阶段）
 *   false -> 真实后台（uniCloud / HTTP 接口）
 * 后期后台就绪，只需把 USE_MOCK 改成 false，页面代码无需改动。
 */
export const config = {
  /** 是否使用本地 mock 数据 */
  USE_MOCK: false,

  /** 数据来源类型：'cloud' = uniCloud；'http' = 传统后端接口 */
  backend: 'cloud' as 'cloud' | 'http',

  /** HTTP 后端基础地址（backend='http' 时使用） */
  baseUrl: 'https://your-api.example.com/api',

  /** 请求超时(ms) */
  timeout: 10000,

  /** 本地存储 key */
  storageKeys: {
    token: 'tc_token',
    cart: 'tc_cart',
    user: 'tc_user',
    /** 首页点分类快捷入口时，跨页(switchTab)传递给分类页的待定位分类 id */
    pendingCategory: 'tc_pending_category',
    /** 结算清单：购物车结算 / 立即购买 传给确认订单页 */
    checkout: 'tc_checkout',
    /** 确认订单页 → 地址页「选择模式」选中的地址回传 */
    selectedAddress: 'tc_selected_address'
  }
}

export type AppConfig = typeof config
