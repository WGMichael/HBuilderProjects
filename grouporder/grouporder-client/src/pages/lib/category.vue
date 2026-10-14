<!--
  M-30 商品库分类管理

  职责：新建、重命名、删除、长按拖动排序；分类为用户私有，不进活动展示与清单；上限 20 个（D-066）。
  「未分组」不是分类记录，只展示件数，不能重命名或删除。
-->
<template>
  <!-- 拖动时锁住页面滚动，避免手指移动带着页面一起滚；page-meta 必须是页面第一个节点 -->
  <page-meta :page-style="dragIndex >= 0 ? 'overflow: hidden;' : ''" />
  <view class="page">

    <view class="pad">
      <view class="meta head">长按拖动调整顺序 · 分类顺序决定筛选栏的排列</view>

      <view v-if="categories.length" class="table">
        <view
          v-for="(c, i) in categories"
          :key="c._id"
          class="row"
          :class="{ 'row--drag': i === dragIndex }"
          :style="i === dragIndex ? 'transform: translateY(' + dragOffset + 'px);' : ''"
          @touchstart="onTouchStart"
          @longpress="onLongPress(i)"
          @touchmove="onTouchMove"
          @touchend="onTouchEnd"
          @touchcancel="onTouchEnd"
        >
          <text class="drag">⠿</text>
          <view class="row__main">
            <view class="row__name">{{ c.name }}</view>
            <view class="meta row__sub">{{ c.goods_count || 0 }} 件商品</view>
          </view>
          <text class="mini-btn" @click.stop="rename(c)">重命名</text>
          <text class="mini-btn mini-btn--gap" @click.stop="del(c)">删除</text>
        </view>
      </view>
      <view v-else class="empty">还没有分类</view>

      <view class="add" :class="{ 'add--dis': categories.length >= MAX }" @click="create">
        {{ categories.length >= MAX ? `最多 ${MAX} 个分类` : '＋ 新建分类' }}
      </view>

      <view class="fixed">
        <view class="fixed__line">
          <view>
            <view class="row__name">未分组</view>
            <view class="meta row__sub">{{ ungroupedCount }} 件商品</view>
          </view>
          <text class="tag">系统固定</text>
        </view>
        <view class="meta fixed__desc">未分组不是一条分类记录，而是「没有分类」的商品集合，不能重命名或删除。</view>
      </view>
    </view>

    <view class="notice">删除分类<text class="b">不会删除商品</text>，其下商品自动归入「未分组」。分类名 1–10 字，仅自己可见。</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';

const MAX = 20;
const categories = ref<any[]>([]);
const ungroupedCount = ref(0);
let eventChannel: any = null;

const load = async () => {
  const data = (await guarded(api.goodsLib.categoryList())) || {};
  categories.value = data.list || [];
  ungroupedCount.value = data.ungrouped_count || 0;
};
const notify = () => { if (eventChannel && eventChannel.emit) eventChannel.emit('changed'); };

const create = () => {
  if (categories.value.length >= MAX) return;
  uni.showModal({
    title: '新建分类', editable: true, placeholderText: '分类名称（1–10 字）',
    success: async (r: any) => { if (!r.confirm || !r.content.trim()) return; try { await guarded(api.goodsLib.categoryCreate({ name: r.content.trim() })); load(); notify(); } catch (e) {} },
  });
};
const rename = (c: any) => {
  uni.showModal({
    title: '重命名', editable: true, content: c.name,
    success: async (r: any) => { if (!r.confirm || !r.content.trim()) return; try { await guarded(api.goodsLib.categoryUpdate({ category_id: c._id, name: r.content.trim(), sort: c.sort })); load(); notify(); } catch (e) {} },
  });
};
const del = (c: any) => {
  uni.showModal({
    title: '删除分类', content: `删除「${c.name}」，其中的商品会变为未分组。`,
    success: async (r) => { if (!r.confirm) return; try { await guarded(api.goodsLib.categoryDelete({ category_id: c._id })); load(); notify(); } catch (e) {} },
  });
};

// ---------------- 长按拖动排序 ----------------
// 长按选中一行，手指上下移动按行高换位，松手后整体提交新顺序（categorySort 要求提交全部分类）
const dragIndex = ref(-1);
const dragOffset = ref(0); // 被拖行相对当前槽位的位移（px），用于跟手
let startY = 0;
let lastY = 0;
let rowHeight = 0;
let originIds = '';

