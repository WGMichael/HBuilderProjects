<!--
  M-19 本人订单详情

  职责：单张订单的商品、预计金额、收货快照、修改 / 取消。
  陷阱 3：收货快照与地址簿分离——这里展示的是下单时的快照，改地址簿不影响历史订单。
  editable 由服务端判定（活动进行中且订单有效才可改 / 取消）。
  D-086：交付方式按订单自身展示；「修改订单」走活动详情 → 确认页的改单模式（orderUpdate），截止前可换交付方式。
-->
<template>
  <go-result v-if="loadFailed" type="unknown" detail="页面加载失败，请检查网络后重试" @retry="load" />
  <view class="page" v-if="loaded">
    <view class="status-bar" :class="'st' + order.status">{{ labelOf(ORDER_STATUS, order.status) }}</view>

    <!-- 接龙码（D-115）：取货、付款时报给团长，团长按码搜索核销 -->
    <view v-if="order.order_code" class="code-card">
      <text class="code-card__l">接龙码</text>
      <text class="code-card__v">{{ order.order_code }}</text>
      <text class="code-card__h">取货、付款时报给团长</text>
    </view>

    <view class="card">
      <view class="card__title">{{ (order.activity && order.activity.title) || '' }}</view>
      <view class="line" v-for="it in order.items || []" :key="it.goods_id">
        <text>{{ it.goods_name }} ×{{ it.qty }}</text>
        <text class="line__amt">￥{{ fen2yuan(it.amount) }}</text>
      </view>
      <view class="total">预计合计 <text class="total__amt">￥{{ fen2yuan(order.total_amount) }}</text></view>
      <!-- 团长记录（D-100）：只读；平台不收款，这里只反映团长自己的登记 -->
      <view class="marks" v-if="order.leader_paid || order.leader_delivered">
        <text class="marks__l">团长已记录：</text>
        <text v-if="order.leader_paid" class="marks__t">已收款</text>
        <text v-if="order.leader_delivered" class="marks__t">已取货</text>
      </view>
    </view>

    <view class="card">
      <view class="card__sub">收货信息（下单时快照）</view>
      <view class="kv">交付方式：{{ labelOf(DELIVERY_TYPE, order.delivery_type) }}</view>
      <view class="kv">{{ order.consignee_name }} {{ order.consignee_mobile }}</view>
      <view class="kv" v-if="order.delivery_type === 2">自提，无收货地址</view>
      <view class="kv" v-else>{{ order.consignee_address }}</view>
      <view class="kv" v-if="order.buyer_remark">备注：{{ order.buyer_remark }}</view>
    </view>

    <!-- 自提点（D-077）：跟着活动走，团长改了这里就跟着变，与上面的收货快照不同 -->
    <go-pickup
      v-if="order.pickup"
      :address="order.pickup.address"
      :time-desc="order.pickup.time_desc"
      :contact-name="order.pickup.contact_name"
      :contact-mobile="order.pickup.contact_mobile"
    />

    <!-- 团长名片（D-103 / D-109）：付款、问交付时找团长 -->
    <go-leader-contact :contact="order.leader_contact" variant="order" />

    <view class="card" v-if="order.cancel_reason || order.void_reason">
      <view class="kv" v-if="order.cancel_reason">取消原因：{{ order.cancel_reason }}</view>
      <view class="kv" v-if="order.void_reason">作废原因：{{ order.void_reason }}</view>
    </view>

    <view class="actions" v-if="order.editable">
      <button class="btn" @click="edit">修改订单</button>
      <button class="btn btn--warn" @click="cancel">取消订单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import GoResult from '@/components/go-result/go-result.vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ORDER_STATUS, DELIVERY_TYPE, labelOf, fen2yuan } from '@/common/grouporder/dict.js';
import GoPickup from '@/components/go-pickup/go-pickup.vue';
import GoLeaderContact from '@/components/go-leader-contact/go-leader-contact.vue';

const orderId = ref('');
const order = ref<any>({});
const loaded = ref(false);

const loadInner = async () => {
  if (!orderId.value) return;
  order.value = (await guarded(api.order.orderGetDetail({ order_id: orderId.value }))) || {};
  loaded.value = true;
};

// 加载失败（断网、非对象级错误）时给出重试，不白屏；对象级错误由 guarded 跳 M-26
const loadFailed = ref(false);
const load = async () => {
  loadFailed.value = false;
  try {
    await loadInner();
  } catch (e) {
    if (!loaded.value) loadFailed.value = true;
  }
};

const edit = () => {
  // 改单（D-086）：活动详情按本单预填数量 → 确认页改单模式提交 orderUpdate，不新建订单
  const aid = (order.value.activity && order.value.activity._id) || '';
  uni.navigateTo({ url: '/pages/activity/detail?id=' + aid + '&order_id=' + orderId.value });
};

const cancel = () => {
  uni.showModal({
    // editable 确认框会把 content 预填进输入框，说明放标题，输入框留空（D-113）
    title: '确认取消这张订单？',
    content: '',
    editable: true,
    placeholderText: '取消原因（选填）',
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        await guarded(api.order.orderCancel({ order_id: orderId.value, reason: String(r.content || '').trim() }));
        uni.showToast({ title: '已取消', icon: 'none' });
        load();
      } catch (e) {}
    },
  });
};

onLoad((q: any = {}) => { orderId.value = q.id || q.order_id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding: 20rpx; }
.status-bar { font-size: 30rpx; padding: 24rpx; border-radius: 16rpx; margin-bottom: 16rpx; background: $go-primary-soft; color: $go-primary; }
.status-bar.st2, .status-bar.st3 { background: $go-line; color: $go-muted; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.card__title { font-size: 30rpx; color: $go-ink; margin-bottom: 12rpx; }
.card__sub { font-size: 24rpx; color: $go-muted; margin-bottom: 12rpx; }
.line { display: flex; justify-content: space-between; padding: 12rpx 0; font-size: 28rpx; color: $go-ink; }
.line__amt { color: $go-red; }
.total { text-align: right; margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx solid $go-soft; font-size: 26rpx; color: $go-text; }
.total__amt { color: $go-red; font-size: 32rpx; }
.kv { font-size: 28rpx; color: $go-text; line-height: 1.8; }
.actions { display: flex; gap: 16rpx; margin-top: 8rpx; }
.btn { flex: 1; margin: 0; font-size: 28rpx; background: #fff; color: $go-text; }
.btn--warn { color: $go-red; }
.marks { display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx; padding-top: 16rpx; border-top: 1rpx solid $go-soft; font-size: 24rpx; color: $go-muted; }
.marks__t { font-size: 22rpx; color: $go-primary; background: $go-primary-soft; padding: 2rpx 14rpx; border-radius: 8rpx; }
.code-card { display: flex; align-items: baseline; gap: 16rpx; margin: 20rpx 20rpx 0; padding: 24rpx 28rpx; background: #fff; border-radius: 16rpx; }
.code-card__l { font-size: 24rpx; color: $go-muted; }
.code-card__v { font-size: 44rpx; font-weight: 700; color: $go-primary-dark; letter-spacing: 8rpx; }
.code-card__h { margin-left: auto; font-size: 22rpx; color: $go-muted; }
</style>
