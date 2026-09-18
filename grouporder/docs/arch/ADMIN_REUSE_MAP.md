# 运营后台 · uni-admin 复用与改造盘点

- 文档版本：v0.2
- 日期：2026-09-17
- 性质：**实施依据**。回答「17 屏里哪些是现成的、哪些要改、哪些真要从零写」
- 事实来源：`grouporder-admin` 工程实际代码（已逐文件核对）、`OPS_ADMIN_REQUIREMENTS.md` v0.9、`DECISIONS.md` v1.7
- 配套：`prototype/admin/admin-mockup-v2.html`（按本文结论绘制）、**`ADMIN_KNOWN_ISSUES.md`（已知问题与风险清单，40 条，实施时逐条核对）**
- **v0.2 起本文不只是盘点，§6～§9 的结论已落地到工程文件**（菜单、角色、权限点初始数据与 `admin.config.js`）

> 产生背景：效果图 v1 把 A-01 登录、A-15 账号权限、左侧菜单、顶栏都当成全新页面画了，而这些在 uni-admin 模板中已经存在。本文把「已有什么」核对清楚，避免重复开发。

---

## 1. uni-admin 已提供的能力（工程内实测）

### 1.1 布局骨架：不需要写

| 部件 | 文件 | 说明 |
|---|---|---|
| 顶栏 | `windows/topWindow.vue` | logo + 汉堡 + **页面标题** + 主题/语言选择器 + 用户菜单。注意面包屑**不在**顶栏 |
| 侧边菜单 | `windows/leftWindow.vue` | `uni-data-menu` 组件，**数据源是 `opendb-admin-menus` 表**，`where="enable==true"`、`orderby="sort asc"`，激活色 `#409eff` |
| 菜单权限过滤 | 同上 + `admin.config.js` | 菜单表的 `permission` 字段与 uni-id 权限点比对，无权者不渲染 |
| 面包屑 | `uni-stat-breadcrumb` 组件 | 放在每个页面的 `.uni-header` 内 |
| 404 / 错误日志 | `pages/error/404.vue`、`windows/components/error-log.vue` | 现成 |

**结论：左侧菜单的信息架构不是「画一张图」，而是一份 `opendb-admin-menus` 初始数据 + 权限点配置。** 效果图里的菜单只是它的可视化。

### 1.2 账号 / 角色 / 权限：已完整实现

| 能力 | 文件 | 可复用度 |
|---|---|---|
| 运营账号列表 | `pages/system/user/list.vue` | 高，需裁剪 |
| 账号新增 / 编辑 | `pages/system/user/{add,edit}.vue` | 高 |
| 角色管理 | `pages/system/role/{list,add,edit}.vue` | 高 |
| 权限点管理 | `pages/system/permission/{list,add,edit}.vue` | 高 |
| 菜单管理 | `pages/system/menu/{list,add,edit}.vue` | 高 |
| 登录页 | `uni_modules/uni-id-pages/pages/login/login-withpwd.vue` | 直接用 |
| 登录日志 | `pages/system/safety/list.vue`（基于 `uni-id-log`） | 中 |

### 1.3 通用组件：直接用

`uni-table`（含列头筛选与排序）、`uni-forms`、`uni-popup`、`uni-notice-bar`、`uni-pagination`、`uni-data-select`、`uni-datetime-picker`、`uni-tag`、`uni-badge`、`uni-file-picker`、`qiun-data-charts`。

---

## 2. uni-admin 的真实视觉与交互（v2 效果图的绘制依据）

以下为工程内 `common/uni.css`、`uni.scss`、`uni_modules/uni-table` 的实测值，**不是推测**。

### 2.1 色值（`uni.scss` L20-23）

| 用途 | 值 |
|---|---|
| 主色 primary | `#2979ff` |
| 成功 success | `#18bc37` |
| 警告 warning | `#f3a73f` |
| 错误 error | `#e43d33` |
| 按钮 `type="warn"` | 同 error `#e43d33` |
| 菜单激活 | `#409eff` |
| 正文 / 辅助文字 | `#333` / `#999` |

### 2.2 页面骨架

