# 微信分享入口实现规格

- 文档版本：v0.1
- 更新日期：2026-09-30
- 文档状态：**D-083 已确认为方案 1**（移除 `short_code` 查询分支）；S-01～S-04 已实施
- 对应决策：D-059（仅分享入口，不进公开列表）、D-034（入口有效 ≠ 授予敏感数据权限）、D-043（审核通过才可分享）、D-041（封面图用于分享卡片）、**D-083（已确认，方案 1）**
- 适用版本：见 `docs/README.md` 版本总表
- 读者：实现本功能的开发。本文自包含，除本文外只需阅读 `CLOUD_API.md §4.1` 的 `activityGetShareEntry` 契约

---

## 1. 要解决的问题

分享是本产品**唯一**的活动入口（D-059：不进入任何公开列表，不提供发现、推荐、搜索、分类）。没有分享，活动对团长以外的任何人都不可达。

当前代码是**半成品，且分享出去是坏的**：

| 层 | 状态 |
|---|---|
| `DECISIONS` / `PRD` / `UX_FLOW_SPEC` | 业务规则齐备 |
| `CLOUD_API §4.1` 契约 | 已定义 `activityGetShareEntry` |
| `grouporder-activity-co` 实现 | 已实现，校验「进行中 + 未被下架」才发入口 |
| 客户端 | **缺 `onShareAppMessage`；短码入参错误；落地页无转发按钮；`activityGetShareEntry` 从未被调用** |

细节见 §7 缺陷清单。

---

## 2. 技术方案：微信转发卡片

本版**只做** `onShareAppMessage`（转发给微信好友与群聊）。

不做的三项，以及不做的理由：

| 形态 | 结论 | 理由 |
|---|---|---|
| 朋友圈 `onShareTimeline` | 不做 | 与 D-059「熟人私域、不进公开列表」的定位冲突，需要新决策才能加 |
| 小程序码 / 海报图 | 不做 | 需新增云函数调 `wxacode` 接口与临时存储，本版不排期 |
| 可粘贴的 H5 链接 | 不做 | 小程序无原生能力，需 URL Scheme / URL Link（要备案、有频次与有效期限制）或单独的 H5 版 |

> 「分享链接」在小程序语境下的落地物就是**转发卡片**，不是可复制的 URL。需求方若确实需要 URL，须另立决策。

---

## 3. 入口标识：用 `activity_id`，不要用 `short_code` 〔D-083 已确认：方案 1〕

**这是本文最重要的一条，也是当前代码与 `CLOUD_API` 契约相互矛盾的地方。**

`CLOUD_API §4.1` 要求分享「**入口不可枚举**」。但 `short_code` 的实现不满足这个要求：

```js
// common/grouporder-common/idempotent.js:60
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  // 32 字符
function randomShortCode () { /* 取 4 位 */ }
```

- 空间只有 **32⁴ = 1,048,576**（约 105 万）
- `grouporder-activity.schema.json` 对它的定位是「用于**订单号拼装与口头引用**」，本就不是安全标识
- `activityGetDetail` 支持 `short_code` 查询，且走 `auth.optionalLogin`——**未登录即可查**

三者叠加的后果：脚本遍历 105 万个短码，就能**未登录批量拉取全平台进行中活动**的标题、商品、价格、以及新增的自提点地址（D-077，真实线下地点）。平台活动越多命中率越高：1 万个进行中活动时，随机试 100 次即可捞到一个。这等于变相公开了活动列表，与 D-059 的设计意图相悖。

**因此：**

| 用途 | 标识 | 说明 |
|---|---|---|
| 分享卡片 path 参数 | **`activity_id`** | MongoDB ObjectId，24 位十六进制，不可枚举 |
| 订单号拼装、口头引用 | `short_code` | 保持原用途不变 |

**同时需要收口 `activityGetDetail` 的 `short_code` 分支**（否则即使分享改用 `activity_id`，枚举通道依旧敞开）。三选一，由产品负责人定 —— **已定方案 1，2026-09-30 实施**：

