<template>
  <view class="page">
    <!-- 左侧分类竖向导航 -->
    <scroll-view class="side" scroll-y :scroll-into-view="'cat-' + activeId">
      <view v-for="c in categories" :key="c.id" :id="'cat-' + c.id"
        class="side-item" :class="{ active: c.id === activeId }" @tap="onSelect(c)">
        <text class="side-name">{{ c.name }}</text>
      </view>
    </scroll-view>

    <!-- 右侧当前分类商品 -->
    <scroll-view class="main" scroll-y>
      <view class="main-title">{{ activeName }}</view>

      <!-- 加载中 -->
      <view v-if="loading" class="tip">加载中…</view>

      <!-- 商品两列 -->
      <view v-else-if="products.length" class="prods">
        <view class="card" v-for="item in products" :key="item.id" @tap="goDetail(item)">
          <view class="card-img">
            <image v-if="isImg(item.cover)" class="card-img-el" :src="item.cover" mode="aspectFill" lazy-load />
            <text v-else class="card-img-emoji">{{ item.cover }}</text>
            <!-- 角标：热卖左上、新品右上 -->
            <image v-if="item.isHot" class="badge badge-tl" src="/static/icon/badge_hot_TL_400.png" />
            <image v-if="item.isNew" class="badge badge-tr" src="/static/icon/badge_new_TR_400.png" />
          </view>
          <view class="card-info">
            <view class="card-name ellipsis-2">{{ item.title }}</view>
            <view class="card-price">
              <text class="price-symbol">¥</text>{{ item.price }}
              <text class="price-old" v-if="item.oldPrice">¥{{ item.oldPrice }}</text>
            </view>
            <view class="card-sold">已售 {{ item.sold }}</view>
          </view>
        </view>
      </view>

      <!-- 空态 -->
      <view v-else class="tip">该分类暂无商品</view>

      <view v-if="!loading && products.length" class="foot-tip">已经到底啦</view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { db } from '@/data'
import { config } from '@/config'
import { isImg } from '@/utils/image'
import { syncCartBadge } from '@/utils/tabbar'
import type { Category, Product } from '@/types'

const categories = ref<Category[]>([])
const products = ref<Product[]>([])
const activeId = ref<number>(0)
const loading = ref(false)

const activeName = computed(() => categories.value.find((c) => c.id === activeId.value)?.name || '')

// 加载分类列表；首次进入或首页联动时确定默认选中的分类
async function loadCategories() {
  if (!categories.value.length) {
    categories.value = await db.getCategories()
  }
}

// 加载某个分类下的商品
async function loadProducts(categoryId: number) {
  loading.value = true
  try {
    // 特产商品量不大，一次性取足；后续如需分页可改为上拉加载
    const res = await db.getProducts({ categoryId, page: 1, pageSize: 100 })
    products.value = res.list
  } finally {
    loading.value = false
  }
}

function onSelect(c: Category) {
  if (c.id === activeId.value) return
  activeId.value = c.id
  loadProducts(c.id)
}

function goDetail(item: Product) {
  uni.navigateTo({ url: '/pages/detail/detail?id=' + item.id })
}

// tabBar 页用 onShow：首页 switchTab 过来时读取待定位的 categoryId
onShow(async () => {
  syncCartBadge()
  await loadCategories()
  if (!categories.value.length) return

  // 首页联动传来的分类 id（消费一次即清除）
  const pending = Number(uni.getStorageSync(config.storageKeys.pendingCategory)) || 0
  if (pending) uni.removeStorageSync(config.storageKeys.pendingCategory)

  const target = pending && categories.value.some((c) => c.id === pending)
    ? pending
    : (activeId.value || categories.value[0].id)

  // 首次进入，或联动指定了新分类时才重新加载
  if (target !== activeId.value || !products.value.length) {
    activeId.value = target
    loadProducts(target)
  }
})
</script>

<style lang="scss" scoped>
.page { display: flex; height: 100vh; background: #fff; }

/* 左侧分类导航 */
.side {
  width: 180rpx;
  height: 100%;
  background: #f4f5f7;
}
.side-item {
  height: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.side-name { font-size: 26rpx; color: $text-main; }
.side-item.active { background: #fff; }
.side-item.active .side-name { color: $brand; font-weight: bold; }
.side-item.active::before {
  content: '';
  position: absolute;
  left: 0; top: 30rpx;
  width: 6rpx; height: 40rpx;
  background: $brand;
  border-radius: 0 6rpx 6rpx 0;
}

/* 右侧商品区 */
.main { flex: 1; height: 100%; padding: 0 12rpx; box-sizing: border-box; }
.main-title { font-size: 30rpx; font-weight: bold; padding: 24rpx 8rpx 12rpx; }

.tip { text-align: center; color: $text-sub; font-size: 26rpx; padding: 120rpx 0; }

/* 商品两列（与首页风格统一） */
.prods { display: flex; flex-wrap: wrap; }
.card {
  width: calc(50% - 16rpx);
  margin: 8rpx;
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  border: 1rpx solid #f0f0f0;
  box-sizing: border-box;
}
.card-img {
  position: relative;
  height: 300rpx;
  background: #f0ddd0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.card-img-el { width: 100%; height: 300rpx; display: block; }
.card-img-emoji { font-size: 72rpx; }
/* 封面角标 */
.badge { position: absolute; top: 0; width: 150rpx; height: 150rpx; z-index: 2; }
.badge-tl { left: 0; }
.badge-tr { right: 0; }
.card-info { padding: 16rpx; }
.card-name { font-size: 26rpx; line-height: 1.4; height: 72rpx; }
.card-price { color: $text-price; font-weight: bold; font-size: 32rpx; margin-top: 8rpx; }
.price-symbol { font-size: 22rpx; }
.price-old { color: #bbb; text-decoration: line-through; font-size: 22rpx; margin-left: 8rpx; font-weight: normal; }
.card-sold { color: $text-sub; font-size: 22rpx; margin-top: 6rpx; }

.foot-tip { text-align: center; color: $text-sub; font-size: 24rpx; padding: 24rpx 0 40rpx; }
</style>