```
uni-page-wrapper   padding 15px，背景 #f5f5f5
  └ uni-page-body  白色整卡，border-radius 5px，阴影      ← 关键：内容区是一张白卡
      ├ .uni-header      min-height 55px，padding 0 15px，下边框 1px #f5f5f5
      │    左：<uni-stat-breadcrumb>
      │    右：<view class="uni-group">  uni-search + uni-button(mini) 若干
      └ .uni-container   padding 15px
           ├ (可选) <uni-notice-bar>  提示条
           ├ (可选) <view class="uni-stat--x p-m">  子卡片，radius 4px + 阴影 + mb 15px
           ├ <uni-table border stripe>
           └ <view class="uni-pagination-box">  居中
```

### 2.3 表格（`uni_modules/uni-table`）

| 项 | 实测值 |
|---|---|
| 边框色 | `#ebeef5` |
| 表头 `uni-th` | padding 12px 10px，14px，色 `#909399`，**无背景色**（源码中已注释掉） |
| 单元格 `uni-td` | padding 8px 10px，14px，色 `#606266` |
| 斑马纹 | 偶数行 `#fafafa` |
| 悬停 | `#f5f7fa` |
| 对齐 | uni-admin 现有页面**全部 `align="center"`** |
| 列头筛选 | `filter-type="search" / "select" / "timestamp"`，**筛选长在列头里** |
| 列头排序 | `sortable` + `@sort-change` |
| 操作列 | `class="uni-group"` 包 **mini 按钮**（`type="primary"` 编辑、`type="warn"` 删除），不是文字链接 |

### 2.4 控件

| 控件 | 实测值 |
|---|---|
| `.uni-search` | 268×28，12px，边框 `#dcdfe6`，文字 `#606266` |
| `.uni-button` | padding 10px 20px，14px，radius 4px；列表页一律 `size="mini"` |
| 弹窗 | `uni-popup` + `uni-popup-dialog` |
| 提示条 | `uni-notice-bar`，可配 `background-color` / `color` |

### 2.5 v1 效果图与实际不符之处（v2 已全部修正）

| # | v1 画法 | uni-admin 实际 |
|---|---|---|
| 1 | 内容区灰底 + 多张独立卡片 | **白色整卡**，内部用 `uni-stat--x` 分区 |
| 2 | 表头灰底 `#f7f9fc` | 表头**白底**无背景 |
| 3 | 表格列左对齐 | **居中对齐** |
| 4 | 表格上方独立筛选表单区 | **筛选在列头**（`filter-type`） |
| 5 | 操作列文字链接 | **mini 按钮** |
| 6 | 面包屑在顶栏 | 面包屑在**页面 `.uni-header`** 内，顶栏放页面标题 |
| 7 | 自研 `.btn` 样式 | `uni-button` + `size="mini"` |
| 8 | A-01 / A-15 当作新页面画 | **均已存在**，见 §3 |

---

## 3. 逐屏盘点（A-01～A-18，共 17 屏）

图例：**◆ 复用** = 现成页面，改配置即可；**◇ 改造** = 在现成页面上增删；**○ 新建** = 需从零开发（但仍复用组件）。

