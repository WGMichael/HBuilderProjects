<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" :rules="rules" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="标签ID">
        <text class="readonly-tip">保存时由系统自动分配（当前最大ID+1）</text>
      </uni-forms-item>
      <uni-forms-item name="name" label="标签名称" required>
        <uni-easyinput v-model="formData.name" trim="both" placeholder="如 自有品牌 / 时令"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="sort" label="排序">
        <uni-easyinput type="number" v-model="formData.sort" placeholder="数字越小越靠前"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="bgColor" label="背景色">
        <view class="color-row">
          <uni-easyinput v-model="formData.bgColor" placeholder="#FFF0E0（留空用默认）"></uni-easyinput>
          <view class="color-dot" :style="{ backgroundColor: formData.bgColor || '#eeeeee' }"></view>
        </view>
      </uni-forms-item>
      <uni-forms-item name="textColor" label="文字色">
        <view class="color-row">
          <uni-easyinput v-model="formData.textColor" placeholder="#E64340（留空用默认）"></uni-easyinput>
          <view class="color-dot" :style="{ backgroundColor: formData.textColor || '#333333' }"></view>
        </view>
      </uni-forms-item>
      <uni-forms-item label="效果预览">
        <text class="tag-preview" :style="{ backgroundColor: formData.bgColor || '#f0f0f0', color: formData.textColor || '#333333' }">{{ formData.name || '标签' }}</text>
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
        formData: { name: '', sort: 0, bgColor: '', textColor: '' },
        rules: {
          name: { rules: [{ required: true }, { format: 'string' }] },
          sort: { rules: [{ format: 'int' }] },
          bgColor: { rules: [{ format: 'string' }] },
          textColor: { rules: [{ format: 'string' }] }
        }
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
          const maxRes = await db.collection(dbCollectionName).orderBy('id', 'desc').field('id').limit(1).get()
          const rows = maxRes.result.data
          value.id = ((rows && rows[0] && rows[0].id) || 0) + 1
          await db.collection(dbCollectionName).add(value)
          uni.showToast({ icon: 'none', title: '新增成功' })
          this.getOpenerEventChannel().emit('refreshData')
          setTimeout(() => uni.navigateBack(), 500)
        } catch (err) {
          uni.showModal({ content: err.message || '请求服务失败', showCancel: false })
        }
      }
    }
  }
</script>

<style>
  .uni-container { padding: 15px; }
  .readonly-tip { font-size: 13px; color: #999; }
  .color-row {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    align-items: center;
  }
  .color-dot {
    width: 28px;
    height: 28px;
    margin-left: 10px;
    border-radius: 4px;
    border: 1px solid #ddd;
  }
  .tag-preview {
    /* #ifndef APP-NVUE */
    display: inline-block;
    /* #endif */
    padding: 3px 12px;
    border-radius: 4px;
    font-size: 14px;
  }
  .uni-button-group {
    margin-top: 50px;
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    justify-content: center;
  }
  .uni-button { width: 184px; }
</style>
