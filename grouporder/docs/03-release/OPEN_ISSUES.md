# 全项目待处理问题清单

- 文档状态：**活跃待办**。条目处理完即从本文删除，删空后本文才可归档
- 来源：2026-09-22 全面审查（`docs/` 全部文档 + `grouporder-client/src` 业务代码 + 7 个云对象 + `grouporder-admin` 覆盖抽查）
- 最近整理：2026-09-30（由 `03-release/OPEN_ISSUES.md` 改名迁入本层；已处理条目直接删除，不保留留痕）
- 性质：**跨层待办追踪**，不是产品事实。与 `00-product` / `01-ux` / `02-arch` 冲突时以后者为准
- 行号说明：以 2026-09-22 工作区文件为准，此后文档多次修改，部分行号已偏移，以文中引用的原文定位

> **为什么放在 `03-release/`**：§1.1 是密钥安全、§3 是代码阻断项、§4 列的是上线前的处理顺序——
> 这些都是上线前必须清掉的关卡，与本目录其余四份是同一件事。

- 级别：**严重** = 会导致实现错误 / 安全 / 资损；**中** = 含义不一致或过期；**低** = 措辞与格式

---

## 0. 核对基线（实测数字，供修文档时直接引用）

| 项                        | 实测值                                                                                 | 文档里出现过的错误值                                   |
| ------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------- |
| DECISIONS 现行决策条数         | 75 条（D-001～D-078，空缺 D-040 / D-047 / D-068）                                          | 根 README「72 条」                               |
| 云对象                      | 7 个，方法 92（activity 17 / order 9 / goods 9 / user 13 / export 3 / report 3 / ops 38） | 根 README「80 个方法」；CLIENT_BRIEF「47 个方法」「一个都没有」 |
| 公共模块 `grouporder-common` | 14 个                                                                                | 根 README「11 个」；ADMIN_BRIEF「8 个」              |
| 定时/回调云函数                 | 4 个                                                                                 | 一致                                           |
| 自建表 schema 文件            | 19 个，其中 `grouporder-ops-verify` 已废止，正文只定义 18 张                                      | DATA_MODEL「19 张」                             |
| client 业务页面              | 25 个，tabBar 已配置，登录方式已裁剪为 weixin + username                                          | CLIENT_BRIEF「业务页面为 0」「tabBar 未配置」            |
| admin 业务页面               | 16 个，A-03 工作台已改造                                                                    | ADMIN_BRIEF「后台业务页面为 0」                       |
| 提审自查清单条目                 | 46 项                                                                                | RELEASE_AUDIT_CHECKLIST 自述「45 项」             |
| `密钥.md`                  | **曾在提交 d928870 入库**，现已不再跟踪；`docs.backup-2026-09-22.tar.gz` **仍被跟踪**                 | docs/README 写「若已被提交过」                        |
| `mp-weixin.appid`        | 空字符串；manifest 无 `uniCloud` 字段                                                       | —                                            |

---

## 1. 文档层：跨文档的系统性问题（先修这一层）

这些问题不是某一份文档的孤立笔误，而是几轮大改后没有全文回扫留下的「同一规则两种说法」。按影响排序：

### 1.1 密钥与备份文件 —— 严重（安全）

- `密钥.md` 已在提交 d928870 入库过（现已不再跟踪，备份 tar 也已删除）。历史里仍有明文，`passwordSecret` / `tokenSecret` 必须轮换；根目录补 `.gitignore` 忽略 `密钥.md`、`*.tar.gz`；docs/README §5 的「若已被提交过」改为事实陈述

### 1.2 专业性（低，但量大）

