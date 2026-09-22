# 云函数与云对象总契约

- 文档版本：v0.4（设计稿 v0.1 → 实现回填 v0.2 → 裁决收口 v0.3 → 登录审计归位 v0.4）
- 日期：2026-09-20
- 性质：**全部服务端接口的唯一事实源**。云函数 session 照此实现；admin 端与 client 端两个前端 session 照此调用。
- 事实来源：`PRD.md`、`OPS_ADMIN_REQUIREMENTS.md`、`DECISIONS.md`、`DATA_MODEL.md`、`UX_FLOW_SPEC.md`、`GOODS_LIB_SPEC.md`、`ADMIN_BUILD_PLAN.md`、效果图 `admin-mockup-v3.html`

> **修改规则**：本文由**云函数 session 维护**（回填入出参、补错误码）。两个前端 session **只读**；发现缺方法或签名不符**上报**，不自行修改。
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

**合计 92 个方法 + 14 个公共模块 + 4 个云函数。**

> v0.1 的「80 个方法 / 11 个模块」与逐节清单对不上，v0.2 已核清：v0.1 的分对象声称数中
> `goods-co` 9 实列 8、`user-co` 13 实列 12（各漏写一个方法）、`ops-co` 声称 27 实列 33
> （合并 `OPS_CO_API.md` 时未更新数字）。补齐漏写的两个方法、新增 4 个方法、把治理下架与恢复各拆为活动版与商品版后为 92 个，
> 逐节清单与本表一致。公共模块 11 → 14 的三个新增见 §3。

### 1.2 划分原则

- **按业务域拆，不按页面拆**。一个域的状态机、幂等与并发规则写在一起，跨对象调用一律走 `common`，**云对象之间不互相调用**。
- **活动与活动内商品放同一个对象**：商品是活动的子资源，改价、停售、库存调整都要同时校验活动状态，拆开会产生跨对象事务。
- **商品库单独成对象**：它是**账号级**资产，与任何单个活动无关（`GOODS_LIB_SPEC`）。
- **后台单独成对象**：权限模型、审计要求与客户端完全不同（D-072、D-075、D-076）。

> **对 `docs/99-archive/update.md` 批次 B 的两处归属调整**（该文明确允许「若架构另有划分则调整归属，方法语义不变」）：
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
| `ACTIVITY_CANCELLED` | 活动已被团长取消 | |
| `ACTIVITY_OFFLINE` | 活动被平台下架 | 禁止新建或扩大订单，不影响查看 |
| `GOODS_OFF_SALE` | 商品已停售 | 允许减少或移除，不允许新增扩大 |
| `GOODS_OFFLINE` | 商品被平台下架 | 同上，仅影响该商品 |
| `STOCK_NOT_ENOUGH` | 库存不足 | 原子扣减返回 `updated === 0` |
| `LIMIT_EXCEEDED` | 超出每人限购 | 按商品分别计算 |
| `DELIVERY_TYPE_LOCKED` | 交付方式发布后不可改 | D-060 |
| `PRECONDITION_UNMET` | 前置条件不满足 | 如注销时仍是进行中活动的团长（D-056） |

**后台业务码**：沿用上表，前缀 `OPS_`（`OPS_FORBIDDEN` 等），另加 `OPS_TARGET_CLOSED`（活动在处置期间截止或被取消）。

### 2.4 三项强制声明

每个方法在实现时必须明确：

| 项 | 规则 |
|---|---|
| **鉴权** | 以**提交时刻**的账号状态与权限为准，不依赖进入页面时的结果（OPS §3.1、§12.2） |
| **日志** | 后台方法一律写 `grouporder-oplog`（成功与拒绝都写）；**客户端的商品经营变动（改价、改单位、停售/恢复、库存与限购调整）同样写 `grouporder-oplog`**，取 §10.8 第 11 类，`operator_roles` 为空数组以区分来源；客户端的清单生成与下载写 `grouporder-export-log`。`action_type` 一律取 `DATA_MODEL §10.8` 枚举表 |
| **幂等** | 写方法声明幂等键；重复提交返回首次结果而非报错（§8.3） |

