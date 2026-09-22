<!--
  M-16 收货信息编辑

  职责：新增或编辑姓名、电话、完整地址、默认项。
  电话只存在于收货信息里，与账号体系无关（D-029）。
-->
<template>
  <view class="page">
    <view class="field"><text class="k">收货人 <text class="req">*</text></text><input class="v" v-model="form.name" placeholder="姓名" maxlength="50" /></view>
    <view class="field"><text class="k">电话 <text class="req">*</text></text><input class="v" v-model="form.mobile" type="number" placeholder="联系电话" maxlength="20" /></view>
    <view class="field"><text class="k">地址 <text class="req">*</text></text><textarea class="v v--area" v-model="form.address" placeholder="完整收货地址" maxlength="200" /></view>
    <view class="field field--row">
      <text class="k">设为默认</text>
      <switch :checked="form.is_default === 1" @change="onDefault" color="#2979ff" />
    </view>

    <view class="footer">
      <button v-if="addressId" class="del" @click="remove">删除</button>
      <button class="save" type="primary" :loading="saving" :disabled="!valid" @click="save">保存</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';

const addressId = ref('');
const saving = ref(false);
const form = ref<any>({ name: '', mobile: '', address: '', is_default: 0 });
let eventChannel: any = null;

const valid = computed(() => !!form.value.name.trim() && !!form.value.mobile.trim() && !!form.value.address.trim());
const onDefault = (e: any) => { form.value.is_default = e.detail.value ? 1 : 0; };

const load = async () => {
  const list = ((await guarded(api.user.addressList())) || {}).list || [];
  const a = list.find((x: any) => x._id === addressId.value);
  if (a) form.value = { name: a.name, mobile: a.mobile, address: a.address, is_default: a.is_default };
};

const save = async () => {
  if (!valid.value) return;
  saving.value = true;
  try {
    const payload = { name: form.value.name.trim(), mobile: form.value.mobile.trim(), address: form.value.address.trim(), is_default: form.value.is_default };
    if (addressId.value) await guarded(api.user.addressUpdate(Object.assign({ address_id: addressId.value }, payload)));
    else await guarded(api.user.addressCreate(payload));
    if (eventChannel && eventChannel.emit) eventChannel.emit('saved');
    uni.navigateBack();
  } catch (e) {} finally { saving.value = false; }
};

const remove = () => {
  uni.showModal({
    title: '删除收货信息', content: '删除不影响已下单的历史订单快照，确认删除？',
    success: async (r) => {
      if (!r.confirm) return;
      try { await api.user.addressDelete({ address_id: addressId.value }); if (eventChannel) eventChannel.emit('saved'); uni.navigateBack(); } catch (e) {}
    },
  });
};

onLoad((q: any = {}) => {
  addressId.value = q.id || '';
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
  if (addressId.value) load();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f4f5f7; padding: 20rpx; padding-bottom: 160rpx; }
.field { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.field--row { display: flex; align-items: center; justify-content: space-between; }
.k { font-size: 26rpx; color: #606266; }
.req { color: #fa3534; }
.v { margin-top: 12rpx; font-size: 30rpx; color: #303133; }
.v--area { width: 100%; height: 140rpx; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 16rpx; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.del { margin: 0; font-size: 30rpx; background: #fff; color: #fa3534; }
.save { flex: 1; margin: 0; font-size: 30rpx; }
</style>
