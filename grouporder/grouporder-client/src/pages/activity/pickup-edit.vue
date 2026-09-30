<!--
  修改自提点（D-077，非 tabBar 页）

  与「编辑草稿」分开的理由：自提点是活动级共享信息、不进订单快照，
  发布后允许随时改、即时对所有人生效、不触发重新审核，
  因此走独立的 activityUpdatePickup，而不是 activityUpdateDraft。
  仅自提活动（delivery_type=2）可进入，由 M-20 控制入口。
-->
<template>
  <view class="page" v-if="loaded">
    <view class="tip">改完立刻对所有参与者生效，不需要重新审核。已下单的人看到的也是新内容。</view>

    <view class="card">
      <view class="field">
        <text class="field__k">自提地址 <text class="req">*</text></text>
        <input class="field__v" v-model="form.pickup_address" placeholder="如「XX小区北门快递柜旁」" maxlength="200" />
      </view>
      <view class="field">
        <text class="field__k">自提时间</text>
        <input class="field__v" v-model="form.pickup_time_desc" placeholder="如「周六 9:00–18:00」" maxlength="100" />
      </view>
      <view class="field">
        <text class="field__k">现场联系人</text>
        <input class="field__v" v-model="form.pickup_contact_name" placeholder="取货时找谁（选填）" maxlength="20" />
      </view>
      <view class="field">
        <text class="field__k">联系电话</text>
        <input class="field__v" v-model="form.pickup_contact_mobile" placeholder="取货联系电话（选填）" maxlength="20" />
      </view>
    </view>

    <view class="hint">自提时间指截止后去取货的时段，与接龙截止时间是两回事。</view>

    <button class="save" type="primary" :loading="saving" :disabled="!form.pickup_address.trim()" @click="save">保存</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';

const activityId = ref('');
const loaded = ref(false);
const saving = ref(false);
const form = ref<any>({ pickup_address: '', pickup_time_desc: '', pickup_contact_name: '', pickup_contact_mobile: '' });

const load = async () => {
  if (!activityId.value) return;
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  form.value.pickup_address = data.pickup_address || '';
  form.value.pickup_time_desc = data.pickup_time_desc || '';
  form.value.pickup_contact_name = data.pickup_contact_name || '';
  form.value.pickup_contact_mobile = data.pickup_contact_mobile || '';
  loaded.value = true;
};

const save = async () => {
  if (saving.value) return;
  saving.value = true;
  try {
    await guarded(api.activity.activityUpdatePickup({
      activity_id: activityId.value,
      pickup_address: form.value.pickup_address.trim(),
      pickup_time_desc: form.value.pickup_time_desc.trim(),
      pickup_contact_name: form.value.pickup_contact_name.trim(),
      pickup_contact_mobile: form.value.pickup_contact_mobile.trim(),
    }));
    uni.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch (e) {
    /* 统一提示 */
  } finally {
    saving.value = false;
  }
};

onLoad((q: any = {}) => { activityId.value = q.id || ''; load(); });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; }
.tip { font-size: 24rpx; color: #8a6d3b; background: #fffbe8; border-radius: 12rpx; padding: 20rpx; line-height: 1.7; }
.card { background: #fff; border-radius: 16rpx; padding: 8rpx 24rpx; margin-top: 20rpx; }
.field { display: flex; flex-direction: column; gap: 12rpx; padding: 24rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.field:last-child { border-bottom: none; }
.field__k { font-size: 26rpx; color: #606266; }
.field__v { font-size: 28rpx; color: #303133; background: #f7f8fa; border-radius: 8rpx; padding: 16rpx 20rpx; }
.req { color: #fa3534; }
.hint { font-size: 22rpx; color: #909399; line-height: 1.7; margin: 16rpx 8rpx; }
.save { margin-top: 32rpx; font-size: 30rpx; }
</style>
