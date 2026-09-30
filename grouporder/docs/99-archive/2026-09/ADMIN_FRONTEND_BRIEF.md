# 运营后台前端开发交接书

- 文档版本：v1.0
- 日期：2026-09-29
- 面向：admin 端开发 Agent
- 性质：**工作交接材料**，不是规格。规格在 `OPS_ADMIN_REQUIREMENTS.md` / `DECISIONS.md`，形态在 `admin-mockup-v3.html`，接口在 `CLOUD_API.md`

---

## 0. 开工前必须知道的事实（2026-09-29 核对）

| # | 事实 | 影响 |
|---|---|---|
| 1 | **服务空间关联与 schema / 初始数据上传状态仓库内不可核验**（HBuilderX 绑定不写入 `manifest.json`） | 开工前由产品负责人确认已绑定并上传 |
| 2 | **云对象已实装**：`grouporder-ops-co` 38 个方法与 `common/grouporder-common` 14 个模块均在 `uniCloud-alipay/cloudfunctions/`，client 端 6 个云对象同在此工程，两端共用 | 后台页面只调用；接口问题上报给云函数维护者 |
| 3 | **后台 16 个业务页面已建成**（`pages/grouporder/**`），A-03 工作台已改造，菜单 / 角色 / 权限初始数据已按 D-078 单一运营角色设计 | 后续工作是修缺陷与补接线；列表页是否全部接线见 `REVIEW_REPORT_2026-09-22.md` §3.3 |

---

## 1. 范围

**做**：运营后台 17 屏（A-01 ~ A-18，**A-11 已随 D-072 取消，编号留空缺**）的前端页面与菜单挂接。

**不做**：
- 云函数与云对象（另一个 session 负责，只改 `cloudfunctions/**`）
- 小程序端（`grouporder-client/`，第三个 session 负责）
- schema 与初始数据（已定稿，`database/**` 不要动）
- **任何 `docs/` 文档**（发现矛盾上报，不自行修改）

---

## 2. 任务分批与依赖

### 批 0 · 不依赖云对象，现在就能做

| 任务 | 说明 | 依赖 |
|---|---|---|
| **A-01 登录页裁剪** | 改 `uni_modules/uni-id-pages/config.js`：`loginTypes` 只留用户名密码、`isAdmin: true`。**页面本身不新建**——它是现成的（D-069）。结果：只剩用户名、密码、登录按钮，无第三方登录、无短信、无注册、无找回密码 | 无 |
| **A-02 访问结果页组件** | 全局可复用组件，承载四类结果态：账号停用、权限不足/已撤销、会话失效、对象不存在或已变化。沿用 `pages/error/404.vue` 形态。**二次验证已随 D-072 取消**，不要画任何验证弹窗 | 无 |
| **A-15 运营账号与权限** | **唯一一屏走 `uni-id` 体系 + `unicloud-db` 直连**，不依赖 `ops-co`。复用 `pages/system/{user,role,permission}/*` 九个现成页面，做五处必改（§4） | 服务空间已关联 |
| **全局基建** | ① 云对象调用封装：统一处理 `errCode` 分支与错误提示映射（错误码见 `CLOUD_API §2.3`）② 表格页通用封装：对接 `uni-table` 的 `@filter-change` / `@sort-change` → `{page, pageSize, filters, orderBy}` ③ 菜单权限实测（ADM-09 / ADM-11 / ADM-23） | 无 |

### 批 1~6 · 等 `grouporder-ops-co`

按 `ADMIN_BUILD_PLAN §阶段 3` 的批次，每批等对应云对象方法就绪：

| 批 | 页面 | 依赖方法（`CLOUD_API §11`） |
|---|---|---|
| A · 治理主链路 | A-07 → A-09 → A-08 → A-10 | `activityDetail`、`activityGovernanceOff/On`、`report*`、`check*`、`publisherRestrict` |
| B · 发布审核 | A-17 → A-18 | `reviewList/Detail/Submit`、`configGet/Set` |
| C · 检索与统计 | A-04 → A-05 → A-06 | `search*`、`stat*`、`exportSearchResult` |
| D · 账号与隐私 | A-12 → A-16 | `appeal*`、`privacyCase*` |
| E · 审计 | A-13 → A-14 | `exportLogList`、`exportDownload`、`oplogList` |
| F · 工作台 | A-03 | `workbenchTodo` —— **必须最后做**，待办条目来自前五批的对象状态 |

---

## 3. 形态规范：照着做，不要重新设计

