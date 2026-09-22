<!--
  M-22 团长商品管理

  职责：新增、编辑、删除、停售、恢复、库存调整。
  红线⑦：售卖状态（团长停售）与治理状态（平台下架）分列。
  陷阱 8：全部停售 / 售罄时活动仍是进行中，团长仍可新增、补库存、恢复售卖。
-->
<template>
  <view class="page">
    <view class="list">
      <view v-for="g in goods" :key="g._id" class="g">
        <view class="g__head">
          <text class="g__name">{{ g.name }}<text v-if="g.is_recommend === 1" class="g__rec">推荐</text></text>
          <view class="g__tags">
            <text class="tag" :class="g.on_sale === 1 ? 'tag--on' : 'tag--off'">{{ labelOf(ON_SALE, g.on_sale) }}</text>
            <text v-if="g.governance_status === 1" class="tag tag--gov">已下架</text>
          </view>
        </view>
        <view class="g__meta">￥{{ fen2yuan(g.price) }} / {{ g.unit || '份' }} · 已购 {{ g.sold_qty || 0 }} · 库存 {{ g.total_stock > 0 ? g.total_stock : '不限' }}</view>
        <view class="g__act" v-if="g.governance_status !== 1">
          <text class="op" @click="editGoods(g)">编辑</text>
          <text class="op" @click="adjustStock(g)">调库存/限购</text>
          <text class="op" @click="toggleSale(g)">{{ g.on_sale === 1 ? '停售' : '恢复售卖' }}</text>
          <text class="op op--del" @click="del(g)">删除</text>
        </view>
        <view class="g__gov" v-else>该商品被平台下架，不能编辑或恢复售卖</view>
      </view>
      <view v-if="!goods.length" class="empty">还没有商品</view>
    </view>

    <view class="footer">
      <button class="add" type="primary" @click="add">＋ 添加商品</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ON_SALE, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const goods = ref<any[]>([]);

const load = async () => {
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  goods.value = data.goods || [];
};

const add = () => uni.navigateTo({ url: '/pages/activity/goods-edit?activity_id=' + activityId.value, events: { saved: () => load() } });
const editGoods = (g: any) => uni.navigateTo({ url: '/pages/activity/goods-edit?activity_id=' + activityId.value + '&goods_id=' + g._id, events: { saved: () => load() } });

const toggleSale = async (g: any) => {
  try { await guarded(api.activity.goodsSetOnSale({ goods_id: g._id, on_sale: g.on_sale === 1 ? 0 : 1 })); load(); } catch (e) {}
};

const adjustStock = (g: any) => {
  uni.showModal({
    title: '调整库存', content: '输入新的总库存（0=不设上限）', editable: true, placeholderText: String(g.total_stock || 0),
    success: async (r: any) => {
      if (!r.confirm) return;
      const stock = parseInt(r.content, 10);
      if (isNaN(stock) || stock < 0) { uni.showToast({ title: '请输入非负整数', icon: 'none' }); return; }
      try { await guarded(api.activity.goodsAdjustStock({ goods_id: g._id, total_stock: stock, per_user_limit: g.per_user_limit })); load(); } catch (e) {}
    },
  });
};

const del = (g: any) => {
  uni.showModal({
    title: '删除商品', content: `确认删除「${g.name}」？已产生订单的商品可能不允许删除。`,
    success: async (r) => { if (!r.confirm) return; try { await guarded(api.activity.goodsDelete({ goods_id: g._id })); load(); } catch (e) {} },
  });
};

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; padding-bottom: 140rpx; }
.g { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.g__head { display: flex; align-items: center; justify-content: space-between; }
.g__name { font-size: 30rpx; color: #303133; }
.g__rec { font-size: 20rpx; color: #f3a73f; margin-left: 8rpx; }
.g__meta { font-size: 24rpx; color: #909399; margin: 12rpx 0; }
.g__act { display: flex; flex-wrap: wrap; gap: 24rpx; }
.op { font-size: 26rpx; color: #2979ff; }
.op--del { color: #fa3534; }
.g__gov { font-size: 24rpx; color: #fa3534; }
.empty { text-align: center; color: #909399; font-size: 26rpx; padding: 120rpx 0; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; margin-left: 8rpx; }
.tag--on { background: #e7faec; color: #18bc37; }
.tag--off { background: #f0f0f0; color: #909399; }
.tag--gov { background: #fef0f0; color: #fa3534; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.add { margin: 0; font-size: 30rpx; }
</style>
