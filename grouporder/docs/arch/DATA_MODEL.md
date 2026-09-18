# 数据模型设计

- 文档版本：v1.12
- 文档状态：**已落地**。15 张 `.schema.json` 与 `.index.json` 已生成至 `grouporder-admin/uniCloud-alipay/database/`，尚未上传服务空间
- 适用产品版本：PRD v1.1 / DECISIONS v1.3
- 覆盖范围：核心业务与平台配置 9 张表 + 运营治理 10 张表，共 19 张自建表
- 事实来源：`docs/product/PRD.md`、`docs/product/DECISIONS.md`、`docs/product/OPS_ADMIN_REQUIREMENTS.md`

> 本文档只做数据模型设计，不生成 schema 文件。微信服务类目与主体核验（P1-09）仍未出结论，产品形态若因此调整，本文档随之修订的成本远低于已上传的线上表结构。

---

## 1. 技术前提

| 项            | 结论                                                                                       | 依据                                                                                                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端           | uniCloud（阿里云服务空间）                                                                        | 两个工程现有 `uniCloud-alipay` 目录                                                                                                                                                                                                |
| 账号体系         | 复用 `uni-id`，**不自建用户表**                                                                   | D-038                                                                                                                                                                                                                      |
| schema 唯一维护源 | `grouporder-admin` 工程                                                                    | D-038。两个工程共用同一服务空间，schema 只能有一份，否则 HBuilderX 上传互相覆盖                                                                                                                                                                        |
| **上传约定**     | **schema 只从 `grouporder-admin` 上传；`grouporder-client` 只拉取、永不上传**                         | 两个工程的 `uni-id-pages` 已统一为 1.1.28，但该版本官方 schema 缺少 `status = 4`，需由 admin 项目目录的覆盖版补齐。client 的 `uni_modules` 中是未补齐的原版，一旦从 client 上传会覆盖掉修正                                                                                     |
| 金额单位         | **一律 int 存「分」**                                                                          | 杜绝浮点误差                                                                                                                                                                                                                     |
| 图片字段         | uniCloud `file` 类型                                                                       | 可直接绑定 `uni-file-picker`，保留文件名与大小，便于内容检测和孤儿文件清理。**注意：`grouporder-goods-lib` 与 `grouporder-goods` 之间是复制关系，复制的是文件引用而非文件本身，同一 fileID 会被多条记录同时引用——因此删除商品库记录或活动商品时一律不得删除云存储文件**，孤儿文件清理的判定条件是两表中均无记录引用该 fileID（GOODS_LIB_SPEC §6） |
| 表名前缀         | `grouporder-`                                                                            | 与 uni-id / uni-stat 等模板表区分                                                                                                                                                                                                 |
| **权限策略**     | **全部 19 张表的 schema `permission` 均为 `read/create/update/delete: false`**，客户端不可直连，所有读写走云函数 | 本业务有发布审核、治理下架、限购、库存原子扣减等规则，若开放客户端直连 JQL，这些规则可被绕过。统一走云函数使业务规则不可旁路                                                                                                                                                           |

## 2. 术语与层级

沿用 PRD §5 术语表，不在本文档另立名称：

```
活动 activity   一次商品接龙，由团长发起
  ├── 商品 goods        一个活动包含多个商品（D-011，首版无规格）
  └── 订单 order        一张订单对应一条收货信息，可包含多个商品
        └── 明细 item   订单中的一行，一个商品一行，保存价格快照
```

统计指标与字段的绑定关系（D-036、D-037）：

| 指标 | 来源 | 可见范围 |
|---|---|---|
| 已购买份数 | `goods.sold_qty` 直接读取 | 所有人，商品卡片「已购买 X＋实际单位」 |
| 有效总份数 | 活动内各商品 `sold_qty` 求和 | 所有人，活动详情 |
| 有效订单数 | `order` 按 `status=1` 计数 | 团长、运营 |
| 预计金额 | `order_item` 有效明细 `amount` 求和 | 团长、运营 |

---

## 3. 表清单

**第一批：核心业务与平台配置（9 张，详见 §4）**

| 表名 | 用途 | 敏感 |
|---|---|---|
| `grouporder-activity` | 活动 | |
| `grouporder-goods` | 活动内的商品 | |
| `grouporder-order` | 订单主表 | 含收货快照 |
| `grouporder-order-item` | 订单明细 | |
| `grouporder-address` | 用户收货信息簿 | 全表敏感 |
| `grouporder-config` | 平台配置，首版用于发布审核模式 | |
| `grouporder-goods-lib` | 用户商品库，商品保存时自动沉淀，创建活动时可复用 | |
| `grouporder-todo-dismiss` | 待办事项的「用户已关闭」状态，待办本身为派生视图不建表 | |
| `grouporder-goods-category` | 商品库分类，用户私有，仅用于商品库筛选 | |

**第二批：运营治理（10 张，详见 §10）**

| 表名 | 用途 |
|---|---|
| `grouporder-report` | 举报，5 状态流转 |
| `grouporder-report-review` | 举报复核，不覆盖原结论 |
| `grouporder-content-check` | 内容检测与复核，4 状态 |
| `grouporder-restriction` | 发布者警告与发布限制 |
| `grouporder-bind-appeal` | 账号绑定申诉 |
| `grouporder-privacy-case` | 注销、删除与匿名化事项登记 |
| `grouporder-export-log` | Excel 生成与下载事件 |
| `grouporder-oplog` | 统一操作日志，9 字段覆盖 10 类事件 |
| `grouporder-user-ext` | 平台用户业务扩展，存发布限制当前状态 |

**复用不新建且不修改**：`uni-id-users`（含运营账号）、`uni-id-roles`、`uni-id-permissions`。本项目自有的用户级状态一律放入 `grouporder-user-ext`，不改动 uni-id 模块。

**uni-id 模块版本已对齐为 1.1.28**（2026-09-15）。此前 admin 1.1.20、client 1.1.28，由产品负责人在 HBuilderX 插件市场升级 admin 完成对齐，未手动改动任何模块文件。

版本差异的成因：两个工程创建方式不同——client 由 CLI 创建、模块单独安装取到当时最新版；admin 由 HBuilderX 的 uni-admin 模板创建、模块随模板打包。uni-admin 官方**只支持 HBuilderX 新建或插件市场一键部署，不提供 CLI 创建方式**（`package.json` 中 `type` 为 `unicloud-template-project`、`engines` 声明依赖 HBuilderX、且无构建脚本与 npm 依赖）。**重建工程不会改变模块版本**——模板 3.0.0 始终携带 uni-id-pages 1.1.20，只能通过单独升级模块来对齐。

**必须对齐的原因**：两个工程共用同一服务空间，服务端资产只能有一份：

| 冲突项 | 后果 |
|---|---|
| `uni-id-users.schema.json` | 云端仅一份，谁后上传谁覆盖 |
| `uni-id-co` 云函数（1.1.20 与 1.1.28 相差 130 个文件） | 云端仅一份，服务端与前端版本错配时接口可能不兼容 |

### uni-id-users 的 status 枚举覆盖

uni-id 1.1.28 的官方 schema 中 `status` 的 `enum` 只到 `3`，但其 `uni-id-co/module/account/close-account.js` 注销时执行 `setUserStatus(uid, USER_STATUS.CLOSED)`，而 `common/constants.js` 中 `CLOSED: 4`。**代码写 4 而 schema 不允许 4**，不处理则账号注销（D-056）在写库时被拒绝，报错隐晦。

处理方式：在 `grouporder-admin/uniCloud-alipay/database/` 放置 `uni-id-users.schema.json`，基于 1.1.28 原版补回 `{ text: "已注销", value: 4 }`，其余 38 个字段与原版逐一相同。**这是在项目自有目录新增文件，不修改 `uni_modules` 中的任何内容**，依靠 uniCloud「项目目录优先于 uni_modules」的规则生效。

> 这是 uni-id 官方 schema 与自身云函数代码不一致的疏漏，与版本新旧无关——1.1.20 与 1.1.28 的 `close-account.js` 和 `USER_STATUS` 常量完全相同，只是 1.1.20 的 schema 恰好列全了枚举值。模块后续升级后须重新核对该枚举是否仍缺 `4`。

**uni-id 模块升级后的三项必检清单**：

| # | 检查项 | 位置 | 不检的后果 |
|---|---|---|---|
| 1 | `uni-id-users` 的 `status` 枚举是否仍缺 `4 已注销` | 模块自带 schema | 账号注销（D-056）写库被拒，报错隐晦 |
| 2 | `config.js` 的 `isAdmin` 是否被重置为 `false` | `grouporder-admin/uni_modules/uni-id-pages/config.js` | 管理端按用户端行为渲染 |
| 3 | `config.js` 的 `loginTypes` 是否被重置为默认七项 | 同上 | 重新开放微信、短信等无关登录方式，违反 D-069 |

> 第 2、3 项在 2026-09-16 的 1.1.20 → 1.1.28 升级中**实际发生过**：`isAdmin` 被重置为 `false`、`loginTypes` 被重置为七项全开，均已修正。`config.js` 是模块预留给项目的配置文件，修改它属于模块的预期用法，但**升级必然覆盖**，因此每次升级后都要重新核对这两项。

`opendb-device.index.json` 在项目目录与 uni-id-pages 模块中各存在一份，两者索引定义完全相同（`index_device_id`、字段 `device_id`、唯一索引），仅缩进风格不同，不构成冲突，无需处理。

> 上传约定：schema 与 `uni-id-co` 云函数一律只从 `grouporder-admin` 上传，`grouporder-client` 只拉取。client 的 `uni_modules` 中是未补齐 `status = 4` 的原版，从 client 上传会覆盖掉该修正。

