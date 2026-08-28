<template>
  <view class="page">
    <!-- 选择模式提示（由确认订单页进入时显示） -->
    <view v-if="selectMode" class="pick-tip">请选择要使用的收货地址</view>

    <!-- 地址列表 -->
    <view v-if="addresses.length" class="addr-list">
      <view class="addr-card" v-for="a in addresses" :key="a.id">
        <!-- 主体：选择模式下点击=选中并返回；普通模式下点击=进入编辑 -->
        <view class="addr-main" @tap="onMain(a)">
          <view class="addr-row">
            <text class="name">{{ a.name }}</text>
            <text class="phone">{{ a.phone }}</text>
            <text v-if="a.isDefault" class="default-tag">默认</text>
          </view>
          <view class="addr-detail">{{ a.region }} {{ a.detail }}</view>
        </view>

        <!-- 操作栏 -->
        <view class="addr-actions">
          <view class="set-default" @tap="onSetDefault(a)">
            <text class="radio" :class="{ on: a.isDefault }">{{ a.isDefault ? '●' : '○' }}</text>
            <text class="set-txt">{{ a.isDefault ? '默认地址' : '设为默认' }}</text>
          </view>
          <view class="op-btns">
            <text v-if="selectMode" class="op pick" @tap="onPick(a)">✓ 选择</text>
            <text class="op" @tap="onEdit(a)">✎ 编辑</text>
            <text class="op del" @tap="onDelete(a)">🗑 删除</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view v-else class="empty">
      <text class="empty-ic">📍</text>
      <text class="empty-txt">还没有收货地址</text>
    </view>

    <!-- 底部新增按钮 -->
    <view class="add-bar">
      <view class="add-btn" @tap="onAdd">＋ 新增收货地址</view>
    </view>
  </view>
</template>

<script setup lang="ts">
/** 收货地址管理：列表 + 设默认 + 删除；新增/编辑跳独立表单页 */
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { db } from '@/data'
import { config } from '@/config'
import type { Address } from '@/types'

const addresses = ref<Address[]>([])
// 选择模式：由确认订单页带 ?mode=select 进入，此时每行显示「选择」按钮
const selectMode = ref(false)

onLoad((query) => {
  selectMode.value = query?.mode === 'select'
})

onShow(() => {
  // 从编辑页保存返回后也会触发，实现自动刷新
  loadAddresses()
})

async function loadAddresses() {
  try {
    addresses.value = (await db.getAddresses?.()) ?? []
  } catch (e) {
    console.warn('[address] 获取地址失败，降级为空列表', e)
    addresses.value = []
  }
}

function onAdd() {
  uni.navigateTo({ url: '/pages/address/edit/edit' })
}

/** 选择模式下：选中该地址并回传给确认订单页 */
function onPick(a: Address) {
  uni.setStorageSync(config.storageKeys.selectedAddress, a)
  uni.navigateBack()
}

/** 点击地址主体：选择模式下=选中返回，普通模式下=进入编辑 */
function onMain(a: Address) {
  if (selectMode.value) onPick(a)
  else onEdit(a)
}

function onEdit(a: Address) {
  uni.navigateTo({ url: `/pages/address/edit/edit?id=${a.id}` })
}

async function onSetDefault(a: Address) {
  if (a.isDefault) return
  try {
    await db.setDefaultAddress?.(a.id)
    await loadAddresses()
  } catch (e) {
    console.warn('[address] 设默认失败', e)
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

function onDelete(a: Address) {
  uni.showModal({
    title: '提示',
    content: `确定删除「${a.name}」的收货地址？`,
    success: async (res) => {
      if (!res.confirm) return
      try {
        await db.deleteAddress?.(a.id)
        uni.showToast({ title: '已删除', icon: 'none' })
        await loadAddresses()
      } catch (e) {
        console.warn('[address] 删除失败', e)
        uni.showToast({ title: '删除失败', icon: 'none' })
      }
    }
  })
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 20rpx 20rpx 160rpx; }

/* 地址卡片 */
.addr-card {
  background: $bg-card;
  border-radius: $radius-card;
  padding: 28rpx 24rpx;
  margin-bottom: 20rpx;
}
.addr-main { min-width: 0; }
.addr-row { display: flex; align-items: center; }
.name { font-size: 30rpx; font-weight: bold; color: $text-main; }
.phone { font-size: 28rpx; color: $text-sub; margin-left: 20rpx; }
.default-tag {
  margin-left: 16rpx;
  font-size: 20rpx;
  color: #fff;
  background: $brand;
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
}
.addr-detail {
  font-size: 26rpx;
  color: $text-main;
  line-height: 1.5;
  margin-top: 12rpx;
}

/* 操作栏 */
.addr-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid $border-line;
}
.set-default { display: flex; align-items: center; }
.radio { font-size: 30rpx; color: $text-sub; }
.radio.on { color: $brand; }
.set-txt { font-size: 26rpx; color: $text-sub; margin-left: 10rpx; }
.op-btns { display: flex; }
.op { font-size: 26rpx; color: $text-main; margin-left: 36rpx; }
.op.del { color: $text-price; }
.op.pick { color: $brand; font-weight: bold; }

/* 选择模式提示条 */
.pick-tip { font-size: 24rpx; color: $text-sub; padding: 4rpx 12rpx 16rpx; }

/* 空状态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 200rpx;
}
.empty-ic { font-size: 120rpx; }
.empty-txt { font-size: 28rpx; color: $text-sub; margin-top: 24rpx; }

/* 底部新增栏 */
.add-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  background: #fff;
  border-top: 1rpx solid $border-line;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.add-btn {
  background: $brand;
  color: #fff;
  font-size: 30rpx;
  font-weight: bold;
  text-align: center;
  padding: 22rpx 0;
  border-radius: 44rpx;
}
</style>
