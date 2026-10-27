<!--
  首次发起接龙引导弹窗（D-148，D-154 强化）

  「发起接龙」tab 每次从其他 tab 进入时调用 check()：已登录、商品库为空、本次打开 App 期间没点过「稍后再配」时弹出。
  D-154：商品库为空时强引导先配商品——去掉「直接创建」按钮与「不再提示」，主按钮「先去添加商品」，
  只保留一个弱化的「我已了解，稍后再配」链接（本次打开 App 期间不再弹）。不禁止在发起页新建商品（D-063 保持）。
-->
<template>
  <uni-popup ref="popup" type="center" :mask-click="false">
    <view class="cg">
      <view class="cg__t">第一次发起接龙？</view>
      <view class="cg__d">你的商品库还是空的。<text class="cg__b">先把要卖的商品放进「商品库」，再发起接龙</text>，是最省事的做法：发起时一次勾选就能加进活动，下次还能直接复用。</view>

      <view class="cg__steps">
        <view class="cg__s">
          <view class="cg__ic">▦</view>
          <view class="cg__st">配好商品</view>
          <view class="cg__sd">我的 → 商品库管理</view>
        </view>
        <text class="cg__arrow">›</text>
        <view class="cg__s">
          <view class="cg__ic">✎</view>
          <view class="cg__st">发起接龙</view>
          <view class="cg__sd">填标题、时间</view>
        </view>
        <text class="cg__arrow">›</text>
        <view class="cg__s">
          <view class="cg__ic">✓</view>
          <view class="cg__st">勾选商品</view>
          <view class="cg__sd">从商品库添加</view>
        </view>
      </view>

      <view class="cg__more" @click="openGuide">查看完整图文指南 ›</view>

      <button class="cg__btn" type="primary" @click="goLib">先去添加商品</button>
      <view class="cg__later" @click="skip">我已了解，稍后再配</view>
    </view>
  </uni-popup>
</template>

<script setup lang="ts">
import { ref } from 'vue';
// @ts-ignore
import api, { isLoggedIn } from '@/common/grouporder/request.js';

// 本次打开 App 期间点过「稍后再配」：不再反复弹（模块级变量，随 App 生命周期）。
// D-154 起不再提供「不再提示」：只要商品库为空，下次打开 App 进入发起页仍会引导
let skippedThisSession = false;

const popup = ref<any>(null);
let checking = false;

/** 满足条件才弹：已登录、本次未跳过、商品库为空 */
const check = async () => {
  if (checking || skippedThisSession || !isLoggedIn()) return;
  checking = true;
  try {
    const r = (await api.goodsLib.libList({ page: 1, pageSize: 1 }, { silent: true })) || {};
    if ((r.total || 0) === 0 && popup.value) popup.value.open();
  } catch (e) { /* 查询失败不打扰 */ } finally {
    checking = false;
  }
};

const close = () => { popup.value && popup.value.close(); };
const goLib = () => { close(); uni.navigateTo({ url: '/pages/lib/manage' }); };
const skip = () => { skippedThisSession = true; close(); };
const openGuide = () => { close(); uni.navigateTo({ url: '/pages/common/guide-create' }); };

defineExpose({ check });
</script>

<style lang="scss" scoped>
.cg { width: 620rpx; background: #fff; border-radius: 28rpx; padding: 40rpx 36rpx 28rpx; box-sizing: border-box; }
.cg__t { font-size: 34rpx; font-weight: 700; color: $go-ink; text-align: center; }
.cg__d { font-size: 25rpx; color: $go-text; line-height: 1.7; margin-top: 16rpx; text-align: center; }
.cg__steps { display: flex; align-items: center; justify-content: space-between; margin-top: 28rpx; padding: 24rpx 12rpx; background: $go-primary-soft; border-radius: 20rpx; }
.cg__s { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; }
.cg__ic { width: 64rpx; height: 64rpx; line-height: 64rpx; border-radius: 50%; background: $go-primary; color: #fff; font-size: 30rpx; }
.cg__st { font-size: 24rpx; font-weight: 600; color: $go-ink; margin-top: 10rpx; }
.cg__sd { font-size: 20rpx; color: $go-muted; margin-top: 4rpx; }
.cg__arrow { color: $go-primary; font-size: 32rpx; margin-bottom: 40rpx; }
.cg__more { text-align: center; font-size: 24rpx; color: $go-primary; margin: 20rpx 0 8rpx; }
.cg__btn { margin: 16rpx 0 0; border-radius: 24rpx; font-size: 29rpx; }
.cg__btn--ghost { background: $go-soft; color: $go-text; }
.cg__btn--ghost::after { border: none; }
.cg__b { color: $go-primary-dark; font-weight: 600; }
/* 弱化的跳过入口：不做成按钮，避免与主按钮并列 */
.cg__later { text-align: center; margin-top: 24rpx; font-size: 23rpx; color: $go-placeholder; }
</style>
