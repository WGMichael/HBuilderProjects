# 云函数与云对象总契约

- 文档版本：v0.9（设计稿 v0.1 → 实现回填 v0.2 → 裁决收口 v0.3 → 登录审计归位 v0.4 → 自提点字段 v0.5 → 角色收口 v0.6 → 审核冻结与复用源 v0.7 → 待确认项编号 v0.8 → 强幂等与自动处置 v0.9 → 图片先选后传 v0.10 → 复用源收紧 v0.11 → 交付方式多选 v0.12 → 起始时间 v0.13 → 商品库新建 v0.14 → 默认值口径 v0.15 → 删除草稿 v0.16 → 复制预填 v0.17 → 取消确认门 v0.18 → 读时补截止 v0.19 → 商品库添加去重 v0.20 → 新建不覆盖选项 v0.21 → 我参与的按活动分页 v0.22 → 读取不截断 v0.23 → 上线前 Review 修复 v0.24 → 并发与一致性 v0.25 → 团长记录与文字清单 v0.26 → 团长联系方式 v0.27 → 按活动码查找 v0.28 → 团长统计与会员预留 v0.29 → 团长名片 v0.30 → 开始后不能取消 v0.31 → 接龙码与接龙记录 v0.32 → 团长订单详情 v0.33 → 海报封面代下载 v0.34 → 图片地址刷新 v0.35 → 编辑只认变化字段 v0.36 → 待办调整 v0.37 → 时间窗口 v0.38 → 商品库同步 v0.39 → issue 整改 v0.40 → 授权复制 v0.41 → 授权复制可修改 v0.42）
- 日期：2026-10-08
- 性质：**全部服务端接口的唯一事实源**。服务端按此实现；admin 端与 client 端两个前端按此调用。
- 事实来源：`docs/00-product/PRD.md`、`docs/00-product/OPS_ADMIN_REQUIREMENTS.md`、`docs/00-product/DECISIONS.md`、`docs/02-arch/DATA_MODEL.md`、`docs/01-ux/UX_FLOW_SPEC.md`、`docs/02-arch/GOODS_LIB_SPEC.md`

> **修改规则**：本文由**服务端维护者维护**（回填入出参、补错误码）。两个前端**只读**；发现缺方法或签名不符**上报**，不自行修改。
> 与 OPS / DECISIONS / DATA_MODEL 冲突时**一律上报，不自行裁决**。

---

## 1. 总览

### 1.1 一览表

| # | 云对象 / 云函数 | 服务端 | 服务对象 | 方法数 |
|---|---|---|---|---|
| 1 | `grouporder-activity-co` | 活动与活动内商品的全生命周期 | client（团长 + 参与者） | 17 |
| 2 | `grouporder-order-co` | 订单、改单、取消作废、团长统计 | client | 9 |
| 3 | `grouporder-goods-co` | 商品库与分类（账号级） | client | 9 |
| 4 | `grouporder-user-co` | 收货信息簿、绑定申诉、隐私请求、待办 | client | 13 |
| 5 | `grouporder-export-co` | 清单预览、Excel 生成与下载 | client（团长） | 3 |
| 6 | `grouporder-report-co` | 举报提交与结果查看 | client | 3 |
| 7 | `grouporder-ops-co` | 运营后台全部业务方法 | admin | 38 |
| 8 | `common/grouporder-common` | 公共模块，被上述全部 require | — | 14 个模块 |
| 9 | 定时与回调云函数（非对象） | 自动截止、清单清理、留存到期、检测回调 | — | 4 |

**合计 93 个方法 + 14 个公共模块 + 4 个云函数。**

> v0.1 的「80 个方法 / 11 个模块」与逐节清单对不上，v0.2 已核清：v0.1 的分对象声称数中
> `goods-co` 9 实列 8、`user-co` 13 实列 12（各漏写一个方法）、`ops-co` 声称 27 实列 33
> （合并 `OPS_CO_API.md` 时未更新数字）。补齐漏写的两个方法、新增 4 个方法、把治理下架与恢复各拆为活动版与商品版后为 92 个，
> 逐节清单与本表一致。公共模块 11 → 14 的三个新增见 §3。

### 1.2 划分原则

- **按业务域拆，不按页面拆**。一个域的状态机、幂等与并发规则写在一起，跨对象调用一律走 `common`，**云对象之间不互相调用**。
- **活动与活动内商品放同一个对象**：商品是活动的子资源，改价、停售、库存调整都要同时校验活动状态，拆开会产生跨对象事务。
- **商品库单独成对象**：它是**账号级**资产，与任何单个活动无关（`GOODS_LIB_SPEC`）。
- **后台单独成对象**：权限模型、审计要求与客户端完全不同（D-072、D-075、D-076）。

> **对早期草案（已归档工作单批次 B）的两处云对象归属调整**（草案明确允许「若架构另有划分则调整归属，方法语义不变」）：
> ① `activityCopySourceList` / `activityCopy` 由 `grouporder-goods-co` 移到 `grouporder-activity-co`——它复制的是活动，不是商品库记录；
> ② 私有函数 `_sinkToLib` / `_blockLibByGoods` 移到 `common/goodslib.js`——前者被 activity-co 调用、后者被 ops-co 调用，放在 goods-co 里会形成云对象互调。

### 1.3 建议的实现顺序（交付仍是一次性）

`common` → 一条纵切跑通（`activityCreateDraft` → `activitySubmitReview` → `orderPreview` → `orderCreate`）→ 再按 1~7 铺开。**先铺方法壳、后填逻辑会让状态机校验点被漏掉。**

---

## 2. 通用约定

### 2.1 出参

```js
{ errCode: 0, data: <各方法自定义> }                      // 成功
{ errCode: 'XXX_YYY', errMsg: '可直接展示的说明', detail: {} } // 失败
```

前端按 `errCode === 0` 判成功、按 `errCode` 分支处理异常，**不解析 `errMsg` 文本**。

### 2.2 列表类方法

| 方向 | 结构 |
|---|---|
| 入参 | `{ page: 1, pageSize: 20, filters: {...}, orderBy: { field, direction } }` |
| 出参 | `{ list: [...], total, asOf }` |

`pageSize` 服务端强制上限 100。`asOf` 为数据截至时间，统计类必须返回（OPS §12.2）。

**服务端内部读取不得用固定条数截断**（2026-10-15）：分页只约束返回给前端的条数；凡是需要「全部」的读取——清单导出的全部有效订单与明细、一页订单的全部明细、本人全部订单（M-18 归组、待办、注销检查）——一律用 `paging.fetchAll` / `paging.fetchAllByIds` 分批读完（每批 500 条，`dbCmd.in` 每批 100 个 id），并带稳定排序（末位 `_id`）。聚合 `group` 一律显式 `.limit(paging.AGG_LIMIT)`（1000），不依赖平台默认返回条数。统计数字（订单数、份数、金额）用 `count` / 聚合计算，不读出全部记录。

### 2.3 错误码

**通用**（两端共用）：

| errCode | 含义 |
|---|---|
| `UNAUTHENTICATED` | 未登录或会话失效 |
| `FORBIDDEN` | 无权操作该对象 |
| `NOT_FOUND` | 对象不存在或已删除 |
| `STATE_CHANGED` | 状态已被他人修改，需刷新 |
| `DUPLICATE` | 重复提交，返回首次结果 |
| `INVALID_PARAM` | 入参非法 |
| `PARTIAL_FAILED` | 部分失败，**不得显示整体成功** |

**客户端业务码**：

| errCode | 含义 | 触发点 |
|---|---|---|
| `ACTIVITY_CLOSED` | 活动已截止 | 服务端时间判定（§8.4） |
| `ACTIVITY_NOT_STARTED` | 活动尚未开始 | 服务端时间早于 `start_time`；`detail.start_time` 给出开始时间（D-087） |
| `ACTIVITY_CANCELLED` | 活动已被团长取消 | |
| `ACTIVITY_OFFLINE` | 活动被平台下架 | 禁止新建或扩大订单，不影响查看 |
| `GOODS_OFF_SALE` | 商品已停售 | 允许减少或移除，不允许新增扩大 |
| `GOODS_OFFLINE` | 商品被平台下架 | 同上，仅影响该商品 |
| `STOCK_NOT_ENOUGH` | 库存不足 | 原子扣减返回 `updated === 0` |
| `LIMIT_EXCEEDED` | 超出每人限购 | 按商品分别计算 |
| `DELIVERY_TYPE_LOCKED` | 交付方式集合发布后不可改 | D-060、D-086 |
| `PRECONDITION_UNMET` | 前置条件不满足 | 如注销时仍是进行中活动的团长（D-056） |
| `ACTIVITY_REVIEWING` | 活动审核中，内容冻结 | 需先撤回至草稿再修改（D-079）；`activityUpdateDraft`、`activityUpdatePickup`、`goodsCreate/Update/Delete/Sort`、`goodsSetOnSale`、`goodsAdjustStock`、`libCopyToActivity` 命中 |

**后台业务码**：沿用上表，前缀 `OPS_`（`OPS_FORBIDDEN` 等），另加 `OPS_TARGET_CLOSED`（活动在处置期间截止或被取消）。

### 2.4 三项强制声明

每个方法在实现时必须明确：

| 项 | 规则 |
|---|---|
| **鉴权** | 以**提交时刻**的账号状态与权限为准，不依赖进入页面时的结果（OPS §3.1、§12.2） |
| **日志** | 后台方法一律写 `grouporder-oplog`（成功与拒绝都写）；**客户端的商品经营变动（改价、改单位、停售/恢复、库存与限购调整）同样写 `grouporder-oplog`**，取 §10.8 第 11 类，`operator_roles` 为空数组以区分来源；客户端的清单生成与下载写 `grouporder-export-log`。`action_type` 一律取 `DATA_MODEL §10.8` 枚举表 |
| **幂等** | 写方法声明幂等键；重复提交返回首次结果而非报错（§8.3） |

### 2.5 服务端时间

**所有截止判断一律用服务端时间**，客户端时间不可信。下单、改单、取消在写入前重新校验活动 `status`、`start_time`、`end_time`、`governance_status`（§8.4、D-087）。

---

## 3. `common/grouporder-common` 公共模块

