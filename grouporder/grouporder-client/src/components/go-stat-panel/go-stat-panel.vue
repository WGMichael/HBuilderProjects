<!--
  统计（M-20「统计」tab，D-115、D-126）

  从上到下：
  已取消 / 已作废的订单不在本 tab 展示（D-129）。
  1. 一行概览：有效订单 · 有效份数 · 预计金额（红线⑧：只用白名单指标，不出现销售额 / 实收 / GMV）；
  2. 备货信息：已购份数大于 0 的商品（带单位）与合计，「复制备货清单」；
  3. 接龙明细（D-127、D-128、D-131）：按下单顺序，每单 ①下单账号 · 电话 · 收款状态 · 取货状态 · 交付方式 ②接龙码
     ③收货人 + 电话 + 完整地址同一行（D-132）（送货上门为收货地址，自提为自提点地址，D-130）④商品×数量；只读核对，管理与核销在「接龙记录」tab；
     分页由所在页面的 onReachBottom 调 loadMore()；「复制接龙名单」；
  4. 导出 Excel 清单（原 M-24 的生成与下载，活动结束后可用；进行中置灰，已取消不显示）。
-->
<template>
  <view class="sp">
    <view class="ov">有效订单 <text class="ov__n">{{ stat.valid_order_count || 0 }}</text> · 有效份数 <text class="ov__n">{{ stat.valid_total_qty || 0 }}</text> · 预计 <text class="ov__n">￥{{ fen2yuan(stat.estimated_amount) }}</text></view>

    <!-- 备货信息 -->
    <view class="block">
      <view class="block__head">
        <text class="block__title">备货信息</text>
        <text v-if="canCopy" class="block__act" @click="openTextList('goods')">复制备货清单</text>
      </view>
      <view v-if="stat.by_delivery && (stat.delivery_types || []).length > 1" class="sub">
        送货上门 {{ stat.by_delivery.home.order_count }} 单 / {{ stat.by_delivery.home.total_qty }} 份 · 自提 {{ stat.by_delivery.self_pick.order_count }} 单 / {{ stat.by_delivery.self_pick.total_qty }} 份
      </view>
      <!-- 0 份的商品不列（D-127） -->
      <view v-for="g in soldGoods" :key="g.goods_id" class="grow">
        <text class="grow__name">{{ g.goods_name }}</text>
        <text class="grow__qty">{{ g.sold_qty }} {{ g.unit || '份' }}</text>
      </view>
      <view v-if="soldGoods.length" class="grow grow--total"><text class="grow__name">合计</text><text class="grow__qty">{{ stat.valid_total_qty || 0 }} 份</text></view>
      <view v-else class="empty">还没有人购买</view>
    </view>

    <!-- 接龙明细 -->
    <view class="block">
      <view class="block__head">
        <text class="block__title">接龙明细<text class="block__sub">（{{ total }} 单）</text></text>
        <text v-if="canCopy" class="block__act" @click="openTextList('members')">复制接龙名单</text>
      </view>
      <view v-for="(o, i) in orders" :key="o._id" class="drow">
        <!-- ①下单账号 · 电话 · 收款状态 · 取货状态 · 交付方式（D-131） -->
        <view class="drow__l1">
          <text class="drow__no">{{ i + 1 }}.</text>
          <text class="drow__name">{{ o.buyer_name || o.consignee_name }}</text>
          <!-- 接龙人电话（D-131）：账号不收手机号，这里是下单时填的联系电话 -->
          <text class="drow__time" user-select>{{ o.consignee_mobile }}</text>
          <text class="drow__tags">
            <!-- 收款与取货状态并列（D-133） -->
            <text class="drow__st" :class="{ 'drow__st--on': o.leader_paid }">{{ o.leader_paid ? '已收款' : '未收款' }}</text>
            <text class="drow__st" :class="{ 'drow__st--on': o.leader_delivered }">{{ o.leader_delivered ? '已取货' : '未取货' }}</text>
            <text class="drow__dlv" :class="o.delivery_type === 2 ? 'drow__dlv--pick' : 'drow__dlv--home'">{{ labelOf(DELIVERY_TYPE, o.delivery_type) }}</text>
          </text>
        </view>
        <!-- ②接龙码 -->
        <view v-if="o.order_code" class="drow__l2">接龙码：<text class="drow__code-v">{{ o.order_code }}</text></view>
        <!-- ③收货 / 取货信息：收货人 + 电话 + 地址（送货上门为收货地址，自提为自提点地址） -->
        <!-- 收货人 + 电话 + 完整地址一行（D-130、D-132），过长自动折行、不截断 -->
        <view class="drow__l3" user-select><uni-icons class="drow__ic" type="location" size="18" color="#168a55" /><text class="drow__who">{{ o.consignee_name }} {{ o.consignee_mobile }}</text><text v-if="addressOf(o)" class="drow__addr">{{ addressOf(o) }}</text></view>
        <!-- ④商品 -->
        <view class="drow__items">{{ (o.items || []).map(it => it.goods_name + '×' + it.qty + (it.unit || '')).join('、') }}</view>
      </view>
      <view v-if="!orders.length && !loading" class="empty">还没有人接龙</view>
      <view v-if="orders.length" class="foot">{{ loading ? '加载中…' : orders.length < total ? '上滑加载更多' : '没有更多了' }}</view>
    </view>

    <!-- 导出 Excel（原 M-24）：活动结束后可用；已取消的活动不生成履约清单（D-052） -->
    <view v-if="stat.status !== 4" class="export">
      <button class="export__btn" :disabled="stat.status !== 3 || exporting" :loading="exporting" @click="exportExcel">导出 Excel 清单</button>
      <view class="export__note">{{ stat.status === 3 ? '每次导出生成最新清单，下载链接 30 分钟内有效；清单含收货人、电话、地址，请妥善保管。' : '活动结束后可导出 Excel 清单' }}</view>
    </view>

    <go-text-list ref="textList" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { DELIVERY_TYPE, labelOf, fen2yuan } from '@/common/grouporder/dict.js';
