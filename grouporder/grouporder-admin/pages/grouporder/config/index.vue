<!--
  A-18 平台配置（仅超级管理员）

  OPS §4.11 / D-057、D-059、D-065。要点：
    1. 只有超级管理员可以查看和修改，其他角色菜单中不出现「系统管理」分组，
       直接访问也会被服务端拒绝并写审计。
    2. 首版唯一配置项是活动发布审核模式（自动 / 人工），对应 grouporder-config 的 review_mode。
    3. 修改前展示当前值与影响说明，并要求二次确认。
    4. 配置修改只影响之后新提交的审核——已在审核中的活动沿用其提交时固化到
       activity.review_mode 的模式，不因配置变更改变处理路径，否则审核过程中规则会漂移。
    5. 修改记录操作人、时间与前后值，写入操作日志。

  本页没有「推荐活动」「热门活动」「首页配置」这类入口：活动不进入任何公开列表（D-059），
  平台也不参与商品推荐（D-065）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <text class="header-tip" v-if="updateInfo">最近修改：{{ updateInfo }}</text>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar single text="配置修改只影响之后新提交的审核。已在审核中的活动沿用其提交时固化的模式，不因本次变更改变处理路径。每次修改都记录操作人、时间与前后值。" background-color="#fdf6ec" color="#f3a73f" />

      <view class="uni-stat--x p-m">
        <view class="section-title">活动发布审核模式</view>
        <view class="kv">
          <text class="kv-k">当前值</text>
          <view class="kv-v">
            <uni-tag :type="currentMode === 2 ? 'primary' : 'success'" inverted size="small" :text="labelOf(REVIEW_MODE, currentMode)"></uni-tag>
          </view>
        </view>

        <view class="form-item">
          <text class="form-label">修改为</text>
          <uni-data-checkbox v-model="selectedMode" :localdata="modeOptions" mode="list" />
        </view>

        <view class="mode-desc">
          <view class="mode-desc__item">
            <text class="mode-desc__name">自动审核</text>
            <text class="mode-desc__text">内容检测通过的活动由系统直接置为进行中，不进入人工待审队列；检测命中的活动仍进入待审队列。</text>
          </view>
          <view class="mode-desc__item">
            <text class="mode-desc__name">人工审核</text>
            <text class="mode-desc__text">全部提交发布的活动进入待审队列，由内容运营逐个处理。</text>
          </view>
        </view>

        <view class="uni-group form-actions">
          <button class="uni-button" size="mini" type="primary" :disabled="!changed || submitting" @click="openConfirm">保存修改</button>
          <button class="uni-button" size="mini" type="default" :disabled="!changed" @click="reset">还原</button>
        </view>
      </view>

      <view class="uni-stat--x p-m" v-if="history.length">
        <view class="section-title">配置修改记录</view>
        <view v-for="(item, i) in history" :key="i" class="timeline">
          <view class="timeline-time"><uni-dateformat :threshold="[0, 0]" :date="item.update_date"></uni-dateformat></view>
          <view class="timeline-body">
            <text class="timeline-main">{{ item.update_uid }} · 审核模式</text>
            <text class="timeline-note">前：{{ labelOf(REVIEW_MODE, item.prev_value) }} → 后：{{ labelOf(REVIEW_MODE, item.next_value) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->

    <uni-popup ref="confirmPopupRef" type="center" :is-mask-click="false">
      <view class="confirm-dialog">
        <view class="confirm-dialog__header">确认修改审核模式</view>
        <view class="confirm-dialog__body">
          <view class="kv"><text class="kv-k">当前值</text><view class="kv-v">{{ labelOf(REVIEW_MODE, currentMode) }}</view></view>
          <view class="kv"><text class="kv-k">修改为</text><view class="kv-v">{{ labelOf(REVIEW_MODE, selectedMode) }}</view></view>
          <view class="confirm-dialog__impact">{{ impactText }}</view>
        </view>
        <view class="uni-group confirm-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeConfirm">取消</button>
          <button class="uni-button" size="mini" type="primary" :disabled="submitting" @click="submit">确认修改</button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
  import { computed, ref } from 'vue';
  import { onReady } from '@dcloudio/uni-app';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import { REVIEW_MODE, REVIEW_MODE_OPTIONS, labelOf } from '@/common/grouporder/dict.js';

  const CONFIG_KEY = 'review_mode';

  const currentMode = ref(null);
  const selectedMode = ref(null);
  const history = ref([]);
  const updateInfo = ref('');
  const configDesc = ref('');
  const submitting = ref(false);
  const confirmPopupRef = ref(null);

  const modeOptions = REVIEW_MODE_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  const changed = computed(() => selectedMode.value !== null && selectedMode.value !== currentMode.value);

  const impactText = computed(() =>
    selectedMode.value === 2
      ? '之后新提交发布的活动将全部进入人工待审队列。已在审核中的活动沿用其提交时固化的模式，不受本次修改影响。'
      : '之后新提交发布的活动中，内容检测通过的将由系统直接置为进行中；检测命中的仍进入人工待审队列。已在审核中的活动不受本次修改影响。'
  );

  const load = async () => {
    try {
      const data = (await callOps('configGet', { config_key: CONFIG_KEY })) || {};
      // config_value 是 object；首版审核模式存在它的 value 字段里
      const raw = data.config_value;
      const value = raw && typeof raw === 'object' ? raw.value : raw;
      currentMode.value = typeof value === 'number' ? value : null;
      selectedMode.value = currentMode.value;
      configDesc.value = data.description || '';
      // 修改记录在操作日志（action_type = config_changed），本页不另存一份
      history.value = [];
      if (data.update_uid) {
        updateInfo.value = data.update_uid + (data.update_date ? ' · ' + new Date(data.update_date).toLocaleString('zh-CN') : '');
      }
    } catch (err) {
      // 无权访问时 callOps 会跳 A-02 结果页
    }
  };

  const openConfirm = () => {
    if (!changed.value) return;
    confirmPopupRef.value.open();
  };

  const closeConfirm = () => confirmPopupRef.value.close();

  const reset = () => {
    selectedMode.value = currentMode.value;
  };

  const submit = async () => {
    if (!changed.value || submitting.value) return;
    submitting.value = true;
    try {
      await callOps(
        'configSet',
        {
          config_key: CONFIG_KEY,
          config_value: { value: selectedMode.value },
          description: configDesc.value || '活动发布审核模式',
          // 操作原因写入日志的 reason 字段
          reason: '将活动发布审核模式由「' + labelOf(REVIEW_MODE, currentMode.value) + '」改为「' + labelOf(REVIEW_MODE, selectedMode.value) + '」',
        },
        { loadingTitle: '保存中' }
      );
      uni.showToast({ title: '已保存', icon: 'none' });
      closeConfirm();
      await load();
    } catch (err) {
      closeConfirm();
    } finally {
      submitting.value = false;
    }
  };

  onReady(() => load());
</script>

<style lang="scss" scoped>
  .p-m {
    padding: 15px;
    margin-bottom: 15px;
  }

  .header-tip {
    font-size: 13px;
    color: #909399;
  }

  .section-title {
    font-size: 15px;
    color: #333;
    margin-bottom: 15px;
  }

  .kv {
    display: flex;
    align-items: flex-start;
    font-size: 14px;
    margin-bottom: 12px;
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
    margin-bottom: 8px;
  }

  .form-actions {
    justify-content: flex-start;
    margin-top: 10px;
  }

  .mode-desc {
    background-color: #fafafa;
    border-radius: 4px;
    padding: 12px 15px;
    margin-bottom: 15px;

    &__item {
      font-size: 13px;
      line-height: 1.8;
      margin-bottom: 6px;
    }

    &__name {
      color: #333;
      margin-right: 8px;
    }

    &__text {
      color: #909399;
    }
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

  .confirm-dialog {
    width: 460px;
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

    &__impact {
      font-size: 13px;
      color: #f3a73f;
      line-height: 1.8;
      background-color: #fdf6ec;
      padding: 10px;
      border-radius: 4px;
      margin-top: 10px;
    }

    &__actions {
      margin-top: 22px;
      justify-content: flex-end;
    }
  }
</style>
