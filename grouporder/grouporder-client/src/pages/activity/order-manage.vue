<!--
  M-36 订单详情（团长管理单张订单，D-116）

  从 M-20「接龙记录」点订单进入。显示下单账号、接龙码、下单时间、交付方式、收货人与电话（可拨号）、
  地址或自提点、备注、商品明细与金额、收款 / 取货状态及标记时间；
  操作：标记 / 撤销「已收款」「已取货」（D-100，团长自己的记录，平台不收款），截止后作废（D-051）。
  每次操作成功后经 uni.$emit('go-order-updated') 通知接龙记录就地更新该行，返回时不用整页重载。
-->
<template>
  <go-result v-if="loadFailed" type="unknown" detail="页面加载失败，请检查网络后重试" @retry="load" />
  <view class="page" v-if="loaded">
    <!-- 接龙码与状态 -->
    <view class="top">
      <view class="top__code"><text class="top__l">接龙码</text><text class="top__v">{{ o.order_code || '—' }}</text></view>
      <text class="st" :class="'st--' + o.status">{{ labelOf(ORDER_STATUS, o.status) }}</text>
    </view>

    <!-- 核销 -->
    <view class="card">
      <view class="card__title">收款与取货<text class="card__sub">你自己的记录，平台不收款</text></view>
      <view class="mk">
        <view class="mk__i">
          <text class="mk__k">收款</text>
          <text class="mk__s" :class="{ 'mk__s--on': o.leader_paid }">{{ o.leader_paid ? '已收款' : '未收款' }}</text>
          <text v-if="o.leader_paid && o.leader_paid_time" class="mk__t">{{ fmtDateTime(o.leader_paid_time) }}</text>
          <button v-if="o.can_mark" class="mk__btn" :class="{ 'mk__btn--undo': o.leader_paid }" size="mini" @click="toggle('paid')">{{ o.leader_paid ? '撤销' : '标记已收款' }}</button>
        </view>
        <view class="mk__i">
          <text class="mk__k">取货</text>
          <text class="mk__s" :class="{ 'mk__s--on': o.leader_delivered }">{{ o.leader_delivered ? '已取货' : '未取货' }}</text>
          <text v-if="o.leader_delivered && o.leader_delivered_time" class="mk__t">{{ fmtDateTime(o.leader_delivered_time) }}</text>
          <button v-if="o.can_mark" class="mk__btn" :class="{ 'mk__btn--undo': o.leader_delivered }" size="mini" @click="toggle('delivered')">{{ o.leader_delivered ? '撤销' : '标记已取货' }}</button>
        </view>
      </view>
      <view v-if="o.paid_amount_changed" class="warn">标记收款时为 ￥{{ fen2yuan(o.leader_paid_amount) }}，参与者改单后现为 ￥{{ fen2yuan(o.total_amount) }}，请核对</view>
    </view>

    <!-- 下单与收货 -->
    <view class="card">
      <view class="kv"><text class="kv__k">下单账号</text><text class="kv__v">{{ o.buyer_name || '—' }}</text></view>
      <view class="kv"><text class="kv__k">下单时间</text><text class="kv__v">{{ fmtDateTime(o.create_date) }}</text></view>
      <view class="kv"><text class="kv__k">交付方式</text><text class="kv__v">{{ labelOf(DELIVERY_TYPE, o.delivery_type) }}</text></view>
      <view class="kv"><text class="kv__k">收货人</text><text class="kv__v">{{ o.consignee_name }}</text></view>
      <view class="kv"><text class="kv__k">电话</text><text class="kv__v" user-select>{{ o.consignee_mobile }}</text><text class="kv__act" @click="call">拨号</text></view>
      <view v-if="o.consignee_address" class="kv"><text class="kv__k">地址</text><text class="kv__v" user-select>{{ o.consignee_address }}</text><text class="kv__act" @click="copyAddr">复制</text></view>
      <view v-if="o.buyer_remark" class="kv"><text class="kv__k">备注</text><text class="kv__v">{{ o.buyer_remark }}</text></view>
      <view class="kv"><text class="kv__k">订单号</text><text class="kv__v kv__v--muted" user-select>{{ o.order_no }}</text></view>
    </view>

    <!-- 自提点：跟着活动走（D-077） -->
    <go-pickup v-if="o.pickup" :address="o.pickup.address" :time-desc="o.pickup.time_desc" :contact-name="o.pickup.contact_name" :contact-mobile="o.pickup.contact_mobile" />

    <!-- 商品 -->
    <view class="card">
      <view class="card__title">商品</view>
      <view v-for="it in o.items || []" :key="it.goods_id" class="line">
        <text class="line__n">{{ it.goods_name }}</text>
        <text class="line__q">×{{ it.qty }}{{ it.unit || '' }}</text>
        <text class="line__a">￥{{ fen2yuan(it.amount) }}</text>
      </view>
      <view class="total">共 {{ o.total_qty }} 份 · 预计 <text class="total__a">￥{{ fen2yuan(o.total_amount) }}</text></view>
    </view>

    <view v-if="o.cancel_reason || o.void_reason" class="card">
      <view v-if="o.cancel_reason" class="kv"><text class="kv__k">取消原因</text><text class="kv__v">{{ o.cancel_reason }}</text></view>
      <view v-if="o.void_reason" class="kv"><text class="kv__k">作废原因</text><text class="kv__v">{{ o.void_reason }}</text></view>
    </view>

    <view v-if="o.can_void" class="void" @click="voidOrder">作废此订单</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import GoResult from '@/components/go-result/go-result.vue';