import GoTextList from '@/components/go-text-list/go-text-list.vue';

const props = defineProps({
  activityId: { type: String, default: '' },
  // 自提点地址（活动级，D-077）：自提订单在接龙明细里显示它
  pickupAddress: { type: String, default: '' },
});

const stat = ref<any>({});
// 复制文字清单（D-101）：已取消的活动不出清单，没有有效订单时也不给
const soldGoods = computed(() => (stat.value.goods_summary || []).filter((g: any) => (g.sold_qty || 0) > 0));
// 送货上门显示收货地址；自提显示自提点地址
const addressOf = (o: any) => (o.delivery_type === 2 ? (props.pickupAddress ? '自提点：' + props.pickupAddress : '') : (o.consignee_address || ''));
const canCopy = computed(() => stat.value.status !== 4 && !!stat.value.valid_order_count);

// —— 接龙明细：有效订单，按下单时间从早到晚分页 ——
const PAGE_SIZE = 20;
const orders = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
let page = 0;
let seq = 0;
const loadOrders = async (more = false) => {
  if (!props.activityId) return;
  if (more && (loading.value || orders.value.length >= total.value)) return;
  const my = ++seq;
  const next = more ? page + 1 : 1;
  loading.value = true;
  try {
    const data = (await guarded(api.order.orderLeaderList({ activity_id: props.activityId, page: next, pageSize: PAGE_SIZE, filters: { status: 1 } }))) || {};
    if (my !== seq) return;
    orders.value = more ? orders.value.concat(data.list || []) : (data.list || []);
    total.value = data.total || 0;
    page = next;
  } catch (e) {
    if (my === seq && !more) { orders.value = []; total.value = 0; }
  } finally {
    if (my === seq) loading.value = false;
  }
};

const reload = async () => {
  if (!props.activityId) return;
  loadOrders(false);
  try {
    stat.value = (await guarded(api.order.orderLeaderStat({ activity_id: props.activityId }))) || {};
  } catch (e) { /* 提示由 guarded 给出 */ }
};
const loadMore = () => loadOrders(true);

const textList = ref<any>(null);
const openTextList = (mode: 'goods' | 'members') => textList.value && textList.value.open(props.activityId, mode);

/**
 * 导出 Excel（D-126，原 M-24）：生成最新清单 → 换取下载地址 → 弹窗由用户点「下载」打开。
 * 下载地址是请求返回后才拿到的，直接 window.open 已不算用户手势，iOS / 微信内常被拦截；
 * 放在确认框的点击里打开即可。地址只用于本次，不缓存（D-071）
 */
