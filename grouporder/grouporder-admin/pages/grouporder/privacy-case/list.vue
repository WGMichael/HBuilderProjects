<!--
  A-16 隐私与注销事项

  OPS §15、§16 / D-035、D-056、D-072。要点：
    1. 三类事项：账号注销 / 删除请求 / 到期匿名化，5 状态跟踪。
    2. 三年保存期从活动截止或取消之日起算，不是从下单日；
       保存起点、到期日与状态由系统计算并只读展示——本页没有任何期限编辑入口，
       运营看得见、改不了。
    3. 注销前置条件（D-056）：用户仍是审核中或进行中活动的团长、或在尚未截止/取消的
       活动中仍有有效订单时不得注销，页面必须明确列出阻止注销的对象。
    4. 部分失败不得显示整体成功；到期任务失败或匿名化不完整时标记处理异常并
       限制继续使用相关个人信息，不得把失败数据恢复到正常展示或一般统计。
    5. 未确认的期限继续标记「待合规确认」，后台不自行承诺。
    6. 处理时会看到完整的账号资料与关联订单（D-072 不脱敏），每一次查看与
       每一步处理都入审计。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" placeholder="事项编号 / 对象用户" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
        <button class="uni-button" type="primary" size="mini" @click="openCreate">登记事项</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-stat-tabs type="boldLine" :all="false" :tabs="statusTabs" v-model="status" @change="onStatusChange" />
      <uni-notice-bar
        single
        text="保存起点、三年到期日与事项状态由系统计算，本页只读，没有任何期限编辑入口。每一次查看与每一步处理都记入审计。"
        background-color="#fdf6ec"
        color="#f3a73f"
      />

      <uni-table border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'case_no')">事项编号</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="typeFilter" @filter-change="onFilterChange($event, 'case_type')">事项类型</uni-th>
          <uni-th align="center">对象用户</uni-th>
          <uni-th align="center">保存期起点</uni-th>
          <uni-th align="center">三年到期日</uni-th>
          <uni-th align="center">状态</uni-th>
          <uni-th align="center">执行结果</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.case_no }}</uni-td>
          <uni-td align="center">{{ labelOf(PRIVACY_CASE_TYPE, item.case_type) }}</uni-td>
          <uni-td align="center">{{ item.target_uid }}</uni-td>
          <uni-td align="center">
            <uni-dateformat v-if="item.retention_start" :threshold="[0, 0]" :date="item.retention_start" format="yyyy-MM-dd"></uni-dateformat>
            <text v-else>—</text>
          </uni-td>
          <uni-td align="center">
            <uni-dateformat v-if="item.retention_expire" :threshold="[0, 0]" :date="item.retention_expire" format="yyyy-MM-dd"></uni-dateformat>
            <text v-else>—</text>
          </uni-td>
          <uni-td align="center">
            <uni-tag :type="statusTagType(item.status)" inverted size="small" :text="labelOf(PRIVACY_CASE_STATUS, item.status)"></uni-tag>
            <text v-if="item.restricted === 1" class="sub">已转入限制处理</text>
          </uni-td>
          <uni-td align="center">{{ item.execute_result || '—' }}</uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="primary" @click="openDetail(item)">查看</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <view class="uni-pagination-box">
        <uni-pagination show-iconn show-page-size :current="page" :page-size="pageSize" :total="total" @change="onPageChange" @pageSizeChange="onPageSizeChange" />
      </view>

      <!-- 保存期规则：全部只读 -->
      <view class="uni-stat--x p-m rules">
        <view class="section-title">保存期规则<text class="section-sub">全部只读</text></view>
        <view class="rule"><text class="rule-k">订单相关数据</text><text class="rule-v">自所属活动截止或取消之日起保存三年，含订单、明细、价格快照、收货快照、取消与作废记录</text></view>
        <view class="rule"><text class="rule-k">到期后</text><text class="rule-v">删除或匿名化姓名、电话、地址及账号关联；不可识别个人的汇总数据可长期保留</text></view>
        <view class="rule"><text class="rule-k">账号与地址簿</text><text class="rule-v">账号存续期间保存，注销后删除或匿名化</text></view>
        <view class="rule"><text class="rule-k">Excel 文件</text><text class="rule-v">临时保存，不随订单保存三年；有效期待安全方案确定</text></view>
        <view class="rule"><text class="rule-k">其他期限</text><text class="rule-v">举报、内容检测、安全与审计记录期限，备份轮换与到期删除方式——<text class="pending">待合规确认</text></text></view>
        <view class="hint">尚未确认的期限继续标记为待合规确认，后台不自行承诺。到期任务失败或匿名化不完整时，标记处理异常并限制继续使用相关个人信息，不得将失败数据恢复到正常展示或一般统计。</view>
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->

    <!-- 事项详情 -->
    <uni-popup ref="detailPopupRef" type="center" :is-mask-click="false">
      <view class="case-dialog" v-if="current">
        <view class="case-dialog__header">
          {{ current.case_no }}
          <uni-tag :type="statusTagType(current.status)" inverted size="small" :text="labelOf(PRIVACY_CASE_STATUS, current.status)"></uni-tag>
        </view>
        <view class="case-dialog__body">
          <view class="kv"><text class="kv-k">事项类型</text><view class="kv-v">{{ labelOf(PRIVACY_CASE_TYPE, current.case_type) }}</view></view>
          <view class="kv"><text class="kv-k">对象用户</text><view class="kv-v">{{ current.target_uid }}</view></view>
          <view class="kv">
            <text class="kv-k">保存期</text>
            <view class="kv-v">
              <uni-dateformat v-if="current.retention_start" :threshold="[0, 0]" :date="current.retention_start" format="yyyy-MM-dd"></uni-dateformat>
              <text v-else>—</text>
              <text> ~ </text>
              <uni-dateformat v-if="current.retention_expire" :threshold="[0, 0]" :date="current.retention_expire" format="yyyy-MM-dd"></uni-dateformat>
              <text v-else>—</text>
              <text class="kv-note">由系统计算，只读</text>
            </view>
          </view>
          <view class="kv" v-if="current.execute_result"><text class="kv-k">执行结果</text><view class="kv-v">{{ current.execute_result }}</view></view>

          <!-- 注销前置条件（D-056） -->
          <view class="case-dialog__block" v-if="(current.blockers || []).length">
            <view class="block-title">不满足注销条件，以下对象需先完成</view>
            <view class="block-text">用户仍是审核中或进行中活动的团长，或在尚未截止 / 取消的活动中仍有有效订单时不得注销。</view>
            <uni-table border stripe emptyText="无">
              <uni-tr>
                <uni-th align="center">阻止项</uni-th>
                <uni-th align="center">业务状态</uni-th>
                <uni-th align="center">需先完成</uni-th>
              </uni-tr>
              <uni-tr v-for="(b, i) in current.blockers" :key="i">
                <uni-td align="center">{{ b.object_type === 'order' ? '订单' : '活动' }} {{ b.object_name || b.object_id }}</uni-td>
                <uni-td align="center">{{ b.status_text || '—' }}</uni-td>
                <uni-td align="center">{{ b.required_action || '—' }}</uni-td>
              </uni-tr>
            </uni-table>
          </view>

          <!-- 部分失败：不得显示整体成功 -->
          <view class="case-dialog__warn" v-if="current.status === 5">
            该事项执行未全部完成，不能按整体成功处理。已限制继续使用相关个人信息并进入受控处置，失败数据不得恢复到正常展示或一般统计。
          </view>

          <view class="form-item" v-if="canUpdate">
            <text class="form-label">* 处理说明</text>
            <uni-easyinput type="textarea" v-model="form.note" :maxlength="300" placeholder="记录本次处理的动作与结果" />
          </view>
        </view>
        <view class="uni-group case-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeDetail">关闭</button>
          <template v-if="canUpdate">
            <button class="uni-button" size="mini" type="default" :disabled="!form.note.trim() || submitting" @click="update(2)">转入限制处理</button>
            <button class="uni-button" size="mini" type="primary" :disabled="!form.note.trim() || submitting" @click="update(4)">标记已完成</button>
            <button class="uni-button" size="mini" type="warn" :disabled="!form.note.trim() || submitting" @click="update(5)">标记执行失败</button>
          </template>
        </view>
      </view>
    </uni-popup>

    <!-- 登记事项 -->
    <uni-popup ref="createPopupRef" type="center" :is-mask-click="false">
      <view class="case-dialog">
        <view class="case-dialog__header">登记隐私事项</view>
        <view class="case-dialog__body">
          <view class="form-item">
            <text class="form-label">* 事项类型</text>
            <uni-data-checkbox v-model="createForm.caseType" :localdata="typeOptions" />
          </view>
          <view class="form-item">
            <text class="form-label">* 对象用户</text>
            <uni-easyinput v-model="createForm.targetUid" placeholder="平台用户标识" trim="all" />
          </view>
          <view class="form-item">
            <text class="form-label">* 登记说明</text>
            <uni-easyinput type="textarea" v-model="createForm.note" :maxlength="300" placeholder="来源与依据" />
          </view>
          <view class="block-text">保存期起点与三年到期日由系统按所属活动的截止或取消之日计算，本表单不提供期限字段。</view>
        </view>
        <view class="uni-group case-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeCreate">取消</button>
          <button class="uni-button" size="mini" type="primary" :disabled="!createSubmittable || submitting" @click="submitCreate">登记</button>
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
  import { PRIVACY_CASE_TYPE, PRIVACY_CASE_TYPE_OPTIONS, PRIVACY_CASE_STATUS, PRIVACY_CASE_STATUS_OPTIONS, labelOf } from '@/common/grouporder/dict.js';

  const keyword = ref('');
  const status = ref('');
  const current = ref(null);
  const submitting = ref(false);
  const detailPopupRef = ref(null);
  const createPopupRef = ref(null);
  const form = reactive({ note: '' });
  const createForm = reactive({ caseType: '', targetUid: '', note: '' });

  const { list, total, loading, errMessage, page, pageSize, setFilter, reload, load, onFilterChange, onSortChange, onPageChange, onPageSizeChange } = useOpsTable('privacyCaseList', {
    defaultOrderBy: { field: 'create_date', direction: 'desc' },
  });

  const statusTabs = [{ value: '', name: '全部', enable: true }].concat(PRIVACY_CASE_STATUS_OPTIONS.map((o) => ({ value: o.value, name: o.text, enable: true })));
  const typeFilter = PRIVACY_CASE_TYPE_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const typeOptions = PRIVACY_CASE_TYPE_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  const statusTagType = (value) => {
    if (value === 5) return 'error';
    if (value === 4) return 'success';
    if (value === 3) return 'warning';
    if (value === 2) return 'warning';
    return 'default';
  };

  /** 已完成的事项不再提供处理动作 */
  const canUpdate = computed(() => current.value && current.value.status !== 4);

  const createSubmittable = computed(() => !!createForm.caseType && !!createForm.targetUid.trim() && !!createForm.note.trim());

  const onSearch = () => {
    // privacyCaseList 支持 case_no / case_type / status / target_uid
    setFilter('case_no', keyword.value.trim() || undefined);
    reload();
  };

  const onStatusChange = (value) => {
    status.value = value;
    setFilter('status', value === '' ? undefined : value);
    reload();
  };

  const openDetail = (item) => {
    form.note = '';
    current.value = item;
    detailPopupRef.value.open();
  };

  const closeDetail = () => {
    detailPopupRef.value.close();
    current.value = null;
  };

  const update = async (nextStatus) => {
    if (!form.note.trim() || submitting.value) return;
    submitting.value = true;
    try {
      await callOps(
        'privacyCaseUpdate',
        {
          case_id: current.value._id,
          status: nextStatus,
          // 转入限制处理时一并置 restricted，失败数据不得恢复到正常展示
          restricted: nextStatus === 2 || nextStatus === 5 ? 1 : 0,
          execute_result: form.note.trim(),
          reason: form.note.trim(),
        },
        { loadingTitle: '提交中' }
      );
      uni.showToast({ title: '已更新', icon: 'none' });
      closeDetail();
      load();
    } catch (err) {
      // 统一错误处理在 callOps 内
    } finally {
      submitting.value = false;
    }
  };

  const openCreate = () => {
    createForm.caseType = '';
    createForm.targetUid = '';
    createForm.note = '';
    createPopupRef.value.open();
  };

  const closeCreate = () => createPopupRef.value.close();

  const submitCreate = async () => {
    if (!createSubmittable.value || submitting.value) return;
    submitting.value = true;
    try {
      await callOps(
        'privacyCaseCreate',
        {
          case_type: createForm.caseType,
          target_uid: createForm.targetUid.trim(),
          reason: createForm.note.trim(),
        },
        { loadingTitle: '登记中' }
      );
      uni.showToast({ title: '已登记', icon: 'none' });
      closeCreate();
      reload();
    } catch (err) {
      // 注销前置条件不满足时由服务端拒绝，并返回 blockers
    } finally {
      submitting.value = false;
    }
  };

  onReady(() => reload());
</script>

<style lang="scss" scoped>
  .p-m {
    padding: 15px;
  }

  .rules {
    margin-top: 15px;
  }

  .section-title {
    font-size: 15px;
    color: #333;
    margin-bottom: 12px;
  }

  .section-sub {
    font-size: 12px;
    color: #999;
    margin-left: 8px;
  }

  .rule {
    display: flex;
    font-size: 13px;
    padding: 6px 0;
  }

  .rule-k {
    width: 120px;
    color: #909399;
    flex-shrink: 0;
  }

  .rule-v {
    color: #606266;
    flex: 1;
    line-height: 1.8;
  }

  .pending {
    color: #f3a73f;
  }

  .hint {
    font-size: 12px;
    color: #999;
    line-height: 1.8;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #f5f5f5;
  }

  .sub {
    display: block;
    font-size: 12px;
    color: #999;
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

  .case-dialog {
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

    &__block {
      background-color: #fafafa;
      border-radius: 4px;
      padding: 12px 15px;
      margin-top: 15px;
    }

    &__warn {
      font-size: 13px;
      color: #e43d33;
      line-height: 1.8;
      background-color: #fef0f0;
      padding: 10px;
      border-radius: 4px;
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
</style>
