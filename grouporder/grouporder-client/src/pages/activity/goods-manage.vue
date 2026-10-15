<!--
  M-22 团长商品管理

  职责：新增、编辑、删除、停售、恢复、库存调整。
  红线⑦：售卖状态（团长停售）与治理状态（平台下架）分列。
  陷阱 8：全部停售 / 售罄时活动仍是进行中，团长仍可新增、补库存、恢复售卖。
-->
<template>
  <view class="page">
    <!-- 只有草稿与进行中可改商品；审核中冻结（D-079），已截止 / 已取消不可再改 -->
    <view v-if="loaded && !editable" class="notice">{{ lockText }}</view>
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
        <view class="g__meta" v-if="g.per_user_limit > 0">每人限购 {{ g.per_user_limit }} {{ g.unit || '份' }}</view>
        <view class="g__act" v-if="g.governance_status !== 1 && editable">
          <text class="op" @click="editGoods(g)">编辑</text>
          <text class="op" @click="adjustStock(g)">调库存</text>
          <text class="op" @click="adjustLimit(g)">调限购</text>
          <text class="op" @click="toggleSale(g)">{{ g.on_sale === 1 ? '停售' : '恢复售卖' }}</text>
          <text class="op op--del" @click="del(g)">删除</text>
        </view>
        <view class="g__gov" v-else-if="g.governance_status === 1">该商品被平台下架，不能编辑或恢复售卖</view>
      </view>
      <view v-if="!goods.length" class="empty">还没有商品</view>
    </view>

    <view class="footer" v-if="editable">
      <button class="add" type="primary" @click="add">＋ 添加商品</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ON_SALE, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const goods = ref<any[]>([]);
const act = ref<any>({});
const loaded = ref(false);

const editable = computed(() => (act.value.status === 0 || act.value.status === 2) && act.value.governance_status !== 1);
const lockText = computed(() => {
  const a = act.value;
  if (a.governance_status === 1) return '活动已被平台下架，商品不能修改';
  if (a.status === 1) return '活动审核中，商品不能修改；如需修改请先在「审核状态」中撤回审核';
  if (a.status === 3) return '活动已截止，商品不能再修改';
  if (a.status === 4) return '活动已取消，商品不能再修改';
  return '当前状态不能修改商品';
});

const load = async () => {
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  act.value = data;
  goods.value = data.goods || [];
  loaded.value = true;
};

// 进行中活动新增 / 删除商品属于内容改动，会转入审核中（D-048）：告知团长接龙已暂停
const tipRecheck = (res: any) => {
  if (res && res.need_recheck) uni.showModal({ title: '活动已转入审核中', content: '商品改动需要重新审核，审核通过前参与者暂时不能下单。', showCancel: false });
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

const adjustLimit = (g: any) => {
  uni.showModal({
    title: '调整每人限购', content: '输入每人最多可买份数（0=不限购）', editable: true, placeholderText: String(g.per_user_limit || 0),
    success: async (r: any) => {
      if (!r.confirm) return;
      const limit = parseInt(r.content, 10);
      if (isNaN(limit) || limit < 0) { uni.showToast({ title: '请输入非负整数', icon: 'none' }); return; }
      try { await guarded(api.activity.goodsAdjustStock({ goods_id: g._id, total_stock: g.total_stock || 0, per_user_limit: limit })); load(); } catch (e) {}
    },
  });
};

const del = (g: any) => {
  uni.showModal({
    title: '删除商品', content: `确认删除「${g.name}」？已产生订单的商品可能不允许删除。`,
    success: async (r) => { if (!r.confirm) return; try { tipRecheck(await guarded(api.activity.goodsDelete({ goods_id: g._id }))); load(); } catch (e) {} },
  });
};

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding: 20rpx; padding-bottom: 140rpx; }
.g { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.g__head { display: flex; align-items: center; justify-content: space-between; }
.g__name { font-size: 30rpx; color: $go-ink; }
.g__rec { font-size: 20rpx; color: $go-orange; margin-left: 8rpx; }
.g__meta { font-size: 24rpx; color: $go-muted; margin: 12rpx 0; }
.g__act { display: flex; flex-wrap: wrap; gap: 24rpx; }
.op { font-size: 26rpx; color: $go-primary; }
.op--del { color: $go-red; }
.g__gov { font-size: 24rpx; color: $go-red; }
.notice { margin-bottom: 16rpx; padding: 20rpx 24rpx; border-radius: 16rpx; background: $go-orange-soft; color: $go-orange; font-size: 24rpx; line-height: 1.5; }
.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 120rpx 0; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; margin-left: 8rpx; }
.tag--on { background: $go-primary-soft; color: $go-primary; }
.tag--off { background: $go-line; color: $go-muted; }
.tag--gov { background: $go-red-soft; color: $go-red; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.add { margin: 0; font-size: 30rpx; }
</style>