const exporting = ref(false);
const exportExcel = async () => {
  if (stat.value.status !== 3 || exporting.value) return;
  exporting.value = true;
  try {
    const gen = (await guarded(api.exportList.listGenerate({ activity_id: props.activityId }))) || {};
    if (!gen.file_version) return;
    const dl = (await guarded(api.exportList.listDownload({ activity_id: props.activityId, file_version: gen.file_version }))) || {};
    if (!dl.url) return;
    uni.showModal({
      title: '清单已生成',
      content: `共 ${gen.valid_order_count || 0} 单、${gen.valid_total_qty || 0} 份。下载链接 30 分钟内有效。`,
      confirmText: '下载',
      success: (r: any) => {
        if (!r.confirm) return;
        // #ifdef H5
        const w = window.open(dl.url);
        if (!w) location.href = dl.url;
        // #endif
        // #ifndef H5
        uni.setClipboardData({ data: dl.url, success: () => uni.showToast({ title: '下载链接已复制，请在浏览器打开', icon: 'none' }) });
        // #endif
      },
    });
  } catch (e) { /* 提示由 guarded 给出 */ } finally {
    exporting.value = false;
  }
};

onMounted(reload);

defineExpose({ reload, loadMore });
</script>

<style lang="scss" scoped>
.sp { padding-bottom: 24rpx; }
.ov { background: #fff; padding: 20rpx 28rpx; font-size: 24rpx; color: $go-muted; }
.ov__n { color: $go-primary; font-weight: 600; }
.block { background: #fff; margin-top: 16rpx; padding: 24rpx 28rpx; }
.block__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.block__title { font-size: 30rpx; color: $go-ink; font-weight: 700; }
.block__sub { font-size: 22rpx; font-weight: 400; color: $go-muted; }
.block__act { font-size: 24rpx; color: $go-primary; padding: 6rpx 20rpx; border: 1rpx solid $go-primary; border-radius: 28rpx; }
.sub { font-size: 22rpx; color: $go-muted; margin-bottom: 8rpx; }
.grow { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $go-soft; font-size: 28rpx; color: $go-ink; }
.grow__name { flex: 1; min-width: 0; }
.grow__qty { font-weight: 600; color: $go-primary-dark; }
.grow--total { border-bottom: 0; }
.grow--total .grow__name { color: $go-muted; font-size: 24rpx; }
.drow { padding: 16rpx 0; border-bottom: 1rpx solid $go-soft; }
.drow__l1 { display: flex; align-items: baseline; gap: 12rpx; font-size: 27rpx; color: $go-ink; }
.drow__no { color: $go-muted; min-width: 44rpx; }
.drow__name { font-weight: 600; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drow__time { font-size: 24rpx; color: $go-text; }
.drow__tags { margin-left: auto; display: flex; gap: 8rpx; flex-shrink: 0; }
.drow__st { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; background: $go-tag-bg; color: $go-tag-text; }
.drow__st--on { background: $go-primary-soft; color: $go-primary; }
.drow__l2 { font-size: 24rpx; color: $go-muted; margin: 8rpx 0 0 56rpx; }
.drow__code-v { color: $go-primary-dark; font-weight: 700; letter-spacing: 2rpx; }
.drow__l3 { font-size: 24rpx; color: $go-text; margin: 8rpx 0 0 56rpx; line-height: 1.6; word-break: break-all; }
.drow__who { color: $go-ink; font-weight: 600; }
.drow__addr { margin-left: 16rpx; }
/* 地址标识图标（D-133），与文字同一行 */
.drow__ic { margin-right: 8rpx; vertical-align: -4rpx; }
.drow__dlv { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.drow__dlv--pick { background: $go-primary-soft; color: $go-primary; }
.drow__dlv--home { background: $go-orange-soft; color: $go-orange; }
.drow__items { font-size: 24rpx; color: $go-text; margin: 8rpx 0 0 56rpx; line-height: 1.5; }
.foot { text-align: center; font-size: 22rpx; color: $go-muted; padding: 20rpx 0 0; }
.empty { text-align: center; color: $go-muted; font-size: 24rpx; padding: 24rpx 0; }
.export { margin: 24rpx 24rpx 0; }
.export__btn { margin: 0; border-radius: 24rpx; background: $go-primary; color: #fff; font-size: 30rpx; font-weight: 600; }
.export__btn[disabled] { background: #b9dcc8 !important; color: #fff !important; }
.export__btn::after { border: none; }
.export__note { text-align: center; font-size: 22rpx; color: $go-muted; margin-top: 12rpx; line-height: 1.5; }
</style>