- 内部协作术语进入正式文档：「云函数 session」「前端 session」「开发 Agent」「主控」「投喂」「喂什么」（CLOUD_API、DATA_MODEL、GOODS_LIB、OPS_ADMIN、ADMIN_BUILD_PLAN、根 README）
- 口语与情绪化：「幽灵待办」「徒增攻击面」「埋公式坑运营自己」「别指望」「踩坑」「造假数据」「切勿」「悄悄回来」「干脆」「硬骨头」「挡死」「这一刀」「不必纠结」「会被直接驳回」
- 修订过程写进正文（CLOUD_API:31-34、:212、:227 解释 v0.1 数错）
- emoji 作状态标记（🔴🟠🟡🔵⚪✅❌）遍布 KNOWN_ISSUES、README、CHECKLIST、CATEGORY_VERIFICATION
- 章节乱序：GOODS_LIB §2.1-2.3、§3.3-3.5；DATA_MODEL:200-209 编号 1,2,3,4,5,7,6
- 表格断裂：CLOUD_API:281-291 引用块插在表中间
- 不可测验收词：「适当」「合理」「适合打印」「清晰反馈」（PRD:54/269/322、OPS:232）
- 引用截图 `docs/app-ui/IMG_4872.PNG` 作设计依据（GOODS_LIB:444）

---

## 2. 文档层：逐文档补充清单（上文未覆盖的条目）

### 00-product

- [严重] OPS_ADMIN:345 限购描述缺「对同一商品」限定，可读成活动级总限购
- [中] DECISIONS:116/:44 vs :135「架构设计前」vs「开发前」核验类目；架构已完成而核验未做，触发条件已越过
- [中] DECISIONS:168「activity_review 为第 11 类」与 DATA_MODEL §10.8（1b）不符
- [中] OPS:161 引用 §4.4 应为 §4.5
- [中] OPS:109/:120「分配给本人」但全文无分配机制
- [中] OPS:399「原则上不提供」vs :518「明确不做」
- [中] PRD:47/:76 商品字段漏「封面图」（§5.3 与 D-041 必填）
- [中] PRD:383「默认不应」应为「不得」（D-016）
- [中] docs/README:32 写运营后台的阅读顺序把 90 层排在 00 层之前
- [低] DECISIONS:30-31 表头数百空格对齐而 D-073～078 未对齐；:62/:149「H-05」「H-02」未解释；:93/:168 与 OPS:408 引 ADM 编号（过程材料）
- [低] PRD:4/:241/:424-430 文档状态与 §13 下一步全部陈旧；:224「草案」；:375-376 名词短语无预期行为；:385 负面清单缺电子烟、色情赌博
- [低] OPS:4 状态、:7「事实来源 README.md」未指明哪一份、:59 逐字复制 D-069、:451 §14.2 验收未覆盖 D-072 核心行为

### 01-ux

- [中] UX_REVIEW_GATE:20/:121 追踪停在 D-056，D-057～D-078 共 22 条无追踪
- [中] UX_REVIEW_GATE:113 P1-08「首版不做」与 D-067 相反
- [中] UX_REVIEW_GATE:142「页面编号在三份文档中一致」当前不成立（M-27～M-31 在 STATE_MATRIX / REVIEW_GATE 无引用）
- [中] UX_REVIEW_GATE:79 商品治理漏 A-17；:209 引用不存在的「v0.3」
- [中] UX_STATE_MATRIX:23-34 缺「进行中活动改内容重新审核」行（D-048），套用现有行会让已下单参与者看不到订单
- [中] UX_STATE_MATRIX:154 事项名只说活动，触发含商品；:215 变更记录章节编号说明已过期
- [低] UX_STATE_MATRIX:177/:192「A-08～A-12」跨越已空缺的 A-11；分隔线不统一
- [低] UX_FLOW_SPEC:3、UX_REVIEW_GATE:216/:227「主控」；UX_FLOW_SPEC:242 口语；:261 语义不通

### 02-arch

