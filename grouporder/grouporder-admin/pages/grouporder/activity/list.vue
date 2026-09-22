<!--
  A-07 活动与商品（列表入口）

  OPS §4.4 / D-054、D-064、D-075。三条硬规则：
    1. 业务状态与治理状态是两个独立字段，分列两栏，不得合成一个标签
    2. 全页没有创建 / 编辑 / 取消活动、增删改商品、改价格库存限购截止时间的入口——
       那是团长的经营动作，运营只做治理（BRIEF §6.4）
    3. 数据一律走云对象，不得 <unicloud-db :collection="grouporder-*">（D-075）

  ⚠ 规格缺口：CLOUD_API §11 批 A 只有 activityDetail，没有活动列表方法。
     本页暂用批 C 的 searchActivities 取数，但它的权限点是 ops-search，
     而本页菜单入口是 ops-content-activity，两者不一致（已上报，待契约补齐）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" placeholder="活动短码 / 标题 / 发布者标识" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
      </view>
    </view>
    <view class="uni-container">
      <uni-notice-bar single :text="noticeText" background-color="#fdf6ec" color="#f3a73f" />
      <uni-table border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'short_code')">活动短码</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'title')">活动标题</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'leader_uid')">发布者</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="deliveryFilter" @filter-change="onFilterChange($event, 'delivery_type')">交付方式</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="statusFilter" @filter-change="onFilterChange($event, 'status')">业务状态（团长）</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="governanceFilter" @filter-change="onFilterChange($event, 'governance_status')">治理状态（平台）</uni-th>
          <uni-th align="center" filter-type="timestamp" sortable @filter-change="onFilterChange($event, 'end_time')" @sort-change="onSortChange($event, 'end_time')">截止时间</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.short_code || '—' }}</uni-td>
          <uni-td align="center">{{ item.title }}</uni-td>
          <uni-td align="center">{{ item.leader_uid || '—' }}</uni-td>
          <uni-td align="center">{{ labelOf(DELIVERY_TYPE, item.delivery_type) }}</uni-td>
          <uni-td align="center">
            <uni-tag :type="statusTagType(item.status)" inverted size="small" :text="labelOf(ACTIVITY_STATUS, item.status)"></uni-tag>
          </uni-td>
          <uni-td align="center">
            <uni-tag :type="item.governance_status === 1 ? 'error' : 'success'" inverted size="small" :text="labelOf(GOVERNANCE_STATUS, item.governance_status)"></uni-tag>
            <text v-if="item.ever_governed === 1" class="ever-governed">曾被下架</text>
          </uni-td>
          <uni-td align="center">
            <uni-dateformat :threshold="[0, 0]" :date="item.end_time"></uni-dateformat>
          </uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="primary" @click="openDetail(item)">查看详情</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>
      <view class="uni-pagination-box">
        <uni-pagination show-iconn show-page-size :current="page" :page-size="pageSize" :total="total" @change="onPageChange" @pageSizeChange="onPageSizeChange" />
      </view>
      <view class="as-of" v-if="asOf">数据截至 {{ asOf }}</view>
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
  import { ACTIVITY_STATUS, ACTIVITY_STATUS_OPTIONS, GOVERNANCE_STATUS, GOVERNANCE_STATUS_OPTIONS, DELIVERY_TYPE, DELIVERY_TYPE_OPTIONS, labelOf } from '@/common/grouporder/dict.js';

  const keyword = ref('');

  const { list, total, asOf, loading, errMessage, page, pageSize, filters, reload, load, onFilterChange, onSortChange, onPageChange, onPageSizeChange } = useOpsTable('searchActivities', {
    defaultOrderBy: { field: 'create_date', direction: 'desc' },
  });

  const statusFilter = ACTIVITY_STATUS_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const governanceFilter = GOVERNANCE_STATUS_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const deliveryFilter = DELIVERY_TYPE_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  const noticeText = computed(() => `共 ${total.value} 个活动。业务状态由团长决定、治理状态由平台决定，两者相互独立；本页只做查看与治理，不提供任何编辑活动或商品的入口。每次查看与导出均记入审计。`);

  const statusTagType = (status) => {
    if (status === 2) return 'success';
    if (status === 4) return 'default';
    return 'primary';
  };

  const onSearch = () => {
    const value = keyword.value.trim();
    if (value) {
      filters.keyword = { type: 'search', value };
    } else {
      delete filters.keyword;
    }
    reload();
  };

  const openDetail = (item) => {
    uni.navigateTo({
      url: './detail?id=' + item._id,
      events: {
        refreshData: () => load(),
      },
    });
  };

  onReady(() => reload());
</script>

<style lang="scss" scoped>
  .ever-governed {
    display: block;
    font-size: 12px;
    color: #f3a73f;
    margin-top: 2px;
  }

  .as-of {
    text-align: center;
    font-size: 12px;
    color: #999;
    margin-top: 10px;
  }
</style>