| 模块 | 导出 | 规格 |
|---|---|---|
| `auth.js` | `requireLogin(ctx)`、`requireLeader(ctx, activityId)`（团长本人）、`requirePermission(ctx, 'ops-xxx')`（后台权限点） | OPS §3.1；D-076 后超管按权限点判断即可，**无需特例分支** |
| `errors.js` | §2.3 全部错误码常量与构造函数 | OPS §12.2 |
| `paging.js` | `normalize(params)`、`wrap(list, total, asOf)` | §2.2 |
| `idempotent.js` | 幂等键生成、唯一索引冲突时返回既有结果 | `DATA_MODEL §8.3` |
| `state.js` | 活动/订单/商品三套状态机的**合法迁移校验**；双状态独立不互写 | `DATA_MODEL §5` |
| `stock.js` | `deduct(goodsId, qty)` 带条件原子自增、`restore(goodsId, qty)`、`checkUserLimit()` | `DATA_MODEL §8.1`、§8.2 |
| `snapshot.js` | 下单时固化价格快照与收货快照 | `DATA_MODEL §4.3`、§4.4 |
| `oplog.js` | 后台审计写入，自动补齐操作人、**当时生效的角色**、时间、日志编号 | OPS §13；`DATA_MODEL §10.8` |
| `exportlog.js` | Excel 事件写入 `grouporder-export-log`；**不得写入任何可继续使用的下载地址** | OPS §10；D-071③ |
| `goodslib.js` | `sinkToLib(goods)` 商品保存时沉淀、`blockLibByGoods(goods)` 治理反写封禁 | `GOODS_LIB_SPEC §4`、§7；D-064 |
| `config.js` | 读取 `grouporder-config`，主要是 `review_mode` | D-057 |
| `contentcheck.js` | **v0.2 新增**。送检的发起、`grouporder-content-check` 记录写入、`trace_id` 生成与异步回调匹配；文本同步、图片异步 | D-043、D-058；`DATA_MODEL §10.3` |
| `deliverystat.js` | **v0.12 新增**。`breakdown(ctx, activity)` 按交付方式拆分有效单数与份数，被 activity-co（M-20 统计）与 order-co（`orderLeaderStat`）共用 | D-086 |
| `restriction.js` | **v0.2 新增**。`assertCanPublish(ctx, uid)` 发布权限校验（读 `grouporder-user-ext`）、`apply()` 写处置流水并同步当前状态 | OPS §7；`DATA_MODEL §10.4`、§10.9 |
| `review.js` | **v0.2 新增**。`content_version` 递增与内容改动后的重新送审 | D-043、D-048；`GOODS_LIB_SPEC §5.4` |
| `files.js` | **v0.10 新增**。`fileIdsOf(...fields)` 取 fileID、`toDbPatch(ctx, patch)` 把 `cover_image` 包成 `dbCmd.set` 整体替换（避免按子字段合并在原值为 null 时报错）、`releaseFiles(ctx, prevIds, nextIds)` 写库成功后回收三表均无引用的旧图。被 activity-co 与 goods-co 共用 | D-084；`GOODS_LIB_SPEC §6` |

> `retention.js`（三年到期日计算）已并入 `snapshot.js`（`stampRetention`）；规则见 `DATA_MODEL §9`。
> 订单号、活动短码与各类业务编号的生成并入 `idempotent.js`，不单开模块。

**为什么必须新增这三个**：三者都被两个以上云对象调用，按硬约束①「云对象之间不互相调用，
跨对象逻辑一律下沉到 common」不能留在任一对象内。
`contentcheck` 被 activity-co（提交审核）、goods-co（`libUpdate` 改图重检）与
`grouporder-check-callback` 共用；`restriction` 被 activity-co（创建与提交都要校验发布权限）
与 ops-co（`publisherRestrict`）共用；`review` 被 activity-co 与 goods-co 共用——
`libCopyToActivity` 在 goods-co 里却要让活动重新进审核。

> `exportlog.js` 的职责在 v0.2 扩写为三项：事件写入、30 分钟临时地址换取
> （export-co 与 ops-co **两处共用同一份实现**）、清单版本失效的**派生判定**。
> `auth.js` 增加 `optionalLogin(ctx)`，支撑 D-033／P1-01 的未登录浏览。

---

## 4. `grouporder-activity-co` 活动与活动内商品

### 4.1 活动

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `activityCreateDraft` | 新建草稿 | M-10 | **`idempotent_key` 必填，活动表唯一索引，重试返回已有草稿**（D-081）；**`delivery_types` 必填、至少一种**（D-086，兼容旧单值 `delivery_type`）；`start_time` 可选，默认当前时间，须早于 `end_time`（D-087）；`pickup_*` 可选（**草稿阶段不卡自提必填，发布时由 `activitySubmitReview` 校验**，D-077）；**`cover_image` 草稿阶段不校验，发布时校验**（D-084）；出参带 `create_date`，供客户端拼图片目录；草稿不占用任何公开入口 |
| `activityUpdateDraft` | 编辑草稿 | M-10 | **审核中拒绝，返回 `ACTIVITY_REVIEWING`**（D-079）；**`delivery_types` 发布后不可改**（D-060、D-086 → `DELIVERY_TYPE_LOCKED`）；`start_time` 发布后仅未开始时可改、不得早于当前、不触发重新审核，按分钟比较判定是否改动（D-087）；草稿/可编辑态可带 `pickup_*`，改 `pickup_*` 不触发重新审核。**发布后改自提点走独立方法 `activityUpdatePickup`**（D-077）；草稿阶段允许 `cover_image` 为空，已发布过的活动不得清空；**保存成功后回收被替换且无人引用的旧图**（D-084） |
| `activityUpdatePickup` | 改自提点 | M-20 → 自提点编辑页 | **发布后改自提点专用**（D-077）：仅支持自提的活动（D-086）、不受内容改动限制、即时生效、不触发重新审核；文本送检不阻塞、写 `oplog`；已取消/已下架拒绝 |
| `activitySubmitReview` | 提交审核 | M-12 | **提交时把平台配置的 `review_mode` 固化到 `activity.review_mode`**（D-057）；自动模式下内容检测通过即置进行中、`review_uid` 为空；人工模式进审核中；**提交时统一校验资料齐全**：活动封面、至少一个商品、每个商品封面、支持自提时的自提地址、起始时间早于截止时间（D-041、D-077、D-084、D-086、D-087） |
| `activityWithdrawReview` | 撤回审核 | M-12 | 审核中 → 草稿 |
| `activityGetDetail` | 活动详情 | M-13 / M-20 | **同一方法按身份返回不同字段**：参与者得非敏感内容 + 各商品已购份数 + 有效总份数；团长另得统计与管理入口。审核中仅团长与获权内容运营可见 |
| `activityMyList` | 我发起的 | M-09 | 按业务状态与治理状态双维度筛选，两者**分列不合并** |
| `activityClose` | 手动截止 | M-23 | 不可逆；截止后不可再取消（D-027） |
| `activityCancel` | 取消活动 | M-23 | **原因必填**；仅允许草稿或**开始前**的进行中活动（到了起始时间即拒绝 `PRECONDITION_UNMET`，条件更新带 `start_time > now`，D-111）；已截止不可取消（D-027）；写入 `retention_expire_date` |
| `activityDeleteDraft` | 删除草稿 | M-09 / M-20 | **仅从未发布、未被处置、无订单的草稿**，否则 `PRECONDITION_UNMET`；连同活动商品一起删除，回收三表无人引用的图片；商品库不受影响（D-090） |
| `activityGetShareEntry` | 取分享入口参数 | M-12 / M-13 / M-20 | 入口不可枚举；**入口有效不等于授予敏感数据权限**，服务端逐次鉴权（D-034）。⚠ 分享 path 用 `activity_id`，**不得用 `short_code`**（仅 32⁴ ≈ 105 万，可枚举）。**D-083 已定方案 1**：`activityGetDetail` 的 `short_code` 查询分支已移除，短码仅用于订单号拼装与口头引用，不再是查询入口。客户端接入方式与 `onShareAppMessage` 的同步性约束见 `SHARE_SPEC.md §4` |
| `activityCopySourceList` | 可复制的历史活动 | M-31 | 仅本人发起；**只列出已截止（`status = 3`）且未被平台下架的活动**（D-085 取代 D-080，AC-AC-006） |
| `activityCopyAuthorize` | 开启 / 取消授权复制 | M-20 | **v0.41 新增**（D-155）。仅团长；仅进行中 / 已结束且未下架；开启返回令牌，取消清空令牌 |
| `activityCopyPreview` | 授权复制预览 | 复制落地页 | **v0.41 新增**（D-155）。须登录；凭令牌只读预览，不写库；不返回销量、订单与原团长信息 |
| `activityCopyByToken` | 凭授权链接复制并发布 | 复制落地页 | **v0.41 新增**（D-155）。须登录与发布权限；完整复制为本人新活动（清空商品 `lib_id`、商品标 `copy_origin`、不沉淀商品库、重算起止时间）；`submit` 默认直接提交审核，`submit: false` 只生成草稿供修改（v0.42）；幂等 |
| `activityCopy` | 按源生成新草稿 | M-10（复制预填后保存 / 下一步 / 首次操作商品时调用，D-091） | 出参 `{ activity_id, copied_count, excluded: [{name, reason}] }`；**被治理下架的商品不进新草稿并在出参列出**（AC-AC-005）；新草稿 `start_time` 取当前时间，截止时间按源活动时长节奏预填（时长 = 源截止 − 源起始，D-067、D-087）；源范围见 `activityCopySourceList`（D-085），**非已截止的源返回 `PRECONDITION_UNMET`**；幂等（D-081） |
| `activityFindByCode` | 按活动码查找活动 | M-18 | **v0.28 新增**（D-104，修订 D-083 的查找部分）。须登录；每账号每天最多 50 次「没查到」（查到的、格式不对的都不计）；只命中审核通过、未下架、未取消的活动（团长本人不限）；只回 `activity_id`，其余情况一律 `NOT_FOUND`「没有找到」 |
| `activityPosterCover` | 海报封面代下载 | M-20 / M-12 | **新增**（D-117）。仅团长本人；只取该活动封面，fileID 换新地址后云端下载转 dataURL；超过 3MB 或非图片返回空串 |

### 4.2 活动内商品

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `goodsCreate` | 新增商品 | M-11 | **同一活动内不得重名**，否则 `DUPLICATE`（D-093）；保存时**自动沉淀到商品库**（`common/goodslib.sinkToLib`），可带 `lib_category_id` 指定库记录小类（D-088）；该小类名同时**快照到活动商品 `category_name`** 供买家详情分组（D-066 修订）；`0` 表示不限库存/不限购 |
| `goodsUpdate` | 编辑商品 | M-11 / M-22 | 改名后不得与本活动其他商品重名，否则 `DUPLICATE`（D-093）；`ever_ordered=1` 时**改价需二次确认并记录前后值**；禁止删除；有限库存不得低于 `sold_qty`；**保存成功（含商品库沉淀）后回收被替换且无人引用的旧图**（D-084） |
| `goodsDelete` | 删除商品 | M-22 | 仅 `ever_ordered=0` 可删 |
| `goodsSetOnSale` | 停售 / 恢复售卖 | M-22 | 停售只阻止新增与扩大，**已有明细保留并进入清单**（D-019、D-050）；活动已截止或已取消时**禁止恢复**（D-028） |
| `goodsAdjustStock` | 调整库存与限购 | M-11 / M-22 | 可取消库存上限、增加库存、减少至不低于 `sold_qty`；**成功后把库存 / 限购同步为同名库记录的默认值**（`goodslib.syncStockToLib`，不新建库记录，D-089）。`goodsUpdate` 不接收这两项，M-11 编辑时库存 / 限购须走本方法 |
| `goodsSort` | 拖拽排序 | M-22 | **v0.2 新增**。按拖拽后的可视顺序**整体重写**该活动全部商品的 `sort`，从 1 连续递增，不允许部分有值部分默认（`GOODS_LIB_SPEC §5.7`、AC-GL-018）。`is_recommend` 不进排序表达式 |

