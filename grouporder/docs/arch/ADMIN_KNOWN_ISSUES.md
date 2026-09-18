# 运营后台 · 已知问题与风险清单

- 文档版本：v0.1
- 日期：2026-09-18
- 性质：**实施参考**。记录 uni-admin 模板与本项目规则之间已发现的冲突、缺陷与待验证事项，供开发运营后台时逐条核对
- 事实来源：`grouporder-admin` 工程实际代码（逐文件核对）、`OPS_ADMIN_REQUIREMENTS.md` v0.9、`DECISIONS.md` v1.7、`DATA_MODEL.md` v1.6
- 配套：`ADMIN_REUSE_MAP.md` v0.2（复用盘点与权限模型）、`prototype/admin/admin-mockup-v2.html`（18 屏效果图）

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

**依据**：uniCloud 官方要求生产环境替换；OPS §13「日志不得记录密码、二次验证凭证」的前提是凭证本身可信。

### ADM-02 🔴 `system/user/list.vue` 查询条件为空，会列出全部小程序用户

**位置**：`pages/system/user/list.vue`，`const whereState = ref('')`

**触发**：直接复用该页作为 A-15「运营账号」。

**后果**：D-038 规定「账号体系复用 uni-id，不自建用户表」，**小程序平台用户与运营账号同表**。空 `where` 会列出全部用户（首版估算 5 万），并展示昵称、手机号、邮箱、最后登录时间，页面还带批量删除与导出 Excel 按钮。这不是「字段不该露」，而是「对象根本不对」。

**处理**：`where` 增加运营角色过滤，只列持有 `ops-*` 角色的账号。小程序用户的查询归 A-04 全局检索，走云对象 + 脱敏，两条路径不可混用。

**依据**：OPS §4.9 页面定位为「运营账号与权限」；OPS §8.2「活动、用户和订单列表默认脱敏」；D-029 不采集手机号。

### ADM-03 🔴 初始化用的 `admin` 账号必须停用

**位置**：`uni_modules/uni-id-common/uniCloud/cloudfunctions/common/uni-id-common/index.js` 的 `getUserPermission()`（压缩代码）

```js
if (role.includes("admin")) return { role, permission: [] }   // 跳过权限查询，视为全权
```

**后果**：内置 `admin` 角色**不受任何 permission 控制，自动拥有全部菜单与接口权限**，包括敏感资料查看。而 `registerAdmin` 云函数写死 `role: ['admin']`。若 admin 账号长期启用，OPS §3.1「超级管理员不自动继承内容处置、敏感资料访问或审计查看权限」形同虚设。

**处理**：按 `ADMIN_REUSE_MAP.md` §8 的六步流程，用 admin 创建业务账号后**立即停用 admin**，保留记录以备应急。日常运营一律使用 `ops-*` 账号。

---

## 2. 实施时必须处理

### 2.1 A-15 运营账号页（复用 `system/user/list.vue`）

除 ADM-02 外还有四处：

| 编号     | 状态  | 现状                                | 处理                              | 依据             |
| ------ | --- | --------------------------------- | ------------------------------- | -------------- |
| ADM-04 | 🟠  | 按钮组自带 `<download-excel>` 导出 Excel | 删除该按钮                           | OPS §15 不提供导出  |
| ADM-05 | 🟠  | 表格含手机号码、邮箱两列且带搜索筛选                | 隐藏两列                            | D-029；默认脱敏     |
| ADM-06 | 🟠  | 角色列直接渲染 `item.role` 原始值           | 映射为 4 个中文角色名，`ops-stat-view` 单列 | OPS §3.2       |
| ADM-07 | 🟠  | 按钮组含批量删除                          | 删除，只保留停用                        | OPS §3.1 只提到停用 |

> ADM-07 已在数据库层加了一道保险：`DELETE_UNI_ID_USERS` **刻意未登记到 `uni-id-permissions`**，因此权限管理页里没有该选项、无法通过 UI 分配。即使有人恢复了批量删除按钮，schema 的 `delete` 表达式也会拒绝。

### ADM-41 🟠 `uni-id-users.init_data.json` 含 uni-starter 预置测试用户

**位置**：`uniCloud-alipay/database/uni-id-users.init_data.json`

```json
[{ "_id": "_uni_starter_test_user_id", "username": "uni-starter预置用户名",
   "nickname": "测试用户昵称", "mobile": "18888888888", "mobile_confirmed": 1 }]
```

**后果**：执行「初始化云数据库」时，这条 uni-starter 的演示数据会被写入 `uni-id-users` 表。它无 `password`、无 `role`，因此**不能登录、也不具备任何权限**，不构成安全问题；但它会：

1. 出现在 A-15 运营账号列表里（若未按 ADM-02 加角色过滤）与 A-04 用户检索结果中，成为一条无法解释的脏数据
2. 带一个假手机号 `18888888888`，与 D-029「账号不采集手机号」的原则相悖
3. 使「注册用户数」等统计口径出现 +1 偏差

**处理**：初始化前把该文件内容清空为 `[]`。**这是删除数据，需产品确认后再执行。**

