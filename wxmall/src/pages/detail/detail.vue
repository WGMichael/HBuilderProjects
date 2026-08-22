<template>
  <view class="page" v-if="product">
    <!-- 图片区（轮播） -->
    <swiper class="det-swiper" :indicator-dots="true" :circular="true" indicator-active-color="#e64340">
      <swiper-item v-for="(img, i) in swiperImages" :key="i">
        <image v-if="isImg(img)" class="det-img-el" :src="img" mode="aspectFill" />
        <view v-else class="det-img">{{ img }}</view>
      </swiper-item>
    </swiper>

    <!-- 价格 -->
    <view class="det-price">
      <text class="p-now"><text class="p-symbol">¥</text>{{ curPrice }}</text>
      <!-- 划线价随选中规格变化：sku.oldPrice 优先，缺失回退商品级；高于现价才显示 -->
      <text class="p-old" v-if="curOldPrice > curPrice">¥{{ curOldPrice }}</text>
      <text class="p-sold">已售 {{ product.sold }} 件</text>
    </view>

    <!-- 标题 + 标签 -->
    <view class="det-title-box">
      <view class="tags">
        <text class="tag" v-for="(t, i) in product.tags" :key="i">{{ t }}</text>
      </view>
      <view class="det-title">{{ product.title }}</view>
    </view>

    <!-- 规格 / 库存 / 发货 -->
    <view class="det-row" @tap="openSpec()">
      <text class="row-label">选择规格</text>
      <text class="row-value">{{ curSku.name }} ›</text>
    </view>
    <view class="det-row">
      <text class="row-label">库存</text>
      <text class="row-value">{{ curSku.stock }} 件</text>
    </view>
    <view class="det-row">
      <text class="row-label">限购</text>
      <text class="row-value">每单限购 {{ curLimit }} 件</text>
    </view>

    <!-- 图文详情 -->
    <view class="det-desc">
      <view class="desc-title">商品详情</view>
      <view class="desc-text">{{ product.desc }}</view>
      <view class="desc-imgs">
        <image v-for="(d, i) in product.detailImages" :key="i" v-show="isImg(d)"
          class="desc-img" :src="d" mode="widthFix" lazy-load />
      </view>
    </view>

    <view class="foot-tip">已经到底啦</view>

    <!-- 底部购买栏 -->
    <view class="buy-bar">
      <view class="bar-icons">
        <view class="bar-ic-item" @tap="goHome">
          <text class="bar-ic">🏠</text><text class="bar-ic-txt">首页</text>
        </view>
        <view class="bar-ic-item" @tap="onService">
          <text class="bar-ic">🎧</text><text class="bar-ic-txt">客服</text>
        </view>
      </view>
      <view class="btn btn-cart" @tap="openSpec('cart')">加入购物车</view>
      <view class="btn btn-buy" @tap="openSpec('buy')">立即购买</view>
    </view>

    <!-- 规格选择弹层 -->
    <view class="mask" v-if="specShow" @tap="closeSpec"></view>
    <view class="spec-panel" :class="{ 'spec-show': specShow }">
      <view class="spec-head">
        <view class="spec-thumb">
          <image v-if="isImg(product.cover)" class="spec-thumb-el" :src="product.cover" mode="aspectFill" />
          <text v-else>{{ product.cover }}</text>
        </view>
        <view class="spec-head-info">
          <view class="spec-price"><text class="p-symbol">¥</text>{{ curPrice }}</view>
          <view class="spec-selected">已选：{{ curSku.name }}</view>
        </view>
        <text class="spec-close" @tap="closeSpec">✕</text>
      </view>

      <view class="spec-group">
        <view class="spec-group-title">规格</view>
        <view class="spec-options">
          <view class="spec-opt" v-for="(s, i) in product.skus" :key="s.id"
            :class="{ 'spec-opt-on': curSkuIndex === i }" @tap="selectSku(i)">
            {{ s.name }}
          </view>
        </view>
      </view>

      <view class="spec-group spec-qty-row">
        <view class="spec-qty-label">
          <text class="spec-group-title">数量</text>
          <text class="spec-qty-limit">每单限购 {{ curLimit }} 件</text>
        </view>
        <view class="stepper">
          <text class="step-btn" @tap="changeQty(-1)">-</text>
          <text class="step-num">{{ qty }}</text>
          <text class="step-btn" @tap="changeQty(1)">+</text>
        </view>
      </view>

      <view class="spec-confirm" @tap="confirmSpec">确定</view>
    </view>
  </view>

  <!-- 加载中 -->
  <view class="det-state" v-else-if="loading">
    <text class="state-txt">加载中…</text>
  </view>

  <!-- 商品不存在 / 加载失败 -->
  <view class="det-state" v-else>
    <text class="state-txt">商品不存在或加载失败</text>
    <view class="state-btn" @tap="goHome">回首页</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { db } from '@/data'
