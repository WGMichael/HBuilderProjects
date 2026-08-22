<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" :rules="rules" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="分类ID">
        <text class="readonly-tip">{{ formData.id }}（业务ID不可修改）</text>
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
  const ENV_ID = 'env-00jy6khv502r'

  export default {
    data() {
      return {
        formData: { id: null, name: '', icon: '', sort: 0 },
        rules: {
          name: { rules: [{ required: true }, { format: 'string' }] },
          icon: { rules: [{ format: 'string' }] },
          sort: { rules: [{ format: 'int' }] }
        },
        originalIcon: '', // 进入时的图标 fileID（用于判断是否需要删旧图）
        iconFileID: '', // 当前保存用的 fileID（回显=原图，删除=''，换图=上传后新的）
        iconLocalPath: '', // 新选的本地图（blob，未上传）
        iconPreview: '' // 预览（原图 https 或新图 blob）
      }
    },
    onLoad(e) {
      if (e.id) {
        this.formDataId = e.id
        this.getDetail(e.id)
      }
    },
    methods: {
      // 选新图，仅本地预览，不上传
      chooseIcon() {
        uni.chooseImage({
          count: 1,
          success: (r) => {
            this.iconLocalPath = r.tempFilePaths[0]
            this.iconPreview = r.tempFilePaths[0]
            this.iconFileID = '' // 换了新图，旧 fileID 作废，提交时上传新的
          }
        })
      },
      // 移除图标：立即删除云端已有图片 + 清空界面
      removeIcon() {
        const fid = this.iconFileID || this.originalIcon
        if (fid && fid.indexOf('cloud://') === 0) {
          uniCloud.importObject('mall-file-co', { customUI: true }).deleteImages([fid]).then(() => {
            uni.showToast({ icon: 'none', title: '图片已删除' })
          }).catch((err) => console.warn('删除云端图片失败：', err))
          this.originalIcon = '' // 已删，提交时不再重复删
        }
        this.iconLocalPath = ''
        this.iconPreview = ''
        this.iconFileID = ''
      },
      submit() {
        this.$refs.form.validate().then(async (value) => {
          let finalIcon = this.iconFileID // 默认：没动图，保持原样
          // 1. 选了新图 → 上传（同 add 流程：拼 fileID + getTempFileURL 验证）
          if (this.iconLocalPath) {
            uni.showLoading({ mask: true, title: '上传图片中' })
            const cloudPath = 'types/' + Date.now() + '.png'
            const guessFileID = 'cloud://' + ENV_ID + '/' + cloudPath
            try {
              await uniCloud.uploadFile({ filePath: this.iconLocalPath, cloudPath })
            } catch (err) {
              // 支付宝云 uploadFile 常上传成功却误 reject，属预期
            }
            finalIcon = guessFileID // 始终存 cloud://
            let ok = false
            try {
              const t = await uniCloud.getTempFileURL({ fileList: [finalIcon] })
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
          // 2. 原图被换掉或删除 → 删云存储旧图
          if (this.originalIcon && this.originalIcon !== finalIcon && this.originalIcon.indexOf('cloud://') === 0) {
            uniCloud.importObject('mall-file-co', { customUI: true }).deleteImages([this.originalIcon]).catch((err) => console.warn('删除旧图失败：', err))
          }
          // 3. 写库
          await this.doSave(finalIcon)
        }).catch(() => {})
      },
      async doSave(finalIcon) {
        uni.showLoading({ mask: true })
        try {
          // 直接用页面 formData（v-model 最新值），不依赖 uni-forms validate 的返回值
          const value = Object.assign({}, this.formData)
          value.icon = finalIcon || ''
          value.sort = value.sort === '' || value.sort == null ? 0 : Number(value.sort)
          delete value.id // 业务 id 不改
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
        db.collection(dbCollectionName).doc(id).field('id,name,icon,sort').get().then(async (res) => {
          const data = res.result.data[0]
          if (data) {
            this.formData = Object.assign({}, this.formData, data)
            this.originalIcon = data.icon || ''
            this.iconFileID = data.icon || ''
            // 回显预览：cloud:// 转 https，http 直接用
            if (data.icon && data.icon.indexOf('cloud://') === 0) {
              try {
                const t = await uniCloud.getTempFileURL({ fileList: [data.icon] })
                this.iconPreview = (t.fileList && t.fileList[0] && t.fileList[0].tempFileURL) || ''
              } catch (e) {
                console.warn('图标预览转换失败：', e)
              }
            } else if (data.icon && data.icon.indexOf('http') === 0) {
              this.iconPreview = data.icon
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
