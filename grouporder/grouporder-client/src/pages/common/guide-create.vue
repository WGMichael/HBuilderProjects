<!--
  M-38 发起接龙图文指南（D-148）

  入口：首次发起接龙的引导弹窗（go-create-guide）「查看完整图文指南」、使用帮助。未登录也可看。
  核心建议：先在「我的 → 商品库管理」把常卖的商品配好，发起接龙时用「从商品库添加」一次勾选，
  比在发起页里逐个新建商品省事，下次还能直接复用。
  插图用样式画成的示意界面（不依赖图片文件），与实际页面布局一致。
-->
<template>
  <view class="page">
    <view class="hero">
      <view class="hero__t">发起接龙，先配好商品</view>
      <view class="hero__d">把常卖的商品先放进「商品库」，发起接龙时一次勾选就能加进活动；下次再开团还能直接复用，不用每次重新填写。</view>
    </view>

    <!-- 对比：两种做法 -->
    <view class="cmp">
      <view class="cmp__i cmp__i--good">
        <view class="cmp__h">推荐</view>
        <view class="cmp__t">先配商品库</view>
        <view class="cmp__d">商品填一次，之后每场接龙勾选即可</view>
      </view>
      <view class="cmp__i">
        <view class="cmp__h cmp__h--gray">也可以</view>
        <view class="cmp__t">在发起页逐个新建</view>
        <view class="cmp__d">每个商品都要现场填写，商品多时较繁琐</view>
      </view>
    </view>

    <!-- 步骤 1 -->
    <view class="step">
      <view class="step__h"><text class="step__no">1</text><text class="step__t">打开「我的 → 商品库管理」</text></view>
      <view class="step__d">在底部「我的」里找到「商品管理」分组，点「商品库管理」。</view>
      <view class="mock">
        <view class="mock__sec">商品管理</view>
        <view class="mock__row mock__row--hl"><text class="mock__ic">▦</text><text class="mock__flex">商品库管理</text><text class="mock__arrow">›</text></view>
        <view class="mock__sec">帮助与客服</view>
        <view class="mock__row"><text class="mock__ic">?</text><text class="mock__flex">使用帮助</text><text class="mock__arrow">›</text></view>
      </view>
    </view>

    <!-- 步骤 2 -->
    <view class="step">
      <view class="step__h"><text class="step__no">2</text><text class="step__t">添加商品</text></view>
      <view class="step__d">点「＋ 添加商品」，填写名称、价格、单位，上传封面图；可以写商品说明、补充详情图，还能归到分类里方便查找。</view>
      <view class="mock">
        <view class="mock__btn mock__btn--dash">＋ 添加商品</view>
        <view class="mock__form">
          <view class="mock__f"><text class="mock__k">名称</text><text class="mock__v">烟台红富士</text></view>
          <view class="mock__f"><text class="mock__k">价格</text><text class="mock__v">12.5 元 / 斤</text></view>
          <view class="mock__f"><text class="mock__k">封面图</text><view class="mock__img" /></view>
          <view class="mock__f"><text class="mock__k">商品说明</text><text class="mock__v mock__v--muted">脆甜多汁，产地直发</text></view>
        </view>
      </view>
      <view class="tip">价格、库存、限购是「默认值」，加进活动后每场都可以单独修改。</view>
    </view>

    <!-- 步骤 3 -->
    <view class="step">
      <view class="step__h"><text class="step__no">3</text><text class="step__t">发起接龙，填写活动信息</text></view>
      <view class="step__d">点底部「发起接龙」，填标题、上传封面，设置起止时间和交付方式（送货上门 / 自提）。</view>
      <view class="mock">
        <view class="mock__form">
          <view class="mock__f"><text class="mock__k">标题</text><text class="mock__v">周末水果团</text></view>
          <view class="mock__f"><text class="mock__k">截止时间</text><text class="mock__v">2026/10/20 18:00</text></view>
          <view class="mock__f"><text class="mock__k">交付方式</text><text class="mock__v"><text class="mock__chip mock__chip--on">送货上门</text><text class="mock__chip mock__chip--on">自提</text></text></view>
        </view>
      </view>
      <view class="tip">起始时间最多设在 7 天之内，截止时间距起始不超过 7 天。</view>
    </view>

    <!-- 步骤 4 -->
    <view class="step">
      <view class="step__h"><text class="step__no">4</text><text class="step__t">「从商品库添加」，勾选商品</text></view>
      <view class="step__d">在商品区点「从商品库添加」，勾选这次要卖的商品，确认后一次加进活动。</view>
      <view class="mock">
        <view class="mock__btns"><text class="mock__btn mock__btn--pri">＋ 添加新商品</text><text class="mock__btn mock__btn--hl">从商品库添加</text></view>
        <view class="mock__check"><text class="mock__box mock__box--on">✓</text><text class="mock__flex">烟台红富士</text><text class="mock__price">¥12.5/斤</text></view>
        <view class="mock__check"><text class="mock__box mock__box--on">✓</text><text class="mock__flex">海南金煌芒果</text><text class="mock__price">¥39.9/箱</text></view>
        <view class="mock__check"><text class="mock__box">　</text><text class="mock__flex">爱媛果冻橙</text><text class="mock__price">¥28/箱</text></view>
        <view class="mock__btn mock__btn--full">添加 2 件商品</view>
      </view>
    </view>

    <!-- 步骤 5 -->
    <view class="step">
      <view class="step__h"><text class="step__no">5</text><text class="step__t">预览、提交审核，然后分享</text></view>
      <view class="step__d">点「下一步：确认发布」查看参与者看到的样子，检查无误后提交审核。审核通过后，在活动管理页点「分享到微信」或「生成海报」发给大家。</view>
    </view>

    <!-- 小贴士 -->
    <view class="faq">
      <view class="faq__t">小贴士</view>
      <view class="faq__i">· 在发起页新建的商品，保存后也会自动存进商品库，下次可以直接选。</view>
      <view class="faq__i">· 在商品库里改了名称、说明或图片，会同步到你还没结束的活动；进行中的活动会因此重新审核。</view>
      <view class="faq__i">· 已经结束的接龙，可以在发起页用「复用历史接龙」整场复制，再改改就能发布。</view>
    </view>

    <view class="foot">
      <button class="foot__btn" type="primary" @click="goLib">去添加商品</button>
      <view class="foot__link" @click="goCreate">我已配好商品，去发起接龙 ›</view>
    </view>
  </view>
