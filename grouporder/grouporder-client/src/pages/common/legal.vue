<!--
  用户服务协议 / 隐私政策（D-099）

  参数 type=service | privacy；正文在 common/grouporder/legal.js。
  用原生页面而不是外链网页：小程序打开外链需配置业务域名（个人主体不可配），H5 与小程序共用一套。
  入口：登录 / 注册页协议勾选（uni-id-pages config.agreements）、M-08「我的」页。
-->
<template>
  <view class="page">
    <view class="doc__title">{{ doc.title }}</view>
    <view class="doc__date">生效日期：{{ effectiveDate }}</view>
    <view v-for="(s, i) in doc.sections" :key="i" class="sec">
      <view v-if="s.h" class="sec__h">{{ s.h }}</view>
      <text v-for="(t, j) in s.p" :key="j" class="sec__p" user-select>{{ t }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
// @ts-ignore
import { LEGAL_DOCS, effectiveDate } from '@/common/grouporder/legal.js';

const doc = ref<any>(LEGAL_DOCS.service);

onLoad((q: any = {}) => {
  doc.value = LEGAL_DOCS[q.type] || LEGAL_DOCS.service;
  uni.setNavigationBarTitle({ title: doc.value.title });
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 40rpx 36rpx calc(60rpx + env(safe-area-inset-bottom)); background: #fff; box-sizing: border-box; }
.doc__title { font-size: 40rpx; font-weight: 700; color: $go-ink; text-align: center; }
.doc__date { font-size: 24rpx; color: $go-muted; text-align: center; margin: 12rpx 0 32rpx; }
.sec { margin-bottom: 28rpx; }
.sec__h { font-size: 30rpx; font-weight: 600; color: $go-ink; margin-bottom: 14rpx; }
.sec__p { display: block; font-size: 27rpx; line-height: 1.75; color: $go-text; margin-bottom: 12rpx; text-align: justify; }
</style>