### 2.5 服务端时间

**所有截止判断一律用服务端时间**，客户端时间不可信。下单、改单、取消在写入前重新校验活动 `status`、`end_time`、`governance_status`（§8.4）。

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
| `restriction.js` | **v0.2 新增**。`assertCanPublish(ctx, uid)` 发布权限校验（读 `grouporder-user-ext`）、`apply()` 写处置流水并同步当前状态 | OPS §7；`DATA_MODEL §10.4`、§10.9 |
| `review.js` | **v0.2 新增**。`content_version` 递增与内容改动后的重新送审 | D-043、D-048；`GOODS_LIB_SPEC §5.4` |

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
| `activityCreateDraft` | 新建草稿 | M-10 | `delivery_type` 必填；草稿不占用任何公开入口 |
| `activityUpdateDraft` | 编辑草稿 | M-10 | **`delivery_type` 发布后不可改**（D-060 → `DELIVERY_TYPE_LOCKED`） |
| `activitySubmitReview` | 提交审核 | M-12 | **提交时把平台配置的 `review_mode` 固化到 `activity.review_mode`**（D-057）；自动模式下内容检测通过即置进行中、`review_uid` 为空；人工模式进审核中 |
| `activityWithdrawReview` | 撤回审核 | M-12 | 审核中 → 草稿 |
| `activityGetDetail` | 活动详情 | M-13 / M-20 | **同一方法按身份返回不同字段**：参与者得非敏感内容 + 各商品已购份数 + 有效总份数；团长另得统计与管理入口。审核中仅团长与获权内容运营可见 |
| `activityMyList` | 我发起的 | M-09 | 按业务状态与治理状态双维度筛选，两者**分列不合并** |
| `activityClose` | 手动截止 | M-23 | 不可逆；截止后不可再取消（D-027） |
| `activityCancel` | 取消活动 | M-23 | **原因必填**；仅允许草稿或进行中；已截止不可取消（D-027）；写入 `retention_expire_date` |
| `activityGetShareEntry` | 取分享入口参数 | M-12 / M-13 | 入口不可枚举；**入口有效不等于授予敏感数据权限**，服务端逐次鉴权（D-034） |
| `activityCopySourceList` | 可复制的历史活动 | M-31 | 仅本人发起；**草稿与被平台下架的活动不可作为源**（D-067、AC-AC-006） |
| `activityCopy` | 复制为新草稿 | M-31 / M-09「再来一次」 | 出参 `{ activity_id, copied_count, excluded: [{name, reason}] }`；**被治理下架的商品不进新草稿并在出参列出**（AC-AC-005）；截止时间按源活动时长节奏预填（D-067）；幂等 |

### 4.2 活动内商品

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `goodsCreate` | 新增商品 | M-11 | 保存时**自动沉淀到商品库**（`common/goodslib.sinkToLib`）；`0` 表示不限库存/不限购 |
| `goodsUpdate` | 编辑商品 | M-11 / M-22 | `ever_ordered=1` 时**改价需二次确认并记录前后值**；禁止删除；有限库存不得低于 `sold_qty` |
| `goodsDelete` | 删除商品 | M-22 | 仅 `ever_ordered=0` 可删 |
| `goodsSetOnSale` | 停售 / 恢复售卖 | M-22 | 停售只阻止新增与扩大，**已有明细保留并进入清单**（D-019、D-050）；活动已截止或已取消时**禁止恢复**（D-028） |
| `goodsAdjustStock` | 调整库存与限购 | M-22 | 可取消库存上限、增加库存、减少至不低于 `sold_qty` |
| `goodsSort` | 拖拽排序 | M-22 | **v0.2 新增**。按拖拽后的可视顺序**整体重写**该活动全部商品的 `sort`，从 1 连续递增，不允许部分有值部分默认（`GOODS_LIB_SPEC §5.7`、AC-GL-018）。`is_recommend` 不进排序表达式 |

