<!--
  A-08 举报与内容审核（列表）

  OPS §4.3、§5.1、§5.2 / D-054。两个模块共用本屏，数据源与流程都不同：
    - 举报处理：grouporder-report，5 状态（待处理 → 处理中 → 已结案 → 复核中 → 复核完成）
    - 内容检测复核：grouporder-content-check，4 状态（待复核 / 已放行 / 维持拦截 / 已处置）

  举报提交本身不触发下架（D-054）——只有审核认定成立后才执行处置。
  本页是上线后的事后治理，与 A-17 的发布前拦截不合并（对象、时机与结论集合都不同）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" :placeholder="module === 'report' ? '举报编号 / 活动编号 / 商品关键词' : '检测记录号 / 对象标识'" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-stat-tabs type="boldLine" :all="false" :tabs="moduleTabs" v-model="module" @change="onModuleChange" />

      <!-- 举报处理 -->
      <template v-if="module === 'report'">
        <uni-stat-tabs class="status-tabs" type="line" :all="false" :tabs="reportStatusTabs" v-model="reportStatus" @change="onReportStatusChange" />
        <uni-notice-bar single text="举报提交本身不触发下架，只有审核认定成立后才执行处置。复核会创建新记录，不覆盖原结论。查看举报详情已记入审计。" background-color="#fdf6ec" color="#f3a73f" />
        <uni-table border stripe :loading="reportTable.loading.value" :emptyText="reportTable.errMessage.value || '没有更多数据'">
          <uni-tr>
            <uni-th align="center" filter-type="search" @filter-change="reportTable.onFilterChange($event, 'report_no')">举报编号</uni-th>
            <uni-th align="center">被举报对象</uni-th>
            <uni-th align="center">举报类型</uni-th>
            <uni-th align="center">状态</uni-th>
            <uni-th align="center">处理人</uni-th>
            <uni-th align="center" filter-type="timestamp" sortable @filter-change="reportTable.onFilterChange($event, 'create_date')" @sort-change="reportTable.onSortChange($event, 'create_date')">举报时间</uni-th>
            <uni-th align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in reportTable.list.value" :key="item._id">
            <uni-td align="center">{{ item.report_no }}</uni-td>
            <uni-td align="center">
              <view>{{ item.activity_title || item.activity_id || '—' }}</view>
              <text v-if="item.goods_name || item.goods_id" class="sub">商品：{{ item.goods_name || item.goods_id }}</text>
            </uni-td>
            <uni-td align="center">{{ item.reason_type || '—' }}</uni-td>
            <uni-td align="center">
              <uni-tag :type="reportStatusTagType(item.status)" inverted size="small" :text="labelOf(REPORT_STATUS, item.status)"></uni-tag>
            </uni-td>
            <uni-td align="center">{{ item.handler_uid || '—' }}</uni-td>
            <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.create_date"></uni-dateformat></uni-td>
            <uni-td align="center">
              <view class="uni-group">
                <button class="uni-button" size="mini" type="primary" @click="openReport(item)">{{ item.status === 1 ? '领取并处理' : '查看' }}</button>
              </view>
            </uni-td>
          </uni-tr>
        </uni-table>
        <view class="uni-pagination-box">
          <uni-pagination
            show-iconn
            show-page-size
            :current="reportTable.page.value"
            :page-size="reportTable.pageSize.value"
            :total="reportTable.total.value"
            @change="reportTable.onPageChange"
            @pageSizeChange="reportTable.onPageSizeChange"
          />
        </view>
      </template>

      <!-- 内容检测复核 -->
      <template v-else>
        <uni-stat-tabs class="status-tabs" type="line" :all="false" :tabs="checkStatusTabs" v-model="checkStatus" @change="onCheckStatusChange" />
        <uni-notice-bar single text="图片异步检测不阻塞审核放行（D-058）。复核放行或维持拦截都会记入审计，维持拦截不自动改写活动的业务状态。" background-color="#fdf6ec" color="#f3a73f" />
        <uni-table border stripe :loading="checkTable.loading.value" :emptyText="checkTable.errMessage.value || '没有更多数据'">
          <uni-tr>
            <uni-th align="center">检测记录</uni-th>
            <uni-th align="center" filter-type="select" :filter-data="objectTypeFilter" @filter-change="checkTable.onFilterChange($event, 'object_type')">对象类型</uni-th>
            <uni-th align="center">内容类型</uni-th>
            <uni-th align="center">检测结果</uni-th>
            <uni-th align="center">命中原因</uni-th>
            <uni-th align="center">复核状态</uni-th>
            <uni-th align="center" filter-type="timestamp" sortable @filter-change="checkTable.onFilterChange($event, 'check_time')" @sort-change="checkTable.onSortChange($event, 'check_time')">检测时间</uni-th>
            <uni-th align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in checkTable.list.value" :key="item._id">
            <uni-td align="center">{{ item.trace_id || item._id }}</uni-td>
            <uni-td align="center">{{ CHECK_OBJECT_TYPE[item.object_type] || item.object_type }}</uni-td>
            <uni-td align="center">{{ CHECK_CONTENT_TYPE[item.content_type] || item.content_type }}</uni-td>
            <uni-td align="center">
              <uni-tag :type="item.check_result === 3 ? 'error' : item.check_result === 2 ? 'warning' : 'success'" inverted size="small" :text="labelOf(CHECK_RESULT, item.check_result)"></uni-tag>
            </uni-td>
            <uni-td align="center">{{ item.hit_reason || '—' }}</uni-td>
            <uni-td align="center">
              <uni-tag :type="item.status === 1 ? 'warning' : item.status === 3 ? 'error' : 'default'" inverted size="small" :text="labelOf(CHECK_REVIEW_STATUS, item.status)"></uni-tag>
            </uni-td>
            <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.check_time || item.create_date"></uni-dateformat></uni-td>
            <uni-td align="center">
              <view class="uni-group">
                <button class="uni-button" size="mini" type="primary" :disabled="item.status !== 1" @click="openCheckHandle(item)">复核</button>
                <button v-if="item.object_type === 'activity' && item.object_id" class="uni-button" size="mini" type="default" @click="goActivity(item.object_id)">查看活动</button>
              </view>
            </uni-td>
          </uni-tr>
        </uni-table>
        <view class="uni-pagination-box">
          <uni-pagination
            show-iconn
            show-page-size
            :current="checkTable.page.value"
            :page-size="checkTable.pageSize.value"
            :total="checkTable.total.value"
            @change="checkTable.onPageChange"
            @pageSizeChange="checkTable.onPageSizeChange"
          />
        </view>
      </template>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->

    <!-- 内容检测复核处理 -->
    <uni-popup ref="checkPopupRef" type="center" :is-mask-click="false">
      <view class="check-dialog">
        <view class="check-dialog__header">内容检测复核</view>
        <view class="check-dialog__body">
          <view class="kv"><text class="kv-k">检测记录</text><view class="kv-v">{{ (currentCheck || {}).trace_id || (currentCheck || {})._id }}</view></view>
          <view class="kv"><text class="kv-k">检测结果</text><view class="kv-v">{{ labelOf(CHECK_RESULT, (currentCheck || {}).check_result) }}</view></view>
          <view class="kv"><text class="kv-k">命中原因</text><view class="kv-v">{{ (currentCheck || {}).hit_reason || '—' }}</view></view>
          <view class="form-item">
            <text class="form-label">* 复核结论</text>
            <uni-data-checkbox v-model="checkForm.conclusion" :localdata="checkConclusionOptions" />
          </view>
          <view class="form-item">
            <text class="form-label">* 复核理由</text>
            <uni-easyinput type="textarea" v-model="checkForm.reason" :maxlength="500" placeholder="复核理由必填；对外展示部分不得包含内部敏感信息" />
          </view>
        </view>
        <view class="uni-group check-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeCheckHandle">取消</button>
          <button class="uni-button" size="mini" type="primary" :disabled="!checkSubmittable || submitting" @click="submitCheckHandle">提交复核</button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue';
  import { onLoad, onReady } from '@dcloudio/uni-app';
  import { useOpsTable } from '@/common/grouporder/ops-table.js';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import { REPORT_STATUS, REPORT_STATUS_OPTIONS, CHECK_RESULT, CHECK_REVIEW_STATUS, CHECK_REVIEW_STATUS_OPTIONS, CHECK_OBJECT_TYPE, CHECK_CONTENT_TYPE, labelOf } from '@/common/grouporder/dict.js';

  const keyword = ref('');
  const module = ref('report');
  const reportStatus = ref('');
  const checkStatus = ref('');
  const submitting = ref(false);
  const currentCheck = ref(null);
  const checkPopupRef = ref(null);
  const checkForm = reactive({ conclusion: '', reason: '' });

  const moduleTabs = [
    { value: 'report', name: '举报处理', enable: true },
    { value: 'check', name: '内容检测复核', enable: true },
  ];

  const reportStatusTabs = [{ value: '', name: '全部', enable: true }].concat(REPORT_STATUS_OPTIONS.map((o) => ({ value: o.value, name: o.text, enable: true })));

  const checkStatusTabs = [{ value: '', name: '全部', enable: true }].concat(CHECK_REVIEW_STATUS_OPTIONS.map((o) => ({ value: o.value, name: o.text, enable: true })));

  // checkList 只支持按 object_type / object_id / check_result / status 筛选
  const objectTypeFilter = Object.keys(CHECK_OBJECT_TYPE).map((k) => ({ value: k, text: CHECK_OBJECT_TYPE[k] }));
  const checkConclusionText = (value) => (checkConclusionOptions.find((o) => o.value === value) || {}).text || '';

  /** 复核只有放行与维持拦截两种结论；「已处置」由后续治理动作产生，不在此处直接选择 */
  const checkConclusionOptions = [
    { value: 2, text: '放行' },
    { value: 3, text: '维持拦截' },
  ];

  const reportTable = useOpsTable('reportList', { defaultOrderBy: { field: 'create_date', direction: 'desc' } });
  const checkTable = useOpsTable('checkList', { defaultOrderBy: { field: 'check_time', direction: 'desc' } });

  const activeTable = computed(() => (module.value === 'report' ? reportTable : checkTable));

  const reportStatusTagType = (status) => {
    if (status === 1) return 'warning';
    if (status === 2) return 'primary';
    if (status === 4) return 'warning';
    return 'default';
  };

  // reportList 没有 keyword 筛选，按举报编号过滤；checkList 按对象标识过滤
  const applyKeyword = (table) => {
    const value = keyword.value.trim();
    const field = table === reportTable ? 'report_no' : 'object_id';
    table.setFilter(field, value || undefined);
  };

  const onSearch = () => {
    const table = activeTable.value;
    applyKeyword(table);
    table.reload();
  };

  const onModuleChange = (value) => {
    module.value = value;
    const table = activeTable.value;
    applyKeyword(table);
    table.reload();
  };

  const onReportStatusChange = (value) => {
    reportStatus.value = value;
    reportTable.setFilter('status', value === '' ? undefined : value);
    reportTable.reload();
  };

  const onCheckStatusChange = (value) => {
    checkStatus.value = value;
    checkTable.setFilter('status', value === '' ? undefined : value);
    checkTable.reload();
  };

  const openReport = (item) => {
    uni.navigateTo({
      url: './detail?id=' + item._id,
      events: {
        refreshData: () => reportTable.load(),
      },
    });
  };

  const goActivity = (activityId) => {
    uni.navigateTo({ url: '/pages/grouporder/activity/detail?id=' + activityId });
  };

  const openCheckHandle = (item) => {
    currentCheck.value = item;
    checkForm.conclusion = '';
    checkForm.reason = '';
    checkPopupRef.value.open();
  };

  const closeCheckHandle = () => {
    checkPopupRef.value.close();
    currentCheck.value = null;
  };

  const checkSubmittable = computed(() => !!checkForm.conclusion && !!checkForm.reason.trim());

  const submitCheckHandle = async () => {
    if (!checkSubmittable.value || submitting.value) return;
    submitting.value = true;
    try {
      await callOps(
        'checkHandle',
        {
          check_id: currentCheck.value._id,
          status: checkForm.conclusion,
          // 云对象另存一份文字结论，与 status 一起写入复核记录
          review_conclusion: checkConclusionText(checkForm.conclusion),
          review_reason: checkForm.reason.trim(),
        },
        { loadingTitle: '提交中' }
      );
      uni.showToast({ title: '复核已提交', icon: 'none' });
      closeCheckHandle();
      checkTable.load();
    } catch (err) {
      // 统一错误处理在 callOps 内
    } finally {
      submitting.value = false;
    }
  };

  onLoad((query = {}) => {
    // 由 A-07「查看关联举报」带活动编号跳入时，直接按该活动过滤
    if (query.activity_id) {
      reportTable.setFilter('activity_id', query.activity_id);
    }
  });

  onReady(() => reportTable.reload());
</script>

<style lang="scss" scoped>
  .status-tabs {
    margin: 10px 0;
  }

  .sub {
    display: block;
    font-size: 12px;
    color: #999;
  }

  .kv {
    display: flex;
    font-size: 14px;
    margin-bottom: 10px;
  }

  .kv-k {
    width: 90px;
    color: #909399;
    flex-shrink: 0;
  }

  .kv-v {
    color: #606266;
    flex: 1;
  }

  .form-item {
    margin-bottom: 15px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    color: #606266;
    margin-bottom: 6px;
  }

  .check-dialog {
    width: 480px;
    max-width: 92vw;
    padding: 25px 30px;
    border-radius: 5px;
    background-color: #fff;

    &__header {
      font-size: 18px;
      color: #333;
      text-align: center;
      margin-bottom: 18px;
    }

    &__actions {
      margin-top: 22px;
      justify-content: flex-end;
    }
  }
</style>
