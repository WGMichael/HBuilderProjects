<!--
  M-28 从商品库添加（原名「复用历史商品」：列表是本人商品库的全部商品，含从未用过的，故改名）

  职责：按最近使用倒序展示本人商品库、多选复用、展示默认价格/库存/限购（库字段 last_*，复用时预填，不强制确认，D-092）、被下架不可选。
  全选（D-152，修订 D-066 红线②）：底栏「全选」一次勾上当前大类下所有可选商品（跳过不可选、已在本次接龙中的），
  先把未加载的分页拉全再选；按「50 − 本次接龙已有商品数」截断并提示，服务端 libCopyToActivity 仍兜底校验上限。
  入口 3：右上角「管理」跳 M-29，返回时本页刷新。
  去重：本次接龙已有同名商品，标「已在本次接龙中」不可选；服务端 libCopyToActivity
  另按同名与来源库记录（lib_id）双重拦截，前端只是提前告知。
-->
<template>
  <view class="page">
    <!-- 顶部：搜索 + 管理入口 -->
    <view class="top">
      <input class="search" v-model="keyword" placeholder="搜索商品名称" @confirm="reload" />
      <text class="manage" @click="goManage">管理</text>
    </view>

    <!-- 大类横向筛选（无「全部」）：真实大类 + 末尾未分类大类；小类在下面竖式分段 -->
    <scroll-view v-if="parentChips.length" class="chips" scroll-x>
      <text v-for="p in parentChips" :key="p._id" class="chip" :class="{ 'chip--on': parentId === p._id, 'chip--uncat': p._id === '__uncat__' }" @click="pickParent(p._id)">{{ p.name }} {{ p.goods_count }}</text>
    </scroll-view>
    <view class="hint">按小类分段展示，可逐件勾选，也可点底部「全选」选中当前大类的全部商品。</view>

    <scroll-view class="list" scroll-y @scrolltolower="loadMore">
      <view v-for="sec in sections" :key="sec.key" class="sec">
        <view class="sec-head" :class="{ 'sec-head--none': sec.key === '__none__' }">{{ sec.name }}</view>
        <view v-for="g in sec.goods" :key="g._id" class="g" :class="{ 'g--dis': !g.selectable || inActivity(g) }" @click="toggle(g)">
          <view class="g__check" :class="{ 'g__check--on': selected.has(g._id) }">{{ selected.has(g._id) ? '✓' : '' }}</view>
          <view class="g__main">
            <view class="g__name">{{ g.name }}<text v-if="g.is_recommend === 1" class="g__rec">推荐</text></view>
            <view class="g__meta g__meta--in" v-if="g.selectable && inActivity(g)">已在本次接龙中</view>
            <view class="g__meta" v-else-if="g.selectable">默认 ￥{{ fen2yuan(g.last_price) }} · 库存 {{ g.last_total_stock > 0 ? g.last_total_stock : '不限' }} · {{ g.last_per_user_limit > 0 ? '限购 ' + g.last_per_user_limit : '不限购' }}</view>
            <view class="g__meta g__meta--bad" v-else>该商品曾被平台下架或图片被拦截，不能继续使用</view>
            <view class="g__sub">用过 {{ g.use_count }} 次</view>
          </view>
        </view>
      </view>
      <view v-if="!sections.length && !loading" class="empty">
        <text>{{ keyword ? '没有匹配的商品' : (totalAll ? '这个大类下还没有商品' : '商品库还是空的') }}</text>
        <!-- D-154：商品库为空时引导先去配商品 -->
        <view v-if="!keyword && !totalAll" class="empty__go" @click="goManage">先去商品库添加商品 ›</view>
      </view>
      <view v-if="sections.length" class="list-foot">{{ loading ? '加载中…' : finished ? '没有更多了' : '上滑加载更多' }}</view>
    </scroll-view>

    <view class="footer">
      <view class="footer__all" @click="toggleAll">
        <view class="g__check" :class="{ 'g__check--on': allSelected }">{{ allSelected ? '✓' : '' }}</view>
        <text>全选</text>
      </view>
      <text class="footer__sum">已选 {{ selected.size }} 件</text>
      <button class="footer__go" type="primary" :disabled="!selected.size" :loading="adding" @click="addToActivity">加入本次接龙</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded, PartialFailedError } from '@/common/grouporder/request.js';
