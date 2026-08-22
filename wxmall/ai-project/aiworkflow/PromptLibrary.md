# PromptLibrary · 提示词库

> 单人 + AI 开发的杠杆点：把项目约定固化成可直接粘贴给 AI 的提示词。
> 用法：复制对应场景的提示词，替换 `<...>` 占位，粘给 AI。
> 前置：让 AI 先读 `Project Onboarding Workflow.md` 再干活，效果最好。

## 通用前缀（建议每次带上）

```
本项目是 uni-app(Vue3+TS) 微信小程序「特产小店」。铁律：
1) 页面只用 import { db } from '@/data' 取数据，不直接 import api/mock，不写 uni.request；
2) 全局状态只用 @/store 单例；
3) 新增数据方法先改 data/datasource.ts 的 IDataSource，再同步 mock-datasource 和 cloud-datasource 两端，签名一致；
4) 返回体用 ApiResult<T>，分页用 PageQuery/PageResult；
5) import 用 @/ 别名，页面用 <script setup lang="ts">。
先读 CLAUDE.md 和 ai-project/docs/数据层说明.md 再动手。
```

## 新增功能 / 接口

```
按数据层规范新增能力：<描述功能，如「按分类分页拉商品」>。
顺序：types → IDataSource 加方法签名 → mock 实现(补假数据) → cloud 实现(没后台就留 TODO) → 页面消费 db。
mock 和 cloud 两端签名必须一致。给出改动涉及的文件清单和每个文件的 diff。
```

## 新增页面

```
新增页面 <页面名，如 购物车 pages/cart/cart>。要求：
- 在 pages.json 注册路由（如需 tabBar 一并配）；
- <script setup lang="ts">，数据从 @/store 或 @/data 取；
- 样式复用 uni.scss 变量($brand 等)，风格对齐现有 index/detail 页；
- 交互按 ai-project/design/ 的 PRD，下单流程不超过 4 步。
```

## 重构（不改行为）

```
重构 <目标文件/模块>，目标：<如 抽出公共商品卡片组件>。
硬约束：对外行为不变，页面调用方式不变；改动藏在 db/IDataSource 边界后；
mock 输出前后一致。先说明重构方案再改，列出风险点。
```

## 修 Bug

```
Bug：<页面/操作/期望vs实际/报错>。
按 Bug Workflow：先判断 USE_MOCK 切换后是否复现以隔离前后端，再沿
页面→store→db→api/mock→types 定位到层，只做最小修复，说明根因。
```

## Review / 自查

```
Review 这段改动 <贴 diff 或文件>，对照项目 5 条铁律和 Review Workflow.md 清单，
指出违反约定或破坏数据层边界的地方，给修改建议。
```

## 对接后台（把 mock 换真数据）

```
准备把 <某接口/模块> 从 mock 切到后台(backend=<cloud|http>)。
- 给出 api/index.ts 里对应实现（uniCloud 云函数 shop 的 action 或 HTTP 路径）；
- 确认返回体符合 ApiResult<T> 和 types 模型；
- 不改页面和 IDataSource 签名；说明切换后需要验证的点。
```

## 生成 mock 数据

```
给 <模型名> 生成 N 条符合 types/index.ts 结构的 mock 数据，
主题是新疆/家乡特产，价格销量合理，放到 data/mock/index.ts。
```

---

> 维护建议：每当在实操中发现一句"对 AI 特别管用"的话，就补进这里。
