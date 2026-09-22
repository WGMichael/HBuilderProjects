<!--
  M-25 举报提交与结果

  职责：举报活动 / 相关商品、查看处理结果。
  举报提交本身不触发下架（D-054），只有运营审核成立后才处置；结果可在本页查询。
-->
<template>
  <view class="page">
    <view class="card">
      <view class="card__title">举报</view>
      <view class="field">
        <text class="k">举报类型 <text class="req">*</text></text>
        <picker :range="reasonNames" :value="reasonIndex" @change="onReason">
          <text class="v">{{ reasonNames[reasonIndex] || '请选择' }} ›</text>
        </picker>
      </view>
      <view class="field">
        <text class="k">举报说明 <text class="req">*</text></text>
        <textarea class="v v--area" v-model="desc" placeholder="请描述问题，便于运营核实" maxlength="500" />
      </view>
      <button class="submit" type="primary" :loading="submitting" :disabled="!valid" @click="submit">提交举报</button>
      <view class="note">举报提交本身不改变活动状态，运营核实成立后才会处置。结果会在下方与「待办」中通知。</view>
    </view>

    <view class="card">
      <view class="card__title">我的举报</view>
      <view v-for="r in myReports" :key="r._id" class="r" @click="viewResult(r)">
        <view class="r__l1">
          <text>{{ r.report_no }}</text>
          <text class="tag" :class="r.has_result ? 'tag--ok' : 'tag--wait'">{{ labelOf(REPORT_STATUS, r.status) }}</text>
        </view>
        <view class="r__l2">{{ labelOf(REPORT_REASON, r.reason_type) }}<text v-if="r.goods_name"> · {{ r.goods_name }}</text> · {{ fmt(r.create_date) }}</view>
      </view>
      <view v-if="!myReports.length" class="empty">暂无举报记录</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { REPORT_REASON_OPTIONS, REPORT_REASON, REPORT_STATUS, labelOf } from '@/common/grouporder/dict.js';

const activityId = ref('');
const goodsId = ref('');
const reasonIndex = ref(-1);
const desc = ref('');
const submitting = ref(false);
const myReports = ref<any[]>([]);

const reasonNames = REPORT_REASON_OPTIONS.map((o) => o.text);
const valid = computed(() => reasonIndex.value >= 0 && !!desc.value.trim() && !!activityId.value);
const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const onReason = (e: any) => { reasonIndex.value = Number(e.detail.value); };

const loadMine = async () => {
  myReports.value = ((await guarded(api.report.reportMyList({ page: 1, pageSize: 50 }))) || {}).list || [];
};

const submit = async () => {
  if (!valid.value) return;
  submitting.value = true;
  try {
    await guarded(api.report.reportSubmit({
      activity_id: activityId.value,
      goods_id: goodsId.value || '',
      reason_type: REPORT_REASON_OPTIONS[reasonIndex.value].value,
      reason_desc: desc.value.trim(),
    }));
    uni.showToast({ title: '举报已提交', icon: 'none' });
    reasonIndex.value = -1; desc.value = '';
    loadMine();
  } catch (e) {} finally { submitting.value = false; }
};

const viewResult = async (r: any) => {
  try {
    const data = (await guarded(api.report.reportGetResult({ report_id: r._id, report_no: r.report_no }))) || {};
    uni.showModal({
      title: '举报结果',
      content: data.finished ? `状态：${labelOf(REPORT_STATUS, data.status)}${data.close_time ? '\n结案时间：' + fmt(data.close_time) : ''}` : '举报处理中，请耐心等待。',
      showCancel: false,
    });
  } catch (e) {}
};

onLoad((q: any = {}) => { activityId.value = q.activity_id || ''; goodsId.value = q.goods_id || ''; });
onShow(() => loadMine());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 16rpx; }
.card__title { font-size: 30rpx; color: #303133; margin-bottom: 20rpx; }
.field { margin-bottom: 20rpx; }
.k { font-size: 26rpx; color: #606266; }
.req { color: #fa3534; }
.v { margin-top: 12rpx; font-size: 28rpx; color: #303133; }
.v--area { width: 100%; height: 160rpx; border: 1rpx solid #f0f0f0; border-radius: 12rpx; padding: 16rpx; box-sizing: border-box; }
.submit { margin: 0; font-size: 30rpx; }
.note { font-size: 22rpx; color: #909399; line-height: 1.7; margin-top: 16rpx; }
.r { padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.r__l1 { display: flex; justify-content: space-between; font-size: 28rpx; color: #303133; }
.r__l2 { font-size: 24rpx; color: #909399; margin-top: 6rpx; }
.empty { text-align: center; color: #909399; font-size: 26rpx; padding: 40rpx 0; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag--ok { background: #e7faec; color: #18bc37; }
.tag--wait { background: #fdf6ec; color: #f3a73f; }
</style>
