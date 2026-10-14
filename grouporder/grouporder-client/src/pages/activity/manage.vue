<!--
  M-20 团长活动管理（团长侧枢纽页）

  职责：活动及审核状态、统计、参与者明细、商品、截止、取消、清单入口。
  红线⑦：业务状态与治理状态分列。红线⑧：统计只用白名单指标。
-->
<template>
  <view class="page" v-if="loaded">
    <view class="head">
      <view class="head__title">{{ act.title }}</view>
      <view class="head__tags">
        <text class="tag tag--biz">{{ labelOf(ACTIVITY_STATUS, act.status) }}</text>
        <text v-if="act.governance_status === 1" class="tag tag--gov">已下架</text>
        <text v-if="act.review_result === 2" class="tag tag--warn">审核不通过</text>
        <text v-if="act.not_started" class="tag tag--warn">未开始</text>
      </view>
      <view class="head__meta" v-if="act.end_time"><text v-if="act.start_time">{{ fmt(act.start_time) }} 开始 · </text>截止 {{ fmt(act.end_time) }} · {{ deliveryText(act.delivery_types) }}</view>
      <view class="head__reason" v-if="act.governance_status === 1 && act.governance_reason">下架原因：{{ act.governance_reason }}</view>
    </view>

    <!-- 统计（白名单四项）-->
    <view class="stat" v-if="act.stat">
      <view class="stat__i"><text class="stat__n">{{ act.stat.valid_order_count || 0 }}</text><text class="stat__l">有效订单</text></view>
      <view class="stat__i"><text class="stat__n">{{ act.stat.valid_total_qty || 0 }}</text><text class="stat__l">有效份数</text></view>
      <view class="stat__i"><text class="stat__n">￥{{ fen2yuan(act.stat.estimated_amount) }}</text><text class="stat__l">预计金额</text></view>
    </view>
    <!-- 按交付方式拆分（D-086）：只列活动支持的方式 -->
    <view class="stat-dlv" v-if="act.stat && act.stat.by_delivery">
      <view v-if="(act.delivery_types || []).includes(1)" class="stat-dlv__i">送货上门 {{ act.stat.by_delivery.home.order_count }} 单 / {{ act.stat.by_delivery.home.total_qty }} 份</view>
      <view v-if="(act.delivery_types || []).includes(2)" class="stat-dlv__i">自提 {{ act.stat.by_delivery.self_pick.order_count }} 单 / {{ act.stat.by_delivery.self_pick.total_qty }} 份</view>
    </view>

    <!-- 便捷分享（效果图 share-mockup A 组）：进行中且未下架才显示，点开分享弹窗 -->
    <button v-if="canShare" class="share-cta" @click="openShare">分享给好友接龙<text class="share-cta__sub">转发卡片给微信好友或群</text></button>

    <view class="group">
      <view v-if="act.status === 0" class="cell" @click="edit"><text>继续编辑草稿</text><text class="a">›</text></view>
      <view v-if="act.status === 0 || act.status === 2" class="cell" @click="publish"><text>发布 / 审核状态</text><text class="a">›</text></view>
      <view class="cell" @click="orderStat"><text>订单与统计</text><text class="a">›</text></view>
      <view class="cell" @click="goodsManage"><text>商品管理</text><text class="a">›</text></view>
      <!-- 自提点发布后可改、即时生效、不重新审核（D-077）；已取消的活动无履约可言 -->
      <view v-if="(act.delivery_types || []).includes(2) && act.status !== 4" class="cell" @click="pickupEdit"><text>修改自提点</text><text class="a">›</text></view>
      <view v-if="act.status === 2" class="cell" @click="close"><text>截止 / 取消活动</text><text class="a">›</text></view>
      <view v-if="act.status === 3" class="cell" @click="exportList"><text>接龙清单导出</text><text class="a">›</text></view>
      <view class="cell" @click="viewAsGuest"><text>以参与者视角查看</text><text class="a">›</text></view>
      <!-- 从未发布过的草稿可删除（D-090）；发布过的只能取消或截止 -->
      <view v-if="canDeleteDraft" class="cell cell--danger" @click="deleteDraft"><text>删除草稿</text><text class="a">›</text></view>
    </view>

    <go-share-sheet ref="shareSheet" @ready="onShareReady" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onHide, onUnload, onShareAppMessage } from '@dcloudio/uni-app';
// @ts-ignore
import { serverOffset, scheduleBoundary } from '@/common/grouporder/activity-time.js';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { canDeleteDraft as canDelete, confirmDeleteDraft } from '@/common/grouporder/draft.js';
// @ts-ignore
import { ACTIVITY_STATUS, deliveryText, labelOf, fen2yuan } from '@/common/grouporder/dict.js';
import GoShareSheet from '@/components/go-share-sheet/go-share-sheet.vue';

const activityId = ref('');
const act = ref<any>({});
const loaded = ref(false);

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

