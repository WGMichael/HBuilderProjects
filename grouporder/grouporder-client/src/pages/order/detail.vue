<!--
  M-19 本人订单详情

  职责：单张订单的商品、预计金额、收货快照、修改 / 取消。
  陷阱 3：收货快照与地址簿分离——这里展示的是下单时的快照，改地址簿不影响历史订单。
  editable 由服务端判定（活动进行中且订单有效才可改 / 取消）。
-->
<template>
  <view class="page" v-if="loaded">
    <view class="status-bar" :class="'st' + order.status">{{ labelOf(ORDER_STATUS, order.status) }}</view>

    <view class="card">
      <view class="card__title">{{ order.title || order.activity }}</view>
      <view class="line" v-for="it in order.items || []" :key="it.goods_id">
        <text>{{ it.goods_name }} ×{{ it.qty }}</text>
        <text class="line__amt">￥{{ fen2yuan(it.amount) }}</text>
      </view>
      <view class="total">预计合计 <text class="total__amt">￥{{ fen2yuan(order.total_amount) }}</text></view>
    </view>

    <view class="card">
      <view class="card__sub">收货信息（下单时快照）</view>
      <view class="kv">{{ order.consignee_name }} {{ order.consignee_mobile }}</view>
      <view class="kv" v-if="order.consignee_address">{{ order.consignee_address }}</view>
      <view class="kv" v-else>自提，无收货地址</view>
      <view class="kv" v-if="order.buyer_remark">备注：{{ order.buyer_remark }}</view>
    </view>

    <view class="card" v-if="order.cancel_reason || order.void_reason">
      <view class="kv" v-if="order.cancel_reason">取消原因：{{ order.cancel_reason }}</view>
      <view class="kv" v-if="order.void_reason">作废原因：{{ order.void_reason }}</view>
    </view>

    <view class="actions" v-if="order.editable">
      <button class="btn" @click="edit">修改订单</button>
      <button class="btn btn--warn" @click="cancel">取消订单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ORDER_STATUS, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

const orderId = ref('');
const order = ref<any>({});
const loaded = ref(false);

const load = async () => {
  if (!orderId.value) return;
  order.value = (await guarded(api.order.orderGetDetail({ order_id: orderId.value }))) || {};
  loaded.value = true;
};

const edit = () => {
  // 复用确认页做修改：把当前明细带回活动详情重新选择较重，这里直接回活动详情再走一遍下单流程
  uni.navigateTo({ url: '/pages/activity/detail?id=' + (order.value.activity_id || '') });
};

const cancel = () => {
  uni.showModal({
    title: '取消订单',
    content: '取消后本单不再计入有效份数，确认取消？',
    editable: true,
    placeholderText: '取消原因（选填）',
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await guarded(api.order.orderCancel({ order_id: orderId.value, reason: r.content || '' }));
        uni.showToast({ title: '已取消', icon: 'none' });
        load();
      } catch (e) {}
    },
  });
};

onLoad((q: any = {}) => { orderId.value = q.id || q.order_id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; }
.status-bar { font-size: 30rpx; padding: 24rpx; border-radius: 16rpx; margin-bottom: 16rpx; background: #e8f3ff; color: #2979ff; }
.status-bar.st2, .status-bar.st3 { background: #f0f0f0; color: #909399; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.card__title { font-size: 30rpx; color: #303133; margin-bottom: 12rpx; }
.card__sub { font-size: 24rpx; color: #909399; margin-bottom: 12rpx; }
.line { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 28rpx; color: #303133; }
.line__amt { color: #fa3534; }
.total { text-align: right; margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx solid #f5f5f5; font-size: 26rpx; color: #606266; }
.total__amt { color: #fa3534; font-size: 32rpx; }
.kv { font-size: 28rpx; color: #606266; line-height: 1.8; }
.actions { display: flex; gap: 16rpx; margin-top: 8rpx; }
.btn { flex: 1; margin: 0; font-size: 28rpx; background: #fff; color: #606266; }
.btn--warn { color: #fa3534; }
</style>
