<!--
  M-31 历史接龙选择

  职责：单选本人已截止的活动（自动截止与提前截止均可）作为复制源；
  草稿、审核中、进行中、已取消与被平台下架的活动不可作为源（D-085，取代 D-080）。
  D-091：本页只选源，点「复制生成新的活动」后切到「发起接龙」预填（不生成记录），
  团长保存草稿 / 确认发布或首次操作商品时才按源生成草稿（activityCopy）。
  红线③：源活动中已下架的商品在发起页提示并且不会复制（服务端 activityCopy 同样剔除）。
  D-067 / D-087：新活动标题不加「副本」；起始时间取当前，截止时间按源活动起止时长推算。
-->
<template>
  <view class="page">
    <view class="hint">选择一场已截止的接龙，复制它的活动资料与全部商品生成新的活动，不影响原活动。进入发起页后可继续修改，由你决定保存草稿还是确认发布。</view>
    <view class="list">
      <view v-for="a in list" :key="a._id" class="a" :class="{ 'a--on': selectedId === a._id }" @click="select(a)">
        <image v-if="a.cover_image && a.cover_image.url" class="a__cover" :src="a.cover_image.url" mode="aspectFill" />
        <view class="a__main">
          <view class="a__title">{{ a.title }}</view>
          <view class="a__meta">
            <text class="tag tag--biz">{{ labelOf(ACTIVITY_STATUS, a.status) }}</text>
            <text> · {{ deliveryText(a.delivery_types) }}</text>
          </view>
        </view>
        <view class="a__radio" :class="{ 'a__radio--on': selectedId === a._id }"></view>
      </view>
      <view v-if="!list.length" class="empty">没有已截止的接龙可作为复制源</view>
    </view>

    <view class="footer">
      <button class="go" type="primary" :disabled="!selectedId" @click="doCopy">复制生成新的活动</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { setCopySource } from '@/common/grouporder/draft.js';
// @ts-ignore
import { ACTIVITY_STATUS, deliveryText, labelOf } from '@/common/grouporder/dict.js';

const list = ref<any[]>([]);
const selectedId = ref('');

const load = async () => {
  const data = (await guarded(api.activity.activityCopySourceList({ page: 1, pageSize: 100 }))) || {};
  list.value = data.list || [];
};
const select = (a: any) => { selectedId.value = a._id; };

/**
 * 复制生成新的活动（D-091）：这里不调服务端、不生成任何记录，
 * 只把源活动交给「发起接龙」页预填；团长在发起页自行决定保存草稿或确认发布，
 * 那时才按源活动生成草稿（activityCopy，被下架商品照旧剔除）
 */
const doCopy = () => {
  if (!selectedId.value) return;
  setCopySource(selectedId.value);
  uni.switchTab({ url: '/pages/hall/faqi' });
};

onLoad((q: any = {}) => {
  // 从 M-09「再来一次」带 source 进入时，直接预选
  if (q.source) select({ _id: q.source });
});
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding-bottom: 140rpx; }
.hint { font-size: 24rpx; color: $go-muted; padding: 24rpx; line-height: 1.6; }
.list { padding: 0 20rpx; }
.a { display: flex; align-items: center; background: #fff; border-radius: 16rpx; padding: 20rpx; margin-bottom: 12rpx; border: 2rpx solid transparent; }
.a--on { border-color: $go-primary; }
.a__cover { width: 100rpx; height: 100rpx; border-radius: 12rpx; margin-right: 20rpx; }
.a__main { flex: 1; min-width: 0; }
.a__title { font-size: 30rpx; color: $go-ink; }
.a__meta { font-size: 24rpx; color: $go-muted; margin-top: 8rpx; }
.a__radio { width: 36rpx; height: 36rpx; border: 2rpx solid $go-border; border-radius: 50%; flex-shrink: 0; }
.a__radio--on { border-color: $go-primary; background: radial-gradient($go-primary 40%, #fff 44%); }
.tag { display: inline-block; font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag--biz { background: $go-primary-soft; color: $go-primary; }
.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 100rpx 0; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.go { margin: 0; font-size: 30rpx; }
</style>
