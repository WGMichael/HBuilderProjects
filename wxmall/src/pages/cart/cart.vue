<template>
  <!-- 有商品：工具条 + 列表 + 底部栏 -->
  <view class="page" v-if="items.length">
    <!-- 顶部工具条：件数 + 管理/完成 -->
    <view class="toolbar">
      <text class="tb-count">共 {{ items.length }} 件</text>
      <text class="tb-manage" @tap="toggleManage">{{ managing ? '完成' : '管理' }}</text>
    </view>

    <!-- 有效商品列表（支持左滑删除） -->
    <view class="cart-list">
      <view class="row" v-for="it in validItems" :key="keyOf(it)">
        <!-- 底层：左滑露出的删除按钮 -->
        <view class="row-del" @tap="onSwipeDelete(it)">删除</view>

        <!-- 内容层：可左滑 -->
        <view class="cart-item" :style="rowStyle(it)"
          @touchstart="onTouchStart($event, it)"
          @touchmove="onTouchMove($event, it)"
          @touchend="onTouchEnd(it)">
          <!-- 勾选 -->
          <view class="check" :class="{ on: it.checked }" @tap="cartStore.toggle(it.productId, it.skuId)">
            <text v-if="it.checked" class="check-ic">✓</text>
          </view>

          <!-- 封面：图片 URL 用 image，emoji 用文字 -->
          <view class="thumb">
            <image v-if="isImg(it.cover)" class="thumb-el" :src="it.cover" mode="aspectFill" lazy-load />
            <text v-else>{{ it.cover }}</text>
          </view>

          <!-- 信息 -->
          <view class="info">
            <view class="title ellipsis-2">{{ it.title }}</view>
            <view class="spec">{{ it.specName }}</view>
            <view class="info-row">
              <view class="price"><text class="symbol">¥</text>{{ it.price }}</view>
              <view class="stepper">
                <text class="step-btn" :class="{ disabled: it.qty <= 1 }" @tap="dec(it)">-</text>
                <!-- 数量可直接键盘输入，失焦校验 -->
                <input class="step-num" type="number" :value="String(it.qty)" @blur="onQtyBlur(it, $event)" />
                <text class="step-btn" @tap="inc(it)">+</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 失效商品区 -->
    <view class="invalid-sec" v-if="invalidItems.length">
      <view class="invalid-head">
        <text class="invalid-title">失效商品 {{ invalidItems.length }} 件</text>
        <text class="invalid-clear" @tap="onClearInvalid">清空失效商品</text>
      </view>
      <view class="cart-item invalid" v-for="it in invalidItems" :key="keyOf(it)">
        <text class="invalid-tag">失效</text>
        <view class="thumb dim">
          <image v-if="isImg(it.cover)" class="thumb-el" :src="it.cover" mode="aspectFill" lazy-load />
          <text v-else>{{ it.cover }}</text>
        </view>
        <view class="info dim">
          <view class="title ellipsis-2">{{ it.title }}</view>
          <view class="spec">{{ it.specName }}</view>
          <view class="invalid-reason">商品已下架或售罄</view>
        </view>
      </view>
    </view>

    <view class="foot-tip">已经到底啦</view>

    <!-- 底部栏 -->
    <view class="settle-bar">
      <view class="check all" :class="{ on: allChecked }" @tap="toggleAll">
        <text v-if="allChecked" class="check-ic">✓</text>
      </view>
      <text class="all-txt" @tap="toggleAll">全选</text>

      <!-- 正常态：合计 + 结算 -->
      <template v-if="!managing">
        <view class="total">
          合计：<text class="total-price"><text class="symbol">¥</text>{{ totalPrice }}</text>
        </view>
        <view class="settle-btn" @tap="onSettle">结算({{ totalCount }})</view>
      </template>

      <!-- 管理态：清空 + 删除选中 -->
      <view v-else class="manage-actions">
        <view class="mng-btn ghost" @tap="onClear">清空</view>
        <view class="mng-btn danger" @tap="onRemoveChecked">删除({{ checkedCount }})</view>
      </view>
    </view>
  </view>

  <!-- 空购物车 -->
  <view class="empty" v-else>
    <text class="empty-ic">🛒</text>
    <text class="empty-txt">购物车还是空的</text>
    <view class="go-btn" @tap="goShopping">去逛逛</view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { cartStore, userStore } from '@/store'
import { db } from '@/data'
import { config } from '@/config'
import { isImg } from '@/utils/image'
import { syncCartBadge } from '@/utils/tabbar'
import { purchaseCap } from '@/utils/stock'
import type { CartItem, Product, OrderGoods, CheckoutPayload } from '@/types'

