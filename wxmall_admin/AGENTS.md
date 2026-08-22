# AGENTS.md

本文件为 Codex (Codex.ai/code) 在本仓库工作时提供指引。

## 项目概述

**wxmall_admin** —— 「特产小店」微信小程序商城的**后台管理系统**，基于 **uni-admin 2.6.2**（Vue3，H5 后台）。与同级目录 `../wxmall`（前端小程序，uni-app Vue3 + TS + Vite）配对，单人开发项目。

- 底座：uni-admin 官方模板（用户/角色/权限/菜单管理、uni 统计、短信、升级中心内置可用）。
- 云端：**uniCloud 支付宝云**（`uniCloud-alipay/`），与 wxmall **绑定同一个服务空间**（空间已创建，本项目已关联；wxmall 侧待关联）。
- 当前状态：模板刚初始化，商城业务功能待开发。

## 整体架构（前后台如何咬合）

```
  微信小程序 (../wxmall)                 管理后台 (本项目, H5)
  uni-app Vue3+TS, USE_MOCK 开关          uni-admin + uni-id 登录
        │ 只读                                  │ 读写
        ▼                                       ▼
  云对象 shop（banner/分类/商品查询）      clientDB / schema2code 管理页
        └──────────── 同一个支付宝云服务空间・云数据库 ────────────┘
              tc-products / tc-categories / tc-banners（未来: 订单/地址表）
```

**读写分离约定**（wxmall 侧已定，本项目必须遵守）：

1. 前端**只读**：小程序只通过云对象 `shop` 读数据，且下发前剔除内部字段（`_id`/`onSale`/`createTime` 等）。
2. 后台**负责写**：商品增删改、上下架等全部由本项目经 schema 权限直连数据库完成——`tc-*` 表已配置 `create/update/delete: "'admin' in auth.role"`，依赖 uni-id 的角色体系，本项目开箱即满足，**不需要再写鉴权代码**。
3. **schema 唯一基准在 wxmall 仓库**（`../wxmall/uniCloud-alipay/database/`）。本项目只**参照/同步** wxmall 的表定义，**不反向修改**表结构；改表先改 wxmall，再同步过来。
4. **类型契约**：字段设计对齐 `../wxmall/src/types/index.ts`（Product/Category/Banner 已实现；Order/Address/CartItem 契约已定义、表待建）。

## 已拍板的架构决策

- 两项目共用同一支付宝云服务空间（已创建，admin 已关联）。
- schema 以 **wxmall 为基准**，admin 参照同步。
- wxmall 前端用户体系**迁移到 uni-id**（微信登录），小程序用户与后台管理员共用 `uni-id-users`。

## 构建与运行

**HBuilderX 工程**（非 CLI），无 npm 构建脚本。

- 运行：HBuilderX 打开本项目 → 运行到浏览器（Chrome）。H5 路由 hash 模式，base `/admin/`。
- 云端：云函数/schema 在 HBuilderX 中右键「上传部署」到关联的服务空间。
- 登录页为 `uni_modules/uni-id-pages` 的账号密码登录；管理员需在 `uni-id-users` 中具有 `admin` 角色。

## 目录职责

| 目录/文件 | 职责 |
|---|---|
| `admin.config.js` | 后台全局配置：登录/落地页、顶部导航、静态侧边菜单（业务菜单走云端动态菜单） |
| `pages.json` | 页面路由 + `topWindow`/`leftWindow` 布局 + `uniIdRouter` 登录拦截 |
| `pages/system/` | 内置系统管理：菜单、角色、权限、用户、应用、标签、日志 |
| `pages/uni-stat/` | uni 统计报表页（设备/用户/页面/事件/错误/订单） |
| `windows/` | 后台框架布局（顶栏 topWindow、侧栏 leftWindow） |
| `store/` | Vuex：app（导航菜单/主题）、user（当前管理员）、error |
| `js_sdk/uni-admin/` | uni-admin 核心插件（main.js 中注入） |
| `uni_modules/` | uni-id-pages、uni-upgrade-center、各 uni-ui 组件等 |
| `uniCloud-alipay/cloudfunctions/` | 云函数/云对象（模板内置：uni-stat、短信、升级中心、portal 等） |
| `uniCloud-alipay/database/` | schema + 索引 + 初始数据（uni-id / opendb / uni-stat 标准表；**商城 tc-\* 表从 wxmall 同步进来**） |

## 后台业务规划（来自 `../wxmall/ai-project/design/后台功能.txt`）

商品管理（增删改/上下架/库存/价格/图片）、分类管理、订单管理（待付款/待发货/已发货/已完成/退款 + 详情）、客户管理（昵称/电话/购买次数/累计消费）、物流管理（快递公司/单号）、营销活动、数据统计（uni-stat 复用）、系统设置、首页运营（轮播/推荐/热卖/新品/公告，不改代码即可更新）。

## 开发路线图

- **Phase 0 地基**：wxmall 关联同一服务空间 → 从 wxmall 同步 `tc-products`/`tc-categories`/`tc-banners` schema + 种子数据到本项目并上传部署 → 部署 wxmall 的 `shop` 云对象 → 前端 `USE_MOCK` 切 false 验证真实链路。
- **Phase 1 商品域管理**：用 HBuilderX **schema2code** 从 `tc-*` 生成 list/add/edit 管理页 → 在 `opendb-admin-menus` 配「商城管理」菜单组（商品/分类/Banner）→ 商品图片走 uniCloud 云存储 → 管理员赋 `admin` 角色验证写权限闭环。
- **Phase 2 用户与订单**：wxmall 接入 uni-id 微信登录（替换自研 silentLogin TODO）→ 按 wxmall 类型契约建 `tc-orders`/`tc-addresses` → admin 生成订单管理页（发货/退款状态流转）。
- **Phase 3 支付与运营**：uni-pay 接微信支付；复用 uni-stat / `uni-pay-orders` 做订单统计；营销活动。

## 约定与规范

- **修改最小化**：优先用 uni-admin 标准玩法（schema2code 生成页、clientDB 直连、opendb-admin-menus 动态菜单），不自造轮子、不改模板框架层（`js_sdk/uni-admin`、`windows/`、uni_modules 内置模块）。
- **业务表命名**：沿用 wxmall 的 `tc-` 前缀；业务管理页放 `pages/` 下独立分包（如 `pages/mall/`），不混入 `pages/system/`。
- **图片上传**：用 uniCloud 内置云存储；`App.vue` 中 ext-storage 的 `cdn.example.com` 是模板占位符，**不使用**。
- **注释**：中文注释。
- **参考资料**：前端约定 `../wxmall/AGENTS.md`；架构与数据层 `../wxmall/ai-project/docs/`；PRD/原型/功能清单 `../wxmall/ai-project/design/`。