合计 **19 张自建表**。运营后台按 `OPS_ADMIN_REQUIREMENTS.md` 完整规格实施（D-042）。

---

## 4. 表定义

> **字段表标记说明**
> - 「必填」列的 ✓ 表示**该字段一定有值**。其中 `create_date` 等由 `forceDefaultValue: {"$env": "now"}` 自动写入的字段，值由服务端强制生成，因此**不出现在 schema 的 `required` 数组中** —— `required` 约束的是「写入时调用方必须提供」，两者语义不同。
> - `_id` 由系统生成，不在 `required` 中。


### 4.1 `grouporder-activity` 活动

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | |
| `title` | string | ✓ | | 活动标题，1–50 字 |
| `description` | string | | | 活动说明，≤500 字 |
| `cover_image` | file | ✓ | | 封面图。用于首页列表与微信分享卡片 |
| `images` | array&lt;file&gt; | | `[]` | 轮播图，用于活动详情页顶部，**maxLength 9** |
| `short_code` | string | ✓ | 生成 | 4 位大写字母数字，**全局唯一**。用于订单号拼装与口头引用 |
| `delivery_type` | int | ✓ | 1 | **交付方式** 1送货上门 2自提。创建时必选，**发布后不可修改**（D-060） |
| `leader_uid` | string | ✓ | | 团长，外键 `uni-id-users._id` |
| `status` | int | ✓ | 0 | **业务状态** 0草稿 1审核中 2进行中 3已截止 4已取消 |
| `publish_date` | timestamp | | | 首次成功发布时间。未发布的草稿为空 |
| `review_mode` | int | | | 本次审核生效模式**快照** 1自动 2人工；提交审核时从平台配置读取并固化 |
| `review_submit_date` | timestamp | | | 最近一次提交发布审核时间 |
| `review_uid` | string | | | 最近一次审核操作人 |
| `review_time` | timestamp | | | 最近一次审核完成时间 |
| `review_result` | int | | 0 | 0无结果 1通过 2不通过 3已撤回 |
| `review_reason` | string | | | 审核不通过原因或审核备注 |
| `content_version` | int | ✓ | 1 | 待审内容版本；内容编辑后递增，审核与快照均关联此版本 |
| `end_time` | timestamp | ✓ | | 定时截止时间（D-020） |
| `actual_end_time` | timestamp | | | 实际截止时间 |
| `end_type` | int | | | 1定时自动 2团长手动提前 |
| `cancel_uid` | string | | | 取消操作人 |
| `cancel_time` | timestamp | | | 取消时间 |
| `cancel_reason` | string | | | 取消原因。进行中活动取消时必填（D-027） |
| `governance_status` | int | ✓ | 0 | **治理状态** 0正常 1已下架 |
| `governance_uid` | string | | | 下架操作人 |
| `governance_time` | timestamp | | | 下架时间 |
| `governance_type` | string | | | 违规类型 |
| `governance_reason` | string | | | 下架原因 |
| `ever_governed` | int | | 0 | 是否曾被下架，历史标记，置 1 后不回退 |
| `text_check_status` | int | | 0 | 文本检测 0待检 1通过 2待人工复核 3已拦截 |
| `img_check_status` | int | | 0 | 封面图与轮播图检测，取值同上。**异步回调，不阻塞审核放行**；命中时置为 3 并转治理下架（D-058） |
| `create_date` | timestamp | ✓ | 自动 | |
| `retention_expire_date` | timestamp | | | 截止或取消之日 +3 年（D-035） |
| `anonymized` | int | | 0 | 0否 1已匿名化 |

**设计说明**

1. **业务状态、发布审核与治理状态分开记录**。提交发布后业务状态为审核中，审核通过后才进入进行中并允许公开、分享和下单；运营下架不改写团长的业务状态，也不删除任何数据（D-043、OPS §2.2、§6.1）。
2. `publish_date` 支撑 OPS §11.2「已发布活动数只统计至少成功发布过一次的活动」与「最近发起时间不使用草稿创建时间」，缺此字段该指标无法计算。
3. `ever_governed` 支撑 OPS §11.2「是否曾被下架作为单独历史标记，不与业务状态混为一类」。
4. `end_type` 区分 D-020 的两种截止方式，仅凭 `actual_end_time` 无法分辨。
5. `cover_image` 与 `images` 分开：分享卡片对图片比例有固定要求，若让轮播图第一张兼任封面，卡片会被裁切变形。
6. **`delivery_type` 发布后不可修改**（D-060）。订单保存的是收货信息快照，若活动中途从自提改为送货上门，早先的订单没有地址字段，清单会出现半数缺列；反向修改则已采集的地址成为无用敏感数据。锁定该字段是保证快照口径稳定的前提。自提活动的订单不采集完整地址，这同时缩小了敏感资料面——OPS §8.1 的敏感范围需按交付方式区分。
7. **不设任何 `stat_*` 冗余统计字段**。有效总份数由活动内各商品 `sold_qty` 求和得到（单活动 ≤50 个商品），有效订单数与预计金额实时聚合。冗余统计字段需要在每次下单、取消、作废时维护，收益极小而一致性风险真实存在。

### 4.2 `grouporder-goods` 商品

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | |
| `activity_id` | string | ✓ | | 外键 → 活动 |
| `lib_id` | string | | | 来源商品库记录 ID，手工新增为空。**仅用于治理反写定位**（D-064），见下方说明 6 |
| `is_recommend` | int | | 0 | 0普通 1推荐。团长在本活动内的自荐标识（D-065），见下方说明 7 |
| `name` | string | ✓ | | 商品名称，1–50 字 |
| `description` | string | | | 商品说明，≤500 字 |
| `cover_image` | file | ✓ | | 封面图，商品卡片展示 |
| `detail_images` | array&lt;file&gt; | | `[]` | 详情图，**maxLength 9** |
| `price` | int | ✓ | | 单价（**分**），≥0 |
| `unit` | string | ✓ | `份` | 非空商品单位，如份、盒、箱、袋、瓶；具体长度限制由 schema 评审确定 |
| `total_stock` | int | ✓ | 0 | 总库存；0 表示不设上限，正整数表示有限总库存且不得低于 `sold_qty` |
| `sold_qty` | int | ✓ | 0 | **已购买份数**，系统维护，等于该商品全部有效明细数量之和 |
| `per_user_limit` | int | ✓ | 0 | 每人限购份数，0 表示不限 |
| `on_sale` | int | ✓ | 1 | 1在售 0停售 |
| `governance_status` | int | ✓ | 0 | 商品治理状态 0正常 1已下架；与 `on_sale` 分开 |
| `governance_uid` | string | | | 商品下架/恢复操作人 |
| `governance_time` | timestamp | | | 最近商品治理操作时间 |
| `governance_reason` | string | | | 商品治理原因，举报成立后下架时必填 |
| `ever_ordered` | int | ✓ | 0 | 是否产生过有效明细，**置 1 后永不回退** |
| `sort` | int | | 0 | 排序 |
| `img_check_status` | int | | 0 | 图片检测状态，取值同活动表。异步回调命中时该商品转治理下架（D-058） |
| `create_date` | timestamp | ✓ | 自动 | |

**设计说明**

1. **库存语义由两个字段固定**：`total_stock` 是团长设置的上限，0 表示不限库存；`sold_qty` 是系统维护的已购买份数。仅 `total_stock > 0` 时计算剩余量 `total_stock - sold_qty`，且剩余量不落库。
2. `sold_qty` 是**必须冗余**的字段，而非可选优化：库存校验需要它参与原子条件更新。它同时承担商品卡片的「已购买 X 份」展示，因此展示能力是零额外成本获得的。其维护是单纯的 `+qty` / `-qty`，不涉及任何去重判断。
3. `ever_ordered` **不能用 `sold_qty > 0` 代替**。D-026 要求「即使明细后来全部取消或作废」仍禁止删除，而 `sold_qty` 会因取消回落到 0。
4. 按 D-018（v0.6 放宽）：`ever_ordered = 1` 的商品**允许改价**，但需二次确认并记录前后值；**禁止删除**，只能停售。改价不影响已提交订单，因为明细保存了价格快照。
5. 停售、恢复售卖、改价、单位和库存/限购调整的操作人与前后状态记入第二批的统一操作日志表。商品治理下架只在举报或复核结论成立后由运营执行，不等同于团长停售。
7. **`is_recommend` 仅作视觉强调，不进入任何排序表达式**。活动详情页与团长商品管理页统一按 `sort ASC, create_date ASC` 排列，两处必须一致，否则团长与参与者看到的顺序不同、核对商品时会出错；`create_date` 是必需的稳定兜底键，同 `sort` 值时缺少它会使分页出现重复或遗漏。复用或复制时按来源预填，团长可在活动内单独修改且**不回写商品库**。每活动上限 5 个，由**服务端**校验，只做前端限制不够。平台不提供任何推荐、榜单或流量分配，这是与 D-059 私域定位一致的形态边界。
   > 推荐置顶已评估但**暂不实施**：置顶一旦启用，管理页必须分「推荐 / 其他」两区并禁止跨区拖拽，否则会出现「拖到最顶部、`sort` 变成 1，却仍排在推荐之后」的表现——拖了没反应是最难解释的一类 bug。字段与角标已就位，后续开启只需改排序表达式并补分区拖拽约束。**在产品负责人明确要求前不要自行加上。**
