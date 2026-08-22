# uni-admin + uniCloud 后台开发实践笔记

> 适用范围：**uni-admin 2.x**（Vue3，HBuilderX 工程）+ **uniCloud**（aliyun/alipay/tcb）后台管理开发。
> 内容来自实际踩坑，跨项目通用。每条尽量给出「现象 → 原因 → 正确写法」。

---

## 1. `unicloud-db` 查询：单表 vs 联表（最容易踩的坑）

### ❌ 现象
页面加载报 `e.split is not a function`，堆栈常指向 `uni-cloud.es.js` 或 **`leftWindow.vue`**（极具迷惑性，让人误以为是菜单/路由问题，实际是 clientDB 查询报错冒泡上来的）。

### 原因
`unicloud-db` 的 `:collection` 传了**单元素 `getTemp()` 数组**做单表查询，会走 clientDB 内部的联表序列化路径，对字段做 `split` 时因缺少联表结构而崩。

### ✅ 正确写法

**单表查询** —— 用字符串 collection + `field` 属性，不要用 getTemp：
```html
<unicloud-db ref="udb"
  collection="tc-categories"
  field="_id,id,name,icon,sort"
  :where="where"
  :orderby="orderby"
  :page-size="50"
  :getcount="true"
  loadtime="manual"
  v-slot:default="{data, loading, hasMore, error}">
  ...
</unicloud-db>
```

**联表查询**（需要显示关联表字段，如商品列表显示分类名）—— 才用 `getTemp()` 数组：
```js
collectionList: [
  db.collection('tc-products').field('_id,id,title,categoryId,price').getTemp(),
  db.collection('tc-categories').field('id, name as text').getTemp()
]
```
```html
<unicloud-db :collection="collectionList" ...>
```
联表后，主表外键字段会变成数组，如 `item.categoryId → [{ id, text }]`，取值 `item.categoryId?.[0]?.text`。

> 参照物：能正常工作的官方页 `pages/system/role/list.vue`（联表）、`pages/system/safety/list.vue`。遇到 clientDB 诡异报错，先对着它抄。

---

## 2. 排序 `orderby`：用组件属性，不要用链式两参数

### ❌ 错误
```js
db.collection('x').orderBy('sort', 'asc').getTemp()   // 报 e.split is not a function
```
这个版本的 clientDB 链式 `orderBy` 两参数会出问题。

### ✅ 正确
通过 `unicloud-db` 组件的 **`:orderby` 属性传字符串**，格式 `'字段 方向'`：
```html
<unicloud-db :orderby="orderby" ...>
```
```js
data() { return { orderby: 'sort asc' } }   // 或 'create_date desc'
```

---

## 3. 加载时机：`loadtime="manual"` + onReady 手动触发

uni-admin 官方页统一用**手动加载**，比自动加载稳定：
```html
<unicloud-db ref="udb" loadtime="manual" ...>
```
```js
onReady() {
  this.$refs.udb.loadData()
}
```
翻页/搜索/删除后刷新：`this.$refs.udb.loadData({ clear: true })`。

---

## 4. schema2code 生成页的改造清单

schema2code 能生成 list/add/edit/detail 骨架，但**生成质量有限**，几乎都要改：

| 生成的问题 | 改法 |
|---|---|
| **列表页只显示 `{{item._id}}`** | 手动改成展示业务字段（标题/价格/图片缩略图等） |
| **数组字段（图片组）用了 `uni-data-checkbox`** | 图片改 `uni-file-picker` 上传；普通字符串数组改标签输入等 |
| **对象数组（如 SKU）用了 `uni-data-checkbox`** | 手写子表编辑组件（逐行增删，每行对应对象字段） |
| **图片字段是纯文本框（填 URL）** | 改 `uni-file-picker` 传 uniCloud 云存储 |
| **外键字段** | 若 schema 写了 `enum.collection`，会自动生成 `uni-data-picker` 下拉（这个生成对了，保留） |

---

## 5. 常用模式代码片段

### 5.1 业务数字 id 自增（clientDB 无自增，前端查 max+1）
单人/低并发后台够用；高并发需改用计数器表：
```js
async submitForm(value) {
  const maxRes = await db.collection('tc-products').orderBy('id', 'desc').field('id').limit(1).get()
  const rows = maxRes.result.data
  value.id = ((rows && rows[0] && rows[0].id) || 0) + 1
  await db.collection('tc-products').add(value)
}
```
> 注意：这里的 `.orderBy('id','desc')` 是 **clientDB 的 `.get()` 链式查询**（非 unicloud-db 组件），两参数在 `.get()` 场景可用；坑只在组件 `:collection` 的 getTemp 链上。

