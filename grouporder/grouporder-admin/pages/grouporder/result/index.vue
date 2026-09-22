<!--
  A-02 访问结果页

  任何鉴权失败、会话失效、对象变化都跳到本页，不由各业务页自画提示。
  跳转由 common/grouporder/ops-co.js 的错误码分派统一发起。

  本页不要求登录态（pages.json 的 uniIdRouter.needLogin 已排除），
  否则会话失效时会被路由拦截，看不到「会话失效」这一结果态。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <text class="result-page__tip">访问结果</text>
      </view>
    </view>
    <view class="uni-container">
      <grouporder-result :type="type" :detail="detail" />
    </view>
    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>

<script setup>
  import { ref } from 'vue';
  import { onLoad } from '@dcloudio/uni-app';

  const type = ref('forbidden');
  const detail = ref('');

  onLoad((query = {}) => {
    if (query.type) {
      type.value = query.type;
    }
    if (query.detail) {
      detail.value = decodeURIComponent(query.detail);
    }
  });
</script>

<style lang="scss" scoped>
  .result-page__tip {
    font-size: 14px;
    color: #909399;
  }
</style>
