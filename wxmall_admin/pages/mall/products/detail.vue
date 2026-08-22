<template>
  <view class="uni-container">
    <unicloud-db ref="udb" v-slot:default="{data, loading, error}" :collection="collectionList" :getone="true" :manual="true" @load="onDetailLoad">
      <view v-if="error">{{ error.message }}</view>
      <view v-else-if="loading">
        <uni-load-more status="loading"></uni-load-more>
      </view>
      <view v-else-if="data" class="detail">
        <view class="row"><text class="label">商品ID</text><text class="value">{{ data.id }}</text></view>
        <view class="row"><text class="label">商品标题</text><text class="value">{{ data.title }}</text></view>
        <view class="row"><text class="label">副标题</text><text class="value">{{ data.subtitle }}</text></view>
        <view class="row"><text class="label">所属分类</text><text class="value">{{ data.categoryId && data.categoryId[0] && data.categoryId[0].text }}</text></view>
        <view class="row"><text class="label">封面</text>
          <image v-if="imgUrl(data.cover)" :src="imgUrl(data.cover)" class="cover" mode="widthFix"></image>
          <text v-else class="value">{{ data.cover }}</text>
        </view>
        <view class="row"><text class="label">轮播图</text>
          <view class="imgs">
            <image v-for="(u, i) in data.images" :key="i" :src="imgUrl(u)" class="img" mode="aspectFill"></image>
          </view>
        </view>
        <view class="row"><text class="label">售价</text><text class="value">¥{{ data.price }}</text></view>
        <view class="row"><text class="label">原价</text><text class="value">{{ data.oldPrice ? '¥' + data.oldPrice : '-' }}</text></view>
        <view class="row"><text class="label">销量</text><text class="value">{{ data.sold }}</text></view>
        <view class="row"><text class="label">库存</text><text class="value">{{ data.stock }}</text></view>
        <view class="row"><text class="label">评分</text><text class="value">{{ data.rating || '-' }}</text></view>
        <view class="row"><text class="label">标签</text>
          <view class="tags">
            <uni-tag v-for="(t, i) in data.tags" :key="i" :text="t" type="primary" :inverted="true" class="tag"></uni-tag>
            <text v-if="!data.tags || !data.tags.length" class="value">-</text>
          </view>
        </view>
        <view class="row"><text class="label">商品描述</text><text class="value">{{ data.desc }}</text></view>
        <view class="row"><text class="label">详情图</text>
          <view class="imgs">
            <image v-for="(u, i) in data.detailImages" :key="i" :src="imgUrl(u)" class="img" mode="widthFix"></image>
          </view>
        </view>
        <view class="row"><text class="label">规格(SKU)</text>
          <view class="skus">
            <view v-for="(s, i) in data.skus" :key="i" class="sku">{{ s.name }} · ¥{{ s.price }}<text v-if="s.oldPrice" class="sku-old">原价¥{{ s.oldPrice }}</text> · 库存{{ s.stock }}</view>
            <text v-if="!data.skus || !data.skus.length" class="value">无规格</text>
          </view>
        </view>
        <view class="row"><text class="label">是否上架</text><text class="value">{{ data.onSale ? '✅ 已上架' : '❌ 已下架' }}</text></view>
      </view>
    </unicloud-db>
    <view class="btns">
      <button type="primary" @click="handleUpdate">修改</button>
      <button type="warn" class="btn-delete" @click="handleDelete">删除</button>
    </view>
  </view>
</template>

<script>
  const db = uniCloud.database()

  export default {
    data() {
      return {
        collectionList: [
          db.collection('tc-products').field('id,title,subtitle,categoryId,cover,images,price,oldPrice,sold,stock,rating,tags,desc,detailImages,skus,onSale').getTemp(),
          db.collection('tc-categories').field('id, name as text').getTemp()
        ],
        // cloud:// fileID -> https 映射（响应式）
        imgMap: {}
      }
    },
    onLoad(e) {
      this._id = e.id
    },
    onReady() {
      if (this._id) {
        this.collectionList = [
          db.collection('tc-products').where('_id=="' + this._id + '"').field('id,title,subtitle,categoryId,cover,images,price,oldPrice,sold,stock,rating,tags,desc,detailImages,skus,onSale').getTemp(),
          db.collection('tc-categories').field('id, name as text').getTemp()
        ]
      }
    },
    methods: {
      // 详情加载后：把 cloud:// 图片 fileID 批量转成可显示的 https
      async onDetailLoad(data) {
        if (!data) return
        const ids = []
        if (data.cover && data.cover.indexOf('cloud://') === 0) ids.push(data.cover)
        ;(data.images || []).forEach((u) => { if (u && u.indexOf('cloud://') === 0) ids.push(u) })
        ;(data.detailImages || []).forEach((u) => { if (u && u.indexOf('cloud://') === 0) ids.push(u) })
        if (!ids.length) return
        try {
          const res = await uniCloud.getTempFileURL({ fileList: ids })
          const map = Object.assign({}, this.imgMap)
          res.fileList.forEach((f) => { map[f.fileID] = f.tempFileURL })
          this.imgMap = map
        } catch (e) {
          console.warn('图片地址转换失败：', e)
        }
      },
      isImageUrl(v) {
        return typeof v === 'string' && (v.indexOf('http') === 0 || v.indexOf('cloud://') === 0)
      },
      // 图片显示地址：cloud:// 用转换后的 https；http 直接用；其它返回空
      imgUrl(v) {
        if (!v) return ''
        if (this.imgMap[v]) return this.imgMap[v]
        if (v.indexOf('http') === 0) return v
        return ''
      },
      handleUpdate() {
        uni.navigateTo({
          url: './edit?id=' + this._id,
          events: {
            refreshData: () => this.$refs.udb.loadData({ clear: true })
          }
        })
      },
      handleDelete() {
        uni.showModal({
          content: '确认删除该商品？',
          success: (res) => {
            if (res.confirm) {
              this.$refs.udb.remove(this._id, {
                success: () => uni.navigateBack()
              })
            }
          }
        })
      }
    }
  }
</script>

<style>
  .uni-container {
    padding: 15px;
  }

  .row {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .label {
    width: 80px;
    color: #999;
    font-size: 14px;
  }

  .value {
    flex: 1;
    font-size: 14px;
    color: #333;
  }

  .cover {
    width: 120px;
    border-radius: 6px;
  }

  .imgs,
  .tags,
  .skus {
    flex: 1;
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    flex-wrap: wrap;
  }

  .skus {
    flex-direction: column;
  }

  .img {
    width: 80px;
    height: 80px;
    margin: 0 6px 6px 0;
    border-radius: 4px;
  }

  .tag {
    margin: 0 6px 6px 0;
  }

  .sku {
    font-size: 14px;
    color: #333;
    padding: 2px 0;
  }

  .sku-old {
    margin: 0 4px;
    font-size: 12px;
    color: #999;
    text-decoration: line-through;
  }

  .btns {
    margin-top: 20px;
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
  }

  .btns button {
    flex: 1;
  }

  .btn-delete {
    margin-left: 10px;
  }
</style>
