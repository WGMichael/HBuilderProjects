<!--
  团长统计（M-35，「我的 → 工具」进入，D-106，会员功能）

  跨本人全部已发布活动的汇总：概览、订单趋势、待处理（团长记录）、活动 / 商品 / 回头客排行。
  数据来自 orderLeaderStat 的兄弟接口 leaderStatOverview（实时计算）。
  红线⑧：金额只称「预计金额」。回头客姓名脱敏、只显示电话尾号。
  会员闸门（D-106）：首版服务端闸门关闭；打开后非会员收到 detail.member_required，这里展示会员说明，不白屏。
  柱状图用纯样式绘制，不引入图表库。
-->
<template>
  <view class="page">
    <view class="ranges">
      <text v-for="r in ranges" :key="r.v" class="ranges__i" :class="{ 'ranges__i--on': range === r.v }" @click="switchRange(r.v)">{{ r.text }}</text>
    </view>

    <!-- 会员闸门打开后的非会员（首版不会出现） -->
    <view v-if="memberRequired" class="member">
      <view class="member__title">团长统计是会员功能</view>
      <view class="member__desc">开通方式即将上线，敬请期待。</view>
    </view>

    <go-result v-else-if="loadFailed" type="unknown" detail="统计加载失败，请检查网络后重试" @retry="load" />

    <view v-else-if="!loaded" class="loading">正在统计…</view>

    <block v-else>
      <!-- 概览 -->
      <view class="ov">
        <view class="ov__grid">
          <view class="ov__i"><text class="ov__n">{{ d.overview.activity_count }}</text><text class="ov__l">发起活动</text></view>
          <view class="ov__i"><text class="ov__n">{{ d.overview.valid_order_count }}</text><text class="ov__l">有效订单</text></view>
          <view class="ov__i"><text class="ov__n">{{ d.overview.participant_count }}</text><text class="ov__l">参与人数</text></view>
          <view class="ov__i"><text class="ov__n">{{ d.overview.valid_total_qty }}</text><text class="ov__l">有效份数</text></view>
          <view class="ov__i ov__i--wide"><text class="ov__n">￥{{ fen2yuan(d.overview.estimated_amount) }}</text><text class="ov__l">预计金额</text></view>
        </view>
        <view class="ov__foot">回头客 {{ d.overview.repeat_customer_count }} 人（在你的 2 场及以上活动下过单） · 进行中 {{ d.overview.ongoing_count }} 场</view>
      </view>

      <!-- 趋势 -->
      <view class="blk">
        <view class="blk__title">订单趋势<text class="blk__sub">按{{ unitText }}，有效订单数</text></view>
        <view class="chart">
          <view v-for="(b, i) in buckets" :key="i" class="chart__col">
            <text class="chart__v">{{ b.order_count || '' }}</text>
            <view class="chart__bar" :style="{ height: barHeight(b.order_count) }" />
            <text class="chart__l">{{ showLabel(i) ? b.label : '' }}</text>
          </view>
        </view>
      </view>

      <!-- 待处理 -->
      <view class="blk">
        <view class="blk__title">待处理<text class="blk__sub">你的收款 / 取货记录，不受时间范围影响</text></view>
        <view class="pend">
          <view class="pend__i"><text class="pend__n">{{ d.pending.unpaid_order_count }}</text><text class="pend__l">未收款订单</text></view>
          <view class="pend__i"><text class="pend__n">{{ d.pending.undelivered_order_count }}</text><text class="pend__l">未取货订单</text></view>
        </view>
        <view v-for="p in d.pending.activities" :key="p.activity_id" class="row" @click="openOrders(p.activity_id, p.unpaid ? 'unpaid' : 'undelivered')">
          <text class="row__name">{{ p.title }}</text>
          <text class="row__meta">未收款 {{ p.unpaid }} · 未取货 {{ p.undelivered }}</text>
          <text class="row__a">›</text>
        </view>
        <view v-if="!d.pending.activities.length" class="empty">都处理完了</view>
      </view>

      <!-- 活动排行 -->
      <view class="blk">
        <view class="blk__title">活动排行<text class="blk__sub">按有效订单</text></view>
        <view v-for="(a, i) in d.activity_top" :key="a.activity_id" class="row" @click="openManage(a.activity_id)">
          <text class="row__rank" :class="{ 'row__rank--top': i < 3 }">{{ i + 1 }}</text>
          <text class="row__name">{{ a.title }}</text>
          <text class="row__meta">{{ a.order_count }} 单 · {{ a.total_qty }} 份</text>
          <text class="row__a">›</text>
        </view>
        <view v-if="!d.activity_top.length" class="empty">这段时间还没有订单</view>
      </view>

      <!-- 商品排行 -->
      <view class="blk">
        <view class="blk__title">商品排行<text class="blk__sub">按份数，同名商品合并</text></view>
        <view v-for="(g, i) in d.goods_top" :key="i" class="row">
          <text class="row__rank" :class="{ 'row__rank--top': i < 3 }">{{ i + 1 }}</text>
          <text class="row__name">{{ g.goods_name }}</text>
          <text class="row__meta">{{ g.total_qty }} {{ g.unit || '份' }}</text>
        </view>
        <view v-if="!d.goods_top.length" class="empty">这段时间还没有订单</view>
      </view>

      <!-- 回头客 -->
      <view class="blk">
        <view class="blk__title">回头客<text class="blk__sub">按参与场次</text></view>
        <view v-for="(c, i) in d.customer_top" :key="i" class="row">
          <text class="row__rank" :class="{ 'row__rank--top': i < 3 }">{{ i + 1 }}</text>
          <text class="row__name">{{ c.name_masked }}<text v-if="c.mobile_tail" class="row__tail">（尾号{{ c.mobile_tail }}）</text></text>
          <text class="row__meta">{{ c.activity_count }} 场 · {{ c.order_count }} 单</text>
        </view>
        <view v-if="!d.customer_top.length" class="empty">还没有在 2 场及以上活动下单的人</view>
      </view>

      <view class="note">统计只含进行中和已结束活动的有效订单，时间按下单时间；「全部」的趋势显示最近 12 个月。统计时间 {{ fmt(d.asOf) }}</view>
    </block>
  </view>
