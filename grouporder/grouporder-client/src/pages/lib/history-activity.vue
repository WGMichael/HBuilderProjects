<!--
  M-31 历史接龙选择

  职责：单选已截止/已取消/进行中的活动作为复制源；进行中的提示「将创建新草稿，不影响当前活动」；
  草稿与被平台下架的活动不可作为源（D-067）。
  红线③：复制侧堵治理绕过——源活动中已下架的商品由服务端剔除并告知（activityCopy 返回 excluded）。
  D-067：新草稿标题不加「副本」；截止时间预填 = 当前 + (源 end_time − publish_date)。
-->
<template>
  <view class="page">
    <view class="hint">选择一场历史接龙整场照搬（含活动资料与全部商品）。进行中的活动作为源不影响原活动。</view>
    <view class="list">
      <view v-for="a in list" :key="a._id" class="a" :class="{ 'a--on': selectedId === a._id }" @click="select(a)">
        <image v-if="a.cover_image && a.cover_image.url" class="a__cover" :src="a.cover_image.url" mode="aspectFill" />
        <view class="a__main">
          <view class="a__title">{{ a.title }}</view>
          <view class="a__meta">
            <text class="tag tag--biz">{{ labelOf(ACTIVITY_STATUS, a.status) }}</text>
            <text> · {{ labelOf(DELIVERY_TYPE, a.delivery_type) }}</text>
          </view>
          <view v-if="a.status === 2" class="a__note">进行中：将创建新草稿，不影响当前活动</view>
        </view>
        <view class="a__radio" :class="{ 'a__radio--on': selectedId === a._id }"></view>
      </view>
      <view v-if="!list.length" class="empty">没有可作为复制源的历史接龙</view>
    </view>

    <view class="footer">
      <button class="go" type="primary" :disabled="!selectedId" :loading="copying" @click="doCopy">复制为新草稿</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ACTIVITY_STATUS, DELIVERY_TYPE, labelOf } from '@/common/grouporder/dict.js';

const list = ref<any[]>([]);
const selectedId = ref('');
const copying = ref(false);

const load = async () => {
  const data = (await guarded(api.activity.activityCopySourceList({ page: 1, pageSize: 100 }))) || {};
  list.value = data.list || [];
};
const select = (a: any) => { selectedId.value = a._id; };

const doCopy = async () => {
  if (!selectedId.value || copying.value) return;
  copying.value = true;
  try {
    const data = (await guarded(api.activity.activityCopy({ source_activity_id: selectedId.value }))) || {};
    const excluded = data.excluded || [];
    const goToEdit = () => uni.redirectTo({ url: '/pages/activity/edit?id=' + data.activity_id });
    if (excluded.length) {
      // 红线③：被下架商品已剔除并告知
      uni.showModal({
        title: '部分商品未复制',
        content: `以下 ${excluded.length} 件因违规已被下架，未包含在本次复制中：${excluded.map((e: any) => e.name).join('、')}`,
        showCancel: false,
        success: goToEdit,
      });
    } else {
      goToEdit();
    }
  } catch (e) {} finally { copying.value = false; }
};

onLoad((q: any = {}) => {
  // 从 M-09「再来一次」带 source 进入时，直接预选
  if (q.source) selectedId.value = q.source;
});
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding-bottom: 140rpx; }
.hint { font-size: 24rpx; color: #909399; padding: 24rpx; line-height: 1.6; }
.list { padding: 0 20rpx; }
.a { display: flex; align-items: center; background: #fff; border-radius: 16rpx; padding: 20rpx; margin-bottom: 12rpx; border: 2rpx solid transparent; }
.a--on { border-color: #2979ff; }
.a__cover { width: 100rpx; height: 100rpx; border-radius: 12rpx; margin-right: 20rpx; }
.a__main { flex: 1; min-width: 0; }
.a__title { font-size: 30rpx; color: #303133; }
.a__meta { font-size: 24rpx; color: #909399; margin-top: 8rpx; }
.a__note { font-size: 22rpx; color: #f3a73f; margin-top: 8rpx; }
.a__radio { width: 36rpx; height: 36rpx; border: 2rpx solid #dcdfe6; border-radius: 50%; flex-shrink: 0; }
.a__radio--on { border-color: #2979ff; background: radial-gradient(#2979ff 40%, #fff 44%); }
.tag { display: inline-block; font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag--biz { background: #e8f3ff; color: #2979ff; }
.empty { text-align: center; color: #909399; font-size: 26rpx; padding: 100rpx 0; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.go { margin: 0; font-size: 30rpx; }
</style>
