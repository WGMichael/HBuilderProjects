# AGENTS.md

本文件为 Codex (Codex.ai/code) 在本仓库工作时提供指引。

## 项目概述

**特产小店(wxmall)** —— 一个「宝妈家乡特产」**微信小程序商城**,基于 **uni-app + Vue3 + TypeScript**。单人开发项目。

- 技术栈:uni-app(Vue3 + TS)、状态用 Vue3 `reactive` 单例(**非 Pinia**)、计划接入 uniCloud 后端 + uni-admin 后台(见 `ai-project/docs/Architecture.md`)。
- 主题:品牌红 `#e64340`,竖屏商城。
- 当前状态:骨架阶段,数据全部走本地 mock,后台接口预留但未实现。

## 构建与运行

**本项目为 CLI / Vite 工程(uni-app Vue3),源码在 `src/`,用 npm 脚本构建。**

前提:装 Node.js(带 npm)。首次或换电脑后先装依赖:

```bash
npm install            # 还原 node_modules(不进 Git)
```

常用命令(见 `package.json`):

```bash
npm run dev:mp-weixin    # 编译微信小程序到 dist/dev/mp-weixin(热更新)
npm run build:mp-weixin  # 生产构建
npm run dev:h5           # H5 预览
npm run type-check       # vue-tsc 类型检查
```

微信小程序预览/调试:用**微信开发者工具**打开编译产物目录 `dist/dev/mp-weixin`(Vite 只负责编译,预览靠微信开发者工具)。

> - IDE 不限:VS Code / WebStorm / HBuilderX 均可(HBuilderX 也能直接打开 CLI 工程运行)。
> - 依赖版本已协调锁定:所有 `@dcloudio/*` 用同一 alpha 版本,`vite` 锁 `5.2.8`,`vue` `3.4.21`;升级用 `npx @dcloudio/uvm`。
> - 构建产物 `dist/`、`unpackage/` **不要编辑**,也不进 Git。

## 架构:数据层协议(最重要的约定)

数据流向:**页面 → `db` / `store` → 数据源接口 → mock 或后台**。核心思想是页面永远不知道数据来自哪里,后台就绪时只改一个开关即可无感切换。

```
pages/*.vue          只负责展示,向数据层要数据
   │
   ├── store/        全局状态(购物车/用户),Vue3 reactive 单例
   │
   └── data/         数据层:对外只暴露一个 db
        ├── datasource.ts       IDataSource 接口 = 前后端「协议」
        ├── mock-datasource.ts  本地假数据实现
        ├── cloud-datasource.ts 后台实现(调用 api/)
        ├── mock/index.ts       假数据(结构对齐后台表)
        └── index.ts            按 config.USE_MOCK 选实现,导出 db
             │
        api/index.ts     后台接口(uniCloud 云函数 / HTTP 两套实现)
        utils/request.ts HTTP 封装(uni.request → Promise)
        types/index.ts   领域模型 + ApiResult 统一响应协议
        config/index.ts  开关:USE_MOCK / backend / baseUrl
```

### 必须遵守的约定

1. **页面取数据只用 `db`**(`import { db } from '@/data'`),**绝不**在页面里直接 import `api/`、`mock/` 或写 `uni.request`。
   ```ts
   const products = await db.getHotProducts()
   const detail   = await db.getProductDetail(101)
   ```
2. **全局状态只用 store 单例**(`import { cartStore, userStore } from '@/store'`)。store 是 Vue3 `reactive` 封装的单例对象,不是 Pinia;`computed` 值通过 `.value` 读取(如 `cartStore.totalPrice.value`)。
3. **新增数据接口**:先在 `data/datasource.ts` 的 `IDataSource` 里加方法,再分别在 `mock-datasource.ts` 和 `cloud-datasource.ts` 实现,保证两端签名一致。
4. **切换数据源只改 `config/index.ts`**:`USE_MOCK`(true=mock/false=后台)、`backend`(`'cloud'`=uniCloud / `'http'`=传统接口)。页面代码一行都不用动。
5. **类型是前后端契约**:领域模型统一在 `types/index.ts`,后台建表尽量字段对齐。所有接口返回包裹 `ApiResult<T>`(`code=0` 成功,`data` 为业务数据);分页统一用 `PageQuery` / `PageResult<T>`。

## 约定与规范

- **路径别名**:`@/*` → `src/`(见 `tsconfig.json`,Vite 侧由 uni 插件自动指向 src)。import 一律用 `@/xxx`,不用相对路径爬层级。
- **TypeScript**:`strict: true`;uni 全局类型来自 `@dcloudio/types`。
- **主题样式**:全局变量集中在 `uni.scss`(`$brand: #e64340` 等),改一处全局换色;`App.vue` 里有 `.brand-color`/`.ellipsis` 等公共 class。
- **页面写法**:页面用 `<script setup>` + `@dcloudio/uni-app` 的生命周期钩子(`onLoad` / `onPullDownRefresh` 等);`App.vue` 用 `defineComponent` Options 写法。
- **页面样式必须 `scoped`**:所有页面的 `<style>` 一律写成 `<style lang="scss" scoped>`。H5 是单页应用,不加 scoped 会导致同名 class(如各页都用的 `.page`)全局互串、页面切换时样式被污染。公共样式放 `App.vue`(全局)或 `uni.scss`(变量),页面内只写自身私有样式。
- **注释**:中文注释,风格见现有文件(每个模块顶部有职责说明块)。
- **登录**:微信静默登录在 `store/user.ts` 的 `silentLogin()`,目前 mock 阶段发放演示会员;TODO 用 `uni.login` 的 `code` 调后台换 token。

## 目录职责

> 所有源码在 `src/` 下;`@/` 别名指向 `src/`。工程配置(`package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`)在根目录。

| 目录 | 职责 |
|---|---|
| `src/` | 全部源码根目录(`main.ts` 入口、`App.vue`、`manifest.json`、`pages.json`、`uni.scss`) |
| `src/pages/` | 页面(index 首页、detail 商品详情),`pages.json` 配路由/导航/tabBar |
| `src/store/` | 全局状态单例(cart / user) |
| `src/data/` | 数据层(数据源接口 + mock/cloud 实现 + 假数据) |
| `src/api/` | 后台接口定义(HTTP + uniCloud 两套) |
| `src/utils/` | 工具(`request.ts` HTTP 封装) |
| `src/types/` | 领域模型 + 响应协议 |
| `src/config/` | 全局运行配置与开关 |
| `ai-project/` | 项目资料(不参与编译),下含 docs/design/aiworkflow |
| `ai-project/docs/` | 技术文档(架构、数据层说明) |
| `ai-project/design/` | 产品设计(PRD、原型 HTML、功能清单) |
| `ai-project/aiworkflow/` | AI 工作流规范(Feature/Bug/Review/Onboarding/PromptLibrary 等,见其 README) |


## 待接入(代码中已标 TODO)

- `api/index.ts`:实现 uniCloud 云函数 `shop`(banners/categories/products/productDetail 等 action)。
- `store/user.ts`:`silentLogin` 用 `res.code` 调后台换 token。
- 订单、地址:`IDataSource` 已留可选方法,补实现即可。
- 微信支付、收货地址、订单中心等按 `ai-project/design/` 里的 PRD 逐步补充。
- UI 组件库 uv-ui:按需在 `pages.json` 的 `easycom` 引入。
