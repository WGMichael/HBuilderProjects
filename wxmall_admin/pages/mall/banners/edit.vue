<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" :rules="rules" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="轮播ID">
        <text class="readonly-tip">{{ formData.id }}（业务ID不可修改）</text>
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
        formData: { id: null, title: '', sub: '', image: '', link: '', sort: 0, enable: true },
        rules: {
          title: { rules: [{ required: true }, { format: 'string' }] },
          sub: { rules: [{ format: 'string' }] },
          link: { rules: [{ format: 'string' }] },
          sort: { rules: [{ format: 'int' }] },
          enable: { rules: [{ format: 'bool' }] }
        },
        originalImage: '', // 进入时的图片 fileID
        imageFileID: '', // 当前保存用的 fileID（回显=原图，移除=''，换图=上传后新的）
        imageLocalPath: '', // 新选的本地图（blob，未上传）
        imagePreview: '' // 预览（原图 https 或新图 blob）
      }
    },
    onLoad(e) {
      if (e.id) {
        this.formDataId = e.id
        this.getDetail(e.id)
      }
    },
    methods: {
      chooseImage() {
        uni.chooseImage({
          count: 1,
          success: (r) => {
            this.imageLocalPath = r.tempFilePaths[0]
            this.imagePreview = r.tempFilePaths[0]
            this.imageFileID = ''
          }
        })
      },
      // 移除图片：立即删除云端已有图片 + 清空界面
      removeImage() {
        const fid = this.imageFileID || this.originalImage
        if (fid && fid.indexOf('cloud://') === 0) {
          uniCloud.importObject('mall-file-co', { customUI: true }).deleteImages([fid]).then(() => {
            uni.showToast({ icon: 'none', title: '图片已删除' })
          }).catch((err) => console.warn('删除云端图片失败：', err))
          this.originalImage = ''
        }
        this.imageLocalPath = ''
        this.imagePreview = ''
        this.imageFileID = ''
      },
      submit() {
        this.$refs.form.validate().then(async (value) => {
          let finalImage = this.imageFileID
          if (this.imageLocalPath) {
            uni.showLoading({ mask: true, title: '上传图片中' })
            const cloudPath = 'banners/' + Date.now() + '.png'
            const guessFileID = 'cloud://' + ENV_ID + '/' + cloudPath
            try {
              await uniCloud.uploadFile({ filePath: this.imageLocalPath, cloudPath })
            } catch (err) {
              // 支付宝云 uploadFile 常上传成功却误 reject，属预期
            }
            finalImage = guessFileID // 始终存 cloud://
            let ok = false
            try {
              const t = await uniCloud.getTempFileURL({ fileList: [finalImage] })
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
          // 原图被换掉（未走移除按钮但选了新图）→ 删旧图
          if (this.originalImage && this.originalImage !== finalImage && this.originalImage.indexOf('cloud://') === 0) {
            uniCloud.importObject('mall-file-co', { customUI: true }).deleteImages([this.originalImage]).catch((err) => console.warn('删除旧图失败：', err))
          }
          await this.doSave(finalImage)
        }).catch(() => {})
      },
      async doSave(finalImage) {
        uni.showLoading({ mask: true })
        try {
          // 直接用页面 formData（v-model 最新值），不依赖 uni-forms validate 的返回值
          const value = Object.assign({}, this.formData)
          value.image = finalImage || ''
          value.sort = value.sort === '' || value.sort == null ? 0 : Number(value.sort)
          delete value.id
          await db.collection(dbCollectionName).doc(this.formDataId).update(value)
          uni.showToast({ icon: 'none', title: '修改成功' })
          this.getOpenerEventChannel().emit('refreshData')
          setTimeout(() => uni.navigateBack(), 500)
        } catch (err) {
          uni.showModal({ content: err.message || '请求服务失败', showCancel: false })
        } finally {
          uni.hideLoading()
        }
      },
      getDetail(id) {
        uni.showLoading({ mask: true })
        db.collection(dbCollectionName).doc(id).field('id,title,sub,image,link,sort,enable').get().then(async (res) => {
          const data = res.result.data[0]
          if (data) {
            this.formData = Object.assign({}, this.formData, data)
            this.originalImage = data.image || ''
            this.imageFileID = data.image || ''
            if (data.image && data.image.indexOf('cloud://') === 0) {
              try {
                const t = await uniCloud.getTempFileURL({ fileList: [data.image] })
                this.imagePreview = (t.fileList && t.fileList[0] && t.fileList[0].tempFileURL) || ''
              } catch (e) {
                console.warn('图片预览转换失败：', e)
              }
            } else if (data.image && data.image.indexOf('http') === 0) {
              this.imagePreview = data.image
            }
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
