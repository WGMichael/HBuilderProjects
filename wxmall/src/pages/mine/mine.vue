<template>
  <view class="page">
    <!-- 用户信息头部：未登录→点击登录；已登录→进个人资料 -->
    <view class="user-head" @tap="onHeadTap">
      <view class="avatar">
        <image v-if="avatarUrl" :src="avatarUrl" class="avatar-img" mode="aspectFill" />
        <text v-else class="avatar-ph">👤</text>
      </view>
      <view class="user-meta">
        <text class="user-name">{{ isLogin ? nickname : '点击登录 / 注册' }}</text>
        <text class="user-sub">
          {{ isLogin ? `🏅 ${level}` : '登录后享更多会员权益' }}
        </text>
      </view>
      <text class="arrow">›</text>
    </view>

    <!-- 会员统计四宫格：积分/优惠券/余额/收藏 暂无真实业务，先隐藏，待会员体系接入后恢复
    <view class="stats-card">
      <view class="stat" @tap="onStatTap('积分')">
        <text class="stat-num">{{ stats.points }}</text>
        <text class="stat-label">积分</text>
      </view>
      <view class="stat" @tap="onStatTap('优惠券')">
        <text class="stat-num">{{ stats.couponCount }}</text>
        <text class="stat-label">优惠券</text>
      </view>
      <view class="stat" @tap="onStatTap('余额')">
        <text class="stat-num"><text class="symbol">¥</text>{{ stats.balance }}</text>
        <text class="stat-label">余额</text>
      </view>
      <view class="stat" @tap="onStatTap('收藏')">
        <text class="stat-num">{{ stats.favoriteCount }}</text>
        <text class="stat-label">收藏</text>
      </view>
    </view>
    -->

    <!-- 我的订单 -->
    <view class="block orders">
      <view class="block-head">
        <text class="block-title">我的订单</text>
        <text class="block-more" @tap="goOrders('all')">全部 ›</text>
      </view>
      <view class="order-row">
        <view class="order-entry" v-for="e in orderEntries" :key="e.status" @tap="goOrders(e.status)">
          <view class="entry-ic-wrap">
            <text class="entry-ic">{{ e.icon }}</text>
            <text v-if="orderCounts[e.status] > 0" class="badge">
              {{ orderCounts[e.status] > 99 ? '99+' : orderCounts[e.status] }}
            </text>
          </view>
          <text class="entry-label">{{ e.label }}</text>
        </view>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="block menu">
      <view class="menu-item" v-for="m in menus" :key="m.key" @tap="onMenu(m.key)">
        <text class="menu-ic">{{ m.icon }}</text>
        <text class="menu-label">{{ m.label }}</text>
        <text v-if="m.extra" class="menu-extra">{{ m.extra }}</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <!-- 退出登录 -->
    <view v-if="isLogin" class="actions">
      <button class="logout-btn" @tap="onLogout">退出登录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
