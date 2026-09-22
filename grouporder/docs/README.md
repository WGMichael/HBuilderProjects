# 文档地图

- 更新日期：2026-09-22
- 本文是 `docs/` 的**唯一索引**，也是**唯一维护版本号的地方**（见 §3）。
- 新加入的人或 Agent 从这里开始，不要直接翻目录。

---

## 1. 目录的四种性质

目录前缀的数字只表示阅读顺序，真正要分清的是**性质**——它决定这份文档能不能当依据用。

| 目录 | 性质 | 是否必须遵守 | 会不会过期 |
|---|---|---|---|
| `00-product/` | **产品事实**。范围、规则、决策 | ✅ 必须 | 长期维护 |
| `01-ux/` | **设计事实**。页面、流程、状态 | ✅ 必须 | 长期维护 |
| `02-arch/` | **架构事实**。数据模型、接口契约、功能实现规格 | ✅ 必须 | 长期维护 |
| `03-compliance/` | **合规待办**。核验项与提审清单 | ⚠️ 结论未出，不得当作已确认 | 待填写 |
| `90-working/` | **过程材料**。实施计划、复用盘点、开发交接书 | ❌ 仅参考，冲突时以上面三层为准 | **任务完成即失效** |
| `99-archive/` | **归档**。已失效，仅留追溯 | ❌ 不要读 | 已过期 |

> 判断口诀：**冲突时永远以 `00`/`01`/`02` 为准。** `90-working/` 里的任何说法与它们不一致，一律按上层文档执行并上报，不要自行裁决。

---

## 2. 我该读哪几份

| 你要做的事 | 按顺序读 |
|---|---|
| 了解这个产品是什么 | `00-product/PRD.md` → `00-product/DECISIONS.md` |
| 写小程序端页面 | `90-working/CLIENT_FRONTEND_BRIEF.md`（作业书）→ `01-ux/UX_FLOW_SPEC.md` → `01-ux/UX_STATE_MATRIX.md` → `02-arch/CLOUD_API.md` |
| 写运营后台 | `90-working/ADMIN_FRONTEND_BRIEF.md` → `00-product/OPS_ADMIN_REQUIREMENTS.md` → `90-working/ADMIN_REUSE_MAP.md` → `90-working/ADMIN_KNOWN_ISSUES.md` |
| 写云函数 / 云对象 | `02-arch/CLOUD_API.md`（你是它的维护者）→ `02-arch/DATA_MODEL.md` → `00-product/DECISIONS.md` |
| 改数据库表 | `02-arch/DATA_MODEL.md` → `02-arch/schema/` |
| 做商品库相关功能 | `02-arch/GOODS_LIB_SPEC.md`（自包含） |
| 准备提审上线 | `03-compliance/CATEGORY_VERIFICATION.md` → `03-compliance/RELEASE_AUDIT_CHECKLIST.md` |

**效果图**（不在 `docs/` 下）：小程序端 `prototype/mockup-v3.html`，运营后台 `prototype/admin/admin-mockup-v3.html`。

---

## 3. 版本总表

**版本号只在这张表里维护。** 各文档头部保留自己的「文档版本」行，但**任何文档都不再在正文中写别的文档的版本号**——历史上正是这种互相写版本导致了引用混乱（曾出现被引用版本高于文档自身版本的情况）。需要确认版本时查这张表。

| 文档 | 当前版本 | 维护者 | 说明 |
|---|---|---|---|
| `00-product/PRD.md` | v1.3 | 产品负责人 | 产品范围与规则 |
| `00-product/DECISIONS.md` | v1.12 | 产品负责人 | **决策编号的唯一出处**，D-001 起 |
| `00-product/OPS_ADMIN_REQUIREMENTS.md` | v0.15 | 产品负责人 | 运营后台需求 |
| `01-ux/UX_FLOW_SPEC.md` | 无版本号 | UX | 页面编号 M-xx 的唯一出处 |
| `01-ux/UX_STATE_MATRIX.md` | 无版本号 | UX | |
| `01-ux/UX_REVIEW_GATE.md` | 无版本号 | UX | |
| `02-arch/DATA_MODEL.md` | v1.19 | 架构 | 19 张表，schema 已生成未上传 |
| `02-arch/CLOUD_API.md` | v0.4 | **云函数 session** | 前端 session 只读，发现问题上报不自改 |
| `02-arch/GOODS_LIB_SPEC.md` | v0.3 | 架构 | 自包含实现规格 |
| `03-compliance/CATEGORY_VERIFICATION.md` | v0.1 | 产品负责人 | **待核验**，P1-09 |
| `03-compliance/RELEASE_AUDIT_CHECKLIST.md` | v0.1 | 产品负责人 | 提审前逐项核对 |
| `90-working/ADMIN_BUILD_PLAN.md` | v0.2 | 架构 | |
| `90-working/ADMIN_REUSE_MAP.md` | v0.2 | 架构 | |
| `90-working/ADMIN_KNOWN_ISSUES.md` | v0.1 | 架构 | |
| `90-working/ADMIN_FRONTEND_BRIEF.md` | 无版本号（2026-09-20） | 架构 | 进行中 |
| `90-working/CLIENT_FRONTEND_BRIEF.md` | 无版本号（2026-09-20） | 架构 | 进行中 |
| `99-archive/*` | — | — | 已失效 |

**改动规则**：改了某份文档 → 更新它自己的「文档版本」行 → 同步这张表。**不要**去别的文档里改版本号引用，那些引用已经全部清除了。

---

## 4. 已知缺口

以下是整理时发现、尚未解决的问题，不要当作已完成。

| # | 缺口 | 影响 |
|---|---|---|
| 1 | **D-067（复用历史接龙）没有集中的实现规格。** 原 `ACTIVITY_COPY_SPEC.md` 已被删除，内容散在 PRD、DECISIONS、UX_FLOW_SPEC、DATA_MODEL、CLOUD_API、GOODS_LIB_SPEC、CLIENT_FRONTEND_BRIEF 七份文档中 | 实现该功能时需自行拼装，容易漏掉治理约束（被下架商品必须剔除、被下架活动不可作为源） |
| 2 | `00-product/USER_RESEARCH.md` 与 `00-product/TRACEABILITY.md` **被引用但从未创建** | 悬空引用。要么补上，要么删掉引用 |
| 3 | 三份 UX 文档与两份 BRIEF **没有版本号**，只有「文档状态」或日期 | 无法判断新旧。建议补上版本号并纳入 §3 |
| 4 | **P1-09 服务类目与主体核验仍未出结论** | 全项目唯一的单点否决风险，见 `03-compliance/CATEGORY_VERIFICATION.md` |
| 5 | **服务空间未关联、云对象为空、业务页面为 0** | 见 `90-working/CLIENT_FRONTEND_BRIEF.md` §0 |

---

## 5. 项目级注意事项

- **本项目没有 git 仓库。** 文档与代码的任何改动都无法 diff、回滚或定位来源。`DECISIONS.md` 的变更记录全靠手写维护。建议尽快 `git init`。
- **根目录有 `密钥.md`。** 若将来启用 git，必须先写好 `.gitignore`，否则会被提交。
- 本次整理的备份在项目根目录 `docs.backup-2026-09-22.tar.gz`，确认无误后可删除。
