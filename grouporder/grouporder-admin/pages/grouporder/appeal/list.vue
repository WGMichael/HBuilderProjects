<!--
  A-12 账号绑定申诉

  OPS §4.7、§9 / D-031、D-055、D-029、P1-02。要点：
    1. 4 状态：待处理 / 处理中 / 处理成功 / 处理失败。
    2. 两种结局必须都能表达：
       - 单方有业务数据 → 可受理，执行解绑或重新绑定
       - 双方均已有业务数据 → 不受理，直接终止，不执行解绑、重新绑定、合并或迁移
    3. 页面没有「合并账号」「迁移数据」按钮——该能力首版明确不做（OPS §15）。
    4. 始终满足「微信身份与平台注册账号一对一」约束。
    5. 解绑与重新绑定不改变任何活动、订单、限购统计或收货信息的归属。
    6. 平台用户标识完整展示（D-072）；但微信身份一栏只有摘要——这是**存储层**的决定，
       库里就没有完整凭证可显示，与 D-072 的展示层无关，不要误当成脱敏去改成完整值。
    7. 收货电话不得用于身份核验（D-029、P1-02）。
    8. 提交时重新检查绑定状态，防止并发覆盖新建立的绑定关系；重复提交返回最新状态。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" placeholder="申诉编号 / 申诉人 / 目标账号" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-stat-tabs type="boldLine" :all="false" :tabs="statusTabs" v-model="status" @change="onStatusChange" />
      <uni-notice-bar
        single
        text="查看申诉详情写入审计。微信身份只保存摘要，库中没有完整凭证；收货电话不得用于身份核验。解绑与重新绑定不改变任何活动、订单、限购统计或收货信息的归属。"
        background-color="#fdf6ec"
        color="#f3a73f"
      />

      <uni-table border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'appeal_no')">申诉编号</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="typeFilter" @filter-change="onFilterChange($event, 'appeal_type')">申诉类型</uni-th>
          <uni-th align="center">申诉人</uni-th>
          <uni-th align="center">微信身份摘要</uni-th>
          <uni-th align="center">目标平台账号</uni-th>
          <uni-th align="center">双方业务数据</uni-th>
          <uni-th align="center">状态</uni-th>
          <uni-th align="center">处理人</uni-th>
          <uni-th align="center" filter-type="timestamp" sortable @filter-change="onFilterChange($event, 'create_date')" @sort-change="onSortChange($event, 'create_date')">提交时间</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.appeal_no }}</uni-td>
          <uni-td align="center">{{ labelOf(APPEAL_TYPE, item.appeal_type) }}</uni-td>
          <uni-td align="center">{{ item.applicant_uid || '—' }}</uni-td>
          <uni-td align="center">{{ item.wx_identity || '—' }}</uni-td>
          <uni-td align="center">{{ item.target_account_uid || '—' }}</uni-td>
          <uni-td align="center">
            <uni-tag v-if="item.both_have_data === 1" type="error" inverted size="small" text="双方均有"></uni-tag>
            <text v-else>单方</text>
          </uni-td>
          <uni-td align="center">
            <uni-tag :type="statusTagType(item.status)" inverted size="small" :text="labelOf(APPEAL_STATUS, item.status)"></uni-tag>
          </uni-td>
          <uni-td align="center">{{ item.handler_uid || '—' }}</uni-td>
          <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.create_date"></uni-dateformat></uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="primary" @click="openDetail(item)">{{ item.status === 1 || item.status === 2 ? '处理' : '查看' }}</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <view class="uni-pagination-box">
        <uni-pagination show-iconn show-page-size :current="page" :page-size="pageSize" :total="total" @change="onPageChange" @pageSizeChange="onPageSizeChange" />
      </view>
      <view class="foot-note">本页没有「合并账号」「迁移数据」入口——该能力首版明确不做。运营无权通过后台直接编辑用户密码、业务数据或身份归属。</view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->

    <!-- 申诉处理 -->
    <uni-popup ref="detailPopupRef" type="center" :is-mask-click="false">
      <view class="appeal-dialog" v-if="current">
        <view class="appeal-dialog__header">
          {{ current.appeal_no }}
          <uni-tag :type="statusTagType(current.status)" inverted size="small" :text="labelOf(APPEAL_STATUS, current.status)"></uni-tag>
        </view>
        <view class="appeal-dialog__body">
          <view class="kv"><text class="kv-k">申诉类型</text><view class="kv-v">{{ labelOf(APPEAL_TYPE, current.appeal_type) }}</view></view>
          <view class="kv"><text class="kv-k">申诉人</text><view class="kv-v">{{ current.applicant_uid }}</view></view>
          <view class="kv">
            <text class="kv-k">微信身份</text>
            <view class="kv-v">{{ current.wx_identity || '—' }}<text class="kv-note">库中只保存摘要，没有完整凭证</text></view>
          </view>
          <view class="kv"><text class="kv-k">目标账号</text><view class="kv-v">{{ current.target_account_uid || '—' }}</view></view>
          <view class="kv"><text class="kv-k">当前绑定</text><view class="kv-v">{{ bindingText }}</view></view>
          <view class="kv"><text class="kv-k">身份核验</text><view class="kv-v">{{ current.identity_verify_result || '—' }}</view></view>

          <!-- 双方均有业务数据：不受理 -->
          <view v-if="current.both_have_data === 1" class="appeal-dialog__block">
            <view class="block-title">双方均已有业务数据，首版不受理该绑定冲突申诉（D-031、D-055）</view>
            <view class="block-text">不执行解绑、重新绑定、数据合并或迁移，避免活动、订单、权限与限购归属混乱。用户继续分别使用原账号。</view>
            <view class="data-table" v-if="(current.data_summary || []).length">
              <view v-for="(row, i) in current.data_summary" :key="i" class="data-row">
                <text>{{ row.identity }}</text>
                <text>发起活动 {{ row.activity_count }}</text>
                <text>有效订单 {{ row.order_count }}</text>
              </view>
            </view>
            <view class="form-item">
              <text class="form-label">* 失败原因摘要</text>
              <uni-easyinput type="textarea" v-model="form.failReason" :maxlength="300" placeholder="向用户展示，不含内部敏感信息" />
            </view>
          </view>

          <!-- 单方有业务数据：可受理 -->
          <view v-else class="appeal-dialog__block">
            <view class="block-title">单方有业务数据，可受理</view>
            <view class="block-text">解绑与重新绑定不改变任何活动、订单、限购统计或收货信息的归属。提交时会重新检查绑定状态，防止并发覆盖新的绑定关系。</view>
            <view class="form-item">
              <text class="form-label">* 处理原因</text>
              <uni-easyinput type="textarea" v-model="form.reason" :maxlength="300" placeholder="说明核验依据与处理理由" />
            </view>
          </view>
        </view>
        <view class="uni-group appeal-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeDetail">关闭</button>
          <template v-if="canHandle">
            <template v-if="current.both_have_data === 1">
              <button class="uni-button" size="mini" type="warn" :disabled="!form.failReason.trim() || submitting" @click="submit('reject')">记录为处理失败</button>
            </template>
            <template v-else>
              <button class="uni-button" size="mini" type="warn" :disabled="!form.reason.trim() || submitting" @click="submit('reject')">拒绝申诉</button>
              <button class="uni-button" size="mini" type="primary" :disabled="!form.reason.trim() || submitting" @click="submit('resolve')">
                {{ current.appeal_type === 1 ? '执行解绑' : '执行重新绑定' }}
              </button>
            </template>
          </template>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue';
  import { onReady } from '@dcloudio/uni-app';
  import { useOpsTable } from '@/common/grouporder/ops-table.js';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import { APPEAL_TYPE, APPEAL_TYPE_OPTIONS, APPEAL_STATUS, APPEAL_STATUS_OPTIONS, labelOf } from '@/common/grouporder/dict.js';

  const keyword = ref('');
  const status = ref('');
  const current = ref(null);
  const submitting = ref(false);
  const detailPopupRef = ref(null);
  const form = reactive({ reason: '', failReason: '' });

  const { list, total, loading, errMessage, page, pageSize, setFilter, reload, load, onFilterChange, onSortChange, onPageChange, onPageSizeChange } = useOpsTable('appealList', {
    defaultOrderBy: { field: 'create_date', direction: 'desc' },
  });

  const statusTabs = [{ value: '', name: '全部', enable: true }].concat(APPEAL_STATUS_OPTIONS.map((o) => ({ value: o.value, name: o.text, enable: true })));
  const typeFilter = APPEAL_TYPE_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  const statusTagType = (value) => (value === 1 ? 'warning' : value === 2 ? 'primary' : value === 3 ? 'success' : 'error');

  const canHandle = computed(() => current.value && (current.value.status === 1 || current.value.status === 2));

  const bindingText = computed(() => {
    const binding = current.value && current.value.current_binding;
    if (!binding) return '—';
    if (typeof binding === 'string') return binding;
    return binding.description || JSON.stringify(binding);
  });

  const onSearch = () => {
    // appealList 支持 appeal_no / applicant_uid / status，没有通用 keyword
    setFilter('appeal_no', keyword.value.trim() || undefined);
    reload();
  };

  const onStatusChange = (value) => {
    status.value = value;
    setFilter('status', value === '' ? undefined : value);
    reload();
  };

  const openDetail = async (item) => {
    form.reason = '';
    form.failReason = '';
    current.value = item;
    detailPopupRef.value.open();
    try {
      // 详情单独取一次：微信身份摘要与双方业务数据统计只在详情里返回
      const data = (await callOps('appealDetail', { appeal_id: item._id })) || {};
      // 双方业务数据由云对象现算，不落库
      current.value = Object.assign({}, data.appeal || item, {
        applicant_has_data: data.applicant_has_data,
        target_has_data: data.target_has_data,
        both_have_data: data.both_have_data ? 1 : 0,
      });
    } catch (err) {
      // 保留列表行数据继续展示
    }
  };

  const closeDetail = () => {
    detailPopupRef.value.close();
    current.value = null;
  };

  const submit = async (action) => {
    if (submitting.value || !current.value) return;
    const params = {
      appeal_id: current.value._id,
      // 云对象按 approve 判断受理与否：true 执行解绑/重新绑定，false 记为处理失败
      approve: action === 'resolve',
      handle_reason: form.reason.trim(),
      target_account_uid: current.value.target_account_uid,
      identity_verify_result: current.value.identity_verify_result || '',
    };
    if (current.value.both_have_data === 1) {
      params.fail_reason = form.failReason.trim();
      params.handle_reason = params.handle_reason || form.failReason.trim();
    }
    submitting.value = true;
    try {
      await callOps('appealResolve', params, { loadingTitle: '提交中' });
      uni.showToast({ title: '已处理', icon: 'none' });
      closeDetail();
      load();
    } catch (err) {
      // 并发绑定变化由服务端拒绝，重复提交返回最新状态
    } finally {
      submitting.value = false;
    }
  };

  onReady(() => reload());