- [中] DATA_MODEL:78 vs :647 uni-id-users 是否扩展两处说法不一；:186 unit 长度已定 10 仍写「待评审」；:466-471 重复 CLOUD_API 的接口表且出参不同
- [严重] DATA_MODEL:724 `content_version` 写 string，schema 与活动表为 int
- [严重] DATA_MODEL §6（:554-575）与 §10.10（:901-919）索引表与 `*.index.json` 不一致：缺 10 条（含 6 个唯一索引），:951 却声称「可机械校验」
- [严重] CLOUD_API:545 `reportConclude.pending_actions[]` 未定义结构；ops-co:627 对「下架商品」返回 `activityGovernanceOff`，应为 `goodsGovernanceOff`（代码 bug）
- [严重] CLOUD_API:101「后台业务码前缀 OPS_」与 errors.js:36-38 只给通用码加前缀不符
- [严重] DATA_MODEL:358 `todo_key` 示例 `report_closed` 应为 `report_result`；CLOUD_API:493/:500 `todoList.list[].type` 未枚举（代码 10 个）
- [中] DATA_MODEL:242 / CLOUD_API:462 自提 `consignee_address` 恒为空串，但 order schema 该字段 `minLength: 1`
- [中] CLOUD_API:197/:458 `export_versions_invalidated` 恒为 true 且为派生状态
- [中] CLOUD_API:454 `orderMyList`「按活动分组」实际按订单分页再页内分组，同一活动可跨页拆分；`items[]`、`activity{}` 字段未给
- [中] CLOUD_API:207/:469 `libList` 图片拦截同样不可选未写
- [中] CLOUD_API:546 `reportRecheck` 一个方法两套签名未写分流条件
- [中] CLOUD_API §11 多个 ops 方法 `list[]` 无字段定义（:542/:547/:550/:555-571）
- [中] CLOUD_API:91/:111/:115/:192/:222 引「§8.4」等不带文档名，与本文自身章节混淆
- [中] CLOUD_API:400「幂等键列为空表示只读」但写方法也为「—」
- [中] errors.js:78 未知异常映射为 INVALID_PARAM，前端会把服务故障当参数错
- [中] GOODS_LIB:504/:510 与 AC-GL-007、AC-AC-009「全部确认前不能提交发布」——确认状态只存前端，服务端无法校验，AC 不可验收
- [中] GOODS_LIB:671/:585 vs :726 index.json 改不改自相矛盾；:739 vs :581 分区拖拽；:597 vs DATA_MODEL:464 孤儿文件两表 vs 三表
- [中] GOODS_LIB:132/:355 vs DATA_MODEL:333/:380 必填标记不一致；DATA_MODEL:132/:184/:326 默认 `[]` 而 schema 无 defaultValue
- [低] CLOUD_API:17 表头「服务端」应为「职责」；:123/:128/:132 导出清单漏 `hasPermission`、`deductBatch`、`unblockLibByGoods`
- [低] DATA_MODEL:80 vs :107 日期不一致

### 03-compliance

- [中] CATEGORY_VERIFICATION:3/:7 头部 v0.1 / 09-14 vs 记录 v0.2 / 09-18；:143 变更记录提到的 `grouporder-ops-verify` 正文无
- [中] CATEGORY_VERIFICATION:5/:22/:30 与 RELEASE:157 引用已归档的 FEASIBILITY_REVIEW「B-01」「§7」不带路径
- [中] CATEGORY_VERIFICATION:20「先 H5 → 再 AppID」开发路径无对应 D-编号，RELEASE §九却以此为前提
- [中] CATEGORY_VERIFICATION:86-101 §4 全部「待填」，无负责人、无截止条件
- [中] RELEASE_AUDIT_CHECKLIST 各表仅「☐」，无核对人 / 日期 / 证据列
- [低] CATEGORY_VERIFICATION:47 注册地址疑误（应为 mp.weixin.qq.com）；:22/:44/:107 口语与不可核验承诺
- [低] RELEASE:18/:31/:54/:148 口语与未经证实断言；:22/:35/:58 标题带 🔴；表头首列为空

### 90-working / 99-archive / README

- [中] ADMIN_REUSE_MAP:125「A-02 验证与访问结果」二次验证已取消，应改名
- [中] 根 README:17-41 vs docs/README:13-20 分层口径不一致：CLOUD_API 在同一行既是「唯一事实源」又「不是产品事实」；根 README 把 UX/DATA_MODEL 放「产品事实」
- [低] 全文 emoji 状态标记；CLIENT_BRIEF:189 变更记录单格 250 字；:12-18 表格手工空格对齐；根 README:92 弯引号

---

## 3. 代码层

### 3.1 小程序端（grouporder-client）

**阻断级**