> 商品的 `governance_status`（平台下架）**只能由 `grouporder-ops-co` 设置**，本对象所有方法都不得改写它。

---

## 5. `grouporder-order-co` 订单

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `orderPreview` | 确认订单页试算 | M-14 | 校验库存、限购、活动状态；返回预计金额；**不落库** |
| `orderCreate` | 提交订单 | M-14 | **幂等键必传**；库存**带条件原子自增**（§8.1）；限购按商品分别计算（§8.2）；固化价格与收货快照；自提活动**不采集地址**（D-060） |
| `orderMyList` | 我参与的 | M-18 | 按活动分组，一个活动下可有本人多张订单 |
| `orderGetDetail` | 订单详情 | M-19 | 返回收货快照 |
| `orderUpdate` | 改单 | M-19 | 截止前允许改数量、移除商品、换收货信息、改备注；**扩大数量要重新走库存与限购校验** |
| `orderCancel` | 参与者取消整单 | M-19 | 截止前；返还库存 `inc(-qty)`；**终态不可逆**；取消后仍可新建订单，原记录保留（D-025） |
| `orderVoid` | 团长作废整单 | M-20 / M-21 | **仅团长、仅截止后、原因必填**；返还库存；**使已有 Excel 清单版本失效**（D-051） |
| `orderLeaderStat` | 团长统计 | M-21 | 有效订单数、有效总份数、商品汇总、预计金额；**不出现销售额/实收/GMV** |
| `orderLeaderList` | 团长看参与者明细 | M-21 | 团长可读**本人活动**履约所需的收货字段（D-016）；跨活动读取一律拒绝 |

---

## 6. `grouporder-goods-co` 商品库与分类

| 方法 | 用途 | 页面 | 关键约束 |
|---|---|---|---|
| `libList` | 商品库列表 | M-28 / M-29 | 入参含 `category_id`；按最近使用倒序；**被封禁记录不可选、不可编辑** |
| `libUpdate` | 编辑库记录与三项预填值 | M-29 | `GOODS_LIB_SPEC §5.6` |
| `libDelete` | 软删 | M-29 | 软删记录**同样保持封禁状态**（D-064） |
| `libCopyToActivity` | 复用到当前活动 | M-28 | 多选；价格/总库存/每人限购**预填但必须逐项确认**（D-063）；被下架商品不可选 |
| `categoryList` / `categoryCreate` / `categoryUpdate` / `categoryDelete` | 分类管理 | M-30 | 用户私有；**仅用于筛选，不进活动展示与清单**（D-066）；上限 20 个 |
| `categorySort` | 分类拖拽排序 | M-30 | **v0.2 补齐**（v0.1 表头声称 9 个方法但只列了 8 个）。与 `goodsSort` 同一原则：整体重写为从 1 起的连续值 |

> 分类**不做批量加入**（D-066）；商品库的推荐标识 `is_recommend` **不进入排序**（D-065）。

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
| `reportConclude` | 结论 6 选 1、结案 | `ops-content-report` | `report_conclude` / `report_close` | A-08 |
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
> 读该表需要内置权限点 `READ_UNI_ID_LOG`，已授予 `ops-super` 与 `ops-auditor`。

---

## 12. 定时与回调云函数（非云对象）

| 云函数 | 触发 | 职责 | 规格 |
|---|---|---|---|
| `grouporder-task-autoclose` | 定时（建议每分钟） | 到期活动自动置已截止；**审核中到期直接进已截止**，之后即使审核通过也不重开 | `DATA_MODEL §5.1` |
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
| 后台 A-15 运营账号与权限 | `pages/system/{user,role,permission}/*` + `unicloud-db` 直连 `uni-id-*`；五处必改见 `ADMIN_REUSE_MAP §4` |
| 后台 A-14 登录日志 tab | `pages/system/safety/list.vue` 读 `uni-id-log`，**不与 `oplogList` 合并**（ADM-13） |

---

## 14. 方法签名（实现回填）