> 商品的 `governance_status`（平台下架）**只能由 `grouporder-ops-co` 设置**，本对象所有方法都不得改写它。

---

## 5. `grouporder-order-co` 订单

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `orderPreview` | 确认订单页试算 | M-14 | 校验库存、限购、活动状态；返回预计金额与**可选的交付方式**（D-086）；改单时传 `order_id`，库存与限购排除本单已有明细；**不落库** |
| `orderCreate` | 提交订单 | M-14 | **幂等键必传**；库存**带条件原子自增**（§8.1）；限购按商品分别计算（§8.2）；固化价格与收货快照；**`delivery_type` 落在订单上**：活动只支持一种时可不传，两种都支持时必传且须在支持范围内（D-086）；自提订单**不采集地址**（D-060） |
| `orderMyList` | 我参与的 | M-18 | 按活动分组，一个活动下可有本人多张订单 |
| `orderGetDetail` | 订单详情 | M-19 | 返回收货快照与本单交付方式；自提订单附自提点（读活动最新值，D-077、D-086） |
| `orderUpdate` | 改单 | M-19 | 截止前允许改数量、移除商品、换收货信息、**换交付方式**（D-086，换方式时按新方式重建收货快照）、改备注；**扩大数量要重新走库存与限购校验** |
| `orderCancel` | 参与者取消整单 | M-19 | 截止前；返还库存 `inc(-qty)`；**终态不可逆**；取消后仍可新建订单，原记录保留（D-025） |
| `orderVoid` | 团长作废整单 | M-20 / M-21 | **仅团长、仅截止后、原因必填**；返还库存；**使已有 Excel 清单版本失效**（D-051） |
| `orderLeaderStat` | 团长统计 | M-21 | 有效订单数、有效总份数、**按交付方式拆分的单数与份数**（D-086）、商品汇总、预计金额；**不出现销售额/实收/GMV** |
| `orderLeaderList` | 团长看参与者明细 | M-21 | 团长可读**本人活动**履约所需的收货字段（D-016）；跨活动读取一律拒绝；可按团长记录筛选（D-100） |
| `orderLeaderDetail` | 团长查看单张订单 | M-36 | **新增**（D-116）。只限本人活动的订单（同 `orderLeaderList`）；返回接龙码、下单账号用户名、收货信息、自提点、明细、团长记录及 `can_mark` / `can_void`；缺接龙码时当场补发 |
| `orderLeaderMarkAll` | 一键收款 / 一键取货 | M-20 | **v0.40 新增**（D-153）。把本人活动所有未标记的有效、未匿名化订单一次标为已收款 / 已取货；口径同 `orderLeaderMark`；不提供一键撤销 |
| `orderLeaderMark` | 团长记录收款 / 交付 | M-21 | **v0.26 新增**（D-100）。仅团长、仅本人活动的有效订单；可标记也可撤销；活动已取消、订单已匿名化时拒绝；只改团长记录字段，不影响库存、限购、统计口径与清单版本 |
| `orderLeaderBrief` | 文字清单数据 | M-21 | **v0.26 新增**（D-101）。本人活动全部有效订单与明细（分批读完不截断）+ 商品汇总；电话只给尾号，不含地址与备注；活动已取消时拒绝 |
| `leaderStatOverview` | 团长统计（跨活动） | M-35 | **v0.29 新增**（D-106，会员功能）。本人进行中 / 已截止活动的有效订单汇总；经 `membership.requireFeature(leader_stats)`，首版闸门关闭；金额只称预计金额 |

---

## 6. `grouporder-goods-co` 商品库与分类

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `libList` | 商品库列表 | M-28 / M-29 | 入参含 `category_id`；按最近使用倒序；**被封禁记录不可选、不可编辑** |
| `libUpdate` | 编辑库记录与三项预填值 | M-29 | `GOODS_LIB_SPEC §5.6`；**改图保存成功后回收被替换且无人引用的旧图**（D-084） |
| `libDelete` | 软删 | M-29 | 软删记录**同样保持封禁状态**（D-064） |
| `libCopyToActivity` | 从商品库添加到当前活动 | M-28 | 多选；价格/总库存/每人限购按默认值**预填**（不强制确认，D-092）；**去重**：活动已有同名商品或同一 `lib_id` 的商品时该项列入 `failed[]`（`DUPLICATE`），同次请求重复 id 只算一次（D-093）；被下架商品不可选 |
| `categoryList` / `categoryCreate` / `categoryUpdate` / `categoryDelete` | 分类管理（**固定两级：大类→小类**） | M-30 | 用户私有；**仅用于筛选，不进活动展示与清单**（D-066）；商品只挂小类；**删分类都不删商品**，删大类级联删其下小类、商品归入未分组；上限大类 50 / 小类 100 |
| `categorySort` | 分类升降排序（按层级） | M-30 | 传 `parent_id` 区分排大类或排某大类下的小类。与 `goodsSort` 同一原则：整体重写为从 1 起的连续值 |

> 分类本身不提供「按分类批量加入」接口；M-28 前端「全选当前大类」只是批量勾选后照常调 `libCopyToActivity`（D-152）；商品库的推荐标识 `is_recommend` **不进入排序**（D-065）。

---

## 7. `grouporder-user-co` 个人中心

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `addressList` / `addressCreate` / `addressUpdate` / `addressDelete` / `addressSetDefault` | 收货信息簿 | M-15 / M-16 | 全表**禁止客户端直读**，只走本对象（§8.5）；订单保存的是**快照**，改地址簿不影响历史订单 |
| `bindStatus` | 微信与平台账号绑定状态 | M-05 | 微信身份**只存摘要**，不返回完整凭证 |
| `appealSubmit` | 提交绑定异常申诉 | M-05 / M-07 | 幂等；**收货电话不得用于身份核验**（D-029、P1-02） |
| `appealMyList` | 查看申诉结果 | M-07 | 失败原因摘要向用户展示，**不含内部信息** |
| `privacyRequestSubmit` | 注销 / 删除 / 匿名化请求 | M-08 | **前置条件校验**：仍是进行中活动的团长、或在未截止活动中有有效订单 → `PRECONDITION_UNMET` 并**列出需先处理的对象**（D-056） |
| `privacyRequestMyList` | 查看本人隐私事项进度 | M-08 | **v0.2 补齐**（v0.1 表头声称 13 个方法但只列了 12 个）。与 `appealMyList` 对称；只回状态与期限，不回运营内部字段 |
| `todoList` | 待办列表 | M-27 | **派生视图，不建待办表**（D-062）：实时聚合活动/订单/举报/申诉四类状态，按四档优先级排序 |
| `todoDismiss` | 关闭一条待办 | M-27 | 写 `grouporder-todo-dismiss`，`(user_id, todo_key)` 唯一索引保证幂等 |
| `meOverview` | 个人中心概览 | M-08 | 聚合入口数量角标，只读 |
| `leaderContactGet` | 读团长名片 | M-33 | **v0.27 新增**（D-103），v0.30 扩头像昵称（D-109）。本人账号级名片；从未保存过时附带账号昵称与头像供预填 |
| `leaderContactSet` | 保存团长名片 | M-33 | **v0.27 新增**（D-103），v0.30 扩头像昵称（D-109）。电话 / 微信号只接受号码格式，昵称同步文本检测（不通过 `INVALID_PARAM`），头像写库后送图片检测；空串 / null 清除；写 `grouporder-user-ext`（无记录则新建） |

> 登录、注册、改密、微信授权全部走 **`uni-id-co`（uni-id-pages 现成）**，本对象不重复实现。

---

## 8. `grouporder-export-co` 清单与导出

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `listPreview` | 清单预览 | M-24 | 商品汇总 + 参与者明细；**不生成文件**；仅团长本人、仅已截止活动 |
| `listGenerate` | 生成 Excel | M-24 | 写 `grouporder-export-log`；**公式注入防护**（D-039）；按 `file_version` 版本化；订单作废使旧版本失效（D-051） |
| `listDownload` | 下载 | M-24 | **每次重新校验权限并重新换取临时地址**（30 分钟，D-071①③）；不得缓存或复用；地址**不写入任何日志或页面** |

> **文件保留 60 天**由定时函数清理（D-071②），不纳入订单三年留存。

---

## 9. `grouporder-report-co` 举报

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `reportSubmit` | 提交举报 | M-25 | 可举报活动或其中商品；幂等；提交即生成**内容快照**作为证据 |
| `reportMyList` | 我的举报 | M-25 | |
| `reportGetResult` | 查看处理结果 | M-25 | 结果摘要**不含内部敏感信息**；有结果时进入待办（M-27） |

---

## 10. `grouporder-ops-co` 运营后台

方法清单、权限点与 `action_type` 见 **§11 附表**。全部 38 个方法遵守：

- **不脱敏**，返回完整姓名/电话/地址（D-072）；**每次查询与导出都写审计**（红线⑨）
- 走云对象取数，后台前端**不得** `<unicloud-db :collection="grouporder-*">`（D-075）
- 超管按权限点判断即可（D-076）；`grouporder-oplog` **无写方法**，schema 对所有角色关闭写入

---

## 11. 附表：`grouporder-ops-co` 方法

### 批 A · 治理主链路

| 方法 | 用途 | 权限点 | action_type | 屏 |
|---|---|---|---|---|
| `activityDetail` | 活动详情 + 商品，双状态独立字段 | `ops-content-activity` | `activity_detail_view` / `activity_detail_denied` | A-07 |
| `activityGovernanceOff` | **整个活动**治理下架，违规类型与原因必填；写 `governance_type` 与 `ever_governed` | `ops-content-activity` | `activity_governance_off` | A-09 |
| `goodsGovernanceOff` | **单个商品**治理下架；须反写商品库封禁 | `ops-content-activity` | `goods_governance_off` | A-09 |
| `activityGovernanceOn` | 活动恢复，三种禁止情形要拒绝 | `ops-content-activity` | `activity_governance_on` | A-09 |
| `goodsGovernanceOn` | 商品恢复；一并解除商品库封禁 | `ops-content-activity` | `goods_governance_on` | A-09 |
| *(联动)* | 商品下架**反写商品库封禁**，两条匹配取并集、软删同样封禁（D-064） | — | `goods_lib_blocked`，与主操作**共用 request_id** | A-07 |