- [严重] `pages/hall/faqi.vue:23` `onShow` 无条件 `reset()`，从商品编辑 / 复用历史商品 / 商品库返回时表单、商品列表、草稿 id 全部清空，草稿留在服务端。违反 CLIENT_BRIEF §4「草稿表单状态不得丢失」
- [严重] 全工程无 `onShareAppMessage`；`pages/activity/publish.vue:35` `open-type="share"` 会分享团长自己的发布页；`activityGetShareEntry` 与 `short_code` 从未调用；`pages/activity/detail.vue:128` 把 `short_code` 当 `activity_id` 传，必然 NOT_FOUND。D-059 下分享是唯一传播入口
- [严重] `pages/hall/jielong.vue:140` 把服务端已分组的 `orderMyList` 结果再当订单分组一次，订单号 / 份数 / 金额全空，点订单 id 为 undefined
- [严重] `pages/order/detail.vue:13` `order.title || order.activity` 渲染出 `[object Object]`；`:61` `order.activity_id` 不存在，「修改订单」跳转参数为空
- [严重] `src/manifest.json:53` `mp-weixin.appid` 为空；无 `uniCloud` 字段；client 工程 `cloudfunctions/` 为空目录，全部云对象在 admin 工程，两工程是否绑同一空间仓库内无证据

**功能缺陷**

- [中] 「修改订单」实际是重新下单，`orderUpdate` 从未调用，语义与 D-025 不符
- [中] `pages/activity/export.vue:313` 读 `file_version`，服务端返回 `versions[]`；下载只复制链接到剪贴板，微信内打不开 xlsx（应 `downloadFile` + `openDocument`）
- [中] `api/client.js:101` 网络错误无 errCode 被归一为 INVALID_PARAM，下单超时不进 M-26「结果未知」
- [中] `common/grouporder/request.js:52` `onUnauthenticated` 无去重、不清 token；`my.vue` 并发两请求会连续压入两个登录页
- [中] `jielong.vue` 开了 `enablePullDownRefresh` 但内容在固定高 `scroll-view` 里手势被吃掉；`loadCurrent()` 不返回 Promise，`stopPullDownRefresh` 立即执行
- [中] 所有列表 `pageSize` 硬编码 50/100，无分页与加载更多
- [中] `cover_image` / `images` / `detail_images` 无任何 `chooseImage` / `uploadFile` 入口，D-058 图片检测与提审 4.7 封面图无输入源
- [中] 「注销账号」走 uni-id-pages `closeAccount()`，`privacyRequestSubmit` 无页面触发，D-035/D-056 留存规则未接入
- [中] `activity-form.vue:54` 截止时间只选日期、时间固定 18:00 不可改；不选日期时静默默认 +3 天
- [中] `goods-manage.vue:184`「调库存/限购」只能改库存
- [中] `detail.vue` 不显示交付方式（`DELIVERY_TYPE` 已 import 未用）；步进器不校验每人限购；无分享按钮
- [低] `api/index.js` 把 38 个 ops 方法打进小程序包；所有业务 import 用 `@ts-ignore` + `any`；各页各写 `toLocaleString`；tab 图标是 Unicode 字符；`uni-id-pages/config.js:34-35` 协议地址仍为 `https://xxx`；无首次使用协议弹窗；无 `__usePrivacyCheck__`
- [低] `my.vue`「修改密码」对无用户名账号也显示；「隐私说明」只是 modal 文字；`appeal.vue` 要求用户手输「目标平台账号标识」

### 3.2 服务端云对象（6 个客户端对象 + grouporder-common）

鉴权基线良好：uid 全部从 token 取，`requireLeader` 每次重读活动比对 `leader_uid`，19 张业务表 `read/create/update/delete` 全为 false，D-016 敏感字段裁剪未发现漏洞。问题集中在并发与存储：

**严重**