| 屏 | 页面 | 结论 | 对应既有资产 / 改造点 |
|---|---|---|---|
| A-01 | 运营登录 | **◆ 复用** | `uni-id-pages/pages/login/login-withpwd.vue`。改 `uni_modules/uni-id-pages/config.js`：`loginTypes: ['username']`、`isAdmin: true`（D-069）。**不新建页面。** 注意该文件在模块升级后会被默认值覆盖，每次升级需重新核对 |
| A-02 | 验证与访问结果 | **○ 新建** | 结果态页复用 `pages/error/404.vue` 的形态 |
| A-03 | 工作台 | **◇ 改造** | `pages/index/index.vue`。**移除** uni-stat 的设备/用户概览表格与平台选择 tabs，**换成** D-070 的三档待办 + 本人最近处理记录。保留 `uni-notice-bar` 与 `uni-stat--x` 卡片结构 |
| A-04 | 全局检索 | **○ 新建** | uni-admin 无全局检索。复用 `uni-table` 列头筛选 + `uni-pagination`；Tab 切换用 `uni-stat-tabs type="boldLine"` |
| A-05 | 运营统计 | **○ 新建** | `pages/uni-stat/*` 是 **uni 应用统计**（设备、留存、错误），与业务数据不通，**不可复用数据层**。可复用 `uni-stat--x` 卡片、`uni-stat-tabs`、`qiun-data-charts` |
| A-06 | 团长与活动统计 | **○ 新建** | 同上 |
| A-07 | 活动与商品详情 | **○ 新建** | 复用 `uni-table` + `uni-tag` + `uni-popup` |
| A-08 | 举报与内容审核 | **○ 新建** | 复用 `uni-table` + `uni-forms` |
| A-09 | 下架 / 恢复确认 | **○ 新建** | 弹窗用 `uni-popup` + `uni-popup-dialog` |
| A-10 | 发布者处置 | **○ 新建** | 复用 `uni-forms` + `uni-datetime-picker`（临时限制起止） |
| A-12 | 账号绑定申诉 | **○ 新建** | 复用 `uni-table` + `uni-forms` |
| A-13 | Excel 事件审计 | **○ 新建** | 复用 `uni-table` 列头筛选 |
| A-14 | 日志与审计 | **◇ 部分复用** | **登录类事件**：`pages/system/safety/list.vue` 已基于 `uni-id-log` 实现，可直接挂菜单。**业务操作日志**：`grouporder-oplog` 的 9 字段与 10 类事件需新建页面，两者**不要合并**（数据源不同） |
| A-15 | 运营账号与权限 | **◆ 复用 + ◇ 改造** | `pages/system/user/{list,add,edit}.vue`、`system/role/*`、`system/permission/*` 六页现成。改造点见 §4 |
| A-16 | 隐私与注销事项 | **○ 新建** | 复用 `uni-table` + `uni-forms` |
| A-17 | 活动发布审核 | **○ 新建** | 复用 `uni-table` + `uni-forms` |
| A-18 | 平台配置 | **○ 新建** | uni-admin 无通用配置页。复用 `uni-forms` + `uni-popup`（二次确认） |

**合计：复用 2 屏（A-01、A-15，后者含改造）、改造 2 屏（A-03、A-14）、新建 14 屏。** 真正省下的是登录与账号权限两块，其余是业务页面，模板不可能自带。

---

## 4. A-15 复用 `system/user/list.vue` 的五处必改

### 4.1 ① 查询范围错误（最严重，先改这条）

页面的查询条件是 `const whereState = ref('')` —— **空条件，列 `uni-id-users` 全表**。

而 D-038 规定「账号体系复用 uni-id，不自建用户表」，**小程序的平台用户与运营账号在同一张表里**。照搬此页作为「运营账号管理」，结果是列出全部小程序用户（首版估算 5 万），带昵称、手机号、邮箱、最后登录时间，还配着批量删除与导出 Excel 按钮。

这不是「字段不该露」，而是「对象根本不对」。

**必须改为**：`where` 增加运营角色过滤，只列持有 `ops-*` 角色的账号。小程序用户的查询归 A-04 全局检索，走云对象（D-072 起不脱敏，但仍须逐次鉴权并入审计），两条路径不可混用。

### 4.2 其余四处

| # | uni-admin 现状 | 必须改为 | 依据 |
|---|---|---|---|
| ② | 按钮组自带 `<download-excel>` **导出 Excel** | **保留**（D-072 导出放开）。但导出对象须先按 §4.1 收窄为运营账号，且每次导出写入审计 | D-072；OPS §13 |
| ③ | 表格含**手机号码**、**邮箱**两列且带搜索筛选 | **隐藏两列** | D-029 账号不采集手机号，列恒为空且易误导；与脱敏无关 |
| ④ | 角色列直接渲染 `item.role` 原始值 | 映射为 **4 个中文角色名**，并将 `ops-stat-view` 单列 | OPS §3.2；统计权限是独立权限点，不随角色获得 |
| ⑤ | 按钮组含**批量删除** | **保留删除**，但须弹出二次确认窗、要求输入 `delete` 才执行；停用与删除分开呈现 | D-072；OPS §3.1（停用与删除是两回事） |