> **v0.2 把治理方法由 2 个拆为 4 个。** 活动与商品的规则并不重合：活动要写
> `governance_type` 与 `ever_governed`（商品表没有这两个字段），商品要反写商品库封禁
> （活动不反写）。一个方法靠 `object_type` 分流会让两组规则挤在同一个签名里，
> 出参也得按对象类型忽隐忽现。共同部分下沉为私有 `_governanceOff` / `_governanceOn`，
> 两份实现不会漂移。
| `reportList` / `reportDetail` | 举报 5 状态，**只读** | `ops-content-report` | — | A-08 |
| `reportClaim` | 领取举报，写 `handler_uid` 与 `claim_time` | `ops-content-report` | `report_claim` | A-08 |
| `reportConclude` | 结论 6 选 1、结案；**结论为下架 / 限制发布时在同一请求内自动执行处置**（D-082） | `ops-content-report` | `report_conclude` / `report_close` + 对应处置事件 | A-08 |
| `reportRecheck` | 复核，**不覆盖原结论** | `ops-content-report` | `report_recheck` / `report_result_changed` | A-08 |
| `checkList` / `checkHandle` | 内容检测复核 4 状态 | `ops-content-report` | `detect_view` / `detect_recheck` / `detect_handle` | A-08 |
| `publisherRestrict` | 警告 / 临时 / 永久 / 解除 | `ops-content-report` | `publisher_warn` / `publisher_limit_temp` / `publisher_limit_perm` / `publisher_limit_release` | A-10 |

### 批 B · 发布审核

| 方法 | 用途 | 权限点 | action_type | 屏 |
|---|---|---|---|---|
| `reviewList` / `reviewDetail` | 待审活动，**按提交时固化的内容版本** | `ops-content-review` | — | A-17 |
| `reviewSubmit` | 通过 / 不通过（原因必填，向团长展示） | `ops-content-review` | `activity_review_pass` / `activity_review_reject` / `activity_review_failed` | A-17 |
| `configGet` / `configSet` | 平台配置，**只影响之后新提交的审核**（D-057） | `ops-sys-config` | `config_changed`（记前后值） | A-18 |

### 批 C · 检索与统计

| 方法 | 用途 | 权限点 | action_type | 屏 |
|---|---|---|---|---|
| `searchOrders` | 订单检索，**完整明文**；自提无地址 | `ops-search` | `order_detail_view` / `order_detail_denied` | A-04 |
| `searchActivities` / `searchGoods` / `searchUsers` | 另三类检索 | `ops-search` | 按对象类型：`activity_detail_view` / `goods_detail_view` / `user_detail_view`，拒绝分支各取 `*_denied` | A-04 |
| `exportSearchResult` | 导出检索结果 | `ops-search` | `export_download` | A-04 |
| `statOverview` | 团长汇总，**指标白名单** | `ops-stat-view` | `stat_query` / `stat_denied` | A-05 |
| `statActivityDrill` | 下钻到活动与商品层 | `ops-stat-view` | `stat_query` | A-06 |
| `statExport` | 统计导出 | `ops-stat-view` | `export_download` | A-05/06 |

### 批 D · 账号与隐私事项

| 方法 | 用途 | 权限点 | action_type | 屏 |
|---|---|---|---|---|
| `appealList` / `appealDetail` | 绑定申诉 4 状态，微信身份**只返回摘要** | `ops-privacy-appeal` | — | A-12 |
| `appealResolve` | 解绑 / 重新绑定；**双方均有业务数据不受理** | `ops-privacy-appeal` | `bind_release` / `bind_rebind` / `bind_denied` / `bind_duplicated` | A-12 |
| `privacyCaseList` / `privacyCaseCreate` / `privacyCaseUpdate` | 隐私事项 5 状态；**三年期限只读** | `ops-privacy-case` | `privacy_case_create` / `privacy_case_update` | A-16 |

### 批 E · 审计

| 方法 | 用途 | 权限点 | action_type | 屏 |
|---|---|---|---|---|
| `exportLogList` | Excel 事件查询，**不返回下载地址** | `ops-audit-export` | `export_log_query` | A-13 |
| `exportDownload` | **下载清单**：重新鉴权 + 换新地址；**无重新生成**（D-073） | `ops-audit-export` | `export_download` | A-13 |
| `oplogList` | 操作日志查询，**无写方法** | `ops-audit-oplog` | — | A-14 |

### 批 F · 工作台

| 方法 | 用途 | 权限点 | action_type | 屏 |
|---|---|---|---|---|
| `workbenchTodo` | 三档待办**派生视图**，**不提供忽略或已读**（D-070） | `ops-workbench` | — | A-03 |

### 批 G · 运营账号写操作（v0.2 新增）

OPS §13 把「运营账号停用/角色变更」列为必记事件，但 A-15 账号角色页走 `unicloud-db`
直连 `uni-id-*`，不经云对象——这两类事件**架构上没有任何地方能写 `grouporder-oplog`**。
本批把这两个写操作收归云对象以补齐审计链。**A-15 的读不变**，仍走直连
（`uni-id-*` 本就是 `read: true`），改动面最小。

| 方法 | 用途 | 权限点 | action_type | 屏 |
|---|---|---|---|---|
| `accountSetStatus` | 启用 / 停用运营账号；不能改自己 | `ops-sys-account` | `account_disabled` | A-15 |
| `roleAssign` | 授予 / 撤销角色；不能改自己；禁止授予内置 `admin`（ADM-03） | `ops-sys-role` | `role_changed`，`ops-stat-view` 增减时另记 `stat_permission_changed` | A-15 |

> **登录事件不在本对象，也不在 `grouporder-oplog`。** `uni-id-co` 已在服务端写
> `uni-id-log`（`lib/utils/login.js` 的 `postLogin` 记成功、`preLoginWithPassword`
> 的 catch 记失败），**客户端伪造不了**；在云对象里再造一份只会得到一个可伪造的弱副本。
> A-14 登录日志 tab 直接读 `uni-id-log`（ADM-13 已裁定 A-13 与 A-14 不合并为一页），
> 读该表需要内置权限点 `READ_UNI_ID_LOG`，已授予 `ops-super`（D-078 后为唯一运营角色）。

---

## 12. 定时与回调云函数（非云对象）

| 云函数 | 触发 | 职责 | 规格 |
|---|---|---|---|
| `grouporder-task-autoclose` | 定时（每分钟，触发器配置在函数 `package.json` 的 `cloudfunction-config.triggers`，client 与 admin 两份须一致） | 到期活动自动置已截止；**审核中到期直接进已截止**，之后即使审核通过也不重开。截止逻辑与 activity-co 的「读时补截止」共用 `common/lifecycle.js` | `DATA_MODEL §5.1` |
| `grouporder-task-export-cleanup` | 定时（每日） | 清理超过 **60 天**的清单文件与失效版本 | D-071② |
| `grouporder-task-retention` | 定时（每日） | 三年到期删除或匿名化收货信息与账号关联，置 `anonymized=1`；汇总数据保留 | D-035；`DATA_MODEL §9` |
| `grouporder-check-callback` | 内容检测回调 | 图片异步检测**不阻塞审核放行**；回调命中时把商品转治理下架并通知团长，**不回退业务状态、不删除已有订单** | D-058 |

---

## 13. 不经云对象的部分

| 功能 | 走什么 |
|---|---|
| 登录 / 注册 / 改密 / 微信授权（M-02～M-06） | `uni-id-co`，`uni-id-pages` 现成页面 |
| 后台 A-01 登录 | 同上，只改 `config.js`（D-069） |
| 后台 A-02 访问结果页 | 纯前端组件，由任一方法返回 `OPS_FORBIDDEN` / `OPS_UNAUTHENTICATED` 触发 |
| 后台 A-15 运营账号与权限 | `pages/system/{user,role,permission}/*` + `unicloud-db` 直连 `uni-id-*`；五处必改见 `../99-archive/2026-09/ADMIN_REUSE_MAP.md §4`（已归档，仍可查阅） |
| 后台 A-14 登录日志 tab | `pages/system/safety/list.vue` 读 `uni-id-log`，**不与 `oplogList` 合并**（ADM-13） |

---

## 14. 方法签名（实现回填）

> 本节由服务端维护者在实现时回填，是两个前端的调用依据。
>
> **配套的前端调用层**（不是第二事实源，只有方法名与转发，没有参数定义）：
>
> | 文件 | 说明 |
> |---|---|
> | `grouporder-client/src/api/index.js`、`grouporder-admin/js_sdk/grouporder-api/index.js` | **自动生成**，93 个方法名与转发。改了云对象方法后重跑 `node tools/gen-frontend-api.js`，方法名不会与实现漂移 |
> | 同目录 `client.js` | 手写。`importObject` 实例缓存、`{errCode, data}` 拆包（成功直接给 `data`）、会话失效跳登录、**`PARTIAL_FAILED` 单独成异常类**以免调用方把部分失败当成功 |
>
> 命名空间：`activity` / `order` / `goodsLib` / `user` / `exportList` / `report` / `ops`。
> `goodsLib` 刻意不叫 `goods`——活动内商品的方法（`goodsCreate` 等）在 `activity-co` 里，
> 同名会让人调错对象。
>
> ```js
> import api from '@/api'
> const { activity_id } = await api.activity.activityCreateDraft({ ... })
> ```
>
> **参数与出参仍以本节为准**，调用层刻意不复制签名。
> 列表类方法的入参一律另含 `{ page, pageSize, filters, orderBy }`（§2.2），出参一律为
> `{ list, total, asOf }`，下表不再重复；`filters` 列只列该方法支持的键。
> 出参一律包在 `{ errCode: 0, data: ... }` 里，下表只写 `data` 的内容。
> 「幂等键」列为空表示该方法是只读的。

