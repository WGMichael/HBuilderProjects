# Project Onboarding Workflow · 接手/开工前对齐

> 用途：任何人（或每一次新的 AI 会话）开始动这个项目前，按此顺序读一遍，5 分钟对齐上下文，避免破坏既有约定。

## 快速上手清单（按顺序）

1. **`CLAUDE.md`（根目录）** —— 项目全貌、最重要的架构约定、目录职责。先读这个。
2. **`ai-project/docs/Architecture.md`** —— 技术栈全景：uni-app(Vue3+TS) + uniCloud + uni-admin + uv-ui。
3. **`ai-project/docs/数据层说明.md`** —— 数据层怎么用、怎么切后台。
4. **`src/config/index.ts`** —— 看 `USE_MOCK` / `backend`，确认**当前数据从哪来**（现在是本地 mock）。
5. **`src/types/index.ts`** —— 领域模型和 `ApiResult` 协议，理解数据长什么样。
6. **跑起来** —— CLI/Vite 工程：`npm install` → `npm run dev:mp-weixin` → 用微信开发者工具打开产物 `dist/dev/mp-weixin`（`manifest.json` 里填微信 AppID，测试可空）。IDE 不限。

## 一分钟心智模型

```
页面(pages) 只展示，向 db 要数据
     ↓
store 全局状态(购物车/用户，Vue3 reactive 单例)
data 数据层：对外只有一个 db；内部 mock / cloud 两套实现按 USE_MOCK 切换
api / utils / types / config 支撑数据层
```

**一句话**：页面永远不知道数据来自 mock 还是后台；换后台只改 `config` 一个开关。

## 现状与边界（避免误判）

- 阶段：**骨架期**，数据全走本地 mock，后台接口预留但未实现（`api/` 里是 TODO）。
- 构建：**CLI / Vite 工程**，源码在 `src/`，用 `npm run dev:mp-weixin` 等脚本（见 `package.json`）；换电脑先 `npm install`。IDE 不限（VS Code / HBuilderX 均可）。
- 已完成页面：首页 `pages/index`、商品详情 `pages/detail`。
- 未做：购物车页、确认订单、支付、地址、订单中心、后台（uni-admin）。
- 单人项目，无 CI、无单测框架，测试靠微信开发者工具手动走查。

## 开工前问自己三句

1. 我要动的功能属于哪一层？（见 `Feature Workflow.md` 的定位表）
2. 会不会破坏「页面只用 `db` / `store`」这条铁律？
3. 如果动了数据方法，mock 和 cloud 两端签名同步了吗？
