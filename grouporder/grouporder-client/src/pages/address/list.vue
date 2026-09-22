<!--
  M-15 收货信息选择

  职责：列出全部收货信息、默认项、选择 / 新增 / 编辑。
  select=1 时为「从确认订单进入选一个」，选中后 emit picked 回 M-14。
-->
<template>
  <view class="page">
    <view v-if="!loading && !list.length" class="empty">还没有收货信息</view>
    <view v-for="a in list" :key="a._id" class="item" @click="pick(a)">
      <view class="item__main">
        <view class="item__line1">
          {{ a.name }} <text class="item__mobile">{{ a.mobile }}</text>
          <text v-if="a.is_default" class="item__def">默认</text>
        </view>
        <view class="item__line2">{{ a.address }}</view>
      </view>
      <text class="item__edit" @click.stop="edit(a)">编辑</text>
    </view>

    <view class="footer">
      <button class="add" type="primary" @click="add">新增收货信息</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';

const list = ref<any[]>([]);
const loading = ref(false);
const selectMode = ref(false);
let eventChannel: any = null;

const load = async () => {
  loading.value = true;
  try {
    list.value = ((await guarded(api.user.addressList())) || {}).list || [];
  } catch (e) { list.value = []; } finally { loading.value = false; }
};

const pick = (a: any) => {
  if (!selectMode.value) { edit(a); return; }
  if (eventChannel && eventChannel.emit) eventChannel.emit('picked', a);
  uni.navigateBack();
};
const edit = (a: any) => uni.navigateTo({ url: '/pages/address/edit?id=' + a._id, events: { saved: () => load() } });
const add = () => uni.navigateTo({ url: '/pages/address/edit', events: { saved: () => load() } });

onLoad((q: any = {}) => {
  selectMode.value = q.select === '1';
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
});
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; padding-bottom: 140rpx; }
.empty { text-align: center; color: #909399; font-size: 26rpx; padding: 120rpx 0; }
.item { display: flex; align-items: center; background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.item__main { flex: 1; min-width: 0; }
.item__line1 { font-size: 30rpx; color: #303133; }
.item__mobile { color: #606266; margin-left: 12rpx; }
.item__def { font-size: 20rpx; color: #2979ff; background: #e8f3ff; padding: 2rpx 12rpx; border-radius: 8rpx; margin-left: 12rpx; }
.item__line2 { font-size: 26rpx; color: #909399; margin-top: 10rpx; }
.item__edit { font-size: 26rpx; color: #2979ff; padding-left: 16rpx; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.add { margin: 0; font-size: 30rpx; }
</style>
