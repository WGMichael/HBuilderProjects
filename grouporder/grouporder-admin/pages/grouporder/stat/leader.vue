<!--
  A-06 团长与活动统计（从 A-05 下钻）

  OPS §11.2、§11.3 / D-065、D-059。要点：
    1. 全部只读，权限同为 ops-stat-view。
    2. 业务状态与治理状态并列展示，「曾被下架」作为单独历史标记；
       活动被下架但业务状态仍有效时统计数据继续保留，是否计入有效汇总
       以业务状态与订单状态为准。
    3. 取消订单数与作废订单数单独展示，不并入有效指标。
    4. 商品层同样分「售卖状态（团长停售）」与「治理状态（平台下架）」两列。
    5. 任何层级都不列收货人姓名、电话、地址或备注——这是统计口径的结果
       （只统计到活动与商品粒度），不是脱敏；需要看订单明细走 A-04。
    6. 没有「设为推荐」「加权排序」入口——平台不参与商品推荐（D-065）；
       也没有「推荐活动」「首页配置」，活动不进入任何公开列表（D-059）。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <text class="header-uid">{{ leaderUid }}</text>
        <button class="uni-button" size="mini" type="primary" :disabled="exporting" @click="exportStat">导出</button>
        <button class="uni-button" size="mini" type="default" @click="goBack">返回总览</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-notice-bar
        single
        text="本页只统计到活动与商品粒度，不展示收货人姓名、电话、地址与备注——这是统计口径，不是脱敏；需要订单明细请走「全局检索」。每次导出写入审计日志。"
        background-color="#fdf6ec"
        color="#f3a73f"
      />

      <!-- 团长汇总：四项白名单指标 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">团长汇总<text class="section-sub" v-if="asOf">数据截至 {{ asOf }}</text></view>
        <view class="metric-row">
          <view class="metric">
            <text class="metric-value">{{ summary.published_count || 0 }}</text>
            <text class="metric-label">已发布活动数</text>
          </view>
          <view class="metric">
            <text class="metric-value">{{ summary.valid_order_count || 0 }}</text>
            <text class="metric-label">有效订单数</text>
          </view>
          <view class="metric">
            <text class="metric-value">{{ summary.valid_total_qty || 0 }}</text>
            <text class="metric-label">有效总份数</text>
          </view>
          <view class="metric">
            <text class="metric-value">￥{{ fen2yuan(summary.estimated_amount) }}</text>
            <text class="metric-label">预计金额</text>
          </view>
        </view>
        <view class="sub-metric-row">
          <text class="sub-metric">当前已下架活动：{{ summary.governed_count || 0 }}</text>
          <text class="sub-metric" v-if="activityStat.cancelled_order_count !== undefined">
            所选活动取消订单数：{{ activityStat.cancelled_order_count || 0 }} · 作废订单数：{{ activityStat.voided_order_count || 0 }}
          </text>
        </view>
        <view class="hint">取消订单数与作废订单数单独展示，不并入有效指标。预计金额是有效明细的价格快照乘数量之和，不代表已付款或平台担保成交。</view>
      </view>

      <!-- 活动层 -->
      <view class="uni-stat--x p-m">
        <view class="section-title">活动明细（{{ activities.length }}）</view>
        <uni-table border stripe :loading="loading" emptyText="该团长没有已发布的活动">
          <uni-tr>
            <uni-th align="center">活动</uni-th>
            <uni-th align="center">业务状态（团长）</uni-th>
            <uni-th align="center">治理状态（平台）</uni-th>
            <uni-th align="center">有效订单数</uni-th>
            <uni-th align="center">有效总份数</uni-th>
            <uni-th align="center">预计金额</uni-th>
            <uni-th align="center">历史标记</uni-th>
            <uni-th align="center">发布时间</uni-th>
            <uni-th align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in activities" :key="item._id">
            <uni-td align="center">
              <view>{{ item.title }}</view>
              <text class="sub">{{ item.short_code }}</text>
            </uni-td>
            <uni-td align="center">
              <uni-tag :type="item.status === 2 ? 'success' : 'primary'" inverted size="small" :text="labelOf(ACTIVITY_STATUS, item.status)"></uni-tag>
              <text v-if="item.status === 4" class="sub">取消前历史快照</text>
            </uni-td>
            <uni-td align="center">
              <uni-tag :type="item.governance_status === 1 ? 'error' : 'success'" inverted size="small" :text="labelOf(GOVERNANCE_STATUS, item.governance_status)"></uni-tag>
            </uni-td>
            <uni-td align="center">{{ item.valid_order_count || 0 }}</uni-td>
            <uni-td align="center">{{ item.valid_total_qty || 0 }}</uni-td>
            <uni-td align="center">￥{{ fen2yuan(item.estimated_amount) }}</uni-td>
            <uni-td align="center">
              <text v-if="item.ever_governed === 1" class="sub">曾被下架</text>
              <text v-else>—</text>
            </uni-td>
            <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.publish_date"></uni-dateformat></uni-td>
            <uni-td align="center">
              <view class="uni-group">
                <button class="uni-button" size="mini" type="default" @click="loadGoods(item)">商品汇总</button>
              </view>
            </uni-td>
          </uni-tr>
        </uni-table>
        <view class="hint">已取消活动只能查看标记清晰的取消前历史快照，不计入当前有效汇总。活动被下架但业务状态仍有效时统计数据继续保留，是否计入有效汇总以业务状态与订单状态为准。</view>
      </view>

      <!-- 商品层 -->
      <view class="uni-stat--x p-m" v-if="currentActivity">
        <view class="section-title">商品汇总<text class="section-sub">{{ currentActivity.title }}</text></view>
        <uni-table border stripe :loading="goodsLoading" emptyText="该活动下没有商品">
          <uni-tr>
            <uni-th align="center" width="50">#</uni-th>
            <uni-th align="center">商品</uni-th>
            <uni-th align="center">已购买份数</uni-th>
            <uni-th align="center">预计金额</uni-th>

          </uni-tr>
          <uni-tr v-for="(item, index) in goods" :key="item.goods_id || index">
            <uni-td align="center">{{ index + 1 }}</uni-td>
            <uni-td align="center">{{ item.goods_name || '—' }}</uni-td>
            <uni-td align="center">{{ item.sold_qty || 0 }}</uni-td>
            <uni-td align="center">￥{{ fen2yuan(item.estimated_amount) }}</uni-td>
          </uni-tr>
        </uni-table>
        <view class="hint">商品汇总只展示名称、已购买份数与预计金额，不展示任何收货资料。后台没有「设为推荐」「加权排序」入口——平台不参与商品推荐。</view>
      </view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->
  </view>
