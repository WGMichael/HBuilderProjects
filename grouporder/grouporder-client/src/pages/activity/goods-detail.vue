<!--
  M-37 商品详情（D-146）

  从活动详情（M-13）或发布预览（M-12）点商品卡片进入。参数：activity_id、goods_id，preview=1 为发布预览（只看不选）。
  内容（D-147 精简）：封面 + 详情图轮播（可放大）、推荐 / 停售 / 下架标识、价格 / 单位、名称、商品说明、详情图长图；
  不展示已购、库存、限购与所属活动信息。
  选购：从 M-13 进入时经 eventChannel 收到当前已选数量（init），本页加减后实时回传（qty），回到活动页数量已同步；
  可否增加的规则与 M-13 一致（canBuy、剩余量、改单时本单原有数量 ownQty）。
  H5 刷新后没有 eventChannel：仍可浏览，底部改为「回活动页选购」。数据重新拉 activityGetDetail，不依赖上一页传参。
-->
<template>
  <go-result v-if="loadFailed" type="unknown" detail="页面加载失败，请检查网络后重试" @retry="load" />
  <view class="page" v-if="loaded && g">
    <!-- 图片：封面 + 详情图 -->
    <view class="gallery">
      <swiper v-if="images.length" class="gallery__swiper" circular @change="(e) => (current = e.detail.current)">
        <swiper-item v-for="(img, i) in images" :key="i">
          <image class="gallery__img" :src="img.url" mode="aspectFill" @click="zoom(i)" />
        </swiper-item>
      </swiper>
      <view v-else class="gallery__empty">暂无图片</view>
      <text v-if="images.length > 1" class="gallery__idx">{{ current + 1 }}/{{ images.length }}</text>
      <text v-if="g.is_recommend === 1" class="gallery__rec">推荐</text>
    </view>

    <!-- 名称、价格（D-147：只展示商品资料，不展示已购 / 库存 / 活动信息） -->
    <view class="card">
      <view class="price">¥<text class="price__n">{{ fen2yuan(g.price) }}</text><text class="price__u"> / {{ g.unit || '份' }}</text></view>
      <view class="name">
        <text>{{ g.name }}</text>
        <text v-if="g.governance_status === 1" class="tag tag--red">已下架</text>
        <text v-else-if="g.on_sale === 0" class="tag tag--gray">已停售</text>
      </view>
    </view>

    <!-- 商品说明 -->
    <view class="card">
      <view class="card__title">商品说明</view>
      <view v-if="g.description" class="desc" user-select>{{ g.description }}</view>
      <view v-else class="desc desc--empty">{{ preview ? '未填写商品说明' : '暂无说明' }}</view>
    </view>

    <!-- 详情图长图 -->
    <view v-if="(g.detail_images || []).length" class="card card--flush">
      <view class="card__title card__title--pad">商品详情</view>
      <image v-for="(img, i) in g.detail_images" :key="i" class="detail-img" :src="img.url" mode="widthFix" @click="zoom(i + (g.cover_image ? 1 : 0))" />
    </view>

    <view class="notice">接龙成功不代表已付款，平台不收款、不发货、不担保成交。费用与交付由团长线下处理。</view>

    <!-- 底部 -->
    <view class="bar">
      <block v-if="preview">
        <text class="bar__tip">预览模式 · 参与者在这里选择数量</text>
      </block>
      <block v-else-if="channel">
        <view class="bar__left">
          <text v-if="!buyable && !(ownQty > 0)" class="bar__reason">{{ reason }}</text>
          <view v-else class="stepper">
            <text class="stepper__btn" @click="dec">－</text>
            <text class="stepper__n">{{ qty }}</text>
            <text class="stepper__btn stepper__btn--plus" @click="inc">＋</text>
          </view>
        </view>
        <button class="bar__btn" type="primary" @click="backToActivity">{{ qty > 0 ? '选好了' : '返回活动' }}</button>
      </block>
      <block v-else>
        <text class="bar__tip">{{ buyable ? '回到活动页选择数量并下单' : reason }}</text>
        <button class="bar__btn" type="primary" @click="backToActivity">回活动页选购</button>
      </block>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import GoResult from '@/components/go-result/go-result.vue';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan, maxBuyQty } from '@/common/grouporder/dict.js';
