<!--
  M-12 发布预览与结果

  职责：参与者视角预览、提交审核、审核中/不通过结果；通过后分享。
  D-057/D-043：队列来源由平台审核模式决定；D-058：图片异步检测不阻塞放行。
-->
<template>
  <view class="page">
    <view class="banner" v-if="statusText">{{ statusText }}</view>

    <!-- 参与者视角预览 -->
    <view class="preview">
      <view class="preview__title">{{ act.title }}</view>
      <view class="preview__desc" v-if="act.description">{{ act.description }}</view>
      <view class="preview__meta">
        <text>交付：{{ labelOf(DELIVERY_TYPE, act.delivery_type) }}</text>
        <text v-if="act.end_time"> · 截止 {{ fmt(act.end_time) }}</text>
      </view>
      <view class="goods" v-for="g in act.goods || []" :key="g._id">
        <text class="goods__name">{{ g.name }}<text v-if="g.is_recommend === 1" class="goods__rec">推荐</text></text>
        <text class="goods__price">￥{{ fen2yuan(g.price) }} / {{ g.unit || '份' }}</text>
      </view>
    </view>

    <view class="footer">
      <template v-if="act.status === 0">
        <button class="btn" @click="goBack">返回修改</button>
        <button class="btn btn--primary" type="primary" :loading="busy" @click="submit">提交审核</button>
      </template>
      <template v-else-if="act.status === 1">
        <button class="btn" :loading="busy" @click="withdraw">撤回审核</button>
        <view class="note">审核中，通过后可分享。图片检测不阻塞放行。</view>
      </template>
      <template v-else-if="act.status === 2">
        <button class="btn btn--primary" type="primary" open-type="share">分享给好友接龙</button>
        <button class="btn" @click="goManage">去管理</button>
      </template>
      <template v-else>
        <button class="btn" @click="goManage">查看活动</button>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { DELIVERY_TYPE, REVIEW_RESULT, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const act = ref<any>({});
const busy = ref(false);

const statusText = computed(() => {
  if (act.value.status === 1) return '审核中';
  if (act.value.status === 2) return '已通过，进行中';
  if (act.value.review_result === 2) return '审核不通过：' + (act.value.review_reason || '');
  return '';
});

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const load = async () => {
  if (!activityId.value) return;
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
};

const submit = async () => {
  busy.value = true;
  try {
    const r = (await guarded(api.activity.activitySubmitReview({ activity_id: activityId.value }))) || {};
    uni.showToast({ title: r.auto_passed ? '已自动通过' : '已提交审核', icon: 'none' });
    await load();
  } catch (e) {} finally { busy.value = false; }
};

const withdraw = async () => {
  busy.value = true;
  try {
    await guarded(api.activity.activityWithdrawReview({ activity_id: activityId.value }));
    await load();
  } catch (e) {} finally { busy.value = false; }
};

const goBack = () => uni.navigateBack();
const goManage = () => uni.redirectTo({ url: '/pages/activity/manage?id=' + activityId.value });

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 160rpx; background: #f4f5f7; }
.banner { background: #fdf6ec; color: #f3a73f; font-size: 26rpx; padding: 20rpx 32rpx; }
.preview { background: #fff; margin: 20rpx; border-radius: 16rpx; padding: 28rpx; }
.preview__title { font-size: 34rpx; color: #303133; }
.preview__desc { font-size: 26rpx; color: #606266; margin-top: 12rpx; line-height: 1.7; }
.preview__meta { font-size: 24rpx; color: #909399; margin: 16rpx 0; }
.goods { display: flex; justify-content: space-between; padding: 16rpx 0; border-top: 1rpx solid #f5f5f5; font-size: 28rpx; color: #303133; }
.goods__rec { font-size: 20rpx; color: #f3a73f; margin-left: 8rpx; }
.goods__price { color: #fa3534; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; display: flex; flex-direction: column; gap: 12rpx; }
.btn { margin: 0; font-size: 30rpx; background: #f5f5f5; color: #606266; }
.btn--primary { background: #2979ff; color: #fff; }
.note { font-size: 22rpx; color: #909399; text-align: center; }
</style>