/** 我的页（个人中心）：登录态接入 uni-id，业务数据走 db，未就绪时优雅降级 */
import { computed, reactive, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { userStore } from '@/store'
import { db } from '@/data'
import { syncCartBadge } from '@/utils/tabbar'
import type { OrderStatus, MemberStats } from '@/types'

const isLogin = computed(() => userStore.isLogin.value)
const nickname = computed(() => userStore.info.value?.nickname || '会员')
const level = computed(() => userStore.info.value?.level || '普通会员')

// 头像地址：uni-id 存的是云存储 fileID（cloud://...），普通 <image> 无法直接渲染，
// 需先换成临时 https 链接（逻辑对齐官方 uni-id-pages-avatar 组件）。
const avatarUrl = ref('')

async function resolveAvatar() {
  const raw = userStore.info.value?.avatar || ''
  if (!raw) {
    avatarUrl.value = ''
    return
  }
  // http(s) / 本地路径 / base64 直接用
  if (/^(https?:|\/|data:)/.test(raw)) {
    avatarUrl.value = raw
    return
  }
  // cloud:// fileID 换临时链接
  if (raw.startsWith('cloud://')) {
    try {
      const res = await uniCloud.getTempFileURL({ fileList: [raw] })
      avatarUrl.value = res.fileList?.[0]?.tempFileURL || ''
    } catch (e) {
      console.warn('[mine] 头像 fileID 换链失败', e)
      avatarUrl.value = ''
    }
    return
  }
  // 其它（扩展存储等）暂不支持，显示占位
  avatarUrl.value = ''
}

// 用户头像变化时（如换头像返回）自动重新解析
watch(() => userStore.info.value?.avatar, resolveAvatar, { immediate: true })

// 会员统计：默认全 0，登录后从 db 拉取（后台未就绪时保持 0）
const stats = reactive<MemberStats>({ points: 0, couponCount: 0, balance: 0, favoriteCount: 0 })

// 订单状态入口（与订单页 tab 对齐）
const orderEntries: { status: OrderStatus; label: string; icon: string }[] = [
  { status: 'unpaid', label: '待付款', icon: '💰' },
  { status: 'unshipped', label: '待发货', icon: '📦' },
  { status: 'shipped', label: '待收货', icon: '🚚' },
  // 待评价（done）暂不做，先隐藏
  { status: 'refund', label: '退款', icon: '↩️' }
]

// 各订单状态数量（用于图标红点角标）
const orderCounts = reactive<Record<OrderStatus, number>>({
  unpaid: 0, unshipped: 0, shipped: 0, done: 0, refund: 0
})

// 功能菜单
const menus = computed(() => [
  { key: 'address', label: '收货地址', icon: '📍', extra: '' },
  // 我的优惠券 / 邀请好友得优惠 暂不做，先隐藏
  { key: 'service', label: '联系客服', icon: '🎧', extra: '' },
  { key: 'about', label: '关于我们', icon: 'ℹ️', extra: '' }
])

onShow(() => {
  syncCartBadge()
  userStore.silentLogin()
  // loadStats()  // 会员统计(积分/优惠券/余额/收藏)暂隐藏，不拉取
  loadOrderCounts()
  // 换头像后返回本页：fileID 可能未变但临时链接会过期，重新换链
  resolveAvatar()
  // 调试：打印登录后的用户信息（确认无误后可删）
  printUserInfo()
})

/** 调试用：打印当前登录用户信息 */
function printUserInfo() {
  console.log('[mine] 是否登录:', userStore.isLogin.value)
  if (!userStore.isLogin.value) return
  // 映射后的 UserInfo（页面用）
  console.log('[mine] UserInfo(映射):', JSON.parse(JSON.stringify(userStore.info.value)))
  // uni-id 原始文档（_id/nickname/avatar_file/mobile 等）
  console.log('[mine] uni-id 原始 userInfo:', JSON.parse(JSON.stringify(userStore.raw.userInfo)))
}

async function loadStats() {
  if (!isLogin.value) {
    // 未登录：重置为 0
    Object.assign(stats, { points: 0, couponCount: 0, balance: 0, favoriteCount: 0 })
    return
  }
  try {
    // 数据层可选方法，后台未就绪时优雅降级（保留 0）
    const s = await db.getMemberStats?.()
    if (s) Object.assign(stats, s)
  } catch (e) {
    console.warn('[mine] 获取会员统计失败，保持默认值', e)
  }
}

const EMPTY_COUNTS: Record<OrderStatus, number> = {
  unpaid: 0, unshipped: 0, shipped: 0, done: 0, refund: 0
}

/** 拉取订单并按状态计数（用于各状态图标红点） */
async function loadOrderCounts() {
  if (!isLogin.value) {
    Object.assign(orderCounts, EMPTY_COUNTS)
    return
  }
  try {
    const list = (await db.getOrders?.('all')) ?? []
    const next = { ...EMPTY_COUNTS }
    list.forEach((o) => {
      if (next[o.status] != null) next[o.status]++
    })
    Object.assign(orderCounts, next)
  } catch (e) {
    console.warn('[mine] 获取订单数失败，保持默认值', e)
  }
}

function onHeadTap() {
  if (!isLogin.value) {
    userStore.toLogin()
  } else {
    uni.navigateTo({ url: '/uni_modules/uni-id-pages/pages/userinfo/userinfo' })
  }
}

/** 需登录的操作统一拦截：未登录先引导登录 */
function requireLogin(): boolean {
  if (!isLogin.value) {
    userStore.toLogin()
    return false
  }
  return true
}

function onStatTap(name: string) {
  if (!requireLogin()) return
  uni.showToast({ title: `${name}（待接入）`, icon: 'none' })
}

function goOrders(status: OrderStatus | 'all') {
  if (!requireLogin()) return
  uni.navigateTo({ url: `/pages/order/order?status=${status}` })
}

function onMenu(key: string) {
  switch (key) {
    case 'address':
      if (!requireLogin()) return
      uni.navigateTo({ url: '/pages/address/address' })
      break
    case 'service':
      // TODO: 接入客服（微信客服会话 / 电话）
      uni.showToast({ title: '联系客服（待接入）', icon: 'none' })
      break
    default:
      // coupon / invite / about 等后续补
      uni.showToast({ title: '功能开发中', icon: 'none' })
  }
}

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录吗？',
    success: (res) => {
      if (res.confirm) userStore.logout()
    }
  })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 40rpx; }