### 14.1 `grouporder-activity-co`（17）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `activityCreateDraft` | `{ idempotent_key, title, description?, cover_image?, images?, delivery_types, end_time, pickup_address?, pickup_time_desc?, pickup_contact_name?, pickup_contact_mobile? }`（`delivery_types` 为 [1] / [2] / [1,2]，兼容旧客户端传单值 `delivery_type`；`pickup_*` 均可选，不支持自提时忽略并存空串；自提必填与封面必填的校验推迟到 `activitySubmitReview`，D-084） | `{ activity_id, short_code, create_date }` | — |
| `activityUpdateDraft` | `{ activity_id, title?, description?, cover_image?, images?, end_time?, delivery_types?, pickup_address?, pickup_time_desc?, pickup_contact_name?, pickup_contact_mobile? }`（`pickup_*` 仅草稿/可编辑态用，不进 `need_recheck`；发布后改自提点用下一行的 `activityUpdatePickup`） | `{ activity_id, need_recheck, status }` | — |
| `activityUpdatePickup` **新增** | `{ activity_id, pickup_address?, pickup_time_desc?, pickup_contact_name?, pickup_contact_mobile? }`（仅 `delivery_types` 含 2；发布后仍可改，已发布则不许把 `pickup_address` 改空；只取显式传来的键）；文本送检**不阻塞**、写 `oplog`（`ACTIVITY_PICKUP_CHANGED`），已取消或已下架活动拒绝（D-077） | `{ activity_id }` | — |
| `activitySubmitReview` | `{ activity_id }` | `{ status, review_mode, auto_passed, blocked? }` | 状态机自身（草稿→审核中只能成功一次） |
| `activityWithdrawReview` | `{ activity_id }` | `{ status }` | 同上 |
| `activityGetDetail` | `{ activity_id }` | 见下方「活动详情出参」 | — |
| `activityMyList` | `filters: { status?, governance_status? }`；`orderBy` 可取 `create_date` / `end_time` / `publish_date` | `list[]`：`{ _id, title, cover_image, short_code, status, governance_status, review_result, review_reason, delivery_types, start_time, end_time, not_started, actual_end_time, publish_date, create_date, valid_total_qty }` | — |
| `activityClose` | `{ activity_id }` | `{ status, actual_end_time, retention_expire_date }` | 状态机自身 |
| `activityCancel` | `{ activity_id, reason }`（进行中必填） | `{ status, retention_expire_date }` | 状态机自身 |
| `activityDeleteDraft` | `{ activity_id }` | `{ activity_id, deleted, goods_deleted }` | — |
| `activityGetShareEntry` | `{ activity_id }` | `{ activity_id, short_code, title, cover_image, end_time, asOf }` | — |
| `activityCopySourceList` | — | `list[]`：`{ _id, title, cover_image, status, delivery_types, end_time, publish_date, create_date }` | — |
| `activityCopyAuthorize` | `{ activity_id, enable: boolean }` | `{ activity_id, copy_token, title?, cover_image?, asOf }`（取消时 `copy_token` 为空串） | 开启时已有令牌沿用 |
| `activityCopyPreview` | `{ token }` | 活动模板：`{ title, description, cover_image, images, delivery_types, pickup_*, status: 0, governance_status: 0, start_time, end_time, goods[], asOf }`（`goods[]` 结构同详情，`sold_qty` 为 0） | 只读 |
| `activityCopyByToken` | `{ token, idempotent_key, submit?: boolean }`（`submit: false` = 只生成草稿） | `{ activity_id, status, auto_passed?, excluded?, submit_error?, duplicated? }`（提交审核失败时保留为草稿并给出 `submit_error`） | `idempotent_key` 判重 |
| `activityCopy` | `{ source_activity_id, idempotent_key }` | `{ activity_id, copied_count, excluded: [{name, reason}], end_time, duplicated }` | `idempotent_key`（活动表唯一索引，D-081） |
| `activityFindByCode` | `{ code }`（4 或 6 位，忽略空格、连字符、大小写） | `{ activity_id, title, asOf }`；未找到 `NOT_FOUND`（`detail.remaining` 为今天剩余的落空次数），落空次数用完 `PRECONDITION_UNMET`，格式错 `INVALID_PARAM` | — |
| `activityPosterCover` | `{ activity_id }` | `{ data_url }`（取不到时为空串，前端退回默认头图） | — |
| `goodsCreate` | `{ activity_id, name, description?, cover_image, detail_images?, price, unit?, total_stock, per_user_limit, is_recommend?, lib_id?, lib_category_id?, sync_to_lib? }`（`lib_category_id` 不传 = 不指定；`''` = 未分组；`sync_to_lib: false` = 只存活动、不沉淀商品库，D-094） | `{ goods_id, lib_id, sort, need_recheck, activity_status }` | — |
| `goodsUpdate` | `{ goods_id, name?, description?, cover_image?, detail_images?, unit?, price?, is_recommend?, confirm_price_change?, lib_category_id? }` | `{ goods_id, need_recheck, activity_status }` | — |
| `goodsDelete` | `{ goods_id }` | `{ deleted, need_recheck, activity_status }` | — |
| `goodsSetOnSale` | `{ goods_id, on_sale }` | `{ goods_id, on_sale, changed }` | 幂等：同值重复提交返回 `changed:false` |
| `goodsAdjustStock` | `{ goods_id, total_stock?, per_user_limit? }` | `{ goods_id, total_stock?, per_user_limit? }` | — |
| `goodsSort` **新增** | `{ activity_id, goods_ids: string[] }`（必须是该活动的**全量**商品） | `{ activity_id, sorted, asOf }` | 全量重写，天然幂等 |

> **`goodsUpdate` / `goodsSetOnSale` / `goodsAdjustStock` 会写 `grouporder-oplog`**（§10.8 第 11 类）：
> 改价、改单位、停售与恢复、库存与限购调整都要留前后值，`operator_uid` 是团长本人、
> `operator_roles` 为空数组。`goods` 表没有承载前后值的字段，而 D-018／D-026 明确要求记录，
> 所以落在同一张日志表——**这不是后台专属的约束**。
> `goodsUpdate` 在 `ever_ordered = 1` 时改价必须带 `confirm_price_change: true`，
> 否则返回 `INVALID_PARAM` 且 `detail = { require_confirm: true, prev_price }`。

**活动详情出参**（`activityGetDetail`）：
所有访问者得 `{ _id, title, description, cover_image, images, short_code, delivery_types,
pickup_address, pickup_time_desc, pickup_contact_name, pickup_contact_mobile, status,
governance_status, start_time, end_time, not_started, actual_end_time, create_date, publish_date, valid_total_qty,
goods[], is_leader, joinable, my_bought_qty }`；团长另得 `copy_token`（授权复制令牌，空串 = 未授权，D-155）（`my_bought_qty` 为 `{ goods_id: 本人有效已购份数 }`，未登录为空对象，供 ＋ 号按限购余量封顶，D-153 同期；`pickup_*` 仅支持自提的活动有值；团长另得 `stat.by_delivery`，D-086），其中 `goods[]` 每项为
`{ _id, name, description, cover_image, detail_images, price, unit, total_stock, sold_qty,
per_user_limit, on_sale, governance_status, is_recommend, category_name, sort, remain_qty }`
（`remain_qty` 在不限库存时为 `null`；`category_name` 为展示小类名、空=未分类，买家详情按它分组，D-066 修订）。
团长另得 `{ review_mode, review_result, review_reason, content_version, governance_reason,
ever_governed, cancel_reason, stat: { valid_order_count, valid_total_qty, estimated_amount, asOf } }`。
草稿与审核中的活动对非团长返回 `FORBIDDEN`。

> **`activityCreateDraft` / `activityCopy` 的幂等键**（D-081）：客户端为每一次「新建草稿」或「复制」意图生成一个 `idempotent_key`，
> 同一意图的网络重试复用同键；服务端按 `grouporder-activity.idempotent_key` 唯一索引判重，命中即返回已有活动并置 `duplicated: true`。
> 原「同团长 + 同标题 + 60 秒内草稿」的弱判重已废止。

### 14.2 `grouporder-order-co`（9）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `orderPreview` | `{ activity_id, items: [{goods_id, qty}], order_id? }`（改单时传 `order_id`） | `{ activity_id, delivery_types, pickup, items[], unavailable[], total_qty, total_amount, asOf }`（`pickup` 仅支持自提时有值） | — |
| `orderCreate` | `{ activity_id, idempotent_key, items, delivery_type?, address_id? \| consignee_name+consignee_mobile+consignee_address?, buyer_remark? }`（活动两种方式都支持时 `delivery_type` 必传） | `{ order_id, order_no, total_qty, total_amount, duplicated }` | **`idempotent_key` 必传**，唯一索引拦截 |
| `orderMyList` | `{ page, pageSize, filters: { status?, activity_id? } }`（`pageSize` 按**活动分组**计） | `list[]` 按活动分组：`{ activity_id, title, cover_image, activity_status, governance_status, not_started, delivery_types, start_time, end_time, orders: [{ _id, order_no, status, delivery_type, total_qty, total_amount, create_date, items[] }] }`；**分页单位是活动分组**：分批读完本人全部订单，按活动归组、组按最近一次下单时间倒序后分页，同一活动的订单不跨页，`total` 为分组数；页内活动读时补截止 | — |
| `orderGetDetail` | `{ order_id }` | `{ _id, order_no, status, delivery_type, activity{ …, delivery_types }, pickup, consignee_*, buyer_remark, total_qty, total_amount, cancel_*, void_*, create_date, items[], editable, asOf }` | — |
| `orderUpdate` | `{ order_id, items?, delivery_type?, address_id?, consignee_*?, buyer_remark? }`（换 `delivery_type` 时按新方式重建收货快照） | `{ order_id, total_qty, total_amount }` | 无独立键；库存以带条件原子自增保证不超卖 |
| `orderCancel` | `{ order_id, reason? }` | `{ order_id, status }` | 状态机自身（带条件更新，重复取消只返还一次） |
| `orderVoid` | `{ order_id, reason }`（必填） | `{ order_id, status, export_versions_invalidated }` | 同上 |
| `orderLeaderStat` | `{ activity_id }` | `{ activity_id, title, status, governance_status, valid_order_count, cancelled_order_count, voided_order_count, paid_order_count, delivered_order_count（D-100，只有单数）, valid_total_qty, estimated_amount, delivery_types, by_delivery{ home, self_pick }, goods_summary[], asOf }` | — |
| `orderLeaderList` | `{ activity_id, page, pageSize }`；`filters: { status?, leader_paid?: 0|1, leader_delivered?: 0|1, keyword? }`（keyword：4 位数字按接龙码精确或电话尾号匹配，其他按收货人姓名包含匹配，D-115；第一页且查有效订单时出参另带 `counts{ all, unpaid, undelivered }`）（默认只看有效；团长记录 0 表示未标记，含无该字段的老订单，D-100）；按 `create_date` 升序、`_id` 次序分页，`total` 为该状态订单总数，前端 M-21 每页 20 张、滑到底加载 | `list[]`：`{ _id, order_no, status, delivery_type, consignee_name, consignee_mobile, consignee_address, buyer_remark, order_code, buyer_name, total_qty, total_amount, create_date, void_reason, leader_paid, leader_paid_time, leader_paid_amount, paid_amount_changed, leader_delivered, leader_delivered_time, items[] }` | — |
| `orderLeaderDetail` | `{ order_id }` | `{ _id, order_no, order_code, buyer_name, status, activity{ _id, title, status, end_time }, delivery_type, consignee_*, pickup, buyer_remark, total_qty, total_amount, create_date, cancel_*, void_*, leader_paid, leader_paid_time, leader_paid_amount, paid_amount_changed, leader_delivered, leader_delivered_time, items[], can_mark, can_void, asOf }` | — |
| `orderLeaderMarkAll` | `{ activity_id, mark: 'paid' \| 'delivered' }` | `{ activity_id, mark, marked, skipped, asOf }` | 天然幂等（只处理尚未标记的订单） |
| `orderLeaderMark` | `{ order_id, paid?: boolean, delivered?: boolean }`（至少一项） | `{ order_id, leader_paid, leader_paid_time, leader_paid_amount, paid_amount_changed, leader_delivered, leader_delivered_time }` | 天然幂等（写入目标值）；带 `status=有效` 条件更新 |
| `orderLeaderBrief` | `{ activity_id }` | `{ activity_id, title, status, end_time, delivery_types, goods_summary[{ goods_id, goods_name, unit, sold_qty }], orders[{ order_no, consignee_name, mobile_tail, delivery_type, total_qty, leader_paid, leader_delivered, items[{ goods_name, unit, qty }] }], asOf }` | — |
| `leaderStatOverview` | `{ range: '7d'|'30d'|'90d'|'all' }`（缺省 30d） | `{ range, since, overview{ activity_count, ongoing_count, valid_order_count, valid_total_qty, estimated_amount, participant_count, repeat_customer_count }, trend{ unit: day|week|month, buckets[{ label, start, order_count, total_qty }] }, activity_top[], goods_top[], customer_top[{ name_masked, mobile_tail, activity_count, order_count, total_qty }], pending{ unpaid_order_count, undelivered_order_count, activities[] }, member{ is_member, expire, gated }, asOf }`；闸门打开且非会员时 `PRECONDITION_UNMET`（`detail.member_required: true`） | — |

