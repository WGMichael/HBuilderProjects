<!--
  M-07 账号申诉与结果

  职责：提交绑定异常申诉、查看处理结果。
  D-055：双方均有业务数据时不受理、不合并、不迁移——服务端会返回明确结论，本页如实展示。
-->
<template>
  <view class="page">
    <!-- 提交表单 -->
    <view class="card">
      <view class="card__title">提交绑定申诉</view>
      <view class="seg">
        <text class="seg__i" :class="{ 'seg__i--on': appealType === 1 }" @click="appealType = 1">解绑</text>
        <text class="seg__i" :class="{ 'seg__i--on': appealType === 2 }" @click="appealType = 2">重新绑定</text>
      </view>
      <view v-if="appealType === 2" class="field">
        <text class="k">目标平台账号</text>
        <input class="v" v-model="targetUid" placeholder="要绑定到的平台账号标识" />
      </view>
      <button class="submit" type="primary" :loading="submitting" @click="submit">提交申诉</button>
      <view class="note">申诉将由运营核验处理。若双方账号都已有业务数据，按规则不受理绑定变更。</view>
    </view>

    <!-- 我的申诉 -->
    <view class="card">
      <view class="card__title">我的申诉</view>
      <view v-for="a in myAppeals" :key="a._id" class="ap">
        <view class="ap__l1">
          <text>{{ a.appeal_no }}</text>
          <text class="tag" :class="tagCls(a.status)">{{ labelOf(APPEAL_STATUS, a.status) }}</text>
        </view>
        <view class="ap__l2">{{ labelOf(APPEAL_TYPE, a.appeal_type) }} · {{ fmt(a.create_date) }}</view>
        <view class="ap__fail" v-if="a.fail_reason">{{ a.fail_reason }}</view>
      </view>
      <view v-if="!myAppeals.length" class="empty">暂无申诉记录</view>
    </view>
  </view>
</template>

<script setup lang="ts">
// @ts-ignore
import { fmtDateTime } from '@/common/grouporder/activity-time.js';
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { APPEAL_TYPE, APPEAL_STATUS, labelOf } from '@/common/grouporder/dict.js';

const appealType = ref(1);
const targetUid = ref('');
const submitting = ref(false);
const myAppeals = ref<any[]>([]);

// 统一格式 yyyy/mm/dd hh:mm（D-145）
const fmt = (ts: number) => fmtDateTime(ts);
const tagCls = (s: number) => (s === 3 ? 'tag--ok' : s === 4 ? 'tag--bad' : 'tag--wait');

const loadMine = async () => {
  myAppeals.value = ((await guarded(api.user.appealMyList({ page: 1, pageSize: 50 }))) || {}).list || [];
};

const submit = async () => {
  if (appealType.value === 2 && !targetUid.value.trim()) { uni.showToast({ title: '请填写目标账号', icon: 'none' }); return; }
  submitting.value = true;
  try {
    await guarded(api.user.appealSubmit({ appeal_type: appealType.value, target_account_uid: appealType.value === 2 ? targetUid.value.trim() : '' }));
    uni.showToast({ title: '已提交', icon: 'none' });
    targetUid.value = '';
    loadMine();
  } catch (e) {} finally { submitting.value = false; }
};

onShow(() => loadMine());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding: 20rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 28rpx; margin-bottom: 16rpx; }
.card__title { font-size: 30rpx; color: $go-ink; margin-bottom: 20rpx; }
.seg { display: flex; gap: 16rpx; margin-bottom: 20rpx; }
.seg__i { flex: 1; text-align: center; font-size: 26rpx; color: $go-text; padding: 16rpx 0; border: 1rpx solid $go-border; border-radius: 12rpx; }
.seg__i--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.field { margin-bottom: 20rpx; }
.k { font-size: 26rpx; color: $go-text; }
.v { margin-top: 12rpx; font-size: 28rpx; color: $go-ink; border-bottom: 1rpx solid $go-line; padding-bottom: 8rpx; }
.submit { margin: 0; font-size: 30rpx; }
.note { font-size: 22rpx; color: $go-muted; line-height: 1.7; margin-top: 16rpx; }
.ap { padding: 20rpx 0; border-bottom: 1rpx solid $go-soft; }
.ap__l1 { display: flex; justify-content: space-between; font-size: 28rpx; color: $go-ink; }
.ap__l2 { font-size: 24rpx; color: $go-muted; margin-top: 6rpx; }
.ap__fail { font-size: 24rpx; color: $go-red; margin-top: 6rpx; }
.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 40rpx 0; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag--ok { background: $go-primary-soft; color: $go-primary; }
.tag--bad { background: $go-red-soft; color: $go-red; }
.tag--wait { background: $go-orange-soft; color: $go-orange; }
</style>
