<!--
  分享到微信 · 底部弹窗（M-20 / M-13 / M-12 共用）

  效果图：prototype/share-mockup.html B 组。规格：SHARE_SPEC（本版只做微信转发卡片）。
  - open(act) 时先向服务端复核活动状态（activityGetDetail，团长与参与者都可调；读时补截止后状态即时准确），
    只有「进行中且未被下架」才展示卡片预览并允许转发；未开始的活动可分享（预热），额外提示开始时间。
  - 「转发给微信好友 / 群」是 open-type="share" 按钮，触发所在页面的 onShareAppMessage；
    卡片内容在复核通过时经 @ready 交给页面缓存，因为 onShareAppMessage 必须同步返回（SHARE_SPEC §4.3）。
  - 卡片：标题「接龙丨」+ 活动标题，图片为封面（微信按 5:4 裁切，为空时由微信截取页面首屏），path 只带 activity_id（D-083）。
  - 非微信小程序（H5，D-095）：没有原生转发，改为「复制链接」，复制「标题 + 活动页链接」由用户自己粘贴发给好友；
    链接按当前页面地址拼出（hash 路由），不写死域名。复核规则与小程序一致。
  - 生成海报（D-102、D-112，仅 H5）：不在弹窗里，由页面上与「分享到微信」并列的按钮调用 openPoster(act)；
    同样先复核（loading 提示，未通过弹窗说明原因），通过后用同一份活动信息画海报，二维码为上述链接；
    小程序版本待 AppID 下来后改用小程序码。
-->
<template>
  <uni-popup ref="popup" type="bottom" @change="onPopupChange">
    <view class="ss">
      <view class="ss__handle" />

      <!-- 复核未通过 -->
      <block v-if="state === 'fail'">
        <view class="ss__fail-icon">!</view>
        <view class="ss__title">暂时不能分享</view>
        <view class="ss__reason">{{ failReason }}</view>
        <button class="ss__cancel" @click="close">知道了</button>
      </block>

      <block v-else>
        <view class="ss__title">分享到微信</view>

        <view v-if="state === 'loading'" class="ss__loading">
          <view class="ss__spinner" />
          <text>正在确认活动状态…</text>
        </view>

        <block v-else>
          <!-- #ifdef MP-WEIXIN -->
          <!-- 卡片预览：好友在微信里收到的样子 -->
          <view class="wx-card">
            <view class="wx-card__title">{{ card.title }}</view>
            <image v-if="card.imageUrl" class="wx-card__img" :src="card.imageUrl" mode="aspectFill" />
            <view v-else class="wx-card__img wx-card__img--empty">未设置封面\n好友收到的卡片将显示活动页首屏</view>
            <view class="wx-card__foot"><text class="wx-card__dot" />群接龙</view>
          </view>
          <!-- #endif -->
          <!-- #ifndef MP-WEIXIN -->
          <!-- 链接预览：复制出去的内容 -->
          <view class="link-box">
            <view class="link-box__title">{{ card.title }}</view>
            <view v-if="info.short_code" class="link-box__code">活动码：{{ info.short_code }}</view>
            <view class="link-box__url">{{ shareUrl }}</view>
          </view>
          <!-- #endif -->
          <view class="ss__meta">{{ metaText }}</view>
          <view v-if="notStarted" class="ss__tip">活动还没开始：好友现在点开可以先看商品，{{ fmt(info.start_time) }} 后才能下单。</view>
          <!-- #ifndef MP-WEIXIN -->
          <view class="ss__hint">复制后粘贴到微信发给好友，好友点开即可选购</view>
          <!-- #endif -->
        </block>

        <!-- #ifdef MP-WEIXIN -->
        <button class="ss__wx" open-type="share" :disabled="state !== 'ready'" @click="onShareTap">转发给微信好友 / 群</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <button class="ss__wx" :disabled="state !== 'ready'" @click="copyLink">复制链接</button>
        <!-- #endif -->
        <button class="ss__cancel" @click="close">取消</button>
      </block>
    </view>
  </uni-popup>
  <!-- #ifdef H5 -->
  <go-poster ref="poster" />
  <!-- #endif -->
</template>

<script setup lang="ts">
// @ts-ignore
import { fmtDateTime } from '@/common/grouporder/activity-time.js';
import { computed, ref } from 'vue';
// @ts-ignore
import api from '@/common/grouporder/request.js';
// @ts-ignore
import { deliveryText } from '@/common/grouporder/dict.js';
// #ifdef H5
import GoPoster from '@/components/go-poster/go-poster.vue';
// #endif

const emit = defineEmits(['ready']);

const popup = ref<any>(null);
const state = ref<'loading' | 'ready' | 'fail'>('loading');
const failReason = ref('');
const info = ref<any>({});
let seq = 0; // 连续打开时丢弃过期的复核结果

