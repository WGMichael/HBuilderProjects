<!--
  M-11 商品编辑

  职责：名称、价格、单位、总库存、每人限购、图片和说明；0 值表示对应上限不受限。
  D-044：total_stock=0 表示不设上限（不是售罄）；per_user_limit=0 表示不限购。
  改价可能触发服务端二次确认（confirm_price_change），命中时提示后重发。
  图片先选后传（common/grouporder/upload.js）：点「保存」时才上传；封面必填、详情图选填最多 9 张（D-041）。
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
      <text class="label">商品封面图 <text class="req">*</text></text>
      <view class="imgs">
        <view v-if="cover.length" class="img">
          <image class="img-pic" :src="cover[0].preview" mode="aspectFill" @click="chooseCover" />
          <text class="img-del" @click="cover = []">×</text>
        </view>
        <view v-else class="img-add" @click="chooseCover">＋</view>
      </view>
      <text class="label label--sub">详情图（选填，最多 {{ MAX_IMAGES }} 张）</text>
      <view class="imgs">
        <view v-for="(it, i) in details" :key="i" class="img">
          <image class="img-pic" :src="it.preview" mode="aspectFill" />
          <text class="img-del" @click="details.splice(i, 1)">×</text>
        </view>
        <view v-if="details.length < MAX_IMAGES" class="img-add" @click="chooseDetails">＋</view>
      </view>
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
// @ts-ignore
import { toItem, pickImages, imageDir, uploadPending } from '@/common/grouporder/upload.js';

const MAX_IMAGES = 9;

const activityId = ref('');
const goodsId = ref('');
const saving = ref(false);
const priceYuan = ref('');
const form = ref<any>({ name: '', unit: '份', total_stock: 0, per_user_limit: 0, description: '', is_recommend: 0 });
// 图片 item 见 upload.js；封面最多 1 张
const cover = ref<any[]>([]);
const details = ref<any[]>([]);
// 所属活动的创建日期，决定图片的云存储目录
const createDate = ref<number>(0);
let eventChannel: any = null;

const valid = computed(() => !!form.value.name.trim() && priceYuan.value !== '' && Number(priceYuan.value) >= 0);

const onRecommend = (e: any) => { form.value.is_recommend = e.detail.value ? 1 : 0; };

const load = async () => {
  if (!activityId.value) return;
  // 新增也要读一次活动：图片目录按活动创建日期；编辑时顺带取该商品的当前值
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  createDate.value = data.create_date || 0;
  const g = goodsId.value && (data.goods || []).find((x: any) => x._id === goodsId.value);
  if (g) {
    form.value = {
      name: g.name, unit: g.unit, total_stock: g.total_stock, per_user_limit: g.per_user_limit,
      description: g.description || '', is_recommend: g.is_recommend || 0,
    };
    cover.value = g.cover_image ? [toItem(g.cover_image)] : [];
    details.value = (g.detail_images || []).map(toItem);
    priceYuan.value = fen2yuan(g.price);
  }
};

// —— 图片：只记本地路径，点保存时才上传 ——
const chooseCover = async () => {
  const picked = await pickImages(1);
  if (picked.length) cover.value = picked;
};
const chooseDetails = async () => {
  const picked = await pickImages(MAX_IMAGES - details.value.length);
  details.value = details.value.concat(picked);
};

const save = async () => {
  if (!valid.value) return;
  if (!cover.value.length) {
    uni.showToast({ title: '请上传商品封面图', icon: 'none' });
    return;
  }
  const price = Math.round(Number(priceYuan.value) * 100);
  saving.value = true;
  try {
    uni.showLoading({ title: '上传图片中', mask: true });
    try {
      const dir = imageDir(createDate.value, activityId.value);
      await uploadPending(cover.value, dir, 'goods_cover');
      await uploadPending(details.value, dir, 'goods_img');
    } catch (e) {
      uni.showModal({ content: '图片上传失败，请重试', showCancel: false });
      return;
    } finally {
      // 要在保存请求之前关：小程序 loading 与 toast 共用一个层，晚关会把接口的错误提示一起关掉
      uni.hideLoading();
    }
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
          cover_image: cover.value[0].file,
          detail_images: details.value.map((it) => it.file),
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
        cover_image: cover.value[0].file,
        detail_images: details.value.map((it) => it.file),
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
  load();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 20rpx; padding-bottom: 160rpx; background: #f4f5f7; }
.field { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.field--row { display: flex; align-items: center; justify-content: space-between; }
.label { font-size: 26rpx; color: #606266; }
.req { color: #fa3534; }
.input { margin-top: 12rpx; font-size: 30rpx; color: #303133; }
.label--sub { display: block; margin-top: 24rpx; }
.imgs { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.img { position: relative; width: 160rpx; height: 160rpx; }
.img-pic { width: 160rpx; height: 160rpx; border-radius: 8rpx; background: #f5f5f5; }
.img-del { position: absolute; top: -12rpx; right: -12rpx; width: 36rpx; height: 36rpx; line-height: 34rpx; text-align: center; font-size: 28rpx; color: #fff; background: rgba(0, 0, 0, 0.55); border-radius: 50%; }
.img-add { width: 160rpx; height: 160rpx; line-height: 160rpx; text-align: center; font-size: 56rpx; color: #c0c4cc; border: 1rpx dashed #dcdfe6; border-radius: 8rpx; }
.textarea { margin-top: 12rpx; width: 100%; height: 140rpx; font-size: 28rpx; }
.tip { display: block; font-size: 22rpx; color: #909399; margin-top: 8rpx; }
.tip--block { padding: 0 24rpx; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.save { margin: 0; font-size: 30rpx; }
</style>
