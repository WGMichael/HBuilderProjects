<!--
  M-14 确认订单

  职责：商品与数量、限购提示、收货信息选择、预计金额。
  D-060：送货上门选完整地址；自提只填姓名+电话，不进地址簿。
  陷阱 5：写操作「结果未知」先锁重复动作再查结果；同一下单意图复用幂等键，不新增订单。
  D-025：同一用户同一活动可多张有效订单，「再下一单」是新建。
  D-086：活动支持两种交付方式时由参与者在此选择，默认不替他选；只支持一种时不显示选择。
  改单模式（带 order_id）：预填本单交付方式、收货信息与备注，提交走 orderUpdate，截止前可换交付方式。
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

    <!-- 交付方式（D-086）：两种都支持时必须由参与者自己选 -->
    <view class="sec" v-if="deliveryTypes.length > 1">
      <view class="sec__title">交付方式</view>
      <view class="dlv">
        <text class="dlv__opt" :class="{ 'dlv__opt--on': delivery === 1 }" @click="pickDelivery(1)">送货上门</text>
        <text class="dlv__opt" :class="{ 'dlv__opt--on': delivery === 2 }" @click="pickDelivery(2)">到自提点自提</text>
      </view>
      <view v-if="!delivery" class="dlv__tip">请选择一种交付方式</view>
    </view>

    <!-- 自提点（D-077）：先让参与者看清去哪取，再填联系人；选了送货上门就不再显示 -->
    <go-pickup
      v-if="preview.pickup && delivery !== 1"
      :address="preview.pickup.address"
      :time-desc="preview.pickup.time_desc"
      :contact-name="preview.pickup.contact_name"
      :contact-mobile="preview.pickup.contact_mobile"
    />

    <!-- 收货信息：选定交付方式后才出现 -->
    <view class="sec" v-if="delivery">
      <view class="sec__title">{{ isSelfPick ? '自提联系人' : '收货信息' }}</view>
      <!-- 送货上门：选地址 -->
      <view v-if="!isSelfPick" class="addr" @click="chooseAddress">
        <block v-if="address">
          <view class="addr__line1">{{ address.name }} {{ address.mobile }}</view>
          <view class="addr__line2">{{ address.address }}</view>
          <view v-if="!address._id" class="addr__hint">本单原收货地址，点击可更换</view>
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
      <button class="bar__go" type="primary" :loading="submitting" :disabled="!submittable" @click="submit">{{ orderId ? '确认修改' : '提交订单' }}</button>
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
import GoPickup from '@/components/go-pickup/go-pickup.vue';

const activityId = ref('');
// 改单模式（D-086）：有值时提交走 orderUpdate
const orderId = ref('');
let orderLoaded = false;
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

// 交付方式（D-086）：只支持一种时自动取该种；两种都支持时为 0，等参与者选
const deliveryTypes = computed<number[]>(() => preview.value.delivery_types || []);
const delivery = ref(0);
const isSelfPick = computed(() => delivery.value === 2);
const submittable = computed(() => {
  if (!(preview.value.items || []).length) return false;
  if (!delivery.value) return false;
  if (isSelfPick.value) return !!selfName.value.trim() && !!selfMobile.value.trim();
  return !!address.value;
});

const errText = (u: any) => {
  const m: Record<string, string> = { GOODS_OFFLINE: '已下架', GOODS_OFF_SALE: '已停售', STOCK_NOT_ENOUGH: '库存不足', LIMIT_EXCEEDED: '超出限购' };
  return m[u.errCode] || '不可购买';
};

const doPreview = async () => {
  const q: any = { activity_id: activityId.value, items: items.value };
  if (orderId.value) q.order_id = orderId.value;
  preview.value = (await guarded(api.order.orderPreview(q))) || {};
  if (deliveryTypes.value.length === 1) delivery.value = deliveryTypes.value[0];
  loaded.value = true;
};

