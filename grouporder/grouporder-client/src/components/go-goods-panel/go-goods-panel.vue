<!--
  商品管理面板（M-20「商品」tab 与 M-22 页面共用，D-115）

  职责：新增、编辑、删除、停售、恢复、调库存、调限购。
  红线⑦：售卖状态（团长停售）与治理状态（平台下架）分列。
  陷阱 8：全部停售 / 售罄时活动仍是进行中，团长仍可新增、补库存、恢复售卖。
  数据由父页面传入（activityGetDetail 的结果），改动成功后 emit('changed') 由父页面重新加载。
  展示：商品按小类（category_name）竖式分段，小类作小标题，未分类放最后；全部无小类时平铺不显示标题（D-066 修订）。
  排序：原长按拖动排序（D-124）暂时移除，后续再定；商品顺序仍由服务端 sort 决定。
-->
<template>
  <view class="gp">
    <!-- 只有草稿与进行中可改商品；审核中冻结（D-079），已结束 / 已取消不可再改 -->
    <view v-if="!editable" class="notice">{{ lockText }}</view>
    <!-- 第一行：新建一件 / 从商品库挑选（M-28），与发起页同一对入口 -->
    <view v-if="editable" class="top-ops">
      <button class="add" @click="add">＋ 添加商品</button>
      <button class="libbtn" @click="addFromLib">从商品库添加</button>
    </view>
    <!-- 第二行 管理排序：草稿/审核中/进行中、且至少 2 个商品时可用（只改本活动顺序） -->
    <view v-if="canSort && (act.goods || []).length > 1" class="top-ops">
      <button class="sortbtn" @click="goSort">≡ 管理排序</button>
    </view>

    <view v-for="grp in goodsGroups" :key="grp.key">
      <view v-if="grp.name" class="sec-head" :class="{ 'sec-head--none': grp.key === '__none__' }">{{ grp.name }}</view>
      <view v-for="g in grp.goods" :key="g._id" class="g">
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
    </view>
    <view v-if="!(act.goods || []).length" class="empty">还没有商品</view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ON_SALE, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