import { cartStore, userStore } from '@/store'
import { config } from '@/config'
import { isImg } from '@/utils/image'
import { purchaseCap } from '@/utils/stock'
import type { Product, Sku, CheckoutPayload } from '@/types'

const product = ref<Product | null>(null)
const loading = ref(true)
const curSkuIndex = ref(0)
const qty = ref(1)
const specShow = ref(false)
const action = ref<'buy' | 'cart'>('buy')

const curSku = computed<Sku>(() =>
  product.value?.skus?.[curSkuIndex.value] || {
    // 商品无 sku 时，用商品外层属性拼一个「默认 sku」，保证价格/原价/库存/限购可读，
    // 加购时不会把价格存成 0（skuId=0 + productId 组合仍能保证购物车行唯一）
    id: 0,
    name: '',
    price: product.value?.price ?? 0,
    oldPrice: product.value?.oldPrice,
    stock: product.value?.stock ?? 0,
    limitPerOrder: product.value?.limitPerOrder // 无规格时用商品级限购
  }
)
const curPrice = computed(() => curSku.value.price || product.value?.price || 0)
// 划线价：优先取当前 sku 的 oldPrice，缺失回退到商品级 oldPrice
const curOldPrice = computed(() => curSku.value.oldPrice || product.value?.oldPrice || 0)

// 主图轮播：优先用 images，缺失时回退到 cover，避免空轮播
const swiperImages = computed<string[]>(() => {
  const p = product.value
  if (!p) return []
  if (p.images && p.images.length) return p.images
  return p.cover ? [p.cover] : []
})

onLoad(async (options) => {
  const id = Number(options?.id)
  loading.value = true
  try {
    // 数据向数据层要，页面不关心来源
    product.value = await db.getProductDetail(id)
  } catch (e) {
    product.value = null
  } finally {
    loading.value = false
  }
})

function openSpec(act?: 'buy' | 'cart') {
  if (act) action.value = act
  specShow.value = true
}
function closeSpec() {
  specShow.value = false
}
// 当前规格数量上限 = min(库存, 单次限购)；0/缺省视为不限
const qtyCap = computed(() => purchaseCap(curSku.value.stock, curSku.value.limitPerOrder))
// 单次限购展示值：未设置默认 1
const curLimit = computed(() => {
  const l = curSku.value.limitPerOrder
  return l && l > 0 ? l : 1
})

function selectSku(i: number) {
  curSkuIndex.value = i
  // 切换规格后，数量不超过新规格上限
  if (qty.value > qtyCap.value) qty.value = qtyCap.value
}
function changeQty(d: number) {
  const n = qty.value + d
  if (n < 1) return
  if (n > qtyCap.value) {
    uni.showToast({ title: `最多可购 ${qtyCap.value} 件`, icon: 'none' })
    return
  }
  qty.value = n
}
function confirmSpec() {
  specShow.value = false
  if (!product.value) return
  if (action.value === 'cart') {
    cartStore.add(product.value, curSku.value, qty.value)
    uni.showToast({ title: '已加入购物车', icon: 'success' })
    return
  }
  // 立即购买：不经购物车，带一件商品直接去确认订单页
  if (!userStore.isLogin.value) {
    userStore.toLogin()
    return
  }
  const payload: CheckoutPayload = {
    from: 'buynow',
    goods: [{
      productId: product.value.id,
      skuId: curSku.value.id,
      title: product.value.title,
      cover: product.value.cover,
      specName: curSku.value.name,
      price: curSku.value.price,
      qty: qty.value
    }]
  }
  uni.setStorageSync(config.storageKeys.checkout, payload)
  uni.navigateTo({ url: '/pages/order/confirm/confirm' })
}
function goHome() {
  uni.switchTab({ url: '/pages/index/index' })
}
function onService() {
  uni.showToast({ title: '客服待接入', icon: 'none' })
}
</script>

<style lang="scss" scoped>
.page { padding-bottom: 130rpx; }