6. **`lib_id` 只允许用于治理反写定位，四项用法严格禁止**：① 通过它联表读取库记录的名称、图片、价格来展示活动商品——活动商品的内容必须自带；② 任何方向的字段同步（库→活动、活动→库）；③ 声明为 `foreignKey`——本项目该属性用于真实关系，声明为外键是错误信号；④ 因库记录被软删而清空或报错——悬空是正常的，它是历史来源记录而非有效引用。设立该字段的唯一理由是：商品复制进活动后团长可以改名，若仅按「团长 + 商品名」反查商品库，改过名的商品被下架时匹配不到库记录，绕过治理的路径重新成立。`grouporder-goods.index.json` **不为它新增索引**——治理反写低频且已知具体值，全表少量扫描的代价低于索引的写入成本。

### 4.3 `grouporder-order` 订单

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | |
| `order_no` | string | ✓ | 生成 | 订单号，**唯一索引**。格式见 §7 |
| `idempotent_key` | string | ✓ | | 幂等键，**唯一索引** |
| `activity_id` | string | ✓ | | 外键 → 活动 |
| `user_id` | string | ✓ | | 下单用户，外键 `uni-id-users._id` |
| `status` | int | ✓ | 1 | 1有效 2已取消 3已作废 |
| `consignee_name` | string | ✓ | | 🔒 收货人姓名**快照** |
| `consignee_mobile` | string | ✓ | | 🔒 收货电话**快照** |
| `consignee_address` | string | | | 🔒 完整收货地址**快照**。**条件必填**：`delivery_type=1` 送货上门时必填，`=2` 自提时不采集（D-060），由服务端按活动交付方式校验 |
| `address_id` | string | | | 来源地址簿 `_id`，仅供追溯，不作为展示依据 |
| `buyer_remark` | string | | | 买家备注，≤200 字 |
| `total_qty` | int | ✓ | | 本单总份数 |
| `total_amount` | int | ✓ | | 本单预计金额（**分**） |
| `cancel_time` | timestamp | | | 参与者取消时间 |
| `cancel_reason` | string | | | 参与者取消原因 |
| `void_uid` | string | | | 作废操作人（团长） |
| `void_time` | timestamp | | | 作废时间 |
| `void_reason` | string | | | 作废原因 |
| `create_date` | timestamp | ✓ | 自动 | |
| `retention_expire_date` | timestamp | | | 所属活动截止或取消之日 +3 年（D-035） |
| `anonymized` | int | | 0 | 0否 1已匿名化 |

🔒 标记为敏感字段，权限规则见 §8。

**设计说明**

1. 收货三要素**存快照而非引用**（PRD §5.6）。用户之后修改或删除地址簿条目，历史订单内容不变。`address_id` 仅保留追溯线索。
   **自提活动（`delivery_type=2`）只采集姓名与电话**，`consignee_address` 与 `address_id` 留空，订单不进入地址簿选择流程。电话在自提活动中仍必填：它是团长分货时的联系方式，也是订单核对的稳定字段。因此 `consignee_address` 在 schema 层不设 `required`，改由服务端按活动的 `delivery_type` 校验。
2. 一名用户可在同一活动创建多张有效订单（D-014），每张订单对应一条收货信息。取消后仍可新建订单，原取消记录保留、不被覆盖（D-025）。
3. `buyer_remark` 由用户自由输入，导出 Excel 时必须按纯文本安全写入，**禁止使其成为可执行公式**（DECISIONS §6 Excel 公式注入风险）。
4. 截止前改单允许替换商品明细、数量、收货快照和买家备注；删除全部明细时不保存空订单，应转为整单取消确认。改单需要在同一业务操作中校验有限库存/限购，并按新旧明细差额更新 `sold_qty`。

### 4.4 `grouporder-order-item` 订单明细

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | |
| `order_id` | string | ✓ | | 外键 → 订单 |
| `activity_id` | string | ✓ | | **冗余**，用于按活动聚合 |
| `user_id` | string | ✓ | | **冗余**，限购聚合键 |
| `goods_id` | string | ✓ | | 外键 → 商品 |
| `goods_name` | string | ✓ | | 商品名称**快照** |
| `unit_snapshot` | string | ✓ | | 商品单位**快照**，避免商品单位修改后影响历史清单 |
| `price_snapshot` | int | ✓ | | **提交时单价快照**（分），PRD §5.5 |
| `qty` | int | ✓ | | 数量，正整数 ≥1 |
| `amount` | int | ✓ | | 小计 = `price_snapshot × qty` |
| `status` | int | ✓ | 1 | **冗余**订单状态，聚合过滤用 |
| `create_date` | timestamp | ✓ | 自动 | |

**设计说明**

1. 本表存在的理由是支持「一张订单购买多个商品」。若一张订单只能买一个商品，本表可并入订单表。
2. `activity_id`、`user_id`、`status` 三个冗余字段使限购校验与统计聚合能在单表完成，避免下单主链路上的关联查询。**代价是订单状态变更时必须同步更新其全部明细的 `status`**，该同步必须与订单状态更新在同一操作序列内完成。
3. `price_snapshot` 和 `unit_snapshot` 使价格、单位修改不影响历史订单和清单。

### 4.5 `grouporder-address` 收货信息簿

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | |
| `user_id` | string | ✓ | | 归属用户 |
| `name` | string | ✓ | | 🔒 收货人姓名 |
| `mobile` | string | ✓ | | 🔒 收货电话 |
| `address` | string | ✓ | | 🔒 完整收货地址 |
| `is_default` | int | | 0 | 1 表示默认（D-013），同一用户至多一条为 1 |
| `deleted` | int | | 0 | 软删除标记 |
| `create_date` | timestamp | ✓ | 自动 | |
| `update_date` | timestamp | | | |

**设计说明**

采用软删除而非物理删除：订单已保存独立快照，物理删除本身是安全的，但软删除能保住 `order.address_id` 的追溯链。电话仅作为该订单的履约联系方式，**不用于账号验证或身份识别**（D-029、P1-02）。同一用户最多一条未删除记录为默认；删除默认记录后，按 `create_date` 升序选择最早创建的剩余记录设为默认，无剩余记录时允许地址簿为空（D-046）。

### 4.6 `grouporder-config` 平台配置

运营后台可调整的平台级参数，键值结构，首版只用于发布审核模式（D-057）。

| 字段 | bsonType | 必填 | 说明 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `config_key` | string | ✓ | 配置键，**唯一索引** |
| `config_value` | object | ✓ | 配置值 |
| `description` | string | | 配置说明，供后台展示 |
| `update_uid` | string | | 最近修改人 |
| `update_date` | timestamp | | 最近修改时间 |

**首版配置项**

| config_key | config_value | 说明 |
|---|---|---|
| `review_mode` | `{ "mode": 1 }` | 活动发布审核模式：1 自动审核，2 人工审核（D-057） |

**约束**

- 只有超级管理员可修改，修改记入 `grouporder-oplog`
- 活动**提交审核时**把当时生效的模式固化到 `activity.review_mode`；之后平台改配置**不影响已在审核中的活动**，避免审核过程中规则漂移
- 客户端不可直读本表，只能通过云函数获取必要的展示信息

---

### 4.7 `grouporder-goods-lib` 用户商品库

团长保存商品时自动沉淀的用户私有商品库，用于创建活动时复用历史商品（D-063）。完整实现规格见 `GOODS_LIB_SPEC.md` v0.3。

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | 商品库记录 ID |
| `user_id` | string | ✓ | | 归属用户，外键 `uni-id-users._id`。商品库为用户私有，任何读写必须校验归属 |
| `name` | string | ✓ | | 1–50 字。与 `user_id` 共同作为同名判定依据 |
| `description` | string | | | ≤500 字 |
| `cover_image` | file | ✓ | | 封面图。与活动商品共用同一云存储文件 |
| `detail_images` | array&lt;file&gt; | | `[]` | 详情图，**maxLength 9** |
| `unit` | string | ✓ | `份` | 商品单位（D-045） |
| `last_price` | int | ✓ | | 上次使用单价（分）。**复用时的预填值，必须逐项确认** |
| `last_total_stock` | int | ✓ | 0 | 上次使用的总库存，语义同 `goods.total_stock`（0 表示不限）。记录**当次设定的总量**，不是剩余量或已售量 |
| `last_per_user_limit` | int | ✓ | 0 | 上次使用的每人限购，语义同 `goods.per_user_limit`（0 表示不限购） |
| `last_used_time` | timestamp | ✓ | | 最近一次沉淀或复用时间，列表按此倒序。**编辑库记录不更新该字段** |
| `use_count` | int | ✓ | 0 | 被复用次数，**仅在执行复制时递增**，沉淀与编辑均不计 |
| `is_recommend` | int | | 0 | 推荐标识的**默认值**，复用时带入活动商品（D-065） |
| `category_id` | string | | | 所属分类，空表示未分组。关联 `grouporder-goods-category._id`（D-066）。**不随复制进入活动商品** |
| `img_check_status` | int | ✓ | 0 | 枚举与 `goods.img_check_status` 一致。仅状态 1 可在复用时免于重新送检（D-058） |
| `governance_blocked` | int | ✓ | 0 | 0正常 1禁止复用。运营下架商品时反写，软删记录同样封禁，不可由用户自行解除（D-064） |
| `deleted` | int | ✓ | 0 | 软删除标记，命名对齐 `grouporder-address.deleted` |
| `create_date` | timestamp | ✓ | 自动 | |
| `update_date` | timestamp | | | |

**设计说明**

