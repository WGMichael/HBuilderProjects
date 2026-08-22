<template>
  <view class="uni-container">
    <!-- 工具栏：搜索 + 新增 -->
    <view class="toolbar">
      <view class="search">
        <uni-easyinput v-model="keyword" placeholder="搜索商品标题" @confirm="doSearch" @clear="doSearch"></uni-easyinput>
      </view>
      <button type="primary" size="mini" @click="doSearch">搜索</button>
      <button type="primary" size="mini" @click="goAdd">+ 新增商品</button>
    </view>

    <unicloud-db ref="udb" v-slot:default="{data, loading, hasMore, error}" :collection="collectionList" :where="where" :orderby="orderby" :page-size="20" :getcount="true" @load="onListLoad">
      <view v-if="error" class="error">{{ error.message }}</view>
      <view v-else>
        <uni-table border stripe emptyText="暂无商品数据">
          <uni-tr>
            <uni-th width="50" align="center">ID</uni-th>
            <uni-th width="60" align="center">封面</uni-th>
            <uni-th align="left">标题</uni-th>
            <uni-th width="90" align="center">分类</uni-th>
            <uni-th width="80" align="center">售价</uni-th>
            <uni-th width="60" align="center">库存</uni-th>
            <uni-th width="60" align="center">销量</uni-th>
            <uni-th width="70" align="center">上架</uni-th>
            <uni-th width="130" align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in data" :key="item._id">
            <uni-td align="center">{{ item.id }}</uni-td>
            <uni-td align="center">
              <image v-if="imgUrl(item.cover)" :src="imgUrl(item.cover)" class="thumb" mode="aspectFill"></image>
              <text v-else>{{ item.cover }}</text>
            </uni-td>
            <uni-td>{{ item.title }}<text v-if="item.isNew"> 🆕</text><text v-if="item.isHot"> 🔥</text></uni-td>
            <uni-td align="center">{{ catNames(item) }}</uni-td>
            <uni-td align="center">¥{{ item.price }}</uni-td>
            <uni-td align="center">{{ item.stock }}</uni-td>
            <uni-td align="center">{{ item.sold }}</uni-td>
            <uni-td align="center">
              <switch :checked="item.onSale" style="transform: scale(0.7)" @change="toggleSale(item, $event)"></switch>
            </uni-td>
            <uni-td align="center">
              <view class="row-ops">
                <button size="mini" @click="goEdit(item._id)">编辑</button>
                <button size="mini" type="warn" @click="del(item)">删除</button>
              </view>
            </uni-td>
          </uni-tr>
        </uni-table>
        <uni-load-more :status="loading ? 'loading' : (hasMore ? 'more' : 'noMore')"></uni-load-more>
      </view>
    </unicloud-db>
  </view>
</template>

<script>
  const db = uniCloud.database()
  // 把图片地址统一转成 cloud:// fileID（兼容历史存的 https 临时地址）
  function toFileID(u) {
    if (!u) return ''
    if (u.indexOf('cloud://') === 0) return u
    const m = u.match(/^https?:\/\/([\w-]+)\.[^/]+\/([^?]+)/)
    return m ? 'cloud://' + m[1] + '/' + m[2] : ''
  }
  export default {
    data() {
      return {
        // 联表 tc-categories 以显示分类名
        collectionList: [
          db.collection('tc-products').field('_id,id,title,subtitle,categoryId,categoryIds,cover,images,detailImages,price,oldPrice,sold,stock,isNew,isHot,onSale').getTemp(),
          db.collection('tc-categories').field('id, name as text').getTemp()
        ],
        keyword: '',
        where: '',
        // 排序通过 unicloud-db 的 :orderby 属性传字符串（按业务 id 升序）
        orderby: 'id asc',
        // cloud:// fileID -> https 映射（响应式）
        imgMap: {},
        // 分类 id -> name 映射（显示多分类名）
        catMap: {}
      }
    },
    onLoad() {
      this.loadCatMap()
    },
    onPullDownRefresh() {
      this.$refs.udb.loadData({ clear: true }, () => uni.stopPullDownRefresh())
    },
    onReachBottom() {
      this.$refs.udb.loadMore()
    },
    methods: {
      // 列表加载后：把 cloud:// 图片 fileID 批量转成可显示的 https
      async onListLoad(data) {
        const ids = (data || []).filter((i) => i.cover && i.cover.indexOf('cloud://') === 0).map((i) => i.cover)
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
      // 按标题模糊搜索（JQL 正则）
      doSearch() {
        const kw = (this.keyword || '').trim()
        this.where = kw ? `/${kw}/.test(title)` : ''
      },
      loadCatMap() {
        db.collection('tc-categories').field('id,name').get().then((r) => {
          const m = {}
          ;(r.result.data || []).forEach((c) => { m[c.id] = c.name })
          this.catMap = m
        }).catch(() => {})
      },
      // 显示商品的所有分类名（兼容旧数据只有单 categoryId 的情况）
      catNames(item) {
        let ids = item.categoryIds
        if (!ids || !ids.length) {
          const c = item.categoryId
          if (Array.isArray(c)) return (c[0] && c[0].text) || '-' // 联表返回的主分类
          ids = c != null ? [c] : []
        }
        const names = ids.map((id) => this.catMap[id]).filter(Boolean)
        return names.length ? names.join(' / ') : '-'
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
      toggleSale(item, e) {
        const val = e.detail.value
        db.collection('tc-products').doc(item._id).update({ onSale: val }).then(() => {
          item.onSale = val
          uni.showToast({ icon: 'none', title: val ? '已上架' : '已下架' })
        }).catch((err) => {
          uni.showModal({ content: err.message || '操作失败', showCancel: false })
          this.$refs.udb.loadData({ clear: true })
        })
      },
      del(item) {
        // unicloud-db 的 remove 自带确认框，不要再套 showModal（会双重确认导致删除被中断）
        this.$refs.udb.remove(item._id, {
          success: () => {
            uni.showToast({ icon: 'none', title: '删除成功' })
            // 同时删除该商品的所有云存储图片（封面 + 轮播 + 详情）
            const ids = []
            if (item.cover) ids.push(item.cover)
            ;(item.images || []).forEach((f) => ids.push(f))
            ;(item.detailImages || []).forEach((f) => ids.push(f))
            const cloudIds = ids.map(toFileID).filter(Boolean)
            if (cloudIds.length) {
              uniCloud.importObject('mall-file-co', { customUI: true }).deleteImages(cloudIds).catch((err) => console.warn('删除云端图片失败：', err))
            }
          }
        })
      },
      goAdd() {
        uni.navigateTo({
          url: './add',
          events: {
            refreshData: () => this.$refs.udb.loadData({ clear: true })
          }
        })
      },
      goEdit(id) {
        uni.navigateTo({
          url: './edit?id=' + id,
          events: {
            refreshData: () => this.$refs.udb.loadData({ clear: true })
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

  .toolbar {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    align-items: center;
    margin-bottom: 12px;
  }

  .search {
    flex: 1;
    margin-right: 8px;
  }

  .toolbar button {
    margin-left: 8px;
  }

  .thumb {
    width: 40px;
    height: 40px;
    border-radius: 4px;
  }

  .row-ops {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    justify-content: center;
  }

  .row-ops button {
    margin: 0 2px;
  }

  .error {
    padding: 20px;
    color: #dd524d;
  }
</style>