</template>

<script setup lang="ts">
// @ts-ignore
import { ensureLogin } from '@/common/grouporder/request.js';

const goLib = () => {
  if (!ensureLogin()) return;
  uni.navigateTo({ url: '/pages/lib/manage' });
};
const goCreate = () => uni.switchTab({ url: '/pages/hall/faqi' });
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding-bottom: calc(60rpx + env(safe-area-inset-bottom)); }
.hero { padding: 40rpx 32rpx 32rpx; background: linear-gradient(135deg, #1d9b62, #0f6b41); color: #fff; }
.hero__t { font-size: 38rpx; font-weight: 700; }
.hero__d { font-size: 25rpx; line-height: 1.7; opacity: 0.92; margin-top: 12rpx; }
.cmp { display: flex; gap: 16rpx; margin: 24rpx 24rpx 0; }
.cmp__i { flex: 1; background: #fff; border-radius: 20rpx; padding: 22rpx; border: 2rpx solid $go-line; }
.cmp__i--good { border-color: $go-primary; background: $go-primary-soft; }
.cmp__h { display: inline-block; font-size: 20rpx; font-weight: 700; color: #fff; background: $go-primary; padding: 2rpx 12rpx; border-radius: 8rpx; }
.cmp__h--gray { background: $go-tag-text; }
.cmp__t { font-size: 28rpx; font-weight: 600; color: $go-ink; margin-top: 12rpx; }
.cmp__d { font-size: 22rpx; color: $go-muted; margin-top: 8rpx; line-height: 1.5; }
.step { background: #fff; margin: 24rpx 24rpx 0; border-radius: 24rpx; padding: 28rpx; }
.step__h { display: flex; align-items: center; gap: 16rpx; }
.step__no { width: 44rpx; height: 44rpx; line-height: 44rpx; text-align: center; border-radius: 50%; background: $go-primary; color: #fff; font-size: 26rpx; font-weight: 700; flex-shrink: 0; }
.step__t { font-size: 30rpx; font-weight: 700; color: $go-ink; }
.step__d { font-size: 25rpx; color: $go-text; line-height: 1.7; margin-top: 14rpx; }
.tip { margin-top: 16rpx; font-size: 22rpx; color: $go-orange-text; background: $go-orange-soft; padding: 12rpx 18rpx; border-radius: 12rpx; line-height: 1.5; }
/* 示意界面 */
.mock { margin-top: 20rpx; background: $go-canvas; border-radius: 20rpx; padding: 18rpx; border: 2rpx dashed $go-border; }
.mock__sec { font-size: 22rpx; font-weight: 700; color: $go-ink; margin: 8rpx 4rpx; }
.mock__row { display: flex; align-items: center; gap: 12rpx; background: #fff; border-radius: 12rpx; padding: 18rpx; font-size: 24rpx; color: $go-ink; margin-bottom: 8rpx; }
.mock__row--hl { box-shadow: 0 0 0 4rpx $go-primary; }
.mock__ic { color: $go-primary; width: 32rpx; text-align: center; }
.mock__flex { flex: 1; min-width: 0; }
.mock__arrow { color: $go-placeholder; }
.mock__btns { display: flex; gap: 12rpx; margin-bottom: 12rpx; }
.mock__btn { display: block; text-align: center; font-size: 22rpx; padding: 12rpx 18rpx; border-radius: 28rpx; background: #fff; color: $go-text; border: 2rpx solid $go-border; }
.mock__btn--dash { border-style: dashed; border-color: $go-primary; color: $go-primary-dark; margin-bottom: 12rpx; }
.mock__btn--pri { background: $go-primary; color: #fff; border-color: $go-primary; }
.mock__btn--hl { color: $go-primary-dark; border-color: $go-primary; box-shadow: 0 0 0 4rpx rgba(22, 138, 85, 0.25); }
.mock__btn--full { margin-top: 12rpx; background: $go-primary; color: #fff; border-color: $go-primary; }
.mock__form { background: #fff; border-radius: 12rpx; padding: 6rpx 18rpx; }
.mock__f { display: flex; align-items: center; gap: 16rpx; padding: 14rpx 0; border-bottom: 1rpx solid $go-soft; font-size: 24rpx; }
.mock__f:last-child { border-bottom: 0; }
.mock__k { width: 120rpx; color: $go-muted; flex-shrink: 0; }
.mock__v { color: $go-ink; }
.mock__v--muted { color: $go-text; }
.mock__img { width: 72rpx; height: 72rpx; border-radius: 10rpx; background: linear-gradient(135deg, #f7d9a8, #f2a65a); }
.mock__chip { font-size: 20rpx; padding: 2rpx 14rpx; border-radius: 20rpx; border: 1rpx solid $go-border; margin-right: 8rpx; }
.mock__chip--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.mock__check { display: flex; align-items: center; gap: 14rpx; background: #fff; border-radius: 12rpx; padding: 16rpx 18rpx; margin-top: 8rpx; font-size: 24rpx; color: $go-ink; }
.mock__box { width: 32rpx; height: 32rpx; line-height: 32rpx; text-align: center; border-radius: 8rpx; border: 2rpx solid $go-border; font-size: 20rpx; color: #fff; flex-shrink: 0; }
.mock__box--on { background: $go-primary; border-color: $go-primary; }
.mock__price { color: $go-orange; font-size: 22rpx; font-weight: 600; }
.faq { background: #fff; margin: 24rpx 24rpx 0; border-radius: 24rpx; padding: 28rpx; }
.faq__t { font-size: 28rpx; font-weight: 700; color: $go-ink; margin-bottom: 10rpx; }
.faq__i { font-size: 24rpx; color: $go-text; line-height: 1.8; }
.foot { margin: 36rpx 32rpx 0; }
.foot__btn { border-radius: 28rpx; font-size: 30rpx; font-weight: 600; }
.foot__link { text-align: center; margin-top: 24rpx; font-size: 25rpx; color: $go-primary; }
</style>