### 5.2 图片：库里存字符串 URL 数组 ↔ uni-file-picker 对象数组
`uni-file-picker` 的 v-model 是 `[{name,url}]`，而库里存 `["url1","url2"]`，需转换：
```js
// 用独立变量绑定 file-picker，不直接绑 formData
data() { return { imagesFiles: [] } }
// 编辑回显（getDetail 后）
this.imagesFiles = (data.images || []).map((u, i) => ({ name: 'img-'+i, url: u }))
// 提交时提取
value.images = this.imagesFiles.map(f => f.url)
// 单图
value.cover = this.coverFiles.length ? this.coverFiles[0].url : ''
```
```html
<uni-file-picker v-model="imagesFiles" file-mediatype="image" mode="grid" :limit="9"></uni-file-picker>
```

### 5.2.1 图片按目录归档（云存储"文件夹"）
`uni-file-picker` 支持 **`dir`** 属性指定云存储子目录（**注意 prop 名是 `dir`，不是 `dir-path`**——源码 props 里声明的是 `dir`，watch 后才赋给内部变量 `this.dirPath`；传错名会被静默忽略、图片落到根目录）。最终 `cloudPath = dir + 文件名_时间戳.ext`。uniCloud 云存储底层是对象存储（OSS），本身扁平无文件夹，但 cloudPath 里的 `/` 会在控制台呈现为**虚拟目录层级**，可用来按分类等归档整理：
```html
<uni-file-picker :dir="imgDir" ...></uni-file-picker>
```
```js
computed: {
  imgDir() {  // 分类名等作目录名时要清理非法字符
    const cat = (this.categoryName || '未分类').replace(/[\s\/\\?<>:*|"]/g, '_')
    return 'products/' + cat + '/'
  }
}
```
注意：① 目录名依赖的值（如分类名）要在**上传前**拿到——新增时在选择器 `@change` 记录，编辑回显时额外查询补上；② 编辑时改了分类，旧图仍留在旧目录（对象存储不自动搬移）；③ 只影响整理美观，对前端读图（完整 URL）零影响。

### 5.2.2 删除云存储文件：必须走云函数/云对象
`uni-file-picker` 点删除（X）只从列表移除本地项，**不删云端文件**，会残留孤儿图。而 `uniCloud.deleteFile` **只能在云函数/云对象里调用，客户端不能直接删**（安全限制）。做法：建一个云对象代理删除，页面监听 `@delete` 调它。
⚠️ **云对象是公开网络接口，必须独立鉴权**：spaceId 和云对象名会暴露在前端编译产物里，攻击者可绕过后台页面直接调用。前端页面的登录拦截（`uniIdRouter`）挡不住这种调用——服务端每个接口都要自己校验 token + 角色（不信任客户端）。用 `uni-id-common` 校验（package.json 依赖 `"uni-id-common": "file:../../../uni_modules/uni-id-common/uniCloud/cloudfunctions/common/uni-id-common"`）：
```js
// 云对象 mall-file-co/index.obj.js
const uniID = require('uni-id-common')
module.exports = {
  _before() {
    this.uniID = uniID.createInstance({ clientInfo: this.getClientInfo() })
  },
  async deleteImages(fileList) {
    const payload = await this.uniID.checkToken(this.getUniIdToken())
    if (payload.errCode) throw new Error('登录已失效')
    if (!payload.role || payload.role.indexOf('admin') === -1) throw new Error('无权限')
    if (!Array.isArray(fileList) || !fileList.length) return { errCode: 0 }
    return { errCode: 0, result: await uniCloud.deleteFile({ fileList: fileList.filter(Boolean) }) }
  }
}
```
（前端 `importObject` 调用会自动携带已登录用户的 uni-id token，admin 正常使用无感；只有未登录/非 admin 的直接调用被拒。）
```js
// 页面：uni-file-picker 的 @delete 事件返回 { index, tempFile, tempFilePath }
onDeleteImage(e) {
  const f = (e && e.tempFile) || {}
  const fid = f.fileID || f.url || (e && e.tempFilePath)   // 阿里云 fileID 即 https url
  if (!fid) return
  uniCloud.importObject('mall-file-co', { customUI: true }).deleteImages([fid]).catch(console.warn)
}
```
注意：① 云对象需在 HBuilderX **上传部署**才生效；② 编辑时删掉已保存的图后若不提交表单，会造成 DB 里的 URL 引用失效。

