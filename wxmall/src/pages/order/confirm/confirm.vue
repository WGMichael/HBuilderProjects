<template>
  <view class="page" v-if="goods.length">
    <!-- 收货地址 -->
    <view class="addr-card" @tap="goAddress">
      <view class="addr-main" v-if="address">
        <view class="addr-line1">
          <text class="addr-name">{{ address.name }}</text>
          <text class="addr-phone">{{ address.phone }}</text>
        </view>
        <view class="addr-detail">{{ address.region }} {{ address.detail }}</view>
      </view>
      <view class="addr-empty" v-else>请选择收货地址</view>
      <text class="addr-arrow">›</text>
    </view>

    <!-- 商品清单 -->
    <view class="goods-card">
      <view class="goods-item" v-for="(g, i) in goods" :key="i">
        <view class="thumb">
          <image v-if="isImg(g.cover)" class="thumb-el" :src="g.cover" mode="aspectFill" />
          <text v-else>{{ g.cover }}</text>
        </view>
        <view class="info">
          <view class="title ellipsis-2">{{ g.title }}</view>
          <view class="spec">{{ g.specName }}</view>
          <view class="grow">
            <view class="price"><text class="symbol">¥</text>{{ g.price }}</view>
            <text class="qty">x{{ g.qty }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 金额明细 -->
    <view class="amount-card">
      <view class="amount-row">
        <text class="amount-label">商品金额</text>
        <text class="amount-val"><text class="symbol">¥</text>{{ goodsAmount }}</text>
      </view>
      <view class="amount-row">
        <text class="amount-label">运费</text>
        <text class="amount-val">{{ freight > 0 ? '¥' + freight : '包邮' }}</text>
      </view>
      <view class="amount-row">
        <text class="amount-label">优惠</text>
        <text class="amount-val">-<text class="symbol">¥</text>{{ discount }}</text>
      </view>
    </view>

    <!-- 底部提交栏 -->
    <view class="submit-bar">
      <view class="pay-total">
        实付：<text class="pay-price"><text class="symbol">¥</text>{{ payAmount }}</text>
      </view>
      <view class="submit-btn" :class="{ disabled: submitting }" @tap="onSubmit">提交订单</view>
    </view>
  </view>

  <!-- 无可结算商品 -->
  <view class="empty" v-else>
    <text class="empty-txt">没有可结算的商品</text>
    <view class="go-btn" @tap="goBack">返回</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { db } from '@/data'
import { cartStore } from '@/store'
import { config } from '@/config'
import { isImg } from '@/utils/image'
import type { Address, OrderGoods, CreateOrderParams } from '@/types'

const from = ref<'cart' | 'buynow'>('cart')
const goods = ref<OrderGoods[]>([])
const address = ref<Address | null>(null)

const goodsAmount = computed(() => goods.value.reduce((s, g) => s + g.price * g.qty, 0))
const freight = computed(() => 0) // 运费：先固定包邮，规则后续可配
const discount = computed(() => 0) // 优惠：占位
const payAmount = computed(() => goodsAmount.value + freight.value - discount.value)

onLoad(() => {
  // 结算清单由购物车「结算」/ 详情「立即购买」写入 storage
  const payload = uni.getStorageSync(config.storageKeys.checkout)
  if (payload && payload.goods && payload.goods.length) {
    from.value = payload.from
    goods.value = payload.goods
  }
  // 地址在 onShow 统一加载（含首次进入与从地址页选择返回），此处不重复请求
})

// 首次进入取默认地址；从地址页「选择」返回则优先用选中的那个
onShow(() => {
  const picked = uni.getStorageSync(config.storageKeys.selectedAddress)
  if (picked && picked.id) {
    address.value = picked
    uni.removeStorageSync(config.storageKeys.selectedAddress) // 一次性，用完即清
    return
  }
  // 无新选择时：仅在还没有地址（首次进入）时取默认；已选地址则保留，避免未选择返回被默认覆盖
  if (!address.value) loadAddress()
})

async function loadAddress() {
  try {
    const list = await db.getAddresses?.()
    if (list && list.length) {
      address.value = list.find((a) => a.isDefault) || list[0]
    }
  } catch (e) {
    console.warn('[confirm] 加载地址失败', e)
  }
}

function goAddress() {
  // 带 mode=select 进入选择模式，地址页每行出现「选择」按钮
  uni.navigateTo({ url: '/pages/address/address?mode=select' })
}

const submitting = ref(false)

async function onSubmit() {
  if (submitting.value) return
  if (!address.value) {
    uni.showToast({ title: '请先选择收货地址', icon: 'none' })
    return
  }
  if (!goods.value.length) {
    uni.showToast({ title: '没有可结算的商品', icon: 'none' })
    return
  }
  if (!db.createOrder) {
    uni.showToast({ title: '下单功能未就绪', icon: 'none' })
    return
  }
  submitting.value = true
  uni.showLoading({ title: '提交中…', mask: true })
  try {
    const params: CreateOrderParams = {
      addressId: address.value.id,
      goods: goods.value.map((g) => ({ productId: g.productId, skuId: g.skuId, qty: g.qty }))
    }
    await db.createOrder(params)
    // 购物车来源：下单成功后清掉已下单的对应项
    if (from.value === 'cart') {
      cartStore.removeByKeys(goods.value.map((g) => g.productId + '_' + g.skuId))
    }
    uni.removeStorageSync(config.storageKeys.checkout)
    uni.hideLoading()
    uni.showToast({ title: '下单成功', icon: 'success' })
    // 跳订单列表（待付款）；支付为下一步
    setTimeout(() => {
      uni.redirectTo({ url: '/pages/order/order?status=unpaid' })
    }, 700)
  } catch (e: any) {
    uni.hideLoading()
    // 后端校验失败（库存不足 / 超限购 / 已下架）会走这里
    uni.showModal({
      title: '下单失败',
      content: e?.message || e?.errMsg || '库存不足或数量超限，请返回调整后重试',
      showCancel: false
    })
  } finally {
    submitting.value = false
  }
}

function goBack() {
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.page { padding-bottom: 140rpx; }

/* 收货地址 */
.addr-card {
  display: flex;
  align-items: center;
  background: $bg-card;
  margin: 20rpx;
  padding: 28rpx 24rpx;
  border-radius: $radius-card;
}
.addr-main { flex: 1; min-width: 0; }
.addr-line1 { display: flex; align-items: baseline; }
.addr-name { font-size: 30rpx; font-weight: bold; color: $text-main; }
.addr-phone { font-size: 26rpx; color: $text-sub; margin-left: 20rpx; }
.addr-detail { font-size: 26rpx; color: #555; margin-top: 10rpx; line-height: 1.4; }
.addr-empty { flex: 1; font-size: 28rpx; color: $text-sub; }
.addr-arrow { color: #ccc; font-size: 40rpx; margin-left: 12rpx; }

/* 商品清单 */
.goods-card { background: $bg-card; margin: 20rpx; padding: 8rpx 24rpx; border-radius: $radius-card; }
.goods-item {
  display: flex;
  padding: 20rpx 0;
  border-bottom: 1rpx solid $border-line;
}
.goods-item:last-child { border-bottom: none; }
.thumb {
  width: 140rpx;
  height: 140rpx;
  background: #f0ddd0;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 60rpx;
  flex-shrink: 0;
  overflow: hidden;
}
.thumb-el { width: 140rpx; height: 140rpx; display: block; }
.info { flex: 1; min-width: 0; margin-left: 20rpx; display: flex; flex-direction: column; }
.title { font-size: 28rpx; line-height: 1.4; color: $text-main; }
.spec { font-size: 24rpx; color: $text-sub; margin-top: 8rpx; }
.grow { margin-top: auto; display: flex; justify-content: space-between; align-items: center; }
.price { color: $text-price; font-weight: bold; font-size: 30rpx; }
.symbol { font-size: 22rpx; }
.qty { font-size: 26rpx; color: $text-sub; }

/* 金额明细 */
.amount-card { background: $bg-card; margin: 20rpx; padding: 8rpx 24rpx; border-radius: $radius-card; }
.amount-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22rpx 0;
  font-size: 26rpx;
  border-bottom: 1rpx solid $border-line;
}
.amount-row:last-child { border-bottom: none; }
.amount-label { color: #555; }
.amount-val { color: $text-main; }

/* 提交栏 */
.submit-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  background: #fff;
  border-top: 1rpx solid $border-line;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.pay-total { margin-left: auto; font-size: 26rpx; color: $text-main; }
.pay-price { color: $text-price; font-weight: bold; font-size: 38rpx; }
.submit-btn {
  background: $brand;
  color: #fff;
  font-size: 28rpx;
  font-weight: bold;
  padding: 20rpx 56rpx;
  border-radius: 44rpx;
  margin-left: 24rpx;
}
.submit-btn.disabled { opacity: .6; }

/* 空态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 200rpx;
}
.empty-txt { font-size: 28rpx; color: $text-sub; }
.go-btn {
  margin-top: 40rpx;
  background: $brand;
  color: #fff;
  font-size: 28rpx;
  padding: 18rpx 60rpx;
  border-radius: 40rpx;
}
</style>
