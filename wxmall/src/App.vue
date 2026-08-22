<script lang="ts">
import { defineComponent, watch } from 'vue'
import { userStore, cartStore } from './store'
import { syncCartBadge } from '@/utils/tabbar'
// uni-id-pages 初始化（clientDB 错误绑定、token 刷新监听等），js 模块无类型声明
// @ts-ignore
import initUniIdPages from '@/uni_modules/uni-id-pages/init.js'

export default defineComponent({
  onLaunch() {
    console.log('App Launch')
    // uni-id 初始化（需最先执行）
    initUniIdPages()
    // 同步登录态：已登录则刷新用户信息（微信一键登录需配置小程序 appid 后启用）
    userStore.silentLogin()

    // 购物车件数变化时同步 tabBar 角标（覆盖"停在购物车页里增删"的实时场景；
    // "在非 tab 页改了购物车再切回来"的场景由各 tab 页 onShow 调 syncCartBadge 兜底）
    watch(cartStore.badge, () => syncCartBadge(), { immediate: true })
  },
  onShow() {
    console.log('App Show')
  },
  onHide() {
    console.log('App Hide')
  }
})
</script>

<style>
/* 全局公共样式 */
page {
  background-color: #f4f5f7;
  color: #1a1a1a;
  font-size: 28rpx;
}

.brand-color { color: #e64340; }
.brand-bg { background-color: #e64340; }

/* 单行/多行省略 */
.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ellipsis-2 {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