效果图 `prototype/admin/admin-mockup-v3.html` 已按工程实测值绘制（`ADMIN_REUSE_MAP §2`）。**v3 是唯一现行稿。**

| 项 | 规范 |
|---|---|
| 骨架 | `uni-page-wrapper`(padding 15px, 背景 `#f5f5f5`) → `uni-page-body`**白色整卡** radius 5px + 阴影 → `.uni-header`(min-height 55px) + `.uni-container`(padding 15px) |
| 头部 | 左 `<uni-stat-breadcrumb>` 面包屑，右 `<view class="uni-group">` 放 `uni-search` + `uni-button size="mini"` |
| 表格 | `<uni-table border stripe>`，表头**白底无背景**，列**全部 `align="center"`** |
| 筛选 | **长在列头里**：`filter-type="search\|select\|timestamp"` + `sortable`。**不要在表格上方另做筛选表单区** |
| 操作列 | `uni-button size="mini"`，`type="primary"` / `type="warn"`，**不是文字链接** |
| 色值 | primary `#2979ff`、success `#18bc37`、warning `#f3a73f`、error `#e43d33`、菜单激活 `#409eff` |
| 分页 | `<view class="uni-pagination-box">` 居中 |
| 左侧菜单 | **不是写死的**，来自 `opendb-admin-menus` 表 + `permission` 字段过滤。每屏高亮当前项 |

---

## 4. A-15 的五处必改（照搬 uni-admin 会踩的坑）

| # | 现状 | 必须改为 |
|---|---|---|
| ① | `whereState = ref('')` 空条件，**列 `uni-id-users` 全表** | 加运营角色过滤，**只列 `ops-*` 账号**。这是最严重的一条：D-038 下小程序用户与运营账号同表，照搬会列出全部小程序用户 |
| ② | 自带 `<download-excel>` 导出按钮 | **保留**（D-072 导出已放开），但导出对象须先按 ① 收窄，且每次导出写审计 |
| ③ | 表格含**手机号码**、**邮箱**两列 | **保留展示，不做脱敏**（D-072）。D-029 下运营账号不采集手机号，两列多为空，可在表头注明 |
| ④ | 角色列渲染 `item.role` 原始值 | 映射为中文「运营账号」；不再单列 `ops-stat-view`（D-078） |
| ⑤ | 按钮组含批量删除 | **保留删除**，但须弹二次确认窗、**要求逐字输入 `delete`**（区分大小写，不匹配时确认按钮禁用）；**停用与删除分开呈现**（D-074） |

**另外**：当前账号自己那一行的角色复选框为**禁用态**，不能自行提权。

---

## 5. 权限模型（D-078 之后）

| 角色 | 可见菜单 |
|---|---|
| `ops-super` 运营账号（唯一业务角色） | **全部菜单**（持有全部 17 个 `ops-*` 权限点，含 `ops-stat-view`） |

- 所有运营账号统一持有 `ops-super`，**不做角色差异授权**；原 `ops-content` / `ops-privacy` / `ops-auditor` 已取消（D-078）
- 页面与云对象仍按权限点判断，不写角色特例分支；权限点只用于入口控制与审计归因
- **唯一对所有账号关闭的是「修改或删除审计日志」**
- 内置 `admin` 账号初始化后停用（ADM-03）

---

## 6. 七条不能违反的规则

1. **不脱敏**（D-072）：列表、详情、检索结果一律展示完整姓名、电话、地址。不要做任何掩码，**也不要画二次验证弹窗**
2. **但每次查看与导出都入审计**（红线⑨）：页面上要让运营知道这一点，图注已写明
3. **业务状态与治理状态并列为两个独立字段**，不得合并成一个标签
4. **运营不得代替团长经营**：全站**不得出现**创建/编辑/取消活动、增删改商品、改价格库存限购截止时间、新建修改订单、改统计数字的入口
5. **审计日志页无编辑无删除按钮**，超管也没有
6. **统计只用白名单指标**：已发布活动数、有效订单数、有效总份数、预计金额。**不得出现**销售额、实收金额、实际成交、GMV
7. **数据一律调云对象**（D-075），后台业务页**不得**写 `<unicloud-db :collection="grouporder-*">`。例外只有 A-15 与 A-14 的登录日志 tab（读 `uni-id-*` 体系）

**还有四条「不要退回去」**：后台不能有「推荐活动」「热门活动」「首页配置」（D-059）、不能有「设为推荐」「加权排序」（D-065）、看不到团长的商品库分类（D-066）、工作台待办**没有**「忽略」「标记已读」按钮（D-070）。

