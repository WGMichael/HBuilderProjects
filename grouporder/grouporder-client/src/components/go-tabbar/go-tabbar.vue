<!--
  自定义底部 tabBar（三项，中间「发起接龙」凸起）

  CLIENT_FRONTEND_BRIEF §4：
    - 微信原生 tabBar 做不出中间凸起，必须自定义组件（约束 1）。
    - tabBar 页只能用 switchTab 进入、不可带参（约束 2），因此「发起接龙」恒为新建态（约束 3）。
  用法：每个 tab 页在根节点末尾放 <go-tabbar current="jielong|faqi|my" />，
  并在 pages.json 里把这三页登记为 tabBar 列表 + custom:true（隐藏原生栏）。
-->
<template>
  <view class="tabbar">
    <view class="tabbar__item" :class="{ 'tabbar__item--on': current === 'jielong' }" @click="go('jielong')">
      <text class="tabbar__icon">☷</text>
      <text class="tabbar__label">接龙</text>
      <text v-if="badge > 0" class="tabbar__badge">{{ badge > 99 ? '99+' : badge }}</text>
    </view>

    <view class="tabbar__center" @click="go('faqi')">
      <view class="tabbar__center-btn"><text class="tabbar__center-plus">＋</text></view>
      <text class="tabbar__center-label">发起接龙</text>
    </view>

    <view class="tabbar__item" :class="{ 'tabbar__item--on': current === 'my' }" @click="go('my')">
      <text class="tabbar__icon">☺</text>
      <text class="tabbar__label">我的</text>
    </view>
  </view>
</template>

<script setup lang="ts">
const props = defineProps({
  // 'jielong' | 'faqi' | 'my'
  current: { type: String, default: 'jielong' },
  // 接龙 tab 的待办角标数（首版唯一站内触达手段，D-032）
  badge: { type: Number, default: 0 },
});

const ROUTES: Record<string, string> = {
  jielong: '/pages/hall/jielong',
  faqi: '/pages/hall/faqi',
  my: '/pages/hall/my',
};

const go = (key: string) => {
  if (key === props.current) return;
  // tabBar 页一律用 switchTab（约束 2），不可带参
  uni.switchTab({ url: ROUTES[key] });
};
</script>

<style lang="scss" scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100rpx;
  padding-bottom: env(safe-area-inset-bottom);
  background: #fff;
  border-top: 1rpx solid #ececec;
  display: flex;
  align-items: center;
  z-index: 999;

  &__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    color: #909399;
    &--on {
      color: #2979ff;
    }
  }
  &__icon {
    font-size: 40rpx;
    line-height: 1;
  }
  &__label {
    font-size: 22rpx;
    margin-top: 4rpx;
  }
  &__badge {
    position: absolute;
    top: 6rpx;
    left: 50%;
    margin-left: 8rpx;
    min-width: 28rpx;
    height: 28rpx;
    line-height: 28rpx;
    padding: 0 6rpx;
    border-radius: 14rpx;
    background: #fa3534;
    color: #fff;
    font-size: 18rpx;
    text-align: center;
  }

  &__center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
  }
  &__center-btn {
    position: absolute;
    top: -28rpx;
    width: 96rpx;
    height: 96rpx;
    border-radius: 50%;
    background: #2979ff;
    box-shadow: 0 6rpx 20rpx rgba(41, 121, 255, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  &__center-plus {
    color: #fff;
    font-size: 52rpx;
    line-height: 1;
  }
  &__center-label {
    font-size: 22rpx;
    color: #2979ff;
    margin-bottom: 10rpx;
  }
}
</style>
