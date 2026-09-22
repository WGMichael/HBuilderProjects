# 运营后台 · 已知问题与风险清单

- 文档版本：v0.1
- 日期：2026-09-18
- 性质：**实施参考**。记录 uni-admin 模板与本项目规则之间已发现的冲突、缺陷与待验证事项，供开发运营后台时逐条核对
- 事实来源：`grouporder-admin` 工程实际代码（逐文件核对）、`OPS_ADMIN_REQUIREMENTS.md`、`DECISIONS.md`、`DATA_MODEL.md`
- 配套：`ADMIN_REUSE_MAP.md`（复用盘点与权限模型）、`prototype/admin/admin-mockup-v3.html`（17 屏效果图，2026-09-18 产出）

## 使用方法

本文**不是待办清单，也不是必须全部处理的缺陷单**。每条记录的是「在什么情况下会撞上、撞上会怎样、依据是什么」。开发到对应模块时核对该条是否在本次范围内，**根据实际情况决定处理与否**；决定不处理的，在条目下补一行原因即可。

状态图例：

| 标记 | 含义 |
|---|---|
| 🔴 **高危** | 上线前必须处理，否则有安全或合规后果 |
| 🟠 **必处理** | 实施对应模块时必须处理，否则功能不可用或违反已确认规则 |
| 🟡 **待裁定** | 需产品或架构决策，影响实现方式与排期 |
| 🔵 **待验证** | 从代码推断，尚未实测确认，不作为结论 |
| ⚪ **已处理** | 已落地，记录在案防止回退 |
| 📄 **文档** | 文档之间不一致，需同步 |

---

## 1. 高危（上线前必须处理）

### ADM-01 ⚪ `tokenSecret` 与 `passwordSecret` 曾是示例值（**已于 2026-09-18 处理**）

**位置**：`uni_modules/uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json`

```json
"passwordSecret": "passwordSecret-demo",
"tokenSecret": "tokenSecret-demo",
```

**后果**：`tokenSecret` 是 JWT 签名密钥。使用公开的示例值意味着**任何人都可以自行签发合法 token**，直接以任意 uid、任意 role 登录后台，绕过全部权限校验——本文其余所有权限设计在此前提下都是无效的。`passwordSecret` 用于密码加密，示例值会使密码哈希可被批量还原。

**加重情节**：该文件位于 `uni_modules` 内，是模块自带的**示例配置**；而项目目录 `uniCloud-alipay/cloudfunctions/common/` 下只有 `uni-stat/`，**没有自己的 `uni-config-center`**。因此当前上传云函数时，生效的就是这份 demo 配置。

**已处理（2026-09-18）**：两侧密钥已统一为新生成的 64 位十六进制随机值，两份配置文件**字节级相同**。

| 项 | 处理前 | 处理后 |
|---|---|---|
| admin `tokenSecret` / `passwordSecret` | `tokenSecret-demo` / `passwordSecret-demo` | 新随机值（64 位 hex） |
| client `tokenSecret` / `passwordSecret` | 各自一对 48 位随机值，**与 admin 不一致** | 同上，与 admin 一致 |
| `web.tokenExpiresIn` | admin 7200 / client 无 | 7200（后台 2 小时） |
| `mp-weixin.tokenExpiresIn` | admin 无 / client 顶层 259200 | 259200（小程序 3 天） |
| `passwordStrength` | admin 无 / client medium | medium（与 `uni-id-pages/config.js` 一致） |

处理时发现的**既有问题**：client 侧原本已有一对随机密钥（CLI 创建工程时生成），admin 侧是模板 demo 值，**两边从一开始就不一致**。而云端公共模块只有一份，谁后上传谁生效——若照 DATA_MODEL §1「只从 admin 上传」的约定执行，反而会把 demo 密钥推上云端。现已统一，此风险消除。

分平台有效期说明：uni-id 按 `clientInfo.platform` 选取子配置，因此**一份配置可同时满足两端**——后台走 `web`（2 小时），小程序走 `mp-weixin`（3 天），不需要两份配置。

**原处理建议（保留备查）**：上线前替换为随机长字符串（32 位以上）。两个注意点——