import GoPickup from '@/components/go-pickup/go-pickup.vue';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ORDER_STATUS, DELIVERY_TYPE, labelOf, fen2yuan } from '@/common/grouporder/dict.js';
// @ts-ignore
import { fmtDateTime } from '@/common/grouporder/activity-time.js';

const orderId = ref('');
const o = ref<any>({});
const loaded = ref(false);
const loadFailed = ref(false);
const busy = ref(false);

const load = async () => {
  loadFailed.value = false;
  try {
    o.value = (await guarded(api.order.orderLeaderDetail({ order_id: orderId.value }))) || {};
    loaded.value = true;
  } catch (e) {
    if (!loaded.value) loadFailed.value = true;
  }
};

// 通知接龙记录就地更新（D-116）
const notify = () => uni.$emit('go-order-updated', { ...o.value });

const toggle = (kind: 'paid' | 'delivered') => {
  const key = kind === 'paid' ? 'leader_paid' : 'leader_delivered';
  const next = !o.value[key];
  const run = async () => {
    if (busy.value) return;
    busy.value = true;
    try {
      const r = (await api.order.orderLeaderMark({ order_id: orderId.value, [kind]: next }, { silent: true })) || {};
      Object.assign(o.value, r);
      notify();
      uni.showToast({ title: next ? (kind === 'paid' ? '已记录收款' : '已记录取货') : '已撤销', icon: 'none' });
    } catch (e: any) {
      uni.showModal({ title: '记录失败', content: (e && e.errMsg) || '请稍后重试', showCancel: false });
      load();
    } finally {
      busy.value = false;
    }
  };
  if (next) return run();
  uni.showModal({
    title: kind === 'paid' ? '撤销收款记录' : '撤销取货记录',
    content: `确认改回${kind === 'paid' ? '未收款' : '未取货'}？`,
    success: (r: any) => { if (r.confirm) run(); },
  });
};

