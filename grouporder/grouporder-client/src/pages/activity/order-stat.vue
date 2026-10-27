<!--
  M-21 团长订单与统计（已并入 M-20，D-115）

  订单明细与核销移到 M-20「接龙记录」tab，统计移到「统计」tab。本路由保留，旧链接与收藏进来时
  直接转到 M-20 对应的 tab：带 mark（unpaid / undelivered）时进接龙记录并预选子 tab，否则进统计。
-->
<template>
  <view class="page" />
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';

onLoad((q: any = {}) => {
  const id = q.id || '';
  const mark = q.mark === 'unpaid' || q.mark === 'undelivered' ? q.mark : '';
  const tab = mark ? 'records' : 'stat';
  uni.redirectTo({ url: `/pages/activity/manage?id=${id}&tab=${tab}${mark ? '&mark=' + mark : ''}` });
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; }
</style>
