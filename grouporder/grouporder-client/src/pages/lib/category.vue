<!--
  M-30 商品库分类管理（固定两级：大类 → 小类）

  职责：新建 / 重命名 / 删除 / 升降排序；分类为用户私有，不进活动展示与清单（D-066）。
  上限：大类 50 个，每个大类下小类 100 个（服务端校验）。商品只能挂在小类下。
  删除规则（都不删商品）：
    - 删小类 = 其下商品归入「未分组」，小类记录硬删；
    - 删大类 = 连同其下小类一并删除，这些小类里的商品同样归入「未分组」。
  「未分类 / 未分组」是系统固定分组（category_id 为空的商品集合），不能重命名或删除。
  排序改用 ▲▼ 升降：两级行高不同，长按拖拽不可靠，升降按钮按层调用 categorySort。
  大类卡片可展开 / 收起（默认收起，点大类名切换），避免大类、小类多时页面过长；新建大类自带同名小类（D-151）。
-->
<template>
  <view class="page">
    <view class="pad">
      <view class="head">
        <text class="meta">用 ▲▼ 调整顺序 · 点大类名展开小类</text>
        <text v-if="parents.length" class="link" @click="toggleAll">{{ allOpen ? '全部收起' : '全部展开' }}</text>
      </view>

      <!-- 各大类 -->
      <view v-for="(p, pi) in parents" :key="p._id" class="group">
        <view class="group__head">
          <view class="group__main" @click="toggle(p._id)">
            <view class="group__name"><text class="fold">{{ isOpen(p._id) ? '▾' : '▸' }}</text>{{ p.name }}</view>
            <view class="meta">{{ p.children.length }} 个小类 · {{ p.goods_count || 0 }} 件商品</view>
          </view>
          <view class="ops">
            <text class="arrow" :class="{ 'arrow--dis': pi === 0 }" @click="moveParent(pi, -1)">▲</text>
            <text class="arrow" :class="{ 'arrow--dis': pi === parents.length - 1 }" @click="moveParent(pi, 1)">▼</text>
            <text class="mini-btn" @click="rename(p)">改名</text>
            <text class="mini-btn mini-btn--del" @click="delParent(p)">删除</text>
          </view>
        </view>

        <!-- 该大类下的小类（展开时才显示）-->
        <block v-if="isOpen(p._id)">
        <view v-for="(c, ci) in p.children" :key="c._id" class="child">
          <view class="child__main">
            <view class="child__name">{{ c.name }}</view>
            <view class="meta">{{ c.goods_count || 0 }} 件商品</view>
          </view>
          <view class="ops">
            <text class="arrow" :class="{ 'arrow--dis': ci === 0 }" @click="moveChild(p, ci, -1)">▲</text>
            <text class="arrow" :class="{ 'arrow--dis': ci === p.children.length - 1 }" @click="moveChild(p, ci, 1)">▼</text>
            <text class="mini-btn" @click="rename(c)">改名</text>
            <text class="mini-btn mini-btn--del" @click="delChild(c)">删除</text>
          </view>
        </view>
        <view v-if="!p.children.length" class="child child--empty">还没有小类</view>

        <view class="add add--sub" :class="{ 'add--dis': p.children.length >= MAX_CHILD }" @click="createChild(p)">
          {{ p.children.length >= MAX_CHILD ? `最多 ${MAX_CHILD} 个小类` : '＋ 在此大类下新建小类' }}
        </view>
        </block>
      </view>

      <view v-if="!parents.length" class="empty">还没有大类。新建大类时会自动带一个同名小类，之后可在其下继续新建小类。</view>

      <view class="add" :class="{ 'add--dis': parents.length >= MAX_PARENT }" @click="createParent">
        {{ parents.length >= MAX_PARENT ? `最多 ${MAX_PARENT} 个大类` : '＋ 新建大类' }}
      </view>

      <!-- 系统固定：未分类 / 未分组 -->
      <view class="fixed">
        <view class="fixed__line">
          <view>
            <view class="group__name">未分类 / 未分组</view>
            <view class="meta">{{ ungroupedCount }} 件商品</view>
          </view>
          <text class="tag">系统固定</text>
        </view>
        <view class="meta fixed__desc">「未分组」是「没有分类」的商品集合，不是一条分类记录，不能重命名或删除。删除分类后，其下商品会归入这里。</view>
      </view>
    </view>

    <view class="notice">删除分类<text class="b">不会删除商品</text>：删小类，其下商品归入「未分组」；删大类，会一并删掉其下小类，商品同样归入「未分组」。分类名 1–10 字，仅自己可见。</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';