1. **商品库只做复制源，不做引用源。** 复用是「按库记录内容在 `grouporder-goods` 里新建一条独立记录」，复制后除 `lib_id` 这一只读来源标记外再无关联，不做任何方向的同步。理由有三：历史不可变（与价格快照、收货快照同一原则）；治理不连坐（下架一个库商品不应波及已履约完毕的历史活动）；改动面最小（`goods` 表只增一个可空字段）。
2. **三个经营字段按「预填 + 必须逐项确认」处理**：复用时 `price`、`total_stock`、`per_user_limit` 分别预填库中的 `last_price`、`last_total_stock`、`last_per_user_limit`，但复制进来的商品在活动内标记为待确认，团长逐个核对后活动才能提交发布，确认粒度为**每个商品一次**而非每个字段一次。只预填不确认会造成静默沿用旧价的收款差错与沿用旧库存的超卖；只清空不预填则等于没做复用。确认门同时挡住这两头。
3. **`goods` 自带内容字段不是冗余而是快照**：清单是履约凭证（库记录改动会让已截止活动的清单内容变化甚至变空）；`lib_id` 可以为空（手工新增商品的内容将无处安放）；活动内允许改名换图（D-048）；治理会连坐；留存期不一致（订单数据保存三年而库记录随账号注销删除，内容挂在库上会违反 D-035）。
4. **`user_id + name` 刻意不设唯一索引**：软删记录仍占用该组合，加唯一索引会导致用户删掉某商品后无法再用同一名称沉淀。同名去重由云端「先查后写」实现，极低频并发下可能留下重复记录，后果仅是列表多一行，不值得为此引入事务。
5. **治理联动（D-064）的匹配条件是两条的并集**：① `_id = goods.lib_id`（`lib_id` 非空时）——覆盖复制后被改名的情况；② `user_id = 活动团长` 且 `name = goods.name` 且 `deleted = 0`——覆盖手工新增（`lib_id` 为空）以及团长删掉旧记录后又同名重新沉淀的情况。两条都匹配不到时静默跳过。命中记录即使 `deleted = 1` 也要封禁，防止恢复软删后重新可用。
6. **库记录可脱离活动独立维护**（M-29）：可编辑内容字段与三个 `last_*` 预填值；编辑不影响任何已有活动商品；改名与同用户其他未删除记录重名时拒绝；改图后 `img_check_status` 归 0 并重新送检；`governance_blocked = 1` 的记录禁止编辑，否则可靠改名洗白。

### 4.8 `grouporder-todo-dismiss` 待办关闭状态

待办事项是**派生视图，不建待办业务表**（D-062）。全部条目由 `grouporder-activity`、`grouporder-order`、`grouporder-report`、`grouporder-bind-appeal` 的现有字段按规则实时查询拼装，只有「用户已关闭」这一个状态需要落库。

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | |
| `user_id` | string | ✓ | | 关闭该待办的用户，外键 `uni-id-users._id` |
| `todo_key` | string | ✓ | | 待办标识，形如 `activity_offline:<activity_id>`、`review_rejected:<activity_id>`、`report_closed:<report_no>`。由待办类型与对象标识拼装 |
| `dismiss_time` | timestamp | | 自动 | 关闭时间 |

**索引**：`(user_id, todo_key)` **唯一**，保证同一用户对同一待办只有一条关闭记录，重复关闭幂等。

**设计说明**

1. **为什么不建待办表**：一张真正的待办表必须与活动状态、订单状态、治理状态、举报状态四套状态机保持同步，任何一处漏写就会留下幽灵待办——用户看到"活动已被下架"的待办，点进去活动却是正常的。这与本项目「以服务端最终状态为准」的一贯原则冲突。派生视图没有同步问题，代价只是每次查询要跑几条聚合，而待办列表是低频页面。
2. **待办承担站内触达职责**：首版不做订阅消息（D-032），活动被取消或下架、发布审核不通过、举报有处理结果这些事件对用户没有任何触达手段。待办 tab 是唯一能让用户「回来就看见」的载体，因此它是接龙 tab 的默认子页。
   > **本表仅服务小程序端。运营后台的工作台待办不使用本表**：后台待办同样是派生视图，但**不提供关闭或忽略操作**，消退完全依赖各对象的状态机（D-070）。运营的职责是处理完毕，不存在「知道了但不处理」的中间态，因此后台不需要已读状态落库。
3. **首版待办条目**按优先级分四档：① 活动被治理下架、发布审核不通过（团长）；② 参与的活动被取消或下架、活动已截止待生成清单；③ 24 小时内截止（团长与参与者各一条）；④ 草稿超 24 小时未提交、举报或申诉有处理结果。消退条件分两类：用户点击查看后关闭（写入本表），或由对象状态自然变化而消失（如活动截止、重新提交审核），后者不写本表。
4. **命名**：文档原稿用 `uid`，此处按项目命名约定统一为 `user_id`，与 `grouporder-address`、`grouporder-goods-lib` 一致。

### 4.9 `grouporder-goods-category` 商品库分类

团长自建的商品库分类（D-066）。**分类为用户私有，只用于在商品库中「找得到」**，不进入活动展示、不进入 Excel 清单、参与者永远不可见。

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | 自动 | |
| `user_id` | string | ✓ | | 归属用户，外键 `uni-id-users._id` |
| `name` | string | ✓ | | 分类名称，1–10 字 |
| `sort` | int | | 0 | 用户自定义顺序，正序 |
| `create_date` | timestamp | | 自动 | |

**索引**：`(user_id, sort)`，非唯一。

**设计说明**

1. **活动商品表不携带分类字段**。分类只服务于商品库的检索，一旦进入活动就失去意义——参与者看到的是商品，不是团长的收纳方式。
2. **分类名不需要内容安全检测**。它只对用户本人可见、不对外展示，送检是白花一次接口调用。实现时不要出于保险默认送检。
3. **「未分组」不是一条分类记录**，而是 `category_id` 为空的商品集合，不建默认分类记录，也不能重命名或删除。
4. **删除分类不删除商品**，其下商品的 `category_id` 置空，归入未分组。
5. **分类在 M-28 仅用于筛选**，不提供「按分类批量加入」——整组重复的场景由 D-067 复用历史接龙覆盖，两条路径都做会造成功能重叠。
6. **分类数上限 20 个，由服务端校验**（GOODS_LIB_SPEC §5.6、AC-GL-023）。分类名 1–10 字。

---

### 4.10 活动复制语义（复用历史接龙，D-067）

团长可选中一场自己发起过的历史接龙，把活动资料与全部商品复制成新草稿。产品级定义与验收见 `PRD.md` §4.1 第 19 条与 §8.8；本节只记字段级规则与实现约束。

**不新增任何字段。** `grouporder-activity` 与 `grouporder-goods` 均无 schema 改动。

**特别说明：不加 `source_activity_id`。** 按 §4.7 中 `lib_id` 的同一标准评估——`lib_id` 存在的唯一理由是治理反写需要精确定位商品库记录；而复制出的活动，其商品已各自携带 `lib_id`，治理链路本就完整，源活动被下架也不应连坐副本（内容是快照，且违规商品已在复制时排除）。既无治理必要性就不加：纯粹的来源追溯本身不构成加字段的理由，否则这个标准会被逐步稀释。

#### 复制什么、不复制什么

| 对象 | 处理 | 说明 |
|---|---|---|
| `title` | 复制 | **不自动加「副本」后缀**。团长通常要改成「9月24日蔬菜团」这类新名字，加了反而要先删 |
| `description` | 复制 | |
| `cover_image` / `images` | 复制文件引用 | 见下方「图片文件引用」 |
| `delivery_type` 交付方式 | 复制 | D-060 |
| `end_time` 截止时间 | **按源活动时长推算预填** | 见下方「截止时间推算」 |
| 活动业务状态 | 一律置为**草稿** | |
| 活动治理状态、审核记录 | 不复制 | |
| 商品内容：名称 / 说明 / 封面图 / 详情图 / 单位 | 复制 | |
| 商品 `price` / `total_stock` / `per_user_limit` | 复制为**预填值**，须逐项确认 | 复用 `GOODS_LIB_SPEC` §5.3 的同一机制与组件，不得另做一套 |
| 商品 `is_recommend` | 复制 | 上限 5 个的校验同样适用（D-065）。首版推荐不影响排序，复制后位置由 `sort` 决定 |
| 商品 `lib_id` | **复制** | 来源仍是同一条库记录，治理反写链路必须保持连通 |
| 商品 `sort` | 复制 | 保持团长原先的排列 |
| 商品 `sold_qty` / `ever_ordered` / `governance_status` / `on_sale` | 全部初始化 | `on_sale` 置 1：上一场的停售是当时的经营决定，新活动重新开始 |
| 订单 / 订单明细 | **绝不复制** | |
| 举报记录 / 内容检测记录 | 不复制 | |

#### 可作为源的活动范围

| 业务状态 | 可否作为源 |
|---|---|
| 已截止 | ✓ |
| 已取消 | ✓ |
| **进行中** | ✓ |
| 审核中 | ✗ |
| 草稿 | ✗（草稿本来就能直接打开编辑，复制它没有意义） |
| 任意状态 + 治理已下架 | ✗ |

**包含进行中活动的理由**：真实场景是本周的团还在跑，团长提前把下周的排好。**此时 UI 必须明确提示**「将创建一个新的草稿，不影响当前正在进行的活动」，否则团长会误以为是在编辑当前活动——这是包含进行中活动后最可能产生的误解。

#### 截止时间推算

**不能直接复制源活动的 `end_time`**（必然已过期），也不该给「7 天后」这类与本团无关的任意值。采用源活动的**时长**：

```
新活动 end_time = 当前时间 + (源活动 end_time − 源活动 publish_date)
```

兜底顺序：

1. 源活动 `publish_date` 有值 → 时长 = `end_time − publish_date`
2. `publish_date` 为空（活动发布过审核才会写入；已取消的活动可能从未发布）→ 时长 = `end_time − create_date`
3. 上述结果 ≤ 0 或字段缺失 → 兜底 **3 天**