1. **改哪一份需先核实 uniCloud 的优先级规则**：若项目目录的 `uniCloud-alipay/cloudfunctions/common/uni-config-center/` 优先于 `uni_modules`，则应在项目目录创建覆盖版（与 `uni-id-users.schema.json` 覆盖版同一思路，模块升级不会覆盖）；若不支持覆盖，只能直接改 `uni_modules` 内的文件，并记入 §5 必检清单（ADM-30 已登记）。
2. **admin 与 client 两个工程共用同一服务空间，必须使用同一份密钥**；且修改 `passwordSecret` 会使已有密码失效，因此要在创建正式账号**之前**改。

**依据**：uniCloud 官方要求生产环境替换；OPS §13「日志不得记录密码等凭证」的前提是凭证本身可信。

### ADM-02 🟠 `system/user/list.vue` 查询条件为空，会列出全部小程序用户

**位置**：`pages/system/user/list.vue`，`const whereState = ref('')`

**背景**：该页是 **uni-admin 模板原生自带**的用户管理模块（连同 `add.vue`、`edit.vue`），不是本项目新建。D-038 规定「账号体系复用 uni-id，不自建用户表」，因此**小程序平台用户与运营账号同表**（`uni-id-users`），空 `where` 会把两类人混在一起全部列出。

**处理（2026-09-18 按 D-072 改写）**：不拆分页面，**在本页顶部增加身份筛选器**：

| 选项 | 过滤条件 |
|---|---|
| 全部 | 无过滤 |
| 普通用户 | 不含任何 `ops-*` 角色 |
| 运营账号 | 含 `ops-*` 角色 |

- 默认选中「运营账号」——本页在信息架构中的定位仍是 A-15「运营账号与权限」，普通用户是附带能力。
- **不做脱敏**，手机号、邮箱等字段正常展示（D-072）。
- **保留导出 Excel 按钮**（D-072 放开导出）。
- 删除按钮保留，但须加二次确认（见 ADM-07）。

> 不拆成两个页面：运营账号与小程序用户同表（D-038），在同一页用身份筛选器区分即可，拆页没有安全收益，反而增加维护成本。

**依据**：OPS §4.9 页面定位；D-038 同表；D-072 取消脱敏与导出限制。

### ADM-03 🔴 初始化用的 `admin` 账号必须停用

**位置**：`uni_modules/uni-id-common/uniCloud/cloudfunctions/common/uni-id-common/index.js` 的 `getUserPermission()`（压缩代码）

```js
if (role.includes("admin")) return { role, permission: [] }   // 跳过权限查询，视为全权
```

**后果**：内置 `admin` 角色**不受任何 permission 控制，自动拥有全部菜单与接口权限**，包括系统管理与全部审计。而 `registerAdmin` 云函数写死 `role: ['admin']`。**D-076 之后，停用 admin 的理由变了**：`ops-super` 本身已是全权，问题不在权限大小，而在 `admin` 由 `registerAdmin` 写死角色、跳过权限查询，**不受权限表达式与菜单模型的任何约束**——留着它等于留一个绕过审计与权限体系的后门，且它的操作无法按角色归因。

**处理**：按 `ADMIN_REUSE_MAP.md` §8 的六步流程，用 admin 创建业务账号后**立即停用 admin**，保留记录以备应急。日常运营一律使用 `ops-*` 账号（超管用 `ops-super`，它已持有全部权限）。

---

## 2. 实施时必须处理

### 2.1 A-15 运营账号页（复用 `system/user/list.vue`）

除 ADM-02 外还有两处：

| 编号     | 状态  | 现状                                | 处理                              | 依据             |
| ------ | --- | --------------------------------- | ------------------------------- | -------------- |
| ADM-06 | 🟠  | 角色列直接渲染 `item.role` 原始值           | 映射为 4 个中文角色名，`ops-stat-view` 单列 | OPS §3.2       |
| ADM-07 | 🟠 | 按钮组含批量删除 | **保留删除**，但须弹出二次确认窗、要求输入 `delete` 才执行 | D-072 |