const items = computed(() => cartStore.state.items)
const totalPrice = cartStore.totalPrice // 选中商品总价（只算勾选项；失效项已强制取消勾选）
const totalCount = cartStore.totalCount // 选中商品总件数

// 购物车行唯一键
function keyOf(it: CartItem) {
  return it.productId + '_' + it.skuId
}

/* ============ 失效商品（进页面重新校验：已删 / 售罄） ============ */
const invalidKeys = ref<Set<string>>(new Set())
const validItems = computed(() => items.value.filter((i) => !invalidKeys.value.has(keyOf(i))))
const invalidItems = computed(() => items.value.filter((i) => invalidKeys.value.has(keyOf(i))))

// 全选 / 删除选中 只针对「有效商品」
const allChecked = computed(() => validItems.value.length > 0 && validItems.value.every((i) => i.checked))
const checkedCount = computed(() => validItems.value.filter((i) => i.checked).length)

const managing = ref(false) // 管理/编辑态

/* ============ 左滑删除（自写轻量 swipe，一次只开一行） ============ */
const DELETE_W = 140 // 删除按钮宽度（rpx）
const rpxScale = 750 / (uni.getSystemInfoSync().windowWidth || 375) // px -> rpx 换算
const openKey = ref('') // 当前展开的行 key
const dragKey = ref('') // 正在拖动的行 key
const dragX = ref(0) // 拖动中的实时位移（rpx）
let startX = 0
let startY = 0
let baseX = 0
let lockDir: '' | 'h' | 'v' = '' // 手势方向锁：横向才触发左滑，纵向让页面滚动

function rowStyle(it: CartItem) {
  const k = keyOf(it)
  let x = openKey.value === k ? -DELETE_W : 0
  if (dragKey.value === k) x = dragX.value
  return {
    transform: `translateX(${x}rpx)`,
    transition: dragKey.value === k ? 'none' : 'transform .2s'
  }
}

function onTouchStart(e: any, it: CartItem) {
  const k = keyOf(it)
  if (openKey.value && openKey.value !== k) openKey.value = '' // 打开别行前先关掉已开的
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
  baseX = openKey.value === k ? -DELETE_W : 0
  dragKey.value = k
  dragX.value = baseX
  lockDir = ''
}

function onTouchMove(e: any, it: CartItem) {
  if (dragKey.value !== keyOf(it)) return
  const dxPx = e.touches[0].clientX - startX
  const dyPx = e.touches[0].clientY - startY
  if (!lockDir) {
    if (Math.abs(dxPx) < 8 && Math.abs(dyPx) < 8) return
    lockDir = Math.abs(dxPx) > Math.abs(dyPx) ? 'h' : 'v'
  }
  if (lockDir === 'v') return // 纵向滑动交给页面滚动
  let x = baseX + dxPx * rpxScale
  if (x < -DELETE_W) x = -DELETE_W
  if (x > 0) x = 0
  dragX.value = x
}

function onTouchEnd(it: CartItem) {
  const k = keyOf(it)
  if (dragKey.value !== k) return
  openKey.value = dragX.value <= -DELETE_W / 2 ? k : '' // 滑过一半判定为打开
  dragKey.value = ''
}

function closeSwipe() {
  openKey.value = ''
  dragKey.value = ''
}

function onSwipeDelete(it: CartItem) {
  cartStore.remove(it.productId, it.skuId)
  closeSwipe()
}

/* ============ 数量 ============ */
function inc(it: CartItem) {
  const cap = purchaseCap(it.stock, it.limitPerOrder)
  if (it.qty >= cap) {
    uni.showToast({ title: `最多可购 ${cap} 件`, icon: 'none' })
    return
  }
  cartStore.updateQty(it.productId, it.skuId, it.qty + 1)
}
function dec(it: CartItem) {
  if (it.qty > 1) cartStore.updateQty(it.productId, it.skuId, it.qty - 1)
}
// 直接输入数量：失焦校验，非法/空回退为 1，超上限（库存/限购）夹回并提示
function onQtyBlur(it: CartItem, e: any) {
  const raw = parseInt(e.detail.value, 10)
  let n = Number.isFinite(raw) && raw >= 1 ? raw : 1
  const cap = purchaseCap(it.stock, it.limitPerOrder)
  if (n > cap) {
    n = cap
    uni.showToast({ title: `最多可购 ${cap} 件`, icon: 'none' })
  }
  cartStore.updateQty(it.productId, it.skuId, n)
}

/* ============ 勾选 / 删除 ============ */
function toggleAll() {
  const target = !allChecked.value
  validItems.value.forEach((it) => {
    if (it.checked !== target) cartStore.toggle(it.productId, it.skuId)
  })
}

