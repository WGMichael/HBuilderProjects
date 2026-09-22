<!--
  A-13 Excel 事件审计

  OPS §4.8、§10 / D-071、D-072、D-073。要点：
    1. 记录关联活动、文件版本或生成标识、请求用户、时间、结果、失败原因摘要
       与权限校验结果，5 种事件全部可查：生成成功 / 生成失败 / 下载成功 / 下载失败 / 权限拒绝。
    2. 日志里没有可继续使用的下载地址——列中只有文件版本与生成标识。
       D-071③「临时地址不得写入任何日志或页面」没有被 D-072 改动。
    3. 「下载」按钮拿的是**当场换取的新地址**（30 分钟失效），
       绝不显示也不复用日志中的历史地址。
    4. 文件在云存储保留 60 天，过期后按钮不可点；不随订单保留三年。
    5. 不提供「重新生成」入口——清单版本由团长的订单变动驱动，
       运营触发重新生成会污染版本序列。
    6. 运营的每一次下载本身也是一条审计记录（action_type = export_download），
       请求人记当前运营账号。下载不单设权限点，随本页的 ops-audit-export（D-073）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" placeholder="活动编号 / 团长 / 请求人 / 生成标识" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar
        single
        text="本页不显示下载地址。点击「下载」会重新校验权限并换取一个 30 分钟失效的新地址，不复用日志中的历史地址；每次下载本身也是一条审计记录。文件在云存储保留 60 天，不随订单保留三年。"
        background-color="#fdf6ec"
        color="#f3a73f"
      />

      <uni-table border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="timestamp" sortable @filter-change="onFilterChange($event, 'create_date')" @sort-change="onSortChange($event, 'create_date')">时间</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'activity_id')">活动</uni-th>
          <uni-th align="center">团长</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'request_uid')">请求人</uni-th>
          <uni-th align="center">文件版本 / 生成标识</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="eventFilter" @filter-change="onFilterChange($event, 'event_type')">事件</uni-th>
          <uni-th align="center">权限校验</uni-th>
          <uni-th align="center">链接有效性</uni-th>
          <uni-th align="center">失败原因摘要</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.create_date"></uni-dateformat></uni-td>
          <uni-td align="center">{{ item.activity_short_code || item.activity_id || '—' }}</uni-td>
          <uni-td align="center">{{ item.leader_uid || '—' }}</uni-td>
          <uni-td align="center">{{ item.request_uid || '—' }}</uni-td>
          <uni-td align="center">{{ fileVersionText(item) }}</uni-td>
          <uni-td align="center">
            <uni-tag :type="eventTagType(item.event_type)" inverted size="small" :text="labelOf(EXPORT_EVENT, item.event_type)"></uni-tag>
          </uni-td>
          <uni-td align="center">{{ item.permission_check_result || '—' }}</uni-td>
          <uni-td align="center">{{ item.link_valid_result || '—' }}</uni-td>
          <uni-td align="center">{{ item.fail_reason || '—' }}</uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button v-if="canDownload(item)" class="uni-button" size="mini" type="primary" :disabled="downloading" @click="download(item)">下载</button>
              <text v-else class="no-file">——</text>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <view class="uni-pagination-box">
        <uni-pagination show-iconn show-page-size :current="page" :page-size="pageSize" :total="total" @change="onPageChange" @pageSizeChange="onPageSizeChange" />
      </view>
      <view class="foot-note">生成失败的记录没有文件，操作列显示「——」。本页没有「重新生成」入口：清单版本由团长的订单变动驱动，运营触发重新生成会污染版本序列。</view>
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
  import { EXPORT_EVENT, EXPORT_EVENT_OPTIONS, labelOf } from '@/common/grouporder/dict.js';

  /** 文件在云存储保留 60 天（D-071②） */
  const FILE_RETENTION_DAYS = 60;

  const keyword = ref('');
  const downloading = ref(false);

  const { list, total, loading, errMessage, page, pageSize, setFilter, reload, load, onFilterChange, onSortChange, onPageChange, onPageSizeChange } = useOpsTable('exportLogList', {
    defaultOrderBy: { field: 'create_date', direction: 'desc' },
  });

  const eventFilter = EXPORT_EVENT_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  const eventTagType = (value) => {
    if (value === 1 || value === 3) return 'success';
    if (value === 5) return 'error';
    if (value === 2 || value === 4) return 'warning';
    return 'default';
  };

  const fileVersionText = (item) => {
    const version = item.file_version ? item.file_version : '—';
    return item.request_id ? version + ' · ' + item.request_id : version;
  };

  /**
   * 生成失败（event_type = 2）没有文件；超过 60 天保留期的文件已被清理。
   * 这里只决定按钮是否可点，真正的权限与有效性由 exportDownload 在服务端重新校验。
   */
  const canDownload = (item) => {
    if (item.event_type === 2) return false;
    if (!item.file_version) return false;
    const created = item.create_date ? new Date(item.create_date).getTime() : 0;
    if (!created) return true;
    return Date.now() - created <= FILE_RETENTION_DAYS * 24 * 3600 * 1000;
  };

  const onSearch = () => {
    // exportLogList 支持 activity_id / event_type / leader_uid / request_uid，没有通用 keyword
    setFilter('activity_id', keyword.value.trim() || undefined);
    reload();
  };

  const download = async (item) => {
    if (downloading.value) return;
    downloading.value = true;
    try {
      // 服务端重新校验权限并换取新的临时地址；页面不缓存该地址，也不写回任何日志
      const data = await callOps('exportDownload', { file_version: item.file_version }, { loadingTitle: '换取下载地址' });
      const url = data && data.url;
      if (!url) {
        uni.showModal({ content: '未取到有效的下载地址，请稍后重试。', showCancel: false });
        return;
      }
      // #ifdef H5
      window.open(url);
      // #endif
      // #ifndef H5
      uni.showModal({ content: '下载地址已生成，请在 H5 端下载。', showCancel: false });
      // #endif
      // 本次下载本身也是一条审计记录，刷新列表让它立刻可见
      load();
    } catch (err) {
      // 权限拒绝与链接过期都由服务端裁决并记录
    } finally {
      downloading.value = false;
    }
  };

  onReady(() => reload());
</script>

<style lang="scss" scoped>
  .no-file {
    color: #999;
  }

  .foot-note {
    font-size: 12px;
    color: #999;
    line-height: 1.8;
    margin-top: 12px;
  }
</style>