</template>

<script setup lang="ts">
// @ts-ignore
import { fmtDateTime } from '@/common/grouporder/activity-time.js';
import { computed, ref } from 'vue';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import GoResult from '@/components/go-result/go-result.vue';
// @ts-ignore
import api from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const ranges = [
  { v: '7d', text: '近7天' },
  { v: '30d', text: '近30天' },
  { v: '90d', text: '近90天' },
  { v: 'all', text: '全部' },
];
const range = ref('30d');
const d = ref<any>({});
const loaded = ref(false);
const loadFailed = ref(false);
const memberRequired = ref(false);
let seq = 0;

// 统一格式 yyyy/mm/dd hh:mm（D-145）
const fmt = (ts: number) => fmtDateTime(ts);
const buckets = computed(() => (d.value.trend && d.value.trend.buckets) || []);
const unitText = computed(() => ({ day: '天', week: '周', month: '月' } as any)[(d.value.trend && d.value.trend.unit) || 'day']);
const maxCount = computed(() => Math.max(1, ...buckets.value.map((b: any) => b.order_count || 0)));
const barHeight = (n: number) => (n ? Math.max(6, Math.round((n / maxCount.value) * 200)) : 2) + 'rpx';
// 30 个桶时标签太挤，隔几个显示一个，首尾始终显示
const showLabel = (i: number) => {
  const n = buckets.value.length;
  const step = n > 14 ? 5 : n > 8 ? 2 : 1;
  return i === 0 || i === n - 1 || i % step === 0;
};