举例：源活动 9 月 8 日发布、9 月 10 日 18:00 截止，时长 2 天 18 小时；今天复制，新截止时间即为当前时间 + 2 天 18 小时。这样得到的是「这个团一贯开多久」，而不是任意默认值。

**预填值必须在页面上显眼展示且可直接修改，不得折叠隐藏**——折叠起来就退化成了盲目默认值，正是要避免的情况。不设时长上限：源活动开了 30 天就照搬 30 天，团长自己会改。

#### 四条实现约束

1. **被治理下架的商品必须剔除**。源活动中 `governance_status = 1` 的商品不复制，并在结果中明确告知：「其中 1 件商品因违规已被下架，未包含在本次复制中：进口复合维生素」。不处理的话，这是一条与 `GOODS_LIB_SPEC` §7 同类的**绕过治理路径**——违规商品在商品库已被 `governance_blocked` 封禁，但通过复制旧活动照样能带进新活动。商品库和复制活动是两个入口，**两个都要堵**。
2. **被平台下架的活动不可作为源**，无论其业务状态为何。团长自己取消的活动可以复制——那是经营决定，不是违规。
3. **不重复触发商品库沉淀**。复制活动时不再往商品库沉淀（源商品当初保存时已沉淀过），否则会刷乱 `last_used_time` 的排序。`use_count` 同样**不递增**——这不是「从商品库复用」，是从活动复制。
4. **复制出的活动仍要走发布审核**（D-043），不因内容与旧活动相同而免审。

#### 图片文件引用

与 §4.7 的商品库复用完全一致：复制的是 fileID 引用，不是文件本身，同一个云存储文件会被源活动与新活动同时引用。**因此删除活动或商品时一律不得删除云存储文件**，孤儿清理的判定条件仍是「`grouporder-goods`、`grouporder-goods-lib`、`grouporder-activity` 中均无任何记录引用该 fileID」。

#### 接口

| 方法 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `activityCopySourceList` | `{ page, pageSize }` | `{ list, total }` | 仅当前用户发起、符合上表范围的活动 |
| `activityCopy` | `{ source_activity_id }` | `{ activity_id, copied_count, excluded: [{ name, reason }] }` | 返回新草稿 ID、复制成功的商品数、被剔除的商品清单 |

权限：`activityCopy` 必须校验源活动的团长是当前用户。幂等：同一次复制请求重试不得产生两个草稿，按 §8.3 的既有幂等原则处理。

#### 验收标准

| 编号 | 标准 |
|---|---|
| AC-AC-001 | 复制一场历史接龙后生成一个新草稿，活动资料、交付方式、封面与轮播图与源活动一致 |
| AC-AC-002 | 新草稿的截止时间按「当前时间 + 源活动 `end_time` − `publish_date`」预填，且在页面上直接可见可改 |
| AC-AC-002a | 源活动 `publish_date` 为空时改用 `create_date` 计算；算出的时长 ≤ 0 或字段缺失时兜底为 3 天 |
| AC-AC-002b | 预填的截止时间晚于当前时间，可正常提交发布 |
| AC-AC-003 | 新草稿中的商品，`sold_qty`、`ever_ordered`、`governance_status` 均为初始值，`on_sale` 为 1 |
| AC-AC-004 | 新草稿中的商品保留源商品的 `lib_id` 与 `sort`；运营下架其中一件商品后，商品库对应记录仍能被正确封禁 |
| AC-AC-005 | 源活动中已被治理下架的商品不出现在新草稿中，接口返回中列出该商品及原因，界面明确告知 |
| AC-AC-006 | 治理状态为已下架的活动不出现在 M-31 列表中，直接调用 `activityCopy` 指定该活动被拒绝 |
| AC-AC-007 | 已截止、已取消、进行中的活动均可作为源；审核中与草稿状态的活动不可 |
| AC-AC-008 | 复制进行中的活动后，源活动的业务状态、商品、订单与统计完全不受影响 |
| AC-AC-009 | 复制出的商品价格、总库存、每人限购标记为待确认，全部确认前活动不能提交发布，且使用与商品库复用相同的确认组件 |
| AC-AC-010 | 复制不改变商品库任何记录的 `last_used_time` 与 `use_count` |
| AC-AC-011 | 复制出的活动提交后进入审核流程，不因内容与源活动相同而免审 |
| AC-AC-012 | 指定他人发起的活动为源时被拒绝 |
| AC-AC-013 | 同一次复制请求重试不产生两个草稿 |
| AC-AC-014 | 删除源活动后，新活动的封面图与商品图片仍可正常显示 |

---

## 5. 状态机

### 5.1 活动

业务状态与治理状态**相互独立、互不改写**，任何时刻活动同时持有两者。

```
业务状态 activity.status
    草稿(0) ──提交──> 审核中(1) ──通过──> 进行中(2) ──定时或手动──> 已截止(3)
       ↑              │不通过/撤回          │
       └──────────────┘                     └──取消（需填原因）──> 已取消(4)
       └────────────────────取消草稿───────────────────────────> 已取消(4)

    已截止不可再取消：D-027 只允许取消草稿或进行中的活动

治理状态 activity.governance_status
    正常(0) <──运营下架 / 复核恢复──> 已下架(1)
```

治理状态的约束（OPS §6）：

- 下架后对普通访问者显示下架状态，禁止新建订单或扩大已有订单数量，但**不改写业务状态，不删除订单、商品或历史快照**
- 审核中仅团长和获权内容运营可见；审核通过前不进入公开列表、不生成可分享入口、不接单
- **审核模式由平台配置决定（D-057），提交时固化到 `activity.review_mode`**：自动模式下内容检测通过即由系统置为进行中，`review_uid` 为空；人工模式下需内容运营逐个审核，`review_uid` 记录审核人
- 审核中到达截止时间时直接进入已截止，之后即使审核通过也不得重新开放
- 活动在下架期间到达截止时间的，按已截止处理，不能通过恢复重新开放
- 团长已取消或活动已截止时，禁止恢复为可参与状态

### 5.2 订单

```
    有效(1) ──参与者在截止前取消──> 已取消(2)   返还库存 sold_qty -= qty
         └──团长在截止后作废─────> 已作废(3)   返还库存，记录操作人与原因
```

- 取消与作废均为终态，不可逆转
- 取消后用户仍可新建订单，**原取消记录保留，不被恢复或覆盖**（D-025）
- 作废只能由团长在截止后按整张订单执行，原因必填；整单全部明细退出有效统计并使已有 Excel 清单版本失效（D-051）
- 订单状态变更时，其全部明细的冗余 `status` 必须同步更新

### 5.3 商品

商品的经营状态由 `on_sale` 与 `ever_ordered` 组合决定，治理状态由 `governance_status` 独立表达：

| `on_sale` | `ever_ordered` | 团长可执行 | 禁止 |
|---|---|---|---|
| 1 | 0 | 改价、改单位、删除、停售、调库存/限购 | 有限库存低于 `sold_qty` |
| 1 | 1 | **改价（需二次确认并记录前后值）**、改单位、停售、取消库存上限、增加库存、减少有限库存至不低于 `sold_qty` | 删除 |
| 0 | 任意 | 活动进行中且未截止时恢复售卖（D-028） | 活动已截止或已取消时恢复 |

停售只阻止新增选择与扩大数量，已有订单可减少或移除该商品、更换收货信息、修改备注或取消整单，已有明细继续保留并进入最终清单（D-019、D-050）。`governance_status=1` 同样禁止新增或扩大该商品，但不影响其他正常商品；只有举报/复核结论成立后运营才能设置该状态。全部商品停售或售罄时活动业务状态不变。

---

## 6. 索引

| 表 | 索引 | 用途 |
|---|---|---|
| activity | `leader_uid + status` | 团长「我发起的」列表 |
| activity | `status + governance_status + publish_date` | 首页公开活动列表（仅审核通过后的进行中活动，按发布时间倒序） |
| activity | `status + end_time` | 审核中/进行中活动的定时截止扫描 |
| activity | `short_code`（唯一） | 短码解析 |
| activity | `status + review_submit_date` | 人工模式下的待审队列 |
| config | `config_key`（唯一） | 配置读取 |
| goods-lib | `user_id + deleted + last_used_time` | 商品库列表，按最近使用倒序 |
| goods-lib | `user_id + name` | 沉淀时的同名判定、治理反写查找。**刻意非唯一**，见 §4.7 |
| todo-dismiss | `user_id + todo_key`（唯一） | 待办关闭状态查询，唯一约束保证重复关闭幂等 |
| goods-lib | `user_id + category_id + last_used_time` | M-28 按分类筛选商品库 |
| goods-category | `user_id + sort` | 分类列表，按用户自定义顺序 |
| goods | `activity_id + governance_status + sort` | 活动内可展示商品及管理列表 |
| order | `order_no`（唯一） | 订单号查询、重复兜底 |
| order | `idempotent_key`（唯一） | **幂等拦截** |
| order | `activity_id + status` | 有效订单数、团长清单 |
| order | `user_id + create_date` | 「我的订单」 |
| order-item | `activity_id + goods_id + user_id + status` | **限购校验**，下单主链路 |
| order-item | `activity_id + status` | 有效总份数、预计金额、清单汇总 |
| order-item | `order_id` | 订单详情 |
| address | `user_id + deleted` | 地址簿列表 |

---

## 7. 订单号与短码

**活动短码** `activity.short_code`：4 位大写字母与数字（排除易混的 `0O1I`），创建活动时生成，全局唯一。

