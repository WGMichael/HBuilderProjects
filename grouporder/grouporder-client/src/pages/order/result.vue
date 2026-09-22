<!--
  M-17 提交结果

  职责：展示本次订单结果、订单编号、本人订单及「再下一单」。
  D-025：「再下一单」是回活动新建一张订单，不是修改原单。
-->
<template>
  <view class="page">
    <view class="ok">
      <view class="ok__icon">✓</view>
      <view class="ok__title">下单成功</view>
      <view class="ok__no" v-if="order.order_no">订单号 {{ order.order_no }}</view>
    </view>

    <view class="card" v-if="order._id">
      <view class="line" v-for="it in order.items || []" :key="it.goods_id">
        <text>{{ it.goods_name }} ×{{ it.qty }}</text>
        <text class="line__amt">￥{{ fen2yuan(it.amount) }}</text>
      </view>
      <view class="total">预计合计 <text class="total__amt">￥{{ fen2yuan(order.total_amount) }}</text></view>
    </view>

    <view class="actions">
      <button class="btn btn--primary" type="primary" @click="again">再下一单</button>
      <button class="btn" @click="viewOrder">查看订单</button>
      <button class="btn" @click="mine">我参与的</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const orderId = ref('');
const activityId = ref('');
const order = ref<any>({});

const load = async () => {
  if (!orderId.value) return;
  order.value = (await guarded(api.order.orderGetDetail({ order_id: orderId.value }))) || {};
};

const again = () => uni.redirectTo({ url: '/pages/activity/detail?id=' + activityId.value });
const viewOrder = () => uni.redirectTo({ url: '/pages/order/detail?id=' + orderId.value });
const mine = () => uni.switchTab({ url: '/pages/hall/jielong' });

onLoad((q: any = {}) => { orderId.value = q.order_id || ''; activityId.value = q.activity_id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; }
.ok { display: flex; flex-direction: column; align-items: center; padding: 80rpx 0 40rpx; }
.ok__icon { width: 110rpx; height: 110rpx; line-height: 110rpx; text-align: center; border-radius: 50%; background: #18bc37; color: #fff; font-size: 60rpx; }
.ok__title { font-size: 34rpx; color: #303133; margin-top: 24rpx; }
.ok__no { font-size: 24rpx; color: #909399; margin-top: 8rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; }
.line { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 28rpx; color: #303133; }
.line__amt { color: #fa3534; }
.total { text-align: right; margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx solid #f5f5f5; font-size: 26rpx; color: #606266; }
.total__amt { color: #fa3534; font-size: 32rpx; }
.actions { margin-top: 32rpx; display: flex; flex-direction: column; gap: 16rpx; }
.btn { margin: 0; font-size: 30rpx; background: #fff; color: #606266; }
.btn--primary { background: #2979ff; color: #fff; }
</style>
