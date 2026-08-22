# Bug Workflow · 缺陷修复工作流

> 目标：最小改动修复，不牵连其它层。善用本项目的 mock 开关做隔离。

## 流程

```
复现 → 用 USE_MOCK 隔离前后端 → 定位到层 → 最小修复 → 回归
```

## 1. 复现

- 记录：页面、操作步骤、期望 vs 实际、报错信息（微信开发者工具 Console）。
- 能稳定复现再动手；偶发的先加日志。

## 2. 用 `USE_MOCK` 隔离（本项目专属技巧）

- 当前是哪种数据源？看 `config/index.ts` 的 `USE_MOCK`。
- 若 `USE_MOCK:false` 出错 → 切 `true` 再试：
  - mock 也错 → 问题在**前端**（页面/store/数据层逻辑/类型）。
  - mock 正常 → 问题在**后台或 api 层**（`api/index.ts` / 云函数 / 网络）。
- 这一步能快速把排查范围砍一半。

## 3. 定位到层

按数据流顺查：`页面渲染 → store → db(datasource) → api/mock → types`。

常见对应：

- 页面报 `undefined` / 渲染错位 → 页面或 `computed`，或数据结构和 `types` 不符。
- 加购/合计不对 → `store/cart.ts`。
- 切换数据源就崩 → mock 与 cloud **签名不一致**（重点怀疑）。
- 请求 401/网络 → `utils/request.ts` / token / `baseUrl`。

## 4. 最小修复

- 只改根因所在的那一层，别顺手重构（重构走 `Refactoring Workflow.md`）。
- 若要改数据方法，记得 mock 和 cloud **两端一起改**，保持签名一致。
- 改动加简短中文注释说明原因。

## 5. 回归

- 修复点本身验证通过。
- `USE_MOCK` true/false 都过一遍（cloud 未实现则至少编译通过）。
- 主链路（首页→详情→加购）无回退。
- 记一句到本文件底部的「已知坑」备忘，避免重复踩。

## 已知坑 / 备忘

- （示例）mock 与 cloud 方法签名不一致会导致切换后台后页面白屏 —— 新增接口务必两端同步。