const MAX_PARENT = 50;
const MAX_CHILD = 100;

const parents = ref<any[]>([]); // 真实大类（含 children 小类）
const ungroupedCount = ref(0);
let eventChannel: any = null;

// ---------------- 展开 / 收起 ----------------
// 记展开的大类 id；重新加载后保留（已删除的 id 留着无害）
const openIds = ref<string[]>([]);
const isOpen = (id: string) => openIds.value.includes(id);
const toggle = (id: string) => {
  openIds.value = isOpen(id) ? openIds.value.filter((x) => x !== id) : openIds.value.concat(id);
};
const allOpen = computed(() => parents.value.length > 0 && parents.value.every((p) => isOpen(p._id)));
const toggleAll = () => { openIds.value = allOpen.value ? [] : parents.value.map((p) => p._id); };

const load = async () => {
  const data = (await guarded(api.goodsLib.categoryList())) || {};
  const tree = data.tree || [];
  parents.value = tree.filter((p: any) => !p.is_virtual);
  ungroupedCount.value = data.ungrouped_count || 0;
};
const notify = () => { if (eventChannel && eventChannel.emit) eventChannel.emit('changed'); };

// ---------------- 新建 ----------------
const createParent = () => {
  if (parents.value.length >= MAX_PARENT) return;
  uni.showModal({
    title: '新建大类', editable: true, placeholderText: '大类名称（1–10 字）',
    success: async (r: any) => {
      if (!r.confirm || !r.content.trim()) return;
      try {
        const res = (await guarded(api.goodsLib.categoryCreate({ name: r.content.trim() }))) || {};
        if (res.category_id) openIds.value = openIds.value.concat(res.category_id); // 新大类展开，能看到自带的同名小类
        load(); notify();
      } catch (e) {}
    },
  });
};
const createChild = (p: any) => {
  if (p.children.length >= MAX_CHILD) return;
  uni.showModal({
    title: `在「${p.name}」下新建小类`, editable: true, placeholderText: '小类名称（1–10 字）',
    success: async (r: any) => {
      if (!r.confirm || !r.content.trim()) return;
      try {
        await guarded(api.goodsLib.categoryCreate({ name: r.content.trim(), parent_id: p._id }));
        if (!isOpen(p._id)) toggle(p._id);
        load(); notify();
      } catch (e) {}
    },
  });
};

// ---------------- 重命名 ----------------
const rename = (c: any) => {
  uni.showModal({
    title: '重命名', editable: true, content: c.name,
    success: async (r: any) => {
      if (!r.confirm || !r.content.trim()) return;
      try { await guarded(api.goodsLib.categoryUpdate({ category_id: c._id, name: r.content.trim() })); load(); notify(); } catch (e) {}
    },
  });
};

// ---------------- 删除 ----------------
const delParent = (p: any) => {
  uni.showModal({
    title: '删除大类',
    content: `删除「${p.name}」会一并删掉其下 ${p.children.length} 个小类；这些小类里的 ${p.goods_count || 0} 件商品会归入「未分组」（商品保留）。`,
    success: async (r: any) => {
      if (!r.confirm) return;
      try { await guarded(api.goodsLib.categoryDelete({ category_id: p._id })); load(); notify(); } catch (e) {}
    },
  });
};
const delChild = (c: any) => {
  uni.showModal({
    title: '删除小类', content: `删除「${c.name}」，其中的 ${c.goods_count || 0} 件商品会变为未分组（商品保留）。`,
    success: async (r: any) => {
      if (!r.confirm) return;
      try { await guarded(api.goodsLib.categoryDelete({ category_id: c._id })); load(); notify(); } catch (e) {}
    },
  });
};