// 管理态：删除选中（只会删到勾选的有效项）
function onRemoveChecked() {
  if (checkedCount.value === 0) {
    uni.showToast({ title: '请选择商品', icon: 'none' })
    return
  }
  uni.showModal({
    title: '提示',
    content: `确定删除选中的 ${checkedCount.value} 件商品？`,
    success: (res) => {
      if (!res.confirm) return
      cartStore.removeChecked()
      if (!items.value.length) managing.value = false
    }
  })
}

// 管理态：清空购物车（含失效项）
function onClear() {
  uni.showModal({
    title: '提示',
    content: '确定清空购物车？',
    success: (res) => {
      if (!res.confirm) return
      cartStore.clear()
      invalidKeys.value = new Set()
      managing.value = false
    }
  })
}

// 清空失效商品
function onClearInvalid() {
  const n = invalidItems.value.length
  if (!n) return
  uni.showModal({
    title: '提示',
    content: `确定清空 ${n} 件失效商品？`,
    success: (res) => {
      if (!res.confirm) return
      cartStore.removeByKeys(invalidItems.value.map(keyOf))
      invalidKeys.value = new Set()
    }
  })
}

function onSettle() {
  if (totalCount.value === 0) {
    uni.showToast({ title: '请先选择商品', icon: 'none' })
    return
  }
  if (!userStore.isLogin.value) {
    userStore.toLogin()
    return
  }
  // 勾选的有效项 → 结算清单，写 storage 传给确认订单页
  const goods: OrderGoods[] = validItems.value
    .filter((i) => i.checked)
    .map((i) => ({
      productId: i.productId,
      skuId: i.skuId,
      title: i.title,
      cover: i.cover,
      specName: i.specName,
      price: i.price,
      qty: i.qty
    }))
  const payload: CheckoutPayload = { from: 'cart', goods }
  uni.setStorageSync(config.storageKeys.checkout, payload)
  uni.navigateTo({ url: '/pages/order/confirm/confirm' })
}

function goShopping() {
  uni.switchTab({ url: '/pages/index/index' })
}
function toggleManage() {
  managing.value = !managing.value
}

/* ============ 失效校验 ============ */
// 进页面时按 productId 重新拉商品，判定失效：商品已删 / 规格不存在 / 库存<=0（售罄）
// 注：下架(onSale) 目前云函数详情不返回，暂无法探测，待后端暴露可售标志后补
async function validateCart() {
  const list = items.value
  if (!list.length) {
    invalidKeys.value = new Set()
    return
  }
  const ids = [...new Set(list.map((i) => i.productId))]
  try {
    const results = await Promise.all(ids.map((id) => db.getProductDetail(id).catch(() => null)))
    const map = new Map<number, Product | null>()
    ids.forEach((id, i) => map.set(id, results[i]))

    const invalid = new Set<string>()
    const stockUpdates: { productId: number; skuId: number; stock?: number; limitPerOrder?: number }[] = []
    for (const it of list) {
      const p = map.get(it.productId)
      let bad = false
      let curStock: number | undefined
      let curLimit: number | undefined
      if (!p) {
        bad = true // 商品已删/不存在
      } else if (it.skuId === 0) {
        curStock = p.stock
        curLimit = p.limitPerOrder // 无 sku 商品用商品级限购
        if ((p.stock ?? 0) <= 0) bad = true // 无 sku 商品看商品级库存
      } else {
        const sku = p.skus?.find((s) => s.id === it.skuId)
        if (!sku) bad = true // 规格已删
        else {
          curStock = sku.stock
          curLimit = sku.limitPerOrder
          if ((sku.stock ?? 0) <= 0) bad = true // 售罄
        }
      }
      if (bad) {
        invalid.add(keyOf(it))
        if (it.checked) cartStore.toggle(it.productId, it.skuId) // 失效项取消勾选，不计入合计
      } else {
        // 有效项：记录最新库存 / 限购，稍后刷新快照（覆盖旧数据 / 后台变动）
        stockUpdates.push({ productId: it.productId, skuId: it.skuId, stock: curStock, limitPerOrder: curLimit })
      }
    }
    if (stockUpdates.length) cartStore.syncStocks(stockUpdates)
    invalidKeys.value = invalid
  } catch (e) {
    console.warn('[cart] 失效商品校验失败', e)
  }
}

onShow(() => {
  managing.value = false // 每次进入复位为非管理态
  closeSwipe()
  syncCartBadge()
  validateCart()
})
</script>

<style lang="scss" scoped>
.page { padding-bottom: 140rpx; }