> `orderLeaderList` 的 `consignee_address` 在自提订单中恒为空串（D-060、D-086）。`orderGetDetail`（参与者）同时返回只读的 `leader_paid` / `leader_delivered`（D-100）与 `leader_contact`（D-103、D-109，`{ nickname, avatar, mobile, wechat }` 或 null；头像被拦截时 `avatar` 为 null）；`activityGetDetail` 返回 `leader_contact`，活动被下架时对非团长返回 null；`listPreview.detail[]` 每行带 `leader_paid` / `leader_delivered`，`listGenerate` 的参与者明细表末尾新增「收款记录」「交付记录」两列（以生成时为准，记录变化不使版本失效）。`by_delivery` 的 `home` / `self_pick` 各含 `order_count`、`total_qty`，旧订单按所属活动当时的单一方式归类。
> 金额字段一律是**分**，前端自行换算展示。

### 14.3 `grouporder-goods-co`（9）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `libList` | `{ keyword?, category_id? }`（`category_id` 传小类 `_id` 精确筛；传大类 `_id` 展开到其旗下全部小类；传 `"__none__"`/`"__uncat__"` 查未分组） | `list[]`：库记录字段 + `{ selectable, unselectable_reason }` | — |
| `libUpdate` | `{ lib_id, name?, description?, cover_image?, detail_images?, unit?, last_price?, last_total_stock?, last_per_user_limit?, is_recommend?, category_id? }` | `{ lib_id, img_recheck }` | — |
| `libCreate` **v0.14 新增** | `{ name, unit?, last_price?, last_total_stock?, last_per_user_limit?, description?, is_recommend?, cover_image, detail_images?, category_id? }` | `{ lib_id }` | 同名拒绝 `DUPLICATE`（D-088） |
| `libDelete` | `{ lib_id }` | `{ lib_id, deleted, changed }` | 幂等 |
| `libCopyToActivity` | `{ activity_id, lib_ids: string[] }` | `{ created[], failed[], need_recheck, activity_status }`；部分失败时 `errCode = PARTIAL_FAILED` 且 `detail` 为同一结构 | `(activity_id, lib_id, 60 秒窗口)`，同 `activityCopy` 的取舍 |
| `categoryList` | — | `{ tree: [{_id, name, sort, is_virtual, goods_count, children:[{_id, name, sort, parent_id, goods_count}]}]（末尾含虚拟「未分类」大类→「未分组」小类）, list: [{_id, name, sort, parent_id, parent_name, goods_count}]（扁平小类，供改分类/编辑选择器）, ungrouped_count, total, asOf }` | — |
| `categoryCreate` | `{ name, parent_id? }`（不传 `parent_id`=建大类，同时建同名小类；传=在该大类下建小类） | `{ category_id, parent_id, name, sort, default_child_id? }`（`default_child_id` 仅建大类时返回，D-151） | 同名拒绝 `DUPLICATE`（同级判重）；在小类/「未分类」下建小类拒绝（固定两级）；超上限拒绝（大类 50 / 小类 100） |
| `categoryUpdate` | `{ category_id, name?, sort? }` | `{ category_id }` | 改名同级判重 |
| `categoryDelete` | `{ category_id }` | 删小类 `{ category_id, affected }`（归入未分组的商品数）；删大类 `{ category_id, children_deleted, affected }`（级联删小类，其下商品归入未分组，均不删商品） | — |
| `categorySort` | `{ category_ids: string[], parent_id? }`（不传 `parent_id`=排大类；传=排该大类下小类；须为该层级**全量**） | `{ sorted, parent_id, asOf }` | 全量重写，天然幂等 |

### 14.4 `grouporder-user-co`（13）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `addressList` | — | `{ list[], total, asOf }`（默认项排在最前） | — |
| `addressCreate` | `{ name, mobile, address, is_default? }` | `{ address_id, is_default }` | — |
| `addressUpdate` | `{ address_id, name?, mobile?, address?, is_default? }` | `{ address_id }` | — |
| `addressDelete` | `{ address_id }` | `{ address_id, deleted, new_default_id }` | 软删，幂等 |
| `addressSetDefault` | `{ address_id }` | `{ address_id, changed }` | 幂等 |
| `bindStatus` | — | `{ user_id, has_username, nickname, wechat_bound, wechat_digest, account_status, asOf }` | — |
| `appealSubmit` | `{ appeal_type: 1\|2, target_account_uid? }` | `{ appeal_id, appeal_no, status, duplicated }` | `(applicant_uid, status ∈ 待处理/处理中)` |
| `appealMyList` | `filters: {}` | `list[]`：`{ _id, appeal_no, appeal_type, status, fail_reason, handle_time, create_date }` | — |
| `privacyRequestSubmit` | `{ case_type: 1\|2\|3 }` | `{ case_id, case_no, status, duplicated }`；前置条件不满足时 `PRECONDITION_UNMET` + `detail.blockers[]` | `(target_uid, case_type, status ∈ 1/2/3)` |
| `privacyRequestMyList` **新增** | `filters: {}` | `list[]`：`{ _id, case_no, case_type, status, restricted, retention_start, retention_expire, execute_time, create_date }` | — |
| `todoList` | — | `{ list[], total, count_by_level: {1,2,3,4}, asOf }` | — |
| `todoDismiss` | `{ todo_key }` | `{ todo_key, dismissed }` | `(user_id, todo_key)` 唯一索引 |
| `meOverview` | — | `{ user_id, lead_activity_count, lead_ongoing_count, joined_order_count, address_count, goods_lib_count, todo_count, asOf }` | — |
| `leaderContactGet` | — | `{ nickname, avatar, avatar_blocked, mobile, wechat, has_card, account_nickname?, account_avatar?, asOf }`（未填为空串 / null；`account_*` 仅 `has_card = false` 时返回） | — |
| `leaderContactSet` | `{ nickname?, avatar?, mobile?, wechat? }`（空串 / null 清除） | 同 `leaderContactGet`（不含 `account_*`） | 天然幂等（写入目标值；昵称、头像未变不重复送检） |

**`PRECONDITION_UNMET` 的 `detail.blockers[]`**（D-056）：每项为
`{ type: 'activity'\|'order', id, title, status?, order_no?, action }`，`action` 是给用户看的下一步说明。

**待办条目**（`todoList.list[]`）：`{ todo_key, type, level, object_id, title, description, create_date }`。
`todo_key` 形如 `review_rejected:<activity_id>`，直接回传给 `todoDismiss`。
`level` 四档：1 活动被下架／审核不通过；2 参与的活动被取消或下架／已截止待生成清单；
3 24 小时内截止；4 草稿超 24 小时未提交／举报或申诉有结果。

### 14.5 `grouporder-export-co`（3）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `listPreview` | `{ activity_id }` | `{ activity_id, title, short_code, delivery_types, has_address_column, actual_end_time, goods_summary[], detail[], valid_order_count, valid_total_qty, estimated_amount, versions[], asOf }` | — |
| `listGenerate` | `{ activity_id }` | `{ activity_id, file_version, valid_order_count, valid_total_qty, row_count, asOf }` | — |
| `listDownload` | `{ activity_id, file_version }` | `{ url, expires_in, asOf }` | — |

> `versions[]` 为 `{ file_version, version_no, create_date, invalidated }`。
> `file_version` 是云存储 fileID（`DATA_MODEL §10.7` 允许），**不是下载地址**，可直接回传给下载方法。
> `url` **只在本次响应中有效，30 分钟过期**，前端不得缓存、不得写入任何日志或页面（D-071③）。
> `invalidated` 是派生状态，不落库：版本生成后若有订单被作废即为已失效（D-051）。

### 14.6 `grouporder-report-co`（3）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `reportSubmit` | `{ activity_id, goods_id?, reason_type, reason_desc? }` | `{ report_id, report_no, status, duplicated }` | `(reporter_uid, activity_id, goods_id, status ∈ 未结案)` |
| `reportMyList` | `filters: { status? }` | `list[]`：`{ _id, report_no, activity_id, goods_id, activity_title, goods_name, reason_type, status, has_result, create_date }` | — |
| `reportGetResult` | `{ report_id }` 或 `{ report_no }` | `{ _id, report_no, status, finished, result_summary, close_time, create_date, asOf }` | — |

> `reason_type` 取负面清单分类：`drug` / `medical_device` / `tobacco` / `ecigarette` / `alcohol` /
> `health_product` / `dangerous` / `porn_gamble` / `illegal_ticket` / `infringement` /
> `qualification` / `other`。
> `result_summary` 是结论的**对外说法**，不含 `conclusion_reason`、处理人与任何内部备注。

### 14.7 `grouporder-ops-co`（38）

所有方法的鉴权以**提交时刻**的权限为准；成功与拒绝都写 `grouporder-oplog`。