### ADM-08 🟠 `<download-excel>` 组件不得出现在 A-13

**触发**：开发 A-13 Excel 事件审计页时，照惯例从 `system/user/list.vue` 复制按钮组。

**后果**：OPS §10 明令「运营人员不能通过日志下载、预览或重新生成团长清单」。清单含收货人姓名、电话、地址，这是全后台最敏感的数据出口。

**处理**：A-13 只展示事件记录，不得有下载按钮、不得显示任何下载地址（含已过期的）。

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

**处理**：已在 `uni-id-roles.init_data.json` 中为 `ops-super` 补上 14 个 uni-admin 内置权限点（不含 `DELETE_UNI_ID_USERS`）。**后续新增任何直连 `uni-id-*` 表的页面时，都要同步检查是否缺内置权限点。**

### ADM-11 🟠 菜单分组会留下空壳

**位置**：同 ADM-09 的过滤逻辑，`return true` 分支——**分组节点一律保留，不参与过滤**。

**后果**：若某分组下所有叶子菜单都被权限过滤掉，分组标题仍会渲染，点击无反应。例如未获 `ops-stat-view` 的账号会看到一个空的「运营统计」分组。

**处理**：实测确认 `buildMenus` 是否已处理空分组；若未处理，在 `leftWindow.vue` 的 `getUserMenu` 后补一步「移除无可见子项的分组」。当前 5 个分组（内容治理、运营统计、账号与隐私、审计、系统管理）都有此风险。

### ADM-12 🟠 菜单权限控制不了数据粒度

**后果**：OPS §3.2 里这几条差异，菜单层无法表达——

| 能力 | 内容运营 | 账号与隐私专员 | 审计查看者 |
|---|---|---|---|
| 查看 Excel 事件 | 仅关联活动摘要 | 仅限处理事项 | 全量只读 |
| 查看审计日志 | 仅本人和关联案件 | 仅本人和关联事项 | 全量只读 |

三个角色都持有 `ops-audit-export`，看到的是同一个菜单入口，但**允许看到的数据范围不同**。

**处理**：必须在页面内、由云对象按当前角色过滤数据。菜单权限只是第一道门。

### ADM-13 🟠 A-13 与 A-14 数据源不同，不可合并为一页

**后果**：登录类日志在 `uni-id-log`（`pages/system/safety/list.vue` 已实现），业务操作日志在 `grouporder-oplog`（9 字段、11 类事件）。两者字段与检索条件完全不同，合并会导致列对不齐、筛选条件互相污染。

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

### ADM-19 🟡 `unicloud-db` 客户端直连 vs 业务表 `permission: false`

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

**影响范围**：18 屏中 **14 屏**（A-03～A-14 的业务日志部分、A-16～A-18）。不受影响的是 A-01 登录、A-15 账号角色权限、A-14 的登录日志——它们读 `uni-id-*`，本来就是 `read: true`。

**为什么不能干脆改成 `read: true`**：JQL 的 `permission` 是静态表达式，表达不了本项目需要的三类规则——

1. **脱敏**：A-04 列表要显示 `张**`、`138****2468`。字段级权限只有「能读/不能读」，没有「读到掩码」
2. **二次验证**：A-11 要求「密码验证通过 + 在 1 天有效期内 + 授权 scope 覆盖这一笔订单」才能看完整地址。这三个条件在 `grouporder-ops-verify` 表里，schema 表达式查不了另一张表的状态
3. **审计**：OPS §13 要求每次敏感字段访问的成功与拒绝都写 `grouporder-oplog`。客户端直连时服务端不知道发生过这次读取

更根本的是，客户端直连意味着前端可**自由构造查询条件**——页面上只给一个「按举报编号查」的输入框，但打开控制台就能查任意条件、翻任意数据。页面级限制在 JQL 面前不成立。

| 方案 | 做法 | 代价 |
|---|---|---|
| **甲（建议）** | 业务页一律走云对象，`uni-table` 手动喂数据 | 14 屏要多写取数与分页逻辑，但「业务规则不可旁路」的原则完整保留 |
| 乙 | 为运营端开放受限 JQL 只读权限 | 省事，但与 `DATA_MODEL.md` §1 结论冲突，且脱敏、二次验证、审计三条链路都难以在客户端强制执行 |

**状态**：未裁定。效果图 v2 按方案甲绘制（表格形态一致，差别只在数据来源，不影响视觉）。裁定后写入 `DATA_MODEL.md`。

### ADM-20 🟡 二次验证「1 天有效期」与会话 2 小时过期的关系

**位置**：`uni-config-center/uni-id/config.json`

```json
"tokenExpiresIn": 7200,        // web 端 2 小时
"tokenExpiresThreshold": 3600  // 剩余不足 1 小时自动续期
```

**问题**：D-068 规定二次验证有效期 **1 天**，且免于重复验证需同时满足「同一事项 + 同一授权对象 + **同一会话**」。但后台会话 token 只有 2 小时（持续操作会自动续期）。运营离开超过 2 小时后 token 过期，重新登录即为新会话，二次验证必须重做。

