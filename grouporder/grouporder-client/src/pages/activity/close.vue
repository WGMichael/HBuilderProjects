<!--
  M-23 截止 / 取消确认与结果

  职责：手动截止、取消原因、不可逆影响及最终状态。
  截止：活动进入已截止，不能再新建 / 扩大订单，可生成清单。
  取消：进行中取消需填原因；取消后参与者的有效订单一并失效（不可逆）。
-->
<template>
  <view class="page" v-if="loaded">
    <view class="head">
      <view class="head__title">{{ act.title }}</view>
      <view class="head__status">当前：{{ labelOf(ACTIVITY_STATUS, act.status) }}</view>
    </view>

    <view class="opt" :class="{ 'opt--on': mode === 'close' }" @click="mode = 'close'">
      <view class="opt__t">手动截止</view>
      <view class="opt__d">立即结束接龙，不能再新建或扩大订单；已有有效订单保留，可生成清单。</view>
    </view>
    <view class="opt" :class="{ 'opt--on': mode === 'cancel' }" @click="mode = 'cancel'">
      <view class="opt__t">取消活动</view>
      <view class="opt__d">整场取消，参与者的有效订单一并失效。此操作不可逆。</view>
    </view>

    <view v-if="mode === 'cancel'" class="field">
      <text class="k">取消原因 <text class="req">*</text></text>
      <textarea class="v" v-model="reason" placeholder="向参与者展示的取消原因" maxlength="200" />
    </view>

    <view class="footer">
      <button class="btn btn--primary" type="primary" :loading="busy" :disabled="!submittable" @click="submit">
        {{ mode === 'cancel' ? '确认取消活动' : '确认截止' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ACTIVITY_STATUS, labelOf } from '@/common/grouporder/dict.js';

const activityId = ref('');
const act = ref<any>({});
const loaded = ref(false);
const mode = ref('close');
const reason = ref('');
const busy = ref(false);

const submittable = computed(() => (mode.value === 'cancel' ? !!reason.value.trim() : true));

const load = async () => {
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  loaded.value = true;
};

const submit = () => {
  const isCancel = mode.value === 'cancel';
  uni.showModal({
    title: isCancel ? '取消活动' : '截止活动',
    content: isCancel ? '取消后参与者有效订单一并失效，不可逆。确认？' : '截止后不能再接龙，确认？',
    success: async (r) => {
      if (!r.confirm) return;
      busy.value = true;
      try {
        if (isCancel) await guarded(api.activity.activityCancel({ activity_id: activityId.value, reason: reason.value.trim() }));
        else await guarded(api.activity.activityClose({ activity_id: activityId.value }));
        uni.showToast({ title: isCancel ? '已取消' : '已截止', icon: 'none' });
        setTimeout(() => uni.navigateBack(), 600);
      } catch (e) {} finally { busy.value = false; }
    },
  });
};

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; padding-bottom: 160rpx; }
.head { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.head__title { font-size: 32rpx; color: #303133; }
.head__status { font-size: 24rpx; color: #909399; margin-top: 8rpx; }
.opt { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; border: 2rpx solid transparent; }
.opt--on { border-color: #2979ff; }
.opt__t { font-size: 30rpx; color: #303133; }
.opt__d { font-size: 24rpx; color: #909399; margin-top: 8rpx; line-height: 1.6; }
.field { background: #fff; border-radius: 16rpx; padding: 24rpx; }
.k { font-size: 26rpx; color: #606266; }
.req { color: #fa3534; }
.v { margin-top: 12rpx; width: 100%; height: 140rpx; font-size: 28rpx; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.btn { margin: 0; font-size: 30rpx; }
.btn--primary { background: #2979ff; color: #fff; }
</style>
