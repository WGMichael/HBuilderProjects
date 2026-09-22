<!--
  A-02 访问结果态组件

  账号停用、权限不足或已撤销、会话失效、对象不存在或已变化，四类被拒绝的场景
  统一由本组件表达，各业务页不要自画提示（OPS §4.1、§12.2）。

  三条规则（不受 D-072 影响）：
    1. 鉴权以提交时的最新权限为准，页面不保留任何可继续操作的状态
    2. 被拒绝的访问同样写入审计
    3. D-072 已取消二次验证，本组件不含任何验证入口
-->
<template>
  <view class="go-result">
    <view class="go-result__icon" :style="{ color: current.color }">{{ current.symbol }}</view>
    <view class="go-result__title">{{ current.title }}</view>
    <view class="go-result__desc">{{ current.desc }}</view>
    <view class="go-result__detail" v-if="detail">{{ detail }}</view>
    <uni-notice-bar class="go-result__audit" single :text="current.audit" background-color="#fdf6ec" color="#f3a73f" />
    <view class="go-result__actions uni-group" v-if="showActions">
      <button v-if="current.canBack" class="uni-button" type="primary" size="mini" @click="backToWorkbench">返回工作台</button>
      <button class="uni-button" :type="current.canBack ? 'default' : 'primary'" size="mini" @click="relogin">重新登录</button>
    </view>
  </view>
</template>

<script setup>
  import { computed } from 'vue';
  import { mutations as uniIdMutations } from '@/uni_modules/uni-id-pages/common/store.js';
  import config from '@/admin.config.js';

  const props = defineProps({
    // account_disabled | forbidden | session_expired | object_changed
    type: {
      type: String,
      default: 'forbidden',
    },
    // 补充说明，如目标对象名称或服务端返回的 errMsg
    detail: {
      type: String,
      default: '',
    },
    showActions: {
      type: Boolean,
      default: true,
    },
  });

  const RESULT_MAP = {
    account_disabled: {
      symbol: '⊘',
      color: '#e43d33',
      title: '账号已停用',
      desc: '该账号已被停用，停用立即生效。未完成的操作不得继续提交，已打开的页面再次操作同样会被拒绝。如需恢复，请联系超级管理员。',
      audit: '本次访问已记入审计日志（操作人、时间、目标对象、拒绝原因）。',
      canBack: false,
    },
    forbidden: {
      symbol: '⊘',
      color: '#e43d33',
      title: '权限不足 / 权限已撤销',
      desc: '当前角色没有该项能力，本次请求已被拒绝。鉴权以提交时的最新权限为准，页面不保留任何可继续操作的状态。',
      audit: '本次访问已记入审计日志（操作人、时间、目标对象、拒绝原因）。',
      canBack: true,
    },
    session_expired: {
      symbol: '⏻',
      color: '#f3a73f',
      title: '会话失效',
      desc: '登录状态已失效，未提交的操作已终止。重新登录后可回到原任务继续处理。',
      audit: '登录与登出记录写入登录日志，可在「审计 → 登录日志」中查询。',
      canBack: false,
    },
    object_changed: {
      symbol: '⚠',
      color: '#f3a73f',
      title: '对象不存在或已变化',
      desc: '目标对象不存在、已被删除，或状态已被他人修改。本次操作已停止，不会创建替代对象，也不会用旧页面的内容覆盖新状态。请返回列表刷新后重试。',
      audit: '本次访问已记入审计日志（操作人、时间、目标对象、拒绝原因）。',
      canBack: true,
    },
  };

  const current = computed(() => RESULT_MAP[props.type] || RESULT_MAP.forbidden);

  const backToWorkbench = () => {
    uni.reLaunch({
      url: config.index.url,
      fail: (err) => {
        uni.showModal({ content: (err && err.errMsg) || '页面跳转失败', showCancel: false });
      },
    });
  };

  const relogin = () => {
    // logout 内部已处理「token 已过期则不调服务端接口」，并会跳转到登录页
    uniIdMutations.logout();
  };
</script>

<style lang="scss" scoped>
  .go-result {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 60px 20px;

    &__icon {
      font-size: 72px;
      line-height: 1;
      margin-bottom: 20px;
    }

    &__title {
      font-size: 22px;
      color: #303133;
      margin-bottom: 12px;
    }

    &__desc {
      font-size: 14px;
      color: #606266;
      line-height: 1.8;
      max-width: 560px;
      text-align: center;
    }

    &__detail {
      font-size: 13px;
      color: #909399;
      line-height: 1.8;
      max-width: 560px;
      text-align: center;
      margin-top: 8px;
    }

    &__audit {
      width: 100%;
      max-width: 560px;
      margin-top: 20px;
    }

    &__actions {
      margin-top: 24px;
    }
  }
</style>