/** 改单：首次进入时按本单预填交付方式、收货信息与备注 */
const loadOrder = async () => {
  if (!orderId.value || orderLoaded) return;
  orderLoaded = true;
  const o = (await guarded(api.order.orderGetDetail({ order_id: orderId.value }))) || {};
  delivery.value = o.delivery_type || delivery.value;
  remark.value = o.buyer_remark || '';
  selfName.value = o.consignee_name || '';
  selfMobile.value = o.consignee_mobile || '';
  // 本单原地址是快照，不对应地址簿记录（没有 _id），提交时按快照原样带回
  if (o.consignee_address) address.value = { name: o.consignee_name, mobile: o.consignee_mobile, address: o.consignee_address };
};

/** 送货上门且还没有地址时，带出地址簿默认地址 */
const fillDefaultAddress = async () => {
  if (delivery.value !== 1 || address.value) return;
  try {
    const list = ((await api.user.addressList()) || {}).list || [];
    address.value = list.find((a: any) => a.is_default) || list[0] || null;
  } catch (e) {}
};

const pickDelivery = (t: number) => {
  delivery.value = t;
  fillDefaultAddress();
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
    items: items.value,
    buyer_remark: remark.value.trim(),
    delivery_type: delivery.value,
  };
  if (isSelfPick.value) {
    params.consignee_name = selfName.value.trim();
    params.consignee_mobile = selfMobile.value.trim();
  } else if (address.value._id) {
    params.address_id = address.value._id;
  } else {
    // 改单沿用本单原地址快照
    params.consignee_name = address.value.name;
    params.consignee_mobile = address.value.mobile;
    params.consignee_address = address.value.address;
  }
  try {
    if (orderId.value) {
      params.order_id = orderId.value;
      await guarded(api.order.orderUpdate(params));
      uni.removeStorageSync('order_draft_items');
      uni.showToast({ title: '订单已修改', icon: 'none' });
      // 回到订单详情（订单详情 → 活动详情 → 本页）
      setTimeout(() => uni.navigateBack({ delta: 2 }), 600);
      return;
    }
    params.activity_id = activityId.value;
    params.idempotent_key = idempotentKey.value;
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
  orderId.value = q.order_id || '';
  if (orderId.value) uni.setNavigationBarTitle({ title: '确认修改' });
  items.value = uni.getStorageSync('order_draft_items') || [];
  // 幂等键：一次下单意图固定一个（时间戳 + 随机）
  idempotentKey.value = 'od_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
});

onShow(async () => {
  if (!activityId.value || !items.value.length) return;
  await doPreview();
  await loadOrder();
  // 送货上门默认带出默认地址
  await fillDefaultAddress();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 140rpx; background: $go-canvas; }
.sec { background: #fff; margin: 16rpx; border-radius: 16rpx; padding: 24rpx; }
.sec__title { font-size: 26rpx; color: $go-muted; margin-bottom: 16rpx; }
.line { display: flex; align-items: center; padding: 14rpx 0; font-size: 28rpx; color: $go-ink; }
.line__name { flex: 1; }
.line__qty { color: $go-muted; margin: 0 20rpx; }
.line__amt { color: $go-red; }
.line--bad { opacity: 0.6; }
.line__err { color: $go-red; font-size: 24rpx; }
.addr { padding: 12rpx 0; }
.addr__line1 { font-size: 30rpx; color: $go-ink; }
.addr__line2 { font-size: 26rpx; color: $go-text; margin-top: 8rpx; }
.addr__hint { font-size: 22rpx; color: $go-muted; margin-top: 6rpx; }
.dlv { display: flex; gap: 16rpx; }
.dlv__opt { flex: 1; text-align: center; font-size: 28rpx; color: $go-text; padding: 18rpx 0; border: 1rpx solid $go-border; border-radius: 12rpx; }
.dlv__opt--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.dlv__tip { font-size: 24rpx; color: $go-orange; margin-top: 12rpx; }
.addr__empty { font-size: 28rpx; color: $go-muted; }
.field { display: flex; align-items: center; padding: 16rpx 0; border-top: 1rpx solid $go-soft; }
.field__k { width: 120rpx; font-size: 28rpx; color: $go-text; }
.field__v { flex: 1; font-size: 28rpx; color: $go-ink; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 16rpx 24rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.bar__sum { flex: 1; font-size: 26rpx; color: $go-ink; }
.bar__amt { color: $go-red; font-size: 32rpx; }
.bar__go { margin: 0; font-size: 30rpx; }
</style>
