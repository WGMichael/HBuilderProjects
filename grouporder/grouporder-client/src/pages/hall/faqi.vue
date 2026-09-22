<!--
  发起接龙 tab（M-10 新建态）

  §4 约束 3：tab 恒为新建态，每次进入都重置为空白，不残留上次内容。
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

// 每次切到该 tab 都清空，保证恒为新建态
onShow(() => {
  formRef.value && formRef.value.reset();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 120rpx; background: #f4f5f7; }
</style>
