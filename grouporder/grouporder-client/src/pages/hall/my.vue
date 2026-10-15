<!--
  M-08 个人与设置（我的 tab）

  职责（§3.1）：收货信息、我的商品库、账号安全、协议、隐私、举报/反馈、注销及数据处理说明。
  未登录可进入本页，敏感项点击时才要求登录（D-033）。
-->
<template>
  <view class="page">
    <!-- 账号区 -->
    <view class="hero">
      <view class="hero__avatar">{{ (displayName || '未').slice(0, 1) }}</view>
      <view class="hero__info">
        <view class="hero__name">{{ loggedIn ? (displayName || '未设置昵称') : '未登录' }}</view>
        <view class="hero__sub" v-if="loggedIn">
          <text v-if="bind.wechat_bound" class="hero__badge">微信已绑定</text>
          <text v-else class="hero__badge hero__badge--off">微信未绑定</text>
        </view>
        <view class="hero__sub" v-else @click="login">点此登录 / 注册 ›</view>
      </view>
    </view>

    <!-- 数据概览 -->
    <view class="stat" v-if="loggedIn">
      <!-- 可点击：属于「接龙」tab 的切到对应子页，商品库进管理页 -->
      <view class="stat__item" hover-class="stat__item--hover" @click="openHallSub('lead')"><text class="stat__n">{{ overview.lead_activity_count || 0 }}</text><text class="stat__l">发起的</text></view>
      <view class="stat__item" hover-class="stat__item--hover" @click="openHallSub('join')"><text class="stat__n">{{ overview.joined_order_count || 0 }}</text><text class="stat__l">参与订单</text></view>
      <view class="stat__item" hover-class="stat__item--hover" @click="go('/pages/lib/manage')"><text class="stat__n">{{ overview.goods_lib_count || 0 }}</text><text class="stat__l">商品库</text></view>
      <view class="stat__item" hover-class="stat__item--hover" @click="openHallSub('todo')"><text class="stat__n">{{ overview.todo_count || 0 }}</text><text class="stat__l">待办</text></view>
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

    <!-- 退出登录：H5 在共用设备上切换账号 -->
    <view v-if="loggedIn" class="group">
      <view class="cell cell--center" @click="logout"><text class="cell__t cell__t--warn">退出登录</text></view>
    </view>

    <go-tabbar current="my" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import GoTabbar from '@/components/go-tabbar/go-tabbar.vue';
// @ts-ignore
import api, { isLoggedIn, ensureLogin } from '@/common/grouporder/request.js';
// @ts-ignore
import { openHallSub } from '@/common/grouporder/hall.js';
// @ts-ignore
import { store, mutations } from '@/uni_modules/uni-id-pages/common/store.js';

const loggedIn = ref(false);
const bind = ref<any>({});
const overview = ref<any>({});

// 显示名：昵称优先，没有再用用户名；store.userInfo 登录成功后异步刷新，响应式跟随
const displayName = computed(() => {
  const info = store.userInfo || {};
  return bind.value.nickname || info.nickname || info.username || '';
});

const load = async () => {
  loggedIn.value = isLoggedIn();
  if (!loggedIn.value) return;
  // 两个请求各自处理成败，概览失败不影响账号区显示
  await Promise.all([
    api.user.bindStatus().then((b: any) => { bind.value = b || {}; }).catch(() => {}),
    api.user.meOverview().then((o: any) => { overview.value = o || {}; }).catch(() => {}),
  ]);
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
/**
 * 注销账号（M-08、D-056）：提交「账号注销」隐私事项，由服务端先校验前置条件，再由平台处理；
 * 不直接调用 uni-id 的 closeAccount——那会绕过「仍有进行中活动 / 有效订单不得注销」的校验
 */
const deactivate = () => {
  if (!ensureLogin()) return;
  uni.showModal({
    title: '注销账号',
    content: '注销后账号不可恢复，订单等数据按隐私规则保存到期后删除或匿名化。确认提交注销申请？',
    confirmText: '提交申请',
    confirmColor: '#c7463f',
    success: async (r: any) => {
      if (!r.confirm) return;
      try {
        const data = (await api.user.privacyRequestSubmit({ case_type: 1 }, { silent: true })) || {};
        uni.showModal({
          title: data.duplicated ? '已有注销申请' : '注销申请已提交',
          content: `事项编号 ${data.case_no || ''}，平台处理完成后账号将被注销。`,
          showCancel: false,
        });
      } catch (e: any) {
        const blockers = (e && e.detail && e.detail.blockers) || [];
        const lines = blockers.map((b: any) => `· ${b.title || b.order_no || ''}：${b.action || ''}`).join('\n');
        uni.showModal({ title: '暂不能注销', content: ((e && e.errMsg) || '请稍后重试') + (lines ? '\n' + lines : ''), showCancel: false });
      }
    },
  });
};
const showPrivacy = () => {
  uni.showModal({
    title: '隐私与数据处理',
    content: '账号不采集手机号；收货信息仅用于订单履约。订单相关数据自活动截止或取消起保存三年，到期后删除或匿名化，汇总数据可长期保留。',
    showCancel: false,
  });
};

/** 退出登录后留在本页：不用 uni-id-pages 自带的 logout（它会跳到登录页） */
const logout = () => {
  uni.showModal({
    title: '退出登录',
    content: '确认退出当前账号？',
    success: async (r: any) => {
      if (!r.confirm) return;
      try { await uniCloud.importObject('uni-id-co', { customUI: true }).logout(); } catch (e) { /* 失败不阻塞本地退出 */ }
      try { uni.removeStorageSync('uni_id_token'); uni.setStorageSync('uni_id_token_expired', 0); } catch (e) {}
      mutations.setUserInfo({}, { cover: true });
      uni.$emit('uni-id-pages-logout');
      bind.value = {};
      overview.value = {};
      loggedIn.value = false;
      uni.showToast({ title: '已退出登录', icon: 'none' });
    },
  });
};

onShow(() => load());
</script>

<style lang="scss" scoped>
/* 底部留白避开 fixed 的 go-tabbar，含安全区 */
.page { min-height: 100vh; padding-bottom: calc(140rpx + env(safe-area-inset-bottom)); background: $go-canvas; }
.hero { display: flex; align-items: center; padding: 48rpx 32rpx; background: #fff; }
.hero__avatar { width: 96rpx; height: 96rpx; border-radius: 50%; background: $go-primary; color: #fff; font-size: 40rpx; display: flex; align-items: center; justify-content: center; margin-right: 24rpx; }
.hero__name { font-size: 34rpx; color: $go-ink; }
.hero__sub { font-size: 24rpx; color: $go-muted; margin-top: 8rpx; }
.hero__badge { font-size: 20rpx; color: $go-primary; background: $go-primary-soft; padding: 2rpx 12rpx; border-radius: 8rpx; }
.hero__badge--off { color: $go-muted; background: $go-line; }
.stat { display: flex; background: #fff; margin-top: 16rpx; padding: 28rpx 0; }
.stat__item { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat__n { font-size: 36rpx; color: $go-primary; }
.stat__item--hover { background: $go-soft; }
.stat__l { font-size: 22rpx; color: $go-muted; margin-top: 6rpx; }
.group { background: #fff; margin-top: 16rpx; }
.cell { display: flex; align-items: center; justify-content: space-between; padding: 30rpx 32rpx; border-bottom: 1rpx solid $go-soft; }
.cell__t { font-size: 28rpx; color: $go-ink; }
.cell--center { justify-content: center; }
.cell__t--warn { color: $go-red; }
.cell__a { font-size: 28rpx; color: $go-placeholder; }
</style>
