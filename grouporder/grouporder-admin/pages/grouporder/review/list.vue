<!--
  A-17 活动发布审核（待审队列）

  OPS §4.3 / D-043、D-057、D-058、D-059。要点：
    1. 这是发布前拦截，与 A-08 的事后治理是两条独立流程，页面不合并——
       A-17 的对象是尚未公开的待审内容、结论只有通过或不通过；
       A-08 的对象是已上线内容、结论是 6 选 1 的处置。
    2. 队列来源由 A-18 的审核模式决定，模式在提交时固化到活动上。
    3. 队列按提交时间正序（先到先处理）。
    4. 审核通过前活动不对外开放、不可分享、不可下单；活动不进入任何公开列表（D-059）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" placeholder="活动短码 / 标题 / 团长标识" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar single :text="noticeText" background-color="#fdf6ec" color="#f3a73f" />
      <uni-table border stripe :loading="loading" :emptyText="errMessage || '待审队列为空'">
        <uni-tr>
          <uni-th align="center">活动短码</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'keyword')">活动标题</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'leader_uid')">团长</uni-th>
          <uni-th align="center">内容版本</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="modeFilter" @filter-change="onFilterChange($event, 'review_mode')">审核模式</uni-th>
          <uni-th align="center">文本检测</uni-th>
          <uni-th align="center">图片检测</uni-th>
          <uni-th align="center" filter-type="timestamp" sortable @filter-change="onFilterChange($event, 'review_submit_date')" @sort-change="onSortChange($event, 'review_submit_date')">提交时间</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.short_code || '—' }}</uni-td>
          <uni-td align="center">{{ item.title }}</uni-td>
          <uni-td align="center">{{ item.leader_uid || '—' }}</uni-td>
          <uni-td align="center">v{{ item.content_version || 1 }}</uni-td>
          <uni-td align="center">{{ labelOf(REVIEW_MODE, item.review_mode) }}</uni-td>
          <uni-td align="center">
            <uni-tag :type="checkTagType(item.text_check_status)" inverted size="small" :text="labelOf(CHECK_STATUS, item.text_check_status)"></uni-tag>
          </uni-td>
          <uni-td align="center">
            <uni-tag :type="checkTagType(item.img_check_status)" inverted size="small" :text="labelOf(CHECK_STATUS, item.img_check_status)"></uni-tag>
          </uni-td>
          <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.review_submit_date"></uni-dateformat></uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="primary" @click="openDetail(item)">审核</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>
      <view class="uni-pagination-box">
        <uni-pagination show-iconn show-page-size :current="page" :page-size="pageSize" :total="total" @change="onPageChange" @pageSizeChange="onPageSizeChange" />
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>

<script setup>
  import { computed, ref } from 'vue';
  import { onReady } from '@dcloudio/uni-app';
  import { useOpsTable } from '@/common/grouporder/ops-table.js';
  import { REVIEW_MODE, REVIEW_MODE_OPTIONS, CHECK_STATUS, labelOf } from '@/common/grouporder/dict.js';

  const keyword = ref('');

  // 队列按提交时间正序：先到先处理
  const { list, total, loading, errMessage, page, pageSize, setFilter, reload, onFilterChange, onSortChange, onPageChange, onPageSizeChange } = useOpsTable('reviewList', {
    defaultOrderBy: { field: 'review_submit_date', direction: 'asc' },
  });

  const modeFilter = REVIEW_MODE_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  const noticeText = computed(() => `待审 ${total.value} 个活动，按提交时间正序（先到先处理）。审核通过前活动不对外开放、不可分享、不可下单；图片异步检测不阻塞审核放行。`);

  const checkTagType = (status) => (status === 3 ? 'error' : status === 2 ? 'warning' : status === 1 ? 'success' : 'default');

  const onSearch = () => {
    setFilter('keyword', keyword.value.trim() || undefined);
    reload();
  };

  const openDetail = (item) => {
    uni.navigateTo({
      url: './detail?id=' + item._id,
      events: {
        refreshData: () => reload(),
      },
    });
  };

  onReady(() => reload());
</script>

<style lang="scss" scoped></style>