1. ✅ **移除** `short_code` 查询分支（最彻底；影响：口头报码进入活动的场景没有了）
2. 保留但**要求登录**，并对单账号加频次限制
3. 保留但**加长短码**至 8 位以上（32⁸ ≈ 1.1×10¹²）并同步改订单号格式（改动面最大，牵动 `DATA_MODEL §7`）

> 本文其余章节按「分享用 `activity_id`」书写。D-083 已定为方案 1，§4、§7 无需修订。

---

## 4. 路由与卡片字段

### 4.1 落地路径

```
/pages/activity/detail?id=<activity_id>
```

`pages/activity/detail.vue` 的 `onLoad` 已读 `q.id`，**这条路径无需改页面即可工作**。

### 4.2 卡片字段

| 字段 | 取值 | 约束 |
|---|---|---|
| `title` | 活动标题 | 取 `activity.title`（1–50 字，schema 已限）。建议前缀「接龙丨」提高群内辨识度，需产品确认文案 |
| `path` | 见 §4.1 | 必须以 `/` 开头的绝对路径 |
| `imageUrl` | `activity.cover_image.url` | 封面图按 D-041 复用。微信按 **5:4** 裁切；封面图为空时留空，由微信截取页面首屏兜底 |

### 4.3 数据来源

调 `activityGetShareEntry({ activity_id })`，出参 `{ activity_id, short_code, title, cover_image, end_time, asOf }`（`CLOUD_API §4.1` 已定义，无需改动）。

它的价值不在于取标题和封面（页面本来就有），而在于**服务端在发卡片前复核一次状态**：不是「进行中」或已被平台下架时直接抛错，避免团长把一个已下架的活动转发出去。

> 实现提示：`onShareAppMessage` 的返回值**不能是 Promise**，微信要同步拿到卡片内容。因此必须在页面加载时（或点击分享按钮前）**预先**调用 `activityGetShareEntry` 并把结果缓存在页面状态里，`onShareAppMessage` 里同步读缓存。直接在回调里 `await` 会导致卡片内容为空。

---

## 5. 分享入口分布

| 页面 | 编号 | 入口形态 | 显示条件 |
|---|---|---|---|
| 发布预览与结果 | M-12 | 已有按钮，缺回调 | `status === 2`（进行中） |
| 活动管理 | M-20 | **新增**「分享给好友」 | `status === 2` 且 `governance_status === 0` |
| 活动详情（落地页） | M-13 | **新增**右上角转发 / 底部按钮 | 同上。**参与者也可转发** |

M-13 允许参与者二次转发是本功能的关键：群接龙的扩散主要靠参与者往其它群里转，只让团长能分享会显著压低传播。D-034 已明确「入口有效 ≠ 授予敏感数据权限」，敏感数据仍由服务端逐次鉴权，因此开放二次转发不降低安全水位。

---

## 6. 落地页行为

### 6.1 登录态

按 D-033「提交时才要求登录」：**点开卡片不要求登录**，游客可浏览非敏感内容、可加减数量；点「确认接龙」时才触发登录。`detail.vue` 现有 `ensureLogin()` 逻辑已符合，不需要改。

### 6.2 活动状态兼容矩阵

分享卡片发出后活动状态可能变化。好友此时点开，落地页表现：

| 活动状态 | 落地页表现 | 现有实现 |
|---|---|---|
| 进行中，未下架 | 正常接龙 | ✅ |
| 已截止（3） | 进入 M-13，顶部「活动已截止，不能再下单」，不可下单 | ✅ `closedReason` 已覆盖 |
| 已取消（4） | 同上，提示「活动已被团长取消」 | ✅ |
| 被平台下架 | 同上，提示「活动已被平台下架」 | ✅ |
| 草稿 / 审核中（0/1） | 云端 `activityGetDetail` 对非团长抛 `FORBIDDEN` → 跳 M-26 | ✅ |
| 活动被删除 / id 无效 | `NOT_FOUND` → 跳 M-26 | ✅ |