// @ts-ignore
import { fmtDateTime } from '@/common/grouporder/activity-time.js';
// @ts-ignore
import { safeBack } from '@/common/grouporder/nav.js';

const activityId = ref('');
const goodsId = ref('');
const preview = ref(false);
const act = ref<any>({});
const loaded = ref(false);
const loadFailed = ref(false);
const current = ref(0);
const qty = ref(0);
const ownQty = ref(0); // 改单时本单原有数量（已计入已购），与 M-13 同口径
let channel: any = null;

const g = computed<any>(() => (act.value.goods || []).find((x: any) => x._id === goodsId.value) || null);
const images = computed(() => {
  const x = g.value;
  if (!x) return [];
  return [x.cover_image, ...(x.detail_images || [])].filter((i: any) => i && i.url);
});
const soldOut = computed(() => !!g.value && g.value.total_stock > 0 && (g.value.remain_qty || 0) <= 0);
// 与 M-13 canBuy 一致
const buyable = computed(() => !!g.value && act.value.joinable && g.value.on_sale === 1 && g.value.governance_status === 0 && !soldOut.value);
const reason = computed(() => {
  const x = g.value || {};
  if (x.governance_status === 1) return '该商品已被平台下架';
  if (x.on_sale === 0) return '该商品已停售';
  if (soldOut.value) return '该商品已售罄';
  if (act.value.not_started) return `活动 ${fmtDateTime(act.value.start_time)} 开始，届时可选购`;
  if (act.value.status === 3) return '活动已结束';
  if (act.value.status === 4) return '活动已取消';
  if (act.value.governance_status === 1) return '活动已被平台下架';
  return '当前不可选购';
});

const load = async () => {
  loadFailed.value = false;
  try {
    act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
    loaded.value = true;
    if (!g.value) {
      uni.showModal({ title: '商品不存在', content: '该商品可能已被删除', showCancel: false, success: () => backToActivity() });
      return;
    }
    uni.setNavigationBarTitle({ title: g.value.name || '商品详情' });
  } catch (e) {
    if (!loaded.value) loadFailed.value = true;
  }
};

const sync = () => { if (channel) channel.emit('qty', { goods_id: goodsId.value, qty: qty.value }); };
const inc = () => {
  const x = g.value;
  if (!x) return;
  const cur = qty.value;
  if (!buyable.value && cur >= ownQty.value) { uni.showToast({ title: '该商品当前不可增加', icon: 'none' }); return; }
  // 超出库存或限购：数量改为最多可买的份数，并提示操作失败（与 M-13 同口径，服务端下单仍会校验）
  const { max, reason } = maxBuyQty(x, ownQty.value, (act.value.my_bought_qty || {})[x._id] || 0);
  if (cur + 1 > max) {
    qty.value = max;
    sync();
    const unit = x.unit || '份';
    const why = reason === 'limit' ? `每人限购 ${x.per_user_limit} ${unit}` : '库存不足';
    uni.showToast({ title: `操作失败：${why}，已改为最多可买的 ${max} ${unit}`, icon: 'none', duration: 2500 });
    return;
  }
  qty.value = cur + 1;
  sync();
};
const dec = () => {
  if (qty.value <= 0) return;
  qty.value -= 1;
  sync();
};

// 点图放大浏览（封面 + 详情图）
const zoom = (i: number) => {
  const urls = images.value.map((x: any) => x.url);
  if (urls.length) uni.previewImage({ urls, current: urls[i] || urls[0] });
};
const backToActivity = () => safeBack('/pages/activity/detail?id=' + activityId.value);