// @ts-ignore
import { safeBack } from '@/common/grouporder/nav.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const keyword = ref('');
// 分类：大类横向筛选（无「全部」）+ 末尾未分类大类；小类在列表里竖式分段。切大类是纯前端重分组
const UNCAT = '__uncat__';
const tree = ref<any[]>([]);
const leafCats = ref<any[]>([]);
const totalAll = ref(0);
const parentId = ref('');
const realParents = computed(() => tree.value.filter((p: any) => !p.is_virtual));
const curParent = computed(() => realParents.value.find((p: any) => p._id === parentId.value) || null);
const validLeafIds = computed(() => { const s = new Set<string>(); leafCats.value.forEach((c: any) => s.add(c._id)); return s; });
const uncatCount = computed(() => Math.max(0, totalAll.value - realParents.value.reduce((s: number, p: any) => s + (p.goods_count || 0), 0)));
const parentChips = computed(() => {
  const chips = realParents.value.map((p: any) => ({ _id: p._id, name: p.name, goods_count: p.goods_count }));
  chips.push({ _id: UNCAT, name: '未分类', goods_count: uncatCount.value }); // 始终显示
  return chips;
});
const list = ref<any[]>([]); // 关键词过滤后的全部商品池（不按大类过滤，大类分段在前端完成）
// 当前大类的小类竖式分段；未分类大类显示未分组 / 孤儿商品
const sections = computed(() => {
  if (parentId.value === UNCAT) {
    const none = list.value.filter((g: any) => !g.category_id || !validLeafIds.value.has(g.category_id));
    return none.length ? [{ key: '__none__', name: '未分类', goods: none }] : [];
  }
  const secs: any[] = [];
  const children = curParent.value ? curParent.value.children || [] : [];
  for (const c of children) {
    const goods = list.value.filter((g: any) => g.category_id === c._id);
    if (goods.length) secs.push({ key: c._id, name: c.name, goods });
  }
  return secs;
});
const selected = ref<Set<string>>(new Set());
const adding = ref(false);
let eventChannel: any = null;

// 去重：本次接龙已有的商品按名称判断（库记录按「团长 + 名称」唯一；活动详情不对外返回 lib_id，
// 活动里改过名的少见情况由服务端按 lib_id 兜底）
const namesInActivity = ref<Set<string>>(new Set());
const activityGoodsCount = ref(0); // 本次接龙已有商品数，全选时按 50 件上限截断（D-024）
const inActivity = (g: any) => namesInActivity.value.has(String(g.name || '').trim());
const loadActivityGoods = async () => {
  if (!activityId.value) return;
  try {
    const a = (await api.activity.activityGetDetail({ activity_id: activityId.value }, { silent: true })) || {};
    const goods = a.goods || [];
    namesInActivity.value = new Set(goods.map((g: any) => String(g.name || '').trim()));
    activityGoodsCount.value = goods.length;
    // 已在活动里的不保留勾选
    selected.value = new Set([...selected.value].filter((id) => !list.value.some((g: any) => g._id === id && inActivity(g))));
  } catch (e) { /* 取不到就只靠服务端拦截 */ }
};