| 方法 | 入参 | 出参 `data` | 权限点 |
|---|---|---|---|
| `activityDetail` | `{ activity_id }` | `{ activity{}, goods[], stat{}, reports[], content_checks[], asOf }` | `ops-content-activity` |
| `activityGovernanceOff` | `{ object_id, violation_type, reason, case_no? }` | `{ object_type:'activity', object_id, governance_status, changed }` | `ops-content-activity` |
| `goodsGovernanceOff` | `{ object_id, violation_type, reason, case_no? }` | `{ object_type:'goods', object_id, governance_status, changed, blocked_lib_ids[] }` | `ops-content-activity` |
| `activityGovernanceOn` | `{ object_id, reason?, case_no? }` | `{ object_type:'activity', object_id, governance_status, changed }` | `ops-content-activity` |
| `goodsGovernanceOn` | `{ object_id, reason?, case_no? }` | `{ object_type:'goods', object_id, governance_status, changed, released_lib_ids[] }` | `ops-content-activity` |
| `reportList` | `filters: { status?, report_no?, activity_id?, publisher_uid?, handler_uid?, start_date?, end_date? }` | `list[]` | `ops-content-report` |
| `reportDetail` | `{ report_id }` | `{ report, related_reports[], reviews[], content_checks[], publisher_restrictions[], asOf }` | `ops-content-report` |
| `reportClaim` **新增** | `{ report_id }` | `{ report_id, status, handler_uid, changed }` | `ops-content-report` |
| `reportConclude` | `{ report_id, conclusion: 1–6, conclusion_reason }` | `{ report_id, report_no, status, conclusion, changed, executed_actions: [{ action, object_type, object_id, changed }] }` | `ops-content-report` |
| `reportRecheck` | 发起：`{ report_id, apply_reason? }`；提交结论：`{ report_id, review_conclusion, review_reason }` | 发起 `{ review_id, review_no, status }`；结论 `{ review_id, review_no, status, result_changed }` | `ops-content-report` |
| `checkList` | `filters: { status?, object_type?, object_id?, check_result?, start_date?, end_date? }` | `list[]` | `ops-content-report` |
| `checkHandle` | `{ check_id, status: 2\|3\|4, review_conclusion?, review_reason }` | `{ check_id, status, changed }` | `ops-content-report` |
| `publisherRestrict` | `{ target_uid, restriction_type: 1–4, reason, violation_type?, effective_from?, effective_to?, related_report_id? }` | `{ changed, case_no, prev_status, next_status }` | `ops-content-report` |
| `reviewList` | `filters: { leader_uid?, keyword?, review_mode?, start_date?, end_date? }` | `list[]` | `ops-content-review` |
| `reviewDetail` | `{ activity_id }` | `{ activity{}, goods[], content_checks[], asOf }` | `ops-content-review` |
| `reviewSubmit` | `{ activity_id, pass: boolean, reason, content_version? }` | `{ activity_id, status, review_result }` | `ops-content-review` |
| `configGet` | `{ config_key? }` | `{ config_key, config_value, description, update_uid, update_date, exists, asOf }` | `ops-sys-config` |
| `configSet` | `{ config_key?, config_value, description?, reason? }` | `{ config_key, prev, next }` | `ops-sys-config` |
| `searchOrders` | `filters: { order_no?, activity_id?, user_id?, status?, consignee_mobile?, start_date?, end_date? }` | `list[]`，**完整明文** | `ops-search` |
| `searchActivities` | `filters: { activity_id?, short_code?, leader_uid?, status?, governance_status?, keyword?, date_field?, start_date?, end_date? }` | `list[]` | `ops-search` |
| `searchGoods` | `filters: { goods_id?, activity_id?, governance_status?, on_sale?, keyword? }` | `list[]` | `ops-search` |
| `searchUsers` | `filters: { user_id?, username?, nickname? }` | `list[]`，含 `publish_restriction` | `ops-search` |
| `exportSearchResult` | `{ target: 'orders'\|'activities'\|'goods'\|'users', ...对应检索的 filters }` | `{ target, total, url, expires_in, row_count, asOf }` | `ops-search` |
| `statOverview` | `filters: { leader_uid?, start_date?, end_date? }`（按 `publish_date` 筛） | `list[]` 团长汇总 | `ops-stat-view` |
| `statActivityDrill` | `{ activity_id }` 或 `{ leader_uid }` | 活动维度或活动列表 | `ops-stat-view` |
| `statExport` | 同上 | `{ url, expires_in, row_count, asOf }` | `ops-stat-view` |
| `appealList` | `filters: { status?, appeal_no?, applicant_uid?, start_date?, end_date? }` | `list[]` | `ops-privacy-appeal` |
| `appealDetail` | `{ appeal_id }` | `{ appeal, applicant_has_data, target_has_data, both_have_data, asOf }` | `ops-privacy-appeal` |
| `appealResolve` | `{ appeal_id, identity_verify_result, approve: boolean, target_account_uid?, handle_reason?, fail_reason? }` | `{ appeal_id, status, changed, denied? }` | `ops-privacy-appeal` |
| `privacyCaseList` | `filters: { status?, case_type?, case_no?, target_uid?, start_date?, end_date? }` | `list[]` | `ops-privacy-case` |
| `privacyCaseCreate` | `{ case_type: 1\|2\|3, target_uid, reason? }` | `{ case_id, case_no, retention_start, retention_expire }` | `ops-privacy-case` |
| `privacyCaseUpdate` | `{ case_id, status?, restricted?, execute_result?, reason? }` | `{ case_id, status }` | `ops-privacy-case` |
| `exportLogList` | `filters: { activity_id?, leader_uid?, request_uid?, event_type?, start_date?, end_date? }` | `list[]`，**不含下载地址** | `ops-audit-export` |
| `exportDownload` | `{ file_version }` | `{ url, expires_in, asOf }` | `ops-audit-export` |
| `oplogList` | `filters: { operator_uid?, action_type?, object_type?, object_id?, case_no?, request_id?, result?, start_date?, end_date? }` | `list[]` | `ops-audit-oplog` |
| `workbenchTodo` | — | `{ levels: [{level, label, count, items[]}], badge_count, asOf }` | `ops-workbench` |
| `accountSetStatus` **新增** | `{ user_id, status: 0\|1, reason? }` | `{ user_id, status, changed }` | `ops-sys-account` |
| `roleAssign` **新增** | `{ user_id, roles: string[], reason? }` | `{ user_id, roles, changed, stat_permission }` | `ops-sys-role` |

> **`privacyCaseUpdate` 拒绝任何改期限的入参**：传入 `retention_start` 或 `retention_expire`
> 一律返回 `OPS_INVALID_PARAM`，而不是静默忽略（OPS §15「不得允许运营任意延长、缩短或绕过」）。
>
> **`reportConclude` 自动执行处置**（D-082）：结论为 3 下架单个商品、4 下架整个活动、5 临时限制发布、6 永久限制发布时，
> 在结案的同一请求内调用与 `goodsGovernanceOff` / `activityGovernanceOff` / `publisherRestrict` 相同的公共逻辑执行处置，
> 各自写入审计事件，出参 `executed_actions[]` 列出实际执行的动作；任一动作失败则整个结案回滚并返回该动作的错误码。
> A-09 / A-10 保留手动入口，用于复核后的恢复、解除限制与追加处置。
>

> **`accountSetStatus` / `roleAssign` 只收口写操作**：A-15 的**读**仍走 `unicloud-db` 直连
> `uni-id-*`（那些表 `read: true`），只有写改走云对象。不这样做，OPS §13 要求的
> `account_disabled` / `role_changed` / `stat_permission_changed` 三类事件架构上无处写入。

### 14.8 定时与回调云函数（4）

| 云函数 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `grouporder-task-autoclose` | 定时触发，无入参 | `{ scanned, closed, failed, errors[], has_more }` | 每批 100 条；`actual_end_time` 取**计划截止时间**而非任务执行时间，任务延迟不让清单上的截止时间往后漂 |
| `grouporder-task-export-cleanup` | 定时触发 | `{ scanned, deleted_files, failed, errors[], has_more }` | 只处理「刚跨过 60 天」的 7 天窗口，避免在 schema 未定义的字段上加清理标记；重复 `deleteFile` 是幂等的 |
| `grouporder-task-retention` | 定时触发 | `{ orders_anonymized, cases_updated, failed, errors[], has_more }` | 只匿名化，**不删除订单与明细**——汇总口径要保住 |
| `grouporder-check-callback` | `{ trace_id, result, hit_reason }`（形态按服务商，解析集中在 `parsePayload`） | `{ errCode, data }` | 明确违规才转治理下架；「命中需人工」只进待办 |

---

## 15. 变更记录