const load = async () => {
  const my = ++seq;
  loadFailed.value = false;
  try {
    const r = (await api.order.leaderStatOverview({ range: range.value }, { silent: true })) || {};
    if (my !== seq) return;
    d.value = r;
    memberRequired.value = false;
    loaded.value = true;
  } catch (e: any) {
    if (my !== seq) return;
    if (e && e.detail && e.detail.member_required) memberRequired.value = true;
    else loadFailed.value = true;
  } finally {
    uni.stopPullDownRefresh();
  }
};
const switchRange = (v: string) => {
  if (range.value === v) return;
  range.value = v;
  loaded.value = false;
  load();
};
const openManage = (id: string) => uni.navigateTo({ url: '/pages/activity/manage?id=' + id });
// 直接进活动管理的「接龙记录」tab 并预选子 tab（D-100、D-115）
const openOrders = (id: string, mark: string) => uni.navigateTo({ url: `/pages/activity/manage?id=${id}&tab=records&mark=${mark}` });

onLoad(() => load());
onPullDownRefresh(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding-bottom: 60rpx; }
.ranges { display: flex; gap: 16rpx; padding: 24rpx 28rpx; background: #fff; }
.ranges__i { flex: 1; text-align: center; font-size: 24rpx; color: $go-text; padding: 10rpx 0; border: 1rpx solid $go-border; border-radius: 32rpx; }
.ranges__i--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.loading { text-align: center; color: $go-muted; font-size: 26rpx; padding: 120rpx 0; }
.member { margin: 40rpx 28rpx; padding: 60rpx 32rpx; background: #fff; border-radius: 24rpx; text-align: center; }
.member__title { font-size: 32rpx; font-weight: 600; color: $go-ink; }
.member__desc { font-size: 26rpx; color: $go-muted; margin-top: 16rpx; }
.ov { margin: 16rpx 0 0; background: #fff; padding: 28rpx 12rpx 20rpx; }
.ov__grid { display: flex; flex-wrap: wrap; }
.ov__i { width: 25%; display: flex; flex-direction: column; align-items: center; padding: 12rpx 0; }
.ov__i--wide { width: 100%; }
.ov__n { font-size: 36rpx; color: $go-primary; font-weight: 600; }
.ov__l { font-size: 22rpx; color: $go-muted; margin-top: 4rpx; }
.ov__foot { font-size: 22rpx; color: $go-muted; text-align: center; margin-top: 12rpx; }
.blk { background: #fff; margin-top: 16rpx; padding: 24rpx 28rpx; }
.blk__title { font-size: 28rpx; font-weight: 600; color: $go-ink; margin-bottom: 16rpx; }
.blk__sub { font-size: 22rpx; font-weight: 400; color: $go-muted; margin-left: 12rpx; }
.chart { display: flex; align-items: flex-end; gap: 4rpx; height: 280rpx; padding-top: 10rpx; }
.chart__col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.chart__v { font-size: 18rpx; color: $go-muted; height: 26rpx; line-height: 26rpx; white-space: nowrap; }
.chart__bar { width: 70%; max-width: 40rpx; background: $go-primary; border-radius: 6rpx 6rpx 0 0; }
.chart__l { font-size: 18rpx; color: $go-muted; height: 30rpx; line-height: 30rpx; white-space: nowrap; }
.pend { display: flex; margin-bottom: 8rpx; }
.pend__i { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 8rpx 0 16rpx; }
.pend__n { font-size: 36rpx; color: $go-orange; font-weight: 600; }
.pend__l { font-size: 22rpx; color: $go-muted; }
.row { display: flex; align-items: center; padding: 18rpx 0; border-top: 1rpx solid $go-soft; font-size: 26rpx; color: $go-ink; }
.row__rank { width: 40rpx; height: 40rpx; line-height: 40rpx; text-align: center; border-radius: 50%; background: $go-tag-bg; color: $go-tag-text; font-size: 22rpx; margin-right: 16rpx; flex-shrink: 0; }
.row__rank--top { background: $go-primary; color: #fff; }
.row__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row__tail { color: $go-muted; font-size: 22rpx; }
.row__meta { color: $go-muted; font-size: 24rpx; margin-left: 16rpx; flex-shrink: 0; }
.row__a { color: $go-placeholder; margin-left: 12rpx; }
.empty { text-align: center; font-size: 24rpx; color: $go-muted; padding: 24rpx 0; }
.note { font-size: 22rpx; color: $go-muted; padding: 24rpx 28rpx; line-height: 1.6; }
</style>
