<!--
  团长名片（D-103 联系方式 + D-109 头像昵称）

  账号级信息：团长在「我的 → 团长名片」填写，活动详情（M-13）、发布预览（M-12）与参与者订单详情（M-19）展示。
  填了哪项显示哪项，四项都没填时服务端返回 null、不渲染；头像被内容检测拦截时服务端不返回头像。
  电话可拨号，微信号可复制（小程序与 H5 都无法直接跳转加好友）。
  variant：activity 与活动页卡片（av__card）对齐；order 用于订单详情页内边距已有的布局。
-->
<template>
  <view class="lc" :class="'lc--' + variant" v-if="contact && (contact.nickname || contact.avatar || contact.mobile || contact.wechat)">
    <view class="lc__head">
      <view class="lc__avatar">
        <image v-if="contact.avatar && contact.avatar.url" class="lc__img" :src="contact.avatar.url" mode="aspectFill" />
        <text v-else class="lc__txt">{{ (contact.nickname || '团').slice(0, 1) }}</text>
      </view>
      <view class="lc__who">
        <view class="lc__name">{{ contact.nickname || '团长' }}</view>
        <view class="lc__role">本次接龙团长</view>
      </view>
    </view>
    <view class="lc__row" v-if="contact.mobile">
      <text class="lc__k">电话</text>
      <text class="lc__v" user-select>{{ contact.mobile }}</text>
      <text class="lc__act" @click="call">拨号</text>
    </view>
    <view class="lc__row" v-if="contact.wechat">
      <text class="lc__k">微信</text>
      <text class="lc__v" user-select>{{ contact.wechat }}</text>
      <text class="lc__act" @click="copyWechat">复制</text>
    </view>
  </view>
</template>

<script setup lang="ts">
const props = defineProps({
  contact: { type: Object, default: null },
  variant: { type: String, default: 'activity' },
});

const call = () => {
  const m = props.contact && props.contact.mobile;
  if (m) uni.makePhoneCall({ phoneNumber: m, fail: () => {} });
};
const copyWechat = () => {
  const w = props.contact && props.contact.wechat;
  if (!w) return;
  uni.setClipboardData({ data: w, success: () => uni.showToast({ title: '微信号已复制，去微信添加好友', icon: 'none' }) });
};
</script>

<style lang="scss" scoped>
.lc { background: #fff; border: 1rpx solid $go-line; border-radius: 32rpx; padding: 30rpx; box-shadow: 0 8rpx 28rpx rgba(37, 55, 45, 0.03); }
.lc--activity { margin: 24rpx 32rpx 0; }
.lc--order { margin-bottom: 16rpx; border-radius: 16rpx; padding: 24rpx; }
.lc__head { display: flex; align-items: center; }
.lc__avatar { width: 88rpx; height: 88rpx; border-radius: 50%; background: $go-primary; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.lc__img { width: 100%; height: 100%; }
.lc__txt { color: #fff; font-size: 34rpx; }
.lc__who { margin-left: 22rpx; min-width: 0; }
.lc__name { font-size: 30rpx; font-weight: 600; color: $go-ink; }
.lc__role { font-size: 22rpx; color: $go-muted; margin-top: 4rpx; }
.lc__row { display: flex; align-items: center; margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx solid $go-line; }
.lc__k { width: 72rpx; font-size: 24rpx; color: $go-muted; flex-shrink: 0; }
.lc__v { flex: 1; font-size: 26rpx; color: $go-ink; word-break: break-all; }
.lc__act { font-size: 24rpx; color: $go-primary; padding-left: 16rpx; }
</style>