const loadTree = async () => {
  const data = (await guarded(api.goodsLib.categoryList())) || {};
  tree.value = data.tree || [];
  leafCats.value = data.list || [];
  totalAll.value = data.total_goods || 0;
  // 选中的大类不存在时落到第一个可用大类（真实大类优先，否则未分类）
  const allowed = realParents.value.map((p: any) => p._id);
  allowed.push(UNCAT);
  if (!allowed.includes(parentId.value)) parentId.value = allowed[0] || UNCAT;
};
// 商品库不设上限：分页加载全部商品池（不按大类过滤，仅按关键词）；滑到底取下一页
const PAGE_SIZE = 30;
const total = ref(0);
const finished = ref(false);
const loading = ref(false);
let page = 0;
let seq = 0; // 搜索时丢弃上一轮未返回的结果
const fetchPage = async (more: boolean) => {
  const my = ++seq;
  const p = more ? page + 1 : 1;
  loading.value = true;
  try {
    const data = (await guarded(api.goodsLib.libList({ page: p, pageSize: PAGE_SIZE, keyword: keyword.value.trim() }))) || {};
    if (my !== seq) return;
    const rows = data.list || [];
    list.value = more ? list.value.concat(rows) : rows;
    total.value = data.total || 0;
    page = p;
    finished.value = list.value.length >= total.value || rows.length < PAGE_SIZE;
  } finally {
    if (my === seq) loading.value = false;
  }
};
const reload = () => fetchPage(false);
const loadMore = () => { if (!loading.value && !finished.value) fetchPage(true).catch(() => {}); };
// 切大类纯前端重分组，不重新请求（池里已是全部商品）
const pickParent = (id: string) => { parentId.value = id; };

// —— 全选当前大类（D-152）——
const MAX_GOODS_PER_ACTIVITY = 50; // 与服务端 D-024 一致
const candidates = computed(() => sections.value.reduce((arr: any[], sec: any) => arr.concat(sec.goods.filter((g: any) => g.selectable && !inActivity(g))), []));
const allSelected = computed(() => candidates.value.length > 0 && candidates.value.every((g: any) => selected.value.has(g._id)));
/** 把剩余分页拉全，保证「全选」不漏掉未加载的商品 */
const loadAll = async () => {
  while (!finished.value) {
    const before = list.value.length;
    await fetchPage(true);
    if (list.value.length === before) break; // 防御：没取到新数据就停，避免死循环
  }
};
const toggleAll = async () => {
  if (allSelected.value) {
    const s = new Set(selected.value);
    candidates.value.forEach((g: any) => s.delete(g._id));
    selected.value = s;
    return;
  }
  if (!finished.value) {
    uni.showLoading({ title: '加载全部商品', mask: true });
    try { await loadAll(); } catch (e) {} finally { uni.hideLoading(); }
  }
  const pool = candidates.value;
  if (!pool.length) { uni.showToast({ title: '当前大类没有可选的商品', icon: 'none' }); return; }
  const s = new Set(selected.value);
  const room = MAX_GOODS_PER_ACTIVITY - activityGoodsCount.value - s.size;
  let added = 0;
  for (const g of pool) {
    if (s.has(g._id)) continue;
    if (added >= room) break;
    s.add(g._id);
    added++;
  }
  selected.value = s;
  const missed = pool.filter((g: any) => !s.has(g._id)).length;
  if (missed) {
    uni.showModal({
      title: '已达商品上限',
      content: `一个接龙最多 ${MAX_GOODS_PER_ACTIVITY} 个商品，本次接龙已有 ${activityGoodsCount.value} 个，已为你选中其中 ${added} 件，还有 ${missed} 件未选。`,
      showCancel: false,
    });
  }
};

const toggle = (g: any) => {
  if (!g.selectable) { uni.showToast({ title: '该商品不可选', icon: 'none' }); return; }
  if (inActivity(g)) { uni.showToast({ title: '已在本次接龙中', icon: 'none' }); return; }
  const s = new Set(selected.value);
  s.has(g._id) ? s.delete(g._id) : s.add(g._id);
  selected.value = s;
};

const addToActivity = async () => {
  if (!selected.value.size) return;
  adding.value = true;
  // 复用进来的价格 / 库存 / 限购为默认值预填，不强制确认，团长需要时自行修改（D-092）
  const done = () => {
    if (eventChannel && eventChannel.emit) eventChannel.emit('added');
  };
  try {
    // 库记录刚被删 / 封禁（NOT_FOUND、FORBIDDEN）时只提示，不整页跳走
    await guarded(api.goodsLib.libCopyToActivity({ activity_id: activityId.value, lib_ids: [...selected.value] }), { stay: ['NOT_FOUND', 'FORBIDDEN'] });
    done();
    safeBack('/pages/activity/goods-manage?id=' + activityId.value);
  } catch (e: any) {
    // 部分失败：已加入的照常标记并通知刷新，失败的如实告知（不当作整体成功）
    if (e instanceof PartialFailedError) {
      done();
      uni.showModal({
        title: '部分商品未加入',
        content: `已加入 ${e.succeeded.length} 件，${e.failed.length} 件失败：${e.failed.map((f: any) => f.errMsg || f.errCode).join('；')}`,
        showCancel: false,
        success: () => safeBack('/pages/activity/goods-manage?id=' + activityId.value),
      });
    }
  } finally { adding.value = false; }
};

