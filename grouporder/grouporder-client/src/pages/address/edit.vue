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
      <!-- 地址簿始终保留一个默认项（D-046）：已是默认的不能直接关掉，在别的地址上设为默认即可更换 -->
      <switch :checked="form.is_default === 1" :disabled="wasDefault" @change="onDefault" color="#168a55" />
    </view>
    <view v-if="wasDefault" class="hint">这是默认地址。要更换默认，请在其他地址上打开「设为默认」。</view>

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
const wasDefault = ref(false);
let eventChannel: any = null;

const valid = computed(() => !!form.value.name.trim() && !!form.value.mobile.trim() && !!form.value.address.trim());
const onDefault = (e: any) => { form.value.is_default = e.detail.value ? 1 : 0; };

const load = async () => {
  const list = ((await guarded(api.user.addressList())) || {}).list || [];
  const a = list.find((x: any) => x._id === addressId.value);
  if (a) {
    form.value = { name: a.name, mobile: a.mobile, address: a.address, is_default: a.is_default };
    wasDefault.value = a.is_default === 1;
  }
};

const save = async () => {
  if (!valid.value) return;
  saving.value = true;
  try {
    const payload = { name: form.value.name.trim(), mobile: form.value.mobile.trim(), address: form.value.address.trim(), is_default: form.value.is_default };
    let id = addressId.value;
    if (id) await guarded(api.user.addressUpdate(Object.assign({ address_id: id }, payload)));
    else id = ((await guarded(api.user.addressCreate(payload))) || {}).address_id || '';
    // 带回保存后的地址：确认订单页 / 选择模式据此直接选中（D-096）
    if (eventChannel && eventChannel.emit) eventChannel.emit('saved', Object.assign({ _id: id, created: !addressId.value }, payload));
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
.page { min-height: 100vh; background: $go-canvas; padding: 20rpx; padding-bottom: 160rpx; }
.field { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.field--row { display: flex; align-items: center; justify-content: space-between; }
.k { font-size: 26rpx; color: $go-text; }
.hint { font-size: 22rpx; color: $go-muted; margin: -8rpx 8rpx 16rpx; }
.req { color: $go-red; }
.v { margin-top: 12rpx; font-size: 30rpx; color: $go-ink; }
.v--area { width: 100%; height: 140rpx; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 16rpx; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.del { margin: 0; font-size: 30rpx; background: #fff; color: $go-red; }
.save { flex: 1; margin: 0; font-size: 30rpx; }
</style>
