<!--
  A-14 操作日志（业务审计）

  OPS §4.10、§13 / D-064、D-072。要点：
    1. 没有编辑按钮、没有删除按钮，超级管理员也没有——「修改或删除审计日志」
       是唯一对所有角色一律关闭的能力，schema 的 update 与 delete 同样关闭。
    2. 9 个必含字段全部呈现：日志编号、操作时间、操作账号与当时生效的角色、
       动作类型、结果、对象类型与标识、关联事项、原因摘要、操作前后状态、请求标识。
    3. action_type 取 DATA_MODEL §10.8 的枚举名，页面原样展示，不做二次翻译，
       避免与枚举表产生第二个事实源。
    4. 请求标识用于识别重复请求与同一次请求内的联动
       （如商品治理下架与商品库封禁反写共用一个 request_id，D-064）。
    5. 被拒绝的操作同样入账（如未授予统计权限的 stat_query）。
    6. 与登录日志分开：system/safety/list.vue 读 uni-id-log，本页读 grouporder-oplog，
       字段与检索条件都不同，合并会两边都对不齐（ADM-13）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" placeholder="操作账号" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar
        single
        text="审计日志只读：本页没有编辑与删除入口，超级管理员同样没有。查看订单明细等操作不再需要关联事项或填写原因，但依然逐次入账。"
        background-color="#fdf6ec"
        color="#f3a73f"
      />

      <uni-table border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center">日志编号</uni-th>
          <uni-th align="center" filter-type="timestamp" sortable @filter-change="onFilterChange($event, 'operate_time')" @sort-change="onSortChange($event, 'operate_time')">操作时间</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'operator_uid')">操作账号</uni-th>
          <uni-th align="center">当时生效的角色</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'action_type')">动作类型</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="resultFilter" @filter-change="onFilterChange($event, 'result')">结果</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'object_type')">对象类型</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'object_id')">对象标识</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'case_no')">关联事项</uni-th>
          <uni-th align="center">原因摘要</uni-th>
          <uni-th align="center">请求标识</uni-th>
          <uni-th align="center">前后状态</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.log_no }}</uni-td>
          <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.operate_time"></uni-dateformat></uni-td>
          <uni-td align="center">{{ item.operator_uid || '—' }}</uni-td>
          <uni-td align="center">{{ rolesText(item) }}</uni-td>
          <uni-td align="center"><text class="action-type">{{ item.action_type }}</text></uni-td>
          <uni-td align="center">
            <uni-tag :type="item.result === 1 ? 'success' : 'error'" inverted size="small" :text="item.result === 1 ? '成功' : '拒绝'"></uni-tag>
          </uni-td>
          <uni-td align="center">{{ item.object_type || '—' }}</uni-td>
          <uni-td align="center">{{ item.object_id || '—' }}</uni-td>
          <uni-td align="center">{{ item.case_no || '—' }}</uni-td>
          <uni-td align="center">{{ item.reason || '—' }}</uni-td>
          <uni-td align="center">{{ item.request_id || '—' }}</uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="default" @click="openState(item)">展开</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <view class="uni-pagination-box">
        <uni-pagination show-iconn show-page-size :current="page" :page-size="pageSize" :total="total" @change="onPageChange" @pageSizeChange="onPageSizeChange" />
      </view>
      <view class="foot-note">
        动作类型原样展示 DATA_MODEL §10.8 的枚举名。请求标识用于识别重复请求——同一次请求内的联动操作共用一个请求标识。
        日志不记录密码等凭证，也不记录可用的下载地址。
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->

    <!-- 操作前后状态：只读展开 -->
    <uni-popup ref="statePopupRef" type="center">
      <view class="state-dialog" v-if="currentLog">
        <view class="state-dialog__header">{{ currentLog.log_no }} 操作前后状态</view>
        <view class="state-dialog__body">
          <view class="kv"><text class="kv-k">动作类型</text><view class="kv-v">{{ currentLog.action_type }}</view></view>
          <view class="kv"><text class="kv-k">权限摘要</text><view class="kv-v">{{ currentLog.operator_permissions || '—' }}</view></view>
          <view class="kv"><text class="kv-k">当时角色</text><view class="kv-v">{{ rolesText(currentLog) }}</view></view>
          <view class="kv"><text class="kv-k">请求标识</text><view class="kv-v">{{ currentLog.request_id || '—' }}</view></view>
          <view class="state-block">
            <text class="state-title">操作前状态 prev_state</text>
            <view class="state-code">{{ formatState(currentLog.prev_state) }}</view>
          </view>
          <view class="state-block">
            <text class="state-title">操作后状态 next_state</text>
            <view class="state-code">{{ formatState(currentLog.next_state) }}</view>
          </view>
          <view class="state-tip">无变化时同样明确记录，不省略字段。</view>
        </view>
        <view class="uni-group state-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeState">关闭</button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
  import { ref } from 'vue';
  import { onReady } from '@dcloudio/uni-app';
  import { useOpsTable } from '@/common/grouporder/ops-table.js';
  import { OPLOG_RESULT_OPTIONS } from '@/common/grouporder/dict.js';
  import { OPS_ROLE_NAMES } from '@/common/grouporder/ops-account.js';

  const keyword = ref('');
  const currentLog = ref(null);
  const statePopupRef = ref(null);

  const { list, total, loading, errMessage, page, pageSize, setFilter, reload, onFilterChange, onSortChange, onPageChange, onPageSizeChange } = useOpsTable('oplogList', {
    defaultOrderBy: { field: 'operate_time', direction: 'desc' },
  });

  const resultFilter = OPLOG_RESULT_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  /** operator_roles 为空数组表示来自客户端（团长的商品经营变动），见 CLOUD_API §2.4 */
  const rolesText = (item) => {
    const roles = (item && item.operator_roles) || [];
    if (!roles.length) return '系统 / 客户端';
    return roles.map((role) => OPS_ROLE_NAMES[role] || role).join('、');
  };

  const formatState = (state) => {
    if (state === undefined || state === null) return '—';
    if (typeof state === 'string') return state;
    try {
      return JSON.stringify(state, null, 2);
    } catch (err) {
      return String(state);
    }
  };

  const onSearch = () => {
    // oplogList 支持 operator_uid / action_type / object_type / object_id / case_no / request_id / result
    setFilter('operator_uid', keyword.value.trim() || undefined);
    reload();
  };

  const openState = (item) => {
    currentLog.value = item;
    statePopupRef.value.open();
  };

  const closeState = () => {
    statePopupRef.value.close();
    currentLog.value = null;
  };

  onReady(() => reload());
</script>

<style lang="scss" scoped>
  .action-type {
    font-family: Menlo, Consolas, monospace;
    font-size: 13px;
  }

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

  .state-dialog {
    width: 560px;
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

    &__actions {
      margin-top: 22px;
      justify-content: flex-end;
    }
  }

  .state-block {
    margin-top: 15px;
  }

  .state-title {
    display: block;
    font-size: 13px;
    color: #909399;
    margin-bottom: 6px;
  }

  .state-code {
    background-color: #fafafa;
    border-radius: 4px;
    padding: 10px;
    font-family: Menlo, Consolas, monospace;
    font-size: 12px;
    color: #606266;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .state-tip {
    font-size: 12px;
    color: #999;
    margin-top: 12px;
  }
</style>