// 统一格式 yyyy/mm/dd hh:mm（D-145）
const fmt = (ts: number) => fmtDateTime(ts);

const card = computed(() => ({
  title: info.value.title ? '接龙丨' + info.value.title : '',
  path: '/pages/activity/detail?id=' + (info.value._id || ''),
  imageUrl: (info.value.cover_image && info.value.cover_image.url) || '',
}));
/** 活动页的 H5 链接：按当前页面地址拼（hash 路由），换域名或部署路径无需改代码 */
const shareUrl = computed(() => {
  let base = '';
  // #ifdef H5
  base = location.origin + location.pathname;
  // #endif
  return base + '#' + card.value.path;
});
const notStarted = computed(() => !!info.value.not_started);
const metaText = computed(() => {
  const a = info.value;
  const parts: string[] = [];
  if (a.not_started && a.start_time) parts.push(fmt(a.start_time) + ' 开始');
  if (a.end_time) parts.push(fmt(a.end_time) + ' 截止');
  const n = (a.goods || []).filter((g: any) => g.governance_status !== 1).length;
  parts.push(n + ' 件商品');
  if ((a.delivery_types || []).length) parts.push(deliveryText(a.delivery_types));
  return parts.join(' · ');
});

/** 服务端状态 → 不能分享的原因；可分享返回空串（未开始也可分享，用于预热） */
const reasonOf = (a: any) => {
  if (a.governance_status === 1) return '活动已被平台下架，暂不能分享。已转发出去的卡片，好友点开会看到「已下架」提示，不能下单。';
  if (a.status === 3) return '活动已结束，不能再分享。';
  if (a.status === 4) return '活动已取消，不能再分享。';
  if (a.status !== 2) return '活动审核通过后才能分享。';
  return '';
};

/** 打开弹窗并复核；act 至少含 _id */
const open = async (act: any) => {
  const id = act && act._id;
  if (!id) return;
  const my = ++seq;
  state.value = 'loading';
  info.value = { _id: id };
  popup.value.open();
  try {
    // 静默调用：失败原因由弹窗自己展示，不跳结果页、不弹默认提示
    const a = (await api.activity.activityGetDetail({ activity_id: id }, { silent: true })) || {};
    if (my !== seq) return;
    info.value = a;
    const reason = reasonOf(a);
    if (reason) {
      failReason.value = reason;
      state.value = 'fail';
      return;
    }
    state.value = 'ready';
    emit('ready', card.value);
  } catch (e: any) {
    if (my !== seq) return;
    failReason.value = (e && (e.errMsg || e.message)) || '暂时无法确认活动状态，请稍后重试。';
    state.value = 'fail';
  }
};

const close = () => popup.value && popup.value.close();
// 点了转发：微信面板接管，弹窗随即收起
const onShareTap = () => { if (state.value === 'ready') setTimeout(close, 300); };
// 非小程序：复制「标题 + 链接」，由用户自己粘贴发给好友（D-095）
const copyLink = () => {
  if (state.value !== 'ready') return;
  uni.setClipboardData({
    // 带上活动码（D-104）：链接打不开时，好友可在「我参与的」按号查找
    data: card.value.title + (info.value.short_code ? '\n活动码：' + info.value.short_code : '') + '\n' + shareUrl.value,
    success: () => {
      close();
      uni.showToast({ title: '已复制，去微信粘贴给好友', icon: 'none' });
    },
    fail: () => uni.showModal({ title: '复制失败', content: '请长按选中上方链接手动复制', showCancel: false }),
  });
};
const onPopupChange = (e: any) => { if (!e.show) seq++; };

// 生成海报（D-102、D-112，仅 H5）：页面上与「分享到微信」并列的按钮直接调用，不经分享弹窗。
// 复核规则与 open 相同；复核期间 loading 遮罩，未通过弹窗说明原因
const poster = ref<any>(null);
let posterBusy = false;
const openPoster = async (act: any) => {
  const id = act && act._id;
  if (!id || posterBusy || !poster.value) return;
  posterBusy = true;
  uni.showLoading({ title: '正在确认活动状态', mask: true });
  try {
    const a = (await api.activity.activityGetDetail({ activity_id: id }, { silent: true })) || {};
    uni.hideLoading();
    const reason = reasonOf(a);
    if (reason) {
      uni.showModal({ title: '暂时不能生成海报', content: reason, showCancel: false });
      return;
    }
    // shareUrl 依赖 info（活动 id），先写入再取
    info.value = a;
    // 版式（D-117）：标题 + 截止时间一行、封面、二维码；不列商品与交付方式
    poster.value.open({
      title: a.title || '',
      coverUrl: (a.cover_image && a.cover_image.url) || '',
      // 封面直接加载跨域失败时，由云端代下载（仅团长可调；参与者侧调用失败即退回默认头图）
      loadCoverData: async () => {
        const r = (await api.activity.activityPosterCover({ activity_id: id }, { silent: true })) || {};
        return r.data_url || '';
      },
      endTime: a.end_time,
      url: shareUrl.value,
      shortCode: a.short_code || '',
    });
  } catch (e: any) {
    uni.hideLoading();
    uni.showModal({ title: '暂时不能生成海报', content: (e && (e.errMsg || e.message)) || '暂时无法确认活动状态，请稍后重试。', showCancel: false });
  } finally {
    posterBusy = false;
  }
};

