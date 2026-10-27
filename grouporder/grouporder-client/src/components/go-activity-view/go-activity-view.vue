<!--
  活动内容展示（参与者视角）

  M-13 活动详情与 M-12 发布预览共用，保证团长预览所见即参与者所见。
  视觉参照 prototype/mockup-v3.html「D · 参与者侧 · 活动详情」：深绿标题区、带缩略图的商品卡、推荐角标、免责提示。
  只负责展示；交互由页面通过插槽提供：
    - after-head：标题区下方的提示条（如「活动已结束」「预览模式」）
    - goods-ctrl：每个商品右下角的控件（参与者为数量步进器，预览为「预览」标签），作用域参数 { g }
  事件：open-goods(g)——点商品卡片（控件区除外），所在页面打开商品详情 M-37（D-146）
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
    <!-- 标题区（D-110）：标题与状态标签同一行、分居两端；活动码 + 复制；时间段用完整日期 -->
    <view class="av__head">
      <view class="av__row">
        <view class="av__title">{{ act.title || '（未填写标题）' }}</view>
        <view class="av__tags">
          <text class="av__tag">{{ statusTag }}</text>
          <text v-if="act.not_started" class="av__tag av__tag--orange">未开始</text>
          <text v-if="act.governance_status === 1" class="av__tag av__tag--red">已下架</text>
        </view>
      </view>
      <!-- 活动说明：紧跟标题下方展示 -->
      <view v-if="showDesc" class="av__head-desc">{{ act.description }}</view>
      <!-- 活动码（D-104）：可在「我参与的」按码查找，口头报号也方便 -->
      <view v-if="act.short_code" class="av__meta av__code">活动码：<text class="av__code-v">{{ act.short_code }}</text><text class="av__code-copy" @click="copyCode">复制</text></view>
      <view v-if="act.end_time" class="av__meta">{{ timeRange(act.start_time, act.end_time) }}</view>
      <view class="av__meta">
        <text v-if="(act.delivery_types || []).length">{{ deliveryText(act.delivery_types) }}</text>
        <text v-if="!preview">{{ (act.delivery_types || []).length ? ' · ' : '' }}有效 {{ act.valid_total_qty || 0 }} 份</text>
      </view>
      <!-- 自提点（D-077、D-138）：紧跟交付方式，一行写「联系人 电话 地址」+ 取货时间 -->
      <view v-if="pickupText" class="av__meta av__pickup" user-select><uni-icons class="av__pin" type="location" size="16" color="#ffffff" /><text>{{ pickupText }}</text></view>
    </view>

    <slot name="after-head" />

    <!-- 团长名片（D-103 / D-109）：账号级，团长没填或活动被下架时服务端不返回 -->
    <go-leader-contact :contact="act.leader_contact" />


    <!-- 商品：按小类分组展示（小类当小标题，D-066 修订）；组内顺序恒为团长排定的 sort（D-065） -->
    <view class="av__goods">
      <view v-if="(act.goods || []).length" class="av__goods-title">商品列表<text class="av__goods-cnt">（{{ act.goods.length }} 件）</text></view>
      <!-- 小类导航：两组以上才显示，吸顶；点按钮滚到对应小类标题。方形按钮无缝拼接 -->
      <view v-if="goodsGroups.length > 1" class="av__catnav">
        <scroll-view class="av__catnav-sv" scroll-x :show-scrollbar="false" scroll-with-animation :scroll-into-view="activeCat >= 0 ? 'av-chip-' + activeCat : ''">
          <view class="av__chips">
          <text
            v-for="(grp, i) in goodsGroups"
            :id="'av-chip-' + i"
            :key="grp.key"
            class="av__chip"
            :class="{ 'av__chip--on': i === activeCat }"
            @click="jumpToCat(i)"
          >{{ grp.name }}</text>
          </view>
        </scroll-view>
      </view>
      <template v-for="(grp, gi) in goodsGroups" :key="grp.key">
      <view v-if="grp.name" :id="'av-gcat-' + gi" class="av__gcat"><text class="av__gcat-name">{{ grp.name }}</text><text class="av__gcat-cnt">（{{ grp.goods.length }} 件商品）</text></view>
      <view
        v-for="g in grp.goods"
        :key="g._id"
        class="av__card av__gcard"
        :class="{ 'av__gcard--rec': g.is_recommend === 1, 'av__gcard--off': g.governance_status === 1 || g.on_sale === 0 }"
        hover-class="av__gcard--hover"
        @click="emit('open-goods', g)"
      >
        <!-- 推荐角标（D-144）：贴在卡片右上角，不占标题行 -->
        <text v-if="g.is_recommend === 1" class="av__rec">推荐</text>
        <image
          v-if="g.cover_image && g.cover_image.url"
          class="av__thumb"
          :src="g.cover_image.url"
          mode="aspectFill"
        />
        <view v-else class="av__thumb av__thumb--empty">无图</view>
        <view class="av__ginfo">
          <!-- 商品卡（D-141）：①商品名 + 小号价格 ②已购 / 剩余 / 限购 ③商品说明（有才显示）④数量控件 -->
          <view class="av__gtitle">
            <text class="av__gname">{{ g.name }}</text>
            <text class="av__price">¥{{ fen2yuan(g.price) }}<text class="av__unit">/{{ g.unit || '份' }}</text></text>
            <text v-if="g.governance_status === 1" class="av__tag av__tag--red">已下架</text>
            <text v-else-if="g.on_sale === 0" class="av__tag av__tag--gray">已停售</text>
          </view>
          <view class="av__gmeta">{{ goodsMeta(g) }}</view>
          <!-- 第三行商品说明（D-142）：预览时固定占一行，未填写给灰色提示；参与者端有说明才显示 -->
          <!-- 说明前加图标，更醒目 -->
          <view v-if="g.description" class="av__gdesc"><uni-icons class="av__gdesc-ic" type="info" size="14" color="#168a55" /><text class="av__gdesc-t">{{ g.description }}</text></view>
          <view v-else-if="preview" class="av__gdesc av__gdesc--empty"><uni-icons class="av__gdesc-ic" type="info" size="14" color="#b5bdb9" /><text class="av__gdesc-t">未填写商品说明</text></view>
          <!-- 数量控件区点击不冒泡到卡片（点卡片进商品详情，D-146） -->
          <view class="av__gbottom" @click.stop>
            <slot name="goods-ctrl" :g="g" />
          </view>
        </view>
      </view>
      </template>
      <view v-if="!(act.goods || []).length" class="av__empty">还没有添加商品</view>
    </view>

    <view class="av__notice">接龙成功不代表已付款，平台不收款、不发货、不担保成交。费用与交付由团长线下处理。</view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from 'vue';