### 5.2.3 数据库存 fileID（cloud://），不要存临时 https ⚠️
uni-file-picker 上传后 `tempFile` 里同时有 `url`（展示地址）和 `fileID`（`cloud://...`）。**私有读云存储的 url 是带签名的临时地址**（形如 `?expire_at=..&er_sign=..`，有效期可能仅几分钟），存进数据库会过期、图片失效；且删除时不可用（`deleteFile` 需要 fileID，传 https 会被拼成错误的 cloud:// 路径、删不到文件）。所以：
- **提交存 fileID**：`value.cover = f.fileID || f.url`
- **编辑回显**：把 `cloud://` 传给 uni-file-picker 的 v-model，`setValue` 会自动 `getTempFileURL` 转 https 展示、并保留 fileID（删除就正常了）——组件自动，无需手写
- **列表/详情展示、以及云对象给前端下发**：`cloud://` 不能直接 `<image>`，用 `uniCloud.getTempFileURL({ fileList: [...] })` 批量转 https
```js
const res = await uniCloud.getTempFileURL({ fileList: ids })   // ids 是 cloud:// 数组
const map = {}; res.fileList.forEach(f => { map[f.fileID] = f.tempFileURL })
item.cover = map[item.cover] || item.cover
```
- 前端拿到的是临时 https，但每次请求都重新获取，即时有效；若要永久 https，把云存储设为公共读。

### 5.2.4 H5 图片上传的可靠姿势（支付宝云重点踩坑）
在 **H5 + 支付宝云**环境，`uni-file-picker` 自动上传拿不到 fileID（组件取 `res.fileID` 但值为空），且 `uniCloud.uploadFile` 常常**上传成功却 Promise 误 reject**（文件已进云存储，却抛 `uploadFile:fail`）。别再依赖组件自动上传，改用「提交时手动上传」：
1. **选图只本地预览、不上传**：`uni.chooseImage` 拿 `tempFilePaths[0]`（blob）作预览（H5 的 blob 可直接 `<image :src>`），点提交时才传。
2. **提交时上传，且不依赖 uploadFile 的返回**：`cloudPath` 自己定（如 `'types/' + Date.now() + '.png'`），据此拼出 fileID = `'cloud://' + 环境ID + '/' + cloudPath`。
3. **用 `getTempFileURL` 验证文件是否真在**：能转出 `tempFileURL` 就判定成功 → 写库；否则算失败、不写库。这样绕开"假 reject"。
4. `filePath` **只能是字符串 blob**，传 File 对象会报 `filePath.indexOf is not a function` 或 `Expected String got File`。
5. **删除记录 / 换图 / 移除图**时，把旧图 fileID 交给删除云对象（`mall-file-co`）一并删掉，避免孤儿图。
```js
// 提交时上传的核心
const cloudPath = 'types/' + Date.now() + '.png'
const guessFileID = 'cloud://' + ENV_ID + '/' + cloudPath
try { const up = await uniCloud.uploadFile({ filePath: localBlobPath, cloudPath }); finalIcon = up?.fileID || guessFileID }
catch (e) { finalIcon = guessFileID }   // 假 reject，仍用拼接的
const t = await uniCloud.getTempFileURL({ fileList: [finalIcon] })  // 验证文件确实在
if (t.fileList?.[0]?.tempFileURL) { /* 写库 */ } else { /* 失败 */ }
```

### 5.3 数字字段提交前转 Number
`uni-easyinput type="number"` 在 H5 可能返回字符串，schema `double/int` 校验或存库会出问题，提交前兜底：
```js
['price','oldPrice','sold','stock'].forEach(k => {
  if (value[k] === '' || value[k] == null) delete value[k]   // 交给 schema 默认值
  else value[k] = Number(value[k])
})
```

### 5.4 列表行内开关即时切换（如上下架/启用）
```js
toggle(item, e) {
  const val = e.detail.value
  db.collection('tc-products').doc(item._id).update({ onSale: val }).then(() => {
    item.onSale = val
  })
}
```