> ADM-07 已在数据库层加了一道保险：`DELETE_UNI_ID_USERS` **刻意未登记到 `uni-id-permissions`**，因此权限管理页里没有该选项、无法通过 UI 分配。即使有人恢复了批量删除按钮，schema 的 `delete` 表达式也会拒绝。

### ADM-41 ⚪ 已处理 `uni-id-users.init_data.json` 含 uni-starter 预置测试用户

**位置**：`uniCloud-alipay/database/uni-id-users.init_data.json`

```json
[{ "_id": "_uni_starter_test_user_id", "username": "uni-starter预置用户名",
   "nickname": "测试用户昵称", "mobile": "18888888888", "mobile_confirmed": 1 }]
```

**后果**：执行「初始化云数据库」时，这条 uni-starter 的演示数据会被写入 `uni-id-users` 表。它无 `password`、无 `role`，因此**不能登录、也不具备任何权限**，不构成安全问题；但它会：

1. 出现在 A-15 运营账号列表里（若未按 ADM-02 加角色过滤）与 A-04 用户检索结果中，成为一条无法解释的脏数据
2. 带一个假手机号 `18888888888`，与 D-029「账号不采集手机号」的原则相悖
3. 使「注册用户数」等统计口径出现 +1 偏差

**处理**：**已于 2026-09-18 清空为 `[]`**（产品负责人确认：不预置任何测试数据，测试数据在代码写完后自行跑出来）。初始化云数据库时该表不再写入任何行。

### ADM-09 🟠 叶子菜单的 `permission` 不能为空

**位置**：`components/uni-data-menu/uni-data-menu.vue`

```js
if (item.isLeafNode) {
  if (item.permission && item.permission.length) {
    return item.permission.some((p) => permission.indexOf(p) > -1);
  }
  return false;          // ← permission 为空 = 对非 admin 完全不可见
}
```

**后果**：新增菜单时若忘记填 `permission`，该菜单只有内置 `admin` 能看到，其他角色一个入口都没有。uni-admin 自带 44 条菜单的 `permission` 全是 `[]`，这正是它们默认只有 admin 可见的原因。

**处理**：每个叶子菜单必须填至少一个权限点；每个角色必须持有 `ops-workbench`，否则登录后看不到任何菜单。

### ADM-10 🟠 自定义权限点只控菜单，数据访问由 schema 表达式控制

**后果**：两套权限各管一段，缺一不可——

- `ops-sys-account` 等自定义权限点 → 只决定**菜单是否渲染**
- `uni-id-users` / `uni-id-roles` / `uni-id-permissions` / `opendb-admin-menus` 四张表的 schema `permission` 表达式（如 `'READ_UNI_ID_USERS' in auth.permission`）→ 决定**数据能否读写**

只给自定义权限点的结果是：菜单能看到，点进去表格里除本人那行外，其他账号的 `username`、`role`、`status` 全被字段级权限过滤，页面基本不可用。

**处理**：已在 `uni-id-roles.init_data.json` 中为 `ops-super` 补上 **15 个** uni-admin 内置权限点（不含 `DELETE_UNI_ID_USERS`，运营账号只允许停用）。第 15 个 `READ_UNI_ID_LOG` 是 2026-09-20 补的——首轮遗漏，见下方 ADM-42；D-076 后 `ops-super` 另持有全部 17 个 `ops-*` 权限点。**后续新增任何直连 `uni-id-*` 表的页面时，都要同步检查是否缺内置权限点。**

### ADM-11 🟠 菜单分组会留下空壳

**位置**：同 ADM-09 的过滤逻辑，`return true` 分支——**分组节点一律保留，不参与过滤**。

**后果**：若某分组下所有叶子菜单都被权限过滤掉，分组标题仍会渲染，点击无反应。例如未获 `ops-stat-view` 的账号会看到一个空的「运营统计」分组。

**处理**：实测确认 `buildMenus` 是否已处理空分组；若未处理，在 `leftWindow.vue` 的 `getUserMenu` 后补一步「移除无可见子项的分组」。当前 5 个分组（内容治理、运营统计、账号与隐私、审计、系统管理）都有此风险。