// @ts-ignore
import { ACTIVITY_STATUS, deliveryText, labelOf, fen2yuan } from '@/common/grouporder/dict.js';
// @ts-ignore
import { timeRange } from '@/common/grouporder/activity-time.js';
import GoLeaderContact from '@/components/go-leader-contact/go-leader-contact.vue';

// 点商品卡片：由所在页面打开商品详情（D-146）
const emit = defineEmits(['open-goods']);
const props = defineProps({
  act: { type: Object, default: () => ({}) },
  // 发布预览（M-12）：状态标签按预览口径，商品元信息只看设定值
  preview: { type: Boolean, default: false },
});


const copyCode = () => {
  if (!props.act.short_code) return;
  uni.setClipboardData({ data: props.act.short_code, success: () => uni.showToast({ title: '活动码已复制', icon: 'none' }) });
};

// 自提点一行（D-138）：只对支持自提且填了地址的活动显示
const pickupText = computed(() => {
  const a: any = props.act;
  if (!(a.delivery_types || []).includes(2) || !a.pickup_address) return '';
  const who = [a.pickup_contact_name, a.pickup_contact_mobile].filter(Boolean).join(' ');
  // 自提时间不填即「时间不限」（D-139）
  return '自提点：' + (who ? who + ' ' : '') + a.pickup_address + '（' + (a.pickup_time_desc || '时间不限') + '）';
});

