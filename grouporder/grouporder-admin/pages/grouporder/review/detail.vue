<!--
  A-17 活动发布审核（审核详情与结论）

  OPS §4.3、§5.2 / D-043、D-057、D-058、D-059。四条硬规则：
    1. 审核结论绑定提交时固化的内容版本——运营不得用新版本内容替换正在审核版本的结论。
    2. 运营不得修改任何业务字段：标题、说明、价格、库存、限购、截止时间全部只读展示，
       只能给出通过或不通过的结论。
    3. 不通过时原因必填且向团长展示，不得包含内部敏感信息。
    4. 图片异步检测不阻塞审核放行（D-058）：人工模式下审核通过即放行，不等待图片回调；
       放行后若回调命中，由系统转治理下架并通知团长，不回退业务状态、不删除已有订单。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <text class="header-version" v-if="activity.content_version">审核对象：内容版本 v{{ activity.content_version }}</text>
        <button class="uni-button" size="mini" type="default" @click="goBack">返回队列</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar single text="本次结论绑定提交时固化的内容版本，不会因团长后续编辑而改变。运营在本页不得修改活动或商品的任何业务字段。" background-color="#fdf6ec" color="#f3a73f" />

      <!-- 待审内容：全部只读 -->
      <view class="uni-stat--x p-m">
        <view class="card-title">
          {{ activity.title || '—' }}
          <text class="card-sub">{{ activity.short_code ? '（' + activity.short_code + '）' : '' }} · 内容版本 v{{ activity.content_version || 1 }} · {{ labelOf(REVIEW_MODE, activity.review_mode, '') }}</text>
        </view>
        <view class="kv-grid">
          <view class="kv"><text class="kv-k">团长</text><view class="kv-v">{{ activity.leader_uid || '—' }}</view></view>
          <view class="kv"><text class="kv-k">交付方式</text><view class="kv-v">{{ labelOf(DELIVERY_TYPE, activity.delivery_type) }}</view></view>
          <view class="kv"><text class="kv-k">截止时间</text><view class="kv-v"><uni-dateformat :threshold="[0, 0]" :date="activity.end_time"></uni-dateformat></view></view>
          <view class="kv"><text class="kv-k">提交时间</text><view class="kv-v"><uni-dateformat :threshold="[0, 0]" :date="activity.review_submit_date"></uni-dateformat></view></view>
          <view class="kv">
            <text class="kv-k">文本检测</text>
            <view class="kv-v"><uni-tag :type="checkTagType(activity.text_check_status)" inverted size="small" :text="labelOf(CHECK_STATUS, activity.text_check_status)"></uni-tag></view>
          </view>
          <view class="kv">
            <text class="kv-k">图片检测</text>
            <view class="kv-v">
              <uni-tag :type="checkTagType(activity.img_check_status)" inverted size="small" :text="labelOf(CHECK_STATUS, activity.img_check_status)"></uni-tag>
              <text class="kv-note">异步检测不阻塞放行（D-058）</text>
            </view>
          </view>
        </view>
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

      <!-- 活动内商品：只读 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">活动内商品（{{ goods.length }}）<text class="section-sub">全部只读 · 运营不得修改任何业务字段</text></view>
        <uni-table border stripe emptyText="该活动下没有商品">
          <uni-tr>
            <uni-th align="center" width="50">#</uni-th>
            <uni-th align="center">商品</uni-th>
            <uni-th align="center">单价</uni-th>
            <uni-th align="center">单位</uni-th>
            <uni-th align="center">总库存</uni-th>
            <uni-th align="center">每人限购</uni-th>
            <uni-th align="center">图片检测</uni-th>
          </uni-tr>
          <uni-tr v-for="(item, index) in goods" :key="item._id">
            <uni-td align="center">{{ index + 1 }}</uni-td>
            <uni-td align="center">
              <view class="goods-name">{{ item.name }}</view>
              <text v-if="item.description" class="goods-sub">{{ item.description }}</text>
            </uni-td>
            <uni-td align="center">￥{{ fen2yuan(item.price) }}</uni-td>
            <uni-td align="center">{{ item.unit || '—' }}</uni-td>
            <uni-td align="center">{{ item.total_stock > 0 ? item.total_stock : '不限' }}</uni-td>
            <uni-td align="center">{{ item.per_user_limit > 0 ? item.per_user_limit : '不限' }}</uni-td>
            <uni-td align="center">
              <uni-tag :type="checkTagType(item.img_check_status)" inverted size="small" :text="labelOf(CHECK_STATUS, item.img_check_status)"></uni-tag>
            </uni-td>
          </uni-tr>
        </uni-table>
      </view>

      <!-- 审核结论 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">审核结论<text class="section-sub">不通过时原因必填且向团长展示</text></view>
        <template v-if="canReview">
          <uni-data-checkbox v-model="form.result" :localdata="resultOptions" mode="list" />
          <view class="conclusion-desc" v-if="currentResultDesc">{{ currentResultDesc }}</view>
          <view class="form-item">
            <text class="form-label">{{ form.result === 2 ? '* 不通过原因' : '审核备注' }}</text>
            <uni-easyinput type="textarea" v-model="form.reason" :maxlength="500" :placeholder="form.result === 2 ? '选择「审核不通过」时必填，向团长展示，不得包含内部敏感信息' : '选填'" />
          </view>
          <view class="uni-group form-actions">
            <button class="uni-button" size="mini" type="primary" :disabled="!submittable || submitting" @click="submit">提交审核结论</button>
          </view>
          <view class="hint">运营在审核页面不得修改活动或商品的任何业务字段。上方标题、说明、价格、库存、限购、截止时间全部为只读展示——运营只能给出通过或不通过的结论。</view>
        </template>
        <template v-else>
          <view class="kv"><text class="kv-k">审核结果</text><view class="kv-v">{{ labelOf(REVIEW_RESULT, activity.review_result) }}</view></view>
          <view class="kv"><text class="kv-k">审核原因</text><view class="kv-v desc">{{ activity.review_reason || '—' }}</view></view>
          <view class="kv"><text class="kv-k">审核人</text><view class="kv-v">{{ activity.review_uid || '—' }}</view></view>
          <view class="kv"><text class="kv-k">审核时间</text><view class="kv-v"><uni-dateformat :threshold="[0, 0]" :date="activity.review_time"></uni-dateformat></view></view>
        </template>
      </view>

      <!-- 关联内容检测：只含当前待审版本 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">内容检测记录（{{ contentChecks.length }}）<text class="section-sub">只展示与当前待审版本关联的记录</text></view>
        <view v-for="item in contentChecks" :key="item._id" class="timeline">
          <view class="timeline-time"><uni-dateformat :threshold="[0, 0]" :date="item.check_time || item.create_date"></uni-dateformat></view>
          <view class="timeline-body">
            <text class="timeline-main">{{ item.content_type === 'image' ? '图片' : '文本' }}检测 v{{ item.content_version || 1 }}</text>
            <uni-tag :type="item.check_result === 3 ? 'error' : item.check_result === 2 ? 'warning' : 'success'" inverted size="small" :text="labelOf(CHECK_RESULT, item.check_result)"></uni-tag>
            <text v-if="item.hit_reason" class="timeline-note">命中：{{ item.hit_reason }}</text>
          </view>
        </view>
        <view v-if="!contentChecks.length" class="empty">暂无检测记录</view>
        <view class="hint">图片异步检测不阻塞审核放行：人工模式下审核通过即放行，不等待图片回调。放行后若回调命中，由系统转治理下架并通知团长，不回退业务状态、不删除已有订单。</view>
      </view>

      <!-- 审核期间的可见性 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">审核期间的活动可见性</view>
        <view class="kv"><text class="kv-k">团长</text><view class="kv-v">可在「我发起的」查看状态，可撤回至草稿，不能直接修改</view></view>
        <view class="kv"><text class="kv-k">外部用户</text><view class="kv-v">不可访问、不可分享、不可下单</view></view>
        <view class="kv"><text class="kv-k">公开列表</text><view class="kv-v">不存在。活动不进入任何公开列表，通过后仅由团长主动分享（D-059）</view></view>
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
  import { REVIEW_MODE, REVIEW_RESULT, CHECK_STATUS, CHECK_RESULT, DELIVERY_TYPE, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

  const activityId = ref('');
  const activity = ref({});
  const goods = ref([]);
  const contentChecks = ref([]);
  const submitting = ref(false);
  let eventChannel = null;

  const form = reactive({ result: '', reason: '' });

  const resultOptions = [
    { value: 1, text: '审核通过' },
    { value: 2, text: '审核不通过' },
  ];

  const RESULT_DESC = {
    1: '活动进入「进行中」，产生唯一分享入口，团长可主动分享至微信会话。活动不进入任何公开列表。',
    2: '退回草稿并向团长展示原因，团长修改后可重新提交。',
  };

  const currentResultDesc = computed(() => RESULT_DESC[form.result] || '');

  /** 只有仍处于审核中的活动可以下结论 */
  const canReview = computed(() => activity.value.status === 1);

  const submittable = computed(() => {
    if (!form.result) return false;
    if (form.result === 2 && !form.reason.trim()) return false;
    return true;
  });

  const checkTagType = (status) => (status === 3 ? 'error' : status === 2 ? 'warning' : status === 1 ? 'success' : 'default');

  const load = async () => {
    if (!activityId.value) return;
    try {
      const data = (await callOps('reviewDetail', { activity_id: activityId.value })) || {};
      activity.value = data.activity || {};
      goods.value = data.goods || [];
      // 云对象返回与当前待审版本关联的检测记录；审核历史暂未提供读方法
      contentChecks.value = data.content_checks || [];
    } catch (err) {
      // 统一处理在 callOps 内
    }
  };

  const submit = async () => {
    if (!submittable.value || submitting.value) return;
    submitting.value = true;
    try {
      await callOps(
        'reviewSubmit',
        {
          activity_id: activityId.value,
          // 结论绑定提交时固化的内容版本，服务端据此判断内容是否已变化
          content_version: activity.value.content_version,
          pass: form.result === 1,
          reason: form.reason.trim(),
        },
        { loadingTitle: '提交中' }
      );
      uni.showToast({ title: form.result === 1 ? '已通过' : '已退回', icon: 'none' });
      if (eventChannel && eventChannel.emit) eventChannel.emit('refreshData');
      await load();
    } catch (err) {
      // 内容版本已变化等情形由服务端拒绝，错误处理在 callOps 内
    } finally {
      submitting.value = false;
    }
  };

  const goBack = () => uni.navigateBack();

  onLoad((query = {}) => {
    activityId.value = query.id || '';
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

  .header-version {
    font-size: 13px;
    color: #909399;
    margin-right: 10px;
  }

  .card-title {
    font-size: 18px;
    color: #333;
    margin-bottom: 15px;
  }

  .card-sub {
    font-size: 13px;
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
    display: block;
    font-size: 12px;
    color: #999;
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
</style>
