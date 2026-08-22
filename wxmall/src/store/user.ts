/**
 * 用户状态（对接 uni-id-pages）
 *
 * 采用「分域策略」：认证域（登录/注册/资料）由官方 uni-id-pages 统一管理，
 * 其响应式用户状态是唯一数据源；本模块只做一层「适配桥」：
 *   1. 把 uni-id 的登录态 / userInfo 映射成本项目页面熟悉的 UserInfo 结构；
 *   2. 提供跳转登录页、退出登录等便捷方法。
 * 页面仍从 `@/store` 引入 userStore，无需感知 uni-id 细节。
 */
import { computed } from 'vue'
// uni-id-pages 自带的响应式用户状态与操作（js 模块，无类型声明）
// @ts-ignore
import { store as uniIdStore, mutations as uniIdMutations } from '@/uni_modules/uni-id-pages/common/store.js'
import type { UserInfo } from '@/types'

/** 账号密码登录页（当前唯一可联调的方式；其它方式待凭证/服务到位） */
const LOGIN_PAGE = '/uni_modules/uni-id-pages/pages/login/login-withpwd'

export const userStore = {
  /** uni-id-pages 原始用户状态（认证域唯一数据源，需要时可直接读） */
  raw: uniIdStore,

  /** 是否已登录：以 uni-id 的 hasLogin 为响应式触发源，并校验 token 未过期 */
  isLogin: computed<boolean>(() => {
    // hasLogin 变化（登录/登出）驱动本 computed 重算
    if (!uniIdStore.hasLogin) return false
    // 过期时间以 token 自解析结果为准（与官方 store.js 判断一致）；
    // 不再依赖 uni_id_token_expired 存储键——本项目登录流程不会往其写入有效值
    const { uid, tokenExpired } = uniCloud.getCurrentUserInfo() as {
      uid?: string
      tokenExpired?: number
    }
    return !!uid && !!tokenExpired && tokenExpired > Date.now()
  }),

  /** 映射为本项目 UserInfo 结构，供页面展示 */
  info: computed<UserInfo | null>(() => {
    const u = uniIdStore.userInfo
    if (!u || !u._id) return null
    return {
      openid: u._id,
      nickname: u.nickname || u.username || u.mobile || u.email || '会员',
      avatar: (u.avatar_file && u.avatar_file.url) || '',
      phone: u.mobile,
      points: 0,
      level: '普通会员'
    }
  }),

  /** 跳转登录页 */
  toLogin() {
    uni.navigateTo({ url: LOGIN_PAGE })
  },

  /**
   * 启动/展示时同步登录态：
   * uni-id-pages 已从本地缓存恢复 store，这里在已登录时刷新一次云端用户信息。
   * 注：微信一键登录需在 uni-id 的 config.json 配置小程序 appid+appsecret 后才可用。
   */
  silentLogin() {
    if (this.isLogin.value) {
      uniIdMutations.updateUserInfo()
    }
  },

  /** 退出登录（走 uni-id-co 注销并清理缓存、跳登录页） */
  logout() {
    uniIdMutations.logout()
  }
}
