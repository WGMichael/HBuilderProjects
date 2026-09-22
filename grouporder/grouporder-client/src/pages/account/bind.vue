<!--
  M-05 账号与微信绑定

  职责：展示绑定状态、发起绑定或解绑申诉。
  D-030：一个微信只能绑一个平台账号，反之亦然。冲突场景走 M-07 申诉。
  D-029：账号不采集手机号，绑定关系只在微信与平台账号之间。
-->
<template>
  <view class="page">
    <view class="card">
      <view class="row"><text class="k">昵称</text><text class="v">{{ bind.nickname || '未设置' }}</text></view>
      <view class="row"><text class="k">用户名密码</text><text class="v">{{ bind.has_username ? '已设置' : '未设置' }}</text></view>
      <view class="row">
        <text class="k">微信绑定</text>
        <text class="v" :class="bind.wechat_bound ? 'v--ok' : 'v--off'">{{ bind.wechat_bound ? '已绑定' : '未绑定' }}</text>
      </view>
    </view>

    <view class="tips">一个微信只能绑定一个平台账号，反之亦然。若微信已被其他账号绑定，或需要变更绑定，请提交账号申诉。</view>

    <view class="actions">
      <button v-if="!bind.has_username" class="btn" @click="setPwd">设置用户名密码</button>
      <button class="btn" @click="goAppeal">账号绑定申诉</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';

const bind = ref<any>({});
const load = async () => { bind.value = (await guarded(api.user.bindStatus())) || {}; };
const setPwd = () => uni.navigateTo({ url: '/uni_modules/uni-id-pages/pages/userinfo/set-pwd/set-pwd' });
const goAppeal = () => uni.navigateTo({ url: '/pages/account/appeal' });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 8rpx 28rpx; }
.row { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.k { font-size: 28rpx; color: #606266; }
.v { font-size: 28rpx; color: #303133; }
.v--ok { color: #18bc37; }
.v--off { color: #909399; }
.tips { font-size: 24rpx; color: #909399; line-height: 1.7; padding: 24rpx 8rpx; }
.actions { display: flex; flex-direction: column; gap: 16rpx; margin-top: 8rpx; }
.btn { margin: 0; font-size: 30rpx; background: #fff; color: #2979ff; }
</style>
