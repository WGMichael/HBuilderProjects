<!--
  A-07 活动与商品详情 + A-09 下架 / 恢复确认

  OPS §4.4、§6 / D-054、D-058、D-064。本屏的结构性规则：
    1. 业务状态（团长）与治理状态（平台）并列为两个独立字段，不得画成一个标签。
       活动可以同时是「进行中 + 已下架」——运营下架不改写团长的业务状态。
    2. 商品同样分「售卖状态」与「治理状态」两列：停售是团长的经营动作，
       治理下架是平台动作，两者分开记录。
    3. 内容快照绑定送审时的内容版本，不能用当前内容替换历史证据。
    4. 商品行操作列只有「下架」「恢复」两个治理动作——全页没有编辑商品、改价格、
       改库存、改限购、改单位、停售或恢复售卖的入口。
    5. 商品治理下架须由服务端同步反写发布者商品库为禁止复用（D-064），恢复时置回。
    6. 打开本屏即写入审计（红线⑨）。

  A-09 的确认弹窗规则：下架范围二选一、违规类型与原因必填、原因向团长展示不得含内部
  敏感信息、必须明确二次确认；恢复须有允许恢复的复核结论，且提交时由服务端重新读取
  业务状态 / 治理状态 / 发布者限制状态——团长已取消、活动已截止、下架期间到期三种情形
  一律不可恢复（OPS §6.2）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <button class="uni-button" size="mini" type="default" @click="goReports" :disabled="!relatedReports.length">查看关联举报（{{ relatedReports.length }}）</button>
        <button v-if="activity.governance_status !== 1" class="uni-button" size="mini" type="warn" :disabled="!loaded" @click="openGovernance('activity', 'off')">下架活动</button>
        <button v-else class="uni-button" size="mini" type="primary" :disabled="!loaded" @click="openGovernance('activity', 'on')">恢复活动</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar single text="本次查看已记入审计日志。本页只做治理，不提供编辑活动或商品的任何入口；下架不改变团长的业务状态，也不删除订单、商品或历史快照。" background-color="#fdf6ec" color="#f3a73f" />

      <!-- 活动概要：双状态并列 -->
      <view class="uni-stat--x p-m">
        <view class="card-title">{{ activity.title || '—' }}<text class="card-sub">{{ activity.short_code ? '（' + activity.short_code + '）' : '' }}</text></view>
        <view class="kv-grid">
          <view class="kv">
            <text class="kv-k">业务状态（团长）</text>
            <view class="kv-v">
              <uni-tag :type="activity.status === 2 ? 'success' : 'primary'" inverted size="small" :text="labelOf(ACTIVITY_STATUS, activity.status)"></uni-tag>
              <text class="kv-note">
                <uni-dateformat :threshold="[0, 0]" :date="activity.end_time"></uni-dateformat>
                · {{ labelOf(END_TYPE, activity.end_type, '') }}
              </text>
            </view>
          </view>
          <view class="kv">
            <text class="kv-k">治理状态（平台）</text>
            <view class="kv-v">
              <uni-tag :type="activity.governance_status === 1 ? 'error' : 'success'" inverted size="small" :text="labelOf(GOVERNANCE_STATUS, activity.governance_status)"></uni-tag>
              <text v-if="activity.ever_governed === 1" class="kv-note">曾被下架 · 历史标记，置 1 后不回退</text>
            </view>
          </view>
          <view class="kv">
            <text class="kv-k">发布审核</text>
            <view class="kv-v">
              <text>{{ labelOf(REVIEW_RESULT, activity.review_result) }}</text>
              <text class="kv-note">内容版本 v{{ activity.content_version || 1 }} · {{ labelOf(REVIEW_MODE, activity.review_mode, '') }}</text>
            </view>
          </view>
          <view class="kv">
            <text class="kv-k">交付方式</text>
            <view class="kv-v">
              <text>{{ labelOf(DELIVERY_TYPE, activity.delivery_type) }}</text>
              <text class="kv-note">发布后不可修改（D-060）</text>
            </view>
          </view>
        </view>
        <view class="hint">业务状态与治理状态相互独立、互不改写。活动可以同时是「进行中 + 已下架」——业务上没结束，但被平台限制了。</view>
      </view>

      <!-- 活动内容快照 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">活动内容快照<text class="section-sub">内容版本 v{{ activity.content_version || 1 }} · 送审时的版本，不随团长后续编辑变化</text></view>
        <view class="kv"><text class="kv-k">标题</text><view class="kv-v">{{ activity.title || '—' }}</view></view>
        <view class="kv"><text class="kv-k">活动说明</text><view class="kv-v desc">{{ activity.description || '—' }}</view></view>
        <view class="kv">
          <text class="kv-k">图片</text>
          <view class="kv-v">
            <image v-if="activity.cover_image && activity.cover_image.url" class="snapshot-img" :src="activity.cover_image.url" mode="aspectFill" />
            <image v-for="(img, i) in activity.images || []" :key="i" class="snapshot-img" :src="img.url" mode="aspectFill" />
            <text v-if="!activity.cover_image && !(activity.images || []).length" class="empty">无</text>
          </view>
        </view>
      </view>

      <!-- 活动内商品：售卖状态与治理状态分列 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">活动内商品（{{ goods.length }}）<text class="section-sub">售卖状态与治理状态分列 · 无编辑入口</text></view>
        <uni-table border stripe :loading="loading" emptyText="该活动下没有商品">
          <uni-tr>
            <uni-th align="center" width="50">#</uni-th>
            <uni-th align="center">商品</uni-th>
            <uni-th align="center">单价</uni-th>
            <uni-th align="center">已购买份数</uni-th>
            <uni-th align="center">售卖状态（团长）</uni-th>
            <uni-th align="center">治理状态（平台）</uni-th>
            <uni-th align="center">图片检测</uni-th>
            <uni-th align="center">治理操作</uni-th>
          </uni-tr>
          <uni-tr v-for="(item, index) in goods" :key="item._id">
            <uni-td align="center">{{ index + 1 }}</uni-td>
            <uni-td align="center">
              <view class="goods-name">{{ item.name }}</view>
              <text class="goods-sub">{{ item.unit }} · {{ item.total_stock > 0 ? '总库存 ' + item.total_stock : '库存不限' }}</text>
            </uni-td>
            <uni-td align="center">￥{{ fen2yuan(item.price) }}</uni-td>
            <uni-td align="center">{{ item.sold_qty || 0 }}</uni-td>
            <uni-td align="center">
              <uni-tag :type="item.on_sale === 1 ? 'success' : 'default'" inverted size="small" :text="labelOf(ON_SALE, item.on_sale)"></uni-tag>
            </uni-td>
            <uni-td align="center">
              <uni-tag :type="item.governance_status === 1 ? 'error' : 'success'" inverted size="small" :text="labelOf(GOVERNANCE_STATUS, item.governance_status)"></uni-tag>
            </uni-td>
            <uni-td align="center">
              <uni-tag :type="checkTagType(item.img_check_status)" inverted size="small" :text="labelOf(CHECK_STATUS, item.img_check_status)"></uni-tag>
            </uni-td>
            <uni-td align="center">
              <view class="uni-group">
                <button v-if="item.governance_status !== 1" class="uni-button" size="mini" type="warn" @click="openGovernance('goods', 'off', item)">下架</button>
                <button v-else class="uni-button" size="mini" type="primary" @click="openGovernance('goods', 'on', item)">恢复</button>
              </view>
            </uni-td>
          </uni-tr>
        </uni-table>
        <view class="hint">商品行的操作列只有「下架」「恢复」两个治理动作。停售是团长的经营动作，运营执行的是治理下架，两者分开记录。</view>
      </view>

      <!-- 内容检测记录 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">内容检测记录（{{ checks.length }}）</view>
        <view v-for="item in checks" :key="item._id" class="timeline">
          <view class="timeline-time"><uni-dateformat :threshold="[0, 0]" :date="item.check_time || item.create_date"></uni-dateformat></view>
          <view class="timeline-body">
            <text class="timeline-main">
              {{ CHECK_CONTENT_TYPE[item.content_type] || item.content_type }}检测 v{{ item.content_version || 1 }} ·
              {{ CHECK_OBJECT_TYPE[item.object_type] || item.object_type }}
            </text>
            <uni-tag :type="item.check_result === 3 ? 'error' : item.check_result === 2 ? 'warning' : 'success'" inverted size="small" :text="labelOf(CHECK_RESULT, item.check_result)"></uni-tag>
            <text v-if="item.hit_reason" class="timeline-note">命中：{{ item.hit_reason }}</text>
          </view>
        </view>
        <view v-if="!checks.length" class="empty">暂无检测记录</view>
        <view class="hint">图片异步检测不阻塞审核放行（D-058）。回调命中时系统将该商品转治理下架并通知团长，不回退业务状态、不删除已有订单。</view>
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
          <view class="timeline-time"><uni-dateformat :threshold="[0, 0]" :date="item.create_date"></uni-dateformat></view>
        </view>
        <view v-if="!relatedReports.length" class="empty">暂无关联举报</view>
        <view class="hint">多条举报指向同一活动时可关联查看，但不得删除、覆盖或静默合并原始举报记录。处置流水可在「审计 → 操作日志」按本活动标识查询。</view>
      </view>

      <!-- 发布者与本活动汇总 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">发布者与本活动汇总</view>
        <view class="kv-grid">
          <view class="kv"><text class="kv-k">发布者标识</text><view class="kv-v">{{ publisherUid || '—' }}</view></view>
          <view class="kv"><text class="kv-k">有效订单数</text><view class="kv-v">{{ stat.valid_order_count || 0 }}</view></view>
          <view class="kv"><text class="kv-k">有效总份数</text><view class="kv-v">{{ stat.valid_total_qty || 0 }}</view></view>
          <view class="kv"><text class="kv-k">预计金额</text><view class="kv-v">￥{{ fen2yuan(stat.estimated_amount) }}</view></view>
        </view>
        <view class="uni-group section-actions">
          <button class="uni-button" size="mini" type="default" :disabled="!publisherUid" @click="goPublisherRestrict">发布者处置 →</button>
        </view>
        <view class="hint">发布者当前的发布权限状态在「发布者处置」页展示，处置前会重新读取。预计金额是有效明细的价格快照乘数量之和，不代表已付款。</view>
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->

    <!-- A-09 下架 / 恢复确认 -->
    <uni-popup ref="govPopupRef" type="center" :is-mask-click="false">
      <view class="gov-dialog">
        <view class="gov-dialog__header">{{ govTitle }}</view>
        <view class="gov-dialog__body">
          <view class="kv"><text class="kv-k">处置对象</text><view class="kv-v">{{ govTargetName }}</view></view>
          <view class="kv"><text class="kv-k">当前业务状态</text><view class="kv-v">{{ govCurrentBusiness }}</view></view>
          <view class="kv"><text class="kv-k">当前治理状态</text><view class="kv-v">{{ govCurrentGovernance }}</view></view>
          <view class="gov-dialog__impact">{{ govImpactText }}</view>

          <template v-if="govAction === 'off'">
            <view class="form-item">
              <text class="form-label">* 违规类型</text>
              <uni-data-select v-model="govForm.violationType" :localdata="violationOptions" :clear="false" placeholder="请选择违规类型" />
            </view>
          </template>
          <template v-else>
            <view class="gov-dialog__warn">恢复须有允许恢复的复核结论。提交时服务端会重新读取业务状态、治理状态与发布者限制状态；团长已取消、活动已截止、下架期间到期三种情形一律不可恢复为可参与状态。</view>
          </template>

          <view class="form-item">
            <text class="form-label">* {{ govAction === 'off' ? '下架原因' : '恢复原因（复核结论）' }}</text>
            <uni-easyinput type="textarea" v-model="govForm.reason" :maxlength="500" placeholder="该原因会向团长展示，不得包含内部敏感信息与内部备注" />
          </view>

          <label class="gov-dialog__confirm" @click="govForm.confirmed = !govForm.confirmed">
            <checkbox :checked="govForm.confirmed" style="transform: scale(0.8)" />
            <text>{{ govConfirmText }}</text>
          </label>
        </view>
        <view class="uni-group gov-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeGovernance">取消</button>
          <button class="uni-button" size="mini" :type="govAction === 'off' ? 'warn' : 'primary'" :disabled="!govSubmittable || submitting" @click="submitGovernance">
            {{ govAction === 'off' ? '确认下架' : '确认恢复' }}
          </button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue';
  import { onLoad, onReady } from '@dcloudio/uni-app';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import {
    ACTIVITY_STATUS,
    GOVERNANCE_STATUS,
    DELIVERY_TYPE,
    REVIEW_MODE,
    REVIEW_RESULT,
    END_TYPE,
    CHECK_STATUS,
    CHECK_RESULT,
    CHECK_OBJECT_TYPE,
    CHECK_CONTENT_TYPE,
    ON_SALE,
    REPORT_STATUS,
    REPORT_CONCLUSION,
    VIOLATION_TYPE_OPTIONS,
    labelOf,
    fen2yuan,
  } from '@/common/grouporder/dict.js';

  const activityId = ref('');
  // 从举报详情跳入时带上事项编号，处置日志据此关联（grouporder-oplog.case_no）
  const caseNo = ref('');
  const loading = ref(false);
  const loaded = ref(false);
  const submitting = ref(false);

  const activity = ref({});
  const goods = ref([]);
  const checks = ref([]);
  const relatedReports = ref([]);
  const stat = ref({});

  const govPopupRef = ref(null);
  // 'activity' | 'goods'
  const govTarget = ref('activity');
  // 'off' | 'on'
  const govAction = ref('off');
  const govGoods = ref(null);
  const govForm = reactive({ violationType: '', reason: '', confirmed: false });

  const violationOptions = VIOLATION_TYPE_OPTIONS;
  const publisherUid = computed(() => activity.value.leader_uid || '');

  const checkTagType = (status) => (status === 3 ? 'error' : status === 2 ? 'warning' : status === 1 ? 'success' : 'default');

  const load = async () => {
    if (!activityId.value) return;
    loading.value = true;
    try {
      // 出参字段按 DATA_MODEL 的表结构命名；云对象实现时以本页读取的字段为准对齐
      const data = (await callOps('activityDetail', { activity_id: activityId.value })) || {};
      activity.value = data.activity || {};
      goods.value = data.goods || [];
      checks.value = data.content_checks || [];
      relatedReports.value = data.reports || [];
      stat.value = data.stat || {};
      loaded.value = true;
    } catch (err) {
      // 错误提示与结果页跳转已由 callOps 统一处理
      loaded.value = false;
    } finally {
      loading.value = false;
    }
  };

  const govTitle = computed(() => {
    const object = govTarget.value === 'goods' ? '商品' : '活动';
    return (govAction.value === 'off' ? '治理下架' : '恢复') + object;
  });

  const govTargetName = computed(() => {
    if (govTarget.value === 'goods') return govGoods.value ? '商品「' + govGoods.value.name + '」' : '—';
    return '整个活动「' + (activity.value.title || '') + '」';
  });

  const govCurrentBusiness = computed(() => {
    if (govTarget.value === 'goods') return govGoods.value ? labelOf(ON_SALE, govGoods.value.on_sale) : '—';
    return labelOf(ACTIVITY_STATUS, activity.value.status);
  });

  const govCurrentGovernance = computed(() => {
    const value = govTarget.value === 'goods' ? (govGoods.value || {}).governance_status : activity.value.governance_status;
    return labelOf(GOVERNANCE_STATUS, value);
  });

  const govImpactText = computed(() => {
    if (govAction.value === 'on') {
      return govTarget.value === 'goods'
        ? '恢复后该商品可重新被选择；发布者商品库中对应记录的「禁止复用」标记一并置回正常（D-064）。'
        : '恢复后该活动重新可参与，但不回滚在权限允许期间产生的合法业务操作，也不改写历史快照。';
    }
    return govTarget.value === 'goods'
      ? '下架后禁止新增选择或扩大该商品数量，活动内其他正常商品继续参与；系统同步将发布者商品库中的对应记录标记为禁止复用（D-064）。不删除任何已有订单明细。'
      : '下架后禁止新建订单或扩大已有订单数量。不改变活动的业务状态，不删除订单、商品、收货快照或历史清单记录。';
  });

  const govConfirmText = computed(() =>
    govAction.value === 'off'
      ? '我已确认处置对象与影响范围，并理解本次下架不改变团长的业务状态、不删除任何业务数据。'
      : '我已确认本次恢复基于允许恢复的复核结论。'
  );

  const govSubmittable = computed(() => {
    if (!govForm.confirmed) return false;
    if (!govForm.reason.trim()) return false;
    if (govAction.value === 'off' && !govForm.violationType) return false;
    return true;
  });

  const openGovernance = (target, action, item) => {
    govTarget.value = target;
    govAction.value = action;
    govGoods.value = item || null;
    govForm.violationType = '';
    govForm.reason = '';
    govForm.confirmed = false;
    govPopupRef.value.open();
  };

  const closeGovernance = () => {
    govPopupRef.value.close();
    govGoods.value = null;
  };

  const submitGovernance = async () => {
    if (!govSubmittable.value || submitting.value) return;
    // 活动与商品的治理规则不重合，CLOUD_API §11 已把方法拆为四个，不用一个方法靠 object_type 分流
    const methodMap = {
      'activity:off': 'activityGovernanceOff',
      'activity:on': 'activityGovernanceOn',
      'goods:off': 'goodsGovernanceOff',
      'goods:on': 'goodsGovernanceOn',
    };
    const method = methodMap[govTarget.value + ':' + govAction.value];
    // 云对象统一按 object_id 取处置对象（活动或商品），不分字段名
    const params = {
      object_id: govTarget.value === 'goods' ? (govGoods.value || {})._id : activityId.value,
      reason: govForm.reason.trim(),
    };
    if (govAction.value === 'off') {
      params.violation_type = govForm.violationType;
    }
    if (caseNo.value) {
      params.case_no = caseNo.value;
    }

    submitting.value = true;
    try {
      await callOps(method, params, { loadingTitle: '提交中' });
      uni.showToast({ title: govAction.value === 'off' ? '已下架' : '已恢复', icon: 'none' });
      closeGovernance();
      await load();
      // 通知列表页刷新双状态
      if (eventChannel && eventChannel.emit) eventChannel.emit('refreshData');
    } catch (err) {
      // STATE_CHANGED 等并发情形由 callOps 跳到 A-02 结果页，这里不再覆盖旧页面状态
    } finally {
      submitting.value = false;
    }
  };

  const goReports = () => {
    uni.navigateTo({ url: '/pages/grouporder/report/list?activity_id=' + activityId.value });
  };

  const goPublisherRestrict = () => {
    if (!publisherUid.value) return;
    uni.navigateTo({ url: '/pages/grouporder/publisher/restrict?uid=' + publisherUid.value });
  };

  // 返回列表时通知其刷新；H5 端可能没有 eventChannel，取不到就跳过
  let eventChannel = null;

  onLoad((query = {}) => {
    activityId.value = query.id || '';
    caseNo.value = query.case_no || '';
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
    font-size: 14px;
    color: #999;
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

  .section-actions {
    margin-top: 12px;
    justify-content: flex-start;
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

  .snapshot-img {
    width: 80px;
    height: 80px;
    border-radius: 4px;
    margin: 0 8px 8px 0;
  }

  .goods-name {
    color: #333;
  }

  .goods-sub {
    font-size: 12px;
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

  .timeline-main {
    margin-right: 8px;
  }

  .timeline-note {
    display: block;
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }

  .gov-dialog {
    width: 520px;
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

    &__body {
      font-size: 14px;
      color: #606266;
    }

    &__impact {
      font-size: 13px;
      color: #f3a73f;
      line-height: 1.8;
      background-color: #fdf6ec;
      padding: 10px;
      border-radius: 4px;
      margin: 10px 0 15px;
    }

    &__warn {
      font-size: 13px;
      color: #e43d33;
      line-height: 1.8;
      margin-bottom: 15px;
    }

    &__confirm {
      display: flex;
      align-items: flex-start;
      font-size: 13px;
      color: #606266;
      line-height: 1.6;
      margin-top: 12px;
    }

    &__actions {
      margin-top: 22px;
      justify-content: flex-end;
    }
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
</style>
