<!--
  A-10 发布者处置

  OPS §7、§12.1。四类处置：警告 / 临时限制 / 永久限制 / 解除限制。
    1. 警告只是处置记录，不改变账号状态——处置历史里「前：正常 → 后：正常」正是这条规则。
    2. 临时限制必须有明确起止时间。
    3. 发布限制只作用于发起和发布活动，不限制登录、查看本人历史或参与他人活动。
    4. 不能通过限制发布者静默改变已有活动状态——下方活动列表只展示状态，
       没有批量下架入口，每个活动是否下架都要逐个在 A-09 形成结论。
    5. 处置前必须展示当前限制状态并填写原因；相同状态的重复操作不重复生效，
       并发时以提交时最新状态为准。
    6. 当前限制状态读 grouporder-user-ext，处置流水写 grouporder-restriction，
       两者不可互相替代（DATA_MODEL §10.9）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <text class="header-uid">{{ targetUid }}</text>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar single text="发布限制只作用于发起和发布活动，不限制登录、查看本人历史或参与他人活动。对已有活动是否下架必须逐个形成内容处置结论。" background-color="#fdf6ec" color="#f3a73f" />

      <!-- 当前状态 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">当前发布权限</view>
        <view class="kv-grid">
          <view class="kv">
            <text class="kv-k">发布权限</text>
            <view class="kv-v">
              <uni-tag :type="current.publish_restriction ? 'error' : 'success'" inverted size="small" :text="labelOf(PUBLISH_RESTRICTION, current.publish_restriction, '—')"></uni-tag>
              <text v-if="current.restriction_expire" class="kv-note">
                至 <uni-dateformat :threshold="[0, 0]" :date="current.restriction_expire"></uni-dateformat>
              </text>
            </view>
          </view>
          <view class="kv">
            <text class="kv-k">账号状态</text>
            <view class="kv-v">正常<text class="kv-note">可登录、可查看历史、可参与他人活动</text></view>
          </view>
          <view class="kv">
            <text class="kv-k">产生限制的处置</text>
            <view class="kv-v">{{ current.restriction_case_no || '—' }}</view>
          </view>
          <view class="kv" v-if="relatedReportNo">
            <text class="kv-k">关联举报</text>
            <view class="kv-v">{{ relatedReportNo }}</view>
          </view>
        </view>
      </view>

      <!-- 处置表单 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">选择处置<text class="section-sub">原因必填 · 提交时重新校验</text></view>
        <uni-data-checkbox v-model="form.action" :localdata="actionOptions" mode="list" />
        <view class="action-desc" v-if="currentActionDesc">{{ currentActionDesc }}</view>

        <view class="form-item" v-if="needViolationType">
          <text class="form-label">* 违规类型</text>
          <uni-data-select v-model="form.violationType" :localdata="violationOptions" :clear="false" placeholder="请选择违规类型" />
        </view>

        <view class="form-item" v-if="form.action === 2">
          <text class="form-label">* 生效起止时间</text>
          <uni-datetime-picker type="datetimerange" v-model="form.range" />
          <text class="form-tip">临时限制必须有明确的起止时间。</text>
        </view>

        <view class="form-item">
          <text class="form-label">* 处置原因</text>
          <uni-easyinput type="textarea" v-model="form.reason" :maxlength="500" placeholder="处置原因必填；对外展示部分不得包含内部敏感信息" />
        </view>

        <view class="form-item">
          <text class="form-label">关联事项</text>
          <uni-easyinput v-model="form.relatedReportId" placeholder="关联的举报编号（选填）" />
        </view>

        <label class="confirm-line" @click="form.confirmed = !form.confirmed">
          <checkbox :checked="form.confirmed" style="transform: scale(0.8)" />
          <text>我已确认当前发布权限状态，并理解本次处置不会自动改变该发布者已有活动的业务状态。</text>
        </label>

        <view class="uni-group form-actions">
          <button class="uni-button" size="mini" type="primary" :disabled="!submittable || submitting" @click="submit">提交处置</button>
          <button class="uni-button" size="mini" type="default" @click="goBack">取消</button>
        </view>
        <view class="hint">相同状态的重复操作不重复生效；与其他运营人员并发处理时，以提交时最新状态为准并提示状态变化。</view>
      </view>

      <!-- 处置历史 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">处置历史<text class="section-sub">流水完整保留</text></view>
        <view v-for="item in history" :key="item._id" class="timeline">
          <view class="timeline-time"><uni-dateformat :threshold="[0, 0]" :date="item.create_date"></uni-dateformat></view>
          <view class="timeline-body">
            <text class="timeline-main">{{ item.operator_uid }} · {{ labelOf(RESTRICTION_ACTION, item.action_type) }}</text>
            <text class="timeline-note">
              前：{{ labelOf(PUBLISH_RESTRICTION, item.prev_status) }} → 后：{{ labelOf(PUBLISH_RESTRICTION, item.next_status) }}
              <text v-if="item.action_type === 1">（警告不改变账号状态）</text>
              · {{ item.case_no }}
              <text v-if="item.related_report_id"> · 关联 {{ item.related_report_id }}</text>
            </text>
            <text v-if="item.reason" class="timeline-note">{{ item.reason }}</text>
          </view>
        </view>
        <view v-if="!history.length" class="empty">暂无处置记录</view>
      </view>

      <!-- 该发布者的活动：只展示状态，没有批量下架入口 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">该发布者的活动（{{ activities.length }}）<text class="section-sub">只展示状态，没有批量下架入口</text></view>
        <uni-table border stripe emptyText="该发布者没有活动">
          <uni-tr>
            <uni-th align="center">活动</uni-th>
            <uni-th align="center">业务状态（团长）</uni-th>
            <uni-th align="center">治理状态（平台）</uni-th>
            <uni-th align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in activities" :key="item._id">
            <uni-td align="center">{{ item.title }}</uni-td>
            <uni-td align="center">
              <uni-tag :type="item.status === 2 ? 'success' : 'primary'" inverted size="small" :text="labelOf(ACTIVITY_STATUS, item.status)"></uni-tag>
            </uni-td>
            <uni-td align="center">
              <uni-tag :type="item.governance_status === 1 ? 'error' : 'success'" inverted size="small" :text="labelOf(GOVERNANCE_STATUS, item.governance_status)"></uni-tag>
            </uni-td>
            <uni-td align="center">
              <view class="uni-group">
                <button class="uni-button" size="mini" type="default" @click="goActivity(item._id)">查看详情</button>
              </view>
            </uni-td>
          </uni-tr>
        </uni-table>
        <view class="hint">此处只展示状态。已有活动是否下架须逐个在活动详情中形成内容处置结论，不能通过限制发布者静默改变已有活动状态。</view>
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue';
  import { onLoad, onReady } from '@dcloudio/uni-app';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import { ACTIVITY_STATUS, GOVERNANCE_STATUS, PUBLISH_RESTRICTION, RESTRICTION_ACTION, RESTRICTION_ACTION_OPTIONS, VIOLATION_TYPE_OPTIONS, labelOf } from '@/common/grouporder/dict.js';

  const targetUid = ref('');
  const relatedReportNo = ref('');
  const current = ref({});
  const history = ref([]);
  const activities = ref([]);
  const submitting = ref(false);

  const form = reactive({ action: '', violationType: '', reason: '', range: [], relatedReportId: '', confirmed: false });

  const actionOptions = RESTRICTION_ACTION_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const violationOptions = VIOLATION_TYPE_OPTIONS;

  const currentActionDesc = computed(() => {
    const hit = RESTRICTION_ACTION_OPTIONS.find((o) => o.value === form.action);
    return hit ? hit.desc : '';
  });

  /** 解除限制不需要违规类型，其余三类都要 */
  const needViolationType = computed(() => form.action && form.action !== 4);

  const submittable = computed(() => {
    if (!form.action || !form.confirmed || !form.reason.trim()) return false;
    if (needViolationType.value && !form.violationType) return false;
    if (form.action === 2 && (!form.range || form.range.length !== 2 || !form.range[0] || !form.range[1])) return false;
    return true;
  });

  const load = async () => {
    if (!targetUid.value) return;
    try {
      // ⚠ grouporder-ops-co 目前只有写方法 publisherRestrict，没有「读当前限制状态与处置流水」的方法。
      //    当前限制状态借 searchUsers 取（它返回 publish_restriction），处置流水暂缺，已上报。
      const data = (await callOps('searchUsers', { page: 1, pageSize: 1, filters: { user_id: targetUid.value } }, { silent: true })) || {};
      const row = (data.list || [])[0] || {};
      current.value = {
        publish_restriction: row.publish_restriction === undefined ? null : row.publish_restriction,
        restriction_expire: row.restriction_expire || null,
        restriction_case_no: row.restriction_case_no || '',
      };
      // 处置流水与该发布者的活动列表待云对象补充读方法后接入
      history.value = [];
      activities.value = [];
    } catch (err) {
      current.value = {};
      history.value = [];
      activities.value = [];
    }
  };

  const submit = async () => {
    if (!submittable.value || submitting.value) return;
    const params = {
      target_uid: targetUid.value,
      restriction_type: form.action,
      reason: form.reason.trim(),
    };
    if (needViolationType.value) {
      params.violation_type = form.violationType;
    }
    if (form.action === 2) {
      params.effective_from = form.range[0];
      params.effective_to = form.range[1];
    }
    if (form.relatedReportId.trim()) {
      params.related_report_id = form.relatedReportId.trim();
    }

    submitting.value = true;
    try {
      await callOps('publisherRestrict', params, { loadingTitle: '提交中' });
      uni.showToast({ title: '处置已提交', icon: 'none' });
      form.action = '';
      form.violationType = '';
      form.reason = '';
      form.range = [];
      form.relatedReportId = '';
      form.confirmed = false;
      await load();
    } catch (err) {
      // 并发与重复处置由服务端裁决
    } finally {
      submitting.value = false;
    }
  };

  const goActivity = (activityId) => {
    uni.navigateTo({ url: '/pages/grouporder/activity/detail?id=' + activityId });
  };

  const goBack = () => uni.navigateBack();

  onLoad((query = {}) => {
    targetUid.value = query.uid || '';
    relatedReportNo.value = query.report_no || '';
    if (query.report_id) {
      form.relatedReportId = query.report_id;
    }
  });

  onReady(() => load());