/* 顶部工具条 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 28rpx 0;
}
.tb-count { font-size: 24rpx; color: $text-sub; }
.tb-manage { font-size: 26rpx; color: $text-main; }

/* 列表 */
.cart-list { padding: 20rpx; }

/* 左滑行容器 */
.row {
  position: relative;
  margin-bottom: 20rpx;
  border-radius: $radius-card;
  overflow: hidden;
}
.row-del {
  position: absolute;
  right: 0; top: 0; bottom: 0;
  width: 140rpx;
  background: $brand;
  color: #fff;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cart-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  background: $bg-card;
  padding: 20rpx;
  will-change: transform;
}

/* 勾选圆圈 */
.check {
  width: 40rpx;
  height: 40rpx;
  border: 2rpx solid #ccc;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.check.on { background: $brand; border-color: $brand; }
.check-ic { color: #fff; font-size: 26rpx; }

/* 封面 */
.thumb {
  width: 140rpx;
  height: 140rpx;
  background: #f0ddd0;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 72rpx;
  margin: 0 20rpx;
  flex-shrink: 0;
  overflow: hidden;
}
.thumb-el { width: 140rpx; height: 140rpx; display: block; }

/* 信息 */
.info { flex: 1; min-width: 0; align-self: stretch; display: flex; flex-direction: column; }
.title { font-size: 28rpx; line-height: 1.4; color: $text-main; }
.spec { font-size: 24rpx; color: $text-sub; margin-top: 8rpx; }
.info-row {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.price { color: $text-price; font-weight: bold; font-size: 32rpx; }
.symbol { font-size: 22rpx; }

/* 数量加减 */
.stepper {
  display: flex;
  align-items: center;
  border: 1rpx solid $border-line;
  border-radius: 8rpx;
  overflow: hidden;
}
.step-btn { padding: 6rpx 22rpx; background: #f6f7f9; font-size: 32rpx; color: #333; }
.step-btn.disabled { color: #ccc; }
.step-num {
  width: 64rpx;
  padding: 6rpx 0;
  font-size: 26rpx;
  text-align: center;
  background: #fff;
}

.foot-tip { text-align: center; color: $text-sub; font-size: 24rpx; margin-top: 10rpx; }

/* 失效商品区 */
.invalid-sec { padding: 0 20rpx; }
.invalid-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 4rpx 16rpx;
}
.invalid-title { font-size: 26rpx; color: $text-main; }
.invalid-clear { font-size: 24rpx; color: $text-sub; }
.cart-item.invalid {
  border-radius: $radius-card;
  margin-bottom: 20rpx;
}
.invalid-tag {
  flex-shrink: 0;
  font-size: 20rpx;
  color: #fff;
  background: #b0b3b8;
  padding: 4rpx 10rpx;
  border-radius: 6rpx;
}
.dim { opacity: .45; }
.invalid-reason { font-size: 22rpx; color: $text-sub; margin-top: 8rpx; }

/* 底部栏 */
.settle-bar {
  position: fixed;
  left: 0; right: 0;
  bottom: 0;
  /* #ifdef H5 */
  /* H5 的 tabBar 是 bottom:0 的固定元素，用 uni 内置变量抬到 tabBar 正上方，避免被遮挡；
     小程序端原生 tabBar 不占 webview，保持 bottom:0 即可 */
  bottom: var(--window-bottom);
  /* #endif */
  background: #fff;
  border-top: 1rpx solid $border-line;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.all-txt { font-size: 26rpx; color: $text-main; margin-left: 12rpx; }
.total { margin-left: auto; font-size: 26rpx; color: $text-main; }
.total-price { color: $text-price; font-weight: bold; font-size: 36rpx; }
.settle-btn {
  background: $brand;
  color: #fff;
  font-size: 28rpx;
  font-weight: bold;
  padding: 20rpx 44rpx;
  border-radius: 40rpx;
  margin-left: 20rpx;
}

/* 管理态操作 */
.manage-actions { margin-left: auto; display: flex; align-items: center; }
.mng-btn {
  font-size: 26rpx;
  padding: 16rpx 36rpx;
  border-radius: 40rpx;
  margin-left: 16rpx;
}
.mng-btn.ghost { border: 1rpx solid #ccc; color: #666; }
.mng-btn.danger { background: $brand; color: #fff; font-weight: bold; }

/* 空状态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0 40rpx;
}
.empty-ic { font-size: 120rpx; }
.empty-txt { font-size: 28rpx; color: $text-sub; margin-top: 24rpx; }
.go-btn {
  margin-top: 40rpx;
  background: $brand;
  color: #fff;
  font-size: 28rpx;
  padding: 18rpx 60rpx;
  border-radius: 40rpx;
}
</style>
