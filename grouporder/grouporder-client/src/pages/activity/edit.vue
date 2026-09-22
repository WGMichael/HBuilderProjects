<!--
  M-10 编辑草稿（非 tabBar 页）

  §4 约束 3：编辑草稿必须是非 tabBar 页面，从 M-09 用 navigateTo 带 activity_id 进入。
-->
<template>
  <view class="page">
    <activity-form :activity-id="activityId" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import ActivityForm from '@/components/activity-form/activity-form.vue';

const activityId = ref('');
onLoad((q: any = {}) => { activityId.value = q.id || q.activity_id || ''; });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; }
</style>
