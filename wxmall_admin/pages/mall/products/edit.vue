<template>
  <view class="uni-container">
    <uni-forms ref="form" :model="formData" validate-trigger="submit" err-show-type="toast">
      <uni-forms-item name="id" label="商品ID">
        <text class="readonly-tip">{{ formData.id }}（业务ID不可修改）</text>
      </uni-forms-item>
      <uni-forms-item name="title" label="商品标题" required>
        <uni-easyinput v-model="formData.title" trim="both" placeholder="请输入商品标题"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="subtitle" label="副标题">
        <uni-easyinput v-model="formData.subtitle" placeholder="可选"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="categoryIds" label="所属分类" required>
        <uni-data-checkbox multiple v-model="categoryIds" :localdata="catOptions" @change="onCategoryChange"></uni-data-checkbox>
      </uni-forms-item>
      <uni-forms-item name="cover" label="封面">
        <view class="img-uploader">
          <view v-if="cover.preview" class="grid-item">
            <image :src="cover.preview" class="grid-img" mode="aspectFill" @click="chooseCover"></image>
            <text class="grid-del" @click="removeCover">×</text>
          </view>
          <view v-else class="img-add" @click="chooseCover">＋</view>
        </view>
      </uni-forms-item>
      <uni-forms-item name="images" label="轮播图">
        <view class="img-grid">
          <view v-for="(it, i) in imageList" :key="i" class="grid-item">
            <image :src="it.preview" class="grid-img" mode="aspectFill"></image>
            <text class="grid-del" @click="removeImageAt(i)">×</text>
          </view>
          <view class="img-add" @click="chooseImages">＋</view>
        </view>
      </uni-forms-item>
      <uni-forms-item name="price" label="售价(元)" required>
        <uni-easyinput type="number" v-model="formData.price" placeholder="0.00"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="oldPrice" label="原价(元)">
        <uni-easyinput type="number" v-model="formData.oldPrice" placeholder="划线价，可选"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="sold" label="销量">
        <uni-easyinput type="number" v-model="formData.sold"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="stock" label="库存">
        <uni-easyinput type="number" v-model="formData.stock"></uni-easyinput>
      </uni-forms-item>
      <uni-forms-item name="limitPerOrder" label="单次限购">
        <uni-easyinput type="number" v-model="formData.limitPerOrder" placeholder="默认1"></uni-easyinput>
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
          <uni-tag v-for="opt in tagOptions" :key="opt.id" :text="opt.name" type="default" class="lib-tag" @click="pickTag(opt.name)"></uni-tag>
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
      <text class="tip">移除/更换已有图片会立即删除云端旧图；新选图片点「提交」时才上传</text>
      <view class="uni-button-group">
        <button type="primary" class="uni-button" @click="submit">提交</button>
      </view>
    </uni-forms>
  </view>
</template>

