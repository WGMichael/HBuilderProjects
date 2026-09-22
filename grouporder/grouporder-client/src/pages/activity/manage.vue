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
      </view>
      <view class="head__meta" v-if="act.end_time">截止 {{ fmt(act.end_time) }}</view>
      <view class="head__reason" v-if="act.governance_status === 1 && act.governance_reason">下架原因：{{ act.governance_reason }}</view>
    </view>

    <!-- 统计（白名单四项）-->
    <view class="stat" v-if="act.stat">
      <view class="stat__i"><text class="stat__n">{{ act.stat.valid_order_count || 0 }}</text><text class="stat__l">有效订单</text></view>
      <view class="stat__i"><text class="stat__n">{{ act.stat.valid_total_qty || 0 }}</text><text class="stat__l">有效份数</text></view>
      <view class="stat__i"><text class="stat__n">￥{{ fen2yuan(act.stat.estimated_amount) }}</text><text class="stat__l">预计金额</text></view>
    </view>

    <view class="group">
      <view v-if="act.status === 0" class="cell" @click="edit"><text>继续编辑草稿</text><text class="a">›</text></view>
      <view v-if="act.status === 0 || act.status === 2" class="cell" @click="publish"><text>发布 / 审核状态</text><text class="a">›</text></view>
      <view class="cell" @click="orderStat"><text>订单与统计</text><text class="a">›</text></view>
      <view class="cell" @click="goodsManage"><text>商品管理</text><text class="a">›</text></view>
      <view v-if="act.status === 2" class="cell" @click="close"><text>截止 / 取消活动</text><text class="a">›</text></view>
      <view v-if="act.status === 3" class="cell" @click="exportList"><text>接龙清单导出</text><text class="a">›</text></view>
      <view class="cell" @click="viewAsGuest"><text>以参与者视角查看</text><text class="a">›</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ACTIVITY_STATUS, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const act = ref<any>({});
const loaded = ref(false);

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const load = async () => {
  if (!activityId.value) return;
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  loaded.value = true;
};

const edit = () => uni.navigateTo({ url: '/pages/activity/edit?id=' + activityId.value });
const publish = () => uni.navigateTo({ url: '/pages/activity/publish?id=' + activityId.value });
const orderStat = () => uni.navigateTo({ url: '/pages/activity/order-stat?id=' + activityId.value });
const goodsManage = () => uni.navigateTo({ url: '/pages/activity/goods-manage?id=' + activityId.value });
const close = () => uni.navigateTo({ url: '/pages/activity/close?id=' + activityId.value });
const exportList = () => uni.navigateTo({ url: '/pages/activity/export?id=' + activityId.value });
const viewAsGuest = () => uni.navigateTo({ url: '/pages/activity/detail?id=' + activityId.value });

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; }
.head { background: #fff; padding: 32rpx 28rpx; }
.head__title { font-size: 34rpx; color: #303133; }
.head__tags { margin: 12rpx 0; }
.head__meta { font-size: 24rpx; color: #909399; }
.head__reason { font-size: 24rpx; color: #fa3534; margin-top: 10rpx; }
.stat { display: flex; background: #fff; margin-top: 16rpx; padding: 28rpx 0; }
.stat__i { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat__n { font-size: 34rpx; color: #2979ff; }
.stat__l { font-size: 22rpx; color: #909399; margin-top: 6rpx; }
.group { background: #fff; margin-top: 16rpx; }
.cell { display: flex; align-items: center; justify-content: space-between; padding: 30rpx 28rpx; border-bottom: 1rpx solid #f5f5f5; font-size: 28rpx; color: #303133; }
.a { color: #c0c4cc; }
.tag { display: inline-block; font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; margin-right: 8rpx; }
.tag--biz { background: #e8f3ff; color: #2979ff; }
.tag--gov { background: #fef0f0; color: #fa3534; }
.tag--warn { background: #fdf6ec; color: #f3a73f; }
</style>
