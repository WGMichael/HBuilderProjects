<!--
  M-22 团长商品管理（独立页）

  D-115 起主入口是 M-20 的「商品」tab；本页保留为同一面板（go-goods-panel）的独立承载，
  供商品编辑 / 从商品库添加在页面栈丢失（H5 刷新）时的返回兜底。
-->
<template>
  <!-- 拖动排序时锁住页面滚动（D-124）；page-meta 必须是页面第一个节点 -->
  <page-meta :page-style="dragging ? 'overflow: hidden;' : ''" />
  <view class="page">
    <go-goods-panel v-if="loaded" :act="act" @changed="load" @dragging="(v) => (dragging = v)" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
import GoGoodsPanel from '@/components/go-goods-panel/go-goods-panel.vue';

const activityId = ref('');
const act = ref<any>({});
const loaded = ref(false);
const dragging = ref(false);

const load = async () => {
  if (!activityId.value) return;
  try {
    act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
    loaded.value = true;
  } catch (e) { /* 提示由 guarded 给出 */ }
};

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; }
</style>
