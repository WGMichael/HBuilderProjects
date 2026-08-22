<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" :rules="rules" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="轮播ID">
        <text class="readonly-tip">保存时由系统自动分配（当前最大ID+1）</text>
      </uni-forms-item>
      <uni-forms-item name="title" label="主标题" required>
        <uni-easyinput v-model="formData.title" trim="both" placeholder="如 家乡新货到"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="sub" label="副标题">
        <uni-easyinput v-model="formData.sub" placeholder="可选"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="image" label="图片">
        <view class="img-uploader">
          <image v-if="imagePreview" :src="imagePreview" class="banner-preview" mode="aspectFill" @click="chooseImage"></image>
          <view v-else class="img-add" @click="chooseImage">＋</view>
          <button v-if="imagePreview" size="mini" type="warn" class="img-del" @click="removeImage">移除</button>
        </view>
        <text class="tip">选择后仅本地预览，点「提交」时才上传；留空则前端用标题渐变块占位</text>
      </uni-forms-item>
      <uni-forms-item name="link" label="跳转链接">
        <uni-easyinput v-model="formData.link" placeholder="点击后跳转的页面路径，可空"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="sort" label="排序">
        <uni-easyinput type="number" v-model="formData.sort" placeholder="数字越小越靠前"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="enable" label="是否启用">
        <switch @change="binddata('enable', $event.detail.value)" :checked="formData.enable"></switch>
      </uni-forms-item>
      <view class="uni-button-group">
        <button type="primary" class="uni-button" @click="submit">提交</button>
      </view>
    </uni-forms>
  </view>
</template>

<script>
  const db = uniCloud.database()
  const dbCollectionName = 'tc-banners'
  const ENV_ID = 'env-00jy6khv502r'

  export default {
    data() {
      return {
        formData: { title: '', sub: '', image: '', link: '', sort: 0, enable: true },
        rules: {
          title: { rules: [{ required: true }, { format: 'string' }] },
          sub: { rules: [{ format: 'string' }] },
          link: { rules: [{ format: 'string' }] },
          sort: { rules: [{ format: 'int' }] },
          enable: { rules: [{ format: 'bool' }] }
        },
        imageLocalPath: '',
        imagePreview: ''
      }
    },
    methods: {
      chooseImage() {
        uni.chooseImage({
          count: 1,
          success: (r) => {
            this.imageLocalPath = r.tempFilePaths[0]
            this.imagePreview = r.tempFilePaths[0]
          }
        })
      },
      removeImage() {
        this.imageLocalPath = ''
        this.imagePreview = ''
      },
      submit() {
        this.$refs.form.validate().then(async (value) => {
          let imageFileID = ''
          if (this.imageLocalPath) {
            uni.showLoading({ mask: true, title: '上传图片中' })
            const cloudPath = 'banners/' + Date.now() + '.png'
            const guessFileID = 'cloud://' + ENV_ID + '/' + cloudPath
            try {
              await uniCloud.uploadFile({ filePath: this.imageLocalPath, cloudPath })
            } catch (err) {
              // 支付宝云 uploadFile 常上传成功却误 reject，属预期
            }
            imageFileID = guessFileID // 始终存 cloud://
            let ok = false
            try {
              const t = await uniCloud.getTempFileURL({ fileList: [imageFileID] })
              const it = t.fileList && t.fileList[0]
              ok = !!(it && it.tempFileURL && (!it.code || it.code === 'SUCCESS'))
            } catch (ve) {
              console.warn('[轮播图上传] 验证失败 =', ve)
            }
            uni.hideLoading()
            if (!ok) {
              uni.showModal({ content: '图片上传失败，请重试', showCancel: false })
              return
            }
          }
          await this.doSave(imageFileID)
        }).catch(() => {})
      },
      async doSave(imageFileID) {
        uni.showLoading({ mask: true })
        try {
          // 直接用页面 formData（v-model 最新值），不依赖 uni-forms validate 的返回值
          const value = Object.assign({}, this.formData)
          value.image = imageFileID || ''
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

  .img-uploader {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    align-items: center;
  }

  .banner-preview {
    width: 180px;
    height: 90px;
    border-radius: 6px;
  }

  .img-add {
    width: 180px;
    height: 90px;
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

  .img-del {
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
