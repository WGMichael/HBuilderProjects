<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" :rules="rules" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="标签ID">
        <text class="readonly-tip">{{ formData.id }}（业务ID不可修改）</text>
      </uni-forms-item>
      <uni-forms-item name="name" label="标签名称" required>
        <uni-easyinput v-model="formData.name" trim="both" placeholder="如 自有品牌 / 时令"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="sort" label="排序">
        <uni-easyinput type="number" v-model="formData.sort" placeholder="数字越小越靠前"></uni-easyinput>
      </uni-forms-item>
      <view class="uni-button-group">
        <button type="primary" class="uni-button" @click="submit">提交</button>
      </view>
    </uni-forms>
  </view>
</template>

<script>
  const db = uniCloud.database()
  const dbCollectionName = 'tc-tags'

  export default {
    data() {
      return {
        formData: { id: null, name: '', sort: 0 },
        rules: {
          name: { rules: [{ required: true }, { format: 'string' }] },
          sort: { rules: [{ format: 'int' }] }
        }
      }
    },
    onLoad(e) {
      if (e.id) {
        this.formDataId = e.id
        this.getDetail(e.id)
      }
    },
    methods: {
      submit() {
        uni.showLoading({ mask: true })
        this.$refs.form.validate().then((res) => this.submitForm(res)).catch(() => {}).finally(() => uni.hideLoading())
      },
      async submitForm(value) {
        try {
          value.sort = value.sort === '' || value.sort == null ? 0 : Number(value.sort)
          delete value.id
          await db.collection(dbCollectionName).doc(this.formDataId).update(value)
          uni.showToast({ icon: 'none', title: '修改成功' })
          this.getOpenerEventChannel().emit('refreshData')
          setTimeout(() => uni.navigateBack(), 500)
        } catch (err) {
          uni.showModal({ content: err.message || '请求服务失败', showCancel: false })
        }
      },
      getDetail(id) {
        uni.showLoading({ mask: true })
        db.collection(dbCollectionName).doc(id).field('id,name,sort').get().then((res) => {
          const data = res.result.data[0]
          if (data) this.formData = Object.assign({}, this.formData, data)
        }).catch((err) => {
          uni.showModal({ content: err.message || '请求服务失败', showCancel: false })
        }).finally(() => uni.hideLoading())
      }
    }
  }
</script>

<style>
  .uni-container { padding: 15px; }
  .readonly-tip { font-size: 13px; color: #999; }
  .uni-button-group {
    margin-top: 50px;
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    justify-content: center;
  }
  .uni-button { width: 184px; }
</style>