const props = defineProps({
  act: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['changed']);

const activityId = computed(() => props.act._id || '');
const editable = computed(() => (props.act.status === 0 || props.act.status === 2) && props.act.governance_status !== 1);
// 草稿 / 审核中 / 进行中可排序（服务端 goodsSort 只拒绝已结束、已取消）
const canSort = computed(() => props.act.status === 0 || props.act.status === 1 || props.act.status === 2);
const lockText = computed(() => {
  const a: any = props.act;
  if (a.governance_status === 1) return '活动已被平台下架，商品不能修改';
  if (a.status === 1) return '活动审核中，商品不能修改；如需修改请先在「审核状态」中撤回审核';
  if (a.status === 3) return '活动已结束，商品不能再修改';
  if (a.status === 4) return '活动已取消，商品不能再修改';
  return '当前状态不能修改商品';
});

// 商品按小类分段：小类作小标题，组内保持服务端顺序；无小类归「未分类」放最后；全部无小类则平铺不显示标题
const goodsGroups = computed(() => {
  const goods = props.act.goods || [];
  const order: string[] = [];
  const buckets: Record<string, any[]> = {};
  const other: any[] = [];
  for (const g of goods) {
    const name = String(g.category_name || '').trim();
    if (!name) { other.push(g); continue; }
    if (!buckets[name]) { buckets[name] = []; order.push(name); }
    buckets[name].push(g);
  }
  if (!order.length) return [{ key: '__all__', name: '', goods }];
  const groups = order.map((n) => ({ key: n, name: n, goods: buckets[n] }));
  if (other.length) groups.push({ key: '__none__', name: '未分类', goods: other });
  return groups;
});

const changed = () => emit('changed');

// 进行中活动新增 / 删除商品属于内容改动，会转入审核中（D-048）：告知团长接龙已暂停
const tipRecheck = (res: any) => {
  if (res && res.need_recheck) uni.showModal({ title: '活动已转入审核中', content: '商品改动需要重新审核，审核通过前参与者暂时不能下单。', showCancel: false });
};

const add = () => uni.navigateTo({ url: '/pages/activity/goods-edit?activity_id=' + activityId.value, events: { saved: changed } });
// 从商品库添加（M-28）：勾选后由 libCopyToActivity 复制进本活动，返回时 emit('added') 触发刷新
const addFromLib = () => uni.navigateTo({ url: '/pages/lib/history-goods?activity_id=' + activityId.value, events: { added: changed } });
const goSort = () => uni.navigateTo({ url: '/pages/activity/goods-sort?activity_id=' + activityId.value, events: { saved: changed } });
const editGoods = (g: any) => uni.navigateTo({ url: '/pages/activity/goods-edit?activity_id=' + activityId.value + '&goods_id=' + g._id, events: { saved: changed } });

const toggleSale = async (g: any) => {
  try { await guarded(api.activity.goodsSetOnSale({ goods_id: g._id, on_sale: g.on_sale === 1 ? 0 : 1 })); changed(); } catch (e) {}
};

const adjustStock = (g: any) => {
  uni.showModal({
    // editable 确认框会把 content 预填进输入框：预填当前值，说明放标题（D-113）
    title: '调整总库存（0 = 不设上限）', content: String(g.total_stock || 0), editable: true, placeholderText: '输入新的总库存',
    success: async (r: any) => {
      if (!r.confirm) return;
      const stock = parseInt(r.content, 10);
      if (isNaN(stock) || stock < 0) { uni.showToast({ title: '请输入非负整数', icon: 'none' }); return; }
      try { await guarded(api.activity.goodsAdjustStock({ goods_id: g._id, total_stock: stock, per_user_limit: g.per_user_limit })); changed(); } catch (e) {}
    },
  });
};

const adjustLimit = (g: any) => {
  uni.showModal({
    title: '调整每人限购（0 = 不限购）', content: String(g.per_user_limit || 0), editable: true, placeholderText: '每人最多可买份数',
    success: async (r: any) => {
      if (!r.confirm) return;
      const limit = parseInt(r.content, 10);
      if (isNaN(limit) || limit < 0) { uni.showToast({ title: '请输入非负整数', icon: 'none' }); return; }
      try { await guarded(api.activity.goodsAdjustStock({ goods_id: g._id, total_stock: g.total_stock || 0, per_user_limit: limit })); changed(); } catch (e) {}
    },
  });
};

const del = (g: any) => {
  uni.showModal({
    title: '删除商品', content: `确认删除「${g.name}」？已产生订单的商品可能不允许删除。`,
    success: async (r) => { if (!r.confirm) return; try { tipRecheck(await guarded(api.activity.goodsDelete({ goods_id: g._id }))); changed(); } catch (e) {} },
  });
};
</script>

<style lang="scss" scoped>
.gp { padding: 16rpx 24rpx 24rpx; }
.top-ops { display: flex; gap: 16rpx; margin-bottom: 16rpx; }
.top-ops:empty { display: none; }
.add { flex: 1; margin: 0; border-radius: 20rpx; background: #fff; color: $go-primary-dark; border: 2rpx dashed $go-primary; font-size: 28rpx; }
.add::after { border: none; }
.libbtn { flex: 1; margin: 0; border-radius: 20rpx; background: #fff; color: $go-primary-dark; border: 2rpx solid $go-primary; font-size: 28rpx; }
.libbtn::after { border: none; }
.sortbtn { flex: 1; margin: 0; border-radius: 20rpx; background: #fff; color: $go-ink; border: 1rpx solid $go-border; font-size: 28rpx; }
.sortbtn::after { border: none; }
/* 小类小标题 */
.sec-head { display: flex; align-items: center; margin: 20rpx 4rpx 12rpx; font-size: 26rpx; font-weight: 700; color: $go-ink; }
.sec-head::before { content: ''; width: 6rpx; height: 26rpx; background: $go-primary; border-radius: 4rpx; margin-right: 14rpx; }
.sec-head--none::before { background: $go-orange; }
.g { position: relative; background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.g__head { display: flex; align-items: center; justify-content: space-between; }
.g__name { flex: 1; min-width: 0; font-size: 30rpx; color: $go-ink; }
.g__rec { font-size: 20rpx; color: $go-orange; margin-left: 8rpx; }
.g__meta { font-size: 24rpx; color: $go-muted; margin: 12rpx 0; }
.g__act { display: flex; flex-wrap: wrap; gap: 24rpx; }
.op { font-size: 26rpx; color: $go-primary; }
.op--del { color: $go-red; }
.g__gov { font-size: 24rpx; color: $go-red; }
.notice { margin-bottom: 16rpx; padding: 20rpx 24rpx; border-radius: 16rpx; background: $go-orange-soft; color: $go-orange; font-size: 24rpx; line-height: 1.5; }
.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 80rpx 0; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; margin-left: 8rpx; }
.tag--on { background: $go-primary-soft; color: $go-primary; }
.tag--off { background: $go-line; color: $go-muted; }
.tag--gov { background: $go-red-soft; color: $go-red; }
</style>
