<!--
  M-12 发布预览与结果

  职责：参与者视角预览、提交审核、审核中/不通过结果；通过后分享。
  D-057/D-043：队列来源由平台审核模式决定；D-058：图片异步检测不阻塞放行。
-->
<template>
  <go-result v-if="loadFailed" type="unknown" detail="页面加载失败，请检查网络后重试" @retry="load" />
  <view class="page" v-if="loaded">
    <view class="mode-bar">预览模式 · 下面是参与者将看到的活动内容</view>
    <view class="banner" :class="{ 'banner--bad': act.review_result === 2 && act.status === 0 }" v-if="statusText">{{ statusText }}</view>

    <!-- 发布前检查（仅草稿）：缺项标红并可去补；服务端 activitySubmitReview 会再校验一次 -->
    <view v-if="act.status === 0" class="check">
      <view class="check__title">发布前检查</view>
      <view v-for="c in checks" :key="c.key" class="check__row" :class="{ 'check__row--bad': !c.ok }" @click="!c.ok && fix(c)">
        <text class="check__icon">{{ c.ok ? '✓' : '!' }}</text>
        <text class="check__text">{{ c.text }}</text>
        <text v-if="!c.ok" class="check__go">去补充 ›</text>
      </view>
    </view>

    <!-- 参与者视角预览：与 M-13 共用组件，所见即所得 -->
    <go-activity-view :act="act" preview>
      <template #goods-ctrl>
        <text class="pv-tag">预览</text>
      </template>
    </go-activity-view>

    <view class="review-note" v-if="act.status === 0">
      提交后进入发布审核，按平台当前配置自动或人工审核；审核通过前活动不对外可见，也不能分享。审核中内容冻结，如需修改须先撤回。
    </view>

    <view class="footer">
      <template v-if="act.status === 0">
        <view class="footer__row">
          <button class="btn" @click="goBack">返回修改</button>
          <button class="btn btn--primary" type="primary" :loading="busy" :disabled="!allOk" @click="submit">提交审核</button>
        </view>
      </template>
      <template v-else-if="act.status === 1">
        <button class="btn" :loading="busy" @click="withdraw">撤回审核</button>
        <view class="note">审核中，通过后可分享。图片检测不阻塞放行。</view>
      </template>
      <template v-else-if="act.status === 2">
        <button v-if="canShare" class="btn btn--primary" type="primary" @click="openShare">分享给好友接龙</button>
        <view v-else class="note">活动已被平台下架，暂不能分享</view>
        <button class="btn" @click="goManage">去管理</button>
      </template>
      <template v-else>
        <button class="btn" @click="goManage">查看活动</button>
      </template>
    </view>

    <go-share-sheet ref="shareSheet" @ready="onShareReady" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import GoResult from '@/components/go-result/go-result.vue';
import { onLoad, onShow, onShareAppMessage } from '@dcloudio/uni-app';
// @ts-ignore
import { safeBack, backTo } from '@/common/grouporder/nav.js';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import GoActivityView from '@/components/go-activity-view/go-activity-view.vue';
import GoShareSheet from '@/components/go-share-sheet/go-share-sheet.vue';

const activityId = ref('');
const act = ref<any>({});
const loaded = ref(false);
const busy = ref(false);

/**
 * 发布前检查（D-041、D-077、D-084、D-087）：与服务端 activitySubmitReview 同一口径，
 * 只是把提示提前到预览页；fix 指出去哪补
 */
const checks = computed(() => {
  const a = act.value;
  const goods = a.goods || [];
  const now = Date.now();
  const noCover = goods.find((g: any) => !(g.cover_image && g.cover_image.url));
  const list = [
    { key: 'cover', ok: !!(a.cover_image && a.cover_image.url), text: '活动封面图', fix: 'form' },
    { key: 'goods', ok: goods.length > 0, text: '至少添加 1 个商品', fix: 'form' },
    { key: 'goodsCover', ok: goods.length > 0 && !noCover, text: noCover ? `商品「${noCover.name}」缺少封面图` : '每个商品都有封面图', fix: 'goods', goodsId: noCover && noCover._id },
    { key: 'end', ok: !!a.end_time && a.end_time > now, text: '截止时间晚于当前时间', fix: 'form' },
    { key: 'start', ok: !a.start_time || a.start_time < a.end_time, text: '起始时间早于截止时间', fix: 'form' },
  ];
  if ((a.delivery_types || []).includes(2)) {
    list.push({ key: 'pickup', ok: !!String(a.pickup_address || '').trim(), text: '已填写自提地址', fix: 'form' });
  }
  return list;
});
const allOk = computed(() => checks.value.every((c) => c.ok));

/** 去补缺项：商品封面进商品编辑；其余回活动表单（来自表单就直接返回，保留未保存内容） */
const fix = (c: any) => {
  if (c.fix === 'goods' && c.goodsId) {
    uni.navigateTo({ url: '/pages/activity/goods-edit?activity_id=' + activityId.value + '&goods_id=' + c.goodsId });
    return;
  }
  const pages = getCurrentPages();
  const prev: any = pages[pages.length - 2];
  const route = (prev && prev.route) || '';
  if (route.indexOf('pages/hall/faqi') === 0 || route.indexOf('pages/activity/edit') === 0) uni.navigateBack();
  else uni.navigateTo({ url: '/pages/activity/edit?id=' + activityId.value });
};