// 作废（D-051）：editable 确认框会把 content 预填进输入框，说明放标题、输入框留空（D-113）
const voidOrder = () => {
  uni.showModal({
    title: '作废订单（不可恢复）', content: '', editable: true, placeholderText: '请填写作废原因（必填）',
    confirmText: '确认作废', confirmColor: '#c7463f',
    success: async (r: any) => {
      if (!r.confirm) return;
      const reason = String(r.content || '').trim();
      if (!reason) { uni.showToast({ title: '请填写作废原因', icon: 'none' }); return; }
      try {
        await guarded(api.order.orderVoid({ order_id: orderId.value, reason }));
        uni.showToast({ title: '已作废', icon: 'none' });
        await load();
        notify();
      } catch (e) { /* 提示由 guarded 给出 */ }
    },
  });
};

const call = () => o.value.consignee_mobile && uni.makePhoneCall({ phoneNumber: o.value.consignee_mobile, fail: () => {} });
const copyAddr = () => uni.setClipboardData({ data: o.value.consignee_address, success: () => uni.showToast({ title: '地址已复制', icon: 'none' }) });

onLoad((q: any = {}) => { orderId.value = q.id || ''; load(); });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding: 20rpx 0 60rpx; }
.top { display: flex; align-items: center; justify-content: space-between; margin: 0 20rpx; padding: 24rpx 28rpx; background: #fff; border-radius: 16rpx; }
.top__code { display: flex; align-items: baseline; gap: 16rpx; }
.top__l { font-size: 24rpx; color: $go-muted; }
.top__v { font-size: 48rpx; font-weight: 700; color: $go-primary-dark; letter-spacing: 8rpx; }
.st { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 8rpx; background: $go-line; color: $go-muted; }
.st--1 { background: $go-primary-soft; color: $go-primary; }
.card { margin: 20rpx 20rpx 0; padding: 24rpx 28rpx; background: #fff; border-radius: 16rpx; }
.card__title { font-size: 28rpx; font-weight: 600; color: $go-ink; margin-bottom: 12rpx; }
.card__sub { font-size: 22rpx; font-weight: 400; color: $go-muted; margin-left: 12rpx; }
.mk__i { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0; border-top: 1rpx solid $go-soft; }
.mk__i:first-child { border-top: 0; }
.mk__k { width: 72rpx; font-size: 26rpx; color: $go-muted; }
.mk__s { font-size: 26rpx; color: $go-text; }
.mk__s--on { color: $go-primary; font-weight: 600; }
.mk__t { font-size: 22rpx; color: $go-muted; }
.mk__btn { margin: 0 0 0 auto; border-radius: 28rpx; background: $go-primary; color: #fff; font-size: 24rpx; padding: 0 24rpx; }
.mk__btn--undo { background: $go-soft; color: $go-text; }
.mk__btn::after { border: none; }
.warn { font-size: 22rpx; color: $go-orange-text; background: $go-orange-soft; border-radius: 8rpx; padding: 8rpx 12rpx; margin-top: 12rpx; }
.kv { display: flex; align-items: flex-start; gap: 16rpx; padding: 10rpx 0; font-size: 26rpx; line-height: 1.5; }
.kv__k { width: 128rpx; flex-shrink: 0; color: $go-muted; }
.kv__v { flex: 1; min-width: 0; color: $go-ink; word-break: break-all; }
.kv__v--muted { color: $go-muted; font-size: 24rpx; }
.kv__act { flex-shrink: 0; color: $go-primary; font-size: 24rpx; }
.line { display: flex; align-items: center; padding: 12rpx 0; font-size: 26rpx; color: $go-ink; }
.line__n { flex: 1; min-width: 0; }
.line__q { color: $go-muted; margin: 0 20rpx; }
.line__a { color: $go-text; }
.total { text-align: right; font-size: 24rpx; color: $go-muted; margin-top: 8rpx; }
.total__a { color: $go-red; font-size: 30rpx; font-weight: 600; }
.void { margin: 40rpx 20rpx 0; text-align: center; padding: 24rpx 0; background: #fff; border-radius: 16rpx; color: $go-red; font-size: 28rpx; }
</style>
