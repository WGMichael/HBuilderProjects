<!--
  复制文字清单 · 底部弹窗（M-21，D-101）

  团长在接龙进行中或截止后，把清单复制成纯文字贴到群里：
  - 备货清单：按商品汇总份数，不含任何个人信息；
  - 接龙名单：一单一行「序号. 姓名（尾号）交付方式 商品×数量」，姓名默认脱敏（文字通常要贴到群里），
    可选附带团长的收款 / 取货记录（D-100）。
  数据来自 orderLeaderBrief（全部有效订单，服务端分批读完不截断；电话只给尾号，不含地址与备注）。
-->
<template>
  <uni-popup ref="popup" type="bottom" @change="onPopupChange">
    <view class="tl">
      <view class="tl__handle" />
      <view class="tl__title">复制文字清单</view>

      <view class="tl__tabs">
        <text class="tl__tab" :class="{ 'tl__tab--on': mode === 'goods' }" @click="mode = 'goods'">备货清单</text>
        <text class="tl__tab" :class="{ 'tl__tab--on': mode === 'members' }" @click="mode = 'members'">接龙名单</text>
      </view>
      <view v-if="mode === 'members'" class="tl__opts">
        <view class="tl__opt" @click="mask = !mask"><text class="tl__box" :class="{ 'tl__box--on': mask }">{{ mask ? '✓' : '' }}</text>姓名脱敏</view>
        <view class="tl__opt" @click="withMarks = !withMarks"><text class="tl__box" :class="{ 'tl__box--on': withMarks }">{{ withMarks ? '✓' : '' }}</text>附带收款 / 取货记录</view>
      </view>

      <view v-if="state === 'loading'" class="tl__loading">正在读取订单…</view>
      <view v-else-if="state === 'fail'" class="tl__loading">{{ failReason }}</view>
      <scroll-view v-else scroll-y class="tl__preview"><text user-select>{{ text }}</text></scroll-view>

      <view class="tl__hint" v-if="mode === 'members' && !mask">名单含参与者完整姓名，贴到群里前请确认参与者同意公开。</view>
      <button class="tl__copy" :disabled="state !== 'ready'" @click="copy">复制</button>
      <button class="tl__cancel" @click="close">取消</button>
    </view>
  </uni-popup>
</template>

<script setup lang="ts">
// @ts-ignore
import { fmtDateTime } from '@/common/grouporder/activity-time.js';
import { computed, ref } from 'vue';
// @ts-ignore
import api from '@/common/grouporder/request.js';

const popup = ref<any>(null);
const state = ref<'loading' | 'ready' | 'fail'>('loading');
const failReason = ref('');
const brief = ref<any>({});
const mode = ref<'goods' | 'members'>('goods');
const mask = ref(true);
const withMarks = ref(false);
let seq = 0;

// 统一格式 yyyy/mm/dd hh:mm（D-145）
const fmt = (ts: number) => fmtDateTime(ts);
const DELIVERY_TEXT: Record<number, string> = { 1: '送货', 2: '自提' };

/** 姓名脱敏：两个字留姓，三个字及以上留首尾 */
const maskName = (n: string) => {
  const s = String(n || '');
  if (s.length <= 1) return s;
  if (s.length === 2) return s[0] + '*';
  return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1];
};
const qtyText = (qty: number, unit: string) => qty + (unit || '份');

const text = computed(() => {
  const b = brief.value;
  const orders: any[] = b.orders || [];
  const head = '【接龙丨' + (b.title || '') + '】';
  // 进行中的活动数字还会变，注明统计时间
  const ongoing = b.status !== 3 && b.end_time && (b.asOf || 0) < b.end_time;
  const asOfLine = ongoing ? `（统计至 ${fmt(b.asOf)}，接龙进行中）` : '';
  const lines: string[] = [];
  if (mode.value === 'goods') {
    lines.push(head + '备货清单');
    lines.push(`截止 ${fmt(b.end_time)} · 有效订单 ${orders.length} 单${asOfLine}`);
    let total = 0;
    (b.goods_summary || []).filter((g: any) => g.sold_qty > 0).forEach((g: any, i: number) => {
      total += g.sold_qty;
      lines.push(`${i + 1}. ${g.goods_name} ${qtyText(g.sold_qty, g.unit)}`);
    });
    if (!total) lines.push('暂无有效订单');
    else lines.push(`合计 ${total} 份`);
  } else {
    lines.push(`${head}接龙名单（${orders.length} 单）${asOfLine}`);
    const showDelivery = (b.delivery_types || []).length > 1;
    orders.forEach((o, i) => {
      const name = (mask.value ? maskName(o.consignee_name) : o.consignee_name) + (o.mobile_tail ? `（尾号${o.mobile_tail}）` : '');
      const goods = (o.items || []).map((it: any) => `${it.goods_name}×${qtyText(it.qty, it.unit)}`).join('、');
      // 接龙码（D-115）放在序号后，取货时对码方便
      let line = `${i + 1}. ${o.order_code ? '#' + o.order_code + ' ' : ''}${name}${showDelivery ? ' ' + (DELIVERY_TEXT[o.delivery_type] || '') : ''} ${goods}`;
      if (withMarks.value) line += (o.leader_paid ? ' · 已收款' : ' · 未收款') + (o.leader_delivered ? ' · 已取货' : '');
      lines.push(line);
    });
    if (!orders.length) lines.push('暂无有效订单');
  }
  return lines.join('\n');
});