**订单号** `order.order_no`：`YYMMDD-{short_code}-{4位随机}`

```
示例：260914-A3F2-8821
```

设计意图是团长在群里口头核对订单时可读。唯一性由唯一索引保证；生成冲突时重试，不做全局自增序列（自增序列在并发下需要额外的分配器，得不偿失）。

---

## 8. 并发、幂等与安全

### 8.1 库存扣减

对 `sold_qty` 执行**带条件的原子自增**，一次操作同时完成校验与占用。`total_stock=0` 时使用不限库存分支，只校验活动/商品可售状态；`total_stock>0` 时增加库存上限条件：

```js
db.collection('grouporder-goods').where({
  _id: goodsId,
  on_sale: 1,
  governance_status: 0,
  sold_qty: dbCmd.lte(totalStock - qty)   // 仅 totalStock > 0 时添加
}).update({
  sold_qty: dbCmd.inc(qty)
})
// 返回 updated === 0 表示库存不足或已停售，本次下单失败
```

不依赖数据库事务，跨云实现一致，且结构上不可能超卖。取消订单时执行 `inc(-qty)` 返还。

### 8.2 限购校验

当 `per_user_limit>0` 时，聚合 `order-item` 按 `activity_id + goods_id + user_id + status=1` 求 `sum(qty)`，加本次数量后不得超过该商品限购数；`per_user_limit=0` 时跳过限购上限校验。限购**按商品分别计算**，购买甲商品不占用乙商品额度。

> 已知边界：首版 `username` 注册不采集手机号且无验证，注册小号成本极低，限购在效果上是防误操作的软约束而非强约束。团长设置限购的界面应如实说明这一点。

### 8.3 幂等

- 每次明确的「新下单」意图生成一个独立 `idempotent_key`；同一次请求的网络重试**复用同一个键**
- `idempotent_key` 唯一索引拦截重复写入，命中时返回已有订单而非报错
- `order_no` 唯一索引作为第二道兜底

### 8.4 截止竞态

所有截止判断一律使用**服务端时间**，客户端时间不可信。下单、改单、取消在写入前重新校验活动的 `status`、`end_time` 与 `governance_status`。

### 8.5 敏感字段权限

`order.consignee_*` 与 `address` 全表在 schema `permission` 中**禁止客户端直读**，只允许云函数访问。团长仅能读取本人发起活动中履约所需的部分（D-016、OPS §8）。运营侧列表与详情默认脱敏。

---

## 9. 数据留存与匿名化

- `retention_expire_date` 在活动截止或取消时写入（该日 +3 年），订单继承所属活动的到期日（D-035）
- 到期后由定时云函数删除或匿名化 `consignee_name`、`consignee_mobile`、`consignee_address` 及账号关联，置 `anonymized = 1`
- 活动数量、份数、金额等不可识别个人的汇总数据可长期保留
- 用户注销时删除或匿名化账号资料与地址簿；仍在三年期内的订单资料转为限制处理，仅用于争议、审计与必要合规
- Excel 文件与下载链接只临时保存，不随订单保留三年，具体有效期待安全方案确定（P1-07）

---

## 10. 第二批表：运营治理（完整规格）

运营后台按 `OPS_ADMIN_REQUIREMENTS.md` **完整规格**实施（D-042），评审意见 H-05 的削减建议不予采纳。共 9 张新表，另扩展 `uni-id-users` 两个字段。

### 10.0 运营账号与角色：复用 uni-id

不新建运营账号表。4 个角色通过 `uni-id-roles` 配置，权限点通过 `uni-id-permissions` 配置：

| 角色 | role_id |
|---|---|
| 超级管理员 | `ops-super` |
| 内容运营 | `ops-content` |
| 账号与隐私专员 | `ops-privacy` |
| 审计查看者 | `ops-auditor` |

- 「运营统计查看」是**独立权限点** `ops-stat-view`，默认关闭，不随任何角色自动获得（OPS §11.4）
- 运营账号不能自行注册，由超级管理员创建；停用通过 `uni-id-users.status` 实现
- 同一账号可兼任多个角色（`role` 为数组），撤销其一不影响其余
- **鉴权一律以操作提交时的最新账号状态与权限为准**，不得依赖进入页面时的结果（OPS §3.1）

**发布限制的当前状态存放在 `grouporder-user-ext`（见 §10.9），不修改 `uni-id-users`。**

创建与提交发布活动时都要校验发布权限，这是必经路径。若每次去扫 `grouporder-restriction` 流水求最新状态，需要排序、比对临时限制有效期、还要判断「解除限制」与后续新处置的先后关系，逻辑复杂且在并发处置下容易判错。因此采用**流水表 + 当前状态**的分工：`grouporder-restriction` 保留完整处置历史供审计，`grouporder-user-ext` 保存当前结论供校验。

当前状态不写入 `uni-id-users`，是为了不修改 uni-id 第三方模块 —— 否则模块升级时需要手动合并自有字段。独立扩展表同样只需一次读取即可判断，代价仅是多一次关联查询，而发布活动本身是低频操作。后续其他用户级业务字段也统一放入该表。

### 10.1 `grouporder-report` 举报

| 字段 | bsonType | 必填 | 说明 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `report_no` | string | ✓ | 举报编号，**唯一索引** |
| `activity_id` | string | ✓ | 被举报活动 |
| `goods_id` | string | | 被举报商品，举报可只指向活动 |
| `publisher_uid` | string | ✓ | 发布者 |
| `reporter_uid` | string | ✓ | 举报人 |
| `reason_type` | string | ✓ | 举报类型，对应负面清单分类 |
| `reason_desc` | string | | 举报描述 |
| `content_snapshot` | object | ✓ | **被举报内容快照**：标题、说明、商品、图片标识 |
| `content_check_id` | string | | 关联内容检测记录 |
| `status` | int | ✓ | 1待处理 2处理中 3已结案 4复核中 5复核完成 |
| `handler_uid` | string | | 处理人 |
| `claim_time` | timestamp | | 领取/开始处理时间 |
| `conclusion` | int | | 1无违规 2警告发布者 3下架商品 4下架活动 5临时限制发布 6永久限制发布 |
| `conclusion_reason` | string | | 结论理由 |
| `close_time` | timestamp | | 结案时间 |
| `related_report_ids` | array | | 指向同一活动的关联举报 |
| `create_date` | timestamp | ✓ | |

**约束**（OPS §5.1）：举报提交本身不修改商品或活动治理状态，只有审核结论成立后才能执行对应下架。多条举报指向同一活动时可关联查看，但**不得删除、覆盖或静默合并**原始举报记录；已产生相同处置结果的重复提交返回当前结果，不重复执行处置。`content_snapshot` 必须是举报时的内容，不能用当前内容替换历史证据。

### 10.2 `grouporder-report-review` 举报复核

独立成表而非在举报表内改写，因为 OPS §5.1 要求「创建新的复核记录，原举报、原结论和原操作日志继续保留」。

| 字段 | bsonType | 必填 | 说明 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `review_no` | string | ✓ | 复核编号，**唯一索引** |
| `report_id` | string | ✓ | 原举报 |
| `original_conclusion` | int | ✓ | **原结论快照**，不随原表变化 |
| `original_reason` | string | | 原结论理由快照 |
| `apply_uid` | string | | 复核发起人 |
| `apply_reason` | string | | 复核申请理由 |
| `status` | int | ✓ | 1复核中 2复核完成 |
| `reviewer_uid` | string | | 复核人 |
| `review_conclusion` | int | | 复核结论 |
| `review_reason` | string | | 复核理由 |
| `review_time` | timestamp | | |
| `create_date` | timestamp | ✓ | |

### 10.3 `grouporder-content-check` 内容检测与复核

| 字段 | bsonType | 必填 | 说明 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `object_type` | string | ✓ | `activity` / `goods` |
| `object_id` | string | ✓ | 送检对象 |
| `content_type` | string | ✓ | `text` / `image` |
| `content_version` | string | ✓ | **内容版本标识**，保证复核看到被检测时的版本 |
| `content_snapshot` | object | ✓ | 送检时的文字或图片标识 |
| `trace_id` | string | | 检测接口返回的追踪标识，异步回调匹配用 |
| `check_time` | timestamp | ✓ | |
| `check_result` | int | ✓ | 1通过 2命中需人工 3明确违规拦截 |
| `hit_reason` | string | | 命中原因或标签 |
| `status` | int | ✓ | 1待复核 2已放行 3维持拦截 4已处置 |
| `reviewer_uid` | string | | 复核人 |
| `review_conclusion` | string | | 复核结论 |
| `review_reason` | string | | 复核理由 |
| `review_time` | timestamp | | |
| `create_date` | timestamp | ✓ | |

**设计说明**

1. `trace_id` 用于匹配图片异步检测回调。按 D-043，异步处理期间活动保持审核中，只有对应内容版本全部审核通过后才进入进行中、公开列表并开放分享。
2. `content_version` + `content_snapshot` 共同保证 OPS §5.2 第 3 条「不能用当前内容替换历史证据」。

### 10.4 `grouporder-restriction` 发布者处置与限制

| 字段 | bsonType | 必填 | 说明 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `case_no` | string | ✓ | 处置编号，**唯一索引** |
| `target_uid` | string | ✓ | 被处置的发布者 |
| `action_type` | int | ✓ | 1警告 2临时限制发布 3永久限制发布 4解除限制 |
| `violation_type` | string | | 违规类型 |
| `reason` | string | ✓ | 处置原因 |
| `related_report_id` | string | | 关联举报 |
| `effective_from` | timestamp | | 临时限制起始 |
| `effective_to` | timestamp | | 临时限制截止 |
| `operator_uid` | string | ✓ | 操作人 |
| `prev_status` | int | | 处置前发布权限状态 |
| `next_status` | int | | 处置后发布权限状态 |
| `create_date` | timestamp | ✓ | |

