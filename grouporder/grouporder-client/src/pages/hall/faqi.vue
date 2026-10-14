<!--
  发起接龙 tab（M-10 新建态）

  §4 约束 3：tab 恒为新建态，每次从其他 tab 切入都重置为空白，不残留上次内容。
  从子页（添加商品、商品库、复用、发布预览）返回不算「进入」，保留正在填写的表单（D-061）。
-->
<template>
  <view class="page">
    <activity-form ref="formRef" with-tabbar />
    <go-tabbar current="faqi" />
  </view>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { onShow, onReady } from '@dcloudio/uni-app';
import ActivityForm from '@/components/activity-form/activity-form.vue';
import GoTabbar from '@/components/go-tabbar/go-tabbar.vue';
// @ts-ignore
import { takeCopySource } from '@/common/grouporder/draft.js';

const formRef = ref<any>(null);

/**
 * 每次显示时三选一：
 * 1. 有待复制的源活动（M-31「复制生成新的活动」，D-091）→ 按源预填，不生成记录；
 * 2. 从本页子页返回 → 保留表单、只刷新商品（D-061 v1.20）；
 * 3. 从其他 tab 切入 → 清空，恒为新建态。
 */
const applyShow = () => {
  const form = formRef.value;
  if (!form) return false;
  const src = takeCopySource();
  if (src) {
    form.consumeChildReturn(); // 从表单打开的 M-31 也会打子页标记，这里一并清掉
    form.loadCopySource(src).catch(() => {});
  } else if (form.consumeChildReturn()) {
    form.onChildReturn().catch(() => {});
  } else {
    form.reset();
  }
  return true;
};

// 首次 switchTab 进入时组件可能尚未挂载，延到下一帧 / onReady 再处理，避免漏掉待复制的源
onShow(async () => {
  if (applyShow()) return;
  await nextTick();
  applyShow();
});
onReady(() => {
  // onShow 时还拿不到组件、且源还没被消费：此时补处理
  if (formRef.value) {
    const src = takeCopySource();
    if (src) formRef.value.loadCopySource(src).catch(() => {});
  }
});
</script>

<style lang="scss" scoped>
/* 底部留白避开 fixed 的 go-tabbar：栏高 100rpx + 中间凸起 28rpx + 余量，再加安全区 */
.page { min-height: 100vh; padding-bottom: calc(140rpx + env(safe-area-inset-bottom)); background: $go-canvas; }
</style>