const statusText = computed(() => {
  if (act.value.status === 1) return '审核中';
  // 已通过但未到起始时间（D-087）
  if (act.value.status === 2 && act.value.not_started) return '已通过，' + fmt(act.value.start_time) + ' 开始';
  if (act.value.status === 2) return '已通过，进行中';
  if (act.value.review_result === 2) return '审核不通过：' + (act.value.review_reason || '');
  return '';
});

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const loadInner = async () => {
  if (!activityId.value) return;
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  loaded.value = true;
  await loadShareEntry();
};

// 加载失败（断网、非对象级错误）时给出重试，不白屏；对象级错误由 guarded 跳 M-26
const loadFailed = ref(false);
const load = async () => {
  loadFailed.value = false;
  try {
    await loadInner();
  } catch (e) {
    if (!loaded.value) loadFailed.value = true;
  }
};

const submit = async () => {
  if (busy.value) return; // 连点会让第二次请求撞上已变化的状态，被当成「结果未知」
  busy.value = true;
  try {
    const r = (await guarded(api.activity.activitySubmitReview({ activity_id: activityId.value }))) || {};
    uni.showToast({ title: r.auto_passed ? '已自动通过' : '已提交审核', icon: 'none' });
    await load();
  } catch (e) {} finally { busy.value = false; }
};

const withdraw = async () => {
  if (busy.value) return;
  busy.value = true;
  try {
    await guarded(api.activity.activityWithdrawReview({ activity_id: activityId.value }));
    await load();
  } catch (e) {} finally { busy.value = false; }
};

// —— 分享（SHARE_SPEC §4）——
// onShareAppMessage 的返回值不能是 Promise，微信要同步拿到卡片内容，
// 因此在活动进入「进行中」后预先取好服务端复核过的卡片数据，回调里同步读。
const shareEntry = ref<any>(null);

const canShare = computed(() => act.value.status === 2 && act.value.governance_status === 0);

const loadShareEntry = async () => {
  if (!canShare.value) { shareEntry.value = null; return; }
  try {
    shareEntry.value = await guarded(
      api.activity.activityGetShareEntry({ activity_id: activityId.value }),
      { silent: true }
    );
  } catch (e) {
    // 取不到就不发卡片，避免把已下架 / 已变更状态的活动转出去
    shareEntry.value = null;
  }
};

// 分享弹窗（效果图 share-mockup B / C 组）：复核通过后由组件给出卡片，onShareAppMessage 优先用它
const shareSheet = ref<any>(null);
const shareCard = ref<any>(null);
const openShare = () => shareSheet.value && shareSheet.value.open({ _id: activityId.value });
const onShareReady = (c: any) => { shareCard.value = c; };

onShareAppMessage(() => {
  if (shareCard.value) return shareCard.value;
  const e = shareEntry.value || {};
  return {
    title: e.title ? '接龙丨' + e.title : act.value.title || '',
    path: '/pages/activity/detail?id=' + activityId.value,
    // 封面为空时留空，由微信截取页面首屏兜底（AC-SH-010）
    imageUrl: (e.cover_image && e.cover_image.url) || '',
  };
});

const goBack = () => safeBack('/pages/activity/manage?id=' + activityId.value);
// 从管理页进来的直接退回去，避免栈里出现两层管理页
const goManage = () => backTo('pages/activity/manage', '/pages/activity/manage?id=' + activityId.value);

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 220rpx; background: $go-canvas; }
.mode-bar { font-size: 24rpx; color: $go-primary-dark; background: $go-primary-soft; padding: 18rpx 32rpx; }
.banner { background: $go-orange-soft; color: $go-orange; font-size: 26rpx; padding: 20rpx 32rpx; }
.banner--bad { background: $go-red-soft; color: $go-red; }
.check { background: #fff; margin: 24rpx 32rpx; border-radius: 32rpx; padding: 24rpx 30rpx; border: 1rpx solid $go-line; }
.check__title { font-size: 28rpx; font-weight: 600; color: $go-ink; margin-bottom: 8rpx; }
.check__row { display: flex; align-items: center; padding: 14rpx 0; font-size: 26rpx; color: $go-text; }
.check__icon { width: 36rpx; height: 36rpx; line-height: 36rpx; text-align: center; border-radius: 50%; font-size: 22rpx; margin-right: 16rpx; background: $go-primary-soft; color: $go-primary; }
.check__row--bad .check__icon { background: $go-red-soft; color: $go-red; }
.check__row--bad .check__text { color: $go-red; }
.check__text { flex: 1; }
.check__go { font-size: 24rpx; color: $go-primary; }
.pv-tag { font-size: 20rpx; padding: 6rpx 16rpx; border-radius: 999rpx; background: $go-tag-bg; color: $go-tag-text; }
.review-note { margin: 0 32rpx 24rpx; font-size: 22rpx; color: $go-muted; line-height: 1.6; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; display: flex; flex-direction: column; gap: 12rpx; }
.footer__row { display: flex; gap: 20rpx; }
.footer__row .btn { flex: 1; }
.footer__row .btn--primary { flex: 2; }
.btn { margin: 0; font-size: 30rpx; background: $go-soft; color: $go-text; }
.btn--primary { background: $go-primary; color: #fff; }
.note { font-size: 22rpx; color: $go-muted; text-align: center; }
</style>
