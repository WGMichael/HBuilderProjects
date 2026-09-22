<!--
  A-05 运营统计（团长汇总）

  OPS §4.6、§11 / D-042、D-072、D-076。要点：
    1. 需额外授予 ops-stat-view 独立权限——对内容运营、账号隐私专员、审计查看者默认关闭；
       超级管理员默认持有（D-076）。未授权时「运营统计」整个菜单分组不渲染，
       直接访问由服务端拒绝并写审计。
    2. 指标只用白名单词：已发布活动数、有效订单数、有效总份数、预计金额。
       不得出现销售额、实收金额、实际成交、GMV——平台没有支付能力，
       预计金额是有效明细的价格快照乘数量之和，不代表已付款或平台担保成交。
    3. 「已发布活动数」只统计至少审核通过并进入过进行中的活动（以首次 publish_date 为准）；
       最近发起时间取最近一次成功发布的时间，不使用草稿创建时间。
    4. 各业务状态与治理状态分列，「当前已下架」不与业务状态混为一类。
    5. 页面无修改、无校正入口；导出已放开（D-072），但每次导出写入审计。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" placeholder="团长标识" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
        <button class="uni-button" type="primary" size="mini" :disabled="!list.length || exporting" @click="exportStat">导出</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-stat-tabs type="boldLine" :all="false" :tabs="rangeTabs" v-model="range" @change="onRangeChange" />
      <uni-notice-bar
        single
        text="统计口径只含四项白名单指标：已发布活动数、有效订单数、有效总份数、预计金额。预计金额是有效明细的价格快照乘数量之和，不代表已付款或平台担保成交。每次导出写入审计日志。"
        background-color="#fdf6ec"
        color="#f3a73f"
      />

      <uni-table border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'leader_uid')">团长标识</uni-th>
          <uni-th align="center">发布权限</uni-th>
          <uni-th align="center">微信绑定</uni-th>
          <uni-th align="center">已发布活动数</uni-th>
          <uni-th align="center">业务状态分布</uni-th>
          <uni-th align="center">当前已下架</uni-th>
          <uni-th align="center">有效订单数</uni-th>
          <uni-th align="center">有效总份数</uni-th>
          <uni-th align="center">预计金额</uni-th>
          <uni-th align="center">最近发起时间</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item.leader_uid">
          <uni-td align="center">{{ item.leader_uid }}</uni-td>
          <uni-td align="center">
            <uni-tag :type="item.publish_restriction ? 'error' : 'success'" inverted size="small" :text="labelOf(PUBLISH_RESTRICTION, item.publish_restriction, '正常')"></uni-tag>
          </uni-td>
          <uni-td align="center">{{ item.wx_bound ? '已绑定' : '未绑定' }}</uni-td>
          <uni-td align="center">{{ item.published_activity_count || 0 }}</uni-td>
          <uni-td align="center">
            <view class="status-dist">
              <text v-for="entry in statusEntries(item)" :key="entry.key" class="status-item">{{ entry.text }} {{ entry.count }}</text>
              <text v-if="!statusEntries(item).length" class="empty">—</text>
            </view>
          </uni-td>
          <uni-td align="center">
            <uni-tag v-if="item.governance_off_count" type="error" inverted size="small" :text="String(item.governance_off_count)"></uni-tag>
            <text v-else>0</text>
          </uni-td>
          <uni-td align="center">{{ item.valid_order_count || 0 }}</uni-td>
          <uni-td align="center">{{ item.valid_total_qty || 0 }}</uni-td>
          <uni-td align="center">￥{{ fen2yuan(item.estimated_amount) }}</uni-td>
          <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.last_publish_date"></uni-dateformat></uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="primary" @click="drill(item)">下钻</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <view class="uni-pagination-box">
        <uni-pagination show-iconn show-page-size :current="page" :page-size="pageSize" :total="total" @change="onPageChange" @pageSizeChange="onPageSizeChange" />
      </view>
      <view class="foot-note">
        「已发布活动数」只统计至少审核通过并进入过进行中的活动；最近发起时间取最近一次成功发布的时间，不使用草稿创建时间。本页没有修改与校正入口。
        <text v-if="asOf"> 数据截至 {{ asOf }}。</text>
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>

<script setup>
  import { ref } from 'vue';
  import { onReady } from '@dcloudio/uni-app';
  import { useOpsTable } from '@/common/grouporder/ops-table.js';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import { PUBLISH_RESTRICTION, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

  const keyword = ref('');
  const range = ref('all');
  const exporting = ref(false);

  const rangeTabs = [
    { value: '7d', name: '近 7 天', enable: true },
    { value: '30d', name: '近 30 天', enable: true },
    { value: '90d', name: '近 90 天', enable: true },
    { value: 'all', name: '全部', enable: true },
  ];

  // statOverview 只支持 leader_uid + start_date/end_date（按 publish_date 过滤），
  // 排序字段白名单为 publish_date / create_date
  const { list, total, asOf, loading, errMessage, page, pageSize, setFilter, reload, onFilterChange, onSortChange, onPageChange, onPageSizeChange } = useOpsTable('statOverview', {
    defaultOrderBy: { field: 'publish_date', direction: 'desc' },
  });

  /** 业务状态分布：云对象按状态分别返回计数字段，这里只做展示，不合并治理状态 */
  const STATUS_COUNT_FIELDS = [
    { key: 'reviewing_count', text: '审核中' },
    { key: 'ongoing_count', text: '进行中' },
    { key: 'closed_count', text: '已截止' },
    { key: 'cancelled_count', text: '已取消' },
  ];

  const statusEntries = (item) => STATUS_COUNT_FIELDS.filter((f) => item[f.key]).map((f) => ({ key: f.key, text: f.text, count: item[f.key] }));

  const onSearch = () => {
    setFilter('leader_uid', keyword.value.trim() || undefined);
    reload();
  };

  /** 时间档位换算成 start_date，云对象按活动的 publish_date 过滤 */
  const onRangeChange = (value) => {
    range.value = value;
    const days = { '7d': 7, '30d': 30, '90d': 90 }[value];
    setFilter('start_date', days ? Date.now() - days * 24 * 3600 * 1000 : undefined);
    reload();
  };

  const exportStat = async () => {
    if (exporting.value) return;
    exporting.value = true;
    try {
      // 不带 leader_uid / activity_id 时，云对象导出的是团长汇总表
      const data = await callOps('statExport', {}, { loadingTitle: '导出中' });
      if (data && data.url) {
        // #ifdef H5
        window.open(data.url);
        // #endif
        // #ifndef H5
        uni.showModal({ content: '导出已生成，请在 H5 端下载。', showCancel: false });
        // #endif
      } else {
        uni.showToast({ title: '导出已提交', icon: 'none' });
      }
    } catch (err) {
      // 统一错误处理在 callOps 内
    } finally {
      exporting.value = false;
    }
  };

  const drill = (item) => {
    uni.navigateTo({ url: './leader?uid=' + item.leader_uid });
  };

  onReady(() => reload());
</script>

<style lang="scss" scoped>
  .status-dist {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
  }

  .status-item {
    font-size: 12px;
    color: #606266;
    margin: 0 4px;
  }

  .empty {
    color: #999;
  }

  .foot-note {
    font-size: 12px;
    color: #999;
    line-height: 1.8;
    margin-top: 12px;
  }
</style>
