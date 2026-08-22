<template>
  <view class="uni-container">
    <unicloud-db ref="udb" v-slot:default="{data, loading, error}" collection="tc-orders" :where="queryWhere" :getone="true" loadtime="manual">
      <view v-if="error">{{ error.message }}</view>
      <view v-else-if="loading"><uni-load-more status="loading"></uni-load-more></view>
      <view v-else-if="data" class="detail">
        <!-- 基本信息 -->
        <view class="sec">
          <view class="row"><text class="label">订单号</text><text class="val">{{ data.id }}</text></view>
          <view class="row"><text class="label">状态</text><text class="val status">{{ statusText(data.status) }}</text></view>
          <view class="row"><text class="label">下单用户</text><text class="val">{{ data.uid }}</text></view>
          <view class="row"><text class="label">下单时间</text><text class="val"><uni-dateformat :date="data.createdAt"></uni-dateformat></text></view>
        </view>

        <!-- 收货地址 -->
        <view class="sec" v-if="data.address">
          <view class="sec-title">收货地址</view>
          <view class="row"><text class="val">{{ data.address.name }}　{{ data.address.phone }}</text></view>
          <view class="row"><text class="val">{{ data.address.region }} {{ data.address.detail }}</text></view>
        </view>

        <!-- 商品清单 -->
        <view class="sec">
          <view class="sec-title">商品清单</view>
          <view class="goods" v-for="(g, i) in data.goods" :key="i">
            <text class="g-title">{{ g.title }}</text>
            <text class="g-spec">{{ g.specName }}</text>
            <text class="g-price">¥{{ g.price }} × {{ g.qty }}</text>
          </view>
        </view>

        <!-- 金额 -->
        <view class="sec">
          <view class="row"><text class="label">商品金额</text><text class="val">¥{{ data.goodsAmount }}</text></view>
          <view class="row"><text class="label">运费</text><text class="val">¥{{ data.freight }}</text></view>
          <view class="row"><text class="label">优惠</text><text class="val">-¥{{ data.discount }}</text></view>
          <view class="row"><text class="label">实付</text><text class="val pay">¥{{ data.payAmount }}</text></view>
        </view>

        <!-- 备注 -->
        <view class="sec" v-if="data.remark">
          <view class="row"><text class="label">备注</text><text class="val">{{ data.remark }}</text></view>
        </view>

        <!-- 物流 / 发货 -->
        <view class="sec">
          <view class="sec-title">物流</view>
          <block v-if="data.status === 'unshipped'">
            <view class="ship-row"><text class="label">快递公司</text><uni-easyinput v-model="expressCompany" placeholder="如 顺丰速运"></uni-easyinput></view>
            <view class="ship-row"><text class="label">快递单号</text><uni-easyinput v-model="expressNo" placeholder="请输入快递单号"></uni-easyinput></view>
            <button type="primary" class="ship-btn" @click="ship(data._id)">确认发货</button>
          </block>
          <block v-else>
            <view class="row"><text class="label">快递公司</text><text class="val">{{ data.expressCompany || '-' }}</text></view>
            <view class="row"><text class="label">快递单号</text><text class="val">{{ data.expressNo || '-' }}</text></view>
          </block>
        </view>

        <!-- 操作 -->
        <view class="btns">
          <button v-if="data.status === 'shipped'" type="primary" @click="markDone(data._id)">标记完成</button>
          <button v-if="data.status !== 'refund' && data.status !== 'done'" type="warn" @click="refund(data._id)">退款</button>
        </view>
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
        queryWhere: '',
        expressCompany: '',
        expressNo: ''
      }
    },
    onLoad(e) {
      this._id = e.id
      this.queryWhere = `_id == '${e.id}'`
    },
    onReady() {
      this.$refs.udb.loadData()
    },
    methods: {
      statusText(s) {
        return STATUS[s] || s
      },
      // 发货：填快递信息，状态转 已发货
      ship(id) {
        if (!this.expressCompany || !this.expressNo) {
          uni.showToast({ icon: 'none', title: '请填写快递公司和单号' })
          return
        }
        this.update(id, { status: 'shipped', expressCompany: this.expressCompany, expressNo: this.expressNo }, '已发货')
      },
      // 标记完成：已发货 -> 已完成
      markDone(id) {
        this.confirmUpdate(id, { status: 'done' }, '确认标记该订单为已完成？', '已完成')
      },
      // 退款
      refund(id) {
        this.confirmUpdate(id, { status: 'refund' }, '确认对该订单退款？', '已退款')
      },
      confirmUpdate(id, data, content, okMsg) {
        uni.showModal({
          content,
          success: (r) => {
            if (r.confirm) this.update(id, data, okMsg)
          }
        })
      },
      async update(id, data, okMsg) {
        uni.showLoading({ mask: true })
        try {
          await db.collection('tc-orders').doc(id).update(data)
          uni.showToast({ icon: 'none', title: okMsg })
          this.getOpenerEventChannel().emit('refreshData')
          this.$refs.udb.loadData()
        } catch (err) {
          uni.showModal({ content: err.message || '操作失败', showCancel: false })
        } finally {
          uni.hideLoading()
        }
      }
    }
  }
</script>

<style>
  .uni-container {
    padding: 15px;
  }

  .sec {
    padding: 12px;
    margin-bottom: 12px;
    background: #fff;
    border-radius: 6px;
  }

  .sec-title {
    font-size: 15px;
    font-weight: bold;
    margin-bottom: 8px;
  }

  .row {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    padding: 4px 0;
  }

  .label {
    width: 80px;
    color: #999;
    font-size: 14px;
  }

  .val {
    flex: 1;
    font-size: 14px;
    color: #333;
  }

  .val.status {
    color: #409eff;
  }

  .val.pay {
    color: #dd524d;
    font-weight: bold;
  }

  .goods {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .g-title {
    flex: 2;
    font-size: 14px;
  }

  .g-spec {
    flex: 1;
    font-size: 12px;
    color: #999;
  }

  .g-price {
    font-size: 14px;
    color: #333;
  }

  .ship-row {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    align-items: center;
    margin-bottom: 8px;
  }

  .ship-btn {
    margin-top: 8px;
  }

  .btns {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    margin-top: 10px;
  }

  .btns button {
    flex: 1;
    margin: 0 6px;
  }
</style>
