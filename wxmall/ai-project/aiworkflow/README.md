# AI 工作流规范

面向「特产小店」这个 **单人 + AI 协作 + uni-app(Vue3+TS)** 项目的工作流约定。
所有工作流都挂靠同一条主心骨：**页面 → `db` / `store` → 数据源接口 → mock/后台**。

## 文件索引

| 文件 | 用途 | 优先级 |
|---|---|---|
| `Project Onboarding Workflow.md` | 接手/每次新 AI 会话开工前的对齐清单 | ★ 常用入口 |
| `Feature Workflow.md` | 新增功能的标准流程（定位层→接口先行→拆任务） | ★ 高频 |
| `Bug Workflow.md` | 修 Bug；用 `USE_MOCK` 隔离前后端 | ★ 高频 |
| `Review Workflow.md` | 运行到微信前的自查清单（含架构铁律） | ★ 每次跑前 |
| `PromptLibrary.md` | 可直接粘贴给 AI 的提示词库 | ★ 杠杆点 |
| `Refactoring Workflow.md` | 重构：行为不变，改动藏在边界后 | 按需 |
| `Performance Workflow.md` | 性能优化 checklist（骨架期先占位） | 上线前 |

## 怎么用

- **每次让 AI 干活前**：先请它读 `Project Onboarding Workflow.md`，再从 `PromptLibrary.md` 挑对应场景的提示词。
- **加功能**：`Feature Workflow` → 写完对照 `Review Workflow` → 跑微信。
- **出问题**：`Bug Workflow`。
- 约定有变化，及时回写 `CLAUDE.md` 和这里的对应文件。
