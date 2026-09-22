<!--
  M-26 统一状态结果态组件

  六类结果态：不存在 / 无权 / 已截止 / 已取消 / 已下架 / 网络或结果未知。
  各业务页遇到对象级错误统一跳到 M-26（见 common/grouporder/request.js），不各页自画。
-->
<template>
  <view class="go-result">
    <view class="go-result__icon" :style="{ color: current.color }">{{ current.symbol }}</view>
    <view class="go-result__title">{{ current.title }}</view>
    <view class="go-result__desc">{{ detail || current.desc }}</view>
    <view class="go-result__actions">
      <button v-if="type === 'unknown'" class="go-result__btn go-result__btn--primary" size="mini" @click="retry">重试</button>
      <button class="go-result__btn" size="mini" @click="back">返回</button>
      <button class="go-result__btn" size="mini" @click="home">回到接龙</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps({
  // not_found | forbidden | closed | cancelled | offline | unknown
  type: { type: String, default: 'unknown' },
  detail: { type: String, default: '' },
});

const emit = defineEmits(['retry']);

const MAP = {
  not_found: { symbol: '∅', color: '#909399', title: '内容不存在', desc: '该活动或订单不存在，或已被删除。' },
  forbidden: { symbol: '⊘', color: '#fa3534', title: '无权访问', desc: '你没有查看该内容的权限。敏感数据仅对相关方可见。' },
  closed: { symbol: '⏱', color: '#f3a73f', title: '活动已截止', desc: '该活动已截止，不能再新建或扩大订单，但仍可查看。' },
  cancelled: { symbol: '⊗', color: '#f3a73f', title: '活动已取消', desc: '该活动已被团长取消。' },
  offline: { symbol: '⚠', color: '#fa3534', title: '已被平台下架', desc: '该活动或商品已被平台下架，不能继续接龙。' },
  unknown: { symbol: '↻', color: '#909399', title: '网络异常或结果未知', desc: '没能确认操作结果。请勿重复提交，稍后重试以确认状态。' },
};

const current = computed(() => MAP[props.type] || MAP.unknown);

const retry = () => emit('retry');
const back = () => {
  const pages = getCurrentPages();
  if (pages.length > 1) uni.navigateBack();
  else home();
};
const home = () => uni.switchTab({ url: '/pages/hall/jielong' });
</script>

<style lang="scss" scoped>
.go-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 48rpx;
  &__icon {
    font-size: 120rpx;
    line-height: 1;
    margin-bottom: 32rpx;
  }
  &__title {
    font-size: 36rpx;
    color: #303133;
    margin-bottom: 16rpx;
  }
  &__desc {
    font-size: 26rpx;
    color: #909399;
    line-height: 1.8;
    text-align: center;
    max-width: 560rpx;
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 48rpx;
    gap: 20rpx;
  }
  &__btn {
    margin: 0;
    font-size: 26rpx;
    color: #606266;
    background: #f5f5f5;
    &--primary {
      color: #fff;
      background: #2979ff;
    }
  }
}
</style>
