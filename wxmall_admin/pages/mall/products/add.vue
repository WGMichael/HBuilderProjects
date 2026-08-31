<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="商品ID">
        <text class="readonly-tip">保存时由系统自动分配（当前最大ID+1）</text>
      </uni-forms-item>
      <uni-forms-item name="title" label="商品标题" required>
        <uni-easyinput v-model="formData.title" trim="both" placeholder="请输入商品标题"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="subtitle" label="副标题">
        <uni-easyinput v-model="formData.subtitle" placeholder="可选"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="shipFrom" label="发货地">
        <uni-data-select v-model="formData.shipFrom" :localdata="provinceOptions" :clear="false"></uni-data-select>
      </uni-forms-item>
      <uni-forms-item name="categoryIds" label="所属分类" required>
        <uni-data-checkbox multiple v-model="categoryIds" :localdata="catOptions" @change="onCategoryChange"></uni-data-checkbox>
      </uni-forms-item>
      <!-- 封面（单图） -->
      <uni-forms-item name="cover" label="封面">
        <view class="img-uploader">
          <view v-if="cover.preview" class="grid-item">
            <image :src="cover.preview" class="grid-img" mode="aspectFill" @click="chooseCover"></image>
            <text class="grid-del" @click="removeCover">×</text>
          </view>
          <view v-else class="img-add" @click="chooseCover">＋</view>
        </view>
      </uni-forms-item>
      <!-- 轮播图（多图） -->
      <uni-forms-item name="images" label="轮播图">
        <view class="img-grid">
          <view v-for="(it, i) in imageList" :key="i" class="grid-item">
            <image :src="it.preview" class="grid-img" mode="aspectFill"></image>
            <text class="grid-del" @click="removeImageAt(i)">×</text>
          </view>
          <view class="img-add" @click="chooseImages">＋</view>
        </view>
      </uni-forms-item>
      <uni-forms-item name="rating" label="评分(1-5)">
        <uni-easyinput type="number" v-model="formData.rating" placeholder="1-5"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="heat" label="热度">
        <uni-easyinput type="number" v-model="formData.heat" placeholder="热度值，越大越靠前"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="tags" label="标签">
        <view class="tags-box">
          <uni-tag v-for="(t, i) in formData.tags" :key="i" :text="t" type="primary" :inverted="true" class="tag-item" @click="removeTag(i)"></uni-tag>
          <text v-if="formData.tags.length" class="tags-hint">（点击标签可删除）</text>
        </view>
        <view class="tags-input">
          <uni-easyinput v-model="tagInput" placeholder="手写标签，如 顺丰包邮" @confirm="addTag"></uni-easyinput>
          <button size="mini" type="primary" @click="addTag">添加</button>
        </view>
        <view class="tag-lib" v-if="tagOptions.length">
          <text class="lib-label">从标签库选：</text>
          <text v-for="opt in tagOptions" :key="opt.id" class="lib-tag" :style="{ backgroundColor: opt.bgColor || '#f0f0f0', color: opt.textColor || '#333333' }" @click="pickTag(opt.name)">{{ opt.name }}</text>
        </view>
      </uni-forms-item>
      <uni-forms-item name="features" label="商品特色">
        <view class="tags-box">
          <uni-tag v-for="(f, i) in formData.features" :key="i" :text="f" type="success" :inverted="true" class="tag-item" @click="removeFeature(i)"></uni-tag>
          <text v-if="formData.features.length" class="tags-hint">（点击可删除）</text>
        </view>
        <view class="tags-input">
          <uni-easyinput v-model="featureInput" placeholder="简短特色，如 无添加 / 古法工艺" @confirm="addFeature"></uni-easyinput>
          <button size="mini" type="primary" @click="addFeature">添加</button>
        </view>
      </uni-forms-item>
      <uni-forms-item name="desc" label="商品描述">
        <uni-easyinput type="textarea" v-model="formData.desc" placeholder="可选"></uni-easyinput>
      </uni-forms-item>
      <!-- 详情图（多图） -->
      <uni-forms-item name="detailImages" label="详情图">
        <view class="img-grid">
          <view v-for="(it, i) in detailList" :key="i" class="grid-item">
            <image :src="it.preview" class="grid-img" mode="aspectFill"></image>
            <text class="grid-del" @click="removeDetailAt(i)">×</text>
          </view>
          <view class="img-add" @click="chooseDetail">＋</view>
        </view>
      </uni-forms-item>
      <uni-forms-item name="skus" label="规格(SKU)">
        <mall-sku-editor v-model="formData.skus"></mall-sku-editor>
      </uni-forms-item>
      <uni-forms-item name="isNew" label="新品">
        <switch @change="binddata('isNew', $event.detail.value)" :checked="formData.isNew"></switch>
      </uni-forms-item>
      <uni-forms-item name="isHot" label="热卖">
        <switch @change="binddata('isHot', $event.detail.value)" :checked="formData.isHot"></switch>
      </uni-forms-item>
      <uni-forms-item name="onSale" label="是否上架">
        <switch @change="binddata('onSale', $event.detail.value)" :checked="formData.onSale"></switch>
      </uni-forms-item>
      <text class="tip">图片选择后仅本地预览，点「提交」时才统一上传到 products/分类/标题/ 目录</text>
      <view class="uni-button-group">
        <button type="primary" class="uni-button" @click="submit">提交</button>
      </view>
    </uni-forms>
  </view>