const onTouchStart = (e: any) => {
  const t = e.touches && e.touches[0];
  startY = lastY = t ? t.clientY : 0;
};
const onLongPress = (i: number) => {
  uni.createSelectorQuery().select('.row').boundingClientRect((rect: any) => {
    rowHeight = (rect && rect.height) || 0;
  }).exec();
  originIds = categories.value.map((c) => c._id).join(',');
  startY = lastY;
  dragIndex.value = i;
  dragOffset.value = 0;
  uni.vibrateShort({});
};
const onTouchMove = (e: any) => {
  const t = e.touches && e.touches[0];
  if (!t) return;
  lastY = t.clientY;
  if (dragIndex.value < 0 || !rowHeight) return;
  let offset = lastY - startY;
  const from = dragIndex.value;
  // 越过半行就和相邻行换位，换位后以新槽位为基准继续计算
  if (offset > rowHeight / 2 && from < categories.value.length - 1) {
    swap(from, from + 1);
    startY += rowHeight;
    offset -= rowHeight;
  } else if (offset < -rowHeight / 2 && from > 0) {
    swap(from, from - 1);
    startY -= rowHeight;
    offset += rowHeight;
  }
  dragOffset.value = offset;
};
const swap = (a: number, b: number) => {
  const arr = categories.value.slice();
  const tmp = arr[a];
  arr[a] = arr[b];
  arr[b] = tmp;
  categories.value = arr;
  dragIndex.value = b;
};
const onTouchEnd = async () => {
  if (dragIndex.value < 0) return;
  dragIndex.value = -1;
  dragOffset.value = 0;
  const ids = categories.value.map((c) => c._id);
  if (ids.join(',') === originIds) return;
  try {
    await guarded(api.goodsLib.categorySort({ category_ids: ids }));
    notify();
  } catch (e) {
    load(); // 提交失败恢复为服务端顺序
  }
};

onShow(() => {
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
  load();
});
</script>

<style lang="scss" scoped>

.page { min-height: 100vh; background: $go-canvas; padding-bottom: env(safe-area-inset-bottom); }
.pad { padding: 32rpx 32rpx 0; }
.meta { color: $go-muted; font-size: 22rpx; line-height: 1.55; }
.head { margin: 0 4rpx 22rpx; }

.table { background: #fff; border-radius: 28rpx; overflow: hidden; border: 1rpx solid $go-line; }
.row { display: flex; align-items: center; padding: 26rpx; border-bottom: 1rpx solid $go-line; background: #fff; position: relative; }
.row:last-child { border-bottom: 0; }
.row--drag { z-index: 2; background: $go-soft; box-shadow: 0 8rpx 28rpx rgba(22, 45, 33, 0.12); }
.drag { width: 40rpx; color: #c3ccc7; font-size: 30rpx; margin-right: 22rpx; }
.row__main { flex: 1; min-width: 0; }
.row__name { font-size: 28rpx; font-weight: 600; color: $go-ink; }
.row__sub { margin-top: 6rpx; }
.mini-btn { border: 1rpx solid $go-border; color: $go-ink; background: #fff; border-radius: 18rpx; padding: 12rpx 20rpx; font-size: 22rpx; }
.mini-btn--gap { margin-left: 12rpx; }

.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 60rpx 0; background: #fff; border-radius: 28rpx; border: 1rpx solid $go-line; }
.add { margin-top: 24rpx; min-height: 88rpx; display: flex; align-items: center; justify-content: center; border-radius: 24rpx; background: #fff; color: $go-primary-dark; border: 1rpx dashed #bed5c7; font-size: 28rpx; font-weight: 600; }
.add--dis { color: $go-placeholder; border-color: $go-line; }

.fixed { margin-top: 28rpx; background: $go-soft; border: 1rpx solid $go-line; border-radius: 32rpx; padding: 30rpx; }
.fixed__line { display: flex; align-items: flex-start; justify-content: space-between; }
.fixed__desc { margin-top: 12rpx; }
.tag { border-radius: 999rpx; padding: 6rpx 16rpx; font-size: 20rpx; font-weight: 600; background: $go-tag-bg; color: $go-tag-text; }

.notice { margin: 24rpx 32rpx 32rpx; border-radius: 24rpx; padding: 22rpx 24rpx; font-size: 22rpx; line-height: 1.55; color: $go-orange-text; background: $go-orange-soft; }
.b { font-weight: 700; }
</style>