**落地页的状态处理已经是完整的，本次不需要改。** 只需保证 §7 的两个缺陷被修复，卡片能正确抵达这个页面。

---

## 7. 缺陷清单（开发需修复）

### S-01 · 阻断级 · 分享卡片指向团长的发布页

**位置**：`grouporder-client/src/pages/activity/publish.vue:35`

```html
<button class="btn btn--primary" type="primary" open-type="share">分享给好友接龙</button>
```

**问题**：全文件没有 `onShareAppMessage`。`open-type="share"` 只负责触发转发，卡片内容必须由该回调提供。缺失时微信取默认值：标题为小程序名，path 为当前页 `/pages/activity/publish?id=xxx`。

**后果**：好友点开进入的是**团长视角的发布预览页**，不是接龙页。页面会因为访问者不是团长而降级渲染，底部只有「查看活动」按钮，无法接龙。

**修复**：在 `publish.vue` 增加 `onShareAppMessage`（`import { onShareAppMessage } from '@dcloudio/uni-app'`），按 §4.2 返回卡片内容，path 用 §4.1。

### S-02 · 阻断级 · 短码进入必然查不到

**位置**：`grouporder-client/src/pages/activity/detail.vue:137`

```js
onLoad((q: any = {}) => {
  // 支持分享短码进入
  activityId.value = q.id || q.activity_id || q.short_code || '';
});
```

随后 `load()` 固定以 `activity_id` 传参：

```js
act.value = await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }));
```

**问题**：注释声称支持短码，但短码被塞进了 `activity_id`。云端 `activityGetDetail` 是分支处理的——`params.activity_id` 走 `_getActivity`（按 `_id` 精确查），`params.short_code` 才走 `where({ short_code })`。4 位短码当 24 位 ObjectId 查，必然 `NOT_FOUND`。

**修复**：按 §3，分享统一用 `activity_id`。该行的 `q.short_code` 兜底应**删除**，避免留下一条永远失败的路径；若 D-083 选择保留短码入口，则必须分别判断参数类型并传对应字段，不能混用。

### S-03 · 功能缺失 · 落地页与管理页无分享入口

按 §5 补 M-13、M-20 两处入口。M-13 的参与者二次转发是扩散主路径。

### S-04 · 功能缺失 · `activityGetShareEntry` 从未被调用

云端已实现、`api/index.js:28` 已注册，但没有任何页面调用。按 §4.3 接入，作用是发卡片前的服务端状态复核。注意其中的 Promise 同步性提示。

---

## 8. 验收标准

- [ ] AC-SH-001 进行中活动，团长从 M-12 转发，好友点开**直接进入 M-13 接龙页**，标题与封面与活动一致
- [ ] AC-SH-002 团长从 M-20 转发，结果同上
- [ ] AC-SH-003 参与者从 M-13 二次转发，第三人点开可正常接龙
- [ ] AC-SH-004 **未登录**用户点开卡片可浏览商品、可加减数量；点「确认接龙」时才跳登录，登录后回到原活动且选择不丢
- [ ] AC-SH-005 草稿 / 审核中的活动，M-12 不出现分享按钮
- [ ] AC-SH-006 卡片发出后活动被截止 / 取消 / 下架，好友点开进入 M-13 并显示对应不可接龙提示，不可下单
- [ ] AC-SH-007 卡片发出后活动被删除，好友点开进入 M-26 不存在态
- [ ] AC-SH-008 分享路径中**不含** `short_code`
- [ ] AC-SH-009 未登录用户无法通过遍历 `short_code` 取到活动详情（方案 1：查询分支已移除，传 `short_code` 报 `INVALID_PARAM`）
- [ ] AC-SH-010 封面图为空的活动转发不报错（走微信首屏兜底）

---

## 9. 不在本版范围

朋友圈分享、小程序码与海报、H5 链接（理由见 §2）；分享次数统计与来源追踪（需新增字段与决策）；群 ID 维度的数据隔离。
