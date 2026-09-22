<!--
  A-08 举报详情与结论

  OPS §4.3、§5.1 / D-054。本屏的规则：
    1. 举报 5 状态：待处理 → 处理中 → 已结案 → 复核中 → 复核完成。
       运营需先「领取」才进入处理中，记录处理人与开始时间。
    2. 被举报内容快照是举报时的内容，不随当前内容变化——不能用当前内容替换历史证据。
    3. 举报提交本身不触发下架，只有本次审核结论成立后才执行处置。
    4. 结论 6 选 1 且理由必填；临时限制发布必须填起止时间。
    5. 复核创建新记录，不覆盖原结论、原日志。
    6. 多条举报指向同一活动可关联查看，但不得删除、覆盖或静默合并原始举报记录。
    7. 提交时由服务端重新校验对象状态与本人权限；若期间状态已被他人改变，
       展示最新结果而不是用旧页面覆盖新状态（并发处理由 A-02 结果页承接）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <button v-if="report.status === 1" class="uni-button" size="mini" type="primary" :disabled="submitting" @click="claim">领取</button>
        <button v-if="report.status === 3" class="uni-button" size="mini" type="default" :disabled="submitting" @click="openRecheck">发起复核</button>
        <button v-if="report.activity_id" class="uni-button" size="mini" type="default" @click="goActivity">查看活动详情</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar single text="举报提交本身不触发下架，只有本次审核结论成立后才会执行处置。本次查看已记入审计日志。" background-color="#fdf6ec" color="#f3a73f" />

      <!-- 举报概要 -->
      <view class="uni-stat--x p-m">
        <view class="card-title">
          {{ report.report_no || '—' }}
          <uni-tag :type="statusTagType(report.status)" inverted size="small" :text="labelOf(REPORT_STATUS, report.status)"></uni-tag>
          <text v-if="report.handler_uid" class="card-sub">处理人 {{ report.handler_uid }} · 领取于 <uni-dateformat :threshold="[0, 0]" :date="report.claim_time"></uni-dateformat></text>
        </view>
        <view class="kv-grid">
          <view class="kv">
            <text class="kv-k">被举报对象</text>
            <view class="kv-v">
              活动 {{ report.activity_title || report.activity_id || '—' }}
              <text v-if="report.goods_name || report.goods_id" class="kv-note">商品 {{ report.goods_name || report.goods_id }}</text>
            </view>
          </view>
          <view class="kv"><text class="kv-k">发布者</text><view class="kv-v">{{ report.publisher_uid || '—' }}</view></view>
          <view class="kv"><text class="kv-k">举报人</text><view class="kv-v">{{ report.reporter_uid || '—' }}</view></view>
          <view class="kv"><text class="kv-k">举报类型</text><view class="kv-v">{{ report.reason_type || '—' }}</view></view>
          <view class="kv"><text class="kv-k">提交时间</text><view class="kv-v"><uni-dateformat :threshold="[0, 0]" :date="report.create_date"></uni-dateformat></view></view>
        </view>
        <view class="kv"><text class="kv-k">举报描述</text><view class="kv-v desc">{{ report.reason_desc || '—' }}</view></view>
      </view>

      <!-- 被举报内容快照 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">被举报内容快照<text class="section-sub">举报时的内容，不随当前内容变化</text></view>
        <view v-if="snapshotEntries.length">
          <view v-for="entry in snapshotEntries" :key="entry.key" class="kv">
            <text class="kv-k">{{ entry.key }}</text>
            <view class="kv-v desc">{{ entry.value }}</view>
          </view>
        </view>
        <view v-else class="empty">无快照内容</view>
      </view>

      <!-- 审核结论 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">审核结论<text class="section-sub">6 选 1 · 理由必填</text></view>
        <template v-if="canConclude">
          <uni-data-checkbox v-model="form.conclusion" :localdata="conclusionOptions" mode="list" />
          <view class="conclusion-desc" v-if="currentConclusionDesc">{{ currentConclusionDesc }}</view>

          <view class="form-item" v-if="form.conclusion === 5">
            <text class="form-label">* 限制起止时间</text>
            <uni-datetime-picker type="datetimerange" v-model="form.restrictRange" />
            <text class="form-tip">临时限制发布必须有明确的起止时间（OPS §7）。</text>
          </view>

          <view class="form-item">
            <text class="form-label">* 结论理由</text>
            <uni-easyinput type="textarea" v-model="form.reason" :maxlength="500" placeholder="理由必填。该理由会向团长展示，不得包含内部敏感信息与内部备注" />
          </view>

          <view class="uni-group form-actions">
            <button class="uni-button" size="mini" type="primary" :disabled="!submittable || submitting" @click="submitConclusion">提交结论并结案</button>
          </view>
          <view class="hint">提交时服务端会重新校验对象状态与本人权限，成功后记录前后状态。若期间状态已被他人改变，页面会展示最新处理结果，不用旧页面覆盖新结果。已产生相同处置结果的重复提交返回当前结果，不重复执行处置。</view>
        </template>
        <template v-else-if="report.conclusion">
          <view class="kv"><text class="kv-k">结论</text><view class="kv-v">{{ labelOf(REPORT_CONCLUSION, report.conclusion) }}</view></view>
          <view class="kv"><text class="kv-k">结论理由</text><view class="kv-v desc">{{ report.conclusion_reason || '—' }}</view></view>
          <view class="kv"><text class="kv-k">结案时间</text><view class="kv-v"><uni-dateformat :threshold="[0, 0]" :date="report.close_time"></uni-dateformat></view></view>
        </template>
        <view v-else class="empty">该举报尚未领取，领取后方可填写结论。</view>
      </view>

      <!-- 状态流转 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">举报状态流转</view>
        <view v-for="step in statusSteps" :key="step.value" class="step" :class="{ 'step--current': report.status === step.value }">
          <text class="step-no">{{ step.value }}</text>
          <view class="step-body">
            <text class="step-name">{{ step.text }}<text v-if="report.status === step.value" class="step-current">· 当前</text></text>
            <text class="step-desc">{{ step.desc }}</text>
          </view>
        </view>
      </view>

      <!-- 关联举报 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">关联举报（{{ relatedReports.length }}）</view>
        <view v-for="item in relatedReports" :key="item._id" class="timeline">
          <view class="timeline-time">{{ item.report_no }}</view>
          <view class="timeline-body">
            <text class="timeline-main">{{ item.reason_type }} · {{ labelOf(REPORT_STATUS, item.status) }}</text>
            <text v-if="item.conclusion" class="timeline-note">结论：{{ labelOf(REPORT_CONCLUSION, item.conclusion) }}</text>
          </view>
          <button class="uni-button" size="mini" type="default" @click="openRelated(item)">查看</button>
        </view>
        <view v-if="!relatedReports.length" class="empty">无关联举报</view>
        <view class="hint">多条举报指向同一活动时可关联查看，但不得删除、覆盖或静默合并原始举报记录。</view>
      </view>

      <!-- 关联内容检测 -->
      <view class="uni-stat--x p-m" v-if="contentCheck">
        <view class="section-title">关联内容检测</view>
        <view class="kv"><text class="kv-k">检测记录</text><view class="kv-v">{{ contentCheck.trace_id || contentCheck._id }}</view></view>
        <view class="kv"><text class="kv-k">内容版本</text><view class="kv-v">v{{ contentCheck.content_version || 1 }}</view></view>
        <view class="kv">
          <text class="kv-k">检测结果</text>
          <view class="kv-v">
            <uni-tag :type="contentCheck.check_result === 3 ? 'error' : contentCheck.check_result === 2 ? 'warning' : 'success'" inverted size="small" :text="labelOf(CHECK_RESULT, contentCheck.check_result)"></uni-tag>
            <text v-if="contentCheck.hit_reason" class="kv-note">{{ contentCheck.hit_reason }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->

    <!-- 发起复核 -->
    <uni-popup ref="recheckPopupRef" type="center" :is-mask-click="false">
      <view class="recheck-dialog">
        <view class="recheck-dialog__header">发起复核</view>
        <view class="recheck-dialog__body">
          <view class="recheck-dialog__warn">复核会创建一条新的复核记录，不覆盖原结论、原理由与原操作日志。原举报的处理过程完整保留。</view>
          <view class="kv"><text class="kv-k">原结论</text><view class="kv-v">{{ labelOf(REPORT_CONCLUSION, report.conclusion) }}</view></view>
          <view class="form-item">
            <text class="form-label">* 复核申请理由</text>
            <uni-easyinput type="textarea" v-model="recheckReason" :maxlength="500" placeholder="说明为何需要复核" />
          </view>
        </view>
        <view class="uni-group recheck-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeRecheck">取消</button>
          <button class="uni-button" size="mini" type="primary" :disabled="!recheckReason.trim() || submitting" @click="submitRecheck">提交复核申请</button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue';
  import { onLoad, onReady } from '@dcloudio/uni-app';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import { REPORT_STATUS, REPORT_CONCLUSION, REPORT_CONCLUSION_OPTIONS, CHECK_RESULT, labelOf } from '@/common/grouporder/dict.js';

  const reportId = ref('');
  const report = ref({});
  const relatedReports = ref([]);
  const contentCheck = ref(null);
  const reviews = ref([]);
  const submitting = ref(false);
  const recheckPopupRef = ref(null);
  const recheckReason = ref('');
  let eventChannel = null;

  const form = reactive({ conclusion: '', reason: '', restrictRange: [] });

  const conclusionOptions = REPORT_CONCLUSION_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  const statusSteps = [
    { value: 1, text: '待处理', desc: '用户提交，系统创建唯一举报记录' },
    { value: 2, text: '处理中', desc: '运营领取，记录处理人与开始时间' },
    { value: 3, text: '已结案', desc: '形成结论并执行处置' },
    { value: 4, text: '复核中', desc: '对结论发起复核，创建新的复核记录' },
    { value: 5, text: '复核完成', desc: '原举报、原结论与原日志继续保留' },
  ];

  const statusTagType = (status) => (status === 1 ? 'warning' : status === 2 ? 'primary' : status === 4 ? 'warning' : 'default');

  /** 只有处理中与复核中可以填写结论；待处理须先领取 */
  const canConclude = computed(() => report.value.status === 2 || report.value.status === 4);

  const currentConclusionDesc = computed(() => {
    const hit = REPORT_CONCLUSION_OPTIONS.find((o) => o.value === form.conclusion);
    return hit ? hit.desc : '';
  });

  const submittable = computed(() => {
    if (!form.conclusion || !form.reason.trim()) return false;
    // 临时限制发布必须有明确起止时间
    if (form.conclusion === 5 && (!form.restrictRange || form.restrictRange.length !== 2 || !form.restrictRange[0] || !form.restrictRange[1])) return false;
    return true;
  });

  /** 内容快照是自由结构的 object，按 key 逐条展示，不做任何裁剪 */
  const snapshotEntries = computed(() => {
    const snapshot = report.value.content_snapshot;
    if (!snapshot || typeof snapshot !== 'object') return [];
    return Object.keys(snapshot).map((key) => ({
      key,
      value: typeof snapshot[key] === 'object' ? JSON.stringify(snapshot[key]) : String(snapshot[key]),
    }));
  });

  const load = async () => {
    if (!reportId.value) return;
    try {
      const data = (await callOps('reportDetail', { report_id: reportId.value })) || {};
      report.value = data.report || {};
      relatedReports.value = data.related_reports || [];
      // 云对象返回该举报关联的全部检测记录，取最近一条展示
      contentCheck.value = (data.content_checks || [])[0] || null;
      reviews.value = data.reviews || [];
    } catch (err) {
      // 统一处理在 callOps 内
    }
  };

  const notifyList = () => {
    if (eventChannel && eventChannel.emit) eventChannel.emit('refreshData');
  };

  const claim = async () => {
    if (submitting.value) return;
    submitting.value = true;
    try {
      await callOps('reportClaim', { report_id: reportId.value }, { loadingTitle: '领取中' });
      uni.showToast({ title: '已领取', icon: 'none' });
      await load();
      notifyList();
    } catch (err) {
      // 并发领取由服务端裁决，STATE_CHANGED 会跳结果页
    } finally {
      submitting.value = false;
    }
  };

  const submitConclusion = async () => {
    if (!submittable.value || submitting.value) return;
    const params = {
      report_id: reportId.value,
      conclusion: form.conclusion,
      conclusion_reason: form.reason.trim(),
    };
    if (form.conclusion === 5) {
      // 临时限制的起止时间随结论一并提交；发布者限制的落库由服务端在结论生效时处理
      params.effective_from = form.restrictRange[0];
      params.effective_to = form.restrictRange[1];
    }
    submitting.value = true;
    try {
      await callOps('reportConclude', params, { loadingTitle: '提交中' });
      uni.showToast({ title: '已结案', icon: 'none' });
      await load();
      notifyList();
    } catch (err) {
      // 同上
    } finally {
      submitting.value = false;
    }
  };

  const openRecheck = () => {
    recheckReason.value = '';
    recheckPopupRef.value.open();
  };

  const closeRecheck = () => recheckPopupRef.value.close();

  const submitRecheck = async () => {
    if (!recheckReason.value.trim() || submitting.value) return;
    submitting.value = true;
    try {
      await callOps('reportRecheck', { report_id: reportId.value, apply_reason: recheckReason.value.trim() }, { loadingTitle: '提交中' });
      uni.showToast({ title: '复核已发起', icon: 'none' });
      closeRecheck();
      await load();
      notifyList();
    } catch (err) {
      // 同上
    } finally {
      submitting.value = false;
    }
  };

  const goActivity = () => {
    uni.navigateTo({ url: '/pages/grouporder/activity/detail?id=' + report.value.activity_id });
  };

  const openRelated = (item) => {
    uni.navigateTo({ url: './detail?id=' + item._id });
  };

  onLoad((query = {}) => {
    reportId.value = query.id || '';
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    if (current && typeof current.getOpenerEventChannel === 'function') {
      eventChannel = current.getOpenerEventChannel();
    }
  });

  onReady(() => load());
</script>

<style lang="scss" scoped>
  .p-m {
    padding: 15px;
    margin-bottom: 15px;
  }

  .card-title {
    font-size: 18px;
    color: #333;
    margin-bottom: 15px;
  }

  .card-sub {
    font-size: 13px;
    color: #999;
    margin-left: 10px;
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
    width: 100px;
    color: #909399;
    flex-shrink: 0;
  }

  .kv-v {
    color: #606266;
    flex: 1;
  }

  .kv-v.desc {
    line-height: 1.8;
    white-space: pre-wrap;
  }

  .kv-note {
    display: block;
    font-size: 12px;
    color: #999;
    margin-top: 2px;
  }

  .conclusion-desc {
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

  .step {
    display: flex;
    align-items: flex-start;
    padding: 8px 0;
  }

  .step--current .step-name {
    color: #2979ff;
  }

  .step-no {
    width: 24px;
    height: 24px;
    line-height: 24px;
    text-align: center;
    border-radius: 12px;
    background-color: #f5f5f5;
    color: #909399;
    font-size: 12px;
    flex-shrink: 0;
    margin-right: 10px;
  }

  .step-body {
    flex: 1;
  }

  .step-name {
    font-size: 14px;
    color: #333;
  }

  .step-current {
    color: #2979ff;
    font-size: 12px;
    margin-left: 6px;
  }

  .step-desc {
    display: block;
    font-size: 12px;
    color: #999;
    margin-top: 2px;
  }

  .timeline {
    display: flex;
    align-items: center;
    font-size: 13px;
    padding: 8px 0;
    border-bottom: 1px solid #f5f5f5;
  }

  .timeline-time {
    width: 180px;
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

  .recheck-dialog {
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

    &__warn {
      font-size: 13px;
      color: #f3a73f;
      line-height: 1.8;
      background-color: #fdf6ec;
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 15px;
    }

    &__actions {
      margin-top: 22px;
      justify-content: flex-end;
    }
  }
</style>