| 日期 | 版本 | 变化 |
|---|---|---|
| 2026-10-23 | v0.42 | 授权复制允许修改（D-155 修订）：`activityCopyByToken` 增 `submit` 参数；`copy_origin = 1` 的商品在 `goodsUpdate` / `goodsAdjustStock` 中不写商品库 |
| 2026-10-21 | v0.41 | 授权复制（D-155）：activity-co 新增 `activityCopyAuthorize` / `activityCopyPreview` / `activityCopyByToken`；`activityGetDetail` 团长另得 `copy_token`；`_copyFrom` 增「复制给他人」模式（清空 `lib_id`） |
| 2026-10-19 | v0.40 | issue 整改（D-151～D-154）：order-co 新增 `orderLeaderMarkAll`；`activityGetDetail` 增 `my_bought_qty`；goods-co `categoryCreate` 建大类时同时建同名小类并返回 `default_child_id`；M-28 全选不新增接口 |
| 2026-10-17 | v0.39 | 商品库同步（D-143）：`libUpdate` 改了名称 / 说明 / 封面 / 详情图时同步到本人未结束活动的同一商品（`lib_id` 或原名称匹配），出参增 `synced{ activity_count, goods_count, recheck_count }` |
| 2026-10-17 | v0.38 | 起止时间窗口（D-135）：`activityCreateDraft` / `activityUpdateDraft` / `activitySubmitReview` 校验「起始 − 当前 ≤ 7 天」「截止 − 起始 ≤ 7 天」（`INVALID_PARAM`）；`activityCopy` 预填时长上限 7 天 |
| 2026-10-17 | v0.37 | 待办（D-134）：`todoList` 去掉 `activity_closed_export`；`draft_stale` 改为 `draft`（全部草稿、第 3 档）；新增 `closed_pending`（第 2 档，出参带 `mark`） |
| 2026-10-16 | v0.36 | `activityUpdateDraft` 只认真正变化的字段（D-120）：图片按 fileID、截止时间按分钟、其余按值比较；全部未变返回 `{ need_recheck: false, unchanged: true }` |
| 2026-10-16 | v0.35 | 图片地址刷新（D-119）：common 新增 `fileurl.js`；activity / goods / order / user / report / ops 六个云对象 `_after` 改为 async，出参里的 file 对象 `url` 统一按 `fileID` 换成新的访问地址 |
| 2026-10-16 | v0.34 | 海报封面（D-117）：activity-co 新增 `activityPosterCover` |
| 2026-10-16 | v0.33 | 团长订单详情（D-116）：order-co 新增 `orderLeaderDetail`；`orderLeaderList` 出参增 `buyer_name`（下单账号用户名，无则昵称） |
| 2026-10-16 | v0.32 | 接龙码（D-115）：`orderCreate` 落库后分配 `order_code` 并在出参返回；`orderGetDetail` / `orderMyList` / `orderLeaderList` / `orderLeaderBrief` 返回 `order_code`（缺失时前两者与 `orderLeaderList` 当场补发）；`orderLeaderList` 增 `filters.keyword` 与第一页 `counts`；export-co 参与者明细增「接龙码」列、「交付记录」改「取货记录」 |
| 2026-10-16 | v0.31 | `activityCancel` 开始后不能取消（D-111）：进行中活动须未到起始时间，否则 `PRECONDITION_UNMET`；条件更新带 `start_time > now` |
| 2026-10-16 | v0.30 | 团长名片（D-109）：`leaderContactGet` / `leaderContactSet` 扩 `nickname` / `avatar`；`activityGetDetail`、`orderGetDetail` 的 `leader_contact` 增 `nickname` / `avatar`（头像被拦截不返回，四项全空为 null）；common `contentcheck` 新增送检类型 `leader_card`，`grouporder-check-callback` 对其只回写检测状态、不做治理下架 |
| 2026-10-16 | v0.29 | 团长统计与会员预留（D-106）：order-co 新增 `leaderStatOverview`；common 新增 `membership.js`（`getMember` / `isGated` / `requireFeature`，读配置 `member_gate`）；`meOverview` 增 `member{ is_member, expire }` |
| 2026-10-16 | v0.28 | 按活动码查找（D-104）：activity-co 新增 `activityFindByCode`；common `idempotent` 活动码改 6 位加密随机、新增 `normalizeShortCode`；`orderMyList` 分组增 `short_code` |
| 2026-10-16 | v0.27 | 团长联系方式（D-103）：user-co 新增 `leaderContactGet` / `leaderContactSet`；`activityGetDetail`、`orderGetDetail` 增 `leader_contact`；common 新增 `leadercontact.js` |
| 2026-10-16 | v0.26 | 团长记录与文字清单：order-co 新增 `orderLeaderMark`（D-100）、`orderLeaderBrief`（D-101）；`orderLeaderStat` 增 `paid_order_count` / `delivered_order_count`；`orderLeaderList` 增团长记录筛选与字段；`orderGetDetail` 增只读记录；export-co 预览与 Excel 增两列 |
| 2026-10-15 | v0.25 | 并发与一致性：① 订单编辑锁 `editing_until`：`orderUpdate` 持锁执行、`orderCancel` / `orderVoid` 以未锁为条件，抢不到返回 `STATE_CHANGED`「订单正在处理中，请稍后重试」；`orderCreate` 写明细期间持锁，写明细失败整单回滚；② 扣库存条件带上读到的 `total_stock`，团长同时调库存时按新值重试最多 3 次；`goodsAdjustStock` 调小库存以 `sold_qty <= 新库存` 为条件写入；③ 限购改为写入后复核，超限则回滚本单并返回 `LIMIT_EXCEEDED`；④ 幂等键查询限定本人；⑤ `activityClose` / `activityCancel` 以当前状态为条件更新，起止时间校验为数字；⑥ `libUpdate` 只更新变化的字段、未换图不重新送检，无变化返回 `changed:false`；⑦ 自动审核模式下进行中活动内容改动当场文本检测（D-097）；⑧ `grouporder-check-callback` 拒绝客户端调用并要求 HMAC 签名（密钥在 uni-config-center `grouporder-check-callback/config.json` 的 `secret`），商品库送检类型 `goods_lib` 回写商品库；⑨ 定时任务：匿名化在单次预算内循环多批、清单清理按 `file_cleaned` 选取并循环；⑩ ops-co 聚合全部显式上限、`statOverview` 分批读完 |
| 2026-10-15 | v0.24 | 上线前 Review 修复：① 所有 grouporder 云对象 `_after` 经 `auth.attachNewToken` 在返回顶层带 `newToken`（使用中自动续期，uni-id web 端有效期 7 天、剩 1 天续期）；② `goodsUpdate` 只有值真正变化的字段进 patch（图片按 fileID 比较），只改价格 / 库存 / 限购不再触发重审（D-048），无变化不报错；③ `orderPreview` / `orderUpdate` 改单口径：不增加份数的商品不受停售 / 下架 / 库存 / 限购阻止（D-050），本单原有份数保留下单价、新增份数按现价（D-018），明细逐条更新、数量未变的不重写；④ `orderCreate` 订单号撞唯一索引时换号重试最多 5 次；⑤ `addressList`、待办（已关闭记录、团长活动）分批读完 |
| 2026-10-15 | v0.23 | §2.2 新增「服务端内部读取不得用固定条数截断」：清单导出不再只读前 600 张有效订单 / 2000 条明细；`orderLeaderList` 每页明细分批读完、加 `_id` 次排序，M-21 前端改为分页加载并显示真实总数；待办与注销检查分批读完本人订单；商品汇总、活动列表份数、商品库分类计数的聚合显式加上限 |
| 2026-10-15 | v0.22 | `orderMyList` 分页单位改为**活动分组**：分批读完本人全部订单后按活动归组（组按最近一次下单时间倒序）再分页，同一活动的订单不再跨页，`total` 为分组数；明细不再受单次 500 条上限截断；补出参 `not_started`、`start_time`，并对页内活动读时补截止。修复 M-18 前端把已分组结果二次分组导致订单号 / 份数 / 金额为空、点订单报「订单不存在」 |
| 2026-10-15 | v0.21 | 按 **D-094**：`goodsCreate` 新增 `sync_to_lib`（`false` 时不沉淀商品库）。**已实现** |
| 2026-10-15 | v0.20 | 按 **D-093**：`libCopyToActivity` 增加去重（同名或同 `lib_id` 列入 `failed[]`，`DUPLICATE`）；`goodsCreate` / `goodsUpdate`（改名）同一活动内不重名。**已实现** |
| 2026-10-12 | v0.19 | 新增 common `lifecycle.js`（`closeIfExpired` / `closeExpiredIn`）：`activityGetDetail`、`activityMyList`、`activityCopySourceList` 读时补截止，`grouporder-task-autoclose` 改用同一实现；`activityGetDetail` 出参增加 `asOf`。client 工程三个定时函数补齐触发器配置（与 admin 一致） |
| 2026-10-12 | v0.18 | 按 **D-092**：`libCopyToActivity` 说明去掉「必须逐项确认」（接口不变，确认门为纯前端，已删除） |
| 2026-10-12 | v0.17 | 按 **D-091**：`activityCopy` 改由发起页在团长保存 / 发布或首次操作商品时调用，M-31 不再直接调用；接口本身不变 |
| 2026-10-12 | v0.16 | 按 **D-090** 新增 `activityDeleteDraft`。**已实现**，前端方法清单已重新生成 |
| 2026-10-09 | v0.15 | 按 **D-089**：`goodsAdjustStock` 成功后同步库记录默认库存 / 限购（common 新增 `goodslib.syncStockToLib`）；明确 M-11 编辑时库存 / 限购走 `goodsAdjustStock`。商品库三个 `last_*` 字段的读写点以 GOODS_LIB_SPEC §2.4 为准。**已实现** |
| 2026-10-09 | v0.14 | 按 **D-088**：goods-co 新增 `libCreate`（商品库直接新建）；activity-co `goodsCreate` / `goodsUpdate` 新增 `lib_category_id`，随沉淀写入库记录分类；common `goodslib` 新增 `assertOwnCategory`、`sinkToLib(…, opts)`。**已实现**（两份副本同步，前端方法清单已重新生成） |
| 2026-10-08 | v0.13 | 按 **D-087**：新增错误码 `ACTIVITY_NOT_STARTED`；活动建草稿 / 编辑收 `start_time`，提交审核校验起止先后；详情与「我发起的」返回 `start_time`、`not_started`，`joinable` 计入起始时间；复制按源起止时长推算；ops-co 活动详情、审核详情、检索返回 `start_time`；common `state.startTimeOf / isNotStarted`，`assertActivityJoinable` 校验起始时间。**已实现**（两份副本同步） |
| 2026-10-08 | v0.12 | 按 **D-086** 改为活动级 `delivery_types` + 订单级 `delivery_type`：活动类方法入出参改 `delivery_types`；`orderPreview` 返回可选方式并支持改单试算（`order_id`）；`orderCreate` / `orderUpdate` 收 `delivery_type`；订单详情、明细、我的订单按单返回方式；`orderLeaderStat` 与 M-20 统计新增 `by_delivery`；清单明细新增交付方式列；common 新增 `state.deliveryTypesOf / orderDeliveryTypeOf / normalizeDeliveryTypes / supportsDelivery` 与 `deliverystat.breakdown`，`snapshot.buildConsignee` 改收本单方式。**已实现**（client 与 admin 两份副本同步） |
| 2026-10-08 | v0.11 | 按 **D-085**：`activityCopySourceList` 只列已截止活动，`activityCopy` 对非已截止源返回 `PRECONDITION_UNMET`（取代 v0.7 按 D-080 放开源范围的约定）。**已实现**（activity-co 两份副本同步） |
| 2026-09-30 | v0.10 | 按 **D-084**：`activityCreateDraft` 的 `cover_image` 改为可选、出参增加 `create_date`；`activityUpdateDraft` 草稿阶段允许封面为空；`activitySubmitReview` 统一校验活动封面、商品数、商品封面、自提地址；`activityUpdateDraft` / `goodsUpdate` / `libUpdate` 保存成功后按三表引用回收被替换的旧图；回收与 `cover_image` 整体替换逻辑下沉到新增的 common `files.js`。**D-081 实现补齐（2026-10-08）**：`activityCreateDraft` / `activityCopy` 读取并写入 `idempotent_key`（8–64 位，缺失报 `INVALID_PARAM`），经 `idempotent.runOnce` 先查后建，命中返回首次结果并带 `duplicated: true`，命中他人记录报 `FORBIDDEN`；`activityCopy` 的 60 秒弱判重已删除。客户端：M-10 每次新建意图一个键（重置时换新），M-31 每选定一个源一个键。v0.9 所记「实现待跟进」中 activity-co 部分至此完成**已实现**（activity-co，client 与 admin 两份副本同步） |
| 2026-09-29 | v0.9 | 按 **D-081** 给 `activityCreateDraft` / `activityCopy` 加必填 `idempotent_key`，废止 60 秒弱判重说明；按 **D-082** `reportConclude` 改为自动执行处置，出参 `pending_actions[]` → `executed_actions[]`。事实来源去掉 90-working 与 99-archive 文档。**实现待跟进**：activity-co 两个创建方法读 `idempotent_key` 并按唯一索引判重；ops-co `reportConclude` 调用治理公共逻辑，原 :627 返回错误方法名的问题随之消失 |
| 2026-09-29 | v0.8 | §14 两处「待确认」补编号与去向：activityCopy 强幂等 → DATA_MODEL §12 A-05，reportConclude 自动联动 → A-06 |
| 2026-09-29 | v0.7 | 新增错误码 `ACTIVITY_REVIEWING`（D-079，审核中内容冻结）并标注命中方法；`activityCopySourceList` / `activityCopy` 的源范围按 **D-080** 改为仅排除治理下架。**实现待跟进**：`review.canEditContent` 目前仍放行审核中，需改为拒绝；`activityCopy` 与 `activityCopySourceList` 需去掉 DRAFT/REVIEWING 过滤 |
| 2026-09-29 | v0.6 | 按 **D-078** 更正 §11 说明：`READ_UNI_ID_LOG` 只授予唯一运营角色 `ops-super`。各方法的权限点列不变，权限点机制保留，只用于入口控制与审计归因 |
| 2026-09-29 | v0.6 | **对齐 activity-co 的真实实现**（v0.5 的设计与代码有出入）：① 新增独立方法 **`activityUpdatePickup`**（发布后改自提点、送检不阻塞、写 `oplog`），方法数 92 → **93**；② 撤销 v0.5 臆造的错误码 `PICKUP_ADDRESS_REQUIRED`——实际用 `assertParam`（`INVALID_PARAM`）；③ 自提必填的时机由 v0.5 的「createDraft 必填」更正为「**草稿不卡、`activitySubmitReview` 校验**」；④ `activityCopy` 补自提点随复制（`DATA_MODEL §4.10`） |
| 2026-09-29 | v0.5 | 按 D-077 补自提点字段：`activityCreateDraft`/`activityUpdateDraft` 入参加四个 `pickup_*`，`activityGetDetail` 详情出参补这四字段（本版部分设计已由 v0.6 对齐实现修正） |
| 2026-09-18～2026-09-20 | v0.1～v0.4 | 早期演进（4 次修订：建稿、决策同步与 D-072～D-076 改写等），逐条内容见 git 历史 |