### ADM-12 🟠 菜单权限控制不了数据粒度（**范围已因 D-072 大幅缩小**）

**2026-09-18 重述**：原先这里列的「Excel 事件仅关联活动摘要 / 仅限处理事项」「审计日志仅本人和关联案件」等**按事项收窄的数据粒度限定，已随 D-072 全部取消**——查看不需要关联事项、不限制访问范围，可见范围就等于页面访问权限。OPS §3.2 的矩阵与本表已同步改写。

**仍然存在的粒度问题只剩两处**：

| 能力 | 判断依据 | 说明 |
|---|---|---|
| 查看操作日志 | 权限点 `ops-audit-oplog` | 内容运营与账号隐私专员默认未授予，进不了该页；这是角色职责划分，不是脱敏机制 |
| 查看运营统计 | 权限点 `ops-stat-view` | 独立权限点，默认关闭，不随任何角色自动获得（D-042） |

三个角色都持有 `ops-audit-export`，Excel 事件页对它们是**同一份数据、同一个范围**，不再需要页面内二次过滤。

**处理**：上述两处由菜单 + 云对象双重判断（菜单控入口、云对象控接口）；其余页面不再做按事项的数据过滤。

### ADM-13 🟠 A-13 与 A-14 数据源不同，不可合并为一页

**后果**：登录类日志在 `uni-id-log`（`pages/system/safety/list.vue` 已实现），业务操作日志在 `grouporder-oplog`（9 字段、10 类事件）。两者字段与检索条件完全不同，合并会导致列对不齐、筛选条件互相污染。

**处理**：保持「Excel 事件 / 操作日志 / 登录日志」三个独立菜单项。

### ADM-14 🟠 清理 `uni-stat` 页面必须在 A-03 改造之后

**位置**：`pages/index/index.vue`，目前有 15 处 uni-stat 引用（组件、样式类、`uni-stat-result` 表查询、`navTo` 到 uni-stat 页面）。

**后果**：先删 `pages/uni-stat/**` 或先从 `pages.json` 移除，会让未改造的首页产生死链和组件缺失报错。

**处理**：顺序固定为 ① 改造 `index.vue` 为 A-03 工作台 → ② 清理 uni-stat 页面与路由。

### ADM-15 🟠 `pages/demo/icons/` 不能删

**位置**：`pages/system/menu/add.vue:59`、`edit.vue:60`

```js
import Icons from '@/pages/demo/icons/icons.vue';
```

**后果**：菜单管理页用它作**图标选择器**。删除会导致该页编译或运行报错。

**处理**：保留 `pages/demo/icons/icons.vue` 与 `uni-icons.js` 两个文件；路由注册已移除（作为组件 import 不需要在 `pages` 数组注册）。

### ADM-16 🟠 `uni-stat-cron` 上传后会持续计费

**后果**：它是定时任务云函数，上传即按 crontab 周期运行并产生云函数调用与数据库读写费用，而本项目当前不使用 uni 统计。

**处理**：不上传 `uni-stat-cron`、`uni-stat-receiver`、`uni-analyse-searchhot`、`uni-upgrade-center`、`uni-sms-co`、`ext-storage-co`。`uni-stat-*` 的 25 张表 schema 同样不上传——不上传就不会创建。

### ADM-17 🟠 开启「错误统计」需要完整四步，不是开个菜单

**后果**：权限点 `ops-sys-error` 与菜单 `uni-stat-error-js` 已就位但 `enable: false`。只开菜单不配链路，运营会看到一个**永远空白的页面**。

**处理**：需要 ① 菜单置 `enable: true` ② 上传 `uni-stat-error-logs`、`uni-stat-error-result`、`uni-stat-error-source-map` 三张表 ③ 上传 `uni-stat-receiver` 与 `uni-stat-cron` ④ `grouporder-client` 的 `manifest.json` 开启 `uniStatistics`。归属已确认为超级管理员（产品负责人 2026-09-17）。

### ADM-18 🟠 登录页仍有「注册管理员账号」入口

**位置**：`uni_modules/uni-id-pages/pages/login/login-withpwd.vue:29`

