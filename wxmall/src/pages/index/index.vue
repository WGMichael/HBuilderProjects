<template>
  <view class="page">
    <!-- 搜索栏 -->
    <view class="search-bar" @tap="onSearch">
      <text class="search-ic">🔍</text>
      <text class="search-ph">搜一搜：红枣、核桃、葡萄干…</text>
    </view>

    <!-- Banner 轮播 -->
    <swiper class="banner" :indicator-dots="true" :autoplay="true" :interval="4000" :circular="true"
      indicator-color="rgba(255,255,255,.5)" indicator-active-color="#ffffff">
      <swiper-item v-for="b in banners" :key="b.id" @tap="onBanner(b)">
        <view class="banner-item">
          <!-- 有真实图片则铺满显示，否则回退到渐变色块 + 文字 -->
          <image v-if="isImg(b.image)" class="banner-img" :src="b.image" mode="aspectFill" />
          <view v-else class="banner-fallback">
            <text class="banner-title">{{ b.title }}</text>
            <text class="banner-sub">{{ b.sub }}</text>
          </view>
        </view>
      </swiper-item>
    </swiper>

    <!-- 分类快捷入口 -->
    <view class="quick">
      <view class="quick-item" v-for="c in categories" :key="c.id" @tap="onCategory(c)">
        <!-- 图标兼容：URL 显示图片，emoji 显示文字 -->
        <image v-if="isImg(c.icon)" class="quick-ic-img" :src="c.icon" mode="aspectFill" />
        <text v-else class="quick-ic">{{ c.icon }}</text>
        <text class="quick-name">{{ c.name }}</text>
      </view>
    </view>

    <!-- 热销推荐标题 -->
    <view class="sec-title">
      <text class="sec-title-txt">今日热卖</text>
      <text class="sec-title-more">大家都在买 ›</text>
    </view>

    <!-- 商品瀑布流（两列） -->
    <view class="prods">
      <view class="card" v-for="item in products" :key="item.id" @tap="goDetail(item)">
        <view class="card-img">
          <!-- 商品封面：真实图用 image 渲染，缺图时回退到 emoji 占位 -->
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

    <view class="foot-tip">已经到底啦 · 更多好物上架中</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { db } from '@/data'
import { config } from '@/config'
import { isImg } from '@/utils/image'
import { syncCartBadge } from '@/utils/tabbar'
import type { Banner, Category, Product } from '@/types'

const banners = ref<Banner[]>([])
const categories = ref<Category[]>([])
const products = ref<Product[]>([])

// 页面只负责展示，数据统一向数据层要
async function loadData() {
  try {
    const [b, c, p] = await Promise.all([
      db.getBanners(),
      db.getCategories(),
      db.getHotProducts()
    ])
    banners.value = b
    categories.value = c
    products.value = p
  } catch (e) {
    // 云端任一接口失败时不抛出，避免中断下拉刷新流程；给用户可感知的提示
    console.warn('[index] 加载首页数据失败', e)
    uni.showToast({ title: '加载失败，请下拉重试', icon: 'none' })
  }
}

onLoad(() => {
  loadData()
})

// tab 页可见时校正购物车角标（覆盖"在非 tab 页加购后切回"的场景）
onShow(() => {
  syncCartBadge()
})

onPullDownRefresh(async () => {
  // 用 finally 保证无论成功失败都收起刷新圈，不会卡在一直转的状态
  try {
    await loadData()
  } finally {
    uni.stopPullDownRefresh()
  }
})

function onSearch() {
  uni.showToast({ title: '搜索待接入', icon: 'none' })
}

function onBanner(b: Banner) {
  // 有跳转链接时按需处理（页面路径 / 商品详情等），暂留提示
  if (!b.link) return
  uni.showToast({ title: '跳转待接入：' + b.link, icon: 'none' })
}

function onCategory(c: Category) {
  // switchTab 不支持传参，用 storage 把分类 id 传给分类页，由其 onShow 读取定位
  uni.setStorageSync(config.storageKeys.pendingCategory, c.id)
  uni.switchTab({ url: '/pages/category/category' })
}

function goDetail(item: Product) {
  uni.navigateTo({ url: '/pages/detail/detail?id=' + item.id })
}
</script>

<style lang="scss" scoped>
.page { padding-bottom: 40rpx; }

/* 搜索栏 */
.search-bar {
  margin: 20rpx;
  background: #fff;
  border-radius: 40rpx;
  padding: 16rpx 28rpx;
  display: flex;
  align-items: center;
}
.search-ic { font-size: 28rpx; margin-right: 12rpx; }
.search-ph { color: $text-sub; font-size: 26rpx; }

/* Banner */
.banner { margin: 0 20rpx; height: 260rpx; border-radius: 16rpx; overflow: hidden; }
.banner-item { height: 260rpx; }
.banner-img { width: 100%; height: 260rpx; display: block; }
.banner-fallback {
  height: 260rpx;
  background: linear-gradient(120deg, #ff7a5c, #e64340);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 36rpx;
}
.banner-title { color: #fff; font-size: 40rpx; font-weight: bold; }
.banner-sub { color: rgba(255,255,255,.9); font-size: 24rpx; margin-top: 10rpx; }

/* 分类快捷入口 */
.quick {
  margin: 20rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 0;
  display: flex;
  justify-content: space-around;
}
.quick-item { display: flex; flex-direction: column; align-items: center; }
.quick-ic { font-size: 44rpx; line-height: 56rpx; }
.quick-ic-img { width: 56rpx; height: 56rpx; border-radius: 12rpx; }
.quick-name { font-size: 24rpx; color: #555; margin-top: 8rpx; }

/* 区块标题 */
.sec-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 24rpx 20rpx 12rpx;
}
.sec-title-txt { font-size: 30rpx; font-weight: bold; }
.sec-title-more { font-size: 24rpx; color: $text-sub; }

/* 商品两列 */
.prods { display: flex; flex-wrap: wrap; padding: 0 12rpx; }
.card {
  width: calc(50% - 16rpx);
  margin: 8rpx;
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}
.card-img {
  position: relative;
  height: 340rpx;
  background: #f0ddd0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.card-img-el { width: 100%; height: 340rpx; display: block; }
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

.foot-tip { text-align: center; color: $text-sub; font-size: 24rpx; margin-top: 30rpx; }
</style>
