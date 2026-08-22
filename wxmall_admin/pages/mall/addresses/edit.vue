<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" :rules="rules" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="地址ID">
        <text class="readonly-tip">{{ formData.id }}（业务ID不可修改）</text>
      </uni-forms-item>
      <uni-forms-item name="uid" label="所属用户" required>
        <uni-data-picker v-model="formData.uid" collection="uni-id-users" field="_id as value, username as text" placeholder="选择所属用户"></uni-data-picker>
      </uni-forms-item>
      <uni-forms-item name="name" label="收货人" required>
        <uni-easyinput v-model="formData.name" trim="both" placeholder="收货人姓名"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="phone" label="手机号" required>
        <uni-easyinput v-model="formData.phone" placeholder="联系电话"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="region" label="所在地区">
        <uni-easyinput v-model="formData.region" placeholder="省 / 市 / 区"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="detail" label="详细地址">
        <uni-easyinput type="textarea" v-model="formData.detail" placeholder="街道门牌等"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="isDefault" label="默认地址">
        <switch @change="binddata('isDefault', $event.detail.value)" :checked="formData.isDefault"></switch>
      </uni-forms-item>
      <view class="uni-button-group">
        <button type="primary" class="uni-button" @click="submit">提交</button>
      </view>
    </uni-forms>
  </view>
</template>

<script>
  const db = uniCloud.database()
  const dbCollectionName = 'tc-addresses'

  export default {
    data() {
      return {
        formData: {
          id: null,
          uid: '',
          name: '',
          phone: '',
          region: '',
          detail: '',
          isDefault: false
        },
        rules: {
          uid: { rules: [{ required: true }, { format: 'string' }] },
          name: { rules: [{ required: true }, { format: 'string' }] },
          phone: { rules: [{ required: true }, { format: 'string' }] },
          region: { rules: [{ format: 'string' }] },
          detail: { rules: [{ format: 'string' }] },
          isDefault: { rules: [{ format: 'bool' }] }
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
        this.$refs.form.validate().then(() => {
          return this.submitForm()
        }).catch(() => {}).finally(() => {
          uni.hideLoading()
        })
      },
      async submitForm() {
        try {
          // 直接用页面 formData（v-model 最新值），不依赖 uni-forms validate 的返回值
          const value = Object.assign({}, this.formData)
          // 业务 id 不允许修改
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
        db.collection(dbCollectionName).doc(id).field('id,uid,name,phone,region,detail,isDefault').get().then((res) => {
          const data = res.result.data[0]
          if (data) {
            this.formData = Object.assign({}, this.formData, data)
          }
        }).catch((err) => {
          uni.showModal({ content: err.message || '请求服务失败', showCancel: false })
        }).finally(() => {
          uni.hideLoading()
        })
      }
    }
  }
</script>

<style>
  .uni-container {
    padding: 15px;
  }

  .readonly-tip {
    font-size: 13px;
    color: #999;
  }

  .uni-button-group {
    margin-top: 50px;
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    justify-content: center;
  }

  .uni-button {
    width: 184px;
  }
</style>