```html
<text class="link" @click="toRegister">{{config.isAdmin ? '注册管理员账号': '注册账号'}}</text>
```

**后果**：服务端 `registerAdmin` 有保护（已存在 admin 角色用户时返回 `ADMIN_EXISTS`），**不构成安全漏洞**，但已完成初始化后点击即报错，是个无效入口，与 OPS §3.1「运营账号不能自行注册」的表述不符。

**处理**：隐藏需修改 `uni_modules` 内文件，会被模块升级覆盖。建议在 ADM-03 停用 admin 账号后评估是否值得改；若改，记入 §5 必检清单。

---

## 3. 待裁定（影响实现方式与排期）

### ADM-19 ⚪ 已裁定 `unicloud-db` 客户端直连 vs 业务表 `permission: false`

**冲突根源**：uniCloud 有两条数据库访问路径，权限规则完全不同——客户端直连（JQL）受 schema 的 `permission` 控制；云函数 / 云对象**不受** `permission` 限制（云端是可信环境）。

两类表的设置正好相反：

```jsonc
// uni-id-users.schema.json        ← uni-admin 自带页面读的表
"permission": { "read": true, ... }

// grouporder-report.schema.json   ← 19 张业务表
"permission": { "read": false, "create": false, "update": false, "delete": false }
```

uni-admin 所有现成页面都走客户端直连，能跑是因为那些表 `read: true`。业务表是 `read: false`，**同样的写法会被数据库直接拒绝**。

**触发**：开始写任何一个读 `grouporder-*` 表的后台页面时。

**代价**：`unicloud-db` 组件免费提供的能力全部要自己实现——分页状态与翻页、`loading`/`error`/空态、`uni-table` 列头 `filter-type` 筛选与 `sortable` 排序（原本是把 `@filter-change`/`@sort-change` 直接转成 JQL 的 `where`/`orderby`）、`uni-forms` 基于 schema 的自动校验。

**影响范围**：17 屏中 **13 屏**（A-03～A-10、A-12～A-14 的业务日志部分、A-16～A-18）。不受影响的是 A-01 登录、A-15 账号角色权限、A-14 的登录日志——它们读 `uni-id-*`，本来就是 `read: true`。

**为什么不能干脆改成 `read: true`**（**2026-09-18 按 D-072 重述**：原先的三条理由中「脱敏」与「二次验证」已随 D-072 取消，但结论不变，理由变为下述两条）——

1. **审计**：OPS §13 要求每次数据访问与导出的成功与拒绝都写 `grouporder-oplog`。客户端直连时服务端不知道发生过这次读取——**D-072 取消脱敏后，全量审计成了唯一的约束手段，更不能旁路**
2. **动作型权限**：下架、恢复、警告、限制、审核这类写操作要在提交时重新校验账号状态与权限点，并做幂等（OPS §3.1、§12.2）。JQL 的静态 `permission` 表达式表达不了「以提交时刻为准」

更根本的是，客户端直连意味着前端可**自由构造查询条件**——页面上只给一个「按举报编号查」的输入框，但打开控制台就能查任意条件、翻任意数据。页面级限制在 JQL 面前不成立。

| 方案        | 做法                          | 代价                                                       |
| --------- | --------------------------- | -------------------------------------------------------- |
| **甲（建议）** | 业务页一律走云对象，`uni-table` 手动喂数据 | 13 屏要多写取数与分页逻辑，但「业务规则不可旁路」的原则完整保留                        |
| 乙         | 为运营端开放受限 JQL 只读权限           | 省事，但与 `DATA_MODEL.md` §1 结论冲突，且全量审计与提交时鉴权两条链路都难以在客户端强制执行 |

**状态**：**已裁定，采用方案甲**（2026-09-18，**D-075**）——业务页一律走云对象，19 张业务表的 `permission: false` 不变。裁定理由即上述两条：全量审计在 D-072 之后是唯一约束手段，客户端直连会旁路它；写操作必须以提交时刻的权限为准。已写入 `DECISIONS.md` D-075 与 `DATA_MODEL.md` §1。效果图 v2/v3 本就按方案甲绘制，形态不受影响。

