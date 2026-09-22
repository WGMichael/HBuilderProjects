# 群接龙购物小程序

面向微信群熟人场景的轻量商品接龙工具。任何用户都可以发起一次接龙并成为该活动的团长；参与者选择商品和数量，系统自动汇总，截止后为团长生成可打印清单。支付、采购和交付在线下完成。

## 当前状态

- 当前阶段：MVP 核心业务规则持续收口，正在同步交互流程与数据模型
- 首发平台：微信小程序
- 上线目标：真实上线
- 当前版本：PRD v1.1，MVP 产品范围及关键边界规则已确认
- 下一确认点：评审更新后的页面流程、状态矩阵与数据模型

在本轮页面流程和数据模型确认前，不进入正式业务功能开发。

## 文档入口

文档分四层，**层次决定了它能不能被当作事实引用**：

### 一、产品事实（冲突时以此为准）

- [产品决策记录](docs/product/DECISIONS.md) —— **最高优先级**，72 条决策，与任何其他文档冲突时以此为准
- [产品需求文档](docs/product/PRD.md) —— 产品定位、功能范围、核心验收标准
- [平台运营后台需求](docs/product/OPS_ADMIN_REQUIREMENTS.md) —— 后台主规格，A-01～A-18 页面清单
- [数据模型设计](docs/arch/DATA_MODEL.md) —— 19 张表的字段、索引、状态机、并发策略与功能级实现规格
- [UX 流程规范](docs/ux/UX_FLOW_SPEC.md) · [UX 状态矩阵](docs/ux/UX_STATE_MATRIX.md) —— 页面编号、流程分支与状态迁移
- [用户商品库实现规格](docs/arch/GOODS_LIB_SPEC.md) —— 商品库的完整实现规格（D-063～D-066）

### 二、合规（上线前必读）

- [微信服务类目与主体核验](docs/compliance/CATEGORY_VERIFICATION.md) —— **待核验**，P1-09 / B-01，唯一单点否决风险
- [小程序提审自查清单](docs/compliance/RELEASE_AUDIT_CHECKLIST.md) —— 提审前逐项核对，46 项

### 三、实施配套（工程期使用，不是产品事实）

- [运营后台实施顺序与投喂规范](docs/arch/ADMIN_BUILD_PLAN.md) —— 从哪一步开始、给写码 Agent 喂什么
- [uni-admin 复用与改造盘点](docs/arch/ADMIN_REUSE_MAP.md) —— 哪些页面现成、哪些要改、哪些从零写
- [运营后台已知问题清单](docs/arch/ADMIN_KNOWN_ISSUES.md) —— uni-admin 模板与项目规则的冲突、缺陷与待验证事项，按严重度分级
- [UX 评审门](docs/ux/UX_REVIEW_GATE.md) —— 交付前的逐项检查表
- [云函数与云对象总契约](docs/arch/CLOUD_API.md) —— **全部服务端接口的唯一事实源**（两端 7 个云对象、80 个方法、11 个公共模块、4 个定时函数）：云函数 session 维护，两个前端 session 只读
- [运营后台前端开发交接书](docs/arch/ADMIN_FRONTEND_BRIEF.md) —— 给 admin 端开发 Agent 的工作材料：分批、依赖、形态规范、五处必改、七条红线
- [小程序端前端开发交接书](docs/arch/CLIENT_FRONTEND_BRIEF.md) —— 给 client 端开发 Agent 的工作材料：30 个页面的分批与云对象依赖、三 tab 大厅的四个硬约束、八条红线、八条陷阱

### 四、一次性工作单与评审意见（**不是项目事实**）

- [本轮更新工作单](docs/update.md) —— 批次 A/D 已完成，B/C 未开工
- [可行性评审](docs/review/FEASIBILITY_REVIEW.md) —— 外部意见，条目经确认后才写入 PRD/DECISIONS

> **文档生命周期规则（2026-09-18 确立）**：评估稿、对齐分析、方案比选这类**过程文档**，结论一旦写入 DECISIONS 或对应规格，即从 `docs/` 删除，不保留在正式目录。原因是过程文档记录的是**当时的判断**，决策推翻它之后原文不会跟着改，留在目录里就成了一个说反话的事实源。需要追溯推理过程时查 git 历史。

## 项目目录结构

