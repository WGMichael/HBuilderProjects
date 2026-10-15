<!--
  M-28 从商品库添加（原名「复用历史商品」：列表是本人商品库的全部商品，含从未用过的，故改名）

  职责：按最近使用倒序展示本人商品库、多选复用、展示默认价格/库存/限购（库字段 last_*，复用时预填，不强制确认，D-092）、被下架不可选。
  红线②：分类只做筛选，仍逐件勾选，不做「按分类批量加入」「全选本分类」。
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

    <!-- 分类 chips（只筛选）-->
    <scroll-view class="chips" scroll-x>
      <text class="chip" :class="{ 'chip--on': categoryId === '' }" @click="pickCat('')">全部</text>
      <text v-for="c in categories" :key="c._id" class="chip" :class="{ 'chip--on': categoryId === c._id }" @click="pickCat(c._id)">{{ c.name }} {{ c.goods_count }}</text>
    </scroll-view>
    <view class="hint">分类只用于筛选，仍需逐件勾选。想照搬一整场请用「复用历史接龙」。</view>

    <scroll-view class="list" scroll-y @scrolltolower="loadMore">
      <view v-for="g in list" :key="g._id" class="g" :class="{ 'g--dis': !g.selectable || inActivity(g) }" @click="toggle(g)">
        <view class="g__check" :class="{ 'g__check--on': selected.has(g._id) }">{{ selected.has(g._id) ? '✓' : '' }}</view>
        <view class="g__main">
          <view class="g__name">{{ g.name }}<text v-if="g.is_recommend === 1" class="g__rec">推荐</text></view>
          <view class="g__meta g__meta--in" v-if="g.selectable && inActivity(g)">已在本次接龙中</view>
          <view class="g__meta" v-else-if="g.selectable">默认 ￥{{ fen2yuan(g.last_price) }} · 库存 {{ g.last_total_stock > 0 ? g.last_total_stock : '不限' }} · {{ g.last_per_user_limit > 0 ? '限购 ' + g.last_per_user_limit : '不限购' }}</view>
          <view class="g__meta g__meta--bad" v-else>该商品曾被平台下架或图片被拦截，不能继续使用</view>
          <view class="g__sub">用过 {{ g.use_count }} 次</view>
        </view>
      </view>
      <view v-if="!list.length && !loading" class="empty">商品库为空</view>
      <view v-if="list.length" class="list-foot">{{ loading ? '加载中…' : list.length < total ? '上滑加载更多' : '没有更多了' }}</view>
    </scroll-view>

    <view class="footer">
      <text class="footer__sum">已选 {{ selected.size }} 件</text>
      <button class="footer__go" type="primary" :disabled="!selected.size" :loading="adding" @click="addToActivity">加入本次接龙</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded, PartialFailedError } from '@/common/grouporder/request.js';
// @ts-ignore
import { safeBack } from '@/common/grouporder/nav.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const keyword = ref('');
const categoryId = ref('');
const categories = ref<any[]>([]);
const list = ref<any[]>([]);
const selected = ref<Set<string>>(new Set());
const adding = ref(false);
let eventChannel: any = null;

// 去重：本次接龙已有的商品按名称判断（库记录按「团长 + 名称」唯一；活动详情不对外返回 lib_id，
// 活动里改过名的少见情况由服务端按 lib_id 兜底）
const namesInActivity = ref<Set<string>>(new Set());
const inActivity = (g: any) => namesInActivity.value.has(String(g.name || '').trim());
const loadActivityGoods = async () => {
  if (!activityId.value) return;
  try {
    const a = (await api.activity.activityGetDetail({ activity_id: activityId.value }, { silent: true })) || {};
    const goods = a.goods || [];
    namesInActivity.value = new Set(goods.map((g: any) => String(g.name || '').trim()));
    // 已在活动里的不保留勾选
    selected.value = new Set([...selected.value].filter((id) => !list.value.some((g: any) => g._id === id && inActivity(g))));
  } catch (e) { /* 取不到就只靠服务端拦截 */ }
};

const loadCategories = async () => {
  categories.value = ((await guarded(api.goodsLib.categoryList())) || {}).list || [];
};
// 商品库不设上限：分页加载，滑到底取下一页
const PAGE_SIZE = 30;
const total = ref(0);
const loading = ref(false);
let page = 0;
let seq = 0; // 切换分类 / 搜索时丢弃上一轮未返回的结果
const fetchPage = async (more: boolean) => {
  const my = ++seq;
  const p = more ? page + 1 : 1;
  loading.value = true;
  try {
    const data = (await guarded(api.goodsLib.libList({ page: p, pageSize: PAGE_SIZE, keyword: keyword.value.trim(), category_id: categoryId.value }))) || {};
    if (my !== seq) return;
    list.value = more ? list.value.concat(data.list || []) : data.list || [];
    total.value = data.total || 0;
    page = p;
  } finally {
    if (my === seq) loading.value = false;
  }
};
const reload = () => fetchPage(false);
const loadMore = () => { if (!loading.value && list.value.length < total.value) fetchPage(true).catch(() => {}); };
const pickCat = (id: string) => { categoryId.value = id; reload(); };

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

const goManage = () => uni.navigateTo({ url: '/pages/lib/manage', events: { changed: () => { loadCategories(); reload(); } } });

onLoad((q: any = {}) => {
  activityId.value = q.activity_id || '';
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
});
onShow(async () => { loadCategories(); await reload(); loadActivityGoods(); });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; display: flex; flex-direction: column; }
.top { display: flex; align-items: center; padding: 16rpx 24rpx; background: #fff; }
.search { flex: 1; height: 64rpx; background: $go-canvas; border-radius: 32rpx; padding: 0 24rpx; font-size: 26rpx; }
.manage { margin-left: 20rpx; font-size: 26rpx; color: $go-primary; }
.chips { white-space: nowrap; background: #fff; padding: 16rpx 24rpx; }
.chip { display: inline-block; font-size: 24rpx; color: $go-text; padding: 8rpx 24rpx; border: 1rpx solid $go-border; border-radius: 32rpx; margin-right: 16rpx; }
.chip--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.hint { font-size: 22rpx; color: $go-muted; padding: 12rpx 24rpx; }
.list { flex: 1; padding: 0 20rpx; }
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
.footer { display: flex; align-items: center; padding: 16rpx 24rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.footer__sum { flex: 1; font-size: 26rpx; color: $go-ink; }
.footer__go { margin: 0; font-size: 30rpx; }
</style>
