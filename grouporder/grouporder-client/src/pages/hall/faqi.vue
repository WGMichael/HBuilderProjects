<!--
  发起接龙 tab（M-10 新建态）

  §4 约束 3：tab 恒为新建态，每次从其他 tab 切入都重置为空白，不残留上次内容。
  从子页（添加商品、商品库、复用、发布预览）返回不算「进入」，保留正在填写的表单（D-061）。
-->
<template>
  <view class="page">
    <activity-form ref="formRef" />
    <go-tabbar current="faqi" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import ActivityForm from '@/components/activity-form/activity-form.vue';
import GoTabbar from '@/components/go-tabbar/go-tabbar.vue';

const formRef = ref<any>(null);

// 切 tab 进入时清空，保证恒为新建态；从子页返回时保留表单、只刷新商品
onShow(() => {
  const form = formRef.value;
  if (!form) return;
  if (form.consumeChildReturn()) form.onChildReturn().catch(() => {});
  else form.reset();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 120rpx; background: #f4f5f7; }
</style>
