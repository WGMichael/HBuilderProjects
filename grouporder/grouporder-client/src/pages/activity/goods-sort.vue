<!--
  管理排序（从「商品」tab 进入）

  职责：调整小类的先后，以及每个小类内商品的顺序。用 ▲▼ 升降，改完点「保存顺序」一次提交。
  只影响当前活动：仅重写本活动 grouporder-goods.sort（走 goodsSort），不碰账号级分类表，
  不影响商品库与其它活动；排序不算内容改动、不触发重审。
  保存口径：把「各小类段顺序 + 段内商品顺序」拼成完整 goods_ids 一次性提交（goodsSort 要求全量）。
  分段与买家详情一致：真实小类按当前顺序，未分类放最后。
-->
<template>
  <view class="page">
    <view class="hint">调整小类的先后，以及每个小类里商品的顺序；买家看到的顺序同步变化。只影响本次活动。</view>

    <view v-for="(grp, gi) in groups" :key="grp.key" class="sec">
      <view class="sec__head">
        <text class="sec__name" :class="{ 'sec__name--none': grp.key === '__none__' }">{{ grp.name }}<text class="sec__cnt">{{ grp.goods.length }}</text></text>
        <view class="ops">
          <text class="arrow" :class="{ 'arrow--dis': gi === 0 }" @click="moveSection(gi, -1)">▲</text>
          <text class="arrow" :class="{ 'arrow--dis': gi === groups.length - 1 }" @click="moveSection(gi, 1)">▼</text>
        </view>
      </view>
      <view v-for="(g, i) in grp.goods" :key="g._id" class="g">
        <text class="g__name">{{ g.name }}</text>
        <view class="ops">
          <text class="arrow" :class="{ 'arrow--dis': i === 0 }" @click="moveGood(gi, i, -1)">▲</text>
          <text class="arrow" :class="{ 'arrow--dis': i === grp.goods.length - 1 }" @click="moveGood(gi, i, 1)">▼</text>
        </view>
      </view>
    </view>

    <view v-if="!groups.length && loaded" class="empty">没有可排序的商品</view>

    <view class="footer">
      <button class="save" type="primary" :loading="saving" :disabled="!dirty || saving" @click="save">保存顺序</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { safeBack } from '@/common/grouporder/nav.js';

const activityId = ref('');
const groups = ref<any[]>([]);
const loaded = ref(false);
const saving = ref(false);
const originIds = ref('');
let eventChannel: any = null;

const flatIds = (): string[] => {
  const ids: string[] = [];
  for (const grp of groups.value) for (const g of grp.goods) ids.push(g._id);
  return ids;
};
const dirty = computed(() => flatIds().join(',') !== originIds.value);

const load = async () => {
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  const goods = data.goods || [];
  // 与买家详情同一分段口径：真实小类按首次出现顺序，未分类放最后
  const order: string[] = [];
  const buckets: Record<string, any[]> = {};
  const other: any[] = [];
  for (const g of goods) {
    const name = String(g.category_name || '').trim();
    if (!name) { other.push(g); continue; }
    if (!buckets[name]) { buckets[name] = []; order.push(name); }
    buckets[name].push(g);
  }
  const gs = order.map((n) => ({ key: n, name: n, goods: buckets[n] }));
  if (other.length) gs.push({ key: '__none__', name: '未分类', goods: other });
  groups.value = gs;
  originIds.value = flatIds().join(',');
  loaded.value = true;
};

const moveSection = (i: number, dir: number) => {
  const j = i + dir;
  if (j < 0 || j >= groups.value.length) return;
  const arr = groups.value.slice();
  [arr[i], arr[j]] = [arr[j], arr[i]];
  groups.value = arr;
};
const moveGood = (gi: number, i: number, dir: number) => {
  const j = i + dir;
  const goods = groups.value[gi].goods.slice();
  if (j < 0 || j >= goods.length) return;
  [goods[i], goods[j]] = [goods[j], goods[i]];
  groups.value[gi].goods = goods;
  groups.value = groups.value.slice(); // 触发刷新
};

const save = async () => {
  if (!dirty.value || saving.value) return;
  saving.value = true;
  try {
    await guarded(api.activity.goodsSort({ activity_id: activityId.value, goods_ids: flatIds() }));
    if (eventChannel && eventChannel.emit) eventChannel.emit('saved'); // 通知活动管理页重新加载商品
    uni.showToast({ title: '顺序已保存', icon: 'none' });
    setTimeout(() => safeBack('/pages/activity/manage?id=' + activityId.value + '&tab=goods'), 300);
  } catch (e) {
    /* goodsSort 失败（如期间有人增删商品，必须提交全量）：提示由 guarded 处理，留在本页可重进刷新 */
  } finally {
    saving.value = false;
  }
};

onLoad((q: any = {}) => {
  activityId.value = q.activity_id || '';
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
  load();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding: 24rpx 32rpx calc(140rpx + env(safe-area-inset-bottom)); }
.hint { font-size: 22rpx; color: $go-muted; line-height: 1.55; margin: 0 4rpx 20rpx; }

.sec { background: #fff; border-radius: 28rpx; border: 1rpx solid $go-line; margin-bottom: 24rpx; overflow: hidden; }
.sec__head { display: flex; align-items: center; justify-content: space-between; padding: 24rpx 26rpx; background: $go-soft; border-bottom: 1rpx solid $go-line; }
.sec__name { font-size: 27rpx; font-weight: 700; color: $go-ink; display: flex; align-items: center; }
.sec__name::before { content: ''; width: 6rpx; height: 26rpx; background: $go-primary; border-radius: 4rpx; margin-right: 14rpx; }
.sec__name--none::before { background: $go-orange; }
.sec__cnt { font-size: 22rpx; font-weight: 400; color: $go-muted; margin-left: 12rpx; }

.g { display: flex; align-items: center; justify-content: space-between; padding: 22rpx 26rpx 22rpx 44rpx; border-bottom: 1rpx solid $go-line; }
.g:last-child { border-bottom: 0; }
.g__name { flex: 1; min-width: 0; font-size: 28rpx; color: $go-ink; }

.ops { display: flex; align-items: center; flex-shrink: 0; }
.arrow { width: 56rpx; height: 56rpx; line-height: 54rpx; text-align: center; color: $go-primary-dark; font-size: 26rpx; border: 1rpx solid $go-border; border-radius: 12rpx; margin-left: 12rpx; }
.arrow--dis { color: $go-placeholder; border-color: $go-line; }

.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 80rpx 0; }

.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.save { margin: 0; font-size: 30rpx; }
</style>
