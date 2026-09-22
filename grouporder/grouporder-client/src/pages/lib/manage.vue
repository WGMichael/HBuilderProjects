<!--
  M-29 商品库管理（账号级）

  职责：列表、编辑内容与三项预填值（上次价格/库存/限购）、软删；被封禁记录不可编辑。
  红线⑥：lib_id 只用于治理定位，这里不联表读活动商品；商品库是独立于活动的模板集合。
-->
<template>
  <view class="page">
    <view class="top">
      <input class="search" v-model="keyword" placeholder="搜索商品名称" @confirm="reload" />
      <text class="manage" @click="goCategory">管理分类</text>
    </view>

    <scroll-view class="list" scroll-y>
      <view v-for="g in list" :key="g._id" class="g">
        <view class="g__main">
          <view class="g__name">{{ g.name }}<text v-if="g.governance_blocked === 1" class="tag tag--gov">已封禁</text></view>
          <view class="g__meta">上次 ￥{{ fen2yuan(g.last_price) }} · 库存 {{ g.last_total_stock > 0 ? g.last_total_stock : '不限' }} · {{ g.last_per_user_limit > 0 ? '限购 ' + g.last_per_user_limit : '不限购' }}</view>
          <view class="g__sub">用过 {{ g.use_count }} 次</view>
        </view>
        <view class="g__act" v-if="g.governance_blocked !== 1">
          <text class="op" @click="openEdit(g)">编辑</text>
          <text class="op op--del" @click="del(g)">删除</text>
        </view>
        <view class="g__act" v-else><text class="op op--dis">封禁记录不可编辑</text></view>
      </view>
      <view v-if="!list.length" class="empty">商品库为空。挑商品时点「加入本次接龙」会自动沉淀到这里。</view>
    </scroll-view>

    <!-- 编辑弹窗 -->
    <uni-popup ref="popup" type="bottom">
      <view class="sheet" v-if="editing">
        <view class="sheet__title">编辑商品</view>
        <view class="f"><text class="f__k">名称</text><input class="f__v" v-model="editing.name" maxlength="40" /></view>
        <view class="f"><text class="f__k">单位</text><input class="f__v" v-model="editing.unit" maxlength="10" /></view>
        <view class="f"><text class="f__k">上次价格(元)</text><input class="f__v" v-model="editPrice" type="digit" /></view>
        <view class="f"><text class="f__k">上次库存</text><input class="f__v" v-model.number="editing.last_total_stock" type="number" /></view>
        <view class="f"><text class="f__k">上次限购</text><input class="f__v" v-model.number="editing.last_per_user_limit" type="number" /></view>
        <view class="f"><text class="f__k">分类</text>
          <picker :range="catNames" :value="catIndex" @change="onCat"><text class="f__v">{{ catNames[catIndex] || '未分组' }} ›</text></picker>
        </view>
        <view class="sheet__act">
          <button class="btn" @click="closeEdit">取消</button>
          <button class="btn btn--primary" type="primary" :loading="saving" @click="saveEdit">保存</button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const keyword = ref('');
const list = ref<any[]>([]);
const categories = ref<any[]>([]);
const popup = ref<any>(null);
const editing = ref<any>(null);
const editPrice = ref('');
const catIndex = ref(0);
const saving = ref(false);
let eventChannel: any = null;

const catNames = ref<string[]>(['未分组']);

const reload = async () => {
  const data = (await guarded(api.goodsLib.libList({ page: 1, pageSize: 100, keyword: keyword.value.trim() }))) || {};
  list.value = data.list || [];
};
const loadCategories = async () => {
  categories.value = ((await guarded(api.goodsLib.categoryList())) || {}).list || [];
  catNames.value = ['未分组', ...categories.value.map((c) => c.name)];
};

const openEdit = (g: any) => {
  editing.value = { ...g };
  editPrice.value = fen2yuan(g.last_price);
  const idx = categories.value.findIndex((c) => c._id === g.category_id);
  catIndex.value = idx >= 0 ? idx + 1 : 0;
  popup.value.open();
};
const onCat = (e: any) => { catIndex.value = Number(e.detail.value); };
const closeEdit = () => { popup.value.close(); editing.value = null; };

const saveEdit = async () => {
  if (!editing.value) return;
  saving.value = true;
  try {
    const catId = catIndex.value === 0 ? '' : categories.value[catIndex.value - 1]._id;
    await guarded(api.goodsLib.libUpdate({
      lib_id: editing.value._id,
      name: editing.value.name,
      unit: editing.value.unit,
      last_price: Math.round(Number(editPrice.value || 0) * 100),
      last_total_stock: editing.value.last_total_stock || 0,
      last_per_user_limit: editing.value.last_per_user_limit || 0,
      description: editing.value.description || '',
      is_recommend: editing.value.is_recommend || 0,
      cover_image: editing.value.cover_image || null,
      detail_images: editing.value.detail_images || [],
      category_id: catId,
    }));
    closeEdit();
    reload();
    if (eventChannel && eventChannel.emit) eventChannel.emit('changed');
  } catch (e) {} finally { saving.value = false; }
};

const del = (g: any) => {
  uni.showModal({
    title: '删除商品', content: '软删后不再出现在选择列表；历史活动里已复制的商品不受影响（复制不是引用）。',
    success: async (r) => { if (!r.confirm) return; try { await guarded(api.goodsLib.libDelete({ lib_id: g._id })); reload(); if (eventChannel) eventChannel.emit('changed'); } catch (e) {} },
  });
};

const goCategory = () => uni.navigateTo({ url: '/pages/lib/category', events: { changed: () => loadCategories() } });

onShow(() => {
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
  loadCategories(); reload();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; display: flex; flex-direction: column; }
.top { display: flex; align-items: center; padding: 16rpx 24rpx; background: #fff; }
.search { flex: 1; height: 64rpx; background: #f4f5f7; border-radius: 32rpx; padding: 0 24rpx; font-size: 26rpx; }
.manage { margin-left: 20rpx; font-size: 26rpx; color: #2979ff; }
.list { flex: 1; padding: 16rpx 20rpx; }
.g { display: flex; align-items: center; background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 12rpx; }
.g__main { flex: 1; min-width: 0; }
.g__name { font-size: 28rpx; color: #303133; }
.g__meta { font-size: 24rpx; color: #909399; margin-top: 6rpx; }
.g__sub { font-size: 22rpx; color: #c0c4cc; margin-top: 4rpx; }
.g__act { display: flex; flex-direction: column; gap: 12rpx; }
.op { font-size: 26rpx; color: #2979ff; }
.op--del { color: #fa3534; }
.op--dis { color: #c0c4cc; font-size: 22rpx; }
.tag { font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; margin-left: 8rpx; }
.tag--gov { background: #fef0f0; color: #fa3534; }
.empty { text-align: center; color: #909399; font-size: 26rpx; padding: 100rpx 40rpx; line-height: 1.7; }
.sheet { background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 32rpx; }
.sheet__title { font-size: 30rpx; color: #303133; text-align: center; margin-bottom: 24rpx; }
.f { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.f__k { width: 180rpx; font-size: 26rpx; color: #606266; }
.f__v { flex: 1; font-size: 28rpx; color: #303133; }
.sheet__act { display: flex; gap: 16rpx; margin-top: 32rpx; }
.btn { flex: 1; margin: 0; font-size: 30rpx; background: #f5f5f5; color: #606266; }
.btn--primary { background: #2979ff; color: #fff; }
</style>