</template>

<script setup>
  import { ref } from 'vue';
  import { onLoad, onReady } from '@dcloudio/uni-app';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import { ACTIVITY_STATUS, GOVERNANCE_STATUS, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

  const leaderUid = ref('');
  const summary = ref({});
  const activities = ref([]);
  const goods = ref([]);
  const activityStat = ref({});
  const currentActivity = ref(null);
  const asOf = ref('');
  const loading = ref(false);
  const goodsLoading = ref(false);
  const exporting = ref(false);

  const load = async () => {
    if (!leaderUid.value) return;
    loading.value = true;
    try {
      // 只传 leader_uid：云对象返回该团长的活动列表（list/total 结构）
      const data = (await callOps('statActivityDrill', { leader_uid: leaderUid.value, pageSize: 100 })) || {};
      activities.value = data.list || [];
      asOf.value = data.asOf || '';
      // 团长级汇总由活动行累加，口径与云对象一致（只计有效订单）
      summary.value = activities.value.reduce(
        (acc, a) => ({
          published_count: acc.published_count + (a.publish_date ? 1 : 0),
          valid_order_count: acc.valid_order_count + (a.valid_order_count || 0),
          valid_total_qty: acc.valid_total_qty + (a.valid_total_qty || 0),
          estimated_amount: acc.estimated_amount + (a.estimated_amount || 0),
          governed_count: acc.governed_count + (a.governance_status === 1 ? 1 : 0),
        }),
        { published_count: 0, valid_order_count: 0, valid_total_qty: 0, estimated_amount: 0, governed_count: 0 }
      );
    } catch (err) {
      // 无 ops-stat-view 权限时由 callOps 跳 A-02 结果页
    } finally {
      loading.value = false;
    }
  };

  const loadGoods = async (activity) => {
    currentActivity.value = activity;
    goodsLoading.value = true;
    try {
      const data = (await callOps('statActivityDrill', { activity_id: activity._id })) || {};
      goods.value = data.goods_summary || [];
      activityStat.value = data;
    } catch (err) {
      goods.value = [];
    } finally {
      goodsLoading.value = false;
    }
  };

  const exportStat = async () => {
    if (exporting.value) return;
    exporting.value = true;
    try {
      const data = await callOps('statExport', { leader_uid: leaderUid.value }, { loadingTitle: '导出中' });
      if (data && data.url) {
        // #ifdef H5
        window.open(data.url);
        // #endif
        // #ifndef H5
        uni.showModal({ content: '导出已生成，请在 H5 端下载。', showCancel: false });
        // #endif
      } else {
        uni.showToast({ title: '导出已提交', icon: 'none' });
      }
    } catch (err) {
      // 统一错误处理在 callOps 内
    } finally {
      exporting.value = false;
    }
  };

  const goBack = () => uni.navigateBack();

  onLoad((query = {}) => {
    leaderUid.value = query.uid || '';
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
    margin-right: 10px;
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

  .metric-row {
    display: flex;
    flex-wrap: wrap;
  }

  .metric {
    min-width: 160px;
    flex: 1;
    padding: 10px 0;
  }

  .metric-value {
    display: block;
    font-size: 24px;
    color: #2979ff;
  }

  .metric-label {
    display: block;
    font-size: 13px;
    color: #909399;
    margin-top: 4px;
  }

  .sub-metric-row {
    display: flex;
    flex-wrap: wrap;
    margin-top: 10px;
  }

  .sub-metric {
    font-size: 13px;
    color: #606266;
    margin-right: 20px;
  }

  .sub {
    display: block;
    font-size: 12px;
    color: #999;
  }

  .recommend-tag {
    font-size: 12px;
    color: #f3a73f;
    margin-left: 4px;
  }

  .hint {
    font-size: 12px;
    color: #999;
    line-height: 1.8;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #f5f5f5;
  }
</style>
