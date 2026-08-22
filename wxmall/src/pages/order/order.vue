<template>
  <view class="page">
    <!-- 状态切换 -->
    <scroll-view class="tabs" scroll-x :show-scrollbar="false">
      <view
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ on: activeTab === t.key }"
        @tap="switchTab(t.key)"
      >
        {{ t.label }}
      </view>
    </scroll-view>

    <!-- 订单列表 -->
    <view v-if="orders.length" class="order-list">
      <view class="order-card" v-for="o in orders" :key="o.id">
        <view class="card-head">
          <text class="order-no">订单号 {{ o.id }}</text>
          <text class="status" :class="o.status">{{ statusText(o.status) }}</text>
        </view>

        <!-- 商品行 -->
        <view class="goods" v-for="g in o.goods" :key="g.skuId">
          <view class="thumb">{{ g.cover }}</view>
          <view class="goods-info">
            <view class="goods-title ellipsis-2">{{ g.title }}</view>
            <view class="goods-spec">{{ g.specName }}</view>
          </view>
          <view class="goods-price">
            <view class="price"><text class="symbol">¥</text>{{ g.price }}</view>
            <view class="qty">x{{ g.qty }}</view>
          </view>
        </view>

        <!-- 合计 -->
        <view class="card-foot">
          <text class="total-tip">
            共 {{ totalQty(o) }} 件，实付
            <text class="pay"><text class="symbol">¥</text>{{ o.payAmount }}</text>
          </text>
        </view>

        <!-- 操作按钮（按状态展示，均为 TODO） -->
        <view class="card-actions">
          <view
            v-for="btn in actionsOf(o.status)"
            :key="btn.text"
            class="mini-btn"
            :class="{ primary: btn.primary }"
            @tap="onAction(btn.text, o)"
          >
            {{ btn.text }}
          </view>
        </view>
      </view>

      <view class="list-note">仅显示近三个月订单</view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty">
      <text class="empty-ic">📦</text>
      <text class="empty-txt">暂无相关订单</text>
      <view class="go-btn" @tap="goShopping">去逛逛</view>
    </view>
  </view>
</template>

<script setup lang="ts">
/** 我的订单：按状态筛选展示，数据走 db；子操作暂为占位 TODO */
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { db } from '@/data'
import type { Order, OrderStatus } from '@/types'

type TabKey = OrderStatus | 'all'

const tabs: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unpaid', label: '待付款' },
  { key: 'unshipped', label: '待发货' },
  { key: 'shipped', label: '待收货' },
  { key: 'done', label: '待评价' },
  { key: 'refund', label: '退款' }
]

const activeTab = ref<TabKey>('all')
const orders = ref<Order[]>([])

// 支持从「我的」页带 status 直达对应分类
onLoad((options) => {
  const s = options?.status as TabKey | undefined
  if (s && tabs.some((t) => t.key === s)) activeTab.value = s
})

onShow(() => {
  loadOrders()
})

async function loadOrders() {
  try {
    // 数据层可选方法，后台未就绪时优雅降级为空
    const list = (await db.getOrders?.(activeTab.value)) ?? []
    orders.value = list
  } catch (e) {
    console.warn('[order] 获取订单失败，降级为空列表', e)
    orders.value = []
  }
}

function switchTab(key: TabKey) {
  if (activeTab.value === key) return
  activeTab.value = key
  loadOrders()
}

/** 状态中文 */
function statusText(s: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    unpaid: '待付款',
    unshipped: '待发货',
    shipped: '待收货',
    done: '已完成',
    refund: '退款/售后'
  }
  return map[s]
}

/** 单笔订单总件数 */
function totalQty(o: Order): number {
  return o.goods.reduce((sum, g) => sum + g.qty, 0)
}

/** 各状态对应的底部操作按钮 */
function actionsOf(s: OrderStatus): { text: string; primary?: boolean }[] {
  switch (s) {
    case 'unpaid':
      return [{ text: '取消订单' }, { text: '去支付', primary: true }]
    case 'unshipped':
      return [{ text: '提醒发货', primary: true }]
    case 'shipped':
      return [{ text: '查看物流' }, { text: '确认收货', primary: true }]
    case 'done':
      return [{ text: '再次购买' }, { text: '去评价', primary: true }]
    case 'refund':
      return [{ text: '退款详情', primary: true }]
    default:
      return []
  }
}

function onAction(text: string, _o: Order) {
  // TODO: 逐个接入（支付/物流/收货/评价/再买等）
  uni.showToast({ title: `${text}（待接入）`, icon: 'none' })
}

function goShopping() {
  uni.switchTab({ url: '/pages/index/index' })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 40rpx; }

/* 状态切换 */
.tabs {
  white-space: nowrap;
  background: #fff;
  border-bottom: 1rpx solid $border-line;
  position: sticky;
  top: 0;
  z-index: 5;
}
.tab {
  display: inline-block;
  padding: 24rpx 32rpx;
  font-size: 28rpx;
  color: $text-sub;
  position: relative;
}
.tab.on { color: $brand; font-weight: bold; }
.tab.on::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 8rpx;
  transform: translateX(-50%);
  width: 40rpx;
  height: 6rpx;
  border-radius: 3rpx;
  background: $brand;
}

/* 订单卡片 */
.order-list { padding: 20rpx; }
.order-card {
  background: $bg-card;
  border-radius: $radius-card;
  padding: 24rpx;
  margin-bottom: 20rpx;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid $border-line;
}
.order-no { font-size: 24rpx; color: $text-sub; }
.status { font-size: 26rpx; color: $brand; font-weight: bold; }
.status.done { color: #07c160; }
.status.refund { color: $text-sub; }

/* 商品行 */
.goods { display: flex; align-items: center; margin-top: 20rpx; }
.thumb {
  width: 120rpx;
  height: 120rpx;
  background: #f0ddd0;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 60rpx;
  flex-shrink: 0;
}
.goods-info { flex: 1; min-width: 0; margin-left: 20rpx; }
.goods-title { font-size: 28rpx; line-height: 1.4; color: $text-main; }
.goods-spec { font-size: 24rpx; color: $text-sub; margin-top: 10rpx; }
.goods-price { text-align: right; flex-shrink: 0; margin-left: 12rpx; }
.price { color: $text-main; font-size: 28rpx; }
.qty { color: $text-sub; font-size: 24rpx; margin-top: 8rpx; }
.symbol { font-size: 22rpx; }

/* 合计 */
.card-foot { text-align: right; margin-top: 20rpx; }
.total-tip { font-size: 26rpx; color: $text-main; }
.pay { color: $text-price; font-weight: bold; font-size: 32rpx; }

/* 操作按钮 */
.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 20rpx;
}
.mini-btn {
  padding: 12rpx 30rpx;
  border: 1rpx solid $border-line;
  border-radius: 32rpx;
  font-size: 26rpx;
  color: $text-main;
}
.mini-btn.primary { background: $brand; color: #fff; border-color: $brand; }

.list-note { text-align: center; color: $text-sub; font-size: 24rpx; margin-top: 10rpx; }

/* 空状态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 200rpx;
}
.empty-ic { font-size: 120rpx; }
.empty-txt { font-size: 28rpx; color: $text-sub; margin-top: 24rpx; }
.go-btn {
  margin-top: 40rpx;
  background: $brand;
  color: #fff;
  font-size: 28rpx;
  padding: 18rpx 60rpx;
  border-radius: 40rpx;
}
</style>