### ADM-21 🟡 运营统计为实时聚合，无冗余统计字段

**依据**：`DATA_MODEL.md` §4.1 设计说明 7「不设任何 `stat_*` 冗余统计字段」，理由是冗余字段需在每次下单、取消、作废时维护，一致性风险真实。

**问题**：A-05 团长汇总要跨活动聚合「已发布活动数、有效订单数、有效总份数、预计金额」，A-06 还要下钻到商品级。按首版容量（每日新增活动 500 个、单活动 ≤500 人 ≤50 商品、注册用户 5 万），团长维度的跨活动聚合可能较慢。

**处理**：OPS §11.1 已预留出口——「统计页面应显示数据统计时间；若汇总存在处理延迟，必须明确标注数据截至时间」。实施时先实测聚合耗时，超出可接受范围再评估是否引入定时汇总表；**不要在业务主链路上加冗余字段**。

---

## 4. 待实测验证（从代码推断，非结论）

### ADM-22 🔵 `password` 字段可能缺字段级读权限

**位置**：`uniCloud-alipay/database/uni-id-users.schema.json`

38 个字段中 36 个配了字段级 `permission`，只有 `_id` 和 **`password`** 没配。按 uniCloud 规则，未配置的字段继承表级，而表级是 `read: true`。

**推断后果**：普通登录用户用 JQL 查 `uni-id-users` 可能读到 `password` 字段。uni-id 存的是加盐哈希而非明文，但哈希泄露仍可离线爆破。对照 `token` 字段是显式 `read: false` 的，`password` 看起来是官方 schema 的疏漏——与 `status` 枚举缺 `4` 属同类问题。

**验证方法**（需服务空间关联后执行）：客户端用普通用户身份执行

```js
uniCloud.database().collection('uni-id-users').field('password').limit(1).get()
```

能返回值则问题成立；被拒绝则说明 uniCloud 对该字段有内置保护。

**若成立的处理**：在项目目录的 `uni-id-users.schema.json` 覆盖版中为 `password` 补
`"permission": { "read": false, "write": false }`，**不改 `uni_modules`**，做法与 `status = 4` 的修正一致（`DATA_MODEL.md` §3）。

### ADM-23 🔵 空菜单分组是否已被组件处理

见 ADM-11。需实测：让一个未获 `ops-stat-view` 的账号登录，观察「运营统计」分组是否显示为空壳。

---

## 5. 模块升级 / 模板覆盖风险（升级后必检）

以下改动位于 `uni_modules` 内或会被模板还原，**每次升级 `uni-id-pages` 或 uni-admin 模板后必须逐项复核**：

| 编号 | 状态 | 文件 | 检查项 |
|---|---|---|---|
| ADM-24 | 🟠 | `uni_modules/uni-id-pages/config.js` | `isAdmin: true`、`loginTypes: ['username']`（D-069） |
| ADM-25 | 🟠 | `uni-id-users.schema.json` 覆盖版 | `status` 枚举是否仍缺 `4`（已注销），项目目录覆盖版是否还在（`DATA_MODEL.md` §3） |
| ADM-26 | 🟠 | `admin.config.js` | `staticMenu` 是否被还原为演示菜单 |
| ADM-27 | 🟠 | `pages.json` | demo 路由是否被还原 |
| ADM-28 | 🟠 | 三份 `*.init_data.json` | 菜单、角色、权限点初始数据是否被模板覆盖 |
| ADM-29 | 🟠 | `pages/system/user/list.vue` | 身份筛选器（ADM-02）与删除二次确认（ADM-07）是否被还原；**导出按钮与手机号邮箱列应当保留**（D-072） |
| ADM-30 | 🔴 | `uni_modules/uni-config-center/.../uni-id/config.json` | `tokenSecret`、`passwordSecret` 是否为 demo 值或被升级还原（见 ADM-01）。该文件在 `uni_modules` 内，升级必被覆盖 |

> `init_data.json` 的执行方式是 HBuilderX 右键「初始化云数据库」。**实施前需确认它是全量覆盖还是增量合并**——若线上菜单已被手工调整过，重新初始化可能覆盖掉调整。

---