> `<download-excel>` 用到 A-13 Excel 事件审计页时注意：D-072 起运营**可以**下载团长清单，但下载必须**重新校验权限并换取新的临时地址**，页面不得显示或复用审计记录中的历史地址（D-071③）。直接把日志里存的地址渲染成链接是错的。

---

## 5. 必须先解决的架构冲突：`unicloud-db` 直连 vs 全表 `permission: false`

- uni-admin 全部现成页面的取数方式是 `<unicloud-db :collection="…">`，即**客户端 JQL 直连数据库**。
- 但 `DATA_MODEL.md` §1 规定：**19 张 `grouporder-*` 表的 `permission` 全部为 false，客户端不可直连，所有读写走云函数**。理由是本业务有发布审核、治理下架、限购、库存原子扣减等规则，开放 JQL 会使规则可被旁路。

两者不兼容，后果：

1. 所有 `grouporder-*` 表的后台页面**不能用 `unicloud-db` + `uni-table` 的零代码组合**，须自行调云对象取数再喂给 `uni-table`，分页与列头筛选也要自己接。
2. `system/user/*` 等页面**不受影响**（`uni-id-users` 是 uni-id 自己的权限体系）。
3. 工作量与「零代码列表页」相比显著增加，须在排期时计入。

| 方案 | 做法 | 代价 |
|---|---|---|
| **甲（建议）** | 业务页一律走云对象，`uni-table` 手动喂数据 | 开发量增加，但「业务规则不可旁路」的原则完整保留 |
| 乙 | 为运营端开放受限 JQL 只读权限 | 省事，但与 DATA_MODEL §1 冲突，且逐次鉴权与审计两条链路难以在客户端强制执行 |

**本文不裁决，提请产品负责人与架构确认后写入 `DATA_MODEL.md`。** 效果图 v2 按方案甲绘制（表格形态一致，差别只在数据来源）。

---

## 6. 权限模型（已落地）

### 6.1 一个必须先纠正的认知

`opendb-admin-menus` 的 `permission` 字段存的是**权限点 id（`permission_id`），不是角色 id**。本文 v0.1 在此处写错，v0.2 已更正。

过滤逻辑在 `components/uni-data-menu/uni-data-menu.vue`：

```js
const { permission, role } = uniCloud.getCurrentUserInfo();
if (!role.includes('admin')) {
  menuList = menuList.filter((item) => {
    if (item.isLeafNode) {
      if (item.permission && item.permission.length) {
        return item.permission.some((p) => permission.indexOf(p) > -1);
      }
      return false;          // ← 叶子节点 permission 为空 = 对非 admin 完全不可见
    }
    return true;             // ← 分组节点一律保留，不参与过滤
  });
}
```

由此得出三条硬约束：

1. **叶子菜单的 `permission` 不能为空**，否则除内置 `admin` 外无人可见。uni-admin 自带 44 条菜单的 `permission` 全是 `[]`，这正是它们默认只有 admin 能看到的原因。
2. **分组节点不过滤**。若某分组下所有叶子都被过滤掉，会留下一个空壳分组，这是 uni-admin 的已知行为。
3. **`role` 含 `admin` 时跳过全部过滤**，见 §8。

### 6.2 18 个权限点（`uni-id-permissions.init_data.json`）

| permission_id           | 名称         | 对应页面                                                 |
| ----------------------- | ---------- | ---------------------------------------------------- |
| `ops-workbench`         | 工作台        | A-03。**全部角色必须持有**，缺少它登录后看不到任何菜单                      |
| `ops-content-review`    | 活动发布审核     | A-17                                                 |
| `ops-content-report`    | 举报与内容审核    | A-08                                                 |
| `ops-content-activity`  | 活动与商品治理    | A-07、A-09、A-10                                       |
| `ops-search`            | 全局检索       | A-04                                                 |
| `ops-stat-view`         | 运营统计查看     | A-05、A-06。**独立权限点，默认不绑定任何角色**                        |
| `ops-privacy-appeal`    | 账号绑定申诉     | A-12                                                 |
| `ops-privacy-case`      | 隐私与注销事项    | A-16                                                 |
| `ops-audit-export`      | Excel 事件审计 | A-13                                                 |
| `ops-audit-oplog`       | 操作日志查询     | A-14 业务日志                                            |
| `ops-audit-login`       | 登录日志查询     | A-14 登录日志（复用 `system/safety/list`）                   |
| `ops-sys-account`       | 运营账号管理     | A-15                                                 |
| `ops-sys-role`          | 角色管理       | `system/role`                                        |
| `ops-sys-permission`    | 权限管理       | `system/permission`                                  |
| `ops-sys-menu`          | 菜单管理       | `system/menu`                                        |
| `ops-sys-config`        | 平台配置       | A-18                                                 |
| `ops-sys-error`         | 错误统计       | 技术排障。**归属已确认：挂在超级管理员下**（产品负责人 2026-09-17）；启用条件见 §7.5 |

