<!--
  活动内容展示（参与者视角）

  M-13 活动详情与 M-12 发布预览共用，保证团长预览所见即参与者所见。
  视觉参照 prototype/mockup-v3.html「D · 参与者侧 · 活动详情」：深绿标题区、带缩略图的商品卡、推荐角标、免责提示。
  只负责展示；交互由页面通过插槽提供：
    - after-head：标题区下方的提示条（如「活动已截止」「预览模式」）
    - goods-ctrl：每个商品右下角的控件（参与者为数量步进器，预览为「预览」标签），作用域参数 { g }
  preview=true 时状态标签显示「待发布」等预览口径，并始终展示库存与限购原值。
  红线⑦：业务状态与治理状态分列；D-044：total_stock / per_user_limit 为 0 表示不限；D-065：推荐只加角标不改顺序。
-->
<template>
  <view class="av">
    <!-- 轮播图优先；没有轮播图时展示封面（D-041） -->
    <swiper v-if="(act.images || []).length" class="av__swiper" indicator-dots circular>
      <swiper-item v-for="(img, i) in act.images" :key="i">
        <image class="av__swiper-img" :src="img.url" mode="aspectFill" @click="previewImgs(act.images, i)" />
      </swiper-item>
    </swiper>
    <image v-else-if="act.cover_image && act.cover_image.url" class="av__cover" :src="act.cover_image.url" mode="widthFix" />

    <!-- 标题区 -->
    <view class="av__head">
      <view class="av__tags">
        <text class="av__tag">{{ statusTag }}</text>
        <text v-if="act.not_started" class="av__tag av__tag--orange">未开始</text>
        <text v-if="act.governance_status === 1" class="av__tag av__tag--red">已下架</text>
      </view>
      <view class="av__title">{{ act.title || '（未填写标题）' }}</view>
      <view class="av__meta">
        <text v-if="act.start_time">{{ fmt(act.start_time) }} 开始 · </text>
        <text v-if="act.end_time">{{ fmt(act.end_time) }} 截止</text>
        <text v-if="(act.delivery_types || []).length"> · {{ deliveryText(act.delivery_types) }}</text>
      </view>
      <view v-if="!preview" class="av__meta">有效 {{ act.valid_total_qty || 0 }} 份</view>
    </view>

    <slot name="after-head" />

    <!-- 说明与标题相同时不重复展示 -->
    <view v-if="showDesc" class="av__card">
      <view class="av__label">活动说明</view>
      <view class="av__desc">{{ act.description }}</view>
    </view>

    <!-- 自提点（D-077）：支持自提的活动才展示 -->
    <go-pickup
      v-if="(act.delivery_types || []).includes(2)"
      :address="act.pickup_address"
      :time-desc="act.pickup_time_desc"
      :contact-name="act.pickup_contact_name"
      :contact-mobile="act.pickup_contact_mobile"
    />

    <!-- 商品：顺序恒为团长排定的 sort（D-065） -->
    <view class="av__goods">
      <view
        v-for="g in act.goods || []"
        :key="g._id"
        class="av__card av__gcard"
        :class="{ 'av__gcard--rec': g.is_recommend === 1, 'av__gcard--off': g.governance_status === 1 || g.on_sale === 0 }"
      >
        <image
          v-if="g.cover_image && g.cover_image.url"
          class="av__thumb"
          :src="g.cover_image.url"
          mode="aspectFill"
          @click="previewGoods(g)"
        />
        <view v-else class="av__thumb av__thumb--empty">无图</view>
        <view class="av__ginfo">
          <view class="av__gtitle">
            <text class="av__gname">{{ g.name }}</text>
            <text v-if="g.is_recommend === 1" class="av__rec">推荐</text>
            <text v-if="g.governance_status === 1" class="av__tag av__tag--red">已下架</text>
            <text v-else-if="g.on_sale === 0" class="av__tag av__tag--gray">已停售</text>
          </view>
          <view class="av__gmeta">{{ goodsMeta(g) }}</view>
          <view v-if="g.description" class="av__gdesc">{{ g.description }}</view>
          <view class="av__gbottom">
            <text class="av__price">¥{{ fen2yuan(g.price) }}<text class="av__unit"> / {{ g.unit || '份' }}</text></text>
            <slot name="goods-ctrl" :g="g" />
          </view>
        </view>
      </view>
      <view v-if="!(act.goods || []).length" class="av__empty">还没有添加商品</view>
    </view>

    <view class="av__notice">接龙成功不代表已付款，平台不收款、不发货、不担保成交。费用与交付由团长线下处理。</view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
// @ts-ignore
import { ACTIVITY_STATUS, deliveryText, labelOf, fen2yuan } from '@/common/grouporder/dict.js';
import GoPickup from '@/components/go-pickup/go-pickup.vue';

const props = defineProps({
  act: { type: Object, default: () => ({}) },
  // 发布预览（M-12）：状态标签按预览口径，商品元信息只看设定值
  preview: { type: Boolean, default: false },
});

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