const goManage = () => uni.navigateTo({ url: '/pages/lib/manage', events: { changed: () => { loadTree(); reload(); } } });

onLoad((q: any = {}) => {
  activityId.value = q.activity_id || '';
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
});
onShow(async () => { loadTree(); await reload(); loadActivityGoods(); });
</script>

<style lang="scss" scoped>
/* H5 下 100vh 含导航栏高度，扣掉 --window-top，底栏才不会被挤出屏幕（小程序该变量为 0）*/
.page { height: calc(100vh - var(--window-top, 0px)); background: $go-canvas; display: flex; flex-direction: column; }
.top { display: flex; align-items: center; padding: 16rpx 24rpx; background: #fff; }
.search { flex: 1; height: 64rpx; background: $go-canvas; border-radius: 32rpx; padding: 0 24rpx; font-size: 26rpx; }
.manage { margin-left: 20rpx; font-size: 26rpx; color: $go-primary; }
.chips { white-space: nowrap; background: #fff; padding: 16rpx 24rpx; }
.chip { display: inline-block; font-size: 24rpx; color: $go-text; padding: 8rpx 24rpx; border: 1rpx solid $go-border; border-radius: 32rpx; margin-right: 16rpx; }
.chip--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.chip--uncat { color: $go-orange; }
.chip--uncat.chip--on { color: $go-orange-text; border-color: $go-orange; background: $go-orange-soft; }
.hint { font-size: 22rpx; color: $go-muted; padding: 12rpx 24rpx; }
.list { flex: 1; min-height: 0; padding: 0 20rpx; }
/* 小类小标题 */
.sec-head { display: flex; align-items: center; margin: 16rpx 4rpx 10rpx; font-size: 26rpx; font-weight: 700; color: $go-ink; }
.sec-head::before { content: ''; width: 6rpx; height: 26rpx; background: $go-primary; border-radius: 4rpx; margin-right: 12rpx; }
.sec-head--none::before { background: $go-orange; }
.g { display: flex; align-items: center; background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 12rpx; }
.g--dis { opacity: 0.5; }
.g__check { width: 40rpx; height: 40rpx; border: 2rpx solid $go-border; border-radius: 50%; text-align: center; line-height: 36rpx; color: #fff; margin-right: 20rpx; flex-shrink: 0; }
.g__check--on { background: $go-primary; border-color: $go-primary; }
.g__main { flex: 1; min-width: 0; }
.g__name { font-size: 28rpx; color: $go-ink; }
.g__rec { font-size: 20rpx; color: $go-orange; margin-left: 8rpx; }
.g__meta { font-size: 24rpx; color: $go-muted; margin-top: 6rpx; }
.g__meta--in { color: $go-primary; }
.g__meta--bad { color: $go-red; }
.g__sub { font-size: 22rpx; color: $go-placeholder; margin-top: 4rpx; }
.list-foot { text-align: center; font-size: 22rpx; color: $go-muted; padding: 16rpx 0 24rpx; }
.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 80rpx 0; }
.empty__go { display: inline-block; margin-top: 24rpx; padding: 16rpx 36rpx; border-radius: 999rpx; font-size: 26rpx; color: #fff; background: $go-primary; }
.footer { display: flex; align-items: center; padding: 20rpx 24rpx; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.footer__all { display: flex; align-items: center; font-size: 26rpx; color: $go-ink; margin-right: 24rpx; }
.footer__all .g__check { margin-right: 12rpx; }
.footer__sum { flex: 1; font-size: 26rpx; color: $go-ink; }
.footer__go { margin: 0; font-size: 30rpx; }
</style>