```text
grouporder/
├── grouporder-client/   微信小程序前端工程
├── grouporder-admin/    平台运营后台工程
├── docs/                产品、UX、评审及后续架构方案
├── prototype/           核心页面交互原型，不是正式业务代码
├── memory/              各次会话的记忆文件，由 save-session 生成，用于 clear 后恢复上下文
├── .claude/skills/      项目级 skill，目前有 save-session
└── README.md            项目总入口与协作说明

../ai-article/           同类型项目的跨项目开发规则与实践资料
```

目录职责：

- `grouporder-client/`：面向参与者和团长的微信小程序代码。团长的活动、商品、订单和清单管理也在小程序内完成。
- `grouporder-admin/`：仅供平台内部人员使用的运营后台代码，承担内容治理、举报处置、账号与权限、受控查询和审计等能力，不是团长经营后台。
- `docs/`：项目事实和方案的正式来源。产品结论以 `docs/product/PRD.md` 与 `docs/product/DECISIONS.md` 为准；运营后台边界见 `docs/product/OPS_ADMIN_REQUIREMENTS.md`；页面流程和状态见 `docs/ux/`。
- `prototype/`：用于评审页面结构和交互的本地原型，使用模拟数据，不代表正式代码结构或接口设计。
- `../ai-article/`：位于本项目上一级的通用规则资料。目前与本项目直接相关的是 `../ai-article/uni-admin-uniCloud-开发实践.md`。它用于补充开发经验，不得覆盖本项目正式产品决策。

注意：前端工程的实际目录名是 `grouporder-client`，后续任务和文档统一使用该名称。

## AI 开始工作时的读取顺序

AI 或新协作者进入项目后，应先识别任务属于产品、UX、小程序前端、运营后台还是架构，再按以下顺序读取：

0. `memory/MEMORY.md`，若需接续此前会话的工作，先看索引找到对应的会话记忆。**memory 与文档冲突时以文档为准**——memory 记的是当时的判断，文档是确认后的事实。
1. 根目录 `README.md`，确认产品定位、阶段、目录职责和协作约束。
2. `docs/product/DECISIONS.md` 与 `docs/product/PRD.md`，确认已经生效的业务事实。
3. 与任务直接相关的专项文档：
   - 小程序页面：`docs/ux/UX_FLOW_SPEC.md`、`docs/ux/UX_STATE_MATRIX.md`、`grouporder-client/README.md`。
   - 运营后台：`docs/product/OPS_ADMIN_REQUIREMENTS.md`、`docs/ux/`、`grouporder-admin/README.md`。
4. 需要使用 uni-admin 或 uniCloud 时，再读取 `../ai-article/uni-admin-uniCloud-开发实践.md`。
5. 实施前检查目标目录现有代码和未提交修改，不以原型、模板默认功能或外部经验替代正式需求。

发生冲突时，优先级为：产品负责人最新确认并写入的决策记录 → PRD 和专项需求 → UX/架构方案 → 子项目 README → `ai-article` 通用实践 → 框架模板默认行为。

## 协作方式

项目采用“用户决策、主 Agent 协调、角色 Agent 提供专项结论”的方式推进。

1. 用户担任产品负责人，确认范围和关键业务规则。
2. 主 Agent 拆分任务、控制文件修改、汇总结论并维护正式文档。
3. 角色 Agent 只承担边界清楚的分析或评审任务，不各自维护事实版本。
4. 项目文件是唯一事实来源；聊天内容只有写入文档并经确认后才成为项目结论。
5. 调研和评审可以并行；同一文件只由一个 Agent 负责修改。
6. 每个阶段经过确认门：需求确认 → 体验设计 → 架构设计 → 开发 → 测试 → 发布。

## 推荐角色

| 阶段 | 角色 | 交付物 |
|---|---|---|
| 产品 | 产品经理、需求审查 | PRD、用户故事、验收标准、决策记录 |
| 设计 | UX、视觉设计 | 页面清单、流程图、原型、视觉规范 |
| 架构 | 技术架构师、安全与合规审查 | 系统架构、数据模型、接口与风险方案 |
| 开发 | 小程序、服务端开发 | 可运行版本与变更说明 |
| 验收 | 测试、代码 Review | 测试报告、缺陷和上线检查清单 |

## 工作约束

- 不把待确认假设直接转成开发任务。
- 不因后续可能跨平台而提前扩大首版范围。
- 涉及公共模块、架构调整、删除代码或修改超过 3 个文件时，先征求确认。
- 每次实现后检查空值风险、内存分配、生命周期、命名、项目规范和可优化点。
