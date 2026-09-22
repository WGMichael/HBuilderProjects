<!--
  M-11 商品编辑

  职责：名称、价格、单位、总库存、每人限购、图片和说明；0 值表示对应上限不受限。
  D-044：total_stock=0 表示不设上限（不是售罄）；per_user_limit=0 表示不限购。
  改价可能触发服务端二次确认（confirm_price_change），命中时提示后重发。
-->
<template>
  <view class="page">
    <view class="field">
      <text class="label">商品名称 <text class="req">*</text></text>
      <input class="input" v-model="form.name" placeholder="商品名称" maxlength="40" />
    </view>
    <view class="field">
      <text class="label">单价（元）<text class="req">*</text></text>
      <input class="input" v-model="priceYuan" type="digit" placeholder="0.00" />
    </view>
    <view class="field">
      <text class="label">单位</text>
      <input class="input" v-model="form.unit" placeholder="份 / 盒 / 箱…" maxlength="10" />
    </view>
    <view class="field">
      <text class="label">总库存</text>
      <input class="input" v-model.number="form.total_stock" type="number" placeholder="0 表示不设上限" />
      <text class="tip">0 表示不设上限，不是售罄</text>
    </view>
    <view class="field">
      <text class="label">每人限购</text>
      <input class="input" v-model.number="form.per_user_limit" type="number" placeholder="0 表示不限购" />
      <text class="tip">0 表示不限购；按同一用户对同一商品的累计有效份数校验</text>
    </view>
    <view class="field">
      <text class="label">商品说明</text>
      <textarea class="textarea" v-model="form.description" placeholder="选填" maxlength="300" />
    </view>
    <view class="field field--row">
      <text class="label">推荐商品</text>
      <switch :checked="form.is_recommend === 1" @change="onRecommend" color="#2979ff" />
    </view>
    <view class="tip tip--block">推荐只表现为角标与高亮，不改变排序位置（D-065）。</view>

    <view class="footer">
      <button class="save" type="primary" :loading="saving" :disabled="!valid" @click="save">保存</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const goodsId = ref('');
const saving = ref(false);
const priceYuan = ref('');
const form = ref<any>({ name: '', unit: '份', total_stock: 0, per_user_limit: 0, description: '', is_recommend: 0, cover_image: null, detail_images: [] });
let eventChannel: any = null;

const valid = computed(() => !!form.value.name.trim() && priceYuan.value !== '' && Number(priceYuan.value) >= 0);

const onRecommend = (e: any) => { form.value.is_recommend = e.detail.value ? 1 : 0; };

const load = async () => {
  if (!goodsId.value || !activityId.value) return;
  // 编辑：从活动详情里取该商品的当前值
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  const g = (data.goods || []).find((x: any) => x._id === goodsId.value);
  if (g) {
    form.value = {
      name: g.name, unit: g.unit, total_stock: g.total_stock, per_user_limit: g.per_user_limit,
      description: g.description || '', is_recommend: g.is_recommend || 0,
      cover_image: g.cover_image || null, detail_images: g.detail_images || [],
    };
    priceYuan.value = fen2yuan(g.price);
  }
};

const save = async () => {
  if (!valid.value) return;
  const price = Math.round(Number(priceYuan.value) * 100);
  saving.value = true;
  try {
    if (goodsId.value) {
      await submitUpdate(price, false);
    } else {
      await guarded(
        api.activity.goodsCreate({
          activity_id: activityId.value,
          name: form.value.name.trim(),
          price,
          unit: form.value.unit,
          total_stock: form.value.total_stock || 0,
          per_user_limit: form.value.per_user_limit || 0,
          description: form.value.description.trim(),
          is_recommend: form.value.is_recommend,
          cover_image: form.value.cover_image,
          detail_images: form.value.detail_images,
        })
      );
    }
    if (eventChannel && eventChannel.emit) eventChannel.emit('saved');
    uni.navigateBack();
  } catch (e) {
    /* 统一提示 */
  } finally {
    saving.value = false;
  }
};

const submitUpdate = async (price: number, confirmPriceChange: boolean) => {
  try {
    await api.activity.goodsUpdate(
      {
        goods_id: goodsId.value,
        name: form.value.name.trim(),
        price,
        unit: form.value.unit,
        total_stock: form.value.total_stock || 0,
        per_user_limit: form.value.per_user_limit || 0,
        description: form.value.description.trim(),
        is_recommend: form.value.is_recommend,
        cover_image: form.value.cover_image,
        detail_images: form.value.detail_images,
        confirm_price_change: confirmPriceChange,
      },
      { silent: true }
    );
  } catch (err: any) {
    // 已产生订单的商品改价需二次确认
    if (err && err.errCode === 'PRICE_CHANGE_NEED_CONFIRM' && !confirmPriceChange) {
      const r = await uni.showModal({ title: '确认改价', content: err.errMsg || '该商品已产生订单，改价将影响后续下单，确认继续？' });
      if (r.confirm) return submitUpdate(price, true);
      throw new Error('cancelled');
    }
    throw err;
  }
};

onLoad((q: any = {}) => {
  activityId.value = q.activity_id || '';
  goodsId.value = q.goods_id || '';
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
  if (goodsId.value) load();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 20rpx; padding-bottom: 160rpx; background: #f4f5f7; }
.field { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.field--row { display: flex; align-items: center; justify-content: space-between; }
.label { font-size: 26rpx; color: #606266; }
.req { color: #fa3534; }
.input { margin-top: 12rpx; font-size: 30rpx; color: #303133; }
.textarea { margin-top: 12rpx; width: 100%; height: 140rpx; font-size: 28rpx; }
.tip { display: block; font-size: 22rpx; color: #909399; margin-top: 8rpx; }
.tip--block { padding: 0 24rpx; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.save { margin: 0; font-size: 30rpx; }
</style>
