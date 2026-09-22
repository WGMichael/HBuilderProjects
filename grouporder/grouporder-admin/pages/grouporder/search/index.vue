<!--
  A-04 全局检索

  OPS §4.4、§4.5、§8 / D-060、D-072。要点：
    1. 结果不脱敏，完整明文直接展示——姓名、电话、地址一律完整显示，
       不需要关联事项，也没有二次验证（D-072）。
    2. 代价是每一次检索与每一次导出都写入审计日志（操作人、时间、检索条件、命中条数），
       日志不可修改删除。页面上要让运营知道这一点。
    3. 交付方式区分两种订单（D-060）：送货上门有地址，自提不采集完整地址，
       该列显示「——」而不是空值，避免被误读为数据缺失。
    4. 操作列只有「查看」。全页没有编辑、取消、作废、改数量或改金额的入口——
       作废异常订单是团长在小程序内的能力，运营代为操作即越界（OPS §2.2）。
    5. 筛选长在列头里，顶部只放关键字框与按钮组。
-->
<template>
  <view class="fix-top-window">
    <view class="uni-header">
      <uni-stat-breadcrumb class="uni-stat-breadcrumb-on-phone" />
      <view class="uni-group">
        <input class="uni-search" type="text" v-model="keyword" @confirm="onSearch" :placeholder="placeholder" />
        <button class="uni-button hide-on-phone" type="default" size="mini" @click="onSearch">搜索</button>
        <button class="uni-button" type="default" size="mini" @click="onReset">重置</button>
        <button class="uni-button" type="primary" size="mini" :disabled="!list.length || exporting" @click="exportResult">导出结果</button>
      </view>
    </view>

    <view class="uni-container">
      <uni-stat-tabs type="boldLine" :all="false" :tabs="objectTabs" v-model="objectType" @change="onObjectChange" />
      <uni-notice-bar
        single
        text="检索结果直接展示完整的收货人姓名、电话与地址，不做脱敏。每一次检索与每一次导出都写入审计日志（操作人、时间、检索条件、命中条数），日志不可修改删除。"
        background-color="#fdf6ec"
        color="#f3a73f"
      />

      <!-- 订单 -->
      <uni-table v-if="objectType === 'order'" border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'order_no')">订单号</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'activity_id')">所属活动</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="deliveryFilter" @filter-change="onFilterChange($event, 'delivery_type')">交付方式</uni-th>
          <uni-th align="center">收货人</uni-th>
          <uni-th align="center">电话</uni-th>
          <uni-th align="center">收货地址</uni-th>
          <uni-th align="center" sortable @sort-change="onSortChange($event, 'total_qty')">份数</uni-th>
          <uni-th align="center" sortable @sort-change="onSortChange($event, 'total_amount')">预计金额</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="orderStatusFilter" @filter-change="onFilterChange($event, 'status')">状态</uni-th>
          <uni-th align="center" filter-type="timestamp" sortable @filter-change="onFilterChange($event, 'create_date')" @sort-change="onSortChange($event, 'create_date')">提交时间</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.order_no }}</uni-td>
          <uni-td align="center">{{ item.activity_short_code || item.activity_id || '—' }}</uni-td>
          <uni-td align="center">{{ labelOf(DELIVERY_TYPE, item.delivery_type) }}</uni-td>
          <uni-td align="center">{{ item.consignee_name || '—' }}</uni-td>
          <uni-td align="center">{{ item.consignee_mobile || '—' }}</uni-td>
          <uni-td align="center">
            <text v-if="item.delivery_type === 2" class="no-address">—— 自提不采集地址</text>
            <text v-else>{{ item.consignee_address || '—' }}</text>
          </uni-td>
          <uni-td align="center">{{ item.total_qty || 0 }}</uni-td>
          <uni-td align="center">￥{{ fen2yuan(item.total_amount) }}</uni-td>
          <uni-td align="center">
            <uni-tag :type="item.status === 1 ? 'success' : 'default'" inverted size="small" :text="labelOf(ORDER_STATUS, item.status)"></uni-tag>
          </uni-td>
          <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.create_date"></uni-dateformat></uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="primary" @click="openOrder(item)">查看</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <!-- 活动 -->
      <uni-table v-else-if="objectType === 'activity'" border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'short_code')">活动短码</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'title')">活动标题</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'leader_uid')">发布者</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="activityStatusFilter" @filter-change="onFilterChange($event, 'status')">业务状态（团长）</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="governanceFilter" @filter-change="onFilterChange($event, 'governance_status')">治理状态（平台）</uni-th>
          <uni-th align="center" filter-type="timestamp" sortable @filter-change="onFilterChange($event, 'end_time')" @sort-change="onSortChange($event, 'end_time')">截止时间</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.short_code || '—' }}</uni-td>
          <uni-td align="center">{{ item.title }}</uni-td>
          <uni-td align="center">{{ item.leader_uid || '—' }}</uni-td>
          <uni-td align="center"><uni-tag :type="item.status === 2 ? 'success' : 'primary'" inverted size="small" :text="labelOf(ACTIVITY_STATUS, item.status)"></uni-tag></uni-td>
          <uni-td align="center"><uni-tag :type="item.governance_status === 1 ? 'error' : 'success'" inverted size="small" :text="labelOf(GOVERNANCE_STATUS, item.governance_status)"></uni-tag></uni-td>
          <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.end_time"></uni-dateformat></uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="primary" @click="goActivity(item._id)">查看</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <!-- 商品 -->
      <uni-table v-else-if="objectType === 'goods'" border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'keyword')">商品名称</uni-th>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'activity_id')">所属活动</uni-th>
          <uni-th align="center">单价</uni-th>
          <uni-th align="center" sortable @sort-change="onSortChange($event, 'sold_qty')">已购买份数</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="onSaleFilter" @filter-change="onFilterChange($event, 'on_sale')">售卖状态（团长）</uni-th>
          <uni-th align="center" filter-type="select" :filter-data="governanceFilter" @filter-change="onFilterChange($event, 'governance_status')">治理状态（平台）</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.name }}</uni-td>
          <uni-td align="center">{{ item.activity_short_code || item.activity_id || '—' }}</uni-td>
          <uni-td align="center">￥{{ fen2yuan(item.price) }}</uni-td>
          <uni-td align="center">{{ item.sold_qty || 0 }}</uni-td>
          <uni-td align="center"><uni-tag :type="item.on_sale === 1 ? 'success' : 'default'" inverted size="small" :text="labelOf(ON_SALE, item.on_sale)"></uni-tag></uni-td>
          <uni-td align="center"><uni-tag :type="item.governance_status === 1 ? 'error' : 'success'" inverted size="small" :text="labelOf(GOVERNANCE_STATUS, item.governance_status)"></uni-tag></uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="primary" :disabled="!item.activity_id" @click="goActivity(item.activity_id)">查看活动</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <!-- 用户 -->
      <uni-table v-else border stripe :loading="loading" :emptyText="errMessage || '没有更多数据'">
        <uni-tr>
          <uni-th align="center" filter-type="search" @filter-change="onFilterChange($event, 'user_id')">平台用户标识</uni-th>
          <uni-th align="center">昵称</uni-th>
          <uni-th align="center">发布权限</uni-th>
          <uni-th align="center">微信绑定</uni-th>
          <uni-th align="center" filter-type="timestamp" sortable @filter-change="onFilterChange($event, 'register_date')" @sort-change="onSortChange($event, 'register_date')">注册时间</uni-th>
          <uni-th align="center">操作</uni-th>
        </uni-tr>
        <uni-tr v-for="item in list" :key="item._id">
          <uni-td align="center">{{ item.user_id || item._id }}</uni-td>
          <uni-td align="center">{{ item.nickname || '—' }}</uni-td>
          <uni-td align="center">
            <uni-tag :type="item.publish_restriction ? 'error' : 'success'" inverted size="small" :text="labelOf(PUBLISH_RESTRICTION, item.publish_restriction, '正常')"></uni-tag>
          </uni-td>
          <uni-td align="center">{{ item.wechat_bound ? '已绑定' : '未绑定' }}</uni-td>
          <uni-td align="center"><uni-dateformat :threshold="[0, 0]" :date="item.register_date"></uni-dateformat></uni-td>
          <uni-td align="center">
            <view class="uni-group">
              <button class="uni-button" size="mini" type="default" @click="goPublisher(item)">发布者处置</button>
            </view>
          </uni-td>
        </uni-tr>
      </uni-table>

      <view class="uni-pagination-box">
        <uni-pagination show-iconn show-page-size :current="page" :page-size="pageSize" :total="total" @change="onPageChange" @pageSizeChange="onPageSizeChange" />
      </view>
      <view class="foot-note">操作列只有「查看」。本页及订单详情没有编辑、取消、作废、改数量或改金额的入口——作废异常订单是团长在小程序内的能力，运营代为操作即越界。</view>
    </view>

    <!-- #ifndef H5 -->
    <fix-window />
    <!-- #endif -->

    <!-- 订单详情：只读 -->
    <uni-popup ref="orderPopupRef" type="center">
      <view class="order-dialog">
        <view class="order-dialog__header">订单详情</view>
        <view class="order-dialog__body" v-if="currentOrder">
          <view class="kv"><text class="kv-k">订单号</text><view class="kv-v">{{ currentOrder.order_no }}</view></view>
          <view class="kv"><text class="kv-k">所属活动</text><view class="kv-v">{{ currentOrder.activity_short_code || currentOrder.activity_id }}</view></view>
          <view class="kv"><text class="kv-k">下单用户</text><view class="kv-v">{{ currentOrder.user_id || '—' }}</view></view>
          <view class="kv"><text class="kv-k">交付方式</text><view class="kv-v">{{ labelOf(DELIVERY_TYPE, currentOrder.delivery_type) }}</view></view>
          <view class="kv"><text class="kv-k">收货人</text><view class="kv-v">{{ currentOrder.consignee_name || '—' }}</view></view>
          <view class="kv"><text class="kv-k">电话</text><view class="kv-v">{{ currentOrder.consignee_mobile || '—' }}</view></view>
          <view class="kv">
            <text class="kv-k">收货地址</text>
            <view class="kv-v">
              <text v-if="currentOrder.delivery_type === 2" class="no-address">—— 自提不采集地址</text>
              <text v-else>{{ currentOrder.consignee_address || '—' }}</text>
            </view>
          </view>
          <view class="kv"><text class="kv-k">买家备注</text><view class="kv-v">{{ currentOrder.buyer_remark || '—' }}</view></view>
          <view class="kv"><text class="kv-k">状态</text><view class="kv-v">{{ labelOf(ORDER_STATUS, currentOrder.status) }}</view></view>
          <view class="kv"><text class="kv-k">合计</text><view class="kv-v">{{ currentOrder.total_qty || 0 }} 份 · ￥{{ fen2yuan(currentOrder.total_amount) }}</view></view>
          <view class="kv" v-if="currentOrder.cancel_reason"><text class="kv-k">取消原因</text><view class="kv-v">{{ currentOrder.cancel_reason }}</view></view>
          <view class="kv" v-if="currentOrder.void_reason"><text class="kv-k">作废原因</text><view class="kv-v">{{ currentOrder.void_reason }}</view></view>

          <view class="order-dialog__items" v-if="(currentOrder.items || []).length">
            <view class="section-title">订单明细</view>
            <view v-for="(it, i) in currentOrder.items" :key="i" class="order-item">
              <text>{{ it.goods_name }}</text>
              <text>× {{ it.qty }}</text>
              <text>￥{{ fen2yuan(it.price_snapshot !== undefined ? it.price_snapshot * it.qty : it.amount) }}</text>
            </view>
          </view>
        </view>
        <view class="uni-group order-dialog__actions">
          <button class="uni-button" size="mini" type="default" @click="closeOrder">关闭</button>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
  import { computed, ref } from 'vue';
  import { onReady } from '@dcloudio/uni-app';
  import { useOpsTable } from '@/common/grouporder/ops-table.js';
  import { callOps } from '@/common/grouporder/ops-co.js';
  import {
    ACTIVITY_STATUS,
    ACTIVITY_STATUS_OPTIONS,
    GOVERNANCE_STATUS,
    GOVERNANCE_STATUS_OPTIONS,
    DELIVERY_TYPE,
    DELIVERY_TYPE_OPTIONS,
    ORDER_STATUS,
    ORDER_STATUS_OPTIONS,
    ON_SALE,
    ON_SALE_OPTIONS,
    PUBLISH_RESTRICTION,
    PUBLISH_RESTRICTION_OPTIONS,
    labelOf,
    fen2yuan,
  } from '@/common/grouporder/dict.js';

  const keyword = ref('');
  const objectType = ref('order');
  const exporting = ref(false);
  const currentOrder = ref(null);
  const orderPopupRef = ref(null);

  const objectTabs = [
    { value: 'activity', name: '活动', enable: true },
    { value: 'goods', name: '商品', enable: true },
    { value: 'user', name: '用户', enable: true },
    { value: 'order', name: '订单', enable: true },
  ];

  const METHOD_MAP = {
    activity: 'searchActivities',
    goods: 'searchGoods',
    user: 'searchUsers',
    order: 'searchOrders',
  };

  const PLACEHOLDER_MAP = {
    activity: '活动短码 / 标题 / 发布者标识',
    goods: '商品名称 / 所属活动',
    user: '平台用户标识 / 昵称',
    order: '订单号 / 活动编号 / 平台用户标识',
  };

  const placeholder = computed(() => PLACEHOLDER_MAP[objectType.value]);

  const { list, total, loading, errMessage, page, pageSize, filters, setFilter, reload, clearFilters, onFilterChange, onSortChange, onPageChange, onPageSizeChange } = useOpsTable(
    () => METHOD_MAP[objectType.value],
    { defaultOrderBy: { field: 'create_date', direction: 'desc' } }
  );

  const activityStatusFilter = ACTIVITY_STATUS_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const governanceFilter = GOVERNANCE_STATUS_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const deliveryFilter = DELIVERY_TYPE_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const orderStatusFilter = ORDER_STATUS_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const onSaleFilter = ON_SALE_OPTIONS.map((o) => ({ value: o.value, text: o.text }));
  const restrictionFilter = PUBLISH_RESTRICTION_OPTIONS.map((o) => ({ value: o.value, text: o.text }));

  /**
   * 四个检索方法支持的筛选字段不同（见云对象实现）：
   *   searchActivities / searchGoods 有通用 keyword；
   *   searchOrders 按 order_no；searchUsers 按 user_id。
   */
  const KEYWORD_FIELD = { activity: 'keyword', goods: 'keyword', order: 'order_no', user: 'user_id' };

  const applyKeyword = () => {
    const field = KEYWORD_FIELD[objectType.value];
    setFilter(field, keyword.value.trim() || undefined);
  };

  const onSearch = () => {
    applyKeyword();
    reload();
  };

  const onReset = () => {
    keyword.value = '';
    clearFilters();
  };

  /** 切换检索对象时清掉上一类对象的列头筛选，避免条件互相污染 */
  const onObjectChange = (value) => {
    objectType.value = value;
    keyword.value = '';
    clearFilters();
  };

  const exportResult = async () => {
    if (exporting.value) return;
    exporting.value = true;
    try {
      // target 取值为 orders / activities / goods / users；筛选条件与页面当前口径一致
      const TARGET_MAP = { order: 'orders', activity: 'activities', goods: 'goods', user: 'users' };
      const data = await callOps(
        'exportSearchResult',
        {
          target: TARGET_MAP[objectType.value],
          filters: { ...filters },
        },
        { loadingTitle: '导出中' }
      );
      // 下载地址每次重新换取，页面不缓存、不复用历史地址（D-071③）
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

  const openOrder = (item) => {
    currentOrder.value = item;
    orderPopupRef.value.open();
  };

  const closeOrder = () => {
    orderPopupRef.value.close();
    currentOrder.value = null;
  };

  const goActivity = (activityId) => {
    if (!activityId) return;
    uni.navigateTo({ url: '/pages/grouporder/activity/detail?id=' + activityId });
  };

  const goPublisher = (item) => {
    uni.navigateTo({ url: '/pages/grouporder/publisher/restrict?uid=' + (item.user_id || item._id) });
  };

  onReady(() => reload());
</script>

<style lang="scss" scoped>
  .no-address {
    color: #999;
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

  .section-title {
    font-size: 14px;
    color: #333;
    margin: 15px 0 10px;
  }

  .order-dialog {
    width: 520px;
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

  .order-item {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #606266;
    padding: 6px 0;
    border-bottom: 1px solid #f5f5f5;
  }
</style>
