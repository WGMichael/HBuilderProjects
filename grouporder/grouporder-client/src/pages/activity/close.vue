<!--
  M-23 截止 / 取消确认与结果

  职责：手动截止、取消原因、不可逆影响及最终状态。
  截止：活动进入已结束，不能再新建 / 扩大订单，可生成清单。
  取消：只限开始前（草稿、已通过但未到起始时间，D-111，服务端同样强制）；需填原因；取消后不能再下单或改单，已有订单保留记录但不计入有效统计、不生成履约清单（D-027、D-052，不可逆）。
-->
<template>
  <go-result v-if="loadFailed" type="unknown" detail="页面加载失败，请检查网络后重试" @retry="load" />
  <view class="page" v-if="loaded">
    <view class="head">
      <view class="head__title">{{ act.title }}</view>
      <view class="head__status">当前：{{ labelOf(ACTIVITY_STATUS, act.status) }}</view>
    </view>

    <!-- 只列当前状态允许的操作（与服务端一致）：截止限审核中 / 进行中，取消限草稿 / 开始前的进行中（D-111） -->
    <view v-if="canClose && fixedMode !== 'cancel'" class="opt" :class="{ 'opt--on': mode === 'close' }" @click="mode = 'close'">
      <view class="opt__t">手动截止</view>
      <view class="opt__d">立即结束接龙，不能再新建或扩大订单；已有有效订单保留，可生成清单。</view>
    </view>
    <view v-if="canCancel && fixedMode !== 'close'" class="opt" :class="{ 'opt--on': mode === 'cancel' }" @click="mode = 'cancel'">
      <view class="opt__t">取消活动</view>
      <view class="opt__d">整场取消，参与者不能再下单或改单；已有订单保留记录，但不再计入有效统计、不生成履约清单。此操作不可逆。</view>
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
import GoResult from '@/components/go-result/go-result.vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ACTIVITY_STATUS, labelOf } from '@/common/grouporder/dict.js';
// @ts-ignore
import { safeBack } from '@/common/grouporder/nav.js';

const activityId = ref('');
const act = ref<any>({});
const loaded = ref(false);
const mode = ref('close');
// 从 M-20 标题行按钮进入时带 mode（D-111）：只展示该项操作，不再二选一
const fixedMode = ref('');
const reason = ref('');
const busy = ref(false);

const canClose = computed(() => act.value.status === 1 || act.value.status === 2);
// 开始后不能取消（D-111）：进行中只有未开始时可取消
const canCancel = computed(() => act.value.status === 0 || (act.value.status === 2 && !!act.value.not_started));
const submittable = computed(() => {
  if (mode.value === 'cancel') return canCancel.value && !!reason.value.trim();
  return canClose.value;
});

const loadInner = async () => {
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  // 进入后活动状态已变（如刚好开始 / 被截止）、指定操作不再允许：退回按当前状态列出可选项
  if ((fixedMode.value === 'close' && !canClose.value) || (fixedMode.value === 'cancel' && !canCancel.value)) fixedMode.value = '';
  if (fixedMode.value === 'cancel' && canCancel.value) mode.value = 'cancel';
  else if (fixedMode.value === 'close' && canClose.value) mode.value = 'close';
  else if (!canClose.value && canCancel.value) mode.value = 'cancel';
  loaded.value = true;
};

// 加载失败（断网、非对象级错误）时给出重试，不白屏；对象级错误由 guarded 跳 M-26
const loadFailed = ref(false);
const load = async () => {
  loadFailed.value = false;
  try {
    await loadInner();
  } catch (e) {
    if (!loaded.value) loadFailed.value = true;
  }
};

const submit = () => {
  if (!submittable.value || busy.value) return;
  const isCancel = mode.value === 'cancel';
  uni.showModal({
    title: isCancel ? '取消活动' : '截止活动',
    content: isCancel ? '取消后参与者不能再下单或改单，已有订单不再计入有效统计，不可恢复。确认取消？' : '截止后不能再接龙，确认？',
    success: async (r) => {
      if (!r.confirm) return;
      busy.value = true;
      try {
        if (isCancel) await guarded(api.activity.activityCancel({ activity_id: activityId.value, reason: reason.value.trim() }));
        else await guarded(api.activity.activityClose({ activity_id: activityId.value }));
        uni.showToast({ title: isCancel ? '已取消' : '已结束', icon: 'none' });
        setTimeout(() => safeBack('/pages/activity/manage?id=' + activityId.value), 600);
      } catch (e) {} finally { busy.value = false; }
    },
  });
};

onLoad((q: any = {}) => {
  activityId.value = q.id || '';
  if (q.mode === 'close' || q.mode === 'cancel') fixedMode.value = q.mode;
});
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding: 20rpx; padding-bottom: 160rpx; }
.head { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.head__title { font-size: 32rpx; color: $go-ink; }
.head__status { font-size: 24rpx; color: $go-muted; margin-top: 8rpx; }
.opt { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; border: 2rpx solid transparent; }
.opt--on { border-color: $go-primary; }
.opt__t { font-size: 30rpx; color: $go-ink; }
.opt__d { font-size: 24rpx; color: $go-muted; margin-top: 8rpx; line-height: 1.6; }
.field { background: #fff; border-radius: 16rpx; padding: 24rpx; }
.k { font-size: 26rpx; color: $go-text; }
.req { color: $go-red; }
.v { margin-top: 12rpx; width: 100%; height: 140rpx; font-size: 28rpx; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.btn { margin: 0; font-size: 30rpx; }
.btn--primary { background: $go-primary; color: #fff; }
</style>
