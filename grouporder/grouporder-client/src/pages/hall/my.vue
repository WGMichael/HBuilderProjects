<!--
  M-08 个人与设置（我的 tab）

  职责（§3.1）：收货信息、我的商品库、账号安全、协议、隐私、举报/反馈、注销及数据处理说明。
  未登录可进入本页，敏感项点击时才要求登录（D-033）。
-->
<template>
  <view class="page">
    <!-- 账号区 -->
    <view class="hero">
      <view class="hero__avatar">{{ (bind.nickname || '未').slice(0, 1) }}</view>
      <view class="hero__info">
        <view class="hero__name">{{ loggedIn ? (bind.nickname || '未设置昵称') : '未登录' }}</view>
        <view class="hero__sub" v-if="loggedIn">
          <text v-if="bind.wechat_bound" class="hero__badge">微信已绑定</text>
          <text v-else class="hero__badge hero__badge--off">微信未绑定</text>
        </view>
        <view class="hero__sub" v-else @click="login">点此登录 / 注册 ›</view>
      </view>
    </view>

    <!-- 数据概览 -->
    <view class="stat" v-if="loggedIn">
      <view class="stat__item"><text class="stat__n">{{ overview.lead_activity_count || 0 }}</text><text class="stat__l">发起的</text></view>
      <view class="stat__item"><text class="stat__n">{{ overview.joined_order_count || 0 }}</text><text class="stat__l">参与订单</text></view>
      <view class="stat__item"><text class="stat__n">{{ overview.goods_lib_count || 0 }}</text><text class="stat__l">商品库</text></view>
      <view class="stat__item"><text class="stat__n">{{ overview.todo_count || 0 }}</text><text class="stat__l">待办</text></view>
    </view>

    <!-- 功能组 -->
    <view class="group">
      <view class="cell" @click="go('/pages/address/list')"><text class="cell__t">收货信息</text><text class="cell__a">›</text></view>
      <view class="cell" @click="go('/pages/lib/manage')"><text class="cell__t">我的商品库</text><text class="cell__a">›</text></view>
    </view>

    <view class="group">
      <view class="cell" @click="go('/pages/account/bind')"><text class="cell__t">账号与微信绑定</text><text class="cell__a">›</text></view>
      <view class="cell" @click="goPwd"><text class="cell__t">修改密码</text><text class="cell__a">›</text></view>
      <view class="cell" @click="go('/pages/account/appeal')"><text class="cell__t">账号申诉与结果</text><text class="cell__a">›</text></view>
    </view>

    <view class="group">
      <view class="cell" @click="go('/pages/report/submit')"><text class="cell__t">举报 / 反馈</text><text class="cell__a">›</text></view>
      <view class="cell" @click="showPrivacy"><text class="cell__t">隐私与数据处理说明</text><text class="cell__a">›</text></view>
      <view class="cell" @click="deactivate"><text class="cell__t">注销账号</text><text class="cell__a">›</text></view>
    </view>

    <go-tabbar current="my" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import GoTabbar from '@/components/go-tabbar/go-tabbar.vue';
// @ts-ignore
import api, { isLoggedIn, ensureLogin } from '@/common/grouporder/request.js';

const loggedIn = ref(false);
const bind = ref<any>({});
const overview = ref<any>({});

const load = async () => {
  loggedIn.value = isLoggedIn();
  if (!loggedIn.value) return;
  try {
    const [b, o] = await Promise.all([api.user.bindStatus(), api.user.meOverview()]);
    bind.value = b || {};
    overview.value = o || {};
  } catch (e) {
    /* 未登录或失败时保持空 */
  }
};

const login = () => uni.navigateTo({ url: '/uni_modules/uni-id-pages/pages/login/login-withpwd' });

// 敏感入口：未登录先登录（D-033）
const go = (url: string) => {
  if (!ensureLogin()) return;
  uni.navigateTo({ url });
};
const goPwd = () => {
  if (!ensureLogin()) return;
  uni.navigateTo({ url: '/uni_modules/uni-id-pages/pages/userinfo/change_pwd/change_pwd' });
};
const deactivate = () => {
  if (!ensureLogin()) return;
  uni.navigateTo({ url: '/uni_modules/uni-id-pages/pages/userinfo/deactivate/deactivate' });
};
const showPrivacy = () => {
  uni.showModal({
    title: '隐私与数据处理',
    content: '账号不采集手机号；收货信息仅用于订单履约。订单相关数据自活动截止或取消起保存三年，到期后删除或匿名化，汇总数据可长期保留。',
    showCancel: false,
  });
};

onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 140rpx; background: #f4f5f7; }
.hero { display: flex; align-items: center; padding: 48rpx 32rpx; background: #fff; }
.hero__avatar { width: 96rpx; height: 96rpx; border-radius: 50%; background: #2979ff; color: #fff; font-size: 40rpx; display: flex; align-items: center; justify-content: center; margin-right: 24rpx; }
.hero__name { font-size: 34rpx; color: #303133; }
.hero__sub { font-size: 24rpx; color: #909399; margin-top: 8rpx; }
.hero__badge { font-size: 20rpx; color: #18bc37; background: #e7faec; padding: 2rpx 12rpx; border-radius: 8rpx; }
.hero__badge--off { color: #909399; background: #f0f0f0; }
.stat { display: flex; background: #fff; margin-top: 16rpx; padding: 28rpx 0; }
.stat__item { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat__n { font-size: 36rpx; color: #2979ff; }
.stat__l { font-size: 22rpx; color: #909399; margin-top: 6rpx; }
.group { background: #fff; margin-top: 16rpx; }
.cell { display: flex; align-items: center; justify-content: space-between; padding: 30rpx 32rpx; border-bottom: 1rpx solid #f5f5f5; }
.cell__t { font-size: 28rpx; color: #303133; }
.cell__a { font-size: 28rpx; color: #c0c4cc; }
</style>