const showDesc = computed(() => {
  const d = String(props.act.description || '').trim();
  return !!d && d !== String(props.act.title || '').trim();
});

const statusTag = computed(() => {
  if (props.preview && props.act.status === 0) return '待发布';
  return labelOf(ACTIVITY_STATUS, props.act.status);
});

/** 「已购 · 剩余 / 库存 · 限购」一行；预览时尚无订单，只展示设定值 */
const goodsMeta = (g: any) => {
  const parts: string[] = [];
  if (!props.preview || g.sold_qty > 0) parts.push(`已购 ${g.sold_qty || 0} ${g.unit || '份'}`);
  if (g.total_stock > 0) parts.push(props.preview && !(g.sold_qty > 0) ? `库存 ${g.total_stock}` : `剩余 ${g.remain_qty}`);
  else parts.push('库存不限');
  parts.push(g.per_user_limit > 0 ? `每人限 ${g.per_user_limit}` : '不限购');
  return parts.join(' · ');
};

const previewImgs = (list: any[], i: number) => {
  const urls = (list || []).map((x: any) => x && x.url).filter(Boolean);
  if (urls.length) uni.previewImage({ urls, current: urls[i] || urls[0] });
};
/** 点商品缩略图：封面 + 详情图一起大图浏览（D-041） */
const previewGoods = (g: any) => previewImgs([g.cover_image, ...(g.detail_images || [])], 0);
</script>

<style lang="scss" scoped>
.av__swiper { width: 100%; height: 420rpx; background: $go-soft; }
.av__swiper-img { width: 100%; height: 420rpx; }
.av__cover { width: 100%; display: block; }
.av__head { padding: 36rpx 32rpx; background: linear-gradient(135deg, $go-primary, $go-primary-dark); color: #fff; }
.av__tags { display: flex; flex-wrap: wrap; gap: 12rpx; }
.av__tag { display: inline-block; font-size: 20rpx; font-weight: 600; padding: 6rpx 16rpx; border-radius: 999rpx; background: $go-primary-soft; color: $go-primary-dark; }
.av__tag--orange { background: $go-orange-soft; color: $go-orange; }
.av__tag--red { background: $go-red-soft; color: $go-red; }
.av__tag--gray { background: $go-tag-bg; color: $go-tag-text; }
.av__title { font-size: 38rpx; font-weight: 600; line-height: 1.4; margin: 20rpx 0 12rpx; }
.av__meta { font-size: 24rpx; opacity: 0.9; line-height: 1.6; }
.av__card { background: #fff; border: 1rpx solid $go-line; border-radius: 32rpx; padding: 30rpx; margin: 24rpx 32rpx 0; box-shadow: 0 8rpx 28rpx rgba(37, 55, 45, 0.03); }
.av__label { font-size: 22rpx; color: $go-muted; margin-bottom: 10rpx; }
.av__desc { font-size: 26rpx; color: $go-text; line-height: 1.7; white-space: pre-wrap; }
.av__goods { padding-bottom: 8rpx; }
.av__gcard { display: flex; gap: 24rpx; }
.av__gcard--rec { border-color: #f0c48a; box-shadow: 0 0 0 2rpx #f8dfba inset; }
.av__gcard--off { opacity: 0.6; }
.av__thumb { width: 152rpx; height: 152rpx; flex-shrink: 0; border-radius: 24rpx; background: #e8eee9; }
.av__thumb--empty { display: flex; align-items: center; justify-content: center; font-size: 20rpx; color: $go-muted; }
.av__ginfo { flex: 1; min-width: 0; }
.av__gtitle { display: flex; flex-wrap: wrap; align-items: center; gap: 8rpx; }
.av__gname { font-size: 30rpx; font-weight: 600; color: $go-ink; }
.av__rec { font-size: 20rpx; font-weight: 700; color: #b25e09; background: #fff3e0; border: 1rpx solid #f0c48a; border-radius: 10rpx; padding: 2rpx 10rpx; }
.av__gmeta { font-size: 22rpx; color: $go-muted; line-height: 1.55; margin-top: 8rpx; }
.av__gdesc { font-size: 22rpx; color: $go-text; line-height: 1.55; margin-top: 6rpx; }
.av__gbottom { display: flex; justify-content: space-between; align-items: center; margin-top: 18rpx; }
.av__price { font-size: 30rpx; font-weight: 700; color: $go-orange; }
.av__unit { font-size: 20rpx; font-weight: 400; color: $go-muted; }
.av__empty { text-align: center; font-size: 26rpx; color: $go-muted; padding: 60rpx 0; }
.av__notice { margin: 24rpx 32rpx; border-radius: 24rpx; padding: 22rpx 24rpx; font-size: 22rpx; line-height: 1.55; color: $go-orange-text; background: $go-orange-soft; }
</style>