**约束**（OPS §7）：警告是处置记录，**不改变账号状态**；发布限制只作用于发起和发布活动，不限制登录、查看本人历史或参与他人活动；对已有活动是否下架必须逐个形成内容处置结论，**不能通过限制发布者静默改变已有活动状态**。

### 10.5 `grouporder-bind-appeal` 账号绑定申诉

| 字段 | bsonType | 必填 | 说明 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `appeal_no` | string | ✓ | 申诉编号，**唯一索引** |
| `applicant_uid` | string | ✓ | 申诉人 |
| `wx_identity` | string | | 关联微信身份标识摘要，**不存完整凭证** |
| `target_account_uid` | string | | 目标平台注册账号 |
| `current_binding` | object | | 当前绑定关系快照 |
| `both_have_data` | int | | 双方是否均有业务数据 0否 1是 |
| `appeal_type` | int | ✓ | 1解绑 2重新绑定 |
| `status` | int | ✓ | 1待处理 2处理中 3处理成功 4处理失败 |
| `handler_uid` | string | | 账号与隐私专员 |
| `identity_verify_result` | string | | 身份核验过程与结果 |
| `handle_reason` | string | | 处理原因 |
| `fail_reason` | string | | 失败原因摘要，**不含敏感内部信息** |
| `handle_time` | timestamp | | |
| `create_date` | timestamp | ✓ | |

**约束**（OPS §9、D-031、D-055）：解绑与重新绑定**不改变任何活动、订单、限购统计或收货信息的归属**；双方均有业务数据时不创建该类申诉，不执行解绑、重新绑定、合并或迁移，用户继续分别使用原账号；其他申诉提交时重新检查绑定状态防止并发覆盖，重复申诉返回最新状态、不重复解绑。

### 10.6 `grouporder-privacy-case` 注销、删除与匿名化事项

| 字段 | bsonType | 必填 | 说明 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `case_no` | string | ✓ | 事项编号，**唯一索引** |
| `case_type` | int | ✓ | 1账号注销 2删除请求 3到期匿名化 |
| `target_uid` | string | ✓ | 对象用户 |
| `retention_start` | timestamp | | 保存期起点（活动截止或取消之日） |
| `retention_expire` | timestamp | | 三年到期日 |
| `status` | int | ✓ | 1已登记 2限制处理中 3已到期待处理 4已完成 5执行失败 |
| `restricted` | int | | 是否已转入限制处理 |
| `execute_result` | string | | 删除或匿名化执行结果 |
| `execute_time` | timestamp | | |
| `operator_uid` | string | | 登记人 |
| `create_date` | timestamp | ✓ | |

**约束**（OPS §15）：后台支持登记与跟踪保存起点、到期状态、限制处理状态及执行结果，但**不允许运营人员任意延长、缩短或绕过既定期限**。

### 10.7 `grouporder-export-log` Excel 生成与下载事件

| 字段 | bsonType | 必填 | 说明 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `activity_id` | string | ✓ | 关联活动 |
| `leader_uid` | string | ✓ | 团长 |
| `request_uid` | string | ✓ | 请求人 |
| `file_version` | string | ✓ | **文件版本或生成标识，不是下载地址** |
| `event_type` | int | ✓ | 1生成成功 2生成失败 3下载成功 4下载失败 5权限拒绝 |
| `permission_check_result` | string | | 权限校验结果 |
| `link_valid_result` | string | | 链接有效性结果 |
| `fail_reason` | string | | 失败原因摘要 |
| `request_id` | string | | 请求唯一标识 |
| `create_date` | timestamp | ✓ | |

**硬性约束**（OPS §10、D-071）：**不得保存公开固定下载地址**，页面不得展示可继续使用的临时下载地址；运营人员不能通过日志下载、预览或重新生成团长清单。

- `file_version` 存的是**生成标识与版本号**，不是 URL。实现上可用云存储 fileID 或自定义批次号，但**任何情况下都不得写入临时下载地址**。
- **临时下载地址有效期 30 分钟，文件云存储保留 60 天**（D-071）。清单是可从订单随时重新生成的过程产物，**不纳入 D-035 的订单三年留存**——多保存一份含姓名、电话、完整地址的文件只会扩大泄露面。
- **每次下载重新校验权限并重新换取临时地址**：团长身份、活动业务状态与治理状态在两次下载之间都可能变化，缓存地址等于绕过鉴权。每次下载各写一条本表记录。
- 作废订单等使统计口径变化的操作**立即使既有版本失效**（D-051）；失效版本仅标记，随 60 天保留期一并清除。

### 10.8 `grouporder-oplog` 统一操作日志

OPS §13 要求一种操作日志，含 **9 个必含字段**，覆盖其列举的 **11 类必记事件**。

| 字段 | bsonType | 必填 | 对应 OPS §13 要求 |
|---|---|---|---|
| `_id` | objectId | - | 系统自动生成 |
| `log_no` | string | ✓ | 唯一日志编号 |
| `operate_time` | timestamp | ✓ | 操作时间 |
| `operator_uid` | string | ✓ | 操作账号 |
| `operator_roles` | array | ✓ | **当时生效的角色** |
| `operator_permissions` | string | | 权限摘要 |
| `action_type` | string | ✓ | 动作类型 |
| `result` | int | ✓ | 操作结果 1成功 0失败 |
| `object_type` | string | ✓ | 被操作对象类型 |
| `object_id` | string | ✓ | 对象稳定内部标识 |
| `case_no` | string | | 关联举报、申诉或处理事项编号 |
| `reason` | string | | 操作原因或失败原因摘要 |
| `prev_state` | object | | 操作前状态 |
| `next_state` | object | | 操作后状态，**无变化时明确记录** |
| `request_id` | string | ✓ | 请求唯一标识，识别重复请求 |

**必记的 10 类事件**：运营账号登录成功/失败/停用/角色变更；举报领取/结论/结案/复核/结果变更；内容检测查看/复核/处置；活动下架/恢复/失败尝试；发布者警告/临时限制/永久限制/解除；完整姓名电话地址的查看成功与拒绝；账号解绑/重新绑定/拒绝/重复请求；Excel 事件查询；运营统计查询成功/拒绝与统计权限变更；注销删除匿名化事项登记与状态变化。

**硬性约束**（OPS §13）：
- 日志**不得记录**密码等凭证或可继续使用的下载链接
- 除必要证据外**不重复保存**完整姓名、电话、地址
- **运营人员不能修改或删除审计日志** —— schema `permission` 设为仅允许云函数写入，`update` 与 `delete` 对所有角色关闭

### 10.9 `grouporder-user-ext` 平台用户业务扩展

与 `uni-id-users` 一对一，存放本项目自有的用户级业务状态。**建立此表是为了不修改 uni-id 第三方模块。**

| 字段 | bsonType | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `_id` | objectId | - | | 系统自动生成 |
| `user_id` | string | ✓ | | 对应 `uni-id-users._id`，**唯一索引** |
| `publish_restriction` | int | | 0 | 当前发布权限 0正常 1临时限制发布 2永久限制发布 |
| `restriction_expire` | timestamp | | | 临时限制到期时间。读取时若当前时间已超过该值即视为正常，不依赖定时任务准点执行 |
| `restriction_case_no` | string | | | 产生当前限制的处置编号，可回溯到 `grouporder-restriction` 的具体记录 |
| `create_date` | timestamp | | 自动 | |
| `update_date` | timestamp | | | |

**维护方式**：运营在 `grouporder-restriction` 写入处置流水的同一操作序列内，同步更新本表的当前状态。流水表是历史与审计依据，本表是校验依据，两者不可互相替代。

### 10.10 第二批表索引

| 表 | 索引 | 用途 |
|---|---|---|
| report | `report_no`（唯一） | 按编号检索 |
| report | `status + create_date` | 待办列表 |
| report | `activity_id` | 同活动关联举报 |
| report | `handler_uid + status` | 本人处理中事项 |
| report-review | `report_id` | 原举报的全部复核 |
| content-check | `object_type + object_id + content_version` | 对象的检测历史 |
| content-check | `trace_id` | **异步回调匹配** |
| content-check | `status` | 待复核队列 |
| restriction | `target_uid + create_date` | 发布者处置历史 |
| bind-appeal | `status + create_date` | 待办列表 |
| privacy-case | `retention_expire + status` | **到期扫描** |
| export-log | `activity_id + create_date` | 按活动查询 |
| oplog | `operator_uid + operate_time` | 按操作人审计 |
| oplog | `object_type + object_id` | 按对象审计 |
| oplog | `case_no` | 按事项审计 |
| oplog | `request_id` | 重复请求识别 |
| user-ext | `user_id`（唯一） | 发布权限校验 |

## 11. 产物清单与项目重建

### 11.1 产物

本设计的全部产物是 **38 个文件**，位于 `grouporder-admin/uniCloud-alipay/database/`：

```
grouporder-<表名>.schema.json    19 个   表结构定义
grouporder-<表名>.index.json     19 个   索引定义
uni-id-users.schema.json         1 个   覆盖版，补回 status = 4（见 §3）
```

这些文件即**唯一真相**，不存在其他生成源。文档描述与之一一对应，任何一侧变更后须重新执行一致性核对（方法见 §11.3）。

**同一份副本保存在 `docs/arch/schema/`**。工程目录随 IDE 升级或项目重建而消失时，从该备份恢复即可；两处内容须保持一致，修改后同步复制。