onLoad((q: any = {}) => {
  activityId.value = q.activity_id || '';
  goodsId.value = q.goods_id || '';
  preview.value = q.preview === '1';
  // 从 M-13 进入：拿到当前已选数量，之后的加减实时回传
  try {
    const pages = getCurrentPages();
    const cur: any = pages[pages.length - 1];
    const ec = cur && cur.getOpenerEventChannel && cur.getOpenerEventChannel();
    if (ec && !preview.value) {
      ec.on('init', (d: any) => {
        channel = ec;
        qty.value = (d && d.qty) || 0;
        ownQty.value = (d && d.own_qty) || 0;
      });
    }
  } catch (e) { /* 没有 eventChannel（H5 刷新）：只浏览 */ }
  load();
});

</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding-bottom: calc(150rpx + env(safe-area-inset-bottom)); }
.gallery { position: relative; background: #fff; }
.gallery__swiper { width: 750rpx; height: 750rpx; }
.gallery__img { width: 750rpx; height: 750rpx; display: block; }
.gallery__empty { height: 420rpx; display: flex; align-items: center; justify-content: center; color: $go-placeholder; font-size: 26rpx; background: $go-soft; }
.gallery__idx { position: absolute; right: 24rpx; bottom: 24rpx; font-size: 22rpx; color: #fff; background: rgba(0, 0, 0, 0.4); padding: 4rpx 16rpx; border-radius: 20rpx; }
.gallery__rec { position: absolute; right: 0; top: 0; font-size: 22rpx; font-weight: 700; color: #fff; background: linear-gradient(135deg, #f39b2f, #e2701a); padding: 6rpx 20rpx; border-radius: 0 0 0 20rpx; }
.card { background: #fff; margin-top: 16rpx; padding: 28rpx 32rpx; }
.card--flush { padding: 28rpx 0 0; }
.card__title { font-size: 28rpx; font-weight: 700; color: $go-ink; margin-bottom: 14rpx; }
.card__title--pad { padding: 0 32rpx; }
.price { color: $go-orange; font-size: 28rpx; font-weight: 700; }
.price__n { font-size: 48rpx; }
.price__u { font-size: 24rpx; font-weight: 400; color: $go-muted; }
.name { display: flex; align-items: center; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; font-size: 34rpx; font-weight: 600; color: $go-ink; line-height: 1.4; }
.tag { font-size: 20rpx; font-weight: 600; padding: 2rpx 12rpx; border-radius: 8rpx; }
.tag--red { background: $go-red-soft; color: $go-red; }
.tag--gray { background: $go-tag-bg; color: $go-tag-text; }
.desc { font-size: 27rpx; color: $go-text; line-height: 1.75; white-space: pre-wrap; word-break: break-all; }
.desc--empty { color: $go-placeholder; }
.detail-img { width: 750rpx; display: block; }
.notice { margin: 24rpx 32rpx 0; font-size: 22rpx; color: $go-muted; line-height: 1.6; text-align: center; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 20rpx; padding: 16rpx 28rpx calc(16rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.bar__left { flex: 1; min-width: 0; }
.bar__tip { flex: 1; font-size: 24rpx; color: $go-muted; }
.bar__reason { font-size: 24rpx; color: $go-muted; }
.bar__btn { margin: 0; flex-shrink: 0; border-radius: 40rpx; font-size: 28rpx; padding: 0 48rpx; }
.stepper { display: inline-flex; align-items: center; border: 1rpx solid $go-border; border-radius: 40rpx; overflow: hidden; }
.stepper__btn { width: 72rpx; height: 64rpx; line-height: 64rpx; text-align: center; font-size: 32rpx; color: $go-text; }
.stepper__btn--plus { background: $go-primary; color: #fff; }
.stepper__n { min-width: 72rpx; text-align: center; font-size: 30rpx; color: $go-ink; }
</style>
