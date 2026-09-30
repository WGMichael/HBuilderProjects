<!--
  自提点信息（D-077）

  仅自提活动（delivery_type=2）展示，告诉参与者「去哪取、何时取、找谁」。
  这是【活动级共享信息，不进订单快照】：团长发布后仍可随时修改、即时对所有人生效，
  因此活动详情、下单页与订单详情都读活动的最新值，而不是下单时固化的副本。
  地址之外三项均为选填，空值不占位。
-->
<template>
  <view class="gp" v-if="address">
    <view class="gp__title">自提点</view>
    <view class="gp__row">
      <text class="gp__k">地址</text>
      <text class="gp__v gp__v--strong">{{ address }}</text>
    </view>
    <view class="gp__row" v-if="timeDesc">
      <text class="gp__k">时间</text>
      <text class="gp__v">{{ timeDesc }}</text>
    </view>
    <view class="gp__row" v-if="contactName || contactMobile">
      <text class="gp__k">联系</text>
      <text class="gp__v">
        {{ contactName }}<text v-if="contactName && contactMobile"> </text>{{ contactMobile }}
        <text v-if="contactMobile" class="gp__call" @click="call">拨号</text>
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
const props = defineProps({
  address: { type: String, default: '' },
  timeDesc: { type: String, default: '' },
  contactName: { type: String, default: '' },
  contactMobile: { type: String, default: '' },
});

const call = () => {
  if (!props.contactMobile) return;
  uni.makePhoneCall({ phoneNumber: props.contactMobile, fail: () => {} });
};
</script>

<style lang="scss" scoped>
.gp { background: #fffbe8; border-radius: 12rpx; padding: 24rpx; margin: 20rpx; }
.gp__title { font-size: 26rpx; color: #8a6d3b; font-weight: 600; margin-bottom: 16rpx; }
.gp__row { display: flex; align-items: flex-start; gap: 16rpx; line-height: 1.7; }
.gp__k { font-size: 24rpx; color: #909399; flex-shrink: 0; width: 72rpx; }
.gp__v { font-size: 24rpx; color: #606266; flex: 1; }
.gp__v--strong { color: #303133; }
.gp__call { color: #2979ff; margin-left: 16rpx; }
</style>