defineExpose({ open, close, card, openPoster });
</script>

<style lang="scss" scoped>
.ss { background: #fff; border-radius: 44rpx 44rpx 0 0; padding: 40rpx 36rpx calc(48rpx + env(safe-area-inset-bottom)); }
.ss__handle { width: 68rpx; height: 8rpx; border-radius: 8rpx; background: #d8dfda; margin: -16rpx auto 32rpx; }
.ss__title { text-align: center; font-size: 34rpx; font-weight: 700; color: $go-ink; margin-bottom: 24rpx; }
.ss__loading { display: flex; flex-direction: column; align-items: center; gap: 20rpx; padding: 52rpx 0 20rpx; font-size: 24rpx; color: $go-muted; }
.ss__spinner { width: 44rpx; height: 44rpx; border-radius: 50%; border: 6rpx solid #dfe7e2; border-top-color: $go-primary; animation: ss-spin 0.8s linear infinite; }
@keyframes ss-spin { to { transform: rotate(360deg); } }
.wx-card { width: 460rpx; margin: 8rpx auto 0; background: #fff; border: 1rpx solid #e5e5e5; border-radius: 16rpx; padding: 20rpx 20rpx 16rpx; box-shadow: 0 12rpx 36rpx rgba(0, 0, 0, 0.06); }
.wx-card__title { font-size: 26rpx; line-height: 1.4; color: #1a1a1a; margin-bottom: 16rpx; }
.wx-card__img { display: block; width: 420rpx; height: 336rpx; border-radius: 8rpx; background: #e8eee9; }
.wx-card__img--empty { display: flex; align-items: center; justify-content: center; text-align: center; white-space: pre-line; padding: 0 32rpx; box-sizing: border-box; font-size: 22rpx; color: $go-muted; background: repeating-linear-gradient(45deg, #f2f4f3, #f2f4f3 16rpx, #e9edeb 16rpx, #e9edeb 32rpx); }
.wx-card__foot { display: flex; align-items: center; gap: 10rpx; margin-top: 14rpx; padding-top: 12rpx; border-top: 1rpx solid #f0f0f0; font-size: 20rpx; color: #8a8a8a; }
.wx-card__dot { width: 24rpx; height: 24rpx; border-radius: 50%; background: $go-primary; }
.link-box { margin: 8rpx 0 0; border-radius: 20rpx; padding: 22rpx 24rpx; background: #f5f7f6; border: 1rpx solid #e6ebe8; }
.link-box__title { font-size: 26rpx; font-weight: 600; color: $go-ink; margin-bottom: 10rpx; }
.link-box__code { font-size: 24rpx; color: $go-text; margin-bottom: 8rpx; }
.link-box__url { font-size: 22rpx; line-height: 1.5; color: $go-primary-dark; word-break: break-all; user-select: text; }
.ss__hint { text-align: center; font-size: 22rpx; color: $go-muted; margin-top: 16rpx; }
.ss__meta { text-align: center; font-size: 22rpx; color: $go-muted; margin-top: 20rpx; }
.ss__tip { margin-top: 24rpx; border-radius: 20rpx; padding: 18rpx 22rpx; font-size: 22rpx; line-height: 1.55; color: $go-primary-dark; background: $go-primary-soft; }
.ss__wx { margin: 32rpx 0 0; border-radius: 24rpx; background: #07c160; color: #fff; font-size: 28rpx; font-weight: 600; }
.ss__wx[disabled] { background: #9fe0bd !important; color: #fff !important; }
.ss__cancel { margin: 18rpx 0 0; border-radius: 24rpx; background: #f2f4f3; color: $go-text; font-size: 28rpx; }
.ss__wx::after, .ss__cancel::after { border: none; }
.ss__fail-icon { width: 92rpx; height: 92rpx; line-height: 92rpx; text-align: center; margin: 8rpx auto 24rpx; border-radius: 50%; font-size: 48rpx; color: $go-red; background: $go-red-soft; }
.ss__reason { text-align: center; font-size: 24rpx; line-height: 1.65; color: $go-muted; margin-bottom: 16rpx; }
</style>