- `grouporder-export-co/index.obj.js:263-279` + `exportlog.js:46-50`：阿里云内置存储 fileID 本身是公网 https 地址且默认公开读，`listGenerate` 把它作为 `file_version` 回给客户端，等于给含全部姓名电话地址的 Excel 发永久公开链接，D-071 形同虚设；且 `exportlog.write` 的 https 兜底会把 `file_version` 改写成 `[已屏蔽]`，`listDownload` 永远 NOT_FOUND。**需立即在真实空间验证 `uploadFile` 返回值**；建议改走 `ext-storage` 私有目录，`file_version` 存自定义批次号
- `grouporder-order-co/index.obj.js:206-212, 444-447` + `stock.js:73-97`：限购是「聚合求和 → 比较 → 写入」先查后写，并发两单可突破每人限购。建议 (activity_id, goods_id, user_id) 计数文档 + 条件 `inc`
- `grouporder-order-co/index.obj.js:408-500` `orderUpdate` 非原子无闸门：先 deduct/restore 再 remove 全部明细逐条 add，任一步失败留下库存已变、明细为空；并发两次 update 重复 restore 可把 `sold_qty` 打成负数。建议订单 `version` 条件更新抢闸门 + 差量更新明细
- `grouporder-order-co/index.obj.js:236-263` + `idempotent.js:85-92`：订单号 `YYMMDD-短码-4 位随机`，每活动每日仅 1 万取值，100 单/日撞唯一索引概率约 40%，撞上后原生 DB 错误直接出到客户端。建议扩到 6-8 位随机 + 冲突重试
- `grouporder-export-co/index.obj.js:100-108` `_collect` 订单 `limit(600)`、明细 `limit(2000)`，超出静默丢弃，清单缺行团长会漏发
- `errors.js:76` `normalize` 对任何带 errCode 的异常原样透传，DB/存储内部错误文本（表名、索引名）泄漏到客户端；`goods-co:331` 把 `e.message` 塞进 `failed[]`

**中**

- `order-co:191-196` 幂等键预查不带 `user_id`，可用他人键取到他人订单信息；唯一索引全局可被占键
- `order-co:265-273` 订单落库后逐条 add 明细，中途失败不回滚
- `stock.js:23-25` `deduct` 上限取内存旧值，团长并发改小库存后仍按旧值放行
- `activity-co:444-448, 468-473, 224-232` close/cancel/submitReview 用 `doc().update` 不带当前 status 条件，与定时任务并发时后写覆盖
- `activity-co:260-271` + `review.js:46-56` 曾进行中的活动可撤回到 DRAFT，带订单却不可见、不被 autoclose 扫描、可无原因取消
- `activity-co:300-302` 已下单参与者在活动退回审核中期间访问详情得 FORBIDDEN
- `activity-co:834-853` `goodsDelete` 不检查治理下架，可物理删除被平台下架的商品；`canDelete` 与 `orderCreate` 有竞态窗口
- `order-co:468-476` 改单时未改动的明细也按当前价重新快照
- `snapshot.js:20-45` 内联姓名电话地址只 trim 无长度格式校验
- `order-co:43-53` / `activity-co:666-668` qty / price / total_stock / per_user_limit 无上限
- `activity-co:117-125, 139, 179-182` `end_time` 未校验整数（字符串可落库，autoclose 查不到）；图片数组元素未校验
- `order-co:297-298, 660` / `activity-co:392-397` / `report-co:134` `filters.*` 原样进 where 无白名单
- `grouporder-check-callback/index.js:19-37` HTTP 回调无签名校验，凭 trace_id 即可触发治理下架
- `order-co:534, 575` 终态后逐条 restore 抛错即库存永久虚占
- `activity-co:563-574` `activityCopy` 幂等以「同团长 + 同标题 + 60 秒」判定，会误判有意复制
- `grouporder-report/bind-appeal/privacy-case.index.json` 缺 `reporter_uid` / `applicant_uid` / `target_uid` 索引，多个方法全表扫描
- `order-co:97, 313-314, 671-672` 明细 `limit(500)` 静默截断
- D-079 落地：`common/grouporder-common/review.js` `canEditContent` 目前放行审核中，需对 `status === REVIEWING` 返回 false，并让 `_assertEditable` 抛新错误码 `ACTIVITY_REVIEWING`（errors.js 补码）；`activityUpdatePickup` 同样要拒绝审核中；`onContentChanged` 的 REVIEWING 分支随之成为不可达，可删
- D-080 落地：`activity-co` `activityCopySourceList` 去掉 `status in [ONGOING, CLOSED, CANCELLED]` 过滤，`activityCopy` 去掉 DRAFT/REVIEWING 拒绝分支，只保留治理下架与非本人两项校验；客户端 `pages/lib/history-activity.vue` 对进行中与审核中的源都要提示「将创建新草稿」

**低**