### 6.3 5 个角色（`uni-id-roles.init_data.json`）

| role_id | 名称 | 权限点 |
|---|---|---|
| `admin` | 系统初始化账号（内置全权） | `[]` —— 不受 permission 控制，见 §8 |
| `ops-super` | 超级管理员 | workbench、sys-account、sys-role、sys-permission、sys-menu、sys-config、sys-error |
| `ops-content` | 内容运营 | workbench、content-review、content-report、content-activity、search、audit-export |
| `ops-privacy` | 账号与隐私专员 | workbench、search、privacy-appeal、privacy-sensitive、privacy-case、audit-export |
| `ops-auditor` | 审计查看者 | workbench、audit-export、audit-oplog、audit-login |

**`ops-super` 不含任何业务权限点**，这是 OPS §3.1「超级管理员不自动继承内容处置、敏感资料访问或审计查看权限」的落地方式。

各角色实际可见的叶子菜单（已机械校验）：

| 角色 | 可见菜单 |
|---|---|
| 超级管理员 | 工作台 / 运营账号 / 角色管理 / 权限管理 / 菜单管理 / 平台配置 |
| 内容运营 | 工作台 / 活动发布审核 / 举报与内容审核 / 活动与商品 / 全局检索 / Excel 事件 |
| 账号与隐私专员 | 工作台 / 全局检索 / 账号绑定申诉 / 敏感资料查看 / 隐私与注销事项 / Excel 事件 |
| 审计查看者 | 工作台 / Excel 事件 / 操作日志 / 登录日志 |

> **菜单只能控制入口，控制不了数据粒度。** OPS §3.2 中「内容运营仅查看关联活动摘要」「隐私专员仅限处理事项」「审计查看者只读全量」这类差异，必须在**页面内按角色过滤数据**，不能指望菜单权限。

### 6.4 菜单结构（`opendb-admin-menus.init_data.json`，共 60 条 / 启用 23 条）

```
工作台                      ops-workbench
内容治理（分组）
  活动发布审核              ops-content-review
  举报与内容审核            ops-content-report
  活动与商品                ops-content-activity
全局检索                    ops-search
运营统计（分组）
  统计总览                  ops-stat-view
  团长与活动                ops-stat-view
账号与隐私（分组）
  账号绑定申诉              ops-privacy-appeal
  敏感资料查看              ops-privacy-sensitive
  隐私与注销事项            ops-privacy-case
审计（分组）
  Excel 事件                ops-audit-export
  操作日志                  ops-audit-oplog
  登录日志                  ops-audit-login     ← 复用 pages/system/safety/list
系统管理（分组）
  运营账号                  ops-sys-account     ← 复用 pages/system/user/list（须按 §4 裁剪）
  角色管理                  ops-sys-role
  权限管理                  ops-sys-permission
  菜单管理                  ops-sys-menu
  平台配置                  ops-sys-config
```

页面路径为建议值，架构阶段可调整，但须与菜单数据保持一致。

---

## 7. 自带资产处置清单（已落地）

### 7.1 菜单：关闭而非删除

37 条自带菜单置 `enable: false`，**不删除记录**。原因：删掉后下次执行 `db_init.json` 初始化会悄悄回来，而 `enable: false` 能明确表达「这是刻意关掉的」。