> 本节由云函数 session 在实现时回填，是两个前端 session 的调用依据。
>
> **配套的前端调用层**（不是第二事实源，只有方法名与转发，没有参数定义）：
>
> | 文件 | 说明 |
> |---|---|
> | `grouporder-client/src/api/index.js`、`grouporder-admin/js_sdk/grouporder-api/index.js` | **自动生成**，92 个方法名与转发。改了云对象方法后重跑 `node tools/gen-frontend-api.js`，方法名不会与实现漂移 |
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
| `activityCreateDraft` | `{ title, description?, cover_image, images?, delivery_type, end_time }` | `{ activity_id, short_code }` | — |
| `activityUpdateDraft` | `{ activity_id, title?, description?, cover_image?, images?, end_time?, delivery_type? }` | `{ activity_id, need_recheck, status }` | — |
| `activitySubmitReview` | `{ activity_id }` | `{ status, review_mode, auto_passed, blocked? }` | 状态机自身（草稿→审核中只能成功一次） |
| `activityWithdrawReview` | `{ activity_id }` | `{ status }` | 同上 |
| `activityGetDetail` | `{ activity_id }` 或 `{ short_code }` | 见下方「活动详情出参」 | — |
| `activityMyList` | `filters: { status?, governance_status? }`；`orderBy` 可取 `create_date` / `end_time` / `publish_date` | `list[]`：`{ _id, title, cover_image, short_code, status, governance_status, review_result, review_reason, delivery_type, end_time, actual_end_time, publish_date, create_date, valid_total_qty }` | — |
| `activityClose` | `{ activity_id }` | `{ status, actual_end_time, retention_expire_date }` | 状态机自身 |
| `activityCancel` | `{ activity_id, reason }`（进行中必填） | `{ status, retention_expire_date }` | 状态机自身 |
| `activityGetShareEntry` | `{ activity_id }` | `{ activity_id, short_code, title, cover_image, end_time, asOf }` | — |
| `activityCopySourceList` | — | `list[]`：`{ _id, title, cover_image, status, delivery_type, end_time, publish_date, create_date }` | — |
| `activityCopy` | `{ source_activity_id }` | `{ activity_id, copied_count, excluded: [{name, reason}], end_time, duplicated }` | `(leader_uid, title, 草稿, 60 秒窗口)`，见下方说明 |
| `goodsCreate` | `{ activity_id, name, description?, cover_image, detail_images?, price, unit?, total_stock, per_user_limit, is_recommend?, lib_id? }` | `{ goods_id, lib_id, sort, need_recheck, activity_status }` | — |
| `goodsUpdate` | `{ goods_id, name?, description?, cover_image?, detail_images?, unit?, price?, is_recommend?, confirm_price_change? }` | `{ goods_id, need_recheck, activity_status }` | — |
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
所有访问者得 `{ _id, title, description, cover_image, images, short_code, delivery_type, status,
governance_status, end_time, actual_end_time, create_date, publish_date, valid_total_qty,
goods[], is_leader, joinable }`，其中 `goods[]` 每项为
`{ _id, name, description, cover_image, detail_images, price, unit, total_stock, sold_qty,
per_user_limit, on_sale, governance_status, is_recommend, sort, remain_qty }`
（`remain_qty` 在不限库存时为 `null`）。
团长另得 `{ review_mode, review_result, review_reason, content_version, governance_reason,
ever_governed, cancel_reason, stat: { valid_order_count, valid_total_qty, estimated_amount, asOf } }`。
草稿与审核中的活动对非团长返回 `FORBIDDEN`。

> **`activityCopy` 的幂等键说明**：`grouporder-activity` 的 schema 已定稿，没有幂等键字段，
> 实现也不允许为此加字段，因此按「同一团长 + 同一标题 + 60 秒内的草稿」判重。
> 标题是原样复制的，窗口内出现同名草稿只可能来自同一次请求的重试。
> 若要做成强幂等，需要给活动表加一列——**待确认**。

