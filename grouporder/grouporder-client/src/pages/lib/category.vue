<!--
  M-30 商品库分类管理

  职责：新建、重命名、删除、排序；分类为用户私有，不进活动展示与清单；上限 20 个（D-066）。
-->
<template>
  <view class="page">
    <view class="hint">分类仅用于整理你的商品库，不出现在活动与清单中。最多 {{ MAX }} 个。</view>

    <view class="list">
      <view v-for="c in categories" :key="c._id" class="c">
        <text class="c__name">{{ c.name }}</text>
        <text class="c__count">{{ c.goods_count }} 件</text>
        <text class="op" @click="rename(c)">重命名</text>
        <text class="op op--del" @click="del(c)">删除</text>
      </view>
      <view v-if="!categories.length" class="empty">还没有分类</view>
    </view>

    <view class="footer">
      <button class="add" type="primary" :disabled="categories.length >= MAX" @click="create">＋ 新建分类</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';

const MAX = 20;
const categories = ref<any[]>([]);
let eventChannel: any = null;

const load = async () => {
  categories.value = ((await guarded(api.goodsLib.categoryList())) || {}).list || [];
};
const notify = () => { if (eventChannel && eventChannel.emit) eventChannel.emit('changed'); };

const create = () => {
  if (categories.value.length >= MAX) return;
  uni.showModal({
    title: '新建分类', editable: true, placeholderText: '分类名称',
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

onShow(() => {
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
  load();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding-bottom: 140rpx; }
.hint { font-size: 24rpx; color: #909399; padding: 24rpx; line-height: 1.6; }
.list { background: #fff; }
.c { display: flex; align-items: center; padding: 28rpx; border-bottom: 1rpx solid #f5f5f5; }
.c__name { flex: 1; font-size: 30rpx; color: #303133; }
.c__count { font-size: 24rpx; color: #909399; margin-right: 24rpx; }
.op { font-size: 26rpx; color: #2979ff; margin-left: 20rpx; }
.op--del { color: #fa3534; }
.empty { text-align: center; color: #909399; font-size: 26rpx; padding: 80rpx 0; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.add { margin: 0; font-size: 30rpx; }
</style>