</script>

<style lang="scss" scoped>
  .foot-note {
    font-size: 12px;
    color: #999;
    line-height: 1.8;
    margin-top: 12px;
  }

  .kv {
    display: flex;
    align-items: flex-start;
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
    word-break: break-all;
  }

  .kv-note {
    display: block;
    font-size: 12px;
    color: #999;
    margin-top: 2px;
  }

  .form-item {
    margin-top: 15px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    color: #606266;
    margin-bottom: 6px;
  }

  .appeal-dialog {
    width: 540px;
    max-width: 92vw;
    max-height: 80vh;
    overflow-y: auto;
    padding: 25px 30px;
    border-radius: 5px;
    background-color: #fff;

    &__header {
      font-size: 18px;
      color: #333;
      text-align: center;
      margin-bottom: 18px;
    }

    &__block {
      background-color: #fafafa;
      border-radius: 4px;
      padding: 12px 15px;
      margin-top: 15px;
    }

    &__actions {
      margin-top: 22px;
      justify-content: flex-end;
    }
  }

  .block-title {
    font-size: 14px;
    color: #333;
    margin-bottom: 6px;
  }

  .block-text {
    font-size: 12px;
    color: #909399;
    line-height: 1.8;
  }

  .data-table {
    margin-top: 10px;
  }

  .data-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #606266;
    padding: 6px 0;
    border-bottom: 1px solid #ececec;
  }
</style>