### 14.2 `grouporder-order-co`（9）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `orderPreview` | `{ activity_id, items: [{goods_id, qty}] }` | `{ activity_id, delivery_type, need_address, items[], unavailable[], total_qty, total_amount, asOf }` | — |
| `orderCreate` | `{ activity_id, idempotent_key, items, address_id? \| consignee_name+consignee_mobile+consignee_address?, buyer_remark? }` | `{ order_id, order_no, total_qty, total_amount, duplicated }` | **`idempotent_key` 必传**，唯一索引拦截 |
| `orderMyList` | `filters: { status?, activity_id? }` | `list[]` 按活动分组：`{ activity_id, title, cover_image, activity_status, governance_status, delivery_type, end_time, orders: [{ _id, order_no, status, total_qty, total_amount, create_date, items[] }] }` | — |
| `orderGetDetail` | `{ order_id }` | `{ _id, order_no, status, activity{}, consignee_*, buyer_remark, total_qty, total_amount, cancel_*, void_*, create_date, items[], editable, asOf }` | — |
| `orderUpdate` | `{ order_id, items?, address_id?, consignee_*?, buyer_remark? }` | `{ order_id, total_qty, total_amount }` | 无独立键；库存以带条件原子自增保证不超卖 |
| `orderCancel` | `{ order_id, reason? }` | `{ order_id, status }` | 状态机自身（带条件更新，重复取消只返还一次） |
| `orderVoid` | `{ order_id, reason }`（必填） | `{ order_id, status, export_versions_invalidated }` | 同上 |
| `orderLeaderStat` | `{ activity_id }` | `{ activity_id, title, status, governance_status, valid_order_count, cancelled_order_count, voided_order_count, valid_total_qty, estimated_amount, goods_summary[], asOf }` | — |
| `orderLeaderList` | `{ activity_id }`；`filters: { status? }`（默认只看有效） | `list[]`：`{ _id, order_no, status, consignee_name, consignee_mobile, consignee_address, buyer_remark, total_qty, total_amount, create_date, void_reason, items[] }` | — |

> `orderLeaderList` 的 `consignee_address` 在自提活动中恒为空串（D-060）。
> 金额字段一律是**分**，前端自行换算展示。

### 14.3 `grouporder-goods-co`（9）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `libList` | `{ keyword?, category_id? }`（`category_id` 传 `"__none__"` 查未分组） | `list[]`：库记录字段 + `{ selectable, unselectable_reason }` | — |
| `libUpdate` | `{ lib_id, name?, description?, cover_image?, detail_images?, unit?, last_price?, last_total_stock?, last_per_user_limit?, is_recommend?, category_id? }` | `{ lib_id, img_recheck }` | — |
| `libDelete` | `{ lib_id }` | `{ lib_id, deleted, changed }` | 幂等 |
| `libCopyToActivity` | `{ activity_id, lib_ids: string[] }` | `{ created[], failed[], need_recheck, activity_status }`；部分失败时 `errCode = PARTIAL_FAILED` 且 `detail` 为同一结构 | `(activity_id, lib_id, 60 秒窗口)`，同 `activityCopy` 的取舍 |
| `categoryList` | — | `{ list: [{_id, name, sort, goods_count}], ungrouped_count, total, asOf }` | — |
| `categoryCreate` | `{ name }` | `{ category_id, name, sort }` | 同名拒绝，`DUPLICATE` |
| `categoryUpdate` | `{ category_id, name?, sort? }` | `{ category_id }` | — |
| `categoryDelete` | `{ category_id }` | `{ category_id, affected }`（`affected` 为归入未分组的商品数） | — |
| `categorySort` **新增** | `{ category_ids: string[] }`（必须是**全量**分类） | `{ sorted, asOf }` | 全量重写，天然幂等 |

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

**`PRECONDITION_UNMET` 的 `detail.blockers[]`**（D-056）：每项为
`{ type: 'activity'\|'order', id, title, status?, order_no?, action }`，`action` 是给用户看的下一步说明。

