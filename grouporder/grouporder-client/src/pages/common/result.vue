<!--
  M-26 统一状态结果页

  任何对象级错误（不存在 / 无权 / 已截止 / 已取消 / 已下架 / 结果未知）都跳到本页。
  由 common/grouporder/request.js 的 gotoResult 统一发起。
-->
<template>
  <view class="page">
    <go-result :type="type" :detail="detail" @retry="retry" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import GoResult from '@/components/go-result/go-result.vue';

const type = ref('unknown');
const detail = ref('');

onLoad((q: any = {}) => {
  if (q.type) type.value = q.type;
  if (q.detail) detail.value = decodeURIComponent(q.detail);
});

// 「结果未知」的重试：退回上一页由用户重新触发原操作（不在结果页保留原动作状态）
const retry = () => {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else uni.switchTab({ url: '/pages/hall/jielong' });
};
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #fff;
}
</style>