<script>
  import { validator } from '../../../js_sdk/validator/tc-products.js';
  import mallSkuEditor from '../../../components/mall-sku-editor/mall-sku-editor.vue';

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

  function delCloud(fileID) {
    if (fileID && fileID.indexOf('cloud://') === 0) {
      uniCloud.importObject('mall-file-co', { customUI: true }).deleteImages([fileID]).catch((err) => console.warn('删除云端图片失败：', err))
    }
  }

  export default {
    components: { mallSkuEditor },
    data() {
      let formData = {
        id: null,
        title: '',
        subtitle: '',
        price: null,
        oldPrice: null,
        sold: 0,
        stock: 0,
        limitPerOrder: 1,
        rating: null,
        heat: 0,
        tags: [],
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
        categoryIds: [],
        catOptions: [], // 分类选项 [{value,text}]
        tagInput: '',
        featureInput: '',
        tagOptions: [], // 预设标签库
        cover: { fileID: '', localPath: '', preview: '' },
        imageList: [],
        detailList: []
      }
    },
    onLoad(e) {
      if (e.id) {
        this.formDataId = e.id
        this.getDetail(e.id)
      }
    },
    onReady() {
      this.$refs.form.setRules(this.rules)
      this.loadCategories()
      this.loadTags()
    },
    computed: {
      imgDir() {
        const clean = (s) => (s || '').replace(/[\s\/\\?<>:*|"]/g, '_')
        const cat = clean(this.categoryName) || '未分类'
        const title = clean(this.formData.title) || '未命名'
        return 'products/' + cat + '/' + title + '/'
      }
    },
    methods: {
      loadCategories() {
        db.collection('tc-categories').orderBy('sort', 'asc').field('id,name').get().then((r) => {
          this.catOptions = (r.result.data || []).map((c) => ({ value: c.id, text: c.name }))
        }).catch((e) => console.warn('加载分类失败：', e))
      },
      onCategoryChange() {
        const first = this.categoryIds[0]
        const o = this.catOptions.find((x) => x.value === first)
        this.categoryName = o ? o.text : ''
      },
      loadTags() {
        db.collection('tc-tags').orderBy('sort', 'asc').field('id,name').get().then((r) => {
          this.tagOptions = (r.result.data || []).map((t) => ({ id: t.id, name: t.name }))
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
            delCloud(this.cover.fileID) // 换封面，删旧云图
            this.cover = { fileID: '', localPath: r.tempFilePaths[0], preview: r.tempFilePaths[0] }
          }
        })
      },
      removeCover() {
        delCloud(this.cover.fileID)
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
        delCloud(this.imageList[i].fileID)
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
        delCloud(this.detailList[i].fileID)
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
        ['price', 'oldPrice', 'sold', 'stock', 'rating', 'heat'].forEach((k) => {
          if (v[k] === '' || v[k] === null || v[k] === undefined) delete v[k]
          else v[k] = Number(v[k])
        })
        const limit = Number(v.limitPerOrder)
        v.limitPerOrder = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 1
      },
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
        this.$refs.form.validate().then(async (value) => {
          uni.showLoading({ mask: true, title: '上传图片中' })
          try {
            const ts = Date.now()
            let coverFileID = this.cover.fileID
            if (this.cover.localPath) coverFileID = await this.uploadOne(this.cover.localPath, 'cover_' + ts)
            const imageFileIDs = []
            for (let i = 0; i < this.imageList.length; i++) {
              const it = this.imageList[i]
              if (it.localPath) imageFileIDs.push(await this.uploadOne(it.localPath, 'img_' + ts + '_' + i))
              else if (it.fileID) imageFileIDs.push(it.fileID)
            }
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
        db.collection(dbCollectionName).doc(id)
          .field('id,title,subtitle,categoryId,categoryIds,cover,images,price,oldPrice,sold,stock,limitPerOrder,rating,heat,tags,features,desc,detailImages,skus,isNew,isHot,onSale')
          .get().then(async (res) => {
            const data = res.result.data[0]
            if (!data) return
            const productLimit = Number(data.limitPerOrder)
            this.formData = {
              id: data.id,
              title: data.title || '',
              subtitle: data.subtitle || '',
              price: data.price,
              oldPrice: data.oldPrice,
              sold: data.sold,
              stock: data.stock,
              limitPerOrder: Number.isFinite(productLimit) && productLimit >= 1 ? Math.floor(productLimit) : 1,
              rating: data.rating,
              heat: data.heat,
              tags: data.tags || [],
              features: data.features || [],
              desc: data.desc || '',
              skus: data.skus || [],
              isNew: !!data.isNew,
              isHot: !!data.isHot,
              onSale: data.onSale
            }
            // 分类回显（兼容旧数据：无 categoryIds 时用 [categoryId]）
            this.categoryIds = (data.categoryIds && data.categoryIds.length) ? data.categoryIds : (data.categoryId != null ? [data.categoryId] : [])
            // 图片回显：收集所有 cloud fileID 批量转 https 预览
            const allIds = []
            if (data.cover) allIds.push(data.cover)
            ;(data.images || []).forEach((f) => allIds.push(f))
            ;(data.detailImages || []).forEach((f) => allIds.push(f))
            const cloudIds = allIds.filter((f) => f && f.indexOf('cloud://') === 0)
            const map = {}
            if (cloudIds.length) {
              try {
                const t = await uniCloud.getTempFileURL({ fileList: cloudIds })
                ;(t.fileList || []).forEach((x) => { map[x.fileID] = x.tempFileURL })
              } catch (e) {
                console.warn('图片预览转换失败：', e)
              }
            }
            const toPreview = (f) => (f ? (map[f] || (f.indexOf('http') === 0 ? f : '')) : '')
            this.cover = data.cover ? { fileID: data.cover, localPath: '', preview: toPreview(data.cover) } : { fileID: '', localPath: '', preview: '' }
            this.imageList = (data.images || []).map((f) => ({ fileID: f, localPath: '', preview: toPreview(f) }))
            this.detailList = (data.detailImages || []).map((f) => ({ fileID: f, localPath: '', preview: toPreview(f) }))
            // 分类名（供上传目录）
            if (data.categoryId != null) {
              try {
                const c = await db.collection('tc-categories').where('id==' + data.categoryId).field('name').get()
                this.categoryName = (c.result.data[0] && c.result.data[0].name) || ''
              } catch (e) {
                console.warn('查询分类名失败：', e)
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