**实际效果**：1 天是**上限而非保证**，多数情况下会话先失效。

**处理**：`grouporder-ops-verify.expire_time` 按 +1 天写入，但校验时**必须同时判定会话是否延续**（记录签发时的 token 或会话标识）。若只按 expire_time 判断，会出现「重新登录后仍免验证」的情况，违反 OPS §8.2「页面重新打开、会话失效、账号停用或权限撤销后必须重新校验」。需产品确认是否要把 token 有效期与二次验证有效期对齐。

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
| ADM-29 | 🟠 | `pages/system/user/list.vue` | ADM-02、ADM-04～07 的五处裁剪是否被还原 |
| ADM-30 | 🔴 | `uni_modules/uni-config-center/.../uni-id/config.json` | `tokenSecret`、`passwordSecret` 是否为 demo 值或被升级还原（见 ADM-01）。该文件在 `uni_modules` 内，升级必被覆盖 |

> `init_data.json` 的执行方式是 HBuilderX 右键「初始化云数据库」。**实施前需确认它是全量覆盖还是增量合并**——若线上菜单已被手工调整过，重新初始化可能覆盖掉调整。

---

## 6. 文档不一致（需同步，不影响开发）

| 编号 | 位置 | 问题 |
|---|---|---|
| ADM-31 | 📄 `OPS_ADMIN_REQUIREMENTS.md` §4.3 第 126 行 | 仍写「通过后活动才进入进行中并可公开访问、**进入首页列表**和分享」，与 D-059「活动不进入任何公开列表」冲突。这是 v1.3 废止 D-047 后的残留，建议删除「进入首页列表和」 |
| ADM-32 | 📄 `UX_FLOW_SPEC.md` §3.1 | 仍缺 **M-30（商品库分类管理）、M-31（历史接龙选择）**，而 `update.md` 批次 C 与 `ACTIVITY_COPY_SPEC.md` §7 都要求这两个页面 |
| ADM-33 | 📄 `DATA_MODEL.md` v1.6 | 仍称 18 张自建表，实际已有 **19 张**（`grouporder-goods-category` 未收录，其定义目前只在 `GOODS_LIB_SPEC.md` §3.5） |
| ADM-34 | 📄 `DATA_MODEL.md` §11.1 | 产物文件数写「36 个」「37 个文件」，与实际 **39 个**（19 表 × 2 + `uni-id-users` 覆盖版）不符 |
| ADM-35 | 📄 `docs/update.md` §0 | 「当前代码现状」已过时：其中称 `goods-lib` 无 `is_recommend`/`category_id`、`goods-category` 不存在，实际三项均已落地 |

---

## 7. 已处理（记录防回退）

| 编号 | 事项 | 处理方式 | 落地位置 |
|---|---|---|---|
| ADM-36 | ⚪ `admin.config.js` 的 `staticMenu` 硬编码 7 个演示条目，不受菜单表 `enable` 与 `permission` 控制，任何角色都能看到 | 清空为 `staticMenu: []` | `admin.config.js` |
| ADM-37 | ⚪ 44 条自带菜单含 uni 统计（30）、应用管理、App 升级中心、标签管理等与本项目无关项；其中支付统计与 D-005「不做支付」直接冲突 | 37 条置 `enable: false`（不删除记录——删掉后下次初始化会悄悄回来） | `opendb-admin-menus.init_data.json` |
| ADM-38 | ⚪ `pages/demo/table/` 纯演示页 | 删除 `table.vue` 与 `tableData.js`，移除两条 demo 路由 | `pages.json`、文件已删 |
| ADM-39 | ⚪ `ops-super` 缺 uni-admin 内置权限点，A-15 等页面会读不到数据（见 ADM-10） | 补 14 个内置权限点，刻意不含 `DELETE_UNI_ID_USERS` | `uni-id-roles.init_data.json`、`uni-id-permissions.init_data.json` |
| ADM-40 | ⚪ 误认为菜单 `permission` 字段存角色 id | 更正为权限点 id，重做权限模型：18 个自定义权限点 + 14 个内置 + 5 个角色 | `ADMIN_REUSE_MAP.md` §6 |

---

## 8. 变更记录

| 日期 | 版本 | 变化 |
|---|---|---|
| 2026-09-18 | v0.1 | 建立清单，共 **41 条**：🔴 高危 3、🟠 必处理 22、🟡 待裁定 3、🔵 待验证 2、📄 文档不一致 5、⚪ 已处理 6（其中 ADM-24～30 这 7 条同时属「模块升级必检」，ADM-30 因涉及密钥被同时标为高危）。同日处理 ADM-01：两工程密钥统一为新随机值；新增 ADM-41（uni-starter 预置测试用户数据）。新增记录 `tokenSecret`/`passwordSecret` 仍为示例值（ADM-01）、二次验证有效期与会话过期的关系（ADM-20）、运营统计实时聚合的性能出口（ADM-21）、`ops-super` 缺内置权限点（ADM-39，已修） |