**待办条目**（`todoList.list[]`）：`{ todo_key, type, level, object_id, title, description, create_date }`。
`todo_key` 形如 `review_rejected:<activity_id>`，直接回传给 `todoDismiss`。
`level` 四档：1 活动被下架／审核不通过；2 参与的活动被取消或下架／已截止待生成清单；
3 24 小时内截止；4 草稿超 24 小时未提交／举报或申诉有结果。

### 14.5 `grouporder-export-co`（3）

| 方法 | 入参 | 出参 `data` | 幂等键 |
|---|---|---|---|
| `listPreview` | `{ activity_id }` | `{ activity_id, title, short_code, delivery_type, has_address_column, actual_end_time, goods_summary[], detail[], valid_order_count, valid_total_qty, estimated_amount, versions[], asOf }` | — |
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
| `reportConclude` | `{ report_id, conclusion: 1–6, conclusion_reason }` | `{ report_id, report_no, status, conclusion, changed, pending_actions[] }` | `ops-content-report` |
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
> **`reportConclude` 不自动执行处置**：结论落库并结案后，`pending_actions[]` 告知还需在
> A-09／A-10 执行哪个动作。OPS §5.1 只写到「审核成立后才能执行下架」，未规定是否自动联动，
> 实现不自行裁决——**待确认**。
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
| 2026-09-20 | v0.4 | **撤回 v0.3 的 `loginAudit`**（ops-co 39 → **38**，总数 93 → **92**）。查证 `uni-id-co/lib/utils/login.js` 后确认：登录成功与失败早已由 uni-id-co 服务端写入 `uni-id-log`，客户端伪造不了；v0.3 加的 `loginAudit` 由登录页调用、可伪造，是在重做一件已做好的事且做得更差。登录事件归 `uni-id-log`，`DATA_MODEL §10.8` 第 1 类同步移除两个取值，`OPS §13` 第一条拆开表述。同批补出内置权限点 `READ_UNI_ID_LOG`（否则 A-14 登录日志页恒为空，ADM-39 遗漏） |
| 2026-09-20 | v0.3 | 按产品负责人裁决收口五条：① 客户端的商品经营变动**也写 `grouporder-oplog`**，§2.4 的「日志」一行改写，`DATA_MODEL §10.8` 同步新增第 11 类四个取值；② 治理下架与恢复**各拆为活动版与商品版**（§11 批 A、§14.7），方法数 37 → **39**，总数 91 → **93**；③ `activityDetail` 的 `action_type` 由笔误的 `order_detail_view` 改为 `activity_detail_view`，§11 批 C 的「按对象类型」在 §10.8 补出对应枚举（活动 / 商品 / 用户各一组）；④ 清单版本失效确定采用**派生判定**不落库，`DATA_MODEL §10.7` 同步；⑤ `reportConclude` 确定**只记结论并结案、不自动执行处置**，由 `pending_actions[]` 指引运营到 A-09／A-10 执行 |
| 2026-09-20 | v0.2 | **实现回填**。新增 §14 全部 91 个方法的入参、出参与幂等键。方法数核清：v0.1 的「80 个」与逐节清单对不上（`goods-co`、`user-co` 各漏写一个方法，`ops-co` 声称 27 实列 33），补齐漏写的 `categorySort`、`privacyRequestMyList` 并新增 `goodsSort`、`reportClaim`、`accountSetStatus`、`roleAssign`、`loginAudit` 五个方法后为 **91 个**（新增方法均已经产品负责人确认）。公共模块 11 → **14**，新增 `contentcheck.js`、`restriction.js`、`review.js`，理由见 §3。`retention.js` 并入 `snapshot.js`，`auth.js` 增 `optionalLogin` |
| 2026-09-18 | v0.1 | 设计稿：7 个云对象（80 个方法）、11 个公共模块、4 个定时与回调云函数的划分与方法清单；通用约定（出参、分页、错误码两级、三项强制声明、服务端时间）；合并原 `OPS_CO_API.md` 的后台契约为 §10～§11；记录对 `update.md` 批次 B 的两处归属调整 |
