<!--
  M-14 确认订单

  职责：商品与数量、限购提示、收货信息选择、预计金额。
  D-060：送货上门选完整地址；自提只填姓名+电话，不进地址簿。
  陷阱 5：写操作「结果未知」先锁重复动作再查结果；同一下单意图复用幂等键，不新增订单。
  D-025：同一用户同一活动可多张有效订单，「再下一单」是新建。
-->
<template>
  <view class="page" v-if="loaded">
    <!-- 商品清单 -->
    <view class="sec">
      <view class="sec__title">商品</view>
      <view v-for="it in preview.items || []" :key="it.goods_id" class="line">
        <text class="line__name">{{ it.goods_name }}</text>
        <text class="line__qty">×{{ it.qty }}</text>
        <text class="line__amt">￥{{ fen2yuan(it.amount) }}</text>
      </view>
      <view v-for="u in preview.unavailable || []" :key="u.goods_id" class="line line--bad">
        <text class="line__name">{{ u.name }}</text>
        <text class="line__err">{{ errText(u) }}</text>
      </view>
    </view>

    <!-- 收货信息 -->
    <view class="sec">
      <view class="sec__title">{{ isSelfPick ? '自提联系人' : '收货信息' }}</view>
      <!-- 送货上门：选地址 -->
      <view v-if="!isSelfPick" class="addr" @click="chooseAddress">
        <block v-if="address">
          <view class="addr__line1">{{ address.name }} {{ address.mobile }}</view>
          <view class="addr__line2">{{ address.address }}</view>
        </block>
        <view v-else class="addr__empty">请选择收货地址 ›</view>
      </view>
      <!-- 自提：只填姓名电话 -->
      <block v-else>
        <view class="field"><text class="field__k">姓名</text><input class="field__v" v-model="selfName" placeholder="收货人姓名" /></view>
        <view class="field"><text class="field__k">电话</text><input class="field__v" v-model="selfMobile" type="number" placeholder="联系电话" /></view>
      </block>
    </view>

    <!-- 备注 -->
    <view class="sec">
      <view class="field"><text class="field__k">备注</text><input class="field__v" v-model="remark" placeholder="选填，≤200 字" maxlength="200" /></view>
    </view>

    <view class="bar">
      <view class="bar__sum">预计 <text class="bar__amt">￥{{ fen2yuan(preview.total_amount) }}</text></view>
      <button class="bar__go" type="primary" :loading="submitting" :disabled="!submittable" @click="submit">提交订单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const items = ref<any[]>([]);
const preview = ref<any>({});
const loaded = ref(false);
const address = ref<any>(null);
const selfName = ref('');
const selfMobile = ref('');
const remark = ref('');
const submitting = ref(false);
// 同一下单意图的幂等键：进入页面时生成一次，重试复用（陷阱 5）
const idempotentKey = ref('');

const isSelfPick = computed(() => preview.value.delivery_type === 2);
const submittable = computed(() => {
  if (!(preview.value.items || []).length) return false;
  if (isSelfPick.value) return !!selfName.value.trim() && !!selfMobile.value.trim();
  return !!address.value;
});

const errText = (u: any) => {
  const m: Record<string, string> = { GOODS_OFFLINE: '已下架', GOODS_OFF_SALE: '已停售', STOCK_NOT_ENOUGH: '库存不足', LIMIT_EXCEEDED: '超出限购' };
  return m[u.errCode] || '不可购买';
};

const doPreview = async () => {
  preview.value = (await guarded(api.order.orderPreview({ activity_id: activityId.value, items: items.value }))) || {};
  loaded.value = true;
};

const chooseAddress = () => {
  uni.navigateTo({
    url: '/pages/address/list?select=1',
    events: { picked: (a: any) => { address.value = a; } },
  });
};

const submit = async () => {
  if (!submittable.value || submitting.value) return;
  submitting.value = true;
  const params: any = {
    activity_id: activityId.value,
    items: items.value,
    buyer_remark: remark.value.trim(),
    idempotent_key: idempotentKey.value,
  };
  if (isSelfPick.value) {
    params.consignee_name = selfName.value.trim();
    params.consignee_mobile = selfMobile.value.trim();
  } else {
    params.address_id = address.value._id;
  }
  try {
    const data = (await guarded(api.order.orderCreate(params))) || {};
    uni.removeStorageSync('order_draft_items');
    uni.redirectTo({ url: '/pages/order/result?order_id=' + data.order_id + '&activity_id=' + activityId.value });
  } catch (e) {
    // 结果未知由 guarded 跳 M-26；其余错误已提示。幂等键不变，用户可安全重试
  } finally {
    submitting.value = false;
  }
};

onLoad((q: any = {}) => {
  activityId.value = q.activity_id || '';
  items.value = uni.getStorageSync('order_draft_items') || [];
  // 幂等键：一次下单意图固定一个（时间戳 + 随机）
  idempotentKey.value = 'od_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
});

onShow(async () => {
  if (!activityId.value || !items.value.length) return;
  await doPreview();
  // 送货上门默认带出默认地址
  if (!isSelfPick.value && !address.value) {
    try {
      const list = ((await api.user.addressList()) || {}).list || [];
      address.value = list.find((a: any) => a.is_default) || list[0] || null;
    } catch (e) {}
  }
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 140rpx; background: #f4f5f7; }
.sec { background: #fff; margin: 16rpx; border-radius: 16rpx; padding: 24rpx; }
.sec__title { font-size: 26rpx; color: #909399; margin-bottom: 16rpx; }
.line { display: flex; align-items: center; padding: 14rpx 0; font-size: 28rpx; color: #303133; }
.line__name { flex: 1; }
.line__qty { color: #909399; margin: 0 20rpx; }
.line__amt { color: #fa3534; }
.line--bad { opacity: 0.6; }
.line__err { color: #fa3534; font-size: 24rpx; }
.addr { padding: 12rpx 0; }
.addr__line1 { font-size: 30rpx; color: #303133; }
.addr__line2 { font-size: 26rpx; color: #606266; margin-top: 8rpx; }
.addr__empty { font-size: 28rpx; color: #909399; }
.field { display: flex; align-items: center; padding: 16rpx 0; border-top: 1rpx solid #f5f5f5; }
.field__k { width: 120rpx; font-size: 28rpx; color: #606266; }
.field__v { flex: 1; font-size: 28rpx; color: #303133; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 16rpx 24rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.bar__sum { flex: 1; font-size: 26rpx; color: #303133; }
.bar__amt { color: #fa3534; font-size: 32rpx; }
.bar__go { margin: 0; font-size: 30rpx; }
</style>
