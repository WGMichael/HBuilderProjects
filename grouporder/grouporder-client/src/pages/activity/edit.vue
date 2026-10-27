<!--
  M-10 编辑草稿 / 编辑已发布活动（非 tabBar 页；mode=edit 时标题为「编辑活动」，D-120）

  §4 约束 3：编辑草稿必须是非 tabBar 页面，从 M-09 用 navigateTo 带 activity_id 进入。
-->
<template>
  <view class="page">
    <!-- 拿到 id 后再挂载表单：表单在 setup 时按 activityId 读取草稿，小程序端子组件 setup 可能早于页面 onLoad -->
    <activity-form v-if="activityId" :activity-id="activityId" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import ActivityForm from '@/components/activity-form/activity-form.vue';

const activityId = ref('');
onLoad((q: any = {}) => {
  activityId.value = q.id || q.activity_id || '';
  // 从 M-20「⋯ → 编辑活动」进入的是已发布活动（D-120）
  if (q.mode === 'edit') uni.setNavigationBarTitle({ title: '编辑活动' });
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; }
</style>
