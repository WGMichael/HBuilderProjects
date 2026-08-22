<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" :rules="rules" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="分类ID">
        <text class="readonly-tip">保存时由系统自动分配（当前最大ID+1）</text>
      </uni-forms-item>
      <uni-forms-item name="name" label="分类名称" required>
        <uni-easyinput v-model="formData.name" trim="both" placeholder="如 坚果炒货"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="icon" label="图标">
        <view class="icon-uploader">
          <image v-if="iconPreview" :src="iconPreview" class="icon-preview" mode="aspectFill" @click="chooseIcon"></image>
          <view v-else class="icon-add" @click="chooseIcon">＋</view>
          <button v-if="iconPreview" size="mini" type="warn" class="icon-del" @click="removeIcon">移除</button>
        </view>
        <text class="tip">选择后仅本地预览，点「提交」时才上传</text>
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
  const dbCollectionName = 'tc-categories'
  // 云存储环境 ID（uploadFile 有时上传成功却误 reject，用它 + cloudPath 拼出 fileID）
  const ENV_ID = 'env-00jy6khv502r'

  export default {
    data() {
      return {
        formData: { name: '', icon: '', sort: 0 },
        rules: {
          name: { rules: [{ required: true }, { format: 'string' }] },
          icon: { rules: [{ format: 'string' }] },
          sort: { rules: [{ format: 'int' }] }
        },
        iconLocalPath: '', // 选中的本地图片路径（blob，仅预览用，未上传）
        iconPreview: '' // 预览地址（= 本地路径）
      }
    },
    methods: {
      // 只选图 + 本地预览，不上传
      chooseIcon() {
        uni.chooseImage({
          count: 1,
          success: (r) => {
            this.iconLocalPath = r.tempFilePaths[0]
            this.iconPreview = r.tempFilePaths[0]
          }
        })
      },
      removeIcon() {
        this.iconLocalPath = ''
        this.iconPreview = ''
      },
      // 提交：先校验 → 有图先上传 → 上传成功再写库
      submit() {
        this.$refs.form.validate().then(async (value) => {
          let iconFileID = ''
          if (this.iconLocalPath) {
            uni.showLoading({ mask: true, title: '上传图片中' })
            const cloudPath = 'types/' + Date.now() + '.png'
            const guessFileID = 'cloud://' + ENV_ID + '/' + cloudPath
            try {
              await uniCloud.uploadFile({ filePath: this.iconLocalPath, cloudPath })
            } catch (e) {
              // 支付宝云 uploadFile 常上传成功却误 reject，属预期
            }
            iconFileID = guessFileID // 始终存 cloud://
            // 用 getTempFileURL 验证文件是否真在云存储：能转出 https 即存在
            let ok = false
            try {
              const t = await uniCloud.getTempFileURL({ fileList: [iconFileID] })
              const item = t.fileList && t.fileList[0]
              ok = !!(item && item.tempFileURL && (!item.code || item.code === 'SUCCESS'))
            } catch (ve) {
              console.warn('[图标上传] 验证失败 =', ve)
            }
            uni.hideLoading()
            if (!ok) {
              uni.showModal({ content: '图片上传失败，请重试', showCancel: false })
              return
            }
          }
          await this.doSave(iconFileID)
        }).catch(() => {})
      },
      async doSave(iconFileID) {
        uni.showLoading({ mask: true })
        try {
          // 直接用页面 formData（v-model 最新值），不依赖 uni-forms validate 的返回值
          const value = Object.assign({}, this.formData)
          value.icon = iconFileID || ''
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

  .readonly-tip {
    font-size: 13px;
    color: #999;
  }

  .icon-uploader {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    align-items: center;
  }

  .icon-preview {
    width: 80px;
    height: 80px;
    border-radius: 6px;
  }

  .icon-add {
    width: 80px;
    height: 80px;
    border: 1px dashed #ccc;
    border-radius: 6px;
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    align-items: center;
    justify-content: center;
    font-size: 32px;
    color: #ccc;
  }

  .icon-del {
    margin-left: 12px;
  }

  .tip {
    display: block;
    margin-top: 6px;
    font-size: 12px;
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
