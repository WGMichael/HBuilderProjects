<!--
  M-21 团长订单与统计

  职责：有效订单数、有效总份数、订单明细、商品汇总和预计金额。
  红线⑧：只用白名单指标，不出现销售额 / 实收 / GMV。
-->
<template>
  <view class="page">
    <!-- 统计 -->
    <view class="stat">
      <view class="stat__i"><text class="stat__n">{{ stat.valid_order_count || 0 }}</text><text class="stat__l">有效订单</text></view>
      <view class="stat__i"><text class="stat__n">{{ stat.valid_total_qty || 0 }}</text><text class="stat__l">有效份数</text></view>
      <view class="stat__i"><text class="stat__n">￥{{ fen2yuan(stat.estimated_amount) }}</text><text class="stat__l">预计金额</text></view>
    </view>
    <view class="sub-stat">取消 {{ stat.cancelled_order_count || 0 }} · 作废 {{ stat.voided_order_count || 0 }}（不计入有效）</view>

    <!-- 商品汇总 -->
    <view class="block">
      <view class="block__title">商品汇总</view>
      <view v-for="g in stat.goods_summary || []" :key="g.goods_id" class="grow">
        <text class="grow__name">{{ g.goods_name }}</text>
        <text class="grow__qty">{{ g.sold_qty || 0 }} 份</text>
        <text class="grow__amt">￥{{ fen2yuan(g.estimated_amount) }}</text>
      </view>
    </view>

    <!-- 订单明细 -->
    <view class="block">
      <view class="block__title">订单明细（{{ orders.length }}）</view>
      <view class="tabs">
        <text v-for="t in statusTabs" :key="t.v" class="tabs__i" :class="{ 'tabs__i--on': orderStatus === t.v }" @click="switchStatus(t.v)">{{ t.text }}</text>
      </view>
      <view v-for="o in orders" :key="o._id" class="orow">
        <view class="orow__l1">
          <text>{{ o.consignee_name }} {{ o.consignee_mobile }}</text>
          <text class="tag" :class="o.status === 1 ? 'tag--biz' : 'tag--warn'">{{ labelOf(ORDER_STATUS, o.status) }}</text>
        </view>
        <view class="orow__l2" v-if="o.consignee_address">{{ o.consignee_address }}</view>
        <view class="orow__l3">{{ o.total_qty }} 份 · ￥{{ fen2yuan(o.total_amount) }} · {{ fmt(o.create_date) }}</view>
        <view class="orow__items" v-if="o.items">{{ (o.items || []).map(it => it.goods_name + '×' + it.qty).join('，') }}</view>
        <view class="orow__act" v-if="o.status === 1">
          <text class="orow__void" @click="voidOrder(o)">作废此单</text>
        </view>
        <view class="orow__reason" v-if="o.void_reason">作废原因：{{ o.void_reason }}</view>
      </view>
      <view v-if="!orders.length" class="empty">暂无订单</view>
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

const activityId = ref('');
const stat = ref<any>({});
const orders = ref<any[]>([]);
const orderStatus = ref(1);
const statusTabs = [
  { v: 1, text: '有效' },
  { v: 2, text: '已取消' },
  { v: 3, text: '已作废' },
];

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const loadStat = async () => {
  stat.value = (await guarded(api.order.orderLeaderStat({ activity_id: activityId.value }))) || {};
};
const loadOrders = async () => {
  const data = (await guarded(api.order.orderLeaderList({ activity_id: activityId.value, page: 1, pageSize: 100, filters: { status: orderStatus.value } }))) || {};
  orders.value = data.list || [];
};
const switchStatus = (v: number) => { orderStatus.value = v; loadOrders(); };

const voidOrder = (o: any) => {
  uni.showModal({
    title: '作废订单', content: '作废用于处理异常订单，不可恢复。确认作废？', editable: true, placeholderText: '作废原因',
    success: async (r: any) => {
      if (!r.confirm) return;
      try { await guarded(api.order.orderVoid({ order_id: o._id, reason: r.content || '' })); loadStat(); loadOrders(); } catch (e) {}
    },
  });
};

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => { loadStat(); loadOrders(); });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding-bottom: 40rpx; }
.stat { display: flex; background: #fff; padding: 32rpx 0; }
.stat__i { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat__n { font-size: 36rpx; color: #2979ff; }
.stat__l { font-size: 22rpx; color: #909399; margin-top: 6rpx; }
.sub-stat { background: #fff; padding: 0 28rpx 24rpx; font-size: 22rpx; color: #909399; }
.block { background: #fff; margin-top: 16rpx; padding: 24rpx 28rpx; }
.block__title { font-size: 28rpx; color: #303133; font-weight: 600; margin-bottom: 16rpx; }
.grow { display: flex; align-items: center; padding: 14rpx 0; border-bottom: 1rpx solid #f5f5f5; font-size: 28rpx; color: #303133; }
.grow__name { flex: 1; }
.grow__qty { color: #909399; margin-right: 20rpx; }
.grow__amt { color: #fa3534; }
.tabs { display: flex; gap: 16rpx; margin-bottom: 16rpx; }
.tabs__i { font-size: 24rpx; color: #606266; padding: 8rpx 24rpx; border: 1rpx solid #dcdfe6; border-radius: 32rpx; }
.tabs__i--on { color: #2979ff; border-color: #2979ff; background: #e8f3ff; }
.orow { padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.orow__l1 { display: flex; justify-content: space-between; font-size: 28rpx; color: #303133; }
.orow__l2 { font-size: 24rpx; color: #606266; margin-top: 6rpx; }
.orow__l3 { font-size: 24rpx; color: #909399; margin-top: 6rpx; }
.orow__items { font-size: 24rpx; color: #606266; margin-top: 6rpx; }
.orow__act { margin-top: 10rpx; }
.orow__void { font-size: 24rpx; color: #fa3534; }
.orow__reason { font-size: 22rpx; color: #909399; margin-top: 6rpx; }
.empty { text-align: center; color: #909399; font-size: 26rpx; padding: 60rpx 0; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag--biz { background: #e8f3ff; color: #2979ff; }
.tag--warn { background: #f0f0f0; color: #909399; }
</style>
