<!--
  M-08 个人与设置（我的 tab）

  分四类（D-105、D-106）：个人资料（团长名片、收货信息）、商品管理（商品库管理）、工具（团长统计，会员功能）、
  帮助与客服（使用帮助、举报 / 反馈、用户服务协议、隐私政策）。账号类操作（微信绑定、改密、账号申诉）不再提供入口，页面保留以便日后恢复；
  底部只保留「退出登录」按钮（H5 共用设备切换账号）；「注销账号」入口已隐藏（D-108），用户经协议中的联系方式申请注销，
  deactivate 保留以便提审前恢复入口。
  未登录可进入本页，敏感项点击时才要求登录（D-033）。
-->
<template>
  <view class="page">
    <!-- 账号区 -->
    <view class="hero">
      <view class="hero__avatar">{{ (displayName || '未').slice(0, 1) }}</view>
      <view class="hero__info">
        <view class="hero__name">{{ loggedIn ? (displayName || '未设置昵称') : '未登录' }}</view>
        <view class="hero__sub" v-if="!loggedIn" @click="login">点此登录 / 注册 ›</view>
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

    <!-- 一、个人资料 -->
    <view class="sec">个人资料</view>
    <view class="group">
      <!-- 团长名片（D-103）：显示在本人发起的所有活动页 -->
      <view class="cell" @click="go('/pages/account/contact')"><view class="cell__l"><uni-icons class="cell__ic" type="contact" size="20" color="#168a55" /><text class="cell__t">团长名片</text></view><text class="cell__a">›</text></view>
      <view class="cell" @click="go('/pages/address/list')"><view class="cell__l"><uni-icons class="cell__ic" type="location" size="20" color="#168a55" /><text class="cell__t">收货信息</text></view><text class="cell__a">›</text></view>
    </view>

    <!-- 二、商品管理 -->
    <view class="sec">商品管理</view>
    <view class="group">
      <view class="cell" @click="go('/pages/lib/manage')"><view class="cell__l"><uni-icons class="cell__ic" type="shop" size="20" color="#168a55" /><text class="cell__t">商品库管理</text></view><text class="cell__a">›</text></view>
    </view>

    <!-- 三、工具（D-106）：会员功能，首版对所有人开放；「会员」标签提示以后需开通 -->
    <view class="sec">工具</view>
    <view class="group">
      <view class="cell" @click="go('/pages/tools/leader-stat')"><view class="cell__l"><uni-icons class="cell__ic" type="list" size="20" color="#168a55" /><text class="cell__t">团长统计<text class="vip">会员</text></text></view><text class="cell__a">›</text></view>
    </view>

    <!-- 四、帮助与客服：未登录也可看（举报需登录，由举报页自行处理） -->
    <view class="sec">帮助与客服</view>
    <view class="group">
      <view class="cell" @click="openHelp"><view class="cell__l"><uni-icons class="cell__ic" type="help" size="20" color="#168a55" /><text class="cell__t">使用帮助</text></view><text class="cell__a">›</text></view>
      <view class="cell" @click="go('/pages/report/submit')"><view class="cell__l"><uni-icons class="cell__ic" type="flag" size="20" color="#168a55" /><text class="cell__t">举报 / 反馈</text></view><text class="cell__a">›</text></view>
      <view class="cell" @click="openLegal('service')"><view class="cell__l"><uni-icons class="cell__ic" type="compose" size="20" color="#168a55" /><text class="cell__t">用户服务协议</text></view><text class="cell__a">›</text></view>
      <view class="cell" @click="openLegal('privacy')"><view class="cell__l"><uni-icons class="cell__ic" type="locked" size="20" color="#168a55" /><text class="cell__t">隐私政策</text></view><text class="cell__a">›</text></view>
    </view>

    <!-- 退出登录：H5 在共用设备上切换账号；注销账号入口已隐藏（D-108） -->
    <view v-if="loggedIn" class="group group--logout">
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
// bindStatus 只用来取昵称（绑定状态标签已随账号类入口一起去掉，D-105）
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
// 使用帮助（D-105）：静态说明页，未登录也可看
const openHelp = () => uni.navigateTo({ url: '/pages/common/help' });
/**
 * 注销账号（M-08、D-056）：提交「账号注销」隐私事项，由服务端先校验前置条件，再由平台处理；
 * 不直接调用 uni-id 的 closeAccount——那会绕过「仍有进行中活动 / 有效订单不得注销」的校验
 */
// 入口已隐藏（D-108），函数保留：小程序提审前需恢复「注销账号」入口时直接接回
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
// 协议与隐私政策（D-099）：未登录也可查看
const openLegal = (type: string) => uni.navigateTo({ url: '/pages/common/legal?type=' + type });

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
.stat { display: flex; background: #fff; margin-top: 16rpx; padding: 28rpx 0; }
.stat__item { flex: 1; display: flex; flex-direction: column; align-items: center; }
.stat__n { font-size: 36rpx; color: $go-primary; }
.stat__item--hover { background: $go-soft; }
.stat__l { font-size: 22rpx; color: $go-muted; margin-top: 6rpx; }
.group { background: #fff; margin-top: 16rpx; }
.cell { position: relative; display: flex; align-items: center; justify-content: space-between; padding: 30rpx 32rpx; }
/* 同组各项之间的分隔线：左右都缩进 32rpx，与文字和箭头对齐；组内最后一项不画 */
.cell::after { content: ''; position: absolute; left: 32rpx; right: 32rpx; bottom: 0; height: 1rpx; background: $go-line; }
.cell:last-child::after { display: none; }
.cell__t { font-size: 28rpx; color: $go-ink; }
/* 各项前的图标（uni-icons，主色线性） */
.cell__l { display: flex; align-items: center; }
.cell__ic { margin-right: 20rpx; line-height: 1; }
.vip { margin-left: 12rpx; font-size: 18rpx; color: #9a6a12; background: #fdf3dc; padding: 2rpx 10rpx; border-radius: 6rpx; vertical-align: middle; }
.sec { padding: 36rpx 32rpx 16rpx; font-size: 28rpx; font-weight: 700; color: $go-ink; }
.sec + .group { margin-top: 0; }
.group--logout { margin-top: 40rpx; }
.cell--center { justify-content: center; }
.cell__t--warn { color: $go-red; }
.cell__a { font-size: 28rpx; color: $go-placeholder; }
</style>