---

## 7. 已知陷阱（动到哪条看哪条）

`ADMIN_KNOWN_ISSUES.md` 共 30 条待处理，前端相关的重点：

| 编号 | 一句话 |
|---|---|
| ADM-02 | `user/list.vue` 查询条件为空会列全表 —— 即 A-15 第 ① 条 |
| ADM-09 | 叶子菜单的 `permission` 不能为空，否则任何角色都能看到 |
| ADM-11 / ADM-23 | 菜单分组会留**空壳**：子菜单被权限过滤后分组仍渲染。**待实测**，若成立需在 `leftWindow.vue` 的 `getUserMenu` 后补一步「移除无可见子项的分组」 |
| ADM-12 | 菜单只控入口、控不了数据粒度。D-072 后按事项收窄的粒度已取消，**仅剩** `ops-audit-oplog` 与 `ops-stat-view` 两处需页面内判断 |
| ADM-13 | A-13 与 A-14 数据源不同（`grouporder-export-log` vs `grouporder-oplog`），**不可合并为一页**；登录日志用现成的 `system/safety/list.vue` |
| ADM-22 | `password` 字段可能缺字段级读权限 —— **待实测** |

---

## 8. 验收

每批完成后对照：
- `OPS_ADMIN_REQUIREMENTS §14` 验收标准中与该批相关的条目
- `ADMIN_KNOWN_ISSUES.md` 中该批涉及的条目
- 效果图 v3 对应屏的图注（图注里写的是**规则**，不只是外观）

批 0 的验收：
- [ ] `ops-super` 账号登录，左侧菜单为全部菜单，与 §5 一致
- [ ] `admin` 账号已停用，用它登录被拒绝
- [ ] 登录页只有用户名、密码、登录按钮
- [ ] A-15 列表只出现 `ops-*` 账号，手机号与邮箱列保留展示，删除需输入 `delete`

---

## 9. 工作方式

1. **先给实施方案**（改动哪些文件、关键逻辑、风险点），确认后再写代码
2. 只改 `grouporder-admin/` 下的 `pages/**`、`components/**`、`pages.json`、`admin.config.js`、`uni_modules/uni-id-pages/config.js`
3. **不改** `cloudfunctions/**`、`database/**`、`docs/**`、`CLOUD_API.md`
4. 发现规格矛盾、效果图与文档对不上、或接口缺方法 —— **写在回复里上报，不自行裁决**
5. 写完自我 review：空值风险、生命周期、命名、项目规范
6. 总结里固定给三件事：**改了哪些文件、未实现或简化的部分、发现的规格问题**

> 项目既定规则：**项目文件是唯一事实来源，聊天内容只有写入文档并经确认后才成为项目结论。**

---

## 10. 必读文档（按顺序）

| # | 文档 | 读什么 |
|---|---|---|
| 1 | `docs/90-working/ADMIN_REUSE_MAP.md` | §2 实测视觉规范、§3 复用定性、§6 菜单与权限、§4 A-15 五处必改 |
| 2 | `prototype/admin/admin-mockup-v3.html` | 做哪屏看哪屏，**图注里是规则不是外观** |
| 3 | `docs/02-arch/CLOUD_API.md` | §2 通用约定与错误码、§10~§11 后台方法清单。**只读，不要改** |
| 4 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md` | §3 权限、§4 页面清单、§12 状态与异常、§14 验收 |
| 5 | `docs/00-product/DECISIONS.md` | 重点 D-072、D-073、D-074、D-075、D-076、D-078 |
| 6 | `docs/90-working/ADMIN_KNOWN_ISSUES.md` | §7 列的那几条 |
| 7 | `docs/90-working/ADMIN_BUILD_PLAN.md` | 阶段 3 的批次划分与任务卡模板 |

---

## 11. 变更记录

| 日期 | 变化 |
|---|---|
| 2026-09-29 | §0 由 2026-09-20 快照改为当前事实（云对象已实装且两端共用、16 页已建成） |
| 2026-09-29 | 按 **D-078** 改写 §5 权限模型为单一运营角色，批 0 验收去掉多角色与 `ops-stat-view` 分支；§4 第 ③ 条由「隐藏手机号邮箱两列」更正为「保留展示、不做脱敏」（D-072），第 ④ 条角色映射改为单一「运营账号」；§10 必读补 D-078 |
| 2026-09-20 | 早期演进（1 次修订：建稿、决策同步与 D-072～D-076 改写等），逐条内容见 git 历史 |