</script>

<style lang="scss" scoped>
  .p-m {
    padding: 15px;
    margin-bottom: 15px;
  }

  .header-uid {
    font-size: 14px;
    color: #606266;
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

  .kv-grid {
    display: flex;
    flex-wrap: wrap;
  }

  .kv {
    display: flex;
    align-items: flex-start;
    min-width: 280px;
    flex: 1;
    margin-bottom: 10px;
    font-size: 14px;
  }

  .kv-k {
    width: 110px;
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

  .action-desc {
    font-size: 12px;
    color: #999;
    margin: 8px 0 15px;
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

  .form-tip {
    display: block;
    font-size: 12px;
    color: #999;
    margin-top: 6px;
  }

  .form-actions {
    justify-content: flex-start;
    margin-top: 10px;
  }

  .confirm-line {
    display: flex;
    align-items: flex-start;
    font-size: 13px;
    color: #606266;
    line-height: 1.6;
    margin: 15px 0;
  }

  .hint {
    font-size: 12px;
    color: #999;
    line-height: 1.8;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #f5f5f5;
  }

  .empty {
    font-size: 13px;
    color: #999;
  }

  .timeline {
    display: flex;
    font-size: 13px;
    padding: 8px 0;
    border-bottom: 1px solid #f5f5f5;
  }

  .timeline-time {
    width: 150px;
    color: #909399;
    flex-shrink: 0;
  }

  .timeline-body {
    flex: 1;
    color: #606266;
  }

  .timeline-note {
    display: block;
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }
</style>
