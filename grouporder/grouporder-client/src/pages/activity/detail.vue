<!--
  M-13 活动详情（参与者视角，也是分享落地页）

  职责：非敏感活动内容、商品选择、业务/治理状态、各商品已购买份数、活动有效总份数、举报入口。
  D-033：未登录可浏览，提交（下单）时才要求登录。
  红线⑦：业务状态与治理状态分列，不合并。D-044：total_stock=0 表示不限。
-->
<template>
  <view class="page">
    <block v-if="loaded">
      <!-- 头部 -->
      <view class="head">
        <image v-if="act.cover_image && act.cover_image.url" class="head__cover" :src="act.cover_image.url" mode="widthFix" />
        <view class="head__body">
          <view class="head__title">{{ act.title }}</view>
          <view class="head__tags">
            <text class="tag tag--biz">{{ labelOf(ACTIVITY_STATUS, act.status) }}</text>
            <text v-if="act.governance_status === 1" class="tag tag--gov">已下架</text>
          </view>
          <view class="head__meta">
            <text v-if="act.end_time">截止 {{ fmt(act.end_time) }}</text>
            <text> · 有效 {{ act.valid_total_qty || 0 }} 份</text>
          </view>
          <view v-if="act.description" class="head__desc">{{ act.description }}</view>
        </view>
      </view>

      <!-- 不可接龙提示 -->
      <view v-if="!act.joinable" class="closed-bar">{{ closedReason }}</view>

      <!-- 商品选择 -->
      <view class="goods-list">
        <view v-for="g in act.goods || []" :key="g._id" class="gitem">
          <view class="gitem__main">
            <view class="gitem__name">
              {{ g.name }}
              <text v-if="g.is_recommend === 1" class="gitem__rec">推荐</text>
              <text v-if="g.governance_status === 1" class="tag tag--gov">已下架</text>
              <text v-else-if="g.on_sale === 0" class="tag tag--warn">停售</text>
            </view>
            <view class="gitem__desc" v-if="g.description">{{ g.description }}</view>
            <view class="gitem__meta">
              <text class="gitem__price">￥{{ fen2yuan(g.price) }} / {{ g.unit || '份' }}</text>
              <text class="gitem__sold">已购 {{ g.sold_qty || 0 }} · {{ g.total_stock > 0 ? '剩 ' + g.remain_qty : '库存不限' }}</text>
            </view>
          </view>
          <view class="gitem__ctrl">
            <view class="stepper" v-if="canBuy(g)">
              <text class="stepper__btn" @click="dec(g)">－</text>
              <text class="stepper__n">{{ qty[g._id] || 0 }}</text>
              <text class="stepper__btn" @click="inc(g)">＋</text>
            </view>
            <text v-else class="gitem__na">不可选</text>
          </view>
        </view>
      </view>

      <!-- 底部结算 -->
      <view class="bar">
        <view class="bar__report" @click="report">举报</view>
        <view class="bar__sum">
          <text>已选 {{ totalQty }} 份</text>
        </view>
        <button class="bar__go" type="primary" :disabled="!totalQty || !act.joinable" @click="confirm">去下单</button>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded, ensureLogin } from '@/common/grouporder/request.js';
// @ts-ignore
import { ACTIVITY_STATUS, DELIVERY_TYPE, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const act = ref<any>({});
const loaded = ref(false);
const qty = ref<Record<string, number>>({});

const closedReason = computed(() => {
  if (act.value.status === 3) return '活动已截止，不能再下单';
  if (act.value.status === 4) return '活动已被团长取消';
  if (act.value.governance_status === 1) return '活动已被平台下架';
  return '当前不可接龙';
});

const canBuy = (g: any) => act.value.joinable && g.on_sale === 1 && g.governance_status === 0 && (g.total_stock === 0 || g.remain_qty > 0);
const totalQty = computed(() => Object.values(qty.value).reduce((s, n) => s + (n || 0), 0));

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const inc = (g: any) => {
  const cur = qty.value[g._id] || 0;
  if (g.total_stock > 0 && cur >= g.remain_qty) { uni.showToast({ title: '超过剩余量', icon: 'none' }); return; }
  qty.value = { ...qty.value, [g._id]: cur + 1 };
};
const dec = (g: any) => {
  const cur = qty.value[g._id] || 0;
  if (cur <= 0) return;
  qty.value = { ...qty.value, [g._id]: cur - 1 };
};

const load = async () => {
  if (!activityId.value) return;
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  loaded.value = true;
};

const confirm = () => {
  // 提交时才要求登录（D-033）
  if (!ensureLogin()) return;
  const items = Object.keys(qty.value).filter((k) => qty.value[k] > 0).map((k) => ({ goods_id: k, qty: qty.value[k] }));
  if (!items.length) return;
  uni.setStorageSync('order_draft_items', items);
  uni.navigateTo({ url: '/pages/order/confirm?activity_id=' + activityId.value });
};

const report = () => {
  if (!ensureLogin()) return;
  uni.navigateTo({ url: '/pages/report/submit?activity_id=' + activityId.value });
};

onLoad((q: any = {}) => {
  // 支持分享短码进入
  activityId.value = q.id || q.activity_id || q.short_code || '';
});
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 140rpx; background: #f4f5f7; }
.head { background: #fff; }
.head__cover { width: 100%; }
.head__body { padding: 28rpx; }
.head__title { font-size: 36rpx; color: #303133; }
.head__tags { margin: 12rpx 0; }
.head__meta { font-size: 24rpx; color: #909399; }
.head__desc { font-size: 26rpx; color: #606266; margin-top: 16rpx; line-height: 1.7; }
.closed-bar { background: #fef0f0; color: #fa3534; font-size: 26rpx; padding: 20rpx 28rpx; }
.goods-list { margin-top: 16rpx; }
.gitem { display: flex; align-items: center; background: #fff; padding: 24rpx 28rpx; border-bottom: 1rpx solid #f5f5f5; }
.gitem__main { flex: 1; min-width: 0; }
.gitem__name { font-size: 30rpx; color: #303133; }
.gitem__rec { font-size: 20rpx; color: #f3a73f; margin-left: 8rpx; }
.gitem__desc { font-size: 24rpx; color: #909399; margin: 8rpx 0; }
.gitem__meta { display: flex; justify-content: space-between; margin-top: 8rpx; }
.gitem__price { color: #fa3534; font-size: 28rpx; }
.gitem__sold { color: #909399; font-size: 22rpx; }
.gitem__na { color: #c0c4cc; font-size: 24rpx; }
.stepper { display: flex; align-items: center; }
.stepper__btn { width: 52rpx; height: 52rpx; line-height: 48rpx; text-align: center; border: 1rpx solid #dcdfe6; border-radius: 50%; color: #606266; font-size: 32rpx; }
.stepper__n { min-width: 56rpx; text-align: center; font-size: 30rpx; }
.tag { display: inline-block; font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; margin-left: 8rpx; }
.tag--biz { background: #e8f3ff; color: #2979ff; }
.tag--gov { background: #fef0f0; color: #fa3534; }
.tag--warn { background: #fdf6ec; color: #f3a73f; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; padding: 16rpx 24rpx; padding-bottom: calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.bar__report { font-size: 24rpx; color: #909399; margin-right: 24rpx; }
.bar__sum { flex: 1; font-size: 26rpx; color: #303133; }
.bar__go { margin: 0; font-size: 30rpx; }
</style>
