# 特产小店 · uni-app 小程序骨架

基于 **uni-app（Vue3 + TypeScript）** 的微信小程序商城。**CLI / Vite 工程**，源码在 `src/`，用 npm 脚本构建。

## 目录结构

```
wxmall/
├── package.json         # 依赖 + npm 脚本
├── vite.config.ts       # Vite + uni 插件
├── tsconfig.json        # 路径别名 @/ → src/
├── index.html           # H5 入口
└── src/                 # 全部源码
    ├── main.ts          # Vue 实例入口
    ├── App.vue          # 应用入口，全局样式、onLaunch（预留登录）
    ├── manifest.json    # 应用配置（改 mp-weixin.appid 为你的小程序 AppID）
    ├── pages.json       # 页面路由 + 导航栏 + tabBar
    ├── uni.scss         # 全局主题变量（品牌红等）
    ├── pages/           # 页面（只展示，向数据层要数据）
    │   ├── index/index.vue   # 首页：搜索、Banner、分类、热销瀑布流
    │   └── detail/detail.vue # 商品详情：图片、价格、规格弹层、加购/购买
    ├── store/           # 全局状态单例（cart / user，Vue3 reactive）
    ├── data/            # 数据层（数据源接口 + mock/cloud 实现 + 假数据）
    ├── api/             # 后台接口（HTTP + uniCloud 两套，待实现）
    ├── utils/           # 工具（request.ts HTTP 封装）
    ├── types/           # 领域模型 + 响应协议
    └── config/          # 全局开关（USE_MOCK / backend / baseUrl）
```

> 数据层与状态层的详细约定见 `Architecture.md` 与 `数据层说明.md`。

## 运行

前提：装 Node.js（带 npm）。首次或换电脑后先装依赖：

```bash
npm install               # 还原 node_modules（不进 Git）
```

常用命令（见 `package.json`）：

```bash
npm run dev:mp-weixin     # 编译微信小程序到 dist/dev/mp-weixin（热更新）
npm run build:mp-weixin   # 生产构建
npm run dev:h5            # H5 预览
npm run type-check        # vue-tsc 类型检查
```

微信小程序预览/调试：用**微信开发者工具**打开编译产物目录 `dist/dev/mp-weixin`（Vite 只负责编译，预览靠微信开发者工具）。在 `src/manifest.json` 的「微信小程序」里填入你的 AppID（测试可留空用测试号）。

> IDE 不限：VS Code / WebStorm / HBuilderX 均可。构建产物 `dist/`、`node_modules/` 不进 Git，也不要手改。

## 已实现（骨架）

- 首页：搜索栏、轮播 Banner、分类快捷入口、热销商品两列瀑布流，点击商品跳详情。
- 详情页：图片轮播、价格/划线价、标签、规格选择底部弹层、数量步进、加购/立即购买按钮。
- 数据层：mock / cloud 双实现，页面统一走 `db`；购物车、用户状态走 `store` 单例。数据当前全部走本地 mock（见 `src/data/mock/`）。

## 待接入（TODO，已在代码中标注）

- `store/user.ts`：`silentLogin` 用 `uni.login` 的 `code` 调后台换 token。
- `api/index.ts`：实现 uniCloud 云函数 `shop`（banners/categories/products/productDetail 等 action）。
- 订单、地址：`IDataSource` 已留可选方法，补实现即可。
- 微信支付、收货地址、订单中心、发货/自提等按 PRD 逐步补充。
- 切换到真实后台：只改 `src/config/index.ts` 的 `USE_MOCK` / `backend`，页面代码不动。

主题色统一在 `src/uni.scss`（`$brand: #e64340`），改一处即可全局换色。