/* 用户头部 */
.user-head {
  display: flex;
  align-items: center;
  padding: 48rpx 32rpx 60rpx;
  background: linear-gradient(120deg, #ff7a5c, #e64340);
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, .25);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.avatar-img { width: 100%; height: 100%; }
.avatar-ph { font-size: 64rpx; }
.user-meta { flex: 1; margin-left: 24rpx; display: flex; flex-direction: column; }
.user-name { color: #fff; font-size: 34rpx; font-weight: bold; }
.user-sub { color: rgba(255, 255, 255, .9); font-size: 24rpx; margin-top: 10rpx; }
.arrow { color: rgba(255, 255, 255, .9); font-size: 40rpx; }

/* 统计四宫格（悬浮在头部下沿） */
.stats-card {
  display: flex;
  justify-content: space-around;
  background: $bg-card;
  border-radius: $radius-card;
  margin: -40rpx 20rpx 0;
  padding: 28rpx 0;
  box-shadow: 0 6rpx 20rpx rgba(0, 0, 0, .05);
}
.stat { display: flex; flex-direction: column; align-items: center; flex: 1; }
.stat-num { font-size: 34rpx; font-weight: bold; color: $brand; }
.stat-label { font-size: 22rpx; color: $text-sub; margin-top: 8rpx; }
.symbol { font-size: 24rpx; }

/* 通用卡片块 */
.block {
  background: $bg-card;
  border-radius: $radius-card;
  margin: 20rpx;
  padding: 24rpx;
}

/* 我的订单 */
.block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}
.block-title { font-size: 30rpx; font-weight: bold; color: $text-main; }
.block-more { font-size: 24rpx; color: $text-sub; }
.order-row { display: flex; justify-content: space-around; }
.order-entry { display: flex; flex-direction: column; align-items: center; flex: 1; }
.entry-ic-wrap { position: relative; }
.entry-ic { font-size: 46rpx; }
.entry-label { font-size: 24rpx; color: $text-main; margin-top: 10rpx; }

/* 订单数红点角标 */
.badge {
  position: absolute;
  top: -8rpx;
  right: -14rpx;
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 6rpx;
  border-radius: 14rpx;
  background: $brand;
  color: #fff;
  font-size: 20rpx;
  line-height: 28rpx;
  text-align: center;
  box-sizing: border-box;
}

/* 功能菜单 */
.menu { padding: 0 24rpx; }
.menu-item {
  display: flex;
  align-items: center;
  padding: 28rpx 0;
  border-bottom: 1rpx solid $border-line;
}
.menu-item:last-child { border-bottom: none; }
.menu-ic { font-size: 36rpx; width: 48rpx; }
.menu-label { font-size: 28rpx; color: $text-main; margin-left: 12rpx; }
.menu-extra { margin-left: auto; font-size: 24rpx; color: $text-sub; }
.menu-arrow { color: #c8c7cc; font-size: 36rpx; margin-left: 12rpx; }

/* 退出登录 */
/* 顶部留白加大一倍(40→80rpx)，让退出按钮与上方菜单拉开距离 */
.actions { padding: 80rpx 32rpx 40rpx; }
.logout-btn {
  background: $brand;
  color: #fff;
  border: none;
  border-radius: 44rpx;
  font-size: 30rpx;
  font-weight: bold;
  height: 98rpx;
  line-height: 98rpx;
}
.logout-btn::after { border: none; }
.logout-btn:active { background: $brand-dark; }
</style>
