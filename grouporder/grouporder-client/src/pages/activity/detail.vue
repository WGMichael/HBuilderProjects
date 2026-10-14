<!--
  M-13 活动详情（参与者视角，也是分享落地页）

  职责：非敏感活动内容、商品选择、业务/治理状态、各商品已购买份数、活动有效总份数、举报入口。
  展示部分用 go-activity-view（与 M-12 发布预览共用，视觉见 prototype/mockup-v3.html D 组）；本页只管选购与下单。
  D-033：未登录可浏览，提交（下单）时才要求登录。
  红线⑦：业务状态与治理状态分列，不合并。D-044：total_stock=0 表示不限。
  改单（D-086）：从 M-19 带 order_id 进入时，按本单明细预填数量，「下一步」进入确认页的改单模式。
-->
<template>
  <view class="page">
    <block v-if="loaded">
      <!-- 活动内容：与 M-12 发布预览共用同一组件，团长预览所见即参与者所见 -->
      <go-activity-view :act="act">
        <template #after-head>
          <!-- 不可接龙提示 -->
          <view v-if="!act.joinable" class="closed-bar">{{ closedReason }}</view>
        </template>
        <template #goods-ctrl="{ g }">
          <view class="stepper" v-if="canBuy(g) || ownQty[g._id] > 0">
            <text class="stepper__btn" @click="dec(g)">－</text>
            <text class="stepper__n">{{ qty[g._id] || 0 }}</text>
            <text class="stepper__btn stepper__btn--plus" @click="inc(g)">＋</text>
          </view>
          <text v-else class="gitem__na">不可选</text>
        </template>
      </go-activity-view>

      <!-- 底部结算 -->
      <view class="bar">
        <view class="bar__report" @click="report">举报</view>
        <!-- 参与者二次转发（SHARE_SPEC §5，M-13）：群接龙的扩散主路径；点开分享弹窗 -->
        <text v-if="canShare" class="bar__share" @click="openShare">转发</text>
        <view class="bar__sum">
          <text>已选 {{ totalQty }} 份</text>
          <text v-if="totalQty"> · 预计 <text class="bar__amt">¥{{ fen2yuan(estAmount) }}</text></text>
        </view>
        <button class="bar__go" type="primary" :disabled="!totalQty || !act.joinable" @click="confirm">{{ act.not_started ? fmt(act.start_time) + ' 开始' : (orderId ? '下一步：确认修改' : '去下单') }}</button>
      </view>
    </block>
    <go-share-sheet ref="shareSheet" @ready="onShareReady" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onHide, onUnload, onShareAppMessage } from '@dcloudio/uni-app';
// @ts-ignore
import { serverOffset, scheduleBoundary } from '@/common/grouporder/activity-time.js';
// @ts-ignore
import api, { guarded, ensureLogin } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';
import GoActivityView from '@/components/go-activity-view/go-activity-view.vue';
import GoShareSheet from '@/components/go-share-sheet/go-share-sheet.vue';

const activityId = ref('');
// 改单模式（D-086）：有值时预填本单数量，下一步进入确认页改单
const orderId = ref('');
let prefilled = false;
// 本单原有数量：改单时它已计入已购，剩余量要加回来；停售 / 下架商品也允许减少（D-019、D-050）
const ownQty = ref<Record<string, number>>({});
const act = ref<any>({});
const loaded = ref(false);
const qty = ref<Record<string, number>>({});

const closedReason = computed(() => {
  // 未开始：能看不能下单（D-087）
  if (act.value.not_started) return `活动 ${fmt(act.value.start_time)} 开始，届时可下单`;
  if (act.value.status === 3) return '活动已截止，不能再下单';
  if (act.value.status === 4) return '活动已被团长取消';
  if (act.value.governance_status === 1) return '活动已被平台下架';
  return '当前不可接龙';
});

const canBuy = (g: any) => act.value.joinable && g.on_sale === 1 && g.governance_status === 0 && (g.total_stock === 0 || g.remain_qty > 0);
// 预计金额：仅供参与者参考，以确认页服务端试算为准
const estAmount = computed(() => (act.value.goods || []).reduce((s: number, g: any) => s + (qty.value[g._id] || 0) * (g.price || 0), 0));
const totalQty = computed(() => Object.values(qty.value).reduce((s, n) => s + (n || 0), 0));

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const inc = (g: any) => {
  const cur = qty.value[g._id] || 0;
  if (!canBuy(g) && cur >= (ownQty.value[g._id] || 0)) { uni.showToast({ title: '该商品当前不可增加', icon: 'none' }); return; }
  if (g.total_stock > 0 && cur >= g.remain_qty + (ownQty.value[g._id] || 0)) { uni.showToast({ title: '超过剩余量', icon: 'none' }); return; }
  qty.value = { ...qty.value, [g._id]: cur + 1 };
};
const dec = (g: any) => {
  const cur = qty.value[g._id] || 0;
  if (cur <= 0) return;
  qty.value = { ...qty.value, [g._id]: cur - 1 };
};

