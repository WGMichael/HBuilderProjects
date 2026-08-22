# Feature Workflow · 需求开发工作流

> 适用：给「特产小店」新增一个功能。核心是**不破坏数据层协议**（页面 → `db` / `store` → 数据源接口 → mock/后台）。

## 流程总览

```
需求确认 → 定位影响层 → 设计 → 拆任务 → 实现 → 自查(Review) → 测试建议
```

## 1. 需求确认

- 一句话写清：谁、在哪个页面、要做什么、成功长什么样。
- 对照 `ai-project/design/` 的 PRD / 功能清单，确认属于哪一版（MVP / V1.1 / V1.2）。
- 私域小店原则：能少一步就少一步，别照搬大电商。

## 2. 定位影响层（本项目关键一步）

先回答一句话：**这个需求要动哪几层？** 按下表自上而下判断：

| 层 | 什么时候要改 | 文件 |
|---|---|---|
| 类型 `types/` | 新增/修改领域模型或响应字段 | `types/index.ts` |
| 数据源接口 `data/datasource.ts` | 需要一个新的数据方法 | `IDataSource` |
| mock 实现 | 接口有了要能跑假数据 | `data/mock-datasource.ts` + `data/mock/index.ts` |
| cloud 实现 | 对齐后台（可暂留 TODO） | `data/cloud-datasource.ts` + `api/index.ts` |
| 状态 `store/` | 跨页面共享状态（购物车/用户） | `store/*.ts` |
| 页面 `pages/` | 展示与交互 | `pages/**/*.vue` |

## 3. 设计

- **接口先行**：若需要新数据，先在 `IDataSource` 里定义方法签名（入参/返回类型），这是前后端契约。
- 返回体一律走 `ApiResult<T>`；分页用 `PageQuery` / `PageResult<T>`。
- 后台表结构尽量对齐 `types/`，减少转换。

## 4. 拆任务（建议顺序，避免破坏架构）

1. `types/`：加/改模型。
2. `data/datasource.ts`：加方法签名。
3. `data/mock-datasource.ts` + `mock/`：补 mock 实现（先让功能能跑）。
4. `data/cloud-datasource.ts` + `api/`：补后台实现（没后台就留 `// TODO`）。
5. `store/`：如需共享状态。
6. `pages/`：页面消费 `db` / `store`，只做展示。

> 铁律：**mock 和 cloud 两端方法签名必须一致**，否则切 `USE_MOCK` 会崩。

## 5. 实现规范

- 页面取数据只用 `import { db } from '@/data'`；**绝不**在页面直接 import `api/`、`mock/` 或写 `uni.request`。
- 全局状态只用 `import { cartStore, userStore } from '@/store'`；`computed` 用 `.value` 读。
- import 一律 `@/xxx` 别名，不爬相对路径。
- 页面用 `<script setup lang="ts">` + `@dcloudio/uni-app` 生命周期钩子。
- 中文注释，模块顶部写职责块。

## 6. 自查（见 Review Workflow）

跑到微信开发者工具前，过一遍 `Review Workflow.md` 的清单。

## 7. 测试建议（本项目现实版）

没有单测框架，靠手动 + 隔离验证：

- **数据来源隔离**：`config.USE_MOCK` 切 true/false 各跑一次（cloud 端没实现时至少确认编译不报错）。
- **真机/模拟器**：微信开发者工具走一遍新功能主链路。
- **回归**：确认没影响首页 → 详情 → 加购这条既有主链路。
- **边界**：空数据、加载中、库存 0、数量下限、网络失败 toast。
- 上线前功能对照 PRD 的验收描述逐条勾。