/* 图片区 */
.det-swiper { height: 560rpx; }
.det-img-el { width: 100%; height: 560rpx; display: block; }
.det-img {
  height: 560rpx;
  background: linear-gradient(135deg, #f6c48b, #e8a55f);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 180rpx;
}

/* 加载 / 兜底状态 */
.det-state {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.state-txt { color: $text-sub; font-size: 28rpx; }
.state-btn {
  margin-top: 24rpx;
  background: $brand;
  color: #fff;
  font-size: 26rpx;
  padding: 14rpx 48rpx;
  border-radius: 40rpx;
}

/* 价格 */
.det-price { background: #fff; padding: 24rpx; display: flex; align-items: baseline; }
.p-now { color: $text-price; font-size: 52rpx; font-weight: 800; }
.p-symbol { font-size: 30rpx; }
.p-old { color: #bbb; text-decoration: line-through; font-size: 26rpx; margin-left: 16rpx; }
.p-sold { margin-left: auto; font-size: 24rpx; color: $text-sub; }

/* 标题 */
.det-title-box { background: #fff; padding: 0 24rpx 24rpx; }
.tags { display: flex; margin-bottom: 12rpx; }
.tag {
  background: $brand-light;
  color: $brand;
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  margin-right: 12rpx;
}
.det-title { font-size: 34rpx; font-weight: bold; line-height: 1.4; }

/* 行 */
.det-row {
  background: #fff;
  margin-top: 16rpx;
  padding: 26rpx 24rpx;
  display: flex;
  justify-content: space-between;
  font-size: 28rpx;
}
.row-label { color: #555; }
.row-value { color: #333; }

/* 详情 */
.det-desc { background: #fff; margin-top: 16rpx; padding: 24rpx; }
.desc-title { font-size: 30rpx; font-weight: bold; margin-bottom: 16rpx; }
.desc-text { font-size: 28rpx; color: #444; line-height: 1.8; display: block; }
.desc-imgs { display: flex; flex-direction: column; }
.desc-img { width: 100%; display: block; border-radius: 12rpx; margin-top: 16rpx; }
.desc-ph {
  height: 300rpx;
  background: #f3ede7;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  color: #caa;
  margin-top: 16rpx;
}
.foot-tip { text-align: center; color: $text-sub; font-size: 24rpx; margin: 30rpx 0; }

/* 底部购买栏 */
.buy-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  background: #fff;
  border-top: 1rpx solid $border-line;
  display: flex;
  align-items: center;
  padding: 14rpx 20rpx;
  padding-bottom: calc(14rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(14rpx + env(safe-area-inset-bottom));
}
.bar-icons { display: flex; }
.bar-ic-item { display: flex; flex-direction: column; align-items: center; margin-right: 28rpx; }
.bar-ic { font-size: 36rpx; }
.bar-ic-txt { font-size: 20rpx; color: #666; }
.btn {
  flex: 1;
  text-align: center;
  padding: 22rpx 0;
  border-radius: 44rpx;
  font-size: 28rpx;
  font-weight: bold;
  color: #fff;
  margin-left: 16rpx;
}
.btn-cart { background: #ffb100; }
.btn-buy { background: $brand; }

/* 规格弹层 */
.mask {
  position: fixed;
  left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,.45);
  z-index: 90;
}
.spec-panel {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 24rpx 24rpx 40rpx;
  z-index: 100;
  /* +60rpx 是为了把缩略图负 margin 翘出面板顶部的那截一并藏到屏外，避免关闭时左下角漏出封面 */
  transform: translateY(calc(100% + 60rpx));
  transition: transform .25s ease;
}
.spec-show { transform: translateY(0); }
.spec-head { display: flex; align-items: flex-end; position: relative; }
.spec-thumb {
  width: 140rpx; height: 140rpx;
  background: #f0ddd0; border-radius: 12rpx;
  display: flex; align-items: center; justify-content: center;
  font-size: 60rpx; margin-top: -50rpx;
  overflow: hidden;
}
.spec-thumb-el { width: 140rpx; height: 140rpx; border-radius: 12rpx; display: block; }
.spec-head-info { margin-left: 20rpx; flex: 1; }
.spec-price { color: $text-price; font-size: 40rpx; font-weight: bold; }
.spec-selected { font-size: 24rpx; color: #666; margin-top: 8rpx; }
.spec-close { position: absolute; right: 0; top: 0; font-size: 36rpx; color: #999; }

.spec-group { margin-top: 30rpx; }
.spec-group-title { font-size: 28rpx; color: #333; margin-bottom: 16rpx; }
.spec-options { display: flex; flex-wrap: wrap; }
.spec-opt {
  border: 1rpx solid #ddd;
  border-radius: 30rpx;
  padding: 12rpx 30rpx;
  font-size: 26rpx;
  color: #555;
  margin: 0 16rpx 16rpx 0;
}
.spec-opt-on { border-color: $brand; color: $brand; background: $brand-light; }

.spec-qty-row { display: flex; justify-content: space-between; align-items: center; }
.spec-qty-label { display: flex; flex-direction: column; }
.spec-qty-label .spec-group-title { margin-bottom: 4rpx; }
.spec-qty-limit { font-size: 22rpx; color: $text-sub; }
.stepper { display: flex; align-items: center; border: 1rpx solid $border-line; border-radius: 8rpx; overflow: hidden; }
.step-btn { padding: 8rpx 26rpx; background: #f6f7f9; font-size: 34rpx; }
.step-num { padding: 8rpx 32rpx; font-size: 28rpx; }

.spec-confirm {
  margin-top: 40rpx;
  background: $brand;
  color: #fff;
  text-align: center;
  padding: 24rpx 0;
  border-radius: 44rpx;
  font-size: 30rpx;
  font-weight: bold;
}
</style>