// —— 分享（SHARE_SPEC §5，M-20）——
// 进行中且未被平台下架才给入口；卡片内容同步返回，故预先取好（§4.3）
const shareEntry = ref<any>(null);
const canShare = computed(() => act.value.status === 2 && act.value.governance_status === 0);

const loadShareEntry = async () => {
  if (!canShare.value) { shareEntry.value = null; return; }
  try {
    shareEntry.value = await guarded(
      api.activity.activityGetShareEntry({ activity_id: activityId.value }),
      { silent: true }
    );
  } catch (e) {
    shareEntry.value = null;
  }
};

// 分享弹窗：复核通过后由组件给出卡片内容，onShareAppMessage 优先用它（必须同步返回）
const shareSheet = ref<any>(null);
const shareCard = ref<any>(null);
const openShare = () => shareSheet.value && shareSheet.value.open({ _id: activityId.value });
const onShareReady = (c: any) => { shareCard.value = c; };

onShareAppMessage(() => {
  if (shareCard.value) return shareCard.value;
  // 右上角菜单直接转发时不经弹窗，用页面加载时预取的复核结果
  const e = shareEntry.value || {};
  return {
    title: e.title ? '接龙丨' + e.title : act.value.title || '',
    path: '/pages/activity/detail?id=' + activityId.value,
    imageUrl: (e.cover_image && e.cover_image.url) || '',
  };
});

const load = async () => {
  if (!activityId.value) return;
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  await loadShareEntry();
  loaded.value = true;
  armTick();
};

// —— 删除草稿（D-090）：确认、遮罩、提示统一在 common/grouporder/draft.js ——
const canDeleteDraft = computed(() => canDelete(act.value));
const deleteDraft = async () => {
  if (!(await confirmDeleteDraft({ _id: activityId.value, title: act.value.title }))) return;
  // 留出「删除成功」提示的时间再返回；「我发起的」在 onShow 时刷新
  setTimeout(() => uni.navigateBack(), 1200);
};

const edit = () => uni.navigateTo({ url: '/pages/activity/edit?id=' + activityId.value });
const publish = () => uni.navigateTo({ url: '/pages/activity/publish?id=' + activityId.value });
const orderStat = () => uni.navigateTo({ url: '/pages/activity/order-stat?id=' + activityId.value });
const goodsManage = () => uni.navigateTo({ url: '/pages/activity/goods-manage?id=' + activityId.value });
const pickupEdit = () => uni.navigateTo({ url: '/pages/activity/pickup-edit?id=' + activityId.value });
const close = () => uni.navigateTo({ url: '/pages/activity/close?id=' + activityId.value });
const exportList = () => uni.navigateTo({ url: '/pages/activity/export?id=' + activityId.value });
const viewAsGuest = () => uni.navigateTo({ url: '/pages/activity/detail?id=' + activityId.value });

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
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
.page { min-height: 100vh; background: $go-canvas; }
.head { background: #fff; padding: 32rpx 28rpx; }
.head__title { font-size: 34rpx; color: $go-ink; }
.head__tags { margin: 12rpx 0; }
.head__meta { font-size: 24rpx; color: $go-muted; }
.head__reason { font-size: 24rpx; color: $go-red; margin-top: 10rpx; }
.stat { display: flex; background: #fff; margin-top: 16rpx; padding: 28rpx 0; }
.stat__i { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat__n { font-size: 34rpx; color: $go-primary; }
.stat__l { font-size: 22rpx; color: $go-muted; margin-top: 6rpx; }
.stat-dlv { display: flex; justify-content: space-around; background: #fff; padding: 0 0 24rpx; }
.stat-dlv__i { font-size: 24rpx; color: $go-text; }
.group { background: #fff; margin-top: 16rpx; }
.cell { display: flex; align-items: center; justify-content: space-between; padding: 30rpx 28rpx; border-bottom: 1rpx solid $go-soft; font-size: 28rpx; color: $go-ink; }
/* button 自带边框、圆角与居中，压平成 cell 的样子 */
.cell--danger { color: $go-red; }
.share-cta { margin: 28rpx 32rpx 0; padding: 22rpx 0; border-radius: 28rpx; background: $go-primary; color: #fff; font-size: 30rpx; font-weight: 700; line-height: 1.3; box-shadow: 0 16rpx 36rpx rgba(22, 138, 85, 0.22); }
.share-cta::after { border: none; }
.share-cta__sub { display: block; font-size: 21rpx; font-weight: 500; opacity: 0.85; margin-top: 6rpx; }
.a { color: $go-placeholder; }
.tag { display: inline-block; font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; margin-right: 8rpx; }
.tag--biz { background: $go-primary-soft; color: $go-primary; }
.tag--gov { background: $go-red-soft; color: $go-red; }
.tag--warn { background: $go-orange-soft; color: $go-orange; }
</style>
