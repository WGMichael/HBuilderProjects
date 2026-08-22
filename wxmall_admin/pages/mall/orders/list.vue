<template>
  <view class="uni-container">
    <!-- 状态筛选 -->
    <view class="status-tabs">
      <text v-for="s in statusTabs" :key="s.value" :class="['tab', curStatus === s.value ? 'active' : '']" @click="filterStatus(s.value)">{{ s.text }}</text>
    </view>

    <unicloud-db ref="udb" v-slot:default="{data, loading, hasMore, error}" collection="tc-orders" field="_id,id,uid,status,goodsAmount,payAmount,createdAt,expressNo" :where="where" orderby="createdAt desc" :page-size="20" :getcount="true" loadtime="manual">
      <view v-if="error" class="error">{{ error.message }}</view>
      <view v-else>
        <uni-table border stripe emptyText="暂无订单">
          <uni-tr>
            <uni-th align="left">订单号</uni-th>
            <uni-th width="90" align="center">实付(元)</uni-th>
            <uni-th width="80" align="center">状态</uni-th>
            <uni-th width="170" align="center">下单时间</uni-th>
            <uni-th width="80" align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in data" :key="item._id">
            <uni-td>{{ item.id }}</uni-td>
            <uni-td align="center">¥{{ item.payAmount }}</uni-td>
            <uni-td align="center">{{ statusText(item.status) }}</uni-td>
            <uni-td align="center"><uni-dateformat :date="item.createdAt" :threshold="[0, 0]"></uni-dateformat></uni-td>
            <uni-td align="center"><button size="mini" type="primary" @click="goDetail(item._id)">详情</button></uni-td>
          </uni-tr>
        </uni-table>
        <uni-load-more :status="loading ? 'loading' : (hasMore ? 'more' : 'noMore')"></uni-load-more>
      </view>
    </unicloud-db>
  </view>
</template>

<script>
  const db = uniCloud.database()
  const STATUS = { unpaid: '待付款', unshipped: '待发货', shipped: '已发货', done: '已完成', refund: '退款' }
  export default {
    data() {
      return {
        curStatus: '',
        where: '',
        statusTabs: [
          { value: '', text: '全部' },
          { value: 'unpaid', text: '待付款' },
          { value: 'unshipped', text: '待发货' },
          { value: 'shipped', text: '已发货' },
          { value: 'done', text: '已完成' },
          { value: 'refund', text: '退款' }
        ]
      }
    },
    onReady() {
      this.$refs.udb.loadData()
    },
    onPullDownRefresh() {
      this.$refs.udb.loadData({ clear: true }, () => uni.stopPullDownRefresh())
    },
    onReachBottom() {
      this.$refs.udb.loadMore()
    },
    methods: {
      statusText(s) {
        return STATUS[s] || s
      },
      filterStatus(v) {
        this.curStatus = v
        this.where = v ? `status == '${v}'` : ''
        this.$nextTick(() => this.$refs.udb.loadData({ clear: true }))
      },
      goDetail(id) {
        uni.navigateTo({
          url: './detail?id=' + id,
          events: { refreshData: () => this.$refs.udb.loadData({ clear: true }) }
        })
      }
    }
  }
</script>

<style>
  .uni-container {
    padding: 15px;
  }

  .status-tabs {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .tab {
    padding: 6px 14px;
    margin: 0 8px 8px 0;
    font-size: 14px;
    color: #666;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .tab.active {
    color: #fff;
    background: #409eff;
  }

  .error {
    padding: 20px;
    color: #dd524d;
  }
</style>