## 6. 已处理（记录防回退）

| 编号 | 事项 | 处理方式 | 落地位置 |
|---|---|---|---|
| ADM-36 | ⚪ `admin.config.js` 的 `staticMenu` 硬编码 7 个演示条目，不受菜单表 `enable` 与 `permission` 控制，任何角色都能看到 | 清空为 `staticMenu: []` | `admin.config.js` |
| ADM-37 | ⚪ 44 条自带菜单含 uni 统计（30）、应用管理、App 升级中心、标签管理等与本项目无关项；其中支付统计与 D-005「不做支付」直接冲突 | 37 条置 `enable: false`（不删除记录——删掉后下次初始化会悄悄回来） | `opendb-admin-menus.init_data.json` |
| ADM-38 | ⚪ `pages/demo/table/` 纯演示页 | 删除 `table.vue` 与 `tableData.js`，移除两条 demo 路由 | `pages.json`、文件已删 |
| ADM-39 | ⚪ `ops-super` 缺 uni-admin 内置权限点，A-15 等页面会读不到数据（见 ADM-10） | 补 15 个内置权限点，刻意不含 `DELETE_UNI_ID_USERS` | `uni-id-roles.init_data.json`、`uni-id-permissions.init_data.json` |
| ADM-40 | ⚪ 误认为菜单 `permission` 字段存角色 id | 更正为权限点 id，重做权限模型：17 个自定义权限点 + 15 个内置 + 5 个角色 | `ADMIN_REUSE_MAP.md` §6 |

---

## 7. 变更记录

| 日期 | 版本 | 变化 |
|---|---|---|
| 2026-09-18 | v0.3 | 移除全部已作废与已修正条目的留痕，正文只列现存问题，现存 **32 条**：① 按 D-072 移除 **ADM-04**（导出按钮改为保留）、**ADM-05**（手机号邮箱列改为正常展示）、**ADM-08**（A-13 改为可下载）、**ADM-20**（二次验证有效期与会话过期的矛盾不复存在）；② **ADM-31～35** 五条文档不一致已全部修正，连同 §6「文档不一致」整节一并移除，原 §7 已处理、§8 变更记录前移为 §6、§7；③ 顶部的 D-072 变更横幅移除，内容并入本表。**编号不重排，移除条目的编号保留空缺** |
| 2026-09-18 | v0.2 | D-072 补漏：ADM-19 的「为什么不能改 read: true」由脱敏/二次验证/审计三条理由重述为全量审计 + 提交时鉴权两条（结论不变，仍走方案甲）；影响范围 18 屏 14 屏改为 17 屏 13 屏；`grouporder-oplog` 事件类别 11 → 10；配套效果图注明 v2 画于 D-072 之前 |
| 2026-09-18 | v0.1 | 建立清单，共 **41 条**：🔴 高危 3、🟠 必处理 22、🟡 待裁定 3、🔵 待验证 2、📄 文档不一致 5、⚪ 已处理 6（其中 ADM-24～30 这 7 条同时属「模块升级必检」，ADM-30 因涉及密钥被同时标为高危）。同日处理 ADM-01：两工程密钥统一为新随机值；新增 ADM-41（uni-starter 预置测试用户数据）。新增记录 `tokenSecret`/`passwordSecret` 仍为示例值（ADM-01）、二次验证有效期与会话过期的关系（ADM-20）、运营统计实时聚合的性能出口（ADM-21）、`ops-super` 缺内置权限点（ADM-39，已修） |
| 2026-09-18 | v0.4 | **ADM-19 裁定完成**（方案甲，D-075），状态由 🟡 待裁定改为 ⚪ 已裁定，现存待处理问题 32 → **31 条**；ADM-03 描述中的「敏感资料查看」措辞随 A-11 取消一并改写 |
| 2026-09-18 | v0.5 | 按 **D-076**（超管全权）改写 ADM-03 的停用理由（从「权限隔离」改为「admin 绕过权限体系、操作无法归因」）与 ADM-10 的权限点说明；**ADM-41 处理完成**（`uni-id-users.init_data.json` 已清空为 `[]`），现存待处理问题 31 → **30 条** |