// —— 分享（SHARE_SPEC §5，M-13）——
// 本页参与者也能转发，而 activityGetShareEntry 是 requireLeader（参与者会被拒），
// 因此卡片直接用页面已有的 act，不调该接口。状态复核由落地页自己承担：
// activityGetDetail 对草稿/审核中的活动已向非团长抛 FORBIDDEN，
// 截止/取消/下架则由 §6.2 的落地页提示覆盖，转发出去也不会让人下成单
const canShare = computed(() => act.value.status === 2 && act.value.governance_status === 0);

// 分享弹窗（效果图 share-mockup B / C 组）：复核通过后由组件给出卡片，onShareAppMessage 优先用它
const shareSheet = ref<any>(null);
const shareCard = ref<any>(null);
const openShare = () => shareSheet.value && shareSheet.value.open({ _id: activityId.value });
const onShareReady = (c: any) => { shareCard.value = c; };

onShareAppMessage(() => shareCard.value || ({
  title: act.value.title ? '接龙丨' + act.value.title : '',
  path: '/pages/activity/detail?id=' + activityId.value,
  imageUrl: (act.value.cover_image && act.value.cover_image.url) || '',
}));

const load = async () => {
  if (!activityId.value) return;
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  // 改单：只在首次进入时按本单明细预填，之后保留用户的调整
  if (orderId.value && !prefilled) {
    prefilled = true;
    try {
      const order = (await guarded(api.order.orderGetDetail({ order_id: orderId.value }))) || {};
      const m: Record<string, number> = {};
      for (const it of order.items || []) m[it.goods_id] = it.qty;
      qty.value = { ...m };
      ownQty.value = m;
    } catch (e) {}
  }
  loaded.value = true;
  armTick();
};

const confirm = () => {
  // 提交时才要求登录（D-033）
  if (!ensureLogin()) return;
  const items = Object.keys(qty.value).filter((k) => qty.value[k] > 0).map((k) => ({ goods_id: k, qty: qty.value[k] }));
  if (!items.length) return;
  uni.setStorageSync('order_draft_items', items);
  uni.navigateTo({ url: '/pages/order/confirm?activity_id=' + activityId.value + (orderId.value ? '&order_id=' + orderId.value : '') });
};

const report = () => {
  if (!ensureLogin()) return;
  uni.navigateTo({ url: '/pages/report/submit?activity_id=' + activityId.value });
};

onLoad((q: any = {}) => {
  // 分享卡片的 path 只带 activity_id（SHARE_SPEC §4.1、D-083）。
  // 原先还兜底接 q.short_code，但短码会被当成 ObjectId 去查，必然 NOT_FOUND，
  // 是一条永远失败的路径，已删除
  activityId.value = q.id || q.activity_id || '';
  orderId.value = q.order_id || '';
});
// 起止时间点：页面开着时到点刷新一次（未开始 → 可下单、进行中 → 已截止），隐藏即取消
let cancelTick = () => {};
const armTick = () => {
  cancelTick();
  cancelTick = scheduleBoundary([act.value], serverOffset(act.value.asOf), () => load());
};
onShow(() => load());
onHide(() => cancelTick());
onUnload(() => cancelTick());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 140rpx; background: $go-canvas; }
.closed-bar { background: $go-red-soft; color: $go-red; font-size: 26rpx; padding: 20rpx 28rpx; }
.gitem__na { color: $go-placeholder; font-size: 24rpx; }
.stepper { display: flex; align-items: center; }
.stepper__btn { width: 52rpx; height: 52rpx; line-height: 48rpx; text-align: center; border: 1rpx solid $go-border; border-radius: 50%; color: $go-text; font-size: 32rpx; }
.stepper__btn--plus { background: $go-primary; border-color: $go-primary; color: #fff; }
.stepper__n { min-width: 56rpx; text-align: center; font-size: 30rpx; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 16rpx 24rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.bar__report { font-size: 24rpx; color: $go-muted; margin-right: 24rpx; }
.bar__share { font-size: 24rpx; color: $go-primary; background: transparent; margin: 0 24rpx 0 0; padding: 0; line-height: 1.6; }
.bar__share::after { border: none; }
.bar__sum { flex: 1; font-size: 26rpx; color: $go-ink; }
.bar__amt { color: $go-orange; font-weight: 700; }
.bar__go { margin: 0; font-size: 30rpx; }
</style>