const showDesc = computed(() => {
  const d = String(props.act.description || '').trim();
  return !!d && d !== String(props.act.title || '').trim();
});

// 商品按小类分组（D-066 修订）：小类当小标题，组内保持 sort；无小类的归「其他」放最后。
// 全部没小类时平铺、不显示任何小标题，保持原样。
const goodsGroups = computed(() => {
  const goods = props.act.goods || [];
  const order: string[] = [];
  const buckets: Record<string, any[]> = {};
  const other: any[] = [];
  for (const g of goods) {
    const name = String(g.category_name || '').trim();
    if (!name) { other.push(g); continue; }
    if (!buckets[name]) { buckets[name] = []; order.push(name); }
    buckets[name].push(g);
  }
  if (!order.length) return [{ key: '__all__', name: '', goods }];
  const groups = order.map((n) => ({ key: n, name: n, goods: buckets[n] }));
  if (other.length) groups.push({ key: '__other__', name: '其他', goods: other });
  return groups;
});

// 小类导航：点按钮滚到该小类标题，标题停在吸顶导航栏下方。
// 小程序里组件内节点不能直接给 pageScrollTo 传 selector，先在组件内查位置再按 scrollTop 滚
const instance = getCurrentInstance();
const activeCat = ref(-1);
const CAT_GAP_PX = 8; // 标题与导航栏之间留一点空
const jumpToCat = (i: number) => {
  activeCat.value = i;
  const q = uni.createSelectorQuery().in(instance && instance.proxy);
  q.select('#av-gcat-' + i).boundingClientRect();
  q.select('.av__catnav').boundingClientRect();
  q.selectViewport().scrollOffset();
  q.exec((res: any[]) => {
    const [target, nav, viewport] = res || [];
    if (!target || !viewport) return;
    const navH = nav ? nav.height : 0;
    uni.pageScrollTo({ scrollTop: Math.max(0, viewport.scrollTop + target.top - navH - CAT_GAP_PX), duration: 300 });
  });
};

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
.av__row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; margin-bottom: 14rpx; }
.av__row .av__tags { flex-shrink: 0; justify-content: flex-end; max-width: 40%; padding-top: 10rpx; }
.av__row .av__title { margin: 0; }
.av__title { flex: 1; min-width: 0; font-size: 38rpx; font-weight: 600; line-height: 1.4; margin: 20rpx 0 12rpx; }
.av__meta { font-size: 24rpx; opacity: 0.9; line-height: 1.6; }
.av__head-desc { font-size: 26rpx; line-height: 1.6; margin: 14rpx 0; opacity: 0.95; white-space: pre-wrap; word-break: break-word; }
.av__card { background: #fff; border: 1rpx solid $go-line; border-radius: 32rpx; padding: 30rpx; margin: 24rpx 32rpx 0; box-shadow: 0 8rpx 28rpx rgba(37, 55, 45, 0.03); }
.av__label { font-size: 22rpx; color: $go-muted; margin-bottom: 10rpx; }
.av__desc { font-size: 26rpx; color: $go-text; line-height: 1.7; white-space: pre-wrap; }
.av__goods { padding-bottom: 8rpx; }
/* 小类导航：吸顶（H5 要让出导航栏高度 --window-top，小程序取 0） */
.av__catnav { position: sticky; top: var(--window-top, 0); z-index: 10; background: $go-canvas; padding: 16rpx 0; }
.av__goods-title { margin: 32rpx 32rpx 0; font-size: 34rpx; font-weight: 700; color: $go-ink; }
.av__goods-cnt { font-size: 24rpx; font-weight: 400; color: $go-muted; }
.av__catnav-sv { white-space: nowrap; width: 100%; }
/* 分段式导航：按钮无缝拼成一条轨道；选中块与按钮同尺寸、圆角与轨道一致，铺满整格 */
.av__chips { display: inline-flex; flex-wrap: nowrap; width: max-content; margin: 0 32rpx; border-radius: 16rpx; overflow: hidden; background: #fff; border: 1rpx solid $go-line; box-shadow: 0 4rpx 16rpx rgba(23, 35, 29, 0.06); }
.av__chip { flex-shrink: 0; white-space: nowrap; min-width: 160rpx; padding: 20rpx 40rpx; box-sizing: border-box; text-align: center; font-size: 28rpx; color: $go-text; border-radius: 16rpx; transition: background 0.2s, color 0.2s; }
.av__chip--on { background: $go-primary-soft; color: $go-primary-dark; font-weight: 600; box-shadow: 0 0 0 2rpx rgba($go-primary, 0.35) inset; }
/* 小类小标题（D-066 修订）：买家详情按小类分组的分隔标题 */
.av__gcat { margin: 32rpx 32rpx 10rpx; display: flex; align-items: baseline; }
.av__gcat::before { content: ''; align-self: center; width: 8rpx; height: 32rpx; background: $go-primary; border-radius: 4rpx; margin-right: 16rpx; }
.av__gcat-name { font-size: 34rpx; font-weight: 700; color: $go-ink; }
.av__gcat-cnt { font-size: 24rpx; font-weight: 400; color: $go-muted; margin-left: 10rpx; }
.av__gcard { position: relative; display: flex; gap: 24rpx; overflow: hidden; }
.av__gcard--rec { border-color: #f0c48a; box-shadow: 0 0 0 2rpx #f8dfba inset; }
.av__gcard--off { opacity: 0.6; }
.av__thumb { width: 152rpx; height: 152rpx; flex-shrink: 0; border-radius: 24rpx; background: #e8eee9; }
.av__thumb--empty { display: flex; align-items: center; justify-content: center; font-size: 20rpx; color: $go-muted; }
.av__ginfo { flex: 1; min-width: 0; }
.av__gtitle { display: flex; flex-wrap: wrap; align-items: center; gap: 8rpx; }
.av__gname { font-size: 30rpx; font-weight: 600; color: $go-ink; }
.av__rec { position: absolute; top: 0; right: 0; z-index: 2; font-size: 20rpx; font-weight: 700; color: #fff; background: linear-gradient(135deg, #f39b2f, #e2701a); padding: 4rpx 16rpx; border-radius: 0 32rpx 0 16rpx; }
.av__gmeta { font-size: 22rpx; color: $go-muted; line-height: 1.55; margin-top: 8rpx; }
.av__gdesc { display: flex; align-items: flex-start; font-size: 22rpx; color: $go-text; line-height: 1.55; margin-top: 6rpx; }
.av__gdesc-ic { flex-shrink: 0; margin: 4rpx 8rpx 0 0; line-height: 1; }
.av__gdesc-t { flex: 1; min-width: 0; word-break: break-all; }
.av__gbottom { display: flex; justify-content: flex-end; align-items: center; margin-top: 12rpx; }
.av__price { font-size: 24rpx; font-weight: 700; color: $go-orange; margin-left: 10rpx; }
.av__unit { font-size: 20rpx; font-weight: 400; color: $go-muted; }
.av__empty { text-align: center; font-size: 26rpx; color: $go-muted; padding: 60rpx 0; }
.av__notice { margin: 24rpx 32rpx; border-radius: 24rpx; padding: 22rpx 24rpx; font-size: 22rpx; line-height: 1.55; color: $go-orange-text; background: $go-orange-soft; }
.av__code { display: flex; align-items: center; }
.av__code-v { font-weight: 600; letter-spacing: 4rpx; margin-left: 8rpx; }
.av__code-copy { margin-left: 16rpx; font-size: 22rpx; padding: 0 14rpx; border-radius: 20rpx; border: 1rpx solid currentColor; opacity: 0.85; }
.av__pickup { display: flex; align-items: flex-start; gap: 8rpx; margin-top: 4rpx; word-break: break-all; }
.av__pin { flex-shrink: 0; margin-top: 4rpx; line-height: 1; }
.av__gdesc--empty { color: $go-placeholder; }
/* 右上角推荐角标处给标题让出位置，长名称不被压住 */
.av__gcard--rec .av__gtitle { padding-right: 56rpx; }
.av__gcard--hover { background: $go-soft; }
</style>
