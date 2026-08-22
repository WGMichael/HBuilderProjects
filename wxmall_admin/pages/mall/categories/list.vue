<template>
  <view class="uni-container">
    <!-- 工具栏：搜索 + 新增 -->
    <view class="toolbar">
      <view class="search">
        <uni-easyinput v-model="keyword" placeholder="搜索分类名称" @confirm="doSearch" @clear="doSearch"></uni-easyinput>
      </view>
      <button type="primary" size="mini" @click="doSearch">搜索</button>
      <button type="primary" size="mini" @click="goAdd">+ 新增分类</button>
    </view>

    <unicloud-db ref="udb" v-slot:default="{data, loading, hasMore, error}" collection="tc-categories" field="_id,id,name,icon,sort" :where="where" :orderby="orderby" :page-size="50" :getcount="true" loadtime="manual" @load="onListLoad">
      <view v-if="error" class="error">{{ error.message }}</view>
      <view v-else>
        <uni-table border stripe emptyText="暂无分类数据">
          <uni-tr>
            <uni-th width="60" align="center">ID</uni-th>
            <uni-th width="70" align="center">图标</uni-th>
            <uni-th align="left">分类名称</uni-th>
            <uni-th width="80" align="center">排序</uni-th>
            <uni-th width="130" align="center">操作</uni-th>
          </uni-tr>
          <uni-tr v-for="item in data" :key="item._id">
            <uni-td align="center">{{ item.id }}</uni-td>
            <uni-td align="center">
              <image v-if="iconUrl(item.icon)" :src="iconUrl(item.icon)" class="thumb" mode="aspectFill"></image>
              <text v-else class="emoji">{{ item.icon }}</text>
            </uni-td>
            <uni-td>{{ item.name }}</uni-td>
            <uni-td align="center">{{ item.sort }}</uni-td>
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
        keyword: '',
        where: '',
        // 排序通过 unicloud-db 的 :orderby 属性传字符串，与小程序端一致（按 sort 升序）
        orderby: 'sort asc',
        // cloud:// fileID -> https 映射（getTempFileURL 转换结果，响应式）
        imgMap: {}
      }
    },
    onReady() {
      // uni-admin 推荐：manual 加载，onReady 手动触发首次查询
      this.$refs.udb.loadData()
    },
    onPullDownRefresh() {
      this.$refs.udb.loadData({ clear: true }, () => uni.stopPullDownRefresh())
    },
    onReachBottom() {
      this.$refs.udb.loadMore()
    },
    methods: {
      // 列表加载后：把 cloud:// 图标 fileID 批量转成可显示的 https
      async onListLoad(data) {
        const ids = (data || []).filter((i) => i.icon && i.icon.indexOf('cloud://') === 0).map((i) => i.icon)
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
      doSearch() {
        const kw = (this.keyword || '').trim()
        this.where = kw ? `/${kw}/.test(name)` : ''
      },
      isImageUrl(v) {
        return typeof v === 'string' && (v.indexOf('http') === 0 || v.indexOf('cloud://') === 0)
      },
      // 图标显示地址：cloud:// 用转换后的 https；http 直接用；其它(emoji/空)返回空 → 走文本显示
      iconUrl(icon) {
        if (!icon) return ''
        if (this.imgMap[icon]) return this.imgMap[icon]
        if (icon.indexOf('http') === 0) return icon
        return ''
      },
      del(item) {
        // unicloud-db 的 remove 自带确认框，不要再套 showModal（会双重确认导致删除被中断）
        this.$refs.udb.remove(item._id, {
          success: () => {
            uni.showToast({ icon: 'none', title: '删除成功' })
            // 同时删除云存储上的图标文件（兼容历史 https 数据）
            const fid = toFileID(item.icon)
            if (fid) {
              uniCloud.importObject('mall-file-co', { customUI: true }).deleteImages([fid]).catch((err) => console.warn('删除云端图片失败：', err))
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
    width: 36px;
    height: 36px;
    border-radius: 4px;
  }

  .emoji {
    font-size: 22px;
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