/** @param initialMode 打开时直接显示的格式（统计 tab 的「复制备货清单 / 复制接龙名单」，D-126） */
const open = async (activityId: string, initialMode?: 'goods' | 'members') => {
  if (!activityId) return;
  if (initialMode) mode.value = initialMode;
  const my = ++seq;
  state.value = 'loading';
  popup.value.open();
  try {
    const b = (await api.order.orderLeaderBrief({ activity_id: activityId }, { silent: true })) || {};
    if (my !== seq) return;
    brief.value = b;
    state.value = 'ready';
  } catch (e: any) {
    if (my !== seq) return;
    failReason.value = (e && (e.errMsg || e.message)) || '读取失败，请稍后重试';
    state.value = 'fail';
  }
};
const close = () => popup.value && popup.value.close();
const copy = () => {
  if (state.value !== 'ready') return;
  uni.setClipboardData({
    data: text.value,
    success: () => { close(); uni.showToast({ title: '已复制，可粘贴到群里', icon: 'none' }); },
    fail: () => uni.showModal({ title: '复制失败', content: '请长按上方文字手动复制', showCancel: false }),
  });
};
const onPopupChange = (e: any) => { if (!e.show) seq++; };

defineExpose({ open, close });
</script>

<style lang="scss" scoped>
.tl { background: #fff; border-radius: 44rpx 44rpx 0 0; padding: 40rpx 36rpx calc(48rpx + env(safe-area-inset-bottom)); }
.tl__handle { width: 68rpx; height: 8rpx; border-radius: 8rpx; background: #d8dfda; margin: -16rpx auto 32rpx; }
.tl__title { text-align: center; font-size: 34rpx; font-weight: 700; color: $go-ink; margin-bottom: 24rpx; }
.tl__tabs { display: flex; gap: 16rpx; justify-content: center; margin-bottom: 20rpx; }
.tl__tab { font-size: 26rpx; color: $go-text; padding: 10rpx 32rpx; border: 1rpx solid $go-border; border-radius: 32rpx; }
.tl__tab--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.tl__opts { display: flex; justify-content: center; gap: 36rpx; margin-bottom: 20rpx; }
.tl__opt { display: flex; align-items: center; font-size: 24rpx; color: $go-text; }
.tl__box { width: 30rpx; height: 30rpx; line-height: 30rpx; text-align: center; border: 1rpx solid $go-border; border-radius: 6rpx; margin-right: 10rpx; font-size: 22rpx; color: #fff; }
.tl__box--on { background: $go-primary; border-color: $go-primary; }
.tl__loading { text-align: center; font-size: 24rpx; color: $go-muted; padding: 80rpx 0; }
.tl__preview { height: 520rpx; box-sizing: border-box; padding: 20rpx 24rpx; border-radius: 20rpx; background: $go-soft; border: 1rpx solid $go-line; font-size: 25rpx; line-height: 1.7; color: $go-ink; white-space: pre-wrap; word-break: break-all; }
.tl__hint { font-size: 22rpx; color: $go-orange-text; margin-top: 14rpx; text-align: center; }
.tl__copy { margin: 28rpx 0 0; border-radius: 24rpx; background: $go-primary; color: #fff; font-size: 28rpx; font-weight: 600; }
.tl__copy[disabled] { background: #9fd3b6 !important; color: #fff !important; }
.tl__cancel { margin: 18rpx 0 0; border-radius: 24rpx; background: #f2f4f3; color: $go-text; font-size: 28rpx; }
.tl__copy::after, .tl__cancel::after { border: none; }
</style>
