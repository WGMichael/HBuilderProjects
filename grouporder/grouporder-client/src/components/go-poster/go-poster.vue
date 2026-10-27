<!--
  分享海报 · 居中弹窗（D-102，仅 H5）

  由 go-share-sheet 在复核通过后打开（与「复制链接」同一复核结果，未通过时不出海报）。
  海报用 common/grouporder/poster.js 画成 PNG，再放进【原生 <img>】：uni 的 <image> 在 H5 是背景图，
  微信里长按不出「保存图片 / 识别二维码」菜单，原生 img 才行。
  两个按钮（D-118）：
  - 保存图片：浏览器里直接下载；微信内置浏览器不支持下载，提示长按图片保存。
  - 分享海报：浏览器支持系统分享（navigator.share 传图片文件）时调起系统分享面板，可选微信发给朋友或发朋友圈；
    微信内置浏览器没有这个能力，H5 也调不起微信自己的分享面板，提示长按图片「发送给朋友」、保存后发朋友圈。
    小程序版本待 AppID 下来后改用 wx.showShareImageMenu 一键调起微信图片分享。
-->
<template>
  <uni-popup ref="popup" type="center" @change="onPopupChange">
    <view class="pt">
      <view v-if="state === 'loading'" class="pt__loading">
        <view class="pt__spinner" />
        <text>正在生成海报…</text>
      </view>
      <view v-else-if="state === 'fail'" class="pt__loading">{{ failReason }}</view>
      <!-- 原生 img 挂在这里（见文件头说明） -->
      <view v-show="state === 'ready'" ref="imgBox" class="pt__img" />
      <view v-if="state === 'ready'" class="pt__hint">长按图片保存到手机，或直接发送给朋友</view>
      <view v-if="state === 'ready' && !withCover" class="pt__sub">封面图片暂时无法放进海报，已使用默认样式</view>
      <view class="pt__btns">
        <button class="pt__btn" :disabled="state !== 'ready'" @click="save">保存图片</button>
        <button class="pt__btn pt__btn--primary" :disabled="state !== 'ready'" @click="share">分享海报</button>
      </view>
      <view class="pt__close" @click="close">关闭</view>
    </view>
  </uni-popup>
</template>

<script setup lang="ts">
import { ref } from 'vue';
// @ts-ignore
import { drawPoster } from '@/common/grouporder/poster.js';

const popup = ref<any>(null);
const imgBox = ref<any>(null);
const state = ref<'loading' | 'ready' | 'fail'>('loading');
const failReason = ref('');
const withCover = ref(true);
let dataUrl = '';
let fileName = '接龙海报.png';
let seq = 0;

// 微信内置浏览器不支持 a[download] 与系统分享，只能引导长按图片
const inWechat = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent || '');

const mountImage = (src: string) => {
  const box = imgBox.value && (imgBox.value.$el || imgBox.value);
  if (!box) return;
  box.innerHTML = '';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '接龙海报';
  img.style.cssText = 'display:block;width:100%;height:auto;border-radius:12px;';
  box.appendChild(img);
};

/** @param data 见 poster.js drawPoster 的入参 */
const open = async (data: any) => {
  const my = ++seq;
  state.value = 'loading';
  popup.value.open();
  fileName = '接龙海报-' + String(data.title || '').slice(0, 20) + '.png';
  try {
    // 让 loading 先渲染出来再开始画（绘制是同步的，会占住主线程）
    await new Promise((r) => setTimeout(r, 50));
    const res = await drawPoster(data);
    if (my !== seq) return;
    dataUrl = res.dataUrl;
    withCover.value = res.withCover;
    state.value = 'ready';
    mountImage(dataUrl);
  } catch (e: any) {
    if (my !== seq) return;
    console.error('[go-poster] 生成失败', e);
    failReason.value = '海报生成失败，请改用「复制链接」分享';
    state.value = 'fail';
  }
};
const close = () => popup.value && popup.value.close();
const tipLongPress = (title: string) => uni.showModal({
  title,
  content: '长按上方海报图片：选「发送给朋友」可直接发给好友或群；选「保存图片」后，可在微信朋友圈发布。',
  showCancel: false,
  confirmText: '知道了',
});

// 保存图片（D-118）：浏览器直接下载；微信里引导长按保存
const save = () => {
  if (!dataUrl) return;
  if (inWechat) return tipLongPress('长按图片保存');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// 分享海报（D-118）：系统分享面板（可选微信）；不支持时引导长按图片
const share = async () => {
  if (!dataUrl) return;
  if (inWechat) return tipLongPress('分享海报');
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: 'image/png' });
    const nav: any = navigator;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: fileName.replace(/\.png$/, '') });
      return;
    }
  } catch (e: any) {
    // 用户在系统面板里取消不算失败
    if (e && e.name === 'AbortError') return;
    console.warn('[go-poster] 系统分享失败', e);
  }
  uni.showModal({
    title: '分享海报',
    content: '当前浏览器不支持直接分享图片。请先点「保存图片」，再在微信里发给朋友或发朋友圈。',
    showCancel: false,
    confirmText: '知道了',
  });
};
const onPopupChange = (e: any) => {
  if (e.show) return;
  seq++;
  // 关闭即释放大图，避免反复生成占内存
  dataUrl = '';
  const box = imgBox.value && (imgBox.value.$el || imgBox.value);
  if (box) box.innerHTML = '';
};

defineExpose({ open, close });
</script>

<style lang="scss" scoped>
.pt { width: 620rpx; max-height: 86vh; overflow-y: auto; background: #fff; border-radius: 28rpx; padding: 28rpx; box-sizing: border-box; }
.pt__loading { display: flex; flex-direction: column; align-items: center; gap: 20rpx; padding: 120rpx 0; font-size: 24rpx; color: $go-muted; text-align: center; }
.pt__spinner { width: 44rpx; height: 44rpx; border-radius: 50%; border: 6rpx solid #dfe7e2; border-top-color: $go-primary; animation: pt-spin 0.8s linear infinite; }
@keyframes pt-spin { to { transform: rotate(360deg); } }
.pt__img { width: 100%; }
.pt__hint { text-align: center; font-size: 24rpx; color: $go-ink; margin-top: 20rpx; }
.pt__sub { text-align: center; font-size: 22rpx; color: $go-muted; margin-top: 8rpx; }
.pt__btns { display: flex; gap: 20rpx; margin-top: 24rpx; }
.pt__btn { flex: 1; margin: 0; border-radius: 24rpx; background: #f2f4f3; color: $go-text; font-size: 28rpx; }
.pt__btn--primary { background: $go-primary; color: #fff; }
.pt__btn[disabled] { opacity: 0.5; }
.pt__close { text-align: center; font-size: 24rpx; color: $go-muted; padding: 20rpx 0 0; }
.pt__btn::after { border: none; }
</style>
