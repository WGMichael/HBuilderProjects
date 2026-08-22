<template>
  <view class="uni-container">
    <view class="toolbar">
      <view class="search">
        <uni-easyinput v-model="keyword" placeholder="搜索收货人/电话" @confirm="doSearch" @clear="doSearch"></uni-easyinput>
      </view>
      <button type="primary" size="mini" @click="doSearch">搜索</button>
      <button type="primary" size="mini" @click="goAdd">+ 新增地址</button>
    </view>

    <unicloud-db ref="udb" v-slot:default="{data, loading, hasMore, error}" collection="tc-addresses" field="_id,id,uid,name,phone,region,detail,isDefault" :where="where" :orderby="orderby" :page-size="50" :getcount="true" loadtime="manual">
      <view v-if="error" class="error">{{ error.message }}</view>
      <view v-else>
        <uni-table border stripe emptyText="暂无地址数据">
          <uni-tr>
            <uni-th width="50" align="center">ID</uni-th>
            <uni-th align="left">收货人</uni-th>
            <uni-th align="left">手机号</uni-th>
            <uni-th align="left">所在地区</uni-th>
            <uni-th align="left">详细地址</uni-th>
            <uni-th width="60" align="center">默认</uni-th>
            <uni-th width="130" align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in data" :key="item._id">
            <uni-td align="center">{{ item.id }}</uni-td>
            <uni-td>{{ item.name }}</uni-td>
            <uni-td>{{ item.phone }}</uni-td>
            <uni-td>{{ item.region }}</uni-td>
            <uni-td>{{ item.detail }}</uni-td>
            <uni-td align="center">{{ item.isDefault ? '✅' : '' }}</uni-td>
            <uni-td align="center">
              <view class="row-ops">
                <button size="mini" @click="goEdit(item._id)">编辑</button>
                <button size="mini" type="warn" @click="del(item._id)">删除</button>
              </view>
            </uni-td>
          </uni-tr>
        </uni-table>
        <uni-load-more :status="loading ? 'loading' : (hasMore ? 'more' : 'noMore')"></uni-load-more>
      </view>
    </unicloud-db>
  </view>
</template>

<script>
  const db = uniCloud.database()
  export default {
    data() {
      return {
        keyword: '',
        where: '',
        orderby: 'id asc'
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
      doSearch() {
        const kw = (this.keyword || '').trim()
        this.where = kw ? `/${kw}/.test(name) || /${kw}/.test(phone)` : ''
      },
      del(id) {
        this.$refs.udb.remove(id, {
          success: () => {
            uni.showToast({ icon: 'none', title: '删除成功' })
          }
        })
      },
      goAdd() {
        uni.navigateTo({
          url: './add',
          events: { refreshData: () => this.$refs.udb.loadData({ clear: true }) }
        })
      },
      goEdit(id) {
        uni.navigateTo({
          url: './edit?id=' + id,
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

  .toolbar {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    align-items: center;
    margin-bottom: 12px;
  }

  .search {
    flex: 1;
    margin-right: 8px;
  }

  .toolbar button {
    margin-left: 8px;
  }

  .row-ops {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    justify-content: center;
  }

  .row-ops button {
    margin: 0 2px;
  }

  .error {
    padding: 20px;
    color: #dd524d;
  }
</style>
