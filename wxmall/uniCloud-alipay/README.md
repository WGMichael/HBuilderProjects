# uniCloud 后端(阿里云)

特产小店的服务端。目录不参与小程序编译,由 HBuilderX / uniCloud CLI 上传到云端。

## 目录结构

```
uniCloud-aliyun/
├── database/                     云数据库
│   ├── tc-categories.schema.json 分类表(结构 + uni-admin 权限)
│   ├── tc-products.schema.json   商品表(含 onSale 上下架、createTime)
│   ├── tc-banners.schema.json    轮播表
│   └── db_init.json              种子数据(对齐前端 mock,一键初始化)
└── cloudfunctions/
    └── shop/                     商城云对象(小程序只读接口)
        ├── index.obj.js          banners/categories/hotProducts/products/productDetail
        └── package.json
```

数据流:`页面 → src/data(db) → CloudDataSource → src/api(importObject('shop')) → 云对象 shop → 云数据库`

## 首次接入操作清单(在 HBuilderX 里做,CLI 无法代劳)

> 前提:用 **HBuilderX** 打开本工程(HBuilderX 可直接打开 CLI 工程)。

1. **开通服务空间**
   - HBuilderX 顶部菜单 → 「uniCloud」→「创建云开发环境/服务空间」。
   - 服务商选 **阿里云**(与本目录 `uniCloud-aliyun` 对应),按引导创建(可选免费版)。

2. **关联服务空间到本项目**
   - 右键项目里的 `uniCloud-aliyun` 目录 →「关联云服务空间或项目」→ 选刚创建的空间。
   - 关联后 HBuilderX 会自动把 spaceId 注入运行时,`manifest.json` 无需手填。

3. **上传数据库 Schema**
   - 右键 `uniCloud-aliyun/database` →「上传所有 DB Schema」(或逐个 schema 右键上传)。
   - 上传后云端会按 schema 建好 3 张表及权限。

4. **初始化种子数据**
   - 右键 `database/db_init.json` →「初始化云数据库」。
   - 会写入分类/轮播/商品的示例数据并建好唯一索引(id)。
   - ⚠️ 重复执行会追加数据,只需在数据为空时执行一次。

5. **上传云对象**
   - 右键 `cloudfunctions/shop` →「上传部署」。

6. **本地联调(可选)**
   - 右键 `cloudfunctions/shop` →「运行/本地运行」,或直接连云端调试。

7. **切换前端数据源到云端**
   - 打开 `src/config/index.ts`:
     - `USE_MOCK: false`(从本地 mock 切到真实云数据)
     - `backend: 'cloud'`(已是默认)
   - 重新 `npm run dev:mp-weixin`,用微信开发者工具打开 `dist/dev/mp-weixin` 验证首页/分类/详情读到云端数据。

## 商品后台配置(uni-admin)

商品的新增/编辑/上下架/库存/价格通过 **uni-admin** 后台完成(单独的 admin 工程):

1. 从 DCloud 插件市场导入 uni-admin 工程,关联**同一个**阿里云服务空间。
2. 在 uni-admin 里「根据 schema 生成页面」,分别对 `tc-products`、`tc-categories`、`tc-banners` 生成列表/新增/编辑页,即得到商品管理后台。
3. schema 里的 `permission` 已限制:读公开、增删改需 `admin` 角色 —— 用 uni-admin 的管理员账号登录即可操作。

> 说明:小程序端只读,写操作全部走后台,权限由 DB schema 统一约束,云对象无需写接口。

## 字段与前端契约

表字段严格对齐 `src/types/index.ts`。商品表额外的 `onSale`(上下架)、`createTime` 属于后台/云端内部字段,云对象在返回前会剔除,前端拿到的结构与 `Product` 类型一致。
