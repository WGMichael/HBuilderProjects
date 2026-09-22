<!--
  A-03 工作台（改造自 uni-admin 自带首页）

  OPS §4.2 / D-070。要点：
    1. 待办按处理紧迫度分三档展示，同档内按提交时间正序（先到先处理）：
       档 1 举报与内容检测（违规内容仍在线上）
       档 2 活动发布审核（团长在等待，但内容尚未公开）
       档 3 账号与隐私事项（需人工核验，本就无法快速处理）
    2. 待办没有「忽略」「标记已读」按钮（D-070）——它是派生视图，
       条目随对象状态变化自动增减，不由运营手工消除。
    3. 待办来自 workbenchTodo：云对象按当前账号的权限决定返回哪些档，
       无权限的档不返回，页面不渲染。

  原 uni-stat 的设备 / 用户概览与平台选择 tabs 已移除。uni-stat 页面本身的清理
  属阶段 4（ADM-14：必须在本屏改造完成后再做），本次不动那些文件。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <button class="uni-button" type="default" size="mini" @click="load">刷新</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar
        single
        text="待办按处理紧迫度分三档，同档按提交时间正序（先到先处理）。这是派生视图，条目随对象状态自动增减，没有「忽略」或「标记已读」。"
        background-color="#fdf6ec"
        color="#f3a73f"
      />

      <view v-if="asOf" class="as-of">数据截至 {{ asOf }}</view>

      <view v-for="group in levels" :key="group.level" class="uni-stat--x todo-card">
        <view class="todo-card__head">
          <text class="todo-card__title">
            <text class="todo-card__level" :class="'todo-card__level--' + group.level">{{ group.level }}</text>
            {{ group.label }}
          </text>
          <text class="todo-card__count">{{ group.count }} 项待处理</text>
        </view>
        <uni-table border stripe :emptyText="'暂无待办'">
          <uni-tr>
            <uni-th align="center" width="180">类型</uni-th>
            <uni-th align="center">编号</uni-th>
            <uni-th align="center">摘要</uni-th>
            <uni-th align="center" width="180">提交时间</uni-th>
            <uni-th align="center" width="120">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in group.items" :key="item.id">
            <uni-td align="center">{{ item.title }}</uni-td>
            <uni-td align="center">{{ item.no || '—' }}</uni-td>
            <uni-td align="center">{{ item.summary || '—' }}</uni-td>
            <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.create_date"></uni-dateformat></uni-td>
            <uni-td align="center">
              <view class="uni-group">
                <button class="uni-button" size="mini" type="primary" @click="handle(item)">处理</button>
              </view>
            </uni-td>
          </uni-tr>
        </uni-table>
      </view>

      <view v-if="loaded && !levels.length" class="empty-all">当前没有分配到你的待办事项。</view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>

<script setup>
  import { ref } from 'vue';
  import { onShow } from '@dcloudio/uni-app';
  import { callOps } from '@/common/grouporder/ops-co.js';

  const levels = ref([]);
  const asOf = ref('');
  const loaded = ref(false);

  // 待办类型 → 目标页面。列表类页面（申诉、隐私、检测复核）没有独立详情页，
  // 详情在各自列表里以弹窗打开，因此跳到列表即可。
  const ROUTE_MAP = {
    report: (item) => '/pages/grouporder/report/detail?id=' + item.id,
    content_check: () => '/pages/grouporder/report/list',
    review: (item) => '/pages/grouporder/review/detail?id=' + item.id,
    bind_appeal: () => '/pages/grouporder/appeal/list',
    privacy_case: () => '/pages/grouporder/privacy-case/list',
  };

  const load = async () => {
    try {
      const data = (await callOps('workbenchTodo')) || {};
      // 只保留有条目的档，空档不占版面（无权限的档云对象本就不返回）
      levels.value = (data.levels || []).filter((g) => g.count > 0);
      asOf.value = data.asOf || '';
    } catch (err) {
      // 未持有 ops-workbench 时由 callOps 跳 A-02 结果页
      levels.value = [];
    } finally {
      loaded.value = true;
    }
  };

  const handle = (item) => {
    const build = ROUTE_MAP[item.type];
    if (!build) return;
    uni.navigateTo({
      url: build(item),
      // 处理完回到工作台时刷新，让已处理的条目消失
      events: { refreshData: () => load() },
      fail: (e) => uni.showModal({ content: (e && e.errMsg) || '页面跳转失败', showCancel: false }),
    });
  };

  // 每次进入工作台都重新拉取：待办随对象状态变化，不缓存
  onShow(() => load());
</script>

<style lang="scss" scoped>
  .as-of {
    font-size: 12px;
    color: #999;
    margin: 10px 0;
  }

  .todo-card {
    padding: 15px;
    border-radius: 4px;
    margin-bottom: 15px;

    &__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    &__title {
      display: flex;
      align-items: center;
      font-size: 15px;
      color: #333;
    }

    &__level {
      display: inline-block;
      width: 22px;
      height: 22px;
      line-height: 22px;
      text-align: center;
      border-radius: 11px;
      color: #fff;
      font-size: 13px;
      margin-right: 8px;

      &--1 {
        background-color: #e43d33;
      }

      &--2 {
        background-color: #f3a73f;
      }

      &--3 {
        background-color: #2979ff;
      }
    }

    &__count {
      font-size: 13px;
      color: #909399;
    }
  }

  .empty-all {
    text-align: center;
    font-size: 14px;
    color: #999;
    padding: 60px 0;
  }
</style>
