<!--
  运营禁区 · 测试数据清理（系统管理 → 运营禁区）

  ⚠ 这是经产品负责人 2026-10-12 明确授权的禁区能力，违反 OPS §2.2「运营不得代替团长
    经营」与 D-035 留存，仅供受训运营在测试环境重置数据。调用 grouporder-ops-co.devWipe，
    服务端已做 ops-sys-config 鉴权 + 全程审计。正式上线前应连同该能力一并移除。

  防误触：必须勾选范围 + 逐字输入 WIPE（区分大小写）才可执行；物理删除、不可恢复。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
    </view>

    <view class="uni-container">
      <uni-notice-bar
        single
        text="禁区：以下操作会物理删除对应业务数据、不可恢复，仅供测试环境重置数据使用。每次清理都会写入审计日志。"
        background-color="#fef0f0"
        color="#e43d33"
      />

      <view class="uni-stat--x p-m">
        <view class="zone-title">选择要清空的数据范围</view>
        <view v-for="g in groups" :key="g.key" class="scope" @click="toggle(g.key)">
          <view class="scope__check" :class="{ 'scope__check--on': selected.includes(g.key) }">{{ selected.includes(g.key) ? '✓' : '' }}</view>
          <view class="scope__body">
            <view class="scope__name">{{ g.name }}</view>
            <view class="scope__tables">{{ g.tables }}</view>
          </view>
        </view>

        <view class="confirm-line">
          <text class="confirm-label">逐字输入 <text class="confirm-kw">WIPE</text> 以解锁执行（区分大小写）</text>
          <uni-easyinput v-model="confirmText" placeholder="WIPE" trim="all" />
        </view>

        <view class="uni-group zone-actions">
          <button class="uni-button" type="warn" :disabled="!executable || running" @click="run">执行清空</button>
        </view>
      </view>

      <view class="uni-stat--x p-m" v-if="result">
        <view class="zone-title">上次执行结果</view>
        <view v-for="(count, name) in result.deleted" :key="name" class="result-row">
          <text>{{ name }}</text>
          <text class="result-count">{{ count }}</text>
        </view>
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>

<script setup>
  import { computed, ref } from 'vue';
  import { callOps } from '@/common/grouporder/ops-co.js';

  const CONFIRM_WORD = 'WIPE';

  const groups = [
    { key: 'activity', name: '活动 + 活动内商品', tables: 'grouporder-activity、grouporder-goods' },
    { key: 'order', name: '订单 + 订单明细', tables: 'grouporder-order、grouporder-order-item' },
    { key: 'goodslib', name: '商品库 + 分类', tables: 'grouporder-goods-lib、grouporder-goods-category' },
    { key: 'governance', name: '举报 / 内容检测 / 治理记录', tables: 'grouporder-report、grouporder-report-review、grouporder-content-check、grouporder-restriction' },
  ];

  const selected = ref([]);
  const confirmText = ref('');
  const running = ref(false);
  const result = ref(null);

  const executable = computed(() => selected.value.length > 0 && confirmText.value === CONFIRM_WORD);

  const toggle = (key) => {
    const i = selected.value.indexOf(key);
    if (i > -1) selected.value = selected.value.filter((k) => k !== key);
    else selected.value = [...selected.value, key];
  };

  const run = () => {
    if (!executable.value) return;
    const names = groups.filter((g) => selected.value.includes(g.key)).map((g) => g.name).join('、');
    uni.showModal({
      title: '最后确认',
      content: `将物理删除【${names}】的全部数据，不可恢复。确认执行？`,
      confirmColor: '#e43d33',
      success: async (r) => {
        if (!r.confirm) return;
        running.value = true;
        try {
          const data = await callOps('devWipe', { confirm: 'WIPE-ALL', scopes: selected.value }, { loadingTitle: '清理中' });
          result.value = data || null;
          confirmText.value = '';
          selected.value = [];
          uni.showToast({ title: '已清空', icon: 'none' });
        } catch (e) {
          /* 错误提示由 callOps 统一处理 */
        } finally {
          running.value = false;
        }
      },
    });
  };
</script>

<style lang="scss" scoped>
  .p-m {
    padding: 15px;
    margin-bottom: 15px;
  }

  .zone-title {
    font-size: 15px;
    color: #333;
    margin-bottom: 15px;
  }

  .scope {
    display: flex;
    align-items: flex-start;
    padding: 12px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    margin-bottom: 10px;
    cursor: pointer;
  }

  .scope__check {
    width: 20px;
    height: 20px;
    line-height: 18px;
    text-align: center;
    border: 1px solid #dcdfe6;
    border-radius: 50%;
    color: #fff;
    flex-shrink: 0;
    margin-right: 12px;
    font-size: 13px;
  }

  .scope__check--on {
    background-color: #e43d33;
    border-color: #e43d33;
  }

  .scope__name {
    font-size: 14px;
    color: #303133;
  }

  .scope__tables {
    font-size: 12px;
    color: #909399;
    margin-top: 4px;
    word-break: break-all;
  }

  .confirm-line {
    margin-top: 20px;
  }

  .confirm-label {
    display: block;
    font-size: 13px;
    color: #606266;
    margin-bottom: 8px;
  }

  .confirm-kw {
    color: #e43d33;
    font-weight: bold;
  }

  .zone-actions {
    margin-top: 20px;
    justify-content: flex-start;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    color: #606266;
    padding: 8px 0;
    border-bottom: 1px solid #f5f5f5;
  }

  .result-count {
    color: #e43d33;
  }
</style>
