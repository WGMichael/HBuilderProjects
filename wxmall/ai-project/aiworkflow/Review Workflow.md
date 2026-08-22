# Review Workflow · 提交/运行前自查清单

> 单人项目没有团队 Review，降级成一份**运行到微信前的自查清单**。
> 每次改完、跑真机前过一遍；也可贴给 AI 让它对照检查（见 PromptLibrary）。

## 架构铁律（最优先，违反必改）

- [ ] 页面只 `import { db } from '@/data'` 取数据，**没有**直接 import `api/`、`mock/`，**没有**裸写 `uni.request`。
- [ ] 全局状态只用 `@/store` 单例；`computed` 用 `.value` 读。
- [ ] 新增/改的数据方法，`mock-datasource.ts` 与 `cloud-datasource.ts` **两端签名一致**。
- [ ] 数据模型改动同步到 `types/index.ts`；返回体是 `ApiResult<T>`，分页用 `PageQuery/PageResult`。
- [ ] import 全用 `@/` 别名，没有 `../../` 爬层级。

## 代码规范

- [ ] 页面是 `<script setup lang="ts">` + `@dcloudio/uni-app` 生命周期钩子。
- [ ] 样式用 `uni.scss` 变量（`$brand` 等），没有到处硬编码 `#e64340`。
- [ ] 关键模块有中文注释/职责块。
- [ ] 没有留下 `console.log` 调试残留（必要日志除外）。
- [ ] 新增页面已在 `pages.json` 注册。

## 功能与数据

- [ ] `USE_MOCK` 切 true/false 都能编译（cloud 未实现处至少不报错）。
- [ ] 空数据 / 加载中 / 失败 toast / 库存与数量边界 有处理。
- [ ] 主链路回归：首页 → 详情 → 选规格 → 加购，无回退。

## 交付前

- [ ] 对照 `ai-project/design/` PRD 的验收点逐条确认。
- [ ] 若引入新约定或踩到坑，更新 `CLAUDE.md` 或对应 Workflow 文档。
