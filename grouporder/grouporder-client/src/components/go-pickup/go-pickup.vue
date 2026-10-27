<!--
  自提点信息（D-077）

  支持自提的活动（D-086）与自提订单展示，告诉参与者「去哪取、何时取、找谁」。
  这是【活动级共享信息，不进订单快照】：团长发布后仍可随时修改、即时对所有人生效，
  因此活动详情、下单页与订单详情都读活动的最新值，而不是下单时固化的副本。
  地址之外三项均为选填，空值不占位。
  D-137 / D-140：一行显示「自提点：联系人 电话 地址（取货时间）」，前置定位图标；不再分「地址 / 时间 / 联系」多行。
-->
<template>
  <!-- 一行（D-140）：定位图标 +「自提点：联系人 电话 地址（取货时间）」，时间不填即「时间不限」（D-139） -->
  <view class="gp" v-if="address">
    <uni-icons class="gp__ic" type="location" size="18" color="#d96a28" />
    <text class="gp__v" user-select>自提点：<text v-if="contactName || contactMobile" class="gp__who">{{ [contactName, contactMobile].filter(Boolean).join(' ') }} </text>{{ address }}（{{ timeDesc || '时间不限' }}）</text>
  </view>
</template>

<script setup lang="ts">
defineProps({
  address: { type: String, default: '' },
  timeDesc: { type: String, default: '' },
  contactName: { type: String, default: '' },
  contactMobile: { type: String, default: '' },
});

</script>

<style lang="scss" scoped>
.gp { display: flex; align-items: flex-start; gap: 10rpx; background: $go-orange-soft; border-radius: 12rpx; padding: 20rpx 24rpx; margin: 20rpx; }
.gp__ic { flex-shrink: 0; margin-top: 2rpx; line-height: 1; }
.gp__v { flex: 1; min-width: 0; font-size: 25rpx; color: $go-ink; line-height: 1.6; word-break: break-all; }
.gp__who { font-weight: 600; }
</style>