### 5.5 删除：`unicloud-db.remove` 自带确认框，别再套 showModal
`remove` 方法**本身会弹确认框**。若外面再套一层 `uni.showModal`，会变成**双重确认**——用户点完第一个框，组件又弹第二个，没点第二个删除就不执行，表现为「点了删除但数据没删」。正确写法（同官方 `pages/system/*/list.vue`）：
```js
del(id) {
  this.$refs.udb.remove(id, {
    success: () => { uni.showToast({ icon: 'none', title: '删除成功' }) }
  })
}
```
删除成功后组件会自动从列表移除该项，无需手动 `loadData`。

### 5.6 提交表单：别用 uni-forms `validate()` 的返回值，直接用 `this.formData` ⚠️
`this.$refs.form.validate().then(value => ...)` 回调里的 `value` **常和页面输入不同步**（拿到的是初始值），导致存库字段为空/0（title 空、price/stock=0 就是这么来的）。`validate()` 只用来触发校验，**提交数据直接用页面的 `this.formData`**（v-model 的实时值）：
```js
this.$refs.form.validate().then(() => {
  const value = Object.assign({}, this.formData)   // ← 用页面实时值，不用回调的 value
  // ...补图片 fileID / 自增 id 等，再 add/update
})
```

### 5.7 自定义子组件输入同步：用深度 watch，别用 `@input`
自定义组件（如 SKU 编辑器）里给 `uni-easyinput` 加 `@input="emitChange"`，`emitChange` 会在 `v-model` 更新**之前**触发，emit 出旧值（表现为填了规格名/价格却存成空）。改成**深度 watch** 内部数据，值真正变完再 emit：
```js
watch: {
  rows: { deep: true, handler() { this.$emit('update:modelValue', this.toOutput()) } }
}
// 模板里的 uni-easyinput 去掉 @input
```

---

## 6. 动态菜单 `opendb-admin-menus`

- 侧边栏（`windows/leftWindow.vue`）从云端表 `opendb-admin-menus` 读菜单，**不是**改本地 `init_data.json`（那只在表为空时导入一次）。
- **加菜单**：进后台「系统管理 → 菜单管理」界面新增记录（直接写云端表），刷新即生效。
- 字段：`menu_id`（唯一字符串）、`name`、`url`（页面绝对路径 `/pages/xxx/list`，父级分组留空）、`parent_id`（填父级 menu_id）、`icon`、`sort`、`enable`。
- 菜单是登录后一次性拉取，改完**刷新页面**才更新。
- 业务页放独立分包（如 `pages/mall/`），不要混进 `pages/system/`。

---

## 7. 调试方法论（这次踩坑的教训）

1. **看完整报错堆栈定位文件行**：`e.split is not a function` 堆栈指向 `leftWindow.vue`，一度以为是菜单问题，其实是 clientDB 查询报错。别被最外层堆栈帧误导，要看触发源。
2. **加"调试标记"确认编译是否生效**：改 `.vue` 后热更新有时不生效。在页面顶部临时加一行醒目文字，重新「运行到浏览器」后看它是否出现，能快速区分"代码问题"还是"没重新编译"。
3. **对照官方能跑的页**：uni-admin 的 `pages/system/*/list.vue` 是验证过的模板，写法拿不准时直接对比抄。
4. **区分是哪个页面报的**：先访问一个原生页（如 `#/pages/system/menu/list`）确认是全局问题还是某页特有，快速缩小范围。
5. **HBuilderX 工程无 CLI**：uni-admin 是 HBuilderX 工程（`package.json` 无 dev 脚本），只能用 IDE「运行到浏览器」，不能 `npm run dev`。

---

## 8. 其他约定

- **不改模板框架层**：`js_sdk/uni-admin`、`windows/`、`uni_modules` 内置模块尽量别动。
- **图片上传**用 uniCloud 内置云存储；模板里 ext-storage 的 `cdn.example.com` 是占位符，不用。
- **uni-id 登录模块**不在 `cloudfunctions/`，而在 `uni_modules/uni-id-pages`（含云对象 `uni-id-co`）、`uni-id-common`、`uni-config-center`。账号/角色/菜单等"后台架构数据"都存在**云数据库**里，需上传部署对应 schema。