| 分组 | 条数 | 处置 | 理由 |
|---|---|---|---|
| uni 统计（含支付统计） | 30 | 关闭 | 应用级技术统计，与业务数据不通；支付统计与 D-005「不做支付」直接冲突 |
| 应用管理 | 1 | 关闭 | 多 appid 管理，为 uni 统计与升级中心服务 |
| App 升级中心 | 1 | 关闭 | 本项目是小程序，无 App 版本升级 |
| 标签管理 | 1 | 关闭 | `uni-id-tag` 给用户打标签，属用户画像，OPS §15 明确不做 |
| 安全审计（分组） | 1 | 关闭 | 其下「用户日志」已挪入新的「审计」分组，分组本身冗余 |
| 首页 / 系统管理 4 项 / 用户日志 | 7 | 改造保留 | 见 §6.4 |

### 7.2 `admin.config.js` 的 staticMenu：必须删除，关不掉

「静态功能演示」（图标、表格）与「文档与插件」（DCloud 外链）两组共 7 个条目**硬编码在 `admin.config.js`**，不受 `opendb-admin-menus` 的 `enable` 与 `permission` 控制，**任何角色登录都会看到**。已清空为 `staticMenu: []`。

### 7.3 页面文件

| 对象 | 处置 | 说明 |
|---|---|---|
| `pages/demo/table/` | **已删除** | `table.vue` 与 `tableData.js`，纯演示，无引用 |
| `pages/demo/icons/` | **保留** | `icons.vue` 被 `system/menu/{add,edit}.vue` 作为**图标选择器 import**，删除会导致菜单管理页报错 |
| `pages.json` 的两条 demo 路由 | **已移除** | 断掉直达路由；`icons.vue` 作为组件 import 不需要页面注册 |
| `pages/uni-stat/**`（40 个） | **暂不动** | `pages/index/index.vue` 目前仍深度依赖 uni-stat（15 处引用），清理须等 A-03 工作台改造完成后一并进行，否则产生死链 |
| `pages/system/{app,tag}`、`uni-upgrade-center` | **暂不动** | 菜单已关，入口已断；属打包体积优化，与 uni-stat 一起在 A-03 之后处理 |

### 7.4 数据表与云函数：不上传即可

| 对象 | 处置 |
|---|---|
| `uni-stat-*` 25 张表 schema | **不上传**，不上传就不会创建 |
| `uni-stat-cron`、`uni-stat-receiver` 云函数 | **不上传**。`uni-stat-cron` 是定时任务，上传后会持续运行并产生费用 |
| `uni-analyse-searchhot`、`uni-upgrade-center`、`uni-sms-co`、`ext-storage-co` | **不上传** |

### 7.5 若后续要启用「错误统计」

权限点 `ops-sys-error` 与菜单 `uni-stat-error-js` 已就位（菜单当前 `enable: false`），启用需要完整链路，不是开个菜单就行：

1. 菜单 `uni-stat-error-js` 置 `enable: true`，`permission` 填 `["ops-sys-error"]`
2. 上传 `uni-stat-error-logs`、`uni-stat-error-result`、`uni-stat-error-source-map` 三张表
3. 上传 `uni-stat-receiver`（接收上报）与 `uni-stat-cron`（定时聚合）云函数
4. `grouporder-client` 的 `manifest.json` 开启 `uniStatistics`

**未完成上述四步就开菜单，运营只会看到一个永远空白的页面。** 该能力属 OPS 四角色之外的技术运维职责，**归属已确认由超级管理员持有**（产品负责人 2026-09-17）；它不涉及业务数据与个人信息，不构成对 OPS §3.1「超管不自动继承业务权限」的突破。

---

## 8. 首次部署初始化流程（方案甲）

`uni-id-common` 中内置 `admin` 角色的逻辑：

```js
if (role.includes("admin")) return { role, permission: [] }   // 跳过权限查询，视为全权
```

**`admin` 不受任何 permission 控制，自动拥有全部菜单与接口权限**，而 `registerAdmin` 云函数写死 `role: ['admin']`。这与 OPS §3.1「超管不自动继承业务权限」直接冲突。

采用方案甲：**`admin` 只作初始化账号，不作业务角色。**