### 11.2 重建项目时的恢复步骤

更换 IDE 版本或重新创建工程后：

1. 在新工程中定位 uniCloud 目录下的 `database` 子目录。注意服务空间供应商不同，目录名可能是 `uniCloud-alipay`（阿里云）或 `uniCloud-tcb`（腾讯云），按实际为准
2. 将 `docs/arch/schema/` 下的 39 个文件整体复制进去（含 `uni-id-users.schema.json` 覆盖版）
3. 关联云服务空间后上传 DB Schema

**不需要重新设计或重新生成**——schema 文件与工程创建方式无关，复制即可用。

以下内容属于 uni-admin 模板或 uni-id 模块自带，**由模板带入，不要从旧工程复制**：`uni-id-*`、`opendb-*`、`uni-stat-*`、`uni-pay-*` 等。

### 11.3 一致性核对方法

文档与 schema 的对应关系应可被机械校验，核对项：

| 项 | 内容 |
|---|---|
| 字段集合 | 文档字段表的字段名与 schema `properties` 的键完全一致 |
| 必填 | 文档标 ✓ 的字段应在 schema `required` 中，**带 `defaultValue` 或 `forceDefaultValue` 的字段除外**（见 §4 图例） |
| 枚举 | 枚举字段的取值与决策记录一致（如 `activity.status` 对应 D-043、`goods.total_stock` 的 0 值语义对应 D-044） |
| 索引 | 唯一索引覆盖 `order_no`、`idempotent_key`、`short_code`、`config_key`、`user_ext.user_id`；限购校验复合索引 `(activity_id, goods_id, user_id, status)` 存在 |
| 外键 | `foreignKey` 指向的表均存在 |
| 权限 | 16 张表 `permission` 均为客户端全禁 |

---

## 12. 待确认项

| 编号       | 事项                      | 现状                                                       |
| -------- | ----------------------- | -------------------------------------------------------- |
| A-04     | 微信服务类目与主体核验（P1-09、B-01） | 未核验，阻塞 schema 落地                                         |

---

## 13. 变更记录

| 日期 | 版本 | 变化 |
|---|---|---|
| 2026-09-14 | v0.1 | 建立第一批 5 张核心表设计，含字段、索引、状态机、并发与幂等策略 |
| 2026-09-14 | v0.2 | 按 D-042 完整规格补齐第二批 9 张运营治理表，含运营角色复用方案、敏感资料访问链路与第二批索引；A-01、A-03 已裁定 |
| 2026-09-14 | v0.3 | A-02 裁定为展示，有效总份数可见范围改为所有访问者 |
| 2026-09-14 | v0.4 | 新增 `grouporder-config` 平台配置表与 `activity.review_mode`，支持发布审核模式后台可配置（D-057）；登记 A-06 |
| 2026-09-14 | v0.5 | A-06 裁定：图片异步检测不阻塞审核放行，回调命中转治理下架（D-058） |
| 2026-09-14 | v0.6 | 15 张 schema 与 index 文件已生成到 `grouporder-admin/uniCloud-alipay/database/`，共 42 条索引、10 个唯一索引；权限策略统一为客户端禁读写、全部走云函数 |
| 2026-09-14 | v0.7 | 发布限制当前状态改存独立的 `grouporder-user-ext`，不再修改 `uni-id-users`，避免 uni-id 模块升级时手动合并自有字段；表数增至 16 张 |
| 2026-09-14 | v0.8 | 处理两工程 uni-id 版本差异，确立「只从 admin 上传、client 只拉取」的上传约定 |
| 2026-09-14 | v0.9 | 删除多余的 `uni-id-users` 覆盖版；保留 `uni-id-device` 覆盖版 |
| 2026-09-18 | v1.15 | 移除全部已废止内容的留痕：删除 §10.10 `grouporder-ops-verify` 表定义与 §10.11 敏感资料访问链路两节（原 §10.12 第二批表索引前移为 §10.10）、§3 表清单与索引汇总表中的 `ops-verify` 行；§12 待确认项移除 A-01/02/03/05/06/07 六条已裁定项，仅保留未核验的 A-04。改动历史统一在本表记录，正文不再保留删除线 |
| 2026-09-18 | v1.14 | 吸收已删除的 `ACTIVITY_COPY_SPEC.md`：新增 **§4.10 活动复制语义（D-067）**，含字段级复制规则、可作为源的范围、截止时间推算公式与兜底顺序、四条实现约束、图片文件引用、两个接口契约与 14 条 AC-AC-* 验收标准。不新增任何字段。§4.7 对 `GOODS_LIB_SPEC` 的版本引用由 v0.2 更正为 v0.3 |
| 2026-09-18 | v1.13 | D-072 补漏：§1 权限策略的表数 15 → **19**；§13 `grouporder-oplog` 必记事件 11 类 → **10 类**（删「二次验证成功/失败/过期」）、硬性约束改「不得记录密码等凭证」；§10.12 索引汇总表的 `ops-verify` 行标记停用；§10.10 的约束段补「仅作存档」标注 |
| 2026-09-18 | v1.12 | 按 D-072 停用 `grouporder-ops-verify` 表、取消 §10.11 敏感资料访问链路；后台不再脱敏、不设二次验证、导出不受限制 |
| 2026-09-16 | v1.11 | 按 D-071 补充 `grouporder-export-log` 的链接有效期、文件保留期、每次下载重新鉴权与版本失效约束；A-05 关闭 |
| 2026-09-16 | v1.10 | §4.8 补充说明 `grouporder-todo-dismiss` 仅服务小程序端，运营后台待办不使用本表也不建表（D-070） |
| 2026-09-16 | v1.9 | §3 补充 uni-id 模块升级后的三项必检清单（`status` 枚举、`isAdmin`、`loginTypes`），记录 1.1.28 升级实际覆盖项目配置的事实 |
| 2026-09-16 | v1.8 | 按 D-068 补充 `grouporder-ops-verify` 的验证形式、1 天有效期、免验三条件与失败锁定规则；明确本表不关心验证方式，升级 TOTP 无需改表 |
| 2026-09-16 | v1.7 | 按 `GOODS_LIB_SPEC` v0.3 落实 D-065、D-066：`goods` 与 `goods-lib` 各增 `is_recommend`（仅视觉强调，**不进入排序**，每活动上限 5 个）；`goods-lib` 增 `category_id` 与 `user_category` 索引；新建 `grouporder-goods-category` 分类表；表清单第一批增至 9 张、合计 19 张。**`grouporder-goods.index.json` 未改**——推荐不参与排序，现有索引已够用 |
| 2026-09-15 | v1.6 | 按 `NAV_AND_GOODS_ALIGNMENT.md`（评审文档，已于 2026-09-18 删除）落实导航与交付方式方案：新增 `grouporder-todo-dismiss` 表（D-062 待办派生视图的唯一落库状态）；`activity` 新增 `delivery_type`（D-060，发布后不可修改）；`order.consignee_address` 由必填改条件必填（自提活动不采集地址）；表清单第一批增至 8 张、合计 18 张 |
| 2026-09-15 | v1.5 | 按 `GOODS_LIB_SPEC.md` **v0.2** 重做：商品库新增 `last_total_stock`、`last_per_user_limit` 并进 `required`，复用由「不继承置 0」改为「预填 + 必须逐项确认」；`grouporder-goods` 新增可空字段 `lib_id`（不进 `required`、不声明 `foreignKey`、不加索引），v1.4 的「goods 未做任何改动」结论作废；§4.2 补 `lib_id` 四项禁止用法；治理反写改为「`lib_id` 精确定位」与「团长 + 商品名」两条取并集且软删记录同样封禁；§4.7 补库记录独立维护规则 |
| 2026-09-15 | v1.4 | 按 `GOODS_LIB_SPEC.md` 新增 `grouporder-goods-lib` 用户商品库表（D-063、D-064）：表清单第一批增至 7 张、合计 17 张；新增 §4.7 表定义；§6 补两条索引；§1 补充 `file` 字段在复制关系下的孤儿文件清理约束 |
| 2026-09-15 | v1.3 | uni-id-pages 两侧对齐至 1.1.28（由产品负责人经插件市场升级，未手动改动模块）；新增 `uni-id-users` 覆盖版补回 `status = 4`；工程重建导致 32 个产物文件丢失后已照本文档重新生成并通过一致性核对；产物同时备份至 `docs/arch/schema/`；A-07 关闭 |
| 2026-09-14 | v1.1 | 全表 Review：修正 `grouporder-goods` 字段名 `limit_per_user` → `per_user_limit`（PRD、D-044 与本文档均用后者，schema 沿用了设计初期的旧名）；`grouporder-content-check` 的 `required` 补入 `content_snapshot`、`check_time`；为 §10 的 10 张表与 §4.6 的文档字段表补齐 `_id` 行；新增字段表标记图例与 §11 产物清单。两轮机械核对（字段集合／必填／枚举／索引／外键／权限）均无差异 |
| 2026-09-14 | v1.0 | 查明两工程 uni-id 版本差异的成因（admin 只能由 HBuilderX 创建与管理，uni-admin 不支持 CLI）及其影响（schema 与 `uni-id-co` 云函数双向覆盖）；曾手动替换 admin 模块为 1.1.28，经产品负责人要求已**完整回滚**至 1.1.20 原样，改为由产品负责人通过 HBuilderX 插件市场正式升级。本文档不再记录任何对第三方模块的手动改动 |
| 2026-09-14 | v0.3 | 版本号不变，同步 D-043～D-056：发布审核状态、无限库存/不限购、商品单位与治理状态、地址默认接替、公开活动、全量改单、整单作废和注销前置条件 |