</template>

<script>
  import { validator } from '../../../js_sdk/validator/tc-products.js';
  import mallSkuEditor from '../../../components/mall-sku-editor/mall-sku-editor.vue';
  import { PROVINCE_OPTIONS } from '../../../common/provinces.js';

  const db = uniCloud.database();
  const dbCollectionName = 'tc-products';
  const ENV_ID = 'env-00jy6khv502r';

  function getValidator(fields) {
    let result = {}
    for (let key in validator) {
      if (fields.indexOf(key) > -1) {
        result[key] = validator[key]
      }
    }
    return result
  }

  export default {
    components: { mallSkuEditor },
    data() {
      // formData 不含 cover/images/detailImages（图片单独状态管理，提交时赋值）
      let formData = {
        title: '',
        subtitle: '',
        shipFrom: '广东省',
        rating: null,
        heat: 0,
        tags: [],
        features: [],
        desc: '',
        skus: [],
        isNew: false,
        isHot: false,
        onSale: true
      }
      return {
        formData,
        rules: { ...getValidator(Object.keys(formData)) },
        categoryName: '',
        categoryIds: [], // 多选分类 id 数组
        catOptions: [], // 分类选项 [{value,text}]
        tagInput: '',
        featureInput: '',
        tagOptions: [], // 预设标签库
        provinceOptions: PROVINCE_OPTIONS, // 发货地省份选项
        // 图片项模型：{ fileID(已存云端), localPath(新选待传), preview(展示) }
        cover: { fileID: '', localPath: '', preview: '' },
        imageList: [],
        detailList: []
      }
    },
    onReady() {
      this.$refs.form.setRules(this.rules)
      this.loadCategories()
      this.loadTags()
    },
    computed: {
      // 图片上传目录：products/分类名/商品标题/
      imgDir() {
        const clean = (s) => (s || '').replace(/[\s\/\\?<>:*|"]/g, '_')
        const cat = clean(this.categoryName) || '未分类'
        const title = clean(this.formData.title) || '未命名'
        return 'products/' + cat + '/' + title + '/'
      }
    },
    methods: {
      // 加载分类选项（uni-data-select 用 localdata 显示，避开 uni-data-picker 首次选择显示滞后的问题）
      loadCategories() {
        db.collection('tc-categories').orderBy('sort', 'asc').field('id,name').get().then((r) => {
          this.catOptions = (r.result.data || []).map((c) => ({ value: c.id, text: c.name }))
        }).catch((e) => console.warn('加载分类失败：', e))
      },
      onCategoryChange() {
        // 主分类 = 数组第一个，用于图片目录归档
        const first = this.categoryIds[0]
        const o = this.catOptions.find((x) => x.value === first)
        this.categoryName = o ? o.text : ''
      },
      loadTags() {
        db.collection('tc-tags').orderBy('sort', 'asc').field('id,name,bgColor,textColor').get().then((r) => {
          this.tagOptions = (r.result.data || []).map((t) => ({ id: t.id, name: t.name, bgColor: t.bgColor, textColor: t.textColor }))
        }).catch(() => {})
      },
      // 从标签库选：把标签名加入 tags 文本数组（不重复）
      pickTag(name) {
        if (name && this.formData.tags.indexOf(name) === -1) this.formData.tags.push(name)
      },
      chooseCover() {
        uni.chooseImage({
          count: 1,
          success: (r) => {
            this.cover = { fileID: '', localPath: r.tempFilePaths[0], preview: r.tempFilePaths[0] }
          }
        })
      },
      removeCover() {
        this.cover = { fileID: '', localPath: '', preview: '' }
      },
      chooseImages() {
        uni.chooseImage({
          count: 9,
          success: (r) => {
            r.tempFilePaths.forEach((p) => this.imageList.push({ fileID: '', localPath: p, preview: p }))
          }
        })
      },
      removeImageAt(i) {
        this.imageList.splice(i, 1)
      },
      chooseDetail() {
        uni.chooseImage({
          count: 9,
          success: (r) => {
            r.tempFilePaths.forEach((p) => this.detailList.push({ fileID: '', localPath: p, preview: p }))
          }
        })
      },
      removeDetailAt(i) {
        this.detailList.splice(i, 1)
      },
      addTag() {
        const t = (this.tagInput || '').trim()
        if (t && this.formData.tags.indexOf(t) === -1) this.formData.tags.push(t)
        this.tagInput = ''
      },
      removeTag(i) {
        this.formData.tags.splice(i, 1)
      },
      addFeature() {
        const f = (this.featureInput || '').trim()
        if (f && this.formData.features.indexOf(f) === -1) this.formData.features.push(f)
        this.featureInput = ''
      },
      removeFeature(i) {
        this.formData.features.splice(i, 1)
      },
      normalizeNumbers(v) {
        ['rating', 'heat'].forEach((k) => {
          if (v[k] === '' || v[k] === null || v[k] === undefined) delete v[k]
          else v[k] = Number(v[k])
        })
      },
      // 上传单张：拼 fileID + getTempFileURL 验证，失败抛错
      async uploadOne(localPath, name) {
        const cloudPath = this.imgDir + name + '.png'
        // 始终存拼接的 cloud:// fileID（uploadFile 返回值在支付宝云可能是会过期的 https，不能入库）
        const fid = 'cloud://' + ENV_ID + '/' + cloudPath
        try {
          await uniCloud.uploadFile({ filePath: localPath, cloudPath })
        } catch (e) {
          // 支付宝云 uploadFile 常「上传成功却误 reject」，文件其实已传，属预期（下方 getTempFileURL 验证）
        }
        const t = await uniCloud.getTempFileURL({ fileList: [fid] })
        const it = t.fileList && t.fileList[0]
        if (!(it && it.tempFileURL && (!it.code || it.code === 'SUCCESS'))) throw new Error('图片上传失败')
        return fid
      },
      submit() {
        if (!this.categoryIds.length) {
          uni.showToast({ icon: 'none', title: '请选择所属分类' })
          return
        }
        if (!(this.formData.skus || []).filter((s) => s.name && String(s.name).trim()).length) {
          uni.showToast({ icon: 'none', title: '请至少添加一个规格（并填写规格名）' })
          return
        }
        this.$refs.form.validate().then(async (value) => {
          console.log('[商品] validate 返回 value =', JSON.stringify(value))
          console.log('[商品] 页面 formData =', JSON.stringify(this.formData))
          uni.showLoading({ mask: true, title: '上传图片中' })
          try {
            const ts = Date.now()
            // 封面
            let coverFileID = this.cover.fileID
            if (this.cover.localPath) coverFileID = await this.uploadOne(this.cover.localPath, 'cover_' + ts)
            // 轮播图（local 上传、cloud 保留）
            const imageFileIDs = []
            for (let i = 0; i < this.imageList.length; i++) {
              const it = this.imageList[i]
              if (it.localPath) imageFileIDs.push(await this.uploadOne(it.localPath, 'img_' + ts + '_' + i))
              else if (it.fileID) imageFileIDs.push(it.fileID)
            }
            // 详情图
            const detailFileIDs = []
            for (let i = 0; i < this.detailList.length; i++) {
              const it = this.detailList[i]
              if (it.localPath) detailFileIDs.push(await this.uploadOne(it.localPath, 'detail_' + ts + '_' + i))
              else if (it.fileID) detailFileIDs.push(it.fileID)
            }
            uni.hideLoading()
            await this.doSave(coverFileID, imageFileIDs, detailFileIDs)
          } catch (e) {
            uni.hideLoading()
            uni.showModal({ content: '图片上传失败，请重试', showCancel: false })
          }
        }).catch(() => {})
      },
      async doSave(coverFileID, imageFileIDs, detailFileIDs) {
        uni.showLoading({ mask: true })
        try {
          // 直接用页面 formData（v-model 最新值），不依赖 uni-forms validate 的返回值
          const value = Object.assign({}, this.formData)
          value.categoryIds = this.categoryIds
          value.categoryId = this.categoryIds[0] // 主分类
          value.cover = coverFileID || ''
          value.images = imageFileIDs
          value.detailImages = detailFileIDs
          this.normalizeNumbers(value)
          // 过滤没填名称的空规格行
          value.skus = (value.skus || []).filter((s) => s.name && String(s.name).trim())
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

  .img-uploader,
  .img-grid {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .grid-item {
    position: relative;
    margin: 0 8px 8px 0;
  }

  .grid-img {
    width: 80px;
    height: 80px;
    border-radius: 6px;
  }

  .grid-del {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 18px;
    height: 18px;
    line-height: 18px;
    text-align: center;
    font-size: 14px;
    color: #fff;
    background: #dd524d;
    border-radius: 50%;
  }

  .img-add {
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
    margin-bottom: 8px;
  }

  .tags-box {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 8px;
  }

  .tag-item {
    margin-right: 6px;
    margin-bottom: 6px;
  }

  .tags-hint {
    font-size: 12px;
    color: #999;
  }

  .tags-input {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    align-items: center;
  }

  .tags-input button {
    margin-left: 8px;
  }

  .tag-lib {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 8px;
  }

  .lib-label {
    font-size: 12px;
    color: #999;
    margin-right: 4px;
  }

  .lib-tag {
    margin: 0 6px 6px 0;
    padding: 3px 12px;
    border-radius: 4px;
    font-size: 13px;
  }

  .tip {
    display: block;
    margin: 10px 0;
    font-size: 12px;
    color: #999;
  }

  .uni-button-group {
    margin-top: 30px;
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    justify-content: center;
  }

  .uni-button {
    width: 184px;
  }
</style>