| 步 | 操作 | 说明 |
|---|---|---|
| 1 | 上传 DB Schema 与 `uni-id-co` 云函数 | 只从 `grouporder-admin` 上传（DATA_MODEL §1） |
| 2 | 初始化 `opendb-admin-menus`、`uni-id-roles`、`uni-id-permissions` 三张表的 init_data | 菜单、4 个角色、18 个权限点一次到位 |
| 3 | 访问登录页 → 「注册管理员账号」创建首个 `admin` 账号 | 服务端有保护：已存在 admin 时返回 `ADMIN_EXISTS`，该入口自动失效 |
| 4 | 用 admin 登录，在「运营账号」中创建各业务账号并分配 `ops-*` 角色 | 至少创建一个 `ops-super` |
| 5 | **停用 admin 账号** | 保留记录以备应急，但不用于日常运营 |
| 6 | 之后一切运营操作使用 `ops-*` 账号 | 超管也不例外 |

**不执行第 5 步，OPS §3.1 的隔离就不成立**——admin 账号能看到全部菜单，包括敏感资料查看。

---

## 9. 模块升级后必检清单

以下改动位于 `uni_modules` 内或会被模板覆盖，**每次升级 `uni-id-pages` 或 uni-admin 模板后必须逐项复核**：

| # | 文件 | 检查项 |
|---|---|---|
| 1 | `uni_modules/uni-id-pages/config.js` | `isAdmin: true`、`loginTypes: ['username']`（D-069） |
| 2 | `uni_modules/uni-id-pages/uniCloud/.../uni-id-users.schema.json` | `status` 枚举是否仍缺 `4`（已注销），项目目录有覆盖版补齐（DATA_MODEL §3） |
| 3 | `admin.config.js` | `staticMenu` 是否被模板还原为演示菜单 |
| 4 | `pages.json` | demo 路由是否被还原 |
| 5 | `uniCloud-alipay/database/*.init_data.json` | 菜单、角色、权限点三份初始数据是否被模板覆盖 |
| 6 | `pages/system/user/list.vue` | §4 的四处裁剪是否被还原 |

另有一处**已知但未处理**：登录页 `login-withpwd.vue` 仍显示「注册管理员账号」链接。服务端有 `ADMIN_EXISTS` 保护，不构成安全漏洞，但已存在超管后点击即报错，是个无效入口，与 OPS「不提供注册」的表述不符。隐藏它需要改 `uni_modules` 内的文件，会被升级覆盖；**建议在 §8 第 5 步停用 admin 后一并评估是否值得改**。

---

## 10. 变更记录

| 日期 | 版本 | 变化 |
|---|---|---|
| 2026-09-18 | v0.3 | 按 D-072 改写：A-11 标记取消（编号保留空缺，实 17 屏）、A-02 去掉二次验证弹窗组件；§4.2 五个坑中第 ② 条导出按钮由「删除」改为「保留但收窄对象并入审计」、第 ⑤ 条批量删除由「删除」改为「保留但须输入 `delete` 确认」、第 ③ 条理由去掉脱敏；§5 乙方案的否决理由由「脱敏/二次验证/审计三链路」改为「全量审计与提交时鉴权两链路」 |
| 2026-09-16 | v0.1 | 建立盘点：核对 uni-admin 既有资产、实测视觉规范、逐屏定性、A-15 改造点、菜单初始数据；登记 `unicloud-db` 与全表 `permission: false` 的架构冲突 |
| 2026-09-17 | v0.2 | **更正 v0.1 的错误**：菜单 `permission` 存的是权限点而非角色 id（§6.1）。新增：A-15 查询范围错误这一更严重问题（§4.1）；18 个权限点与 5 个角色的完整设计（§6.2、§6.3）；自带资产处置清单（§7）；内置 `admin` 角色与 OPS §3.1 冲突的解决流程（§8）；模块升级必检清单（§9）。**§6～§7 的结论已落地到工程文件**：`opendb-admin-menus.init_data.json`（60 条 / 启用 23）、`uni-id-roles.init_data.json`（5 个角色）、`uni-id-permissions.init_data.json`（18 个权限点）、`admin.config.js`（清空 staticMenu）、`pages.json`（移除 demo 路由）、删除 `pages/demo/table/` |