- `errors.js:78` 未知异常映射 INVALID_PARAM，需 SYSTEM_ERROR；`idempotent.js:71-79` shortCode 先查后插
- `activity-co:607-634, 968-970` / `goods-co:485-487` / `order-co:265-268` 循环单条写最多 50 次 RTT
- `contentcheck.js:104-153` 每商品串行检测
- `user-co:529-530` `todo_key` 无格式限制；`:254` `target_account_uid` 无校验；`:114-133` 地址条数无上限
- `paging.js:15-20` page 无上限
- `grouporder-activity/order.index.json` 排序列缺 create_date
- `state.js:65` 不可达分支；`order-co:406` 注释与行为不符；`auth.js:44-55` 未处理 token 续期载荷
- `report-co:56-59, 148-149` 可对草稿/审核中活动举报并拿到标题
- 非业务表 `opendb-banner` / `opendb-news-*` / `opendb-search-*` 为 uni_modules 模板遗留且 `read: true`，未使用应删除
- D-081 落地：`activity-co` `activityCreateDraft` / `activityCopy` 读必填 `idempotent_key`，按 `grouporder-activity.idempotent_key` 唯一索引判重并返回 `duplicated: true`；删除 `activityCopy` 的 60 秒同名判重；客户端 `activity-form.vue` `ensureDraft` / `saveDraft` 与 `history-activity.vue` `doCopy` 为每次意图生成一次键并在重试时复用
- D-082 落地：`ops-co` `reportConclude` 结论 3～6 时在同一请求内调用与 `goodsGovernanceOff` / `activityGovernanceOff` / `publisherRestrict` 相同的公共逻辑，出参改 `executed_actions[]`，失败整体回滚；原 :627 返回 `activityGovernanceOff` 的错误方法名随之删除

### 3.3 运营后台（grouporder-admin）—— 仅做覆盖抽查，另含 D-078 落地待办

- 16 个业务页面已存在，统一走 `common/grouporder/ops-co.js` 的 `callOps` / `callOpsList`，鉴权错误引到 A-02 结果页，封装层设计与 client 端对称
- 页面直接点名调用的 ops 方法 14 个；列表页通过 `callOpsList` 传方法名，本次未逐页验证 24 个列表/治理方法是否全部接线，建议单独做一轮
- [中] D-078 落地：`uniCloud-alipay/database/uni-id-roles.init_data.json` 删除 `ops-content` / `ops-privacy` / `ops-auditor` 三条，只保留 `admin` 与 `ops-super`
- [中] D-078 / D-072 落地：`pages/system/user/list.vue` 目前隐藏手机号、邮箱两列，需恢复展示；角色列映射改为单一「运营账号」
- [低] `uniCloud-alipay/database/` 下 `grouporder-activity` / `grouporder-bind-appeal` / `grouporder-report` 三份 schema 的字段描述与 `docs/02-arch/schema/` 副本同步（去掉「首页列表」、角色名改「运营人员」）

---

## 4. 建议处理顺序

1. **安全与不可逆项（当天）**：轮换 `passwordSecret` / `tokenSecret`；`git rm --cached` 备份 tar 与确认密钥文件不再跟踪，根目录加 `.gitignore`；删除两处 `grouporder-ops-verify` schema/index；在真实服务空间验证 `uploadFile` 返回的 fileID 是否公网可读，决定 export-co 改造方案。
2. **文档收尾**：三份 UX 文档回扫完成后重做 UX_REVIEW_GATE §7 自审；§1.2 措辞与格式整理放最后一次做。
3. **服务端并发三件事**：限购计数文档 + 条件 inc；`orderUpdate` 版本闸门 + 差量明细；订单号扩位 + 冲突重试。随后补 `errors.normalize` 白名单与 `filters` 白名单。
4. **小程序四个阻断项**：faqi `reset` 时机、`onShareAppMessage` + `short_code` 落地、「我参与的」分组、订单详情字段。都是局部改动。
5. **D-078 代码落地与前置配置**：角色初始数据、A-15 列显示与角色映射；AppID、服务空间绑定证据、协议地址、隐私弹窗。
6. 其余中低项按文件归并处理；格式与措辞整理放最后一次做，避免与规则修订产生冲突 diff。