// ---------------- 升降排序 ----------------
// 本地交换后提交该层级的完整顺序（categorySort 要求提交全部）；失败则回滚为服务端顺序
const moveParent = async (i: number, dir: number) => {
  const j = i + dir;
  if (j < 0 || j >= parents.value.length) return;
  const arr = parents.value.slice();
  [arr[i], arr[j]] = [arr[j], arr[i]];
  parents.value = arr;
  try {
    await guarded(api.goodsLib.categorySort({ category_ids: arr.map((p) => p._id) }));
    notify();
  } catch (e) { load(); }
};
const moveChild = async (p: any, i: number, dir: number) => {
  const j = i + dir;
  if (j < 0 || j >= p.children.length) return;
  const children = p.children.slice();
  [children[i], children[j]] = [children[j], children[i]];
  p.children = children;
  parents.value = parents.value.slice(); // 触发刷新
  try {
    await guarded(api.goodsLib.categorySort({ parent_id: p._id, category_ids: children.map((c: any) => c._id) }));
    notify();
  } catch (e) { load(); }
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
.head { display: flex; justify-content: space-between; align-items: center; margin: 0 4rpx 22rpx; }
.link { font-size: 24rpx; color: $go-primary; }
.fold { display: inline-block; width: 32rpx; color: $go-muted; font-size: 24rpx; }

.group { background: #fff; border-radius: 28rpx; border: 1rpx solid $go-line; margin-bottom: 24rpx; overflow: hidden; }
.group__head { display: flex; align-items: center; padding: 26rpx; background: $go-soft; }
.group__head + .child, .group__head + .add--sub { border-top: 1rpx solid $go-line; }
.group__main { flex: 1; min-width: 0; }
.group__name { font-size: 28rpx; font-weight: 700; color: $go-ink; }

.child { display: flex; align-items: center; padding: 22rpx 26rpx 22rpx 44rpx; border-bottom: 1rpx solid $go-line; }
.child:last-of-type { border-bottom: 0; }
.child__main { flex: 1; min-width: 0; }
.child__name { font-size: 27rpx; color: $go-ink; }
.child--empty { color: $go-placeholder; font-size: 24rpx; justify-content: center; }

.ops { display: flex; align-items: center; flex-shrink: 0; }
.arrow { width: 44rpx; height: 44rpx; line-height: 42rpx; text-align: center; color: $go-primary-dark; font-size: 24rpx; border: 1rpx solid $go-border; border-radius: 12rpx; margin-left: 10rpx; }
.arrow--dis { color: $go-placeholder; border-color: $go-line; }
.mini-btn { border: 1rpx solid $go-border; color: $go-ink; background: #fff; border-radius: 18rpx; padding: 12rpx 18rpx; font-size: 22rpx; margin-left: 10rpx; }
.mini-btn--del { color: $go-red; border-color: $go-red-soft; }

.add { margin-top: 8rpx; min-height: 88rpx; display: flex; align-items: center; justify-content: center; border-radius: 24rpx; background: #fff; color: $go-primary-dark; border: 1rpx dashed #bed5c7; font-size: 28rpx; font-weight: 600; margin-bottom: 24rpx; }
.add--sub { margin: 0; min-height: 76rpx; border-radius: 0; border: 0; border-top: 1rpx dashed $go-line; font-size: 25rpx; font-weight: 500; background: #fff; }
.add--dis { color: $go-placeholder; border-color: $go-line; }

.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 50rpx 20rpx; background: #fff; border-radius: 28rpx; border: 1rpx solid $go-line; margin-bottom: 24rpx; }

.fixed { margin-top: 4rpx; background: $go-soft; border: 1rpx solid $go-line; border-radius: 32rpx; padding: 30rpx; }
.fixed__line { display: flex; align-items: flex-start; justify-content: space-between; }
.fixed__desc { margin-top: 12rpx; }
.tag { border-radius: 999rpx; padding: 6rpx 16rpx; font-size: 20rpx; font-weight: 600; background: $go-tag-bg; color: $go-tag-text; }

.notice { margin: 24rpx 32rpx 32rpx; border-radius: 24rpx; padding: 22rpx 24rpx; font-size: 22rpx; line-height: 1.55; color: $go-orange-text; background: $go-orange-soft; }
.b { font-weight: 700; }
</style>
