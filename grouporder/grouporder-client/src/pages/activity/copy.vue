<!--
  复制接龙（授权复制落地页，D-155）

  团长在 M-20「⋯ → 授权复制」生成链接，他人打开本页：须登录 → 预览将要发布的接龙（与原活动一致）→ 两种方式：
  - 「直接发布」= 以自己的身份生成新活动并提交平台审核；
  - 「修改后再发布」（D-155 修订）= 生成自己的草稿并进入编辑活动页，价格、库存、标题、图片、时间、自提点、商品等
    凡草稿能改的都能改，再走正常的发布前检查与提交审核。复制来的商品改过也不进入自己的商品库。
  打开本页不写任何数据，点按钮才生成；跳转用 redirectTo，回退不会回到本页再生成一场。
  不展示原活动的销量、订单与原团长信息；起止时间由服务端自动计算（起始 = 现在，截止按原活动时长，最长 7 天）。
  链接失效（团长取消授权 / 原活动被下架）时由服务端返回 NOT_FOUND 等，guarded 跳 M-26 结果页。
-->
<template>
  <view class="page">
    <!-- 未登录：先登录再预览，避免未登录访问者看到内容并反复触发 -->
    <view v-if="!loggedIn" class="login">
      <view class="login__t">有团长授权你复制一个接龙</view>
      <view class="login__d">登录后可预览，并一键发布一个一模一样的接龙。</view>
      <button class="login__btn" type="primary" @click="login">登录后查看</button>
    </view>

    <go-result v-else-if="loadFailed" type="unknown" detail="加载失败，请检查网络后重试" @retry="load" />

    <block v-else-if="loaded">
      <view class="intro">
        <view class="intro__t">复制这个接龙，以你的身份发布</view>
        <view class="intro__d">内容与原接龙一致（包括商品、价格、库存、限购和自提点）。可以直接发布，也可以先修改价格、商品、时间等再发布。发布后需平台审核，审核通过即可分享接龙。</view>
        <view class="intro__time">起止时间：{{ fmtDateTime(act.start_time) }} 至 {{ fmtDateTime(act.end_time) }}</view>
      </view>

      <view class="sec"><text class="sec__t">发布后的样子</text><text class="sec__s">参与者打开后看到的内容</text></view>
      <go-activity-view :act="act" preview />

      <view class="footer">
        <view class="footer__tip">复制后这个接龙就是你自己的活动，订单与统计从零开始；复制来的商品不会进入你的商品库。</view>
        <view class="footer__row">
          <button class="footer__btn footer__btn--ghost" :disabled="busy" @click="editFirst">修改后再发布</button>
          <button class="footer__btn" type="primary" :loading="busy" :disabled="busy" @click="confirmPublish">直接发布</button>
        </view>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import GoActivityView from '@/components/go-activity-view/go-activity-view.vue';
import GoResult from '@/components/go-result/go-result.vue';
// @ts-ignore
import api, { guarded, isLoggedIn, ensureLogin } from '@/common/grouporder/request.js';
// @ts-ignore
import { fmtDateTime } from '@/common/grouporder/activity-time.js';

const token = ref('');
const loggedIn = ref(false);
const act = ref<any>({});
const loaded = ref(false);
const loadFailed = ref(false);
const busy = ref(false);
// 一次「确认发布」意图一个幂等键：网络重试 / 连点不会生成两场
const idemKey = 'cp_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);

const load = async () => {
  loadFailed.value = false;
  if (!token.value) { loadFailed.value = true; return; }
  try {
    act.value = (await guarded(api.activity.activityCopyPreview({ token: token.value }))) || {};
    loaded.value = true;
  } catch (e) {
    if (!loaded.value) loadFailed.value = true;
  }
};

const login = () => { ensureLogin(); };

const confirmPublish = async () => {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = (await guarded(api.activity.activityCopyByToken({ token: token.value, idempotent_key: idemKey }))) || {};
    const go = () => uni.redirectTo({ url: '/pages/activity/manage?id=' + r.activity_id });
    if (r.submit_error) {
      uni.showModal({ title: '已保存为草稿', content: r.submit_error, showCancel: false, success: go });
    } else {
      uni.showToast({ title: r.status === 2 ? '已发布' : '已提交审核', icon: 'success' });
      setTimeout(go, 800);
    }
  } catch (e) {
    // 错误提示由 guarded / client.js 给出（如发布受限、链接失效）
  } finally {
    busy.value = false;
  }
};

/** 修改后再发布：只生成草稿，进入编辑活动页（复用正常的编辑与发布流程） */
const editFirst = async () => {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = (await guarded(api.activity.activityCopyByToken({ token: token.value, idempotent_key: idemKey, submit: false }))) || {};
    if (r.activity_id) uni.redirectTo({ url: '/pages/activity/edit?id=' + r.activity_id });
  } catch (e) {
    // 错误提示由 guarded / client.js 给出
  } finally {
    busy.value = false;
  }
};

onLoad((q: any = {}) => {
  token.value = q.token || '';
});
// 登录回来后（onShow）再加载预览
onShow(() => {
  loggedIn.value = isLoggedIn();
  if (loggedIn.value && !loaded.value) load();
});
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding-bottom: calc(220rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.login { padding: 160rpx 48rpx 0; text-align: center; }
.login__t { font-size: 34rpx; font-weight: 700; color: $go-ink; }
.login__d { font-size: 26rpx; color: $go-muted; margin-top: 16rpx; line-height: 1.6; }
.login__btn { margin-top: 48rpx; border-radius: 24rpx; }
.intro { margin: 24rpx 32rpx 0; padding: 26rpx 28rpx; border-radius: 24rpx; background: $go-primary-soft; }
.intro__t { font-size: 30rpx; font-weight: 700; color: $go-primary-dark; }
.intro__d { font-size: 24rpx; color: $go-primary-dark; line-height: 1.7; margin-top: 10rpx; }
.intro__time { font-size: 24rpx; color: $go-ink; margin-top: 12rpx; font-weight: 600; }
.sec { display: flex; align-items: baseline; gap: 16rpx; margin: 32rpx 32rpx 16rpx; padding-left: 18rpx; border-left: 8rpx solid $go-primary; }
.sec__t { font-size: 32rpx; font-weight: 700; color: $go-ink; line-height: 1.2; }
.sec__s { font-size: 22rpx; color: $go-muted; }
.footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 20rpx 24rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.footer__tip { font-size: 22rpx; color: $go-muted; margin-bottom: 14rpx; line-height: 1.5; }
.footer__row { display: flex; gap: 20rpx; }
.footer__btn { flex: 1; margin: 0; border-radius: 24rpx; font-size: 30rpx; }
.footer__btn--ghost { background: $go-soft; color: $go-primary-dark; }
.footer__btn--ghost::after { border: none; }
</style>
