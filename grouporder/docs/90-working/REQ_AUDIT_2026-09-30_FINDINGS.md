# 审核发现附录 A

- 快照：2026-09-30；与主报告配套。本文收录严重与高级别问题的详述、全部中低级别问题、审核期间已被处理的项、被复核驳回的疑似项，以及覆盖说明。
- 每一项都已按当前工作区做过现状复核；文档与代码仍在被修改，使用前请以文件现状为准。

## 1. 功能未制定完善：严重与高级别详述（38）

### 账号与登录

#### U-05 · 高 · 微信验证重设密码缺页面接口与机制

- 主题：账号与登录；类型：未制定完善；状态：仍成立·未登记；独立发现者：7
- 事实：D-030 与 UX M-05、M-06、F-M02 要求：已绑定微信的账号通过微信身份验证重设密码；平台账号登录后可发起绑定微信。CLOUD_API 只写「M-02～M-06 由 uni-id-co、uni-id-pages 现成页面承担」。uni-id-co 只有 resetPwdBySms 与 resetPwdByEmail，没有微信验证重设；D-029 与 D-069 又不启用短信和手机号。小程序端 pages.json 没有 M-06 页面，bind.vue 只有「设置用户名密码」和「账号绑定申诉」，没有发起绑定的按钮，也没有解绑入口；bindStatus 之外没有绑定相关云对象方法。此外「设置用户名密码」给仅微信用户增加用户名密码，文档从未规定这条路径（文档只规定平台账号绑定微信、微信身份与注册账号并存时的冲突规则），且 set-pwd 页只设密码，不产生用户名。
  - `docs/00-product/DECISIONS.md:51` 「并可通过微信身份验证重设密码」
  - `grouporder-client/src/pages/account/bind.vue:36` 「const setPwd = () => uni.navigateTo」
- 现状核对：D-030 承诺微信验证重设密码，当前文档和代码仍无对应方法与页面，OPEN_ISSUES 未登记。
- 影响：忘记密码的绑定用户没有任何找回路径，D-030 的核心承诺落空；绑定与解绑没有入口，M-05 只能展示状态。
- 建议：补一份账号恢复与绑定的接口和页面规格：微信 code 校验后重设密码的云对象方法、发起绑定的页面与失败态；明确「仅微信用户是否可补设用户名」，不规定则删除 bind.vue 的该按钮。
- 需拍板：M-03 上“微信验证重设密码”入口如何处理？A：始终显示，用户点击后用微信身份验证，若该微信没有绑定账号则提示“该微信未绑定任何账号”；B：只有输入用户名后系统确认该账号已绑定微信才显示（会暴露用户名是否存在与绑定状态）。

#### U-16 · 高 · “业务数据”“身份核验”口径仍无定义

- 主题：账号与登录；类型：未制定完善；状态：仍成立·未登记；独立发现者：5
- 事实：OPS §4.7、§9.1 大量使用“已存在业务数据”“身份核验”，全库 grep“业务数据”“身份核验”均无定义（只有“收货电话不用于身份核验”这一条反向限制）：①业务数据的范围——代码 appealDetail 把“做过团长发起的任意活动（含草稿）或有任意订单”视为有数据，不含地址簿、商品库，此口径来自实现而非文档；②身份核验的方式、材料与合格标准——运营只需在 identity_verify_result 中填一段文字，没有规定可接受的证据；③“重新绑定”的目标平台账号如何确定——小程序 M-07 要求用户手填“平台账号标识”（内部 _id，用户无从获知），文档没有规定用户名/证明材料；④“解绑”的对方账号是谁、双方均有数据的判定如何适用于只有一个账号的解绑；⑤解绑后该微信身份下次登录是创建新账号还是无法登录；⑥申诉重复提交口径（代码：同一用户存在待处理/处理中申诉即返回旧记录）。
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:147` 「是否已存在业务数据」
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:150` 「两个账号均有业务数据时不受理绑定冲突申诉」
- 现状核对：OPS 文档仍只使用“业务数据”而无范围定义，DECISIONS 无该词定义，OPEN_ISSUES 与 ADMIN_KNOWN_ISSUES 均未登记。
- 影响：不同运营对“核验通过”标准不一，可能把他人账号的微信身份改绑；用户根本无法填对目标账号；有无数据的判定随实现变化，直接决定申诉能否受理。
- 建议：在 OPS §9 增补：业务数据的精确定义（建议列出：作为团长的活动、订单、商品库、地址簿等哪些计入）；可接受的身份核验方式与最低证据；目标账号指定方式（如用户名而非内部 ID）；解绑后微信身份的去向；每种申诉类型的双方账号指代。
- 需拍板：“已有业务数据”按哪个口径判定？A：仅活动（含草稿）与订单；B：再加地址簿、商品库；C：仅已发布活动与有效订单。身份核验，运营可接受的依据是什么（例如让用户在小程序内用两个账号各完成一次登录确认，还是线下沟通即可）？

#### U-18 · 高 · 绑定申诉核验标准与状态迁移未定义

- 主题：账号与登录；类型：未制定完善；状态：仍成立·未登记；独立发现者：4
- 事实：1) appealSubmit 的 target_account_uid 是客户端传入的原始字符串，appeal.vue 让用户手填「要绑定到的平台账号标识」；文档只说「目标平台注册账号」，没有说用户凭什么知道对方账号 id，服务端也不校验该 id 存在、不等于本人。2) OPS 只写「符合规则时执行解绑或重新绑定」，没定义重新绑定的方向：代码把申请人账号上的微信身份移到 target 账号，并清空申请人账号的微信字段。3) 解绑时代码直接清空 wx_openid，不检查申请人是否有用户名密码；仅微信登录的账号解绑后无任何登录方式。文档未规定拒绝或提示。4) 状态 2「处理中」只在文档枚举里出现，用户侧与运营侧代码都没有把 1 置为 2 的动作，也无触发者。5) 微信身份摘要格式未定义，代码取 openid 前 4 后 4 位，运营是否够用于核验未说明。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:26` 「APPEAL_STATUS = { PENDING: 1, HANDLING: 2」
  - `grouporder-client/src/pages/account/appeal.vue:18` 「要绑定到的平台账号标识」
- 现状核对：APPEAL_STATUS.HANDLING 仍只在常量和查询中出现，OPEN_ISSUES 未登记申诉相关问题；目标账号标识与解绑前置条件仍未规定。
- 影响：用户无法操作重新绑定（不知道目标账号 id）；运营可能把仅微信账号解绑成无法登录；「处理中」状态永远不会出现，D-070 待办与状态展示对不上；用户可指向任意他人的 uid，让运营端展示他人账号信息。
- 建议：补 OPS 9：申请人/目标的角色定义、目标账号用用户名而非内部 id 标识、解绑前置条件（至少保留一种登录方式）、1→2 的触发动作（打开详情即认领或显式按钮）、摘要格式。
- 需拍板：双方均有业务数据的账号想申诉时：A) 在 M-07 提交时就拦截，不创建申诉记录。B) 允许提交，由运营受理时拒绝并给出原因。运营核验身份时，以什么信息为准（例如用户描述的最近订单、创建时间、注册用户名）？

#### U-32 · 高 · 绑定时存活账号与业务数据处置未定义

- 主题：账号与登录；类型：未制定完善；状态：仍成立·未登记；独立发现者：2
- 事实：D-030/PRD 5.1 规定绑定后“两种登录方式进入同一平台用户”，并把“微信身份”和“平台注册账号”当作两个各自可能有业务数据的对象（D-031）。但按 uni-id 模型，微信登录用户与用户名注册用户是两条 uni-id-users 记录（两个 uid）。文档没有规定：绑定时保留哪个 uid；被舍弃的那条记录如何处理（删除、停用或保留孤儿）；“单方已有数据且满足绑定”时数据在哪一方，绑定后用户用哪种方式登录能看到这份数据；“双方都无数据”时如何处理。STATE_MATRIX 只写“确认绑定，禁止迁移归属”。UX_FLOW F-M02 写“平台账号登录后发起绑定”，STATE_MATRIX 写“仅微信身份”用户“注册平台账号后按规则绑定”，两处的发起方向没有统一。运营侧代码 appealResolve 的“重新绑定”把 openid 从申诉人转到目标账号，若申诉人有数据而目标无数据，微信登录之后落在空账号，原数据无入口可见。全库 grep 关键词“存活”“主账号”“保留账号”“孤儿”，无定义。
  - `docs/00-product/DECISIONS.md:52` 「首版不自动合并，也不允许直接绑定」
  - `docs/00-product/DECISIONS.md:51` 「绑定后两种登录方式进入同一平台用户」
- 现状核对：DECISIONS 只有 D-030/D-031，无“存活/主账号/孤儿”定义，未在待办清单登记。
- 影响：绑定功能按不同理解实现，会出现两个 uid 合并时业务数据不可见或丢失入口，或与“不合并不迁移”互相冲突；验收无法判定绑定后的数据归属是否正确。
- 建议：在 DECISIONS 新增一条绑定语义：明确存活 uid（建议保留有业务数据的一方，双方均无数据时保留发起绑定的平台注册账号）、被舍弃记录的处置方式、单方有数据时的绑定后登录效果；统一 F-M02 与 STATE_MATRIX 的发起入口，再同步 PRD 5.1、CLOUD_API 与 appealResolve 的方向定义。
- 需拍板：单方有数据时如何绑定？A：只允许把微信身份绑到「有数据的账号」上，空账号作废；反向（微信账号有数据、用户名账号为空）一律拒绝，提示继续用微信账号并给它补设用户名密码。B：首版只有「两边都没有业务数据」才允许绑定，任何一方有数据都拒绝并提示分别使用。另请定义「业务数据」是否包含草稿、已取消订单、地址簿、商品库。

### 活动生命周期

#### U-01 · 高 · 进行中活动改内容后的重审：状态迁移、订单去向、撤回与驳回去向、到期处理均未定义

- 主题：活动生命周期；类型：未制定完善；状态：仍成立·已登记；独立发现者：14；登记位置：OPEN_ISSUES.md:170, :77
- 事实：PRD/D-048 规定进行中活动改文字或图片后重新审核，期间外部不可访问、不可分享。DATA_MODEL §5.1 的状态图没有「进行中→审核中」迁移，代码 state.js 的 ACTIVITY_TRANSITIONS 也不允许，但 review.applyContentChange 直接把 ONGOING 改成 REVIEWING，绕过了迁移校验。此时活动可能已有有效订单。三个问题文档均无答案。(1) 重审被驳回时 reviewSubmit 把状态置为 DRAFT，活动带着有效订单回到草稿，此时截止时间到了怎么办。autoclose 只扫 REVIEWING 和 ONGOING，不扫 DRAFT，草稿活动永不自动截止，订单无法履约，也不会写 retention_expire_date。(2) 重审期间参与者能否缩单或取消订单。D-043 写「不可下单」，代码 assertActivityShrinkable 只看 CANCELLED、CLOSED 和 end_time，不看 status，REVIEWING 与 DRAFT 都放行缩单和取消。(3) 重审期间已有订单是否计入统计和清单。已 grep 关键词「重新审核」「重审」「再次审核」，DECISIONS、DATA_MODEL、UX_STATE_MATRIX 中仅有触发规则，无上述结果规定。DATA_MODEL 527 行只规定「审核中到期直接已截止」，对「曾进行中、已有订单的重审」没有区分。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/review.js:46` 「if (activity.status === ACTIVITY.ONGOING) {」
  - `docs/03-release/OPEN_ISSUES.md:170` 「曾进行中的活动可撤回到 DRAFT，带订单却不可见、不被 autoclose 扫描」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/review.js:38` 「进行中：退回审核中，审核通过前暂停接龙（D-048）」
  - `docs/03-release/OPEN_ISSUES.md:77` 「缺「进行中活动改内容重新审核」行（D-048）」
- 现状核对：review.js 仍直接 ONGOING→REVIEWING；OPEN_ISSUES 已登记撤回到 DRAFT 后订单不可见、autoclose 不扫描，及 UX_STATE_MATRIX 缺行，但规则未定。 （已合并 2 个重复项）
- 影响：曾有订单的活动被重审驳回或撤回后成为永不截止的草稿：订单库存被占用，清单出不了，留存期不起算。开发者对重审期间能否缩单、订单是否计入统计会各自实现出不同结果。
- 建议：补充「进行中→审核中」迁移及其回退目标。建议：已有有效订单的活动，重审驳回或撤回后回到进行中并沿用上一已通过内容版本（或明确定义为暂停态），到期照常自动截止，autoclose 覆盖该状态。同时规定重审期间参与者缩单、取消与统计口径，并让 assertActivityShrinkable 与 D-043 一致。
- 需拍板：进行中且已有订单的活动改了文字或图片，需要重新审核。请回答：A) 已有订单保持有效，参与者仍可查看、缩减、取消，仅暂停新增和扩大；重审被驳回或撤回时回到「进行中」，沿用上一次通过的版本；活动到期正常截止。B) 现行做法：被驳回或撤回就退回草稿，那么草稿的到期、库存释放、订单是否作废、注销拦截都要另行规定。C) 进行中的活动禁止改文字和图片，只允许改价格和库存。选哪个？

#### U-06 · 高 · 进行中活动重审在自动审核模式下规则未定义

- 主题：活动生命周期；类型：未制定完善；状态：仍成立·未登记；独立发现者：7
- 事实：D-048 只说「修改内容后重新进入审核，审核通过后才重新开放」；D-057 的自动模式规则只写在「提交审核时」（固化 review_mode、内容检测通过即进行中）。文档没有说明进行中→审核中的重新审核是否也走自动模式、是否重新做文本检测、是否重新固化 review_mode。代码里 applyContentChange 只把状态改为审核中并清空 review_result/review_uid，没有调用 contentcheck.checkOnSubmit，也不重写 review_mode，没有任何自动放行分支；活动因此一律停在审核中，等运营人工通过。而 ops-co 的待审队列直接列出所有 status=审核中的活动，OPS §4.3 却写自动模式下队列只含检测命中的活动。另外 activityUpdateDraft 先 update(patch) 再调 applyContentChange，两次写库之间新内容仍以「进行中」对外可见，D-043 要求审核通过前不对外展示。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/review.js:43` 「async function applyContentChange (ctx, activity) {」
  - `docs/00-product/DECISIONS.md:67` 「修改活动或商品的文字、图片等内容后重新进入审核」
- 现状核对：applyContentChange 仍只改状态为审核中，不送检、不自动放行；D-048/D-057 未说明重审是否走自动模式，OPEN_ISSUES 仅有D-079/D-080落地项，未登记此项。
- 影响：平台设为自动审核时，团长每改一次标题或商品名，进行中的活动就暂停接龙并进入运营人工队列，与「自动模式只审命中项」冲突；两位开发者会分别实现成「沿用当前模式」或「一律人工」，重审期间的接单停摆时长不可预期。
- 建议：需产品裁定后写入 D-048 或 D-057：重审是否按重审提交时刻的 review_mode 走自动放行、是否重新固化 review_mode、是否重跑文本检测。裁定后 applyContentChange 应与 activitySubmitReview 复用同一段送检与放行逻辑，并保证内容更新与退回审核中同为一次原子写入。
- 需拍板：进行中的活动改动文字或图片后重新审核，怎么处理？A：视同新提交，按当前审核模式重新固化并做内容检测，自动模式可自动放行；B：无论哪种模式都进入人工待审队列。另外重审不通过时，活动是退回草稿（订单保留但参与者不可见）还是恢复到修改前的版本继续进行？

#### U-33 · 高 · 过期草稿无法改截止时间，草稿卡死

- 主题：活动生命周期；类型：未制定完善；状态：仍成立·未登记；独立发现者：2
- 事实：activitySubmitReview 在 end_time 已过时提示「截止时间已过，请先修改截止时间」；UX F-M03 也写「截止时间无效阻止提交」，PRD 8.2 写「截止时间晚于当前时间时可以提交」，隐含允许改期后再提交。但 activityUpdateDraft 先调 _assertEditable，其调用的 canEditContent 对任意状态只要 now >= end_time 就返回 false，直接抛 ACTIVITY_CLOSED「活动已截止，不能再修改内容」。因此草稿（UX 还设置了「草稿超 24 小时未提交」的待办）过了截止时间后，既不能改期，也不能提交，只能取消。D-048 只写「活动截止前允许团长编辑」，并没有说明从未发布的草稿是否受该限制。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/review.js:73` 「if (activity.end_time && now >= activity.end_time) return false」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:65` 「async _assertEditable (activity) {」
  - `docs/03-release/OPEN_ISSUES.md:183` 「D-079 落地：`common/grouporder-common/review.js` `canEditContent` 目前放行审核中」
- 现状核对：review.js canEditContent 仍对任意非终态只要 now>=end_time 返回 false，_assertEditable 据此拦截草稿改期；OPEN_ISSUES 的 D-079 待办只改审核中分支，未涉及草稿过期。
- 影响：团长隔天回来提交草稿，看到的是「请先修改截止时间」，点修改又报「活动已截止」；提交主流程走不通，且用户只能取消草稿重来。
- 建议：需产品明确：从未发布过的草稿不受「截止」约束，允许修改 end_time（canEditContent 仅对进行中、审核中的已发布活动按 end_time 判定），或明确过期草稿只能取消或复制。
- 需拍板：截止时间已过的草稿：A) 允许团长修改截止时间后继续提交发布；B) 不允许再改，只能取消或用「复用历史接龙」复制成新草稿。请选 A 或 B。

### 商品库与复用

#### U-19 · 高 · 活动级治理下架不封禁其商品的库记录

- 主题：商品库与复用；类型：未制定完善；状态：仍成立·未登记；独立发现者：4
- 事实：D-064 规定“运营对商品执行治理下架时”反查并封禁商品库记录，理由是防止违规商品从商品库无限复制。D-067 又说“不设此约束将形成与 D-064 同类的绕过路径”，只对“复制历史接龙”排除了被下架的活动。但结论 4（下架整个活动）走 activityGovernanceOff，代码 _governanceOff 仅在 isGoods 时调用 blockLibByGoods；图片回调命中活动图片、导致整个活动被下架时同样不封库。活动里的商品自身 governance_status 仍为 0，商品库记录 governance_blocked 仍为 0，可在 M-28 被选中复用。文档没有规定活动级下架是否要封禁其全部商品的库记录。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:296` 「if (isGoods) {」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:298` 「blockedLibIds = await goodslib.blockLibByGoods(」
  - `docs/00-product/DECISIONS.md:83` 「运营对商品执行治理下架时，反查发布者的商品库记录」
- 现状核对：ops-co 仅在 isGoods 分支调用 blockLibByGoods，活动级下架不封库；GOODS_LIB_SPEC 无活动级规则，OPEN_ISSUES 未登记。
- 影响：运营为了省事整活动下架后，其中违规商品仍能被团长从库里复制进新活动，治理被绕过；开发者按 D-064 字面实现就会留下这个洞。
- 建议：以 D-064 立意补规则：活动级下架时对其全部商品同样执行库记录封禁与恢复时解封，并在 CLOUD_API 写明；若产品认为活动下架不应连带封库，则需在 D-064 中明确说明该取舍。
- 需拍板：整个活动被治理下架时，该活动内商品对应的库记录怎么办？A) 全部封禁（恢复活动时一并解封）。B) 不封禁，只有单个商品被下架才封禁。C) 只封禁运营在下架时勾选的商品。

### 订单与库存

#### U-03 · 高 · 活动取消后订单、库存、统计快照规则未定义

- 主题：订单与库存；类型：未制定完善；状态：仍成立·未登记；独立发现者：8
- 事实：订单状态只有 有效/已取消/已作废 三值，PRD 5.4 把「有效」定义为未被参与者取消且未被团长作废，未提活动取消。D-052、PRD 8.4、OPS 11.3 要求已取消活动的订单「不计入当前有效统计」并展示「取消前统计快照」，OPS 11.3 更明确统计有效订单数时排除所属活动已取消的订单。D-015 却写「取消接龙返还库存」（含义是取消订单还是取消活动没有说清）。DATA_MODEL 全文没有「取消前统计快照」的存放位置或生成方式（已检索：统计快照、stat_snapshot、cancel_snapshot 均无）。实现：activityCancel 只改活动状态并盖留存日期，不改订单和明细状态，不返还 sold_qty。因此已取消活动下订单仍为有效，参与者端活动详情按 sold_qty 之和仍显示「有效总份数」，团长统计 orderLeaderStat 和运营 statOverview 都把它们计为有效（运营汇总未排除已取消活动，与 OPS 11.3 不符）。
  - `docs/02-arch/DATA_MODEL.md:155` 「取消原因。进行中活动取消时必填（D-027）」
  - `docs/00-product/DECISIONS.md:71` 「已取消活动的历史页面显示取消前统计快照及历史订单」
  - `docs/00-product/DECISIONS.md:36` 「取消接龙返还库存」
- 现状核对：DATA_MODEL 仍只有 cancel_reason，无取消前快照字段；OPEN_ISSUES 未登记活动取消对订单/统计的处理，D-015 措辞未改。
- 影响：已取消活动仍向所有访问者展示「有效总份数」，运营的团长汇总把已取消活动订单算进累计有效指标；快照要保存什么、何时生成没有规格，无法验收 PRD 8.4「标记清晰的取消前统计快照」。
- 建议：以 D-052、OPS 11.3 为准补规则：活动取消时是否写入快照字段（建议在活动上保存取消时刻的份数、订单数、金额）、订单和 sold_qty 是否保持原值，以及各处统计一律按「活动未取消」过滤；D-015 措辞改为「参与者取消订单返还库存」。
- 需拍板：活动被团长取消时：A) 订单与明细保持有效状态不变，统计与清单接口按「活动已取消」一律排除，历史页显示按取消当时聚合出的数字（需要新增字段存快照）；B) 取消时把全部有效订单批量置为一个新的终态「随活动取消」，sold_qty 回退，历史页读取订单本身。请选 A 或 B。

#### U-27 · 高 · 结果未知态缺查询契约，重试可能重复下单

- 主题：订单与库存；类型：未制定完善；状态：仍成立·已登记；独立发现者：3；登记位置：OPEN_ISSUES §3.1 (api/client.js:101，仅部分)
- 事实：状态矩阵与 UX 规定写操作结果未知时先锁定重复动作并查询结果，确认失败后才允许重新发起（M-26）。全库没有定义「查询订单结果」的接口或方式：CLOUD_API 只有 orderMyList（filters 仅 status、activity_id，无法按幂等键查）；orderCreate 再调一次虽会返回首次结果，但如果首次没有成功就会真的创建订单，不是纯查询。已检索关键词：结果未知、查询结果、orderQuery、按请求/对象查询，均只在 UX 文档出现。客户端实现：request.js 只把 STATE_CHANGED 映射为 unknown（该码含义是「状态已被他人修改」，不是结果未知）；网络异常被归一为 INVALID_PARAM 弹 toast；M-26 通过 uni.redirectTo 替换掉确认页，「重试」是 navigateBack，回到活动详情后重新进入确认页会在 onLoad 生成新的幂等键，等于放弃原请求的幂等保护，可能产生重复订单。
  - `grouporder-client/src/common/grouporder/request.js:36` 「STATE_CHANGED: RESULT_TYPE.UNKNOWN,」
  - `docs/02-arch/CLOUD_API.md:456` 「**`idempotent_key` 必传**，唯一索引拦截」
  - `docs/03-release/OPEN_ISSUES.md:139` 「下单超时不进 M-26「结果未知」」
- 现状核对：OPEN_ISSUES §3.1 只登记了网络错误被归一为 INVALID_PARAM；CLOUD_API 仍无按幂等键的只读查询方法，确认页重试重新生成幂等键的问题未登记。
- 影响：弱网下提交订单后，用户无法确认是否成功；按提示重试会得到第二张订单并再次占用库存，与 PRD 8.3「网络重试不产生重复订单」冲突。
- 建议：补充契约：提供按 idempotent_key 只读查询订单结果的方法（或规定 orderCreate 的 dry-run 语义），并规定未知态下的客户端行为：保留幂等键、留在确认页、先查询再放开重发。需要明确网络超时如何判定为「结果未知」。

#### U-38 · 高 · 多步写入中途失败缺补偿与对账机制

- 主题：订单与库存；类型：未制定完善；状态：仍成立·未登记；独立发现者：1；已独立复核
- 事实：DATA_MODEL §8.1 明确「不依赖数据库事务」，§4.4 要求订单状态变更时明细 status 同步「在同一操作序列内完成」，CLOUD_API 定义了 PARTIAL_FAILED，但没有规定订单、明细、库存的写入顺序，也没有规定中途失败时的补偿或对账。代码：orderCreate 先扣库存，写订单，再逐条 add 明细，明细失败无补偿，得到无明细订单并占库存。orderCancel 先带条件改订单状态，再逐条返还库存，再同步明细 status，中途失败则订单已取消而库存未还、明细 status 仍为 1，限购与团长统计按明细 status=1 仍计入。orderUpdate 先增减库存，再 remove 全部明细，再逐条写回，中途失败明细全丢，最后更新订单时不带状态条件。全库没有按有效明细重算 sold_qty 的任务，PARTIAL_FAILED 只在 goods-co 的 libCopyToActivity 使用，order-co 未使用。
  - `docs/02-arch/DATA_MODEL.md:617` 「不依赖数据库事务，跨云实现一致」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:548` 「await stock.restore(ctx, it.goods_id, it.qty)」
  - `docs/03-release/OPEN_ISSUES.md:159` 「任一步失败留下库存已变、明细为空」
- 现状核对：OPEN_ISSUES 仅涉及 orderUpdate 中途失败；orderCreate 无明细补偿、orderCancel 部分失败、缺 sold_qty 校准任务均未登记，DATA_MODEL 仍写不依赖事务而无写入顺序与失败语义。
- 影响：云函数超时或数据库抖动一次，就会留下库存虚占、订单缺明细，或已取消订单仍计入限购与统计。sold_qty 与明细之和之间没有校准手段，D-036『两者相等』无法保证。
- 两种合理但互不兼容的实现：甲：先写订单与明细，再占库存，失败时靠补偿或对账任务修复，接受短期不一致。乙：先占库存，任一后续写入失败就返回 PARTIAL_FAILED 并要求用户刷新，由运营手工修正。两者用户可见结果与运维需求不兼容。
- 建议：在 DATA_MODEL 8 补『多步写入失败语义』：约定写入顺序（先订单+明细再占库存，或占库存后失败必补偿到订单与明细），失败时返回 PARTIAL_FAILED 并让前端提示刷新；增加一个校准任务或运营工具，按有效明细重算 sold_qty 并修正明细 status。orderUpdate 的订单更新加状态条件。

### 收货与交付

#### U-04 · 高 · 治理下架后已有订单、清单导出与统计处理未定义

- 主题：收货与交付；类型：未制定完善；状态：仍成立·未登记；独立发现者：8
- 事实：OPS §6.1 只规定下架后禁止新建订单或扩大数量，且不删除订单与历史清单。D-019、D-050 只针对团长停售商品。未定义：商品被治理下架后，其已有明细是否进入截止后的导出清单；已截止且被下架的活动，团长能否生成或下载清单；参与者能否取消整单；这些订单是否仍算有效统计。代码 assertActivityShrinkable 注释借用 D-019/D-050 允许下架后缩小订单，export-co 与 activity-co 全部没有 governance_status 判断，等于静默决定“下架不影响导出”。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:216` 「if (g.governance_status === 1) marks.push('已下架')」
  - `docs/03-release/OPEN_ISSUES.md:172` 「goodsDelete 不检查治理下架」（当前文件中未找到该引文）
- 现状核对：OPEN_ISSUES 仅登记 goodsDelete 与 ops-co 下架相关 bug，未登记导出/取消/统计口径；export-co 仅在第216行加“已下架”标记，仍无规则决策。
- 影响：违规商品下架后，团长仍可能把它导出进配送清单，履约照旧；或者相反被误拦。两种做法都无依据。
- 建议：新增决策：明确治理下架商品与活动对清单导出、订单取消、有效统计的影响，并同步 UX_STATE_MATRIX 与 export-co。
- 需拍板：活动被平台治理下架后，团长还能生成和下载该活动的清单吗？A. 可以（履约要用，只禁止新订单）；B. 不可以（下架期间清单一律拒绝，恢复后可用）；C. 只能下载已生成的版本，不能重新生成。

### 清单与导出

#### U-20 · 高 · 导出汇总单价口径不一且超限静默截断

- 主题：清单与导出；类型：未制定完善；状态：仍成立·已登记；独立发现者：4；登记位置：OPEN_ISSUES:161（仅覆盖 limit 截断，单价/单位口径未登记）
- 事实：D-053 只规定商品汇总每商品一行，没有规定单价列在中途改价后的取值，也没有规定中途改单位后的展示。导出代码商品汇总的「单价」用 goods 当前价、金额用明细快照求和，改价后 单价×份数≠金额；统计聚合用 $first 取明细的单位快照，同一商品混有两种单位时被并成一种。另外 D-024 规定单活动 500 人、50 商品、每人可多单，导出代码对订单 limit(600)、明细 limit(2000)、商品 limit(60)，超出部分被静默丢弃且不报错，文档没有规定超限行为。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:92` 「price: g.price,」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:102` 「.limit(600).get()」
  - `docs/03-release/OPEN_ISSUES.md:161` 「超出静默丢弃，清单缺行团长会漏发」
- 现状核对：超限截断已登记于 OPEN_ISSUES:161；但单价取当前价、多单位合并的口径问题未登记，代码 92 行仍取 g.price。
- 影响：500 人每人一单且多商品时，清单静默缺行，团长线下漏发货；改价后汇总行数字无法自洽。
- 建议：补规则：汇总单价列的口径（建议按价格分组或标注区间）、多单位处理，以及超出容量时分页读取而非截断。
- 需拍板：商品汇总遇到同一商品多个价格或单位时怎么办？A 按“价格+单位”拆成多行；B 只显示当前价和单位，并在备注列提示“含历史价格”；C 汇总不显示单价，只显示份数与预计金额。

#### U-28 · 高 · 清单版本号语义不统一，重复生成无幂等

- 主题：清单与导出；类型：未制定完善；状态：仍成立·未登记；独立发现者：3
- 事实：D-073 写『清单版本号由团长的订单变动驱动（作废一张订单即 v3→v4）』，原型 A-13 也是『团长作废 1 张订单，清单版本由 v3 变为 v4』，即版本=数据口径版本。D-071④ 与 CLOUD_API 则说 file_version 是文件版本/云存储 fileID，代码中每次调用 listGenerate 都上传新文件并写一条 GENERATE_OK，version_no 靠列表位置推算（versions.length - i，且只取最近 50 条）。于是团长连点两次『生成清单』，无作废也产生两个版本、两份含个人信息的文件，与 D-073『运营触发重新生成会污染版本序列』的担心同一性质，只是触发者换成团长。UX_STATE_MATRIX 写『生成中：禁止重复创建同版本任务』，CLOUD_API 14.5 的 listGenerate 幂等键为『—』，代码无任何锁或复用。全库 grep『file_version』『version_no』『版本序列』，没有定义版本号如何分配、数据未变时重复生成是复用旧版本还是新建、超过 50 条后版本号如何计。
  - `docs/00-product/DECISIONS.md:91` 「清单版本号由团长的订单变动驱动（作废一张订单即 v3→v4）」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:176` 「version_no: versions.length - i,」
- 现状核对：D-073 仍写版本由订单变动驱动，代码 version_no 仍按列表位置推算；OPEN_ISSUES 只登记了 file_version 读取问题，未登记版本语义与重复生成。
- 影响：两名开发者会做出两种版本语义（按数据版本号 vs 按生成次数）；重复点击、双击、并发请求产生的冗余文件与 60 天泄露面无法验收，运营端看到的『v4』含义不一致。
- 建议：DECISIONS 增补一条：明确『版本』是数据口径版本还是单次文件；建议以数据口径为准（作废递增），同一口径下重复生成复用既有有效文件，并给 listGenerate 定义幂等键与并发互斥；同步修改 D-073 措辞、CLOUD_API 14.5、STATE_MATRIX §7。
- 需拍板：同一份订单数据下团长再次点“生成”：A) 复用已有文件，不产生新版本，仅订单作废后才产生新版本；B) 每次点击都生成新文件和新版本。文件超过 60 天被清理后，A) 列表仍显示但标记“已清理，可重新生成”；B) 从列表中隐藏。

#### U-34 · 高 · 小程序端 xlsx 下载方式未定义且现为复制链接

- 主题：清单与导出；类型：未制定完善；状态：仍成立·未登记；独立发现者：2
- 事实：D-071 要求地址有效期 30 分钟、不得写入任何日志或页面；OPS §10 要求下载链接被转发也要可追踪。UX F-M10 只写使用短期地址下载。全库 grep downloadFile、openDocument、剪贴板、复制链接、业务域名，docs 下没有一处规定小程序端如何打开或保存 xlsx，也没有云存储下载域名的配置要求。export.vue 在非 H5 端把 url 写入系统剪贴板并提示下载链接已复制，团长只能粘贴到浏览器打开。剪贴板内容可被其他应用读取，也容易被转发。这条链路含姓名、电话、地址。
  - `grouporder-client/src/pages/activity/export.vue:79` 「uni.setClipboardData({ data: data.url, success: () =>」
  - `docs/01-ux/UX_FLOW_SPEC.md:158` 「再次校验当前团长权限 → 使用短期地址下载」
  - `docs/00-product/DECISIONS.md:89` 「不得将地址写入任何日志或页面（OPS §10）」
- 现状核对：export.vue:79 仍把 url 写入剪贴板；docs/03-release 与 UX/CLOUD_API 无 downloadFile/openDocument 规定；OPEN_ISSUES:138 只登记 file_version 问题。
- 影响：开发者各自决定下载方式，可能是复制链接，也可能是 downloadFile 加 openDocument。前者让含个人信息的文件地址落到剪贴板，后者需要提前配置下载域名，未配置则真机下载失败，提审前才发现。
- 建议：在 UX_FLOW_SPEC F-M10 与 CLOUD_API §8 补一条：小程序端用 wx.downloadFile 下载后 wx.openDocument 打开或转发，不展示、不复制地址。RELEASE_AUDIT_CHECKLIST 增加 downloadFile 合法域名一项。
- 需拍板：小程序端拿清单文件的方式选哪种？A：应用内 downloadFile 加 openDocument，不出现链接，需要配置云存储下载域名。B：允许复制 30 分钟链接到浏览器打开，接受被转发的风险。

### 举报与治理

#### U-02 · 高 · 内容检测记录状态语义与联动后果未定义

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：9
- 事实：DATA_MODEL 定义 check_result（1通过 2命中需人工 3明确违规拦截）和 status（1待复核 2已放行 3维持拦截 4已处置），但没有任何文档规定：(1) 提交审核时文本检测出 3（明确违规拦截）与 2 的处理差别；代码 checkText 对两者一视同仁（都置待复核、活动进人工队列），text_check_status 的「3 已拦截」对文本永远不会被置位；(2) 图片异步回调命中：D-058 和 OPS §4.3 写的是「命中时由系统转入治理下架并进入内容运营待办」，未区分 2 与 3，代码只在 3 时下架、2 时仅入待办；(3) 已放行/维持拦截/已处置对被检对象的后果：ops-co.checkHandle 只改检测记录状态，明确不联动恢复或下架；活动发布审核（reviewSubmit）通过或不通过也不会关闭同一活动的待复核检测记录，这些记录会一直留在工作台第 1 档并计入角标；(4)「已处置」与「维持拦截」的区别、能否从维持拦截再到已处置均无说明。
  - `docs/02-arch/CLOUD_API.md:551` 「`checkHandle` | `{ check_id, status: 2|3|4, review_conclusion?, review_reason }`」（当前文件中未找到该引文）
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/contentcheck.js:93` 「status: STATUS.PENDING」
- 现状核对：OPEN_ISSUES、ADMIN_KNOWN_ISSUES 中没有 check_result 或 status 语义、检测记录与审核联动的登记；DATA_MODEL 仍只列枚举。checkHandle 入参仍只有 status 2|3|4，无联动说明（CLOUD_API 检测处理行）。
- 影响：两个开发者会对「命中」是否等于下架、拦截是否等于自动退回草稿实现出不同行为；命中需人工的违规图片可能一直在线；已复核的检测记录不关闭，运营待办和角标永远清不掉。
- 建议：由产品补一张「检测结果 × 阶段（提交审核前文本/放行后图片）→ 活动/商品动作」矩阵，并规定 4 种 status 的迁移及后果（已放行是否自动恢复治理下架、维持拦截是否保持下架、已处置的含义）；规定活动发布审核的结论与同版本检测记录的联动（通过/不通过时批量关闭）。
- 需拍板：图片异步回调命中「需人工」（非明确违规）时：A 与明确违规一样先自动下架、再由运营复核恢复；B 先保持在线、只进运营待办。文本检测出「明确违规拦截」时：A 自动退回草稿并展示原因；B 仍进人工审核队列由运营决定。请分别选择。

#### U-07 · 高 · D-082 自动处置的入参来源与无事务回滚未定义

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：7
- 事实：D-082 规定 reportConclude 在结论为下架商品、下架活动、临时限制、永久限制时同一请求内自动执行处置，任一动作失败整个结案回滚。CLOUD_API 入参仍只有 { report_id, conclusion, conclusion_reason }，而复用的公共逻辑需要更多信息：_governanceOff 必填违规类型（violation_type）；临时限制必填晚于当前的 effective_to；下架商品需要 goods_id（举报可只指向活动，goods_id 可为空）。这些入参 D-082 与 CLOUD_API 均未规定来源。另外：(1) 结论 2「警告发布者」不在 D-082 的自动执行范围内，也无人工提示，结案后警告记录不会产生；(2) DATA_MODEL §8.1 明确「不依赖数据库事务」，云函数跨多集合写入无法整体回滚，D-082「整个结案回滚」的实现方式（补偿写回？按顺序先处置后结案？）没有说明；(3) 重复提交同一结案时 changed=false 的返回是否携带 executed_actions，也未规定。
  - `docs/02-arch/CLOUD_API.md:548` 「`reportConclude` | `{ report_id, conclusion: 1–6, conclusion_reason }`」
  - `docs/00-product/DECISIONS.md:100` 「任一动作失败则整个结案回滚并返回错误」
  - `docs/03-release/OPEN_ISSUES.md:198` 「失败整体回滚」
- 现状核对：CLOUD_API 的 reportConclude 入参仍只有 report_id、conclusion、conclusion_reason，未含 goods_id、violation_type、effective_to；D-082 只说整体回滚，DATA_MODEL 仍写不依赖事务。OPEN_ISSUES 198 行只登记落地，未提这些缺口。
- 影响：开发无法按现有契约实现：要么另加入参而前后端不一致，要么用默认值替产品决定违规类型与限制期限；失败时可能出现「已结案但只做了一半处置」，正是 D-082 要避免的中间态。
- 建议：补充 reportConclude 契约：入参增加 target_goods_id（结论 3 必填）、violation_type、effective_to（结论 5 必填）；明确结论 2 是否也自动写警告记录；给出无事务下的执行顺序与失败补偿（例如先执行处置、全部成功后再改举报为已结案，处置失败时不改举报状态）。
- 需拍板：举报结案选「下架单个商品」时，若举报只指向活动、没有商品：A. 拒绝结案，要求运营改选「下架整个活动」或先让举报补商品；B. 允许运营在结案页从活动商品中选一个下架。另请给出违规类型的可选清单（是否沿用举报的 reason_type 分类）。

#### U-08 · 高 · 违规类型枚举与负面清单判定口径仍无统一定义

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：7
- 事实：DECISIONS §4 与提审清单第二节只给出负面清单的类别名称。PRD §8.7 引用「明确禁止规则」，全库无关键词表、分类模型或规则集；msgSecCheck 检测的是涉政、色情、违法等内容，不识别药品、酒类、保健品等经营限制，文档没有说明这些条目靠什么拦截。OPS §6.1 和 §7 要求运营下架或处置时「选择违规类型」，但没有给出清单，运营后台 dict.js 自己注明「文档中没有给出这份清单」并拟了 7 项占位（含负面清单中没有的「虚假宣传」「重复发布受限商品」），schema 中 governance_type 与 violation_type 也无枚举。举报侧 reason_type 有 12 个取值，与占位清单没有映射。grep 关键词「审核指引」「审核标准」「处置标准」全库无匹配，即运营审核与举报处置没有判定标准，也没有对负面清单条目含义（例如保健品是否含普通营养食品、酒类是否含料酒）的解释。
  - `grouporder-admin/common/grouporder/dict.js:127` 「文档中没有给出这份清单」
  - `docs/02-arch/DATA_MODEL.md:159` 「`governance_type` | string | | | 违规类型」
- 现状核对：dict.js 仍注明文档无此清单，DATA_MODEL governance_type/violation_type 仍无枚举，OPEN_ISSUES 未登记。
- 影响：不同运营对同一商品处置结论不一致；自动检测无法覆盖经营限制类条目，审核员发一条药品或烟酒商品即可通过。
- 建议：补一份运营审核与处置指引：负面清单每条的边界与示例、机器可检与仅人工可判的划分、违规类型枚举（建议直接复用 reason_type 的 12 项）；DATA_MODEL 为 governance_type、violation_type 补枚举。
- 需拍板：违规类型固定为哪几项？建议 A) 直接使用 DECISIONS §4 的负面清单类目（药品/医疗器械/烟草/电子烟/酒类/保健品/危险品/色情赌博/非法票券/侵权/需资质商品）加「其他」；B) 沿用后台现有占位的 7 项。图片检测命中是否单列一项？

#### U-09 · 高 · 发布限制状态迁移规则缺失

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：7
- 事实：OPS §7 只写「相同状态的重复操作不重复生效」「临时限制在明确的起止时间内」「解除基于复核结论」。代码 restriction.apply 的实际规则：(1) 对永久限制用户提交临时限制，状态被改成临时并写入到期时间，changed=true，永久限制被静默降级；(2) 对已是临时限制的用户再次提交临时限制，只要状态相同 changed=false，但到期时间已被改写（可缩短/延长），响应却说没变化；(3) 对已是永久限制的用户再提交永久限制，changed=false，仍新增一条流水并换 case_no，覆盖 user-ext 的 restriction_case_no；(4) 警告每次都 changed=true，无去重；(5) effective_from 只写进流水，用户扩展表没有起始字段，限制立即生效，提交未来起始时间也不会延后；(6) 解除只要求填原因，不校验是否存在复核结论；(7) 页面文案「并发时以提交时最新状态为准并提示状态变化」，接口没有让调用方带入「我看到的状态」，无法判断并发变化。OPS §6.2「恢复提交时重新读取发布者限制状态」也没有说读到限制后恢复要怎样。
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:237` 「相同状态的重复操作不重复生效」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/restriction.js:146` 「changed: actionType === ACTION.WARN ? true : prevStatus !== nextStatus,」
- 现状核对：OPS 第 237 行仍只有笼统表述，没有迁移表；restriction.js 的行为未变，OPEN_ISSUES 未登记。
- 影响：运营在不知情的情况下把永久限制改成有期限，或延长/缩短临时限制而审计显示「无变化」；重复提交产生多条相同流水，违反「不重复生效」的验收（OPS §14.3）。
- 建议：在 OPS §7 增加迁移表：正常/临时/永久 × 警告/临时/永久/解除 的结果（哪些拒绝、哪些覆盖、覆盖时如何记录）；规定 effective_from 语义（立即生效或定时生效）；规定解除所依据的复核结论如何关联；规定 A-09 恢复读到限制时的动作。
- 需拍板：对已被永久限制的发布者，再提交「临时限制」：A. 拒绝并提示当前已是永久限制；B. 允许，视为改为临时限制并写审计。对已被临时限制的发布者再次临时限制：A. 以新的到期时间覆盖；B. 只允许延长，不允许缩短。

#### U-11 · 高 · 举报复核的发起方、结论效力与再复核未定义

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：6
- 事实：
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:119` 「对已结案事项发起复核并保留原结论，不覆盖历史记录。」
  - `docs/01-ux/UX_STATE_MATRIX.md:110` 「查看、按规则发起复核」
- 现状核对：
- 影响：
- 建议：
- 需拍板：选哪个？

#### U-12 · 高 · 治理处置的反馈申诉复核通道无页面接口流程

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：6
- 事实：UX_STATE_MATRIX 写团长在“已下架”时可“提交允许的反馈/申诉”，写发布者被限制时可“申诉/反馈”，写已结案举报“用户/运营”可“按规则发起复核”；PRD 功能清单列有“反馈入口”。全库 grep 申诉、反馈、申请复核、发起复核：只有账号绑定申诉（M-05/M-07/A-12）有实体，治理处置没有对应页面、云对象方法、状态或待办。代码里 reportRecheck 的 apply_uid 恒为当前运营账号，小程序端没有任何复核入口。同时活动被治理下架后团长不能编辑内容（_assertEditable 拒绝），也不能自行解除，STATE_MATRIX 只写“说明团长不能自行解除”，没有整改后重新上线的路径，只能等运营主动恢复。
  - `docs/01-ux/UX_STATE_MATRIX.md:42` 「查看历史、提交允许的反馈/申诉」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:71` 「if (activity.governance_status === GOVERNANCE.OFF) {」
- 现状核对：UX_STATE_MATRIX 仍写团长可提交反馈或申诉；OPEN_ISSUES、ADMIN_KNOWN_ISSUES 均未登记，D-082 只管结案自动处置。
- 影响：被误下架或被限制的团长没有任何申诉渠道，只能线下联系；开发者无法判断“复核”到底由谁发起、能发起几次；微信审核也会关注投诉申诉闭环。
- 建议：需产品明确：复核只由运营内部发起，还是开放给团长/举报人。若开放，补 M 端申诉入口、数据表字段（申请人、次数）、待办和 CLOUD_API 方法；若不开放，删除 UX 中的“反馈/申诉/按规则发起复核”表述，并说明整改上线路径。
- 需拍板：被下架或被限制的团长如何提出异议？A：小程序内提供申诉入口，提交后生成复核记录，每个处置只能申诉 1 次；B：小程序内不提供，团长通过线下渠道联系运营，复核只由运营内部发起。

#### U-17 · 高 · 下架原因与举报人对团长的可见范围未规定

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：5
- 事实：OPS 6.1 只说「敏感审核材料和内部备注不得对外展示」，OPS 7 只说举报记录关联举报人。全库未规定：被举报的团长能否得知举报人是谁、能否看到运营填写的下架原因原文。代码 activityGetDetail 向团长返回 governance_reason，该字段就是运营下架时必填的原因，同一字段也写入审计。reportGetResult 对举报人做了对外说法与内部理由分离，但团长侧没有对应的分离。grep「举报人」「匿名」「内部备注」在 PRD、UX、CLOUD_API 中无可见性规定。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:471` 「governance_reason: activity.governance_reason || '',」
  - `grouporder-client/src/pages/activity/manage.vue:17` 「下架原因：{{ act.governance_reason }}」
- 现状核对：activity-co 仍向团长返回 governance_reason，manage.vue 仍展示；DECISIONS、CLOUD_API、DATA_MODEL、OPEN_ISSUES 无匿名或对外说明字段的规定。
- 影响：运营在原因栏写入举报人信息或内部判断，会原样展示给被举报团长，引发报复或纠纷；举报人匿名性没有产品承诺。
- 建议：新增决策：举报人对团长匿名；下架原因分「对外说明」与「内部理由」两个字段，团长只看前者。DATA_MODEL 与 CLOUD_API 同步。
- 需拍板：举报结案后对举报人展示什么？A：只展示「成立/不成立，已处理」两态，不披露对发布者的具体处置。B：按结论展示（如商品已下架、活动已下架），警告与限制发布仍只说「已处理」。

#### U-21 · 高 · 已截止或已取消活动的治理恢复规则仍矛盾

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：4
- 事实：矩阵 §3 组合规则写“恢复治理状态不改变业务状态；已截止、已取消或下架期间已到截止时间的活动不能恢复为可参与”，这可读作允许把治理状态恢复为正常（只是业务状态仍是已截止）；但同表运营行把“截止/取消/限制状态导致不可恢复”作为失败反馈，OPS 6.2 与 DATA_MODEL 5.1 用“禁止恢复为可参与状态”表述。实现 _governanceOn 对已取消、已截止、下架期间到期一律拒绝整个恢复，即误下架的已截止活动的治理状态永久停在“已下架”，团长永远无法解除。另外 OPS 6.2 与 UX F-A04 要求恢复时“重读发布者限制状态”，但没有说明发布者被限制时恢复是被阻止、警告还是不受影响，代码不检查限制状态；矩阵把“限制状态”列为不可恢复原因但无定义。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:346` 「活动已截止，不能恢复为可参与状态」
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:220` 「团长已取消或活动已经截止时禁止恢复为可参与状态。」
- 现状核对：OPEN_ISSUES 未登记此问题；_governanceOn 仍对已截止直接拒绝（ops-co 346行），文档仍写禁止恢复为可参与状态，与“恢复治理状态不改变业务状态”的读法有歧义，发布者限制的影响也未说明。
- 影响：运营对已截止活动的误下架无法纠正，团长的清单仍在但活动永远显示“平台治理已下架”；限制状态的处理各自实现。
- 建议：明确写出：已截止/已取消活动的下架是否允许恢复治理状态（只恢复展示），以及发布者受限时对恢复的影响。
- 需拍板：对已截止或已取消、且被平台下架的活动，运营复核认为下架有误时：A) 允许把治理状态恢复为正常（活动仍是已截止/已取消，仅去掉下架标记）；B) 不允许，下架标记永久保留。另：发布者处于发布限制期间，恢复其活动是 A) 允许，B) 阻止？

#### U-22 · 高 · 举报被领取后缺少释放与超时规则

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：4
- 事实：OPS 5.1 只写“领取或打开待处理举报，系统记录处理人和开始时间”，没有释放、转交、超时、接手的规则；OPS 3.1 写停用后“未完成操作不得继续提交”，没有说明账号停用时其名下处理中事项怎么办；D-078 让所有账号权限相同，也没有对“他人领取的事项”做规定。实现：reportConclude 在 handler_uid 不是当前账号时抛 FORBIDDEN“该举报由其他运营处理中”；工作台 workbenchTodo 只查 status = 待处理 的举报，处理中（已被领取）的举报不出现在任何人的待办里，而 OPS 4.2 写举报的待办消退条件是“转为已结案”。结果：处理人被停用或放弃后，举报永远停在处理中，无人可结案，且不在待办。申诉的 handler_uid 没有此互斥，规则与举报不对称。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:593` 「throwOps('FORBIDDEN', '该举报由其他运营处理中')」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:2097` 「.where({ status: REPORT_STATUS.PENDING })」
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:188` 「运营人员领取或打开待处理举报，系统记录处理人和开始时间。」
- 现状核对：OPS_ADMIN_REQUIREMENTS、OPEN_ISSUES、ADMIN_KNOWN_ISSUES 搜不到释放、转交、接手规则；reportConclude 仍限制只有处理人能结案，workbenchTodo 仍只查待处理举报。
- 影响：不处理的话，违规内容举报可能因处理人离职或停用而永久悬挂，属于线上违规内容未处置（D-070 中优先级最高的一档）。
- 建议：规定：处理中举报是否允许其他运营接手或释放；账号停用时其处理中举报自动释放为待处理并写日志；工作台待办包含处理中且未结案的举报（本人置顶）。
- 需拍板：处理中的举报若领取人不再处理，怎么办？A 任一运营可在详情页「接手」（记审计）；B 超过 N 小时自动回到待处理；C 只有原领取人能处理，账号停用时由管理员批量释放。发布审核是否也要先领取？

#### U-23 · 高 · 恢复所需“允许恢复”的复核结论无枚举与校验

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：4
- 事实：OPS 6.1 要求下架在“举报或复核结论成立后”执行，OPS 6.2 要求恢复“经过复核且结论允许”，UX F-A04 要求“有允许恢复的复核结论”，且提交时重读“发布者限制状态”。文档没有定义：哪个复核结论算“允许恢复”（复核结论枚举沿用举报的 6 个值，没有“允许恢复”）；发布者被限制时恢复是允许、拒绝还是仅提示。原型写“发布者无发布限制”才可恢复，OPS 只写“重新读取”。代码 _governanceOn 只拒绝已取消、已截止、下架期间到期三种情形，不检查复核记录，不读取发布者限制；_governanceOff 的 case_no 可选，也不校验存在成立的举报或检测复核。原型写恢复要求业务状态“仍为进行中”，OPS 14.4 写“可参与业务状态”，代码则允许审核中/草稿状态的活动被恢复。
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:218` 「经过复核且结论允许时」
  - `docs/02-arch/CLOUD_API.md:542` 「violation_type, reason, case_no?」
- 现状核对：OPS 仍写“经过复核且结论允许”，未定义允许的结论值；OPEN_ISSUES 无登记，D-079 与恢复无关，代码仍未校验复核记录。
- 影响：任意运营可不经复核直接恢复；发布者被永久限制时其违规活动可被恢复；开发者对“什么结论允许恢复”无从实现，验收也无判据。
- 建议：在 OPS 6.2 定义恢复的前置：需要一条关联的复核记录且其结论属于哪些值（建议：复核结论为“无违规”才允许恢复）；明确发布者受限时的处理（拒绝/仅警示）；明确可恢复的业务状态集合；治理下架是否也要求关联事项编号。
- 需拍板：恢复下架对象需要满足什么？A：必须有关联举报的复核记录且复核结论为“无违规”，发布者受限时仍可恢复但要提示；B：必须有复核记录且发布者当前无发布限制，否则拒绝；C：不强制复核记录，运营填写理由即可（需同步删除文档中“允许恢复的复核结论”）。

#### U-29 · 高 · 治理下架期间团长与参与者可用操作未规定且代码不一

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：3
- 事实：矩阵 §3 活动已下架行：参与者“可用操作”只有查看历史和举报结果，“禁止”仅列新建订单与扩大数量，未说明减少/移除/取消整单是否可行（商品治理下架行 §4 却明确列出了减少、移除、改地址备注、取消整单）；团长只写“查看历史、提交反馈/申诉”，未说能否手动截止、取消、生成清单、调库存、停售、排序。代码：参与者缩小/取消放行（assertActivityShrinkable 注释“下架都不阻止缩小”）；activityClose/activityCancel 不查治理状态；export-co 的 _requireClosedOwnActivity 不查治理状态，下架活动的团长仍可预览、生成、下载含姓名电话地址的清单；activityUpdateDraft、activityUpdatePickup、goodsUpdate 则在下架时拒绝；goodsSetOnSale、goodsAdjustStock、goodsSort 对活动级下架不拦。矩阵 §4 商品治理下架行也没有团长和运营的行（团长能否恢复售卖/调库存，代码在 goodsSetOnSale 拦了 GOODS_OFFLINE）。
  - `docs/01-ux/UX_STATE_MATRIX.md:41` 「查看历史、提交允许的反馈/申诉」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:37` 「async _requireClosedOwnActivity (activityId) {」
- 现状核对：矩阵 §3 下架行仍未列团长的截止、取消、导出等操作，export-co 仍只在展示中标记下架、未按治理状态拦截；OPEN_ISSUES 无登记。
- 影响：被平台判定违规的活动，其团长仍可导出含个人信息的清单、正常截止/取消；也可能被某个开发者按矩阵字面实现成“下架后参与者不能取消自己的订单”。
- 建议：在矩阵 §3 补全下架期间参与者与团长的可用/禁止操作，并补商品治理下架的团长、运营行；同步统一代码。
- 需拍板：活动被平台下架期间：A) 参与者仍可缩小/取消订单，团长仍可手动截止、取消、导出清单（仅禁止新增与扩大）；B) 团长的导出清单、调库存、停售等经营动作一并冻结，直到复核恢复。请选 A 或 B，并说明团长能否取消已下架的活动。

#### U-30 · 高 · 治理下架后内容仍全量返回，文档未定义限制展示范围

- 主题：举报与治理；类型：未制定完善；状态：仍成立·未登记；独立发现者：3
- 事实：UX_STATE_MATRIX 第 200 行写下架是「平台治理限制展示/参与」，第 40 行写普通用户可见「明确下架状态、适当公开结果、本人历史」，OPS §6.1 写参与者和发布者可看到「适当的处置结果」。没有任何文档定义「限制展示」具体隐藏哪些字段、未登录访客与有订单的参与者看到的是否相同。activityGetDetail 的注释明确写「治理下架对普通访客显示下架状态，但不隐藏内容」，返回标题、说明、封面、轮播图、全部商品及其图片；客户端 detail.vue 仅对活动与商品加标签。因此因色情、赌博、药品被举报并下架的内容，仍可被持分享入口的任何人看到。图片回调命中后的自动下架（D-058）同样如此。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:403` 「治理下架对普通访问者显示下架状态，但不隐藏内容、不改业务状态」
  - `docs/02-arch/SHARE_SPEC.md:135` 「被平台下架 | 同上，提示「活动已被平台下架」」
- 现状核对：activity-co 注释仍写不隐藏内容；D-083/SHARE_SPEC 只处理分享入口标识和下架提示，未定义隐藏字段；OPEN_ISSUES 未登记。
- 影响：提审自查 2.8 的「具备下架能力」在功能表现上不成立：审核员举报并看到下架后，违规图文仍可访问，属于内容安全拒审点。
- 建议：补规格：下架的活动或商品对非本人访客隐藏正文和图片，仅展示占位与下架原因摘要；团长和有订单的参与者的可见字段单独列表。此规格落定后再改 activityGetDetail。
- 需拍板：活动或商品被治理下架后，其他人（含游客、已下单参与者）还能看到内容吗？A：看不到，只显示「已被平台下架」，参与者仍可在订单页看到自己的订单快照；B：仍可看到原内容，仅禁止下单（现状）。

### 后台账号与审计

#### U-13 · 高 · 运营账号密码、锁定、会话与恢复规则缺失

- 主题：后台账号与审计；类型：未制定完善；状态：仍成立·未登记；独立发现者：6
- 事实：D-069 只规定仅启用用户名密码登录、不提供微信/短信。D-068 的二次验证与“失败 5 次锁定 15 分钟”已随 D-072 废止，此后没有替代规则。全库 grep“重置|改密|修改密码|锁定|忘记|会话有效|登录有效|过期时间|空闲”，在 00-product、01-ux、02-arch、03-compliance 中，运营账号相关的只有 CLOUD_API 提到登录改密走 uni-id-co；PRD 的找回密码规则限于小程序用户且依赖微信绑定，D-069 又禁用了运营端的微信与短信。因此以下都未定：创建账号时初始密码由谁设置、是否强制首次修改；密码最小长度与复杂度；连续失败是否锁定及时长；登录有效期和空闲超时；运营忘记密码怎么办；是否允许一个运营账号重置另一个账号密码（A-15 编辑页现有“重置密码”）。OPS 9.1 只禁止在申诉里编辑“用户”密码，没有覆盖运营账号。该后台展示全量个人信息且无脱敏。
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:59` 「运营后台仅启用用户名密码登录」
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:58` 「运营账号不能自行注册」
  - `docs/00-product/PRD.md:146` 「未绑定微信的账号首版不提供自动密码找回。」
- 现状核对：OPS 3.1 仍只规定仅用户名密码登录与创建、停用；无密码强度、失败锁定、有效期、忘记密码恢复规则，OPEN_ISSUES 与 ADMIN_KNOWN_ISSUES 未登记（后者仅涉及 tokenSecret 示例值）。
- 影响：不处理的话，开发者会按 uni-id 默认值上线：无锁定、无强度要求、无会话上限，忘记密码只能人工改库；而后台展示完整收货信息，暴力破解一个账号即拿到全部数据。
- 建议：在 OPS 3.1 或 DECISIONS 新增决策，写明：初始密码规则、密码强度、失败锁定阈值与时长、会话有效期与空闲超时、忘记密码的恢复方式、是否允许重置他人密码及其审计。
- 需拍板：运营账号密码策略：A. 创建者设置初始密码，首次登录强制改密，连续 5 次失败锁定 30 分钟，会话 7 天；B. 沿用 uni-id 默认配置，不额外约束。忘记密码时：A. 由其他运营账号在 A-15 重置（写审计）；B. 只能通过云控制台处理。

#### U-14 · 高 · 查看与检索审计的记录范围未穷举且与实现不一致

- 主题：后台账号与审计；类型：未制定完善；状态：仍成立·未登记；独立发现者：6；已独立复核
- 事实：OPS 4.x 与 CLOUD_API 264 行写“每次查询与导出都写审计”，CLOUD_API 111 与 536 行写后台方法成功与拒绝都写 oplog，D-072 以全量审计作为唯一约束。但 OPS 13 必记清单没有通用的查看事件，只列内容检测记录查看、统计查询、Excel 事件等；DATA_MODEL 10.8 声称与 OPS 13 逐条对应，其清单仅含订单明细查看等，也非全部方法。CLOUD_API 批表中 reportList/Detail、reviewList/Detail、appealList/Detail、privacyCaseList、oplogList 的 action_type 为“—”。实现中 reportDetail、reviewDetail、appealDetail 仅做 _perm 无 oplog，oplogList 注释明确不写日志；_perm 在 deniedAction 为空时只拒绝不写日志。appeal/list.vue 提示“查看申诉详情写入审计”，实际未写。举报与申诉详情含完整快照和申诉人资料。文档未逐方法说明哪些查看必须记、哪些免记、拒绝是否一律记。
  - `docs/02-arch/CLOUD_API.md:264` 「每次查询与导出都写审计」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1645` 「await this._perm('ops-privacy-appeal')」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:479` 「await this._perm('ops-content-report')」
- 现状核对：appealDetail 与 reportDetail 仍只做 _perm、未写 oplog，而 CLOUD_API 264 行仍写每次查询都写审计，OPS 13 无逐方法穷举；OPEN_ISSUES 未登记。
- 影响：不处理的话，D-072 放开脱敏的前提（全量审计）在举报/申诉/隐私事项查看上不成立；验收时无法判定 reportDetail 不写日志算不算缺陷。
- 两种合理但互不兼容的实现：读法一：所有后台查询与详情（含举报、审核、申诉详情、隐私事项、oplogList）都写 oplog，拒绝也写，需补全动作类型并给 oplogList 特例。读法二：只有 OPS 13 与 10.8 列出的事件必须记，其余列表和详情免记，“每次查看”仅指订单、活动、用户、商品等检索详情。
- 建议：在 OPS 13 用穷举表写明：每个后台方法（含列表与详情）是否记录、动作类型、拒绝是否记录；明确 oplogList 免记是否成立；把 DATA_MODEL 10.8 第 6 类与 OPS 13 对齐。
- 需拍板：审计是否覆盖全部只读查询（举报详情、审核详情、申诉详情、日志查询、工作台）？A. 覆盖，全部新增查看与拒绝的 action_type；B. 只覆盖含个人信息的查询（订单、用户、申诉、导出），其余不记。

#### U-24 · 高 · 审计写入失败时的处理规则未定义

- 主题：后台账号与审计；类型：未制定完善；状态：仍成立·未登记；独立发现者：4
- 事实：D-072 与 D-075 的理由都是：取消脱敏后，全量审计成为唯一的约束手段；D-075 甚至因为“服务端不知道发生过这次读取，会旁路 OPS §13”而否决客户端直连。但没有任何文档规定审计写入失败时的行为：是拒绝本次查看/导出/处置，还是放行并告警。oplog.js 的 write 捕获异常后返回 null，主流程照常返回完整数据；注释自己写“审计链路断掉是 D-072 之后唯一约束手段的失效，不能静默”，实际只有 console.error。OPS 12.2 的通用异常也没有该项。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/oplog.js:101` 「失败不得影响主流程返回，但必须打服务端日志」
  - `docs/00-product/DECISIONS.md:93` 「客户端直连时服务端不知道发生过这次读取」
- 现状核对：oplog.js 写审计失败仍只打日志、不影响主流程，文档无失败时拒绝或补偿规则；OPEN_ISSUES 无审计相关登记，ADMIN_KNOWN_ISSUES 259 行仅重申全量审计不可旁路。
- 影响：不处理的话，集合写入故障或超限时，运营仍能无痕查看和导出完整个人信息，处置类操作也可能无留痕成功。
- 建议：由产品明确：读取与导出类操作审计失败时拒绝返回数据（先写后返回），处置类操作审计失败时的回滚或补偿方式；再写入 OPS 12.2 与 CLOUD_API 2.4。
- 需拍板：审计日志写不进去时，后台查看订单明细和执行下架/限制：A 拒绝操作并提示重试（更安全）；B 仍放行并在服务端告警（更顺畅）。选哪个？

### 隐私与数据留存

#### U-10 · 高 · 运营检索/统计导出文件无保留期与清理规则

- 主题：隐私与数据留存；类型：未制定完善；状态：仍成立·未登记；独立发现者：7
- 事实：D-071 只规定“清单 Excel”的 30 分钟链接、60 天删除和版本失效，OPS 10 与 D-072 只说批量导出不受限制。全库 grep 60 天、保留、清理、ops-export，没有任何文档规定运营导出的检索结果和统计文件的保存期限。代码 exportSearchResult、statExport 用 _exportRows 把文件上传到云存储 grouporder/ops-export、grouporder/ops-stat，订单检索导出含收货人、电话、地址、买家备注明文。清理任务 grouporder-task-export-cleanup 只扫 grouporder-export-log 中的 GENERATE_OK 事件，这两类文件既没有事件记录也没有清理，会一直留在云存储，超过订单三年匿名化期限后个人信息仍在文件里。审计上它们共用 action_type=export_download，但 OPS 13 把该类型定义为“运营从后台下载清单”，A-13 Excel 事件页不记录这些导出。导出行数上限也未定义，代码静默限制为 50 页×100 条=5000 行，超出部分被丢弃。
  - `docs/00-product/DECISIONS.md:89` 「文件在云存储保留 60 天**，到期由定时任务删除」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:105` 「cloudPath: `${cloudPathPrefix}/${this.ctx.now}.xlsx`,」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-task-export-cleanup/index.js:30` 「event_type: exportlog.EVENT.GENERATE_OK,」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1356` 「`grouporder/ops-export/${target}`」
- 现状核对：D-071 仍只覆盖清单 Excel，OPEN_ISSUES、ADMIN_KNOWN_ISSUES、SHARE_SPEC 均未登记 ops-export/ops-stat 的保留与清理；代码仍上传云存储，D-072 只说导出放开。 （已合并 1 个重复项）
- 影响：含完整姓名、电话、地址的导出文件在云存储中无期限留存，与 D-035 三年匿名化和 D-071“多存一份只增加泄露面”的原则相悖，过隐私审核时无法说明保存期限；导出文件在 A-13 无法追溯。
- 建议：在 OPS 10/11.4 补一条：运营检索/统计导出文件的链接有效期、保留天数和清理方式（建议与 D-071 同为 30 分钟/60 天），是否写入 export-log 或单独事件类型，行数上限或分批策略；同步扩展清理任务。
- 需拍板：运营从后台导出的“检索结果/统计表”文件（含姓名电话地址）要保存多久？A. 与清单相同，链接 30 分钟、文件 60 天后删除；B. 导出后仅给一次性链接，文件当天删除；C. 其他天数（请给出）。另外行数上限是 A. 不设上限（分批生成）还是 B. 设固定上限（请给出数值，超出提示）？

#### U-25 · 高 · 隐私事项类型、阻止条件、时限规则缺失

- 主题：隐私与数据留存；类型：未制定完善；状态：仍成立·未登记；独立发现者：4
- 事实：1) 用户端 privacyRequestSubmit 接收 case_type 1/2/3。DATA_MODEL 定义 3=到期匿名化，这是系统按期限触发的类型，用户提交没有意义；CLOUD_API 却写用户端是「注销 / 删除 / 匿名化请求」。2) 代码对三种类型都套用 D-056 的阻止条件，但 D-056 只针对注销。删除请求、匿名化请求是否同样被阻止，文档没有说。3) 提交后到运营执行前，账号能否继续发起活动/下单，未规定。4) 运营端 privacyCaseCreate 也能登记同类事项，用户端提交的记录则不带 retention_start/retention_expire、也不会去重，两条路径产生的记录字段不同。5) 运营侧保存期起点取「该用户作为团长的最近一次截止/取消活动」，没有覆盖作为参与者的订单；D-035 的三年从订单所属活动截止起算，一个用户的多张订单有多个不同到期日，而事项记录只有一组期限。6) 用户撤回请求 OPS 明确列为待确认，用户端也没有撤回接口。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:307` 「assertParam([1, 2, 3].includes(caseType), '请求类型不合法')」
  - `docs/02-arch/DATA_MODEL.md:791` 「1账号注销 2删除请求 3到期匿名化」
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:516` 「用户撤回注销或对删除、匿名化处理结果申诉的规则」
- 现状核对：user-co 仍对 case_type 1/2/3 全部放行并套用 D-056，DATA_MODEL 仍定义 3=到期匿名化，OPS 仍把撤回列待确认；文中「不去重」一点不实（已有 status 去重查询），其余成立，未登记。
- 影响：开发者会各自决定：用户能否提交「到期匿名化」；提交后账号是否冻结；用户端与运营端登记的事项如何合并。三年到期扫描依赖 retention_expire，用户端登记的记录没有该字段，扫描会漏。
- 建议：用户端只开放 1、2，类型 3 只由系统/运营产生；写明 D-056 阻止条件对哪些类型生效；写明期限按订单逐单计算还是按事项统一；撤回规则等合规结论到位后补。
- 需拍板：用户在订单三年保存期内提出删除请求，平台怎么处理？A：一律拒绝提前删除，仅告知到期时间并在争议/审计需要之外不再使用；B：受理后对该用户名下订单立即匿名化个人字段，但保留匿名汇总与审计所需的最小记录（请同时给出处理时限，例如 N 个工作日）。

#### U-26 · 高 · 隐私事项保存期起点与推进规则未定义

- 主题：隐私与数据留存；类型：未制定完善；状态：仍成立·未登记；独立发现者：4
- 事实：一、起点：D-035 按「所属活动截止或取消之日」逐单计算，原型 A-16 每个事项只有一个起点与到期日。运营登记（privacyCaseCreate）取「该用户作为团长的最近一次活动」的到期日，只查 leader_uid 名下活动，参与者订单被忽略；用户没有任何已截止活动时以登记时间为起点，这两条规则文档均无。用户自助提交（user-co privacyRequestSubmit）创建的事项不写保存期起点与到期日，A-16 显示「—」，而到期扫描任务按 retention_expire 推进状态，这类事项永远不会到期。二、阻止注销：原型 A-16 有一行「已登记 · 阻止」并列出阻止对象，说明阻止会落一条事项记录；用户端云对象在有阻止项时直接抛错、不建记录，运营登记路径不做前置检查，A-16 页面里 blockers 也没有数据来源。三、状态推进：原型写状态「由系统按 D-035 计算并只读展示，本页只做登记与跟踪」，而页面与 privacyCaseUpdate 提供「转入限制处理、标记已完成、标记执行失败」按钮，任意状态可置为已完成，无需实际删除或匿名化；也没有代码去删除账号资料与地址簿（定时任务只匿名订单）。四、OPS §12.1 状态表没有隐私事项行；UX F-A10 的状态措辞（处理中、限制处理、到期处理成功、处理失败）与 DATA_MODEL 五状态（已登记、限制处理中、已到期待处理、已完成、执行失败）不一致。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:370` 「const res = await this.db.collection('grouporder-privacy-case').add({」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-task-retention/index.js:66` 「retention_expire: dbCmd.lte(now),」
  - `docs/03-release/OPEN_ISSUES.md:144` 「privacyRequestSubmit` 无页面触发，D-035/D-056 留存规则未接入」
- 现状核对：user-co privacyRequestSubmit 仍不写 retention_start/expire，task-retention 按 retention_expire<=now 推进，用户提交事项不会到期；OPEN_ISSUES 仅登记注销入口未接入（约第144行），未覆盖此问题。
- 影响：注销与匿名化是合规主线：保存期可能算错或永不到期，运营可不做实际处理就标记已完成，验收无法核对「三年后删除」是否真的发生。
- 建议：在 OPS §16 与 UX F-A10 补：事项与订单的对应（逐单各自到期，还是取最晚日期）、无订单时的起点；用户自助请求与运营登记统一走同一计算；阻止注销是否落记录；哪些状态迁移由系统自动、哪些允许人工，以及「已完成」的前置条件（订单已匿名、账号资料与地址簿已删除）；谁在何时执行账号资料删除；OPS §12.1 补隐私事项状态表。
- 需拍板：用户在仍有进行中活动时提交注销：A 只提示阻止、不落记录；B 落一条「已登记·阻止」记录供运营跟踪。运营能否手动把事项标为「已完成」？A 不能，只有系统在删除或匿名化成功后置位；B 能，需填写执行说明。

#### U-35 · 高 · 注销匿名化的对象清单与执行主体未定义且无执行

- 主题：隐私与数据留存；类型：未制定完善；状态：仍成立·未登记；独立发现者：2
- 事实：D-035、PRD 5.7、DATA_MODEL 9 只写「注销后删除或匿名化账号资料和当前地址簿」，没有列出具体字段或表：uni-id-users 的昵称/头像/username/wx_openid/wx_unionid、grouporder-address、grouporder-goods-lib、grouporder-user-ext、草稿活动、待办关闭记录、uni-id-log 里的 IP/UA 是否在内都未说明；「删除」与「匿名化」二选一由谁定、按什么规则定也未说明。OPS 又规定业务数据后台没有删除入口，所以运营无法人工执行。代码侧：privacyCaseUpdate 只能改 status/restricted/execute_result 文本，没有任何删除动作；全库 grep 云函数，没有任何按注销用户清理 grouporder-address / grouporder-goods-lib / uni-id-users 资料的代码；addressDelete 只做软删。文档也没有规定注销后同一微信再次登录是新建账号还是恢复原账号，以及 wx_openid 是否释放。
  - `docs/02-arch/DATA_MODEL.md:644` 「用户注销时删除或匿名化账号资料与地址簿」
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:273` 「后台本就没有删除入口」
  - `docs/03-release/OPEN_ISSUES.md:144` 「D-035/D-056 留存规则未接入」
- 现状核对：D-035与DATA_MODEL:644仍只写删除或匿名化，无字段级清单；OPEN_ISSUES:144仅登记客户端未接入closeAccount，未登记清单与执行缺口。
- 影响：案件可以被标为「已完成」，但没有任何数据被删除；合规上「注销后删除」无法兑现，审核或用户投诉时无法证明已执行。
- 建议：在 DATA_MODEL §9 增加字段级清单（表、字段、动作=删除/置空/保留、触发者、执行时机），并补一个注销执行云函数或受控运营动作，把执行结果写入 privacy-case 的 execute_result。
- 需拍板：用户在小程序提交注销后，账号资料和地址簿的删除由谁完成？A. 满足前置条件后系统自动执行，运营只查看结果；B. 运营在 A-16 核验后手动触发，系统负责执行删除。case_type“删除请求”“到期匿名化”是否保留？A. 保留并请写出含义；B. 首版只保留“账号注销”。

#### U-36 · 高 · 注销事项无执行环节，用户可提交系统类型3

- 主题：隐私与数据留存；类型：未制定完善；状态：仍成立·未登记；独立发现者：2；已独立复核
- 事实：UX F-A10 规定登记事项、身份核验、前置检查、注销后删除或匿名化账号资料与地址簿、订单转限制处理、满三年匿名化。文档未规定谁触发和执行，也未规定身份核验由谁做、失败如何处理。实现：用户 privacyRequestSubmit 建事项时不写 retention_start/retention_expire，而 task-retention 按 retention_expire<=now 且 status 为 1/2 推进到 3，因此用户提交的事项不会被推进；只有运营 privacyCaseCreate 才计算期限。云函数内没有删除或匿名化账号资料与地址簿的代码，privacyCaseUpdate 只改 status、restricted、execute_result 文本；restricted 除事项自身字段外无消费者。用户可提交 case_type=3（系统类型，到期匿名化）。前置条件校验最多读 50 个活动、200 张订单。OPS 16 把撤回注销规则列为待确认。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:307` 「assertParam([1, 2, 3].includes(caseType), '请求类型不合法')」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:370` 「const res = await this.db.collection('grouporder-privacy-case').add({」
  - `docs/03-release/OPEN_ISSUES.md:144` 「D-035/D-056 留存规则未接入」
- 现状核对：privacyRequestSubmit 仍允许 case_type 1/2/3 且建事项不带期限；OPEN_ISSUES 第144行只登记入口与留存规则未接入，未登记执行者、删除清单缺失。D-079 与此无关。
- 影响：用户点了注销，事项进入无期限状态，账号与地址簿不会被删除；满三年也不会推进；隐私合规与上线自查无法通过。
- 两种合理但互不兼容的实现：读法A：用户提交即登记，由运营在 A-16 核验后手工/后台执行删除匿名化并推进状态；读法B：注销通过后由系统任务自动匿名化账号与地址簿，A-16 只做跟踪。
- 建议：补 DATA_MODEL/CLOUD_API：注销事项由谁触发执行（运营在 A-16 推进还是系统任务）、执行内容清单（uni-id 账号、地址簿、商品库、自提联系人等）、用户提交时保存期起点的取值；case_type 限定用户可提交 1/2。撤回注销规则待合规结论前明确「首版不支持」。
- 需拍板：账号注销的正式流程是哪一种？A：用户在小程序 M-08 自助提交，系统即时校验 D-056 前置条件，通过后自动执行账号与地址簿的删除/匿名化，运营在 A-16 只读跟踪；B：用户在小程序只提交申请，由运营在 A-16 核验身份并校验前置条件后人工执行，用户在注销完成前账号照常可用。

### 合规与上线

#### U-15 · 高 · 用户协议隐私政策正文与首次同意机制缺失

- 主题：合规与上线；类型：未制定完善；状态：仍成立·已登记；独立发现者：6；登记位置：OPEN_ISSUES :149、:216（部分）
- 事实：PRD 10 要求「准备用户协议」并让隐私指引告知三年期限、账号存续数据和 Excel 临时期限。RELEASE 3.6 要求首次使用时展示协议与隐私政策并主动同意，3.4 要求指引说明注销、删除与限制处理。文档里没有：协议与指引的内容要点谁负责、展示位置与时机、拒绝同意时的路径（与 D-033 未登录可浏览如何共存）、版本号与同意记录字段（user-ext 与 uni-id-users 均无）。client/src 下 grep 协议、隐私政策、隐私指引，除 M-08 页面注释外没有页面或首次同意逻辑；「隐私与数据处理说明」只是一个 showModal，正文只写了订单三年，没有注销规则、限制处理、账号存续、Excel 30 分钟/60 天。
  - `grouporder-client/src/pages/hall/my.vue:93` 「订单相关数据自活动截止或取消起保存三年」
  - `docs/03-release/OPEN_ISSUES.md:149` 「「隐私说明」只是 modal 文字」
  - `docs/03-release/OPEN_ISSUES.md:216` 「AppID、服务空间绑定证据、协议地址、隐私弹窗」
- 现状核对：OPEN_ISSUES 仅登记隐私说明只是 modal（:149）及 D-078 落地含协议地址、隐私弹窗（:216），首次同意流程、版本与同意记录字段等规格缺口未登记，属部分登记。
- 影响：RELEASE 清单中标 🔴 的拒审高发项（3.4、3.5、3.6）无页面可验；同意记录缺失，无法证明用户已知晓保存期限。
- 建议：补一条决策与 UX 流程：首次使用同意的位置、拒绝路径、协议/指引页面、同意版本与时间的存储字段，以及指引必含的保存期限要点清单。
- 需拍板：协议弹窗放在哪一步？A：首次打开小程序（含从分享卡片进入的游客）即弹出，不同意则只能退出；B：只在登录、注册时勾选同意，游客可先浏览非敏感内容。

#### U-31 · 高 · 检测失败降级与无 openid 强制人工规则未定义

- 主题：合规与上线；类型：未制定完善；状态：仍成立·未登记；独立发现者：3
- 事实：D-057/D-058 规定自动模式「文本检测通过即放行」，OPS 规定命中进人工队列，但没有定义检测调用超时、报错、额度用尽时怎么办；RELEASE_AUDIT_CHECKLIST 的待核实项还提到：msgSecCheck 可能需要发布者 openid，用户名注册且未绑定微信的用户内容无法送检，「需强制走人工审核」，该规则未进入任何决策、CLOUD_API 或代码。代码：contentcheck.invokeProvider 目前只打日志并返回 PASS（文件头自承「检测服务供应商在现有文档中未指定」）；check_result 的 2（命中需人工）与 3（明确违规）在 activitySubmitReview 中被同样处理（留在审核中，返回 blocked），文档也未规定明确违规是否直接驳回；config.getReviewMode 在配置缺失时回落为自动审核。不确定之处：检测供应商属技术选型，本条只针对业务规则缺口与默认值组合的后果。
  - `docs/00-product/DECISIONS.md:77` 「自动审核模式下文字检测通过即放行活动进入进行中」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/contentcheck.js:10` 「默认按【通过】处理并在服务端打日志」
- 现状核对：D-057/D-058 仍只写检测通过即放行；失败、超时、无 openid、check_result=3 的处理无决策，contentcheck.js 仍是恒通过占位；OPEN_ISSUES 无登记，D-079 不涉及。
- 影响：按当前默认组合上线，UGC 内容没有任何检测就自动进入进行中，微信 UGC 审核要求（清单第二章）无法满足，存在过不了审的风险；检测服务一旦出现故障，行为无据可依。
- 建议：补充决策：(1) 检测服务失败或超时时活动进入人工队列（建议）还是放行；(2) 无 openid 的发布者强制人工审核；(3) 明确违规（check_result=3）是否自动驳回；(4) 上线前默认审核模式的初始值写入 DATA_MODEL §4.6 初始数据，并在供应商接入前保持人工模式。
- 需拍板：检测接口异常或用户没有微信 openid 时，活动如何处理？A：一律进入人工审核队列，不自动放行。B：异常时按通过放行，只依赖举报和事后下架。另请确认上线首日的默认审核模式：A 人工，B 自动。

#### U-37 · 高 · 发布者资质、发布规范入口与检测判据缺口，自动审核等于不审

- 主题：合规与上线；类型：未制定完善；状态：仍成立·未登记；独立发现者：2；已独立复核
- 事实：DECISIONS §4 要求平台提供规则、检测、举报与下架能力，负面清单含「无法证明资质的特殊资质商品」，并规定后续开放受限类目应先补发布者资质审核。核对结果：(1) docs/00-product、01-ux、02-arch、03-release 中「资质」仅出现在类目核验和提审清单，没有发布者资质证明的页面、字段、审核动作或状态；prototype 后台驳回原因文案里出现「发布者未提供资质证明」，但没有对应的提交入口。(2)《商品发布规范》仅在 PRD 与原型文案中被引用，无正文、无 M-xx 入口页和展示位置；grouporder-client/src 中 grep 发布规范、负面清单无命中，而 RELEASE_AUDIT_CHECKLIST 2.9 要求负面清单在发布页明确展示。(3) contentcheck.invokeProvider 对任何内容一律返回通过；config.getReviewMode 在无配置记录时默认自动审核，两者叠加使 D-057 自动模式等同于不审。检测结果枚举（待检、通过、待复核、已拦截）已存在，但从供应商返回映射到这几档的判据未定义。(4) msgSecCheck 可能要求 openid、用户名注册用户无法送检、需强制人工，仅写在 RELEASE_AUDIT_CHECKLIST 待核实项，未进入 DECISIONS 或 PRD。
  - `docs/00-product/PRD.md:387` 「并准备《商品发布规范》」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/contentcheck.js:32` 「内容检测服务尚未接入，本次按通过处理」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/config.js:17` 「首版默认自动，人工模式需要运营显式开启」
- 现状核对：负面清单与资质要求仍在 DECISIONS，客户端无发布规范入口，检测与默认模式问题在 OPEN_ISSUES 中均未登记；检测判据三档映射仍未定义。
- 影响：上线后自动审核模式下违规商品无人拦截，微信审核员也看不到负面清单公示；「无法证明资质」无法执行，团长与运营对什么算证明各按各的理解处理。
- 两种合理但互不兼容的实现：读法一：首版凡需资质商品一律禁止，发布页仅展示负面清单文案，用户名注册用户的内容强制人工审核。读法二：首版做发布者资质证明的上传与后台核验，并按检测服务的返回码自行映射通过或需复核，无法送检的内容按通过处理。两种实现的页面、字段和验收用例互不兼容。
- 建议：补齐：《商品发布规范》正文与入口（发布页与个人设置）；检测三档判据与供应商；无法送检用户内容的强制人工规则写入 D-057/D-058；「资质证明」在首版明确为不受理（凡需资质商品一律禁止）或补审核流程。开发期在接入前把默认审核模式设为人工。
- 需拍板：负面清单里「需特殊资质而发布者无法证明资质」的商品，首版怎么处理？A：首版不提供资质证明流程，所有需资质商品一律按禁止处理；B：提供资质材料上传与运营审核入口。另：内容检测服务接入前，正式上线的审核模式是否强制为人工审核？A：是；B：否。

## 2. 实现与规格不符：严重与高级别详述（32）

### 账号与登录

#### I-05 · 高 · 注销入口绕过 D-056 校验与隐私登记

- 主题：账号与登录；类型：实现偏离；状态：仍成立·已登记；独立发现者：10；登记位置：OPEN_ISSUES §3.1 (约144行)
- 事实：D-056、PRD 5.7 规定仍是审核中或进行中活动的团长，或在未截止活动中有有效订单时不得注销并列出阻塞对象。CLOUD_API 把该校验放在 privacyRequestSubmit，UX F-A10 与 OPS 又写成登记事项、身份核验后由运营处理；DATA_MODEL §3 却把注销当作 uni-id-co 的 close-account（写 status=4）。小程序 my.vue 的「注销账号」直接进入 uni-id-pages 的 deactivate 页，该页调用 uniIdco.closeAccount()；privacyRequestSubmit 在小程序 pages、components、common 下没有任何调用。closeAccount 是官方逻辑，不含 D-056 校验，也不写 privacy-case，三年期限内的订单也没有进入限制处理登记。
  - `grouporder-client/src/pages/hall/my.vue:88` 「uni_modules/uni-id-pages/pages/userinfo/deactivate/deactivate」
  - `docs/03-release/OPEN_ISSUES.md:144` 「privacyRequestSubmit` 无页面触发」
- 现状核对：my.vue 仍直接跳 uni-id-pages deactivate 页，OPEN_ISSUES §3.1 已登记 D-035/D-056 未接入（登记为中，实际偏高）。 （已合并 1 个重复项）
- 影响：团长有进行中活动、参与者有未截止订单时仍能一键注销，活动无人管理、订单收货信息按注销规则被处理，违反 D-056；限制处理与三年期限追踪也没有起点。
- 建议：先由产品定注销是自助即时还是登记后核验；无论哪种，都要在小程序注销入口前调用 D-056 校验并展示阻塞对象，deactivate 页需替换或包一层，closeAccount 前必须过校验。
- 需拍板：用户注销走哪条路径？A：用户自助即时注销，注销前服务端先做 D-056 校验并列出阻塞对象，运营 A-16 只登记与追踪限制处理；B：用户只提交注销申请（privacyRequestSubmit），由运营核验身份后执行，申请期间账号继续可登录。

#### I-21 · 高 · 游客进接龙 tab 被强制跳登录，缺游客态定义

- 主题：账号与登录；类型：实现偏离；状态：仍成立·未登记；独立发现者：3
- 事实：PRD 8.1 要求授权被拒时不出现循环授权。UX_FLOW_SPEC §6 规定分享单页启动时左上角返回 switchTab 到「接龙」tab；M-27 的入口为「小程序启动、接龙 tab」，且接龙 tab 是 pages.json 第一页。代码中 jielong.vue 的 onShow 无条件调用 todoList，云端 requireLogin 对游客返回 UNAUTHENTICATED，client.js 命中后调用 onUnauthenticated，navigateTo 登录页。游客在登录页点返回后回到接龙 tab，onShow 再次触发，再次跳登录页。文档没有定义游客在 M-27、M-09、M-18、M-10 的表现（空态加登录按钮，还是强制跳转）。
  - `grouporder-client/src/pages/hall/jielong.vue:110` 「await guarded(api.user.todoList())」
  - `docs/03-release/OPEN_ISSUES.md:140` 「onUnauthenticated 无去重、不清 token」（当前文件中未找到该引文）
- 现状核对：jielong.vue 仍无登录判断直接请求 todoList；OPEN_ISSUES 第140行只登记登录页重复压栈，未登记游客循环与 UX 缺口。
- 影响：新用户点开分享卡片后想看看别的（点返回或首页图标）就被锁在登录页循环里；直接搜索进入小程序的新用户同样无法停留在大厅。
- 建议：补充 UX：游客进入大厅三个 tab 时显示「登录后查看」空态与登录按钮，不自动跳转；只有点击受保护动作才 navigateTo 登录页。代码在 tab 页 onShow 前先判 isLoggedIn，未登录不发请求。
- 需拍板：游客打开「接龙」tab 时？A. 展示“登录后查看待办/我发起的/我参与的”的引导空态，不自动跳转；B. 直接进入登录页（与 D-033 的“先浏览”仅限活动详情一致）。

#### I-22 · 高 · 小程序缺自助发起绑定微信入口与接口

- 主题：账号与登录；类型：实现偏离；状态：仍成立·未登记；独立发现者：3
- 事实：F-M02 规定平台账号登录后在 M-05 发起绑定、展示待绑定微信、确认后绑定。CLOUD_API 第 7 节 user-co 只有只读的 bindStatus，绑定动作被写成全部走 uni-id-co，没有列出具体方法。全库 grep bindWeixin/bind_weixin 无结果。实现上 bind.vue 没有“绑定微信”按钮，只有“设置用户名密码”（跳 uni-id 的 set-pwd 页，只设密码不建用户名）和“账号绑定申诉”。页面提示文案把“微信已被其他账号绑定”引向申诉。“微信用户补充用户名密码”是代码自创的路径，文档只有 M-04 注册新账号的路径。my.vue 的“修改密码”对未设密码的微信用户同样可点。
  - `grouporder-client/src/pages/account/bind.vue:22` 「@click="setPwd">设置用户名密码」
  - `docs/00-product/DECISIONS.md:51` 「平台账号可以一对一绑定微信」
- 现状核对：bind.vue 仍只有“设置用户名密码”按钮，全库无 bindWeixin 类方法；OPEN_ISSUES 与 ADMIN_KNOWN_ISSUES 均未登记绑定问题。
- 影响：用户无法自助完成绑定；D-030 的一对一绑定、找回能力（依赖已绑定微信）在小程序里都无法触达；验收 8.1 中“平台账号绑定微信”一条不能通过。
- 建议：按 PRD/UX（高优先级）补齐：CLOUD_API 增加明确的绑定方法（入参、一对一校验、双方数据检查、并发处理）与 M-05 的绑定按钮；先解决“存活 uid”决策；删除或在文档中登记“设置用户名密码”这一自创入口；bind.vue 提示文案改为与 D-055 一致。

### 活动生命周期

#### I-02 · 严重 · 发起接龙tab每次onShow重置，子页返回清空草稿

- 主题：活动生命周期；类型：实现偏离；状态：仍成立·已登记；独立发现者：3；已独立复核；登记位置：OPEN_ISSUES 阻断级（第129行）
- 事实：D-061 只规定「发起接龙」tab 恒为新建态、编辑草稿走非 tabBar 页。UX_FLOW_SPEC F-M03 的正常路径是 M-10 填资料，再进 M-11 添加商品，回到 M-10，再进 M-12 预览。faqi.vue 在每次 onShow 调 formRef.reset()（line 22-23）。uni-app 中从 navigateTo 的子页 navigateBack 回来同样触发页面 onShow。activity-form 的 addGoods、reuseGoods 先 ensureDraft 创建服务端草稿再 navigateTo。子页返回后 reset() 清空 form、goods、endDate，并把 draftId 置空（line 264-270）。此后 reloadGoods 因 draftId 为空直接 return（line 236），goPublish 也拿空 id 跳转 publish?id=（line 260）。首次创建含商品的活动的主流程必然走到这一步，用户看到空白表单，服务端遗留孤立草稿，只能从我发起的里找回。规格未区分「切入 tab」与「子页返回」。
  - `grouporder-client/src/pages/hall/faqi.vue:23` 「formRef.value && formRef.value.reset();」
  - `docs/03-release/OPEN_ISSUES.md:129` 「`onShow` 无条件 `reset()`，从商品编辑 / 复用历史商品 / 商品库返回时」
- 现状核对：faqi.vue 仍在 onShow 无条件 reset()，未修复；OPEN_ISSUES 阻断级已登记同一问题。 （已合并 1 个重复项）
- 影响：团长每次加完商品回来表单就被清空，只能去‘我发起的’找回草稿；同时每次操作都会遗留一份无人管理的草稿，24 小时后又变成 draft_stale 待办。
- 两种合理但互不兼容的实现：读法A：tab 每次 onShow 都重置，包括从子页返回（当前实现，创建流程中断）。读法B：仅从其他 tab 切入时重置，子页返回保持表单与 draftId。两者各自符合 D-061 字面「恒为新建态」，但 B 才符合 F-M03 的正常路径。
- 建议：规格补一句：仅‘从其他 tab 切入’时重置，从 M-11/M-28/M-31 等子页返回不重置。或者创建草稿后立即 redirect 到非 tabBar 的编辑页（edit.vue），让 tab 页只承担新建入口。

#### I-12 · 高 · 封面图必填但客户端无图片上传入口

- 主题：活动生命周期；类型：实现偏离；状态：仍成立·已登记；独立发现者：5；登记位置：OPEN_ISSUES.md:143
- 事实：D-041：活动必须有封面图、商品必须有封面图，轮播图和详情图可选。服务端 activityCreateDraft 与 goodsCreate 用 assertParam 强校验封面。客户端 activity-form.vue 里 form.cover_image 初值为 null，payload 原样上传，页面上没有选图、上传控件；goods-edit.vue 同样以 cover_image:null 调 goodsCreate。全客户端 grep chooseImage / chooseMedia / uploadFile 无任何命中（uni_modules 除外）。轮播图 images、详情图 detail_images 同样没有入口。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:153` 「assertParam(params.cover_image, '活动必须包含封面图')」
  - `docs/03-release/OPEN_ISSUES.md:143` 「`cover_image` / `images` / `detail_images` 无任何 `chooseImage`」
- 现状核对：客户端 src 无 chooseImage/uploadFile 入口（仅 uni_modules），OPEN_ISSUES §代码待办已登记该问题。
- 影响：团长在小程序里点保存草稿、添加商品、复用商品都会收到‘必须包含封面图’，无法创建任何活动或商品，发起流程不可用。图片上传的格式、大小、张数交互、审核前的图片检测占位也没有可验收的页面规格。
- 建议：以 D-041 为准，在 M-10/M-11 补封面、轮播图、详情图的选择与上传（uniCloud 云存储），并在 UX_FLOW_SPEC 补充图片规格：格式、大小、压缩、上传失败提示、9 张上限提示。

#### I-23 · 高 · 团长端缺撤回入口、取消草稿入口与草稿提示条

- 主题：活动生命周期；类型：实现偏离；状态：仍成立·未登记；独立发现者：3
- 事实：UX_STATE_MATRIX 规定草稿可“编辑、预览、提交审核、取消草稿”，审核中团长可“查看、撤回至草稿”；PRD 规定进行中活动允许编辑活动资料、调整截止时间；UX §6 规定点“发起接龙”tab 时若有未提交草稿，顶部显示“你有 N 个未完成的接龙草稿，继续编辑 / 忽略”提示条。客户端 manage.vue：“发布/审核状态”入口仅在草稿或进行中显示，审核中（状态 1）没有入口，而撤回按钮只在 publish.vue 的状态 1 分支，因此审核中的活动无法从管理页到达撤回；“截止/取消活动”仅在进行中显示，草稿无取消入口（activityCancel 服务端支持草稿）；“继续编辑草稿”仅草稿显示，进行中没有编辑活动资料或调整截止时间的入口；faqi.vue 未实现草稿提示条。
  - `grouporder-client/src/pages/activity/manage.vue:29` 「act.status === 0 || act.status === 2」
  - `grouporder-client/src/pages/activity/manage.vue:34` 「v-if="act.status === 2" class="cell" @click="close"」
  - `docs/01-ux/UX_FLOW_SPEC.md:241` 「你有 N 个未完成的接龙草稿，继续编辑 / 忽略」
- 现状核对：manage.vue 仍无审核中入口，取消入口仅 status===2；close.vue 才调 activityCancel；faqi.vue 无草稿提示条（OPEN_ISSUES 仅登记 faqi reset 问题）；UX_FLOW_SPEC 241 行仍要求提示条。
- 影响：团长提交审核后无法撤回，草稿无法取消，活动上线后无法调整截止时间或改文案；产品负责人已确认的草稿提示条缺失，团长不知道自己有未提交草稿。
- 建议：以 UX_STATE_MATRIX 与 PRD 为准补齐：manage.vue 审核中显示“撤回审核”入口；草稿显示“取消草稿”（二次确认）；进行中提供“编辑活动资料/调整截止时间”入口并在 D-079 之后与重审提示联动；faqi 增加草稿提示条。
- 需拍板：团长放弃一个草稿时：A) 取消草稿（保留为‘已取消’记录，可在我发起的中看到）；B) 删除草稿（从列表消失，不留记录）。选哪个？

#### I-29 · 高 · 管理页缺审核中撤回入口与进行中编辑入口

- 主题：活动生命周期；类型：实现偏离；状态：仍成立·未登记；独立发现者：1；已独立复核
- 事实：PRD 5.2 规定审核中允许撤回至草稿，进行中允许团长编辑活动资料和调整截止时间。manage.vue 的「发布 / 审核状态」入口仅在 status 为 0 或 2 时显示，审核中（status=1）不显示（line 29）；「继续编辑草稿」仅 status=0（line 28）。撤回按钮只在 publish.vue 的 status===1 分支内。团长从我发起的或待办进入的都是 manage 页，审核中的团长在管理页找不到撤回，只能靠先前停留的 publish 页。进行中的活动没有任何入口进入 edit 或修改标题、说明、截止时间；close.vue 只有手动截止与取消，无改截止时间。
  - `grouporder-client/src/pages/activity/manage.vue:29` 「act.status === 0 || act.status === 2」
  - `grouporder-client/src/pages/activity/publish.vue:31` 「<button class="btn" :loading="busy" @click="withdraw">撤回审核</button>」
  - `grouporder-client/src/pages/activity/manage.vue:28` 「v-if="act.status === 0" class="cell" @click="edit"」
- 现状核对：manage.vue 仍只在草稿或进行中显示发布/审核入口，审核中无入口；撤回按钮仍只在 publish.vue。OPEN_ISSUES 未登记此前端入口缺口（D-079 落地待办只涉服务端）。
- 影响：审核中无法撤回、进行中无法改截止时间或文字，PRD 3.1 与验收项无法通过。
- 两种合理但互不兼容的实现：读法A：审核中的撤回入口放在 manage 页，进行中的编辑入口也在 manage 页。读法B：撤回只放在提交后停留的 publish 页，管理页只做统计与分享，进行中的编辑靠别处入口。文档未规定入口位置，但 UX M-20 已列「活动及审核状态」为管理页职责。
- 建议：以 PRD 5.2 为准补全前端入口；进行中编辑时按 GOODS_LIB_SPEC 5.4 弹出「需重新审核」确认。

### 活动内商品

#### I-13 · 高 · 编辑商品带库存限购被拒，改价确认码不一致

- 主题：活动内商品；类型：实现偏离；状态：仍成立·未登记；独立发现者：5
- 事实：CLOUD_API 把库存和限购调整拆到 goodsAdjustStock，goodsUpdate 入参不含这两项，服务端一旦收到就返回 INVALID_PARAM。UX M-11 商品编辑页却包含总库存和每人限购。goods-edit.vue 编辑分支每次都在 goodsUpdate 里带 total_stock 和 per_user_limit，因此已有商品的保存必然被拒。同一页面判断改价二次确认用的码是 PRICE_CHANGE_NEED_CONFIRM，契约（CLOUD_API §14.1 说明）规定的是 INVALID_PARAM 加 detail.require_confirm，全库只有前端用了该码，二次确认流程走不通。
  - `grouporder-client/src/pages/activity/goods-edit.vue:122` 「total_stock: form.value.total_stock || 0,」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:907` 「库存与每人限购请使用 goodsAdjustStock 调整」
  - `grouporder-client/src/pages/activity/goods-edit.vue:134` 「err.errCode === 'PRICE_CHANGE_NEED_CONFIRM'」
- 现状核对：客户端 goods-edit.vue 编辑仍带 total_stock/per_user_limit，服务端 activity-co:907 拒绝；确认码仍判 PRICE_CHANGE_NEED_CONFIRM，服务端返回 require_confirm。OPEN_ISSUES 未登记。
- 影响：团长无法保存对已有商品的任何修改（改名、改价、换图），已产生订单商品的二次改价确认也无法触发。
- 建议：以 CLOUD_API 为准修客户端：编辑保存时 goodsUpdate 不带库存与限购，变更部分再调 goodsAdjustStock；改价确认按 INVALID_PARAM + detail.require_confirm 判断。UX M-11 应写明「一次保存拆两次调用」的失败处理（一次成功一次失败时的提示）。

### 商品库与复用

#### I-06 · 高 · D-063 复用商品逐项确认门无任何实现

- 主题：商品库与复用；类型：实现偏离；状态：仍成立·已登记；独立发现者：10；登记位置：OPEN_ISSUES §3.2（GOODS_LIB:504/:510 与 AC-GL-007 条目，约第99行）
- 事实：D-063、GOODS_LIB_SPEC §5.3、AC-GL-007、PRD 都要求复用来的商品的价格、总库存、每人限购标记为「待确认」，全部确认前活动不能提交发布。代码里 libCopyToActivity 只把 lib.last_* 写进新商品，注释写着「须逐项确认」，没有任何标记字段。activitySubmitReview 只校验「至少一个商品」和自提地址，不看确认状态。客户端 activity-form.vue 的 canPublish 只判断标题、商品数、草稿 ID、自提地址。M-28 history-goods.vue 加入后直接返回，没有确认卡片，也没有「待确认」高亮。全库 grep confirmed/待确认/unconfirmed/pending_confirm，业务代码无命中。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:317` 「活动至少需要一个商品才能提交发布」
  - `grouporder-client/src/components/activity-form/activity-form.vue:118` 「const canPublish = computed(() =>」
  - `docs/03-release/OPEN_ISSUES.md:99` 「确认状态只存前端，服务端无法校验，AC 不可验收」
  - `docs/02-arch/GOODS_LIB_SPEC.md:510` 「实现上用前端状态承载即可（不落库）」
- 现状核对：服务端 activitySubmitReview 仍只校验商品数，客户端 canPublish 无确认条件，业务代码无确认标记；OPEN_ISSUES 已登记为文档层待办（确认状态仅存前端、AC 不可验收），代码落地未单列。 （已合并 1 个重复项）
- 影响：复用商品会静默沿用上次的价格、库存、限购直接发布，出现 D-063 要防的收款差错和超卖。AC-GL-007、AC-AC-009 验收必然失败。复用历史接龙（D-067）要求共用同一组件，也同样没有确认门。
- 建议：以 D-063 为准，在活动提交发布前补上确认门。确认状态放哪里见另一条 underspecified 条目，先定方案再实现。
- 需拍板：复用商品的“待确认”状态怎么保证不丢？A. 落库：goods 上加一个待确认布尔字段，提交发布时服务端校验全部已确认（改动 goods 表，重开、换设备都不丢）；B. 只用前端状态：不加字段，重进草稿后视为全部已确认（不改表，但与“必须逐项确认”的强度不符）。另：进行中活动复用商品时是否也必须先确认再入库？

### 订单与库存

#### I-03 · 高 · 改单时未改动明细按当前价重取快照

- 主题：订单与库存；类型：实现偏离；状态：仍成立·已登记；独立发现者：12；登记位置：OPEN_ISSUES:173
- 事实：D-018 与 PRD 5.3 规定改价后已提交订单按快照保留不受影响。D-049 允许截止前修改订单内全部资料。DATA_MODEL 250 只说按差额更新 sold_qty，没有规定未改动的明细以及数量变化的明细用旧快照价还是当前价。代码 orderUpdate 只要明细有变，就删除全部旧明细并按当前 goods.price 重建，未变化的行也被改成新价，旧价格与旧金额消失。代码注释称此为「与新下单口径一致」，属于代码替产品做了决定。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:482` 「价格按【当前商品价格】重新取快照，与新下单口径一致」
  - `docs/03-release/OPEN_ISSUES.md:173` 「改单时未改动的明细也按当前价重新快照」
- 现状核对：代码 482 行仍按当前价重取快照，已登记于 OPEN_ISSUES:173；PRD 尚未明确未变动明细保留原价的规则。
- 影响：团长中途改价后，参与者只要改备注以外的任一明细，整单金额被悄悄按新价重算；线下收款金额与参与者下单时看到的不一致。
- 建议：需产品决定并写入 PRD 5.4：建议未变动明细保留原快照，仅新增行用当前价，数量增减的行是否沿用原价须明确。
- 需拍板：团长改价后，参与者修改旧订单时如何计价？A) 已有明细一律保留原价，新增的商品用当前价，已有商品加量的部分也用当前价。B) 整张订单一律按改单时的当前价重算。C) 已有明细整行保留原价，含加量部分，只有新增的商品用当前价。

#### I-07 · 高 · 客户端无改单入口，修改订单变成重新下单

- 主题：订单与库存；类型：实现偏离；状态：仍成立·已登记；独立发现者：10；登记位置：OPEN_ISSUES:137
- 事实：D-049 与 PRD 规定参与者在截止前可修改订单内全部资料（增删明细、改数量、换收货信息、改备注），移除全部商品时提示取消订单。云对象 orderUpdate 已实现。但小程序端全库没有任何页面调用 orderUpdate（仅 src/api/index.js 有转发定义）；M-19 的 edit() 只做 navigateTo 到活动详情，注释写明“直接回活动详情再走一遍下单流程”。用户点「修改订单」实际进入新建订单流程，提交后产生第二张有效订单，原订单仍有效。收货信息、备注、移除商品、「移除全部商品时提示取消」均无入口。
  - `grouporder-client/src/pages/order/detail.vue:70` 「这里直接回活动详情再走一遍下单流程」
  - `docs/03-release/OPEN_ISSUES.md:137` 「「修改订单」实际是重新下单，`orderUpdate` 从未调用」
- 现状核对：client 除 api/index.js 外无 orderUpdate 调用，detail.vue:70 仍回活动详情重新下单；OPEN_ISSUES:137 已登记。
- 影响：用户想把 2 份改成 3 份，结果是多出一张订单，已购买份数、库存占用、限购额度翻倍；改地址、改备注、移除商品做不到。验收 PRD 8.3「修改后明细、统计、库存占用正确」无法通过。
- 建议：以 D-049 与 PRD 5.4 为准：新增改单页（预填当前明细、收货信息、备注）调用 orderUpdate；全部移除时弹出取消订单确认并调用 orderCancel。

#### I-09 · 高 · 限购与库存校验非原子，并发可绕过

- 主题：订单与库存；类型：实现偏离；状态：仍成立·已登记；独立发现者：8；登记位置：OPEN_ISSUES §3.2 (order-co:206-212 / stock.js) 及 §4 第3项
- 事实：D-012 明确「拆分为多张订单不能绕过限购」，PRD 5.3 与 D-044 规定有限每人限购与已购买份数变更由服务端原子完成。DATA_MODEL 8.2 给出的机制是聚合 order-item 求和再比较，stock.checkUserLimit 与 orderCreate/orderUpdate 也按此实现：查询求和、比较、扣库存、写订单是分开的步骤，没有对「用户+商品」的条件写。同一用户两台设备或连点两次不同订单同时提交，两个请求读到相同的已购数，均通过校验。另外总库存扣减用的 total_stock 是请求开头读到的旧值，团长在此期间调低 total_stock（goodsAdjustStock 也是先读 sold_qty 再写）会出现 sold_qty 超过新总库存。文档只承认了小号绕过的「软约束」，没有承认并发绕过。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/stock.js:92` 「if (bought + addQty > goods.per_user_limit) {」
  - `docs/03-release/OPEN_ISSUES.md:158` 「限购是「聚合求和 → 比较 → 写入」先查后写，并发两单可突破每人限购」
  - `docs/03-release/OPEN_ISSUES.md:168` 「团长并发改小库存后仍按旧值放行」
- 现状核对：OPEN_ISSUES §3.2 已登记限购先查后写与 deduct 用旧 total_stock，建议计数文档加条件 inc；代码仍是聚合求和后比较。
- 影响：同一用户在并发下可超过限购；PRD 8.3「限购被超过时阻止提交」在并发场景验收不过。不确定点：uniCloud 单云函数内是否串行取决于部署，本条按多实例并发判断。
- 建议：PRD/D-044 优先。要么给「活动+商品+用户」引入条件自增的占用计数（与 sold_qty 同步增减），要么在 PRD 与 DATA_MODEL 8.2 明确限购为「尽力校验」的软约束并放宽验收表述。
- 需拍板：每人限购是否必须做到并发下也不超限？A：必须，增加按用户和商品的原子计数记录（多一张表或字段）。B：首版允许并发下极小概率超限，把 PRD 5.3 改为『仅库存由服务端原子完成，限购为事后聚合校验』。

#### I-17 · 高 · 确认页不处理不可购商品，GOODS_OFFLINE 整页跳转

- 主题：订单与库存；类型：实现偏离；状态：仍成立·未登记；独立发现者：4
- 事实：UX F-M04 要求库存或限购变化时保留仍有效的选择并提示调整，全部商品不可购买时显示明确空态；状态矩阵要求库存竞争时指出具体商品可用量变化。实现：orderPreview 逐项返回 unavailable[]（含 remain_qty、per_user_limit），confirm.vue 只把它们画成红色行，submit 时仍把 items.value 全量传给 orderCreate；orderCreate 对任一商品 assertGoodsSelectable 或库存失败就整单拒绝。页面没有移除该行、改数量或回退的操作，submittable 只判断 preview.items 非空，不判断 unavailable 是否为空，也没有全部不可购买的空态文案。errText 不展示 remain_qty。另外 request.js 把 GOODS_OFFLINE 映射为整页 M-26「已被平台下架」，而 CLOUD_API 2.3 写明该码仅影响该商品。
  - `grouporder-client/src/pages/order/confirm.vue:86` 「const submittable = computed(() => {」
  - `grouporder-client/src/pages/order/confirm.vue:19` 「v-for="u in preview.unavailable || []"」
  - `grouporder-client/src/common/grouporder/request.js:35` 「GOODS_OFFLINE: RESULT_TYPE.OFFLINE,」
- 现状核对：confirm.vue 仍只把 unavailable 画成红行，submittable 只判断 items 非空，GOODS_OFFLINE 仍映射整页 OFFLINE；OPEN_ISSUES 未登记该问题。
- 影响：只要选中的商品里有一个刚售罄、停售或被下架，用户就无法完成下单，也看不到还剩多少可买。商品被治理下架时用户会看到「活动已被平台下架」，误以为整个活动不可用。
- 建议：以 UX_FLOW_SPEC F-M04 与状态矩阵为准：confirm 页对 unavailable 项提供「移除/改数量」，提交只带有效项；全部不可购买时显示「当前暂无可购买商品」；GOODS_OFFLINE 和 GOODS_OFF_SALE 不再整页跳 M-26，只对商品行提示。

#### I-18 · 高 · 订单号冲突不重试

- 主题：订单与库存；类型：实现偏离；状态：仍成立·已登记；独立发现者：4；登记位置：OPEN_ISSUES §3.2 (约160行、§4 第3项)
- 事实：DATA_MODEL §7 规定订单号 YYMMDD-{short_code}-{4位随机}，唯一性靠唯一索引，「生成冲突时重试」。orderCreate 只调用一次 buildOrderNo；order_no 唯一索引冲突时，进入 catch，先还库存，再按 idempotent_key 查已有订单，查不到就把原始错误抛出，没有重新生成订单号。同一活动同日订单的随机空间只有 10000，按 D-024 的单活动 500 人（每人可多单）估算，生日悖论下出现冲突的概率接近 1，每张新订单的冲突概率约为已有订单数/10000（300 单时约 3%）。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:245` 「idempotent.buildOrderNo(activity.short_code, ctx.now)」
  - `docs/03-release/OPEN_ISSUES.md:160` 「建议扩到 6-8 位随机 + 冲突重试」
- 现状核对：orderCreate 仍只调用一次 buildOrderNo，冲突无重试；OPEN_ISSUES §3.2 已登记，建议扩位加冲突重试。
- 影响：热门活动里会随机出现「下单失败」，用户重试才成功；用户看到的是通用错误，可能以为库存不足而放弃。冲突概率随订单数增长，正好出现在最需要稳定的高峰期。
- 建议：以 DATA_MODEL §7 为准：orderCreate 在 order_no 冲突时最多重新生成 N 次（建议 5 次），仍失败才报错；若产品希望更少冲突，可把随机位放宽到 5–6 位（同时更新示例和口头核对的设计意图）。

#### I-24 · 高 · orderUpdate 无版本闸门，并发与失败可致库存错乱

- 主题：订单与库存；类型：实现偏离；状态：仍成立·已登记；独立发现者：3；登记位置：OPEN_ISSUES §3.2 (order-co:408-500) 及 §4 第3项
- 事实：PRD 要求取消后库存占用正确释放、参与者操作不得互相影响，DATA_MODEL §8.3 只给下单定义了幂等。orderUpdate 在读取订单状态后，依次扣库存、返还库存、删除全部旧明细、重写新明细、更新订单，全程没有 status=有效 的条件，也没有版本号。与 orderCancel 并发时：cancel 先把订单置为已取消并按旧明细返还库存，随后 update 又按旧明细算出的 delta 扣或还库存并重写明细，订单已取消却有明细、sold_qty 与有效明细之和不一致。两次改单同时提交则都基于同一份旧明细计算 delta。中途任一步失败（删除明细后写入失败）没有补偿，订单会丢明细。orderUpdate 也没有幂等键，而 UX 状态矩阵要求 M-19 重复点击返回首次结果。
  - `docs/02-arch/CLOUD_API.md:461` 「状态机自身（带条件更新，重复取消只返还一次）」
  - `docs/03-release/OPEN_ISSUES.md:159` 「`orderUpdate` 非原子无闸门」
  - `docs/03-release/OPEN_ISSUES.md:137` 「`orderUpdate` 从未调用」
- 现状核对：OPEN_ISSUES §3.2 已登记 orderUpdate 非原子无闸门，建议 version 条件更新加差量明细；另 §3.1 指出客户端从未调用 orderUpdate。orderUpdate 缺幂等键的点未单独登记。
- 影响：sold_qty 与有效明细不一致，库存被永久虚占或超卖，团长统计与清单与库存数不符。
- 建议：在 DATA_MODEL §8 补「改单」的并发与幂等规则：更新订单需带 status=有效 和订单版本条件，失败路径需有补偿；orderUpdate 增加幂等或版本入参。

#### I-26 · 高 · 订单明细查询固定 500 条静默截断

- 主题：订单与库存；类型：实现偏离；状态：仍成立·已登记；独立发现者：2；登记位置：OPEN_ISSUES §3.2 (约182行)
- 事实：订单列表的明细查询 limit(500)，而分页 MAX_PAGE_SIZE=100，每单最多 50 个商品，理论上一页可含 5000 条明细。超出 500 后订单显示的明细不完整，团长订单明细（order-stat 页）与 sold_qty 展示不一致。文档没有规定每单商品数上限或列表页大小与之匹配。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:321` 「.limit(500).get()」
  - `docs/03-release/OPEN_ISSUES.md:182` 「明细 `limit(500)` 静默截断」
- 现状核对：order-co 第321、686行仍是 limit(500)；OPEN_ISSUES §3.2 已登记（行号已漂移）。
- 影响：多商品订单较多时，团长看到的订单明细少于实际，作废、核对的依据不完整。
- 建议：文档补充每单商品数上限并据此定页大小，或代码按订单分页取明细，不设固定 500。

### 清单与导出

#### I-04 · 高 · 导出订单与明细硬编码 limit 静默截断

- 主题：清单与导出；类型：实现偏离；状态：仍成立·已登记；独立发现者：12；登记位置：OPEN_ISSUES 代码待办（export-co _collect，第161行）
- 事实：D-024 规定单活动按 500 人估算，PRD 允许同一用户在同一活动创建多张有效订单，单商品上限 50。导出取订单 limit(600)、明细 limit(2000)，没有分页、也没有超限报错。商品汇总却用聚合计算（无截断），因此汇总与明细行可能不一致。文档中没有订单总数或明细总数上限的规定（已 grep 600、2000、订单上限，全库无定义）。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:102` 「.orderBy('create_date', 'asc').limit(600).get()」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:108` 「.limit(2000).get()」
  - `docs/03-release/OPEN_ISSUES.md:161` 「超出静默丢弃，清单缺行团长会漏发」
- 现状核对：export-co 仍有 limit(600)/limit(2000)；OPEN_ISSUES 已登记静默丢弃，但文档仍未定义订单/明细上限。
- 影响：人数或商品较多的活动导出的清单静默缺少订单或明细行，团长按缺行清单发货，PRD 的统计准确率指标（清单汇总与有效明细一致）无法达成。
- 建议：文档补充单活动订单数、每单商品数上限，或规定清单必须分页取全。代码去掉硬编码截断，超过实现能力时明确报错。以 D-024 与 PRD 5.5 为准。
- 需拍板：同一用户在一个活动里最多可以下几张订单？A：限制为固定张数（请给出数字，例如 5 张），据此推算清单上限；B：不限制，清单必须支持 500 人 × 任意订单数的全量导出（需分批生成）。

### 大厅待办与分享

#### I-10 · 高 · 待生成清单待办不查导出记录，永不消退

- 主题：大厅待办与分享；类型：实现偏离；状态：仍成立·未登记；独立发现者：8
- 事实：UX_STATE_MATRIX 第 11 节规定：触发条件是「活动已截止且从未成功生成过清单」，消退条件是「成功生成一次清单」，不写关闭表。todoList 对团长名下所有 status=CLOSED 的活动无条件产出该待办，全文件没有引用 grouporder-export-log 或清单版本。结果是每个已截止活动都永久留在优先级 2，并计入接龙 tab 角标（前端角标 = 档 1 + 档 2），只有用户手动点「关闭」才消失。
  - `docs/01-ux/UX_STATE_MATRIX.md:156` 「活动已截止且从未成功生成过清单 | 成功生成一次清单」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:473` 「push(TODO.ACTIVITY_CLOSED_EXPORT, a._id, a.title,」
- 现状核对：user-co 仍对已截止活动无条件 push ACTIVITY_CLOSED_EXPORT，未查 export-log；UX_STATE_MATRIX 消退条件为成功生成一次；OPEN_ISSUES 与 ADMIN_KNOWN_ISSUES 均未登记。
- 影响：团长每场活动截止后都有一条不会自行消失的待办和角标，待办的提醒价值丧失；另外 activities 查询上限 200 条，历史越多越挤占其他待办。
- 建议：以 UX_STATE_MATRIX 第 11 节为准：todoList 对已截止活动查 export-log 生成成功事件（且未被后续作废使其失效，规则需一并说明），无成功记录才出待办。
- 需拍板：审核中到期而自动关闭的活动，团长应看到什么？A：不显示待生成清单，改为显示「审核期间已过截止时间，活动未开放」提示（优先级 2）。B：不做额外提示，仅在我发起的列表显示已截止状态。

#### I-11 · 高 · 工作台待办消退条件与实现不符，领取后举报消失

- 主题：大厅待办与分享；类型：实现偏离；状态：仍成立·未登记；独立发现者：6
- 事实：OPS 4.2 与 D-070 规定待办只在对象状态转入终态时才消退（举报转为已结案，隐私事项转为已完成），每档标题显示数量，导航角标为第 1、2 档合计，并展示本人最近处理记录。代码 workbenchTodo：(1) 举报只查 status=PENDING(1)，领取（2 处理中）后即从所有人的待办消失，复核中（4）也从不出现，没有「本人处理中」的入口；(2) 隐私事项只含 1/2/3，执行失败（5）不出现，与「转为已完成才消退」不符；(3) 每个来源 limit(50)，count 取 items.length，超过 50 条时数量与角标被截断；(4) 出参没有「本人最近处理记录」，index.vue 也不消费 badge_count，全前端搜不到该字段；(5) 「分配给本人」没有分配机制，所有账号看到同一份列表。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:2097` 「.where({ status: REPORT_STATUS.PENDING })」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:2151` 「badge_count: level1.length + level2.length,」
  - `docs/00-product/DECISIONS.md:88` 「消退直接复用各对象的状态机」
- 现状核对：workbenchTodo 举报仍只查 PENDING，count 取 items.length 且 limit(50)，OPEN_ISSUES 与 ADMIN_KNOWN_ISSUES 均未登记；D-070 要求消退复用状态机。
- 影响：运营领取举报后不结案，该举报不再出现在任何人的工作台，违规内容长期在线无人跟进；待办超过 50 条时角标与实际不符；隐私事项执行失败后无人再看到。
- 建议：以 OPS 4.2 与 D-070 为准：举报纳入 1/2/4 状态（2 仅对领取人或全员显示需先定），隐私事项纳入 5，数量用 count() 而非 items.length，补 badge 展示；「最近处理记录」明确来源（oplog 按 operator_uid 取最近 N 条）与 N；删去「分配给本人」或定义分配机制。
- 需拍板：复核中的举报要不要进工作台待办？A 要，进第 1 档；B 不要，由发起复核的人自行跟进。隐私事项处于三年「限制处理中」时算不算待办？A 不算，到期后才进入；B 算。

#### I-14 · 高 · 我参与的页对已分组 orderMyList 二次分组

- 主题：大厅待办与分享；类型：实现偏离；状态：仍成立·已登记；独立发现者：5；登记位置：OPEN_ISSUES 客户端缺陷清单（jielong.vue:140 条目）
- 事实：CLOUD_API 与 orderMyList 实现都是：list[] 是按活动分组的对象 { activity_id, title, cover_image, activity_status, governance_status, delivery_type, end_time, orders:[...] }。jielong.vue 的 loadJoin 却把 data.list 当作订单数组，再按 activity_id 分组；每个‘订单’实际是一个活动分组，没有 _id、order_no、total_qty、status。渲染结果：每个活动下只有一行订单，订单号空、‘undefined 份’，点击订单以 undefined 作 id 进入订单详情。页面读的 o.activity_title 在出参里不存在。另外分页按订单数计，pageSize 固定 100，超过 100 张订单后被静默截断，页面无翻页；返回的活动状态、治理状态、交付方式页面都没显示。
  - `grouporder-client/src/pages/hall/jielong.vue:140` 「for (const o of data.list || []) {」
  - `docs/03-release/OPEN_ISSUES.md:131` 「把服务端已分组的 `orderMyList` 结果再当订单分组一次」
- 现状核对：jielong.vue 的 loadJoin 仍按订单数组再分组，OPEN_ISSUES 已登记为严重待办。
- 影响：M-18 不可用：用户看不到订单号、份数、金额，也进不了正确的订单详情；这是参与者查看历史订单的唯一入口。
- 建议：以 CLOUD_API §14 的分组出参为准，直接渲染 list[].orders，去掉前端二次分组；补充 M-18 是否展示活动状态标签（已截止、已取消、已下架）和翻页规则（UX 文档目前没写）。

### 举报与治理

#### I-19 · 高 · 活动详情无商品级举报入口，说明必填与模型不一致

- 主题：举报与治理；类型：实现偏离；状态：仍成立·未登记；独立发现者：4
- 事实：PRD 8.7、提审清单 2.6 要求活动详情提供覆盖活动和单个商品的举报入口。云对象 reportSubmit 支持 goods_id，但活动详情页只有一个底部“举报”按钮，跳转仅携带 activity_id，商品列表每项没有举报入口，goods_id 无处传入。另 DATA_MODEL 的 reason_desc 为非必填，前端 submit.vue 的 valid 要求说明非空。
  - `grouporder-client/src/pages/activity/detail.vue:147` 「'/pages/report/submit?activity_id=' + activityId.value」
  - `grouporder-client/src/pages/report/submit.vue:55` 「const valid = computed(() => reasonIndex.value >= 0 && !!desc.value.trim()」
- 现状核对：detail.vue 仍只有一个整体举报按钮，跳转仅带 activity_id；submit.vue 的 valid 仍要求说明非空，DATA_MODEL 为非必填；OPEN_ISSUES 无登记。
- 影响：D-054 的单商品下架链路从用户侧走不通（商品级举报无法产生）；提审清单 2.6 不通过，存在被拒审风险。
- 建议：以 PRD 为准，商品卡片增加举报入口并传 goods_id；说明是否必填由产品确认后统一前后端与数据模型。
- 需拍板：游客点举报：A) 先要求登录再举报（与提交订单一致）；B) 允许匿名举报（结果无法通知）。选哪个？

#### I-30 · 高 · reviewDetail 检测记录仅按版本号过滤，可能查不到本活动记录

- 主题：举报与治理；类型：实现偏离；状态：仍成立·未登记；独立发现者：1；已独立复核
- 事实：UX_FLOW_SPEC 190、UX_STATE_MATRIX 113 与 CLOUD_API 554 要求待审详情展示待审内容版本关联的检测记录，DATA_MODEL 913 的索引为 object_type + object_id + content_version。代码 reviewDetail 只用 content_version（字符串）过滤 grouporder-content-check，不带 object_id，按创建时间倒序取 60 条，再在内存中按活动或商品 id 过滤。content_version 是从 1 起的自然数，首次提交的活动都是 1，平台上晚于本活动的其他版本 1 检测记录超过 60 条后，本活动记录被挤出，审核人拿到空的检测记录。自动模式下待审活动本就因检测命中入队，正是最需要看命中原因的场景。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:907` 「.where({ content_version: String(activity.content_version) })」
  - `docs/02-arch/DATA_MODEL.md:913` 「`object_type + object_id + content_version`」
- 现状核对：reviewDetail 仍只按 content_version 查询后内存过滤，OPEN_ISSUES 未登记该问题。
- 影响：人工审核模式下审核人在没有检测命中信息的情况下放行活动；自动模式下「检测命中需人工」的原因看不到，审核结论缺少依据。
- 两种合理但互不兼容的实现：读法一：按活动与其商品的 object_id 集合加版本号在库中过滤（与文档索引一致）；读法二：按版本号全平台取前 60 条再内存过滤（现状），数据量小时表面可用，量大后检测记录丢失。后者不符合文档。
- 建议：按 CLOUD_API 与 DATA_MODEL 索引（object_type + object_id + content_version）改为以活动及其商品的 object_id 集合加版本号查询。

### 后台账号与审计

#### I-15 · 高 · 角色/权限点/菜单删除未走 delete 确认与审计

- 主题：后台账号与审计；类型：实现偏离；状态：仍成立·未登记；独立发现者：5
- 事实：D-074 与 OPS 8.4 要求删除类操作统一用输入 delete 的确认组件，删除写审计，且“同一套确认组件供所有删除类操作复用，不各页自画”。实际只有 A-15 账号列表实现了 delete 弹窗。system/role/list.vue 与 system/permission/list.vue 的删除按钮直接调 udbRef.value.remove；system/menu/list.vue 用普通 showModal“是否删除该菜单？”后 remove。三处都是 unicloud-db 直连，没有 needConfirm 的 delete 输入，也没有经过云对象写 grouporder-oplog。ops-super 持有 DELETE_UNI_ID_ROLES、DELETE_UNI_ID_PERMISSIONS、DELETE_OPENDB_ADMIN_MENUS，所以删除会成功。
  - `grouporder-admin/pages/system/role/list.vue:219` 「udbRef.value.remove(id, {」
  - `grouporder-admin/pages/system/menu/list.vue:320` 「udbRef.value.remove(ids, {」
  - `docs/00-product/DECISIONS.md:92` 「删除类操作一律需要输入 `delete` 的二次确认」
- 现状核对：role/list.vue 的 confirmDelete 直接 udbRef.remove，menu/list.vue 用 showModal 后 remove，D-074 要求 delete 输入确认并写审计；OPEN_ISSUES 与 ADMIN_KNOWN_ISSUES 未登记。
- 影响：不处理的话，任一运营账号一次点击即可删除 ops-super 角色、权限点或菜单，导致全员失去后台入口，且没有任何审计记录可追溯。
- 建议：以 D-074 为准：三处删除改用同一 delete 确认组件；删除改由云对象执行并写 oplog（需在 DATA_MODEL 10.8 增加对应 action_type，见事件枚举一条）。
- 需拍板：运营账号能否被删除？A. 不能，只能停用（与现有 ops-super 权限一致，D-074 与 OPS 8.4 的适用对象去掉「运营账号」）；B. 可以删除，需授予 DELETE_UNI_ID_USERS，输入 delete 确认，并写审计（含删除前角色快照）。

#### I-25 · 高 · 鉴权依赖 token 载荷，停用撤权不保证立即生效

- 主题：后台账号与审计；类型：实现偏离；状态：仍成立·未登记；独立发现者：3
- 事实：OPS 3.1、14.1 要求以提交时刻的最新账号状态和权限为准，停用或撤权后已打开页面再次操作被拒绝。auth.createContext 只调用 uniID.checkToken(token)，ctx.roles、ctx.permissions 直接取 token 载荷的 role/permission；requirePermission 只比对该载荷。代码注释称停用时 checkToken 本身会失败，但 accountSetStatus 仅更新 status 字段，不清理该用户已签发的 token，roleAssign 变更角色后旧 token 的权限载荷不变。项目内没有 uni-id 配置文件可证明已开启每次校验状态或去除 token 中的权限（本次未读 uni_modules，不能断言 checkToken 内部行为，此处不确定）。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/auth.js:50` 「ctx.permissions = payload.permission || []」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/auth.js:91` 「账号被停用时 checkToken 本身会失败。」
- 现状核对：auth.js 仍直接取 token 载荷的 role/permission，注释仍称停用时 checkToken 会失败；OPEN_ISSUES 中 token 相关条目均与此无关，未登记。
- 影响：被停用的运营账号在 token 过期前可能继续查询明文订单与导出数据，且因为审计以该账号写入，事后难以区分是否被盗用。
- 建议：在 _before 里按 ctx.uid 重读 uni-id-users.status 与 role 并计算权限；accountSetStatus 停用时同时清空该用户 token 列表；把「token 有效期」写入凭证规则。

#### I-27 · 高 · accountSetStatus不校验目标账号类型与状态

- 主题：后台账号与审计；类型：实现偏离；状态：仍成立·未登记；独立发现者：2
- 事实：OPS 3.1/4.9 与 CLOUD_API 只规定 A-15 停用「其他运营账号」。accountSetStatus 按 _id 直接读 uni-id-users，该表同时存放微信小程序用户，代码没有校验目标 role 含 ops-super；任何运营可对任一平台用户传 status=1，把小程序用户封号，而全库没有「运营封停普通用户登录」这一功能规定（发布限制才是既定手段）。同时接受 status=0 写入且不检查当前值：DATA_MODEL 说明 uni-id 已把 status=4 定义为已注销（D-056），运营把 4 改回 0 即让注销账号复活，与 D-035/D-056 的注销与匿名化冲突。审计中启用与停用均记 account_disabled。roleAssign 同样不限制目标，可给任意小程序用户授予 ops-super。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:2177` 「assertParam(params.status === 0 || params.status === 1」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:2182` 「.where({ _id: params.user_id })」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:2187` 「const prevStatus = user.status === undefined ? 0 : user.status」
- 现状核对：代码仍按 _id 直接更新 uni-id-users，未校验目标持 ops 角色，也未排除 status=4 注销账号；启用与停用均记 ACCOUNT_DISABLED。相关登记在 OPEN_ISSUES 中未检出。
- 影响：运营的账号管理接口成为对全体用户的封号与「复活注销账号」通道，超出文档授权，也使注销后匿名化的用户重新可登录。
- 建议：服务端限定目标必须持有 ops-super 且当前 status 属于 {0,1}；明确是否给运营封停普通用户的能力（当前文档没有）；为启用另设 action_type（如 account_enabled）。

### 后台查询与统计

#### I-16 · 高 · 已取消活动订单仍计入团长有效汇总

- 主题：后台查询与统计；类型：实现偏离；状态：仍成立·未登记；独立发现者：5
- 事实：OPS 11.3 规定有效订单数只算“所属活动未取消”的订单，已取消活动只展示标注“仅供追溯”的取消前历史快照，其订单、份数、金额不计入团长当前有效汇总（11.2/14.7 同）。PRD 5.2 规定活动取消不逐单覆盖订单。代码 activityCancel 只改活动状态和取消字段，不改订单，订单 status 仍是有效。statOverview 按 activity_id 汇总 status=VALID 的订单和明细，不排除已取消活动，团长汇总里的有效订单数、有效总份数、预计金额因此包含已取消活动。statActivityDrill 对已取消活动只多返回一个 history_snapshot_only 标记，数字仍按有效指标返回；leader.vue 的团长汇总也按活动行累加，包含已取消活动。另外“取消前统计快照”在 DATA_MODEL、CLOUD_API 中没有对应字段或生成时点（grep 取消前、cancel_snapshot 无定义），实际只能按取消后的实时订单重算。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1442` 「for (const id of row._activity_ids) {」
  - `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:342` 「其历史订单、份数和金额不计入团长当前有效汇总」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1508` 「history_snapshot_only: activity.status === ACTIVITY.CANCELLED」
- 现状核对：statOverview 对全部活动的 VALID 订单累加、未排除已取消活动（ops-co index.obj.js:1442 附近），OPEN_ISSUES 与 ADMIN_KNOWN_ISSUES 均未登记。
- 影响：运营看到的团长累计有效订单、份数、预计金额包含已取消活动，验收 14.7“已取消活动不计入团长当前有效汇总”不通过；取消前快照没有定义，不同开发者会做成冻结值或实时重算两种实现。
- 建议：以 OPS 11.2/11.3 与 PRD 5.2 为准：statOverview 和团长汇总在累加时排除 status=已取消 的活动，已取消活动仅在下钻页以“历史快照”标签单独展示。在 DATA_MODEL 明确快照是取消时冻结存储，还是按取消后不再变化的订单实时重算。

#### I-20 · 高 · 统计导出静默截断且不跟随页面筛选

- 主题：后台查询与统计；类型：实现偏离；状态：仍成立·未登记；独立发现者：4
- 事实：D-072 与 OPS 4.6、11.4、14.7 都写“导出不受限制”。实现：(1) statOverview 只取 1000 条活动（无排序），超出的活动不进入任何团长汇总，且无提示；(2) statExport 的团长汇总只导出第一页（最多 100 个团长）；(3) statExport 按团长下钻时直接把 params 传给 statActivityDrill，未设分页，默认每页 20，只导出前 20 个活动；(4) overview.vue 调用 statExport 时传空参数，页面当前的时间范围和团长筛选不生效；(5) exportSearchResult 最多 50 页×100 条，即 5000 行，超出静默截断。文档未规定任何上限，也未规定导出是否跟随页面筛选。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1394` 「.limit(1000).get()」
  - `grouporder-admin/pages/grouporder/stat/overview.vue:146` 「callOps('statExport', {}, { loadingTitle: '导出中' })」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1315` 「for (let page = 1; page <= 50; page++) {」
- 现状核对：statOverview 仍 limit(1000)，overview.vue 调 statExport 传空参数，exportSearchResult 仍 50 页上限；未见登记。
- 影响：活动或团长较多时导出文件缺行而无提示，运营误以为拿到全量；页面选了近 7 天，导出的却是全部时间。
- 建议：以 D-072 为准去掉静默截断（分批读取全量或明确报错），导出跟随页面当前筛选；若需保留上限，先在 OPS 4.6 写明数值并在导出结果中提示截断。

#### I-31 · 高 · 申诉处理页缺核验结果输入，处理必然失败

- 主题：后台查询与统计；类型：实现偏离；状态：仍成立·未登记；独立发现者：1；已独立复核
- 事实：appealResolve 在云对象一开始就要求 identity_verify_result 非空（1687、1688 行），拒绝时要求 fail_reason 非空（1730、1731 行），且核验断言在双方有数据分支和其他分支之前执行。grouporder-admin/pages/grouporder/appeal/list.vue 没有任何核验结果输入框，提交时传 current.identity_verify_result || ''；全库只有 appealResolve 写该字段，待处理申诉中它为空，因此所有分支（受理、拒绝、双方均有数据）的提交都在核验断言处失败。单方有数据分支只有「处理原因」一个输入框，拒绝时 fail_reason 只在 both_have_data 为 1 时才被赋值（225 行），云对象随后报错。「处理原因」（内部）与向用户展示的 fail_reason 在单方分支没有分开。appealDetail 返回的是布尔值 applicant_has_data、target_has_data，页面 104、105 行读取的 data_summary 在 admin 目录内没有任何生产方，明细表永不显示。OPS 14.5 与 4.7 要求记录身份核验过程与结果，未核验不能执行解绑或重新绑定。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1688` 「assertParam(verifyResult, '必须记录身份核验过程与结果')」
  - `grouporder-admin/pages/grouporder/appeal/list.vue:222` 「identity_verify_result: current.value.identity_verify_result || '',」
  - `grouporder-admin/pages/grouporder/appeal/list.vue:104` 「v-if="(current.data_summary || []).length"」
- 现状核对：appealResolve 仍强制 identity_verify_result 非空，list.vue 仍传 current.identity_verify_result || ''，无输入框，data_summary 仍被读取；未登记。
- 影响：运营在后台无法完成任何一次申诉处理；上线后账号解绑与重新绑定功能实际不可用。
- 两种合理但互不兼容的实现：读法一：页面新增必填的身份核验输入，并把内部处理原因与对用户展示的失败原因拆成两个字段。读法二：保持单输入框，由页面把处理原因同时当作核验记录和 fail_reason 提交，两者内容相同。第二种会把内部信息暴露给用户，与云对象要求 fail_reason 不含内部信息的约束冲突。
- 建议：页面增加“身份核验过程与结果”必填输入，并把“内部处理原因”与“向用户展示的失败原因摘要”分成两个字段；单方分支的拒绝同样要求 fail_reason；去掉页面里读取不存在的 data_summary 的分支或让接口返回它。

#### I-32 · 高 · 审核模式配置页读写字段与数据模型不符

- 主题：后台查询与统计；类型：实现偏离；状态：仍成立·未登记；独立发现者：1；已独立复核
- 事实：DATA_MODEL §4.6 规定 review_mode 的 config_value 为 {mode:1|2}。云对象 configSet 校验 params.config_value.mode，config.getReviewMode 读 config_value.mode，configGet 无记录时回 {mode:1}。A-18 页面 load() 读 raw.value，恒得 undefined，currentMode 为 null；submit() 发送 config_value:{value:n}，configSet 因 mode 缺失抛“发布审核模式只能是自动或人工”。页面因此无法显示当前模式，也无法保存。页面 history 在 load() 中被固定置为空数组，配置修改记录区块 v-if=history.length 永不显示，但代码注释称该记录在 oplog，属于有意设计，不算缺陷。全库无别处适配层，js_sdk 和 common 封装中没有 config_value 转换。
  - `grouporder-admin/pages/grouporder/config/index.vue:123` 「const value = raw && typeof raw === 'object' ? raw.value : raw;」
  - `grouporder-admin/pages/grouporder/config/index.vue:156` 「config_value: { value: selectedMode.value },」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1021` 「config_value: doc ? doc.config_value : { mode: REVIEW_MODE.AUTO },」
- 现状核对：页面仍读 raw.value、提交 {value:n}，云对象要求 config_value.mode；未登记。
- 影响：运营无法在后台把审核模式切到人工，D-057 的可配置能力实际不可用；与“未配置时默认自动”叠加，上线后所有活动只能走自动放行。
- 两种合理但互不兼容的实现：读法一：config_value 是 {mode:n}，页面应读写 mode（文档与后端一致）。读法二：页面读写 {value:n}，后端应改成 value。文档只支持前者，无第二种合理读法，只是代码内部不一致。
- 建议：以 DATA_MODEL §4.6 与云对象为准（键为 mode），修改 A-18 页面的读取与提交；页面上线前用一次真实切换验收。

### 隐私与数据留存

#### I-08 · 高 · 三年匿名化任务未处理user_id等账号关联

- 主题：隐私与数据留存；类型：实现偏离；状态：仍成立·未登记；独立发现者：10
- 事实：D-035 与 DATA_MODEL §9 规定到期后删除或匿名化姓名、电话、地址和账号关联。订单表与订单明细表的 user_id 都是必填的下单用户字段。grouporder-task-retention 的 ANONYMIZED 只覆盖 consignee_name、consignee_mobile、consignee_address、buyer_remark、address_id，没有处理 order.user_id 和 order-item.user_id，任务也不碰 order-item。匿名化后订单仍可通过 user_id 关联到账号。此外，代码清空 buyer_remark，但没有处理 cancel_reason、void_reason、void_uid，这些字段是用户或团长自由输入或带身份。D-077 新增的 pickup_contact_name 与 pickup_contact_mobile 是活动级姓名和电话，任务第 51 行注释写活动本身不含个人信息，只置 anonymized=1。文档没有规定这些字段的匿名化处理，也没有说明 user_id 必填字段用什么占位值。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-task-retention/index.js:14` 「const ANONYMIZED = {」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-task-retention/index.js:19` 「address_id: ''」
  - `docs/00-product/DECISIONS.md:56` 「匿名化姓名、电话、地址和账号关联」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-task-retention/index.js:16` 「consignee_name: '[已匿名化]',」
- 现状核对：grouporder-task-retention的ANONYMIZED仍只含收货三要素、buyer_remark、address_id，不含user_id、order-item，与D-035账号关联匿名化不符；未见登记。 （已合并 1 个重复项）
- 影响：三年到期后，已匿名化的订单和明细仍带 user_id，可还原到具体用户，违反 D-035 的匿名化承诺，隐私声明与实际不符。自提联系人姓名和电话永久保留。
- 建议：以 D-035 为准：任务同时匿名化 order 与 order-item 的 user_id，占位值写入 DATA_MODEL §9，并给出完整字段清单（含 buyer_remark、cancel_reason、void_reason、void_uid、活动的 pickup_contact_*）。
- 需拍板：到期匿名化时：A) 除收货三要素外，同时清空 order.user_id、order-item.user_id 和活动的自提联系人姓名电话（汇总统计按活动维度保留），未发布草稿在最后编辑后满一定期限（请给出天数）删除；B) 保留 user_id 用于长期审计，仅清除姓名电话地址备注与联系人电话。请选 A 或 B，并给出草稿保留天数。

#### I-28 · 高 · 订单限制处理无执行载体，读取导出不识别

- 主题：隐私与数据留存；类型：实现偏离；状态：仍成立·未登记；独立发现者：2
- 事实：PRD 5.7、OPS 16、STATE_MATRIX 10 规定：注销时仍在三年期内的订单转为限制处理，不再用于日常展示或一般运营分析，禁止通过订单历史、团长日常查询或统计继续展示个人信息。代码里 restricted 只存在于 grouporder-privacy-case，由运营在 A-16 手工置位；订单、导出、统计的读取代码没有任何按账号已注销（uni-id status=4）或 restricted 过滤的逻辑（grep restricted / anonymized 在 order-co、export-co 中均无读取判断）。同时文档没有回答：D-056 允许在活动「已截止」后注销，此时团长线下履约可能还没完成，买家注销后团长的订单列表和 Excel 是否还能看到该买家的姓名电话？PRD 5.6「团长仅能在本人发起活动中查看履约所需的接龙资料」与 5.7「不再用于日常展示」在这个场景下互相没有交代。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1903` 「if (params.restricted !== undefined) patch.restricted」
  - `docs/00-product/PRD.md:220` 「不再用于日常展示或一般运营分析」
- 现状核对：restricted 仍只由 ops-co 手工置位，order-co/export-co 无 restricted 判断；已截止后团长履约与限制处理的取舍规则文档仍未补，OPEN_ISSUES 未登记。
- 影响：已注销买家的姓名、电话、地址继续出现在团长订单页、Excel 清单和统计里，违反已确认的限制处理规则；如果反过来严格执行，团长在截止后的线下履约会突然缺数据，而文档没有给出取舍。
- 建议：以 PRD 5.7 为准实现：读取路径按买家账号状态与订单保留期判定限制状态。对「已截止但尚在履约期的团长清单」需要产品先补规则（见 owner_question），再改代码和文档。
- 需拍板：买家在活动已截止后注销，团长还能看到并导出该买家的收货信息吗？A：不能，注销即对团长隐藏（团长需在截止后、买家注销前完成履约核对）；B：能，团长仍可查看和导出到履约结束（例如截止后 N 天，请给出 N），其余展示与统计一律隐藏。

### 合规与上线

#### I-01 · 严重 · 默认自动审核且内容检测恒通过，文字直接上线

- 主题：合规与上线；类型：实现偏离；状态：仍成立·未登记；独立发现者：6
- 事实：提审清单 2.2、2.3、2.4 要求人工审核队列可用或文本、图片检测已接入。代码 contentcheck.invokeProvider 直接返回通过（check_result=1）；config.getReviewMode 在没有配置记录时兜底为自动审核；数据库目录没有 grouporder-config 的 init_data，所以新环境默认就是自动审核。activitySubmitReview 在自动模式且 textPass 时直接把活动置为进行中。清单第 155 行说 H5 阶段应把 review_mode 设为 2 覆盖内容安全要求，但没有任何初始化数据或代码保证这一点。组合结果：现状下任何标题、说明、商品名的文字都不经检测就对外可见，只有图片回调（同样未接入）可能事后下架。
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/contentcheck.js:32` 「内容检测服务尚未接入，本次按通过处理」
  - `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/config.js:17` 「首版默认自动，人工模式需要运营显式开启」
- 现状核对：contentcheck.invokeProvider 仍恒返回 PASS，config.getReviewMode 无记录时兜底自动；OPEN_ISSUES、ADMIN_KNOWN_ISSUES、SHARE_SPEC 均未登记，database 下也只有 config 的 schema/index 而无 init_data。
- 影响：在检测接入前若按现状部署，UGC 文字无任何拦截；提审时审核员发一条违规文字即可当场拒审。
- 建议：以 PRD §8.7 与提审清单第二节为准：接入前把默认审核模式初始化为人工（写入 grouporder-config 初始数据或部署脚本），接入后再由运营切换；invokeProvider 在未接入时不应返回通过。默认模式的取值需同步写入 DECISIONS 或 DATA_MODEL §4.6。
- 需拍板：配置缺失或读取失败时，活动发布审核按哪种模式处理？A：一律按人工审核（更安全，运营需显式切到自动）；B：按自动审核（当前代码行为，但需要保证内容检测服务已接入，并在上线前写入种子配置）。

## 3. 中低级别发现（159）

### 账号与登录（7）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-77 | 中 | 未制定完善 | 解绑无前置条件，仅微信账号解绑后落点未规定 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:149` | 在 OPS 9.1 增加解绑前置条件（账号必须已有用户名密码），并写明解绑后微信身份的落点；appealResolve 按规则校验。 |
| I-33 | 中 | 实现偏离 | 绑定申诉双方有数据的拦截时点与目标账号口径不一致 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1659` | OPS 优先于 DATA_MODEL，但 OPS 本身也含糊；建议统一为“提交时即检测并挡回，处理时二次检测”，并让 appealResolve 以申诉记录里的目标账号为准（或改目标时重新检测）；同步修 DATA_MODEL 10.5 与 STATE_MATRIX 用语。 |
| I-56 | 中 | 实现偏离 | 登录注册页沿用模板，缺 M-06 重设密码入口与注册提示 | 仍成立·未登记 | `docs/01-ux/UX_FLOW_SPEC.md:41` | 以 D-029/D-038/PRD 为准：关闭 retrieve 与邮箱注册入口，在注册页加入明确提示，M-03 入口按 M-06 规则改造，userinfo 页去掉手机号与实名认证项或不注册该页。 |
| U-78 | 中 | 未制定完善 | 小程序无退出登录或切换账号入口 | 仍成立·未登记 | `grouporder-client/src/pages/hall/my.vue:45` | 在 PRD §6、UX M-08 增加「退出登录」，说明退出后回到游客态；同时定义登录会话有效期与失效后的回跳。 |
| U-63 | 中 | 未制定完善 | 普通用户账号状态规则缺失，accountSetStatus 未限运营账号 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:2177` | 若首版不封禁普通用户：accountSetStatus 限定目标必须持有运营角色，OPS 4.6 的「账号状态」限定为运营账号或删除该列。若需要封禁：补状态枚举、登录拒绝文案、对在途订单与活动的影响、申诉入口。 |
| U-46 | 中 | 未制定完善 | 昵称头像获取流程与隐私披露仍未设计 | 仍成立·未登记 | `docs/00-product/DECISIONS.md:126` | 补昵称头像流程（或明确首版不采集并从 3.2 删除）；3.2 增加运营后台访问、隐私接口声明项；隐私弹窗与指引文案以同一份披露清单生成。 |
| U-79 | 中 | 未制定完善 | 注销校验与地址簿等查询硬编码 limit 截断 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:315` | 注销校验改为聚合查询或分页遍历，不做截断；地址簿是否设上限（含数值）由产品决定并写入 PRD 5.6，创建时校验；待办条数上限写入 M-27 说明。 |

### 活动生命周期（20）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| I-57 | 中 | 实现偏离 | 过截止时间未扫描窗口内团长取消与手动截止仍放行 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:565` | 在 DATA_MODEL §8.4 规定「有效截止 = status 已截止 或 服务端时间 >= end_time」，统一适用于团长的取消、手动截止、库存与限购调整；手动截止在已过 end_time 时按计划截止时间记录并视为自动截止；更新加 status 条件。 |
| U-56 | 中 | 未制定完善 | 重审期间已有订单的参与者规则未定义 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:432` | 在 PRD 5.2 与 UX_STATE_MATRIX 增加『进行中转重审、退回草稿、撤回』时对已有订单和参与者的规则；state.js 的活动迁移表补 ONGOING→REVIEWING；autoclose 和 CLOUD_API 定下草稿态带有效订单的活动过期如何处理；ACTIVITY_REVIEWING 是否也用 |
| U-41 | 中 | 未制定完善 | 文本检测三态去向与服务故障兜底未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/contentcheck.js:147` | 在 D-057/D-058 或 OPS §4.3 补一张判定表：检测结果分类、各分类在自动与人工模式下的去向、检测服务故障的兜底（建议故障时转人工队列）、用户名账号内容的强制人工规则。代码据此处理 BLOCKED，并接入真实检测。 |
| U-80 | 中 | 未制定完善 | 取消原因仅进行中必填，带订单草稿取消无规则 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:568` | 规定：只要活动曾发布或存在有效订单，取消一律必填原因；并规定审核中是否可直接取消。 |
| U-81 | 中 | 未制定完善 | 草稿阶段最低必填集未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:153` | 产品确认草稿最低字段后，写入 UX_FLOW_SPEC F-M03 与 M-10，并同步 CLOUD_API 的必填标记和原型。 |
| I-58 | 中 | 实现偏离 | 审核中活动在管理页无撤回入口 | 仍成立·未登记 | `grouporder-client/src/pages/activity/manage.vue:29` | manage.vue 对 status===1 也显示进入 M-12 的入口（或直接提供撤回）。 |
| U-82 | 中 | 未制定完善 | 审核通过与审核中无待办、无时长提示 | 仍成立·未登记 | `docs/00-product/DECISIONS.md:81` | 补充：审核通过是否进待办；审核预计时长文案；提交时截止时间距离过近的提示规则。 |
| U-47 | 中 | 未制定完善 | 审核记录实体缺失，历史不可查 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:114` | 明确是否新增审核记录实体（含内容版本、状态四态、审核人、原因）或只依靠操作日志；规定撤回是否记日志；规定 A-17 是否需要领取；将 content_version 改为必填。 |
| U-83 | 中 | 未制定完善 | 恢复上架后是否重审及限制状态判定无规则 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:219` | 补恢复的判定：限制状态命中时拒绝或仅提示；恢复时若活动处于审核中，恢复后仍按审核状态处理。 |
| U-43 | 中 | 未制定完善 | 截止时间上下限、默认值与进行中调整规则缺失 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:212` | 在 PRD §3.1/§5.2 与 DATA_MODEL 补：最短提前量、是否设上限、统一使用服务端时间并以北京时间展示、进行中改截止时间的边界与通知、审核中到期时的团长告知（可用待办）、新建时的默认值来源。 |
| U-84 | 中 | 未制定完善 | 已取消活动统计快照口径未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:571` | 在 PRD 5.2 定义快照口径（取消时刻的有效订单数、有效总份数、预计金额）与固化位置，或明确「订单原样保留、实时展示」；orderVoid 明确拒绝已取消活动。 |
| I-43 | 中 | 实现偏离 | 审核中活动可被接口手动截止 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:546` | activityClose 增加 status===进行中 的显式校验，审核中返回 STATE_CHANGED；迁移表中的 审核中→已截止 仅供自动截止使用。 |
| U-85 | 中 | 未制定完善 | 各活动状态下商品经营动作可执行范围不一致 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:989` | 补一张「活动状态（草稿/审核中/进行中/已截止/已取消）×商品经营动作」的可执行矩阵，并统一以 status 加服务端 end_time 判定截止；停售在已截止和已取消后是否允许需一并写明。 |
| U-64 | 中 | 未制定完善 | 审核中到期直接已截止的规则仅存在于代码 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:972` | 在 OPS 4.3 与 12.1 补充：审核期间到达截止时间的处理（自动截止 / 顺延 / 提醒团长）、是否通知团长、对“已发布活动数”和队列的影响，并写入 DECISIONS。 |
| U-131 | 低 | 未制定完善 | 驳回原因在重新提交后清空，保留规则未定 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:333` | 规定原因展示位置（编辑页顶部）与保留规则（保留至下次通过）。 |
| I-76 | 低 | 实现偏离 | 被退回草稿的交付方式单选仍可切换 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:224` | 前端在 activityGetDetail 返回 publish_date 非空时把交付方式设为只读。 |
| U-128 | 低 | 未制定完善 | 取消原因对参与者的可见范围未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:491` | 在 PRD 5.2 和矩阵中写明取消原因的展示对象（参与者/游客）与是否送检。 |
| I-77 | 低 | 实现偏离 | 历史接龙选择页缺商品数、订单数、截止日期 | 仍成立·未登记 | `docs/00-product/PRD.md:236` | 以 PRD 为准补出参（商品数、订单数、end_time 展示）并在 PRD/CLOUD_API 写明排序字段。 |
| U-132 | 低 | 未制定完善 | 标题长度前后端不一致且「发布后」含义未写明 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:129` | 在 PRD §3.1 或 UX M-10 补标题、说明的长度约束，客户端与服务端统一；D-060 注明“发布后”指首次审核通过（以 publish_date 为准）。 |
| U-133 | 低 | 未制定完善 | 原型含文档与 Schema 没有的字段 | 仍成立·未登记 | `prototype/mockup-v3.html:851` | 逐项确认后，要么补进 DATA_MODEL 与 CLOUD_API，要么从原型删除；「现在开始」建议改为不显示开始时间。 |

### 活动内商品（13）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| I-36 | 中 | 实现偏离 | orderUpdate 新增商品未置 ever_ordered | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:280` | 以 D-026 与 DATA_MODEL 为准：orderUpdate 中凡新增或扩大的商品行成功落库后，与 orderCreate 一样把这些商品的 ever_ordered 置 1。文档无需改。 |
| U-86 | 中 | 未制定完善 | 改单未变行按当前价重取快照，价格口径未定 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:482` | 需产品裁决后补入 PRD 5.3/5.4 与 UX 竞争矩阵。 |
| U-48 | 中 | 未制定完善 | 总库存与剩余量对参与者的可见规则未定 | 仍成立·未登记 | `grouporder-client/src/pages/activity/detail.vue:52` | 产品确认后在 D-016 或 UX_FLOW_SPEC M-13 增加一句可见性规则，并让原型详情头部补有效总份数。 |
| U-49 | 中 | 未制定完善 | 删除、手工新增商品是否触发重审，文档未裁决 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:961` | 在 D-048 补充完整的触发清单（含删除、排序、推荐标识），并规定重审的触发时点；客户端在进行中活动的内容型保存前必须弹出重审确认（GOODS_LIB_SPEC §5.4）。 |
| I-59 | 中 | 实现偏离 | 商品拖拽排序在小程序端无入口 | 仍成立·未登记 | `grouporder-client/src/api/index.js:36` | 以 D-065 与 CLOUD_API 为准：M-22 补拖拽排序界面并调用 goodsSort；UX_FLOW_SPEC 的 M-22 行补写排序。 |
| U-87 | 中 | 未制定完善 | 停售与治理下架并存时的恢复规则及提示冲突 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:981` | 文档补规则：治理状态与 on_sale 完全独立，治理恢复不改变 on_sale；提示文案改为“待平台恢复后可再操作”。 |
| U-88 | 中 | 未制定完善 | 提交需至少一个商品仅在代码中，且可删至零 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:317` | 在 PRD 8.2 明确最少商品数，并规定进行中活动删除最后一个商品的处理（拒绝，或允许并显示空态）。 |
| U-50 | 中 | 未制定完善 | 数值上限与单位长度边界未规定 | 仍成立·已登记 | `docs/02-arch/DATA_MODEL.md:190` | 补一张「数值边界表」到 DATA_MODEL：单位长度（以 schema 10 为准并在云对象校验）、price/库存/限购/单行数量上限、每单最大行数、单人每活动最大订单张数、end_time 最短与最长期限，并说明 50 个商品、500 人是硬限制还是估算。 |
| U-134 | 低 | 未制定完善 | 恢复售卖重新校验内容与停售期可改字段未定义 | 仍成立·未登记 | `docs/00-product/PRD.md:315` | 请产品裁决，并统一 D-028、PRD 5.3、PRD 8.5、DATA_MODEL 5.3、UX_STATE_MATRIX 第 56 行。 |
| I-78 | 低 | 实现偏离 | 全部商品停售或售罄时详情页缺整体提示 | 仍成立·未登记 | `grouporder-client/src/pages/activity/detail.vue:61` | 详情页在所有商品均不可购买时增加整体提示，文案与 PRD 一致。 |
| I-79 | 低 | 实现偏离 | 删除商品未写操作日志，PRD 与代码不一致 | 仍成立·未登记 | `docs/00-product/PRD.md:319` | 以 PRD 为准：在 10.8 第 11 类增加 goods_deleted，goodsDelete 删除前写入商品名称、价格的前值。 |
| I-80 | 低 | 实现偏离 | 商品名称说明输入上限低于规格 | 仍成立·未登记 | `grouporder-client/src/pages/activity/goods-edit.vue:12` | 以 DATA_MODEL 为准，将输入框上限改为 50 与 500。 |
| I-73 | 低 | 实现偏离 | 限购为软约束但界面未如实说明 | 仍成立·未登记 | `grouporder-client/src/pages/activity/goods-edit.vue:30` | 在 M-11 与库存限购调整入口补一行说明；如产品认为无需提示，则改 DATA_MODEL 该句。 |

### 商品库与复用（19）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-89 | 中 | 未制定完善 | 复制活动不检查库记录封禁，与 libCopyToActivity 不一致 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:718` | 由产品决定后写入 DATA_MODEL §4.10 约束 1，并让 activityCopy 复制前按 lib_id 及团长+名称查库记录封禁状态。 |
| U-90 | 中 | 未制定完善 | 手工商品 lib_id 为空且不回填，改名后旧库记录逃过封禁 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:798` | 在 §4.2 补规则：沉淀命中或新建后，若商品 lib_id 为空则回填该库记录 _id。同时按「商品最近一次沉淀所对应的所有库记录」考虑封禁范围，并补一条 AC 覆盖手工商品改名后被下架。 |
| U-91 | 中 | 未制定完善 | 封禁库记录可被软删并同名重沉淀，规则缺失 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-goods-co/index.obj.js:213` | 补规则：封禁记录是否禁止软删（服务端拦截）；若允许删除，则同名重新沉淀时是否按“曾被封禁的同名”继承封禁；解封匹配是否含软删记录。删掉或改写“恢复软删”的表述。 |
| U-92 | 中 | 未制定完善 | 复制历史接龙不检查库记录封禁 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:725` | 文档明确 activityCopy 是否要连带检查库记录封禁，并对应补 AC-AC-005 的范围。 |
| I-37 | 中 | 实现偏离 | 沉淀命中更新回写 is_recommend，违反 D-065 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/goodslib.js:47` | 以 D-065 与 AC-GL-020 为准：在 GOODS_LIB_SPEC §4.2 两条沉淀规则的字段清单中去掉 is_recommend（新建库记录时可取初值 0 或取当前值一次），goodslib.js 命中分支不再更新 is_recommend；is_recommend 只在 M-29 编辑库记录时变更。 |
| U-93 | 中 | 未制定完善 | 沉淀以名称为键，改名后旧库记录残留 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/goodslib.js:12` | 在 GOODS_LIB_SPEC §4.2 与 §7 明确：goodsCreate 是否把库记录 ID 写回商品 lib_id；改名是更新原记录还是新建。 |
| I-49 | 中 | 实现偏离 | goodsCreate 接受未校验归属的 lib_id | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:798` | 规格明确 goodsCreate 是否允许传 lib_id；若保留，须校验归属，否则删除该入参（复用只走 libCopyToActivity）。 |
| I-38 | 中 | 实现偏离 | 库记录图片检测结果无回写通路 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-goods-co/index.obj.js:198` | 规格补：库记录送检使用什么 object_type（建议新增 goods_lib）、回调如何回写库记录、沉淀时是否继承商品当前的检测状态而不是重置为 0、提交审核时对已通过且未改图的商品是否跳过送检。 |
| I-60 | 中 | 实现偏离 | M-29 编辑保存每次重置检测状态且缺编辑项 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-goods-co/index.obj.js:189` | 服务端按内容是否真的变化（比较 fileID 列表）判断重检，或规定客户端只提交被修改的字段。M-29 补齐 §5.6 列出的可编辑字段。 |
| U-94 | 中 | 未制定完善 | 封禁防洗白边界未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/goodslib.js:28` | 文档明确封禁的保护范围：只阻止对被封禁的那一条库记录的复用，还是按（团长 + 名字，含已软删）持续封禁。删掉「恢复软删」的表述，或补上恢复软删的功能定义。 |
| U-95 | 中 | 未制定完善 | 被封禁库记录软删与重新沉淀规则未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-goods-co/index.obj.js:213` | 由产品定：封禁记录是否允许软删；沉淀查询是否应先匹配封禁记录（含软删）；删掉「恢复软删」措辞或定义该功能。 |
| U-96 | 中 | 未制定完善 | 商品恢复解封口径与审计类型未规定 | 仍成立·未登记 | `docs/02-arch/GOODS_LIB_SPEC.md:616` | 文档补充：多个下架商品共用一条库记录时，仅当没有其他仍处于下架的关联商品时才解封。同时规定解封事件的 action_type（新增枚举或明确共用）。 |
| I-50 | 中 | 实现偏离 | goodsAdjustStock 不沉淀商品库 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:929` | 产品确认库存与限购调整是否算「保存商品」；若算，goodsAdjustStock 成功后调用 sinkToLib，并把该规则写入 CLOUD_API。 |
| I-74 | 低 | 实现偏离 | 商品库页缺分类排序、未分组筛选与完整编辑 | 仍成立·未登记 | `grouporder-client/src/pages/lib/history-goods.vue:64` | 补齐 category.vue 的排序、history-goods.vue 的未分组筛选（category_id 传 __none__）和 manage.vue 的字段编辑；或在 UX 文档里把这些标为后续迭代。 |
| U-127 | 低 | 未制定完善 | libCopyToActivity 幂等与推荐超限规则未对齐 | 仍成立·未登记 | `docs/02-arch/CLOUD_API.md:475` | libCopyToActivity 幂等改用与 D-081 一致的客户端 idempotent_key；规格明确推荐超限时是拒绝、降级还是在返回中标注。 |
| U-135 | 低 | 未制定完善 | 同名分类与地址簿上限规则仅在代码 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:394` | 补一句同名规则，并在 DATA_MODEL 写明地址簿条数上限（或取消 limit 50）。 |
| U-136 | 低 | 未制定完善 | 复制后商品检测状态规则未写入 §4.10 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:424` | 在 §4.10 增加检测状态一行：与 GOODS_LIB_SPEC §5.2 保持同一规则（源为通过则继承，其他重新送检）。 |
| U-137 | 低 | 未制定完善 | 运营对商品库的只读入口未决定 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:214` | 在 OPS 补充：运营对商品库是否只读可查，或明确不提供。 |
| U-129 | 低 | 未制定完善 | 商品库分页与容量契约未定义 | 仍成立·未登记 | `docs/02-arch/CLOUD_API.md:472` | 补库记录上限（或明确不设）、libList 分页契约、去重口径与分类同名规则。 |

### 订单与库存（10）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-97 | 中 | 未制定完善 | orderUpdate 的 items 语义与改单重取价未定义 | 仍成立·已登记 | `docs/02-arch/CLOUD_API.md:197` | 在 CLOUD_API 5 与 14.2 明确：items 为改后完整明细（全量替换）、允许新增商品、需带幂等或版本条件、改单是否写留痕；同步修正 CLOUD_API 5 的动作清单以对齐 D-049。 |
| U-44 | 中 | 未制定完善 | 审核中/下架期间参与者订单操作规则未定义 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/state.js:72` | 补一张「活动业务状态×治理状态×订单操作」矩阵，明确审核中、下架时参与者能否查看本人订单、缩减、取消；建议至少保证可查看和可取消，以免团长改一个字就冻结所有订单。并统一接口与 editable 的判定来源。 |
| U-65 | 中 | 未制定完善 | 订单作废没有对应操作日志类型 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:863` | 在 DATA_MODEL 10.8 明确：订单作废是否写入 oplog（建议增加 order_voided 事件，记前后状态与原因）；订单取消可只留订单字段。PRD 5.4 写明取消原因选填、两个原因字段最多 500 字，并由服务端校验。 |
| U-98 | 中 | 未制定完善 | 活动终态转移与下单并发无原子保障 | 仍成立·未登记 | `docs/00-product/DECISIONS.md:136` | 统一口径：DECISIONS 风险表改成与 DATA_MODEL §8 一致的「写入前校验 + 事后补偿」；补一条规则规定终态活动下发现的迟到订单如何处理（建议下单成功后再读一次活动状态，若已终态则自动作废并返还库存），并让 stampRetention 覆盖迟到订单（例如任务复查）。 |
| U-57 | 中 | 未制定完善 | 下调每人限购低于已购数量的处理未定义 | 仍成立·未登记 | `docs/00-product/PRD.md:315` | 补规则：限购下调仅影响新增与扩大，不改动既有订单（建议）；并将 PRD 8.5 的「重新校验」改成与 D-028 一致的措辞。 |
| I-61 | 中 | 实现偏离 | 调低总库存并发下可低于已售 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:1027` | 在 §8.1 增补调整库存的并发规则：更新语句带 sold_qty <= 新总库存 的条件，失败返回最新已购数让团长重试。 |
| U-66 | 中 | 未制定完善 | 订单幂等键未绑定用户与请求内容 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-order-co/index.obj.js:199` | §8.3 补规则：幂等命中须同 user_id、同 activity_id 才返回，否则报错并要求换键；同键不同内容按冲突拒绝。 |
| U-99 | 中 | 未制定完善 | sold_qty 与明细聚合缺对账规则 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:193` | 规定权威口径（建议以有效明细聚合为准，sold_qty 只是库存缓存）并补一个校正入口或定时校验。 |
| U-138 | 低 | 未制定完善 | 团长能否参与自己活动下单未规定 | 仍成立·未登记 | `docs/00-product/PRD.md:32` | 在 PRD 5.4 补一句：团长可或不可在本活动下单。 |
| I-81 | 低 | 实现偏离 | 已购买数量未按实际单位展示，写死「份」 | 仍成立·未登记 | `grouporder-client/src/pages/activity/detail.vue:52` | 三处页面统一显示“已购买 {sold_qty}{unit}”。 |

### 收货与交付（11）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| I-62 | 中 | 实现偏离 | 自提空地址与 order schema minLength 冲突 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/snapshot.js:36` | 以 DATA_MODEL/D-060 为准：去掉 consignee_address 的 minLength（或改为自提时不写该字段），同步 docs/02-arch/schema 副本；匿名化写入的空串同理。上线前用自提订单实测一次。 |
| U-100 | 中 | 未制定完善 | 参与者侧无团长联系渠道与作废触达规则 | 仍成立·未登记 | `docs/00-product/DECISIONS.md:36` | 补规则：截止后订单详情是否展示团长可联系入口（微信群沟通即可则写明为线下）；订单被作废后是否进入参与者待办。 |
| I-51 | 中 | 实现偏离 | 自提点文本未纳入首次内容检测与运营展示 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/contentcheck.js:104` | 在 OPS §4.3/§4.4 明确审核与详情页展示自提点四字段；checkOnSubmit 的快照加入 pickup_*（是否阻塞放行沿用 D-077“不阻塞”，仅留记录）。 |
| U-58 | 中 | 未制定完善 | 自提点可改状态窗口与已下单参与者触达未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:263` | 在 STATE_MATRIX 增加 M-32 按状态的可用与禁止矩阵；在 D-077 或 PRD 明确已下架、审核中是否可改；规定变更后对已下单参与者的触达方式（例如待办条目或订单详情提示）。 |
| U-101 | 中 | 未制定完善 | 地址簿条数上限未定义，列表静默截断 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:98` | 在 PRD §5.6 定上限值与超限提示，addressCreate 超限返回业务错误，addressList 的 limit 与上限一致。 |
| I-40 | 中 | 实现偏离 | 收货信息默认项取消与首条自动默认规则未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:122` | PRD 5.6 明确：首条是否自动默认；是否允许取消默认（建议不允许，界面隐藏关闭开关）。代码保持后再把该规则写入文档。 |
| U-40 | 中 | 未制定完善 | 电话姓名格式校验未定义且各路径不一致 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/snapshot.js:27` | 在 PRD 5.6 与 DATA_MODEL 4.5 写死电话格式（如是否允许座机、区号、加号）、姓名和地址长度、地址簿条数上限，订单快照复用同一校验；明确默认项是否允许取消。 |
| U-67 | 中 | 未制定完善 | 自提订单收货人来源与预填规则未定义 | 仍成立·未登记 | `docs/01-ux/UX_FLOW_SPEC.md:113` | 产品确认后写入 UX_FLOW_SPEC F-M04 与 M-14，并同步原型。 |
| U-102 | 中 | 未制定完善 | 地址簿管理入口在页面表中不闭合 | 仍成立·未登记 | `docs/01-ux/UX_FLOW_SPEC.md:50` | 修正 M-15 的入口为 M-08 与 M-14，明确 M-15 在管理模式下的职责（删除、设默认、不触发选择），并写清管理模式与选择模式的差异。 |
| I-63 | 中 | 实现偏离 | 自提地址必填只在首次提审校验 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:271` | 以 DATA_MODEL/PRD 为准：在 _pickPickup（自提且非草稿）与审核放行处统一校验非空；对 publish_date 判断改为“活动状态非草稿”。 |
| U-130 | 低 | 未制定完善 | CLOUD_API 未记录订单接口 pickup 出参与 unavailable 结构 | 仍成立·未登记 | `docs/02-arch/CLOUD_API.md:455` | CLOUD_API §14.2 补 pickup{} 及 unavailable[] 项结构，并统一三处自提点字段形态。 |

### 清单与导出（9）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-45 | 中 | 未制定完善 | 失效版本与过期文件下载规则未规定 | 仍成立·未登记 | `docs/01-ux/UX_STATE_MATRIX.md:97` | 在 OPS §10 与 STATE_MATRIX §7 增补：运营是否可下载失效版本（建议可下载但必须标『已失效』），并新增『文件已过期（超过 60 天）』状态与文案；versions[] 与 A-13 相应增加 expired/invalidated 展示。 |
| U-68 | 中 | 未制定完善 | Excel 列全集、合计行、单元格类型无文档定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:57` | 在 PRD 8.6 或 UX 中列出两个工作表的完整列、合计行、标记文案、排序与金额术语；D-071⑤ 补充『数量、单价、金额写为数值，仅用户可控文本强制文本』，并规定零订单是否可生成。 |
| I-34 | 中 | 实现偏离 | PRD 要求清单表头区，代码无且自提点表述互斥 | 仍成立·未登记 | `docs/00-product/PRD.md:330` | 由产品决定是否输出自提点，并统一 PRD 5.6、D-077、8.6；在 PRD 8.6 或 UX 中定义清单表头区版式（活动名称、截止时间、生成时间、是否含自提点），代码按结论实现。 |
| I-52 | 中 | 实现偏离 | Excel 事件审计字段记录错误 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:197` | 拒绝分支先读取活动并记录真实 leader_uid，活动不存在时留空。非权限原因的失败使用 GENERATE_FAIL 或 DOWNLOAD_FAIL，permission_check_result 只在真正校验团长身份时写拒绝。 |
| I-53 | 中 | 实现偏离 | 清单缺活动名称、截止时间、生成时间 | 仍成立·未登记 | `docs/00-product/PRD.md:330` | 在 PRD/UX 明确 Excel 表头区应含活动名称、截止时间、生成时间（及数据时点），并在预览页展示生成时间与版本；代码按此补齐。 |
| U-69 | 中 | 未制定完善 | 下载链接转发验收与30分钟临时地址方案矛盾 | 仍成立·未登记 | `docs/00-product/PRD.md:376` | 由产品确认接受 30 分钟内持链接者可下载（并把 PRD §9 改写为『过期后不能获得』），或改为云函数中转下发；同时在 UX F-M10 写明小程序端下载并打开文件的方式与失败提示。 |
| U-59 | 中 | 未制定完善 | UX 写了生成中与查询状态，接口只有同步 listGenerate | 仍成立·未登记 | `docs/01-ux/UX_FLOW_SPEC.md:160` | CLOUD_API 明确 listGenerate 是同步还是异步；若同步则删去 UX 里的『生成中/查询状态』或补一个按 activity_id 查询最近生成结果的方法；PRD §9 补一句生成期间发生作废的处理结果。 |
| I-44 | 中 | 实现偏离 | export.vue 读 file_version 不用 versions[]，无法重下 | 仍成立·已登记 | `grouporder-client/src/pages/activity/export.vue:56` | 以 CLOUD_API 14.5 与 STATE_MATRIX §7 为准，页面按 versions[] 渲染最新有效版本、生成时间和失效提示。 |
| U-139 | 低 | 未制定完善 | 原型我的页两个入口在文档与代码均无定义 | 仍成立·未登记 | `docs/01-ux/UX_FLOW_SPEC.md:43` | 产品确认是否保留后，在 UX_FLOW_SPEC 补页面编号、列表口径与入口，或从原型删除。 |

### 大厅待办与分享（10）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-103 | 中 | 未制定完善 | 我参与的列表口径与分页未定义 | 仍成立·已登记 | `grouporder-client/src/pages/hall/jielong.vue:138` | 在 UX_FLOW 补：M-18 是否包含仅有已取消/作废订单的活动、组排序键、每组展示的活动状态；CLOUD_API 明确 orderMyList 分页单位（建议按活动分页）；M-09 明确是筛选还是分组，并定默认排序与翻页方式。 |
| I-39 | 中 | 实现偏离 | 草稿超时按创建时间算，矩阵写更新时间 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:475` | 决定草稿计时基准（建议在 activity 增 update_date，或改文档为创建时间）；把「删除草稿」统一改写为 D-027 的「取消草稿」。 |
| I-41 | 中 | 实现偏离 | 待办关闭对所有类型开放，截止待办不随生成清单消退 | 仍成立·未登记 | `grouporder-client/src/pages/hall/jielong.vue:32` | todoList 增加“是否存在 GENERATE_OK 事件”判断；todoDismiss 只接受矩阵指定的 3 类 todo_key，前端仅对这 3 类显示关闭；草稿超时要么在 DATA_MODEL 为活动增加更新时间字段，要么把矩阵改为“创建时间”。 |
| U-70 | 中 | 未制定完善 | 待办查询固定 limit 无上限规定，静默截断 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:425` | UX 与 CLOUD_API 补充：小程序端同档排序键、待办条数上限与超出后的展示、是否需要分页；代码取消固定 limit（或改为按条件反查）。 |
| U-51 | 中 | 未制定完善 | todo_key 无事件维度，关闭后再触发被吞 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:363` | 在 key 中加入事件标识（如治理时间戳、review_submit_date 或举报状态），并在矩阵写明“复核完成”是否再次出现待办。 |
| U-104 | 中 | 未制定完善 | 个人维度数字（参与订单、订单数）口径未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:577` | 在 PRD 5.5 补个人维度指标：名称、是否含取消、作废、已取消活动、草稿，并写入 D-037 命名表。 |
| U-140 | 低 | 未制定完善 | 订单被作废后参与者无站内待办触达 | 仍成立·未登记 | `docs/01-ux/UX_STATE_MATRIX.md:155` | 在 UX_STATE_MATRIX §11 增加一行：订单被作废，面向参与者，触发条件为本人订单转为已作废，消退条件为用户查看后关闭并写关闭表。同时明确 todoList 的订单查询要包含已作废订单。作废原因是否在待办中展示，一并写清。 |
| I-72 | 低 | 实现偏离 | 我的页待办数与角标口径未对齐 | 仍成立·未登记 | `docs/01-ux/UX_STATE_MATRIX.md:166` | 以矩阵为准。角标数由公共位置（如 store 或 go-tabbar 自取）统一提供，所有 tab 页都显示；M-08 的待办数量要么删除，要么规格中定义为角标口径（1–2 档）；原型角标改为 3。 |
| I-75 | 低 | 实现偏离 | 待办实现偏离矩阵：待生成清单、草稿起点、key 命名 | 仍成立·已登记 | `docs/02-arch/DATA_MODEL.md:363` | 在 DATA_MODEL §4.8 列出全部待办类型表：触发条件、todo_key 形式、消退方式（可关闭或自动消失）、可见期限；「待生成清单」应改为以是否存在有效清单版本判定。 |
| U-141 | 低 | 未制定完善 | 待办分档标签、文案与同档排序无文档定义 | 仍成立·未登记 | `grouporder-client/src/common/grouporder/dict.js:129` | 在 UX_FLOW_SPEC M-27 增加条目文案表（每种 type 的标题和描述）、分档标签、同档排序（如按事件时间倒序）。 |

### 举报与治理（9）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-42 | 中 | 未制定完善 | 内容检测处置规则、默认审核模式、回调超时未规定 | 仍成立·未登记 | `docs/00-product/DECISIONS.md:77` | 在 OPS §4.3/§5.2 增补检测结果处置表：文本/图片 × 通过/命中需人工/明确违规 → 发布前动作（放行/进队列/拒绝）与上线后动作（无动作/下架/仅待办），并写明回调超时的兜底与检测服务上线前的临时策略（建议上线前默认人工审核）。 |
| U-39 | 中 | 未制定完善 | 限制与警告无团长可见入口，商品下架无团长待办 | 仍成立·未登记 | `docs/01-ux/UX_STATE_MATRIX.md:153` | todoList 增加对本人活动下商品 governance_status=1 的聚合，待办对象标识需能定位到商品（当前 todo_key 只有活动 id，需要定义商品级 key）。 |
| U-105 | 中 | 未制定完善 | 图片检测回调不核对内容版本 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-check-callback/index.js:46` | 补规则：回调只对当前最新送检记录生效，历史版本的命中只记录、进运营待办，不改对象状态。 |
| U-71 | 中 | 未制定完善 | 商品库封禁无归属计数，恢复一个即整体解封 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:224` | 在 GOODS_LIB_SPEC §7 与 OPS §6.2 补充解封条件。 |
| U-52 | 中 | 未制定完善 | 发布限制拦截点与作用范围未穷举 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:310` | 在 OPS §7 列出受限动作清单（创建草稿、提交审核、复制、审核通过放行、进行中重审），并规定 reviewSubmit 通过时是否重新校验。 |
| U-72 | 中 | 未制定完善 | 内容检测覆盖的用户文本范围未列全 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/contentcheck.js:111` | 文档列出全部“用户可控且对他人可见”的字段并逐项规定：送检时机、是否阻塞、命中后处理。 |
| U-106 | 中 | 未制定完善 | 治理下架商品明细的统计口径未规定 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:405` | 补一条规则：治理下架商品的既有明细是否计入统计与清单，以及清单是否标注。 |
| I-64 | 中 | 实现偏离 | 发布者处置页所需读接口不存在 | 仍成立·未登记 | `grouporder-admin/pages/grouporder/publisher/restrict.vue:193` | 在 CLOUD_API §11/§14.7 增补读取方法（处置流水列表、发布者活动列表），或在 reportDetail 中带出 publisher_restrictions 并定义 A-10 的取数来源。 |
| U-126 | 低 | 未制定完善 | 举报提交资格（游客）文档与实现不一致 | 仍成立·未登记 | `docs/01-ux/UX_STATE_MATRIX.md:29` | 由产品确认后统一：建议在 D-033 补一句“举报需登录，以便追溯与防刷”，并把 STATE_MATRIX 游客行的“举报”改为“去登录后举报”。 |

### 后台账号与审计（9）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| I-35 | 中 | 实现偏离 | 角色种子仍保留三个旧业务角色，与单一 ops-super 不符 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/database/uni-id-roles.init_data.json:50` | 以 D-078 与 OPS 3.2 为准：删除三个旧角色的种子与 OPS_ROLE_IDS 中对应项，改正各权限点注释，A-15 去掉角色列、统计权限列和角色多选，云对象删除 roleAssign 与 _rolesHaveStat。已部署的库需清理已存在的旧角色数据。 |
| U-60 | 中 | 未制定完善 | 首个运营账号与最后可用账号保护规则缺失 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:60` | OPS 3.1 增加“首个账号初始化步骤与验收”，并规定“不得停用最后一个启用的运营账号”；恢复路径改写为具体可执行的方式。 |
| U-53 | 中 | 未制定完善 | 工作台“分配给本人”、最近处理记录未定义 | 仍成立·已登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:101` | 在 OPS 4.2 明确：D-078 下待办为全员共享队列（举报的“处理中”是否只对领取人展示需单独说明）；给出最近处理记录的来源、条数和字段；删除或定义“活动汇总指标”；补上角标的落点（左侧菜单哪一项）。 |
| U-107 | 中 | 未制定完善 | “高风险操作”全库无清单定义 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:379` | 在 OPS 12.2 列出高风险操作清单（如下架/恢复、限制发布、解绑重绑、账号停用、导出、配置修改），并逐项标明是否要求二次确认、原因必填、是否允许批量。 |
| U-108 | 中 | 未制定完善 | A-02 结果态未定义，停用账号被当会话失效 | 仍成立·未登记 | `docs/01-ux/UX_FLOW_SPEC.md:69` | 在 CLOUD_API 2.3 增加 OPS_ACCOUNT_DISABLED（含由谁识别：以 token 中 uid 查 status）；规定 token 校验失败但能解出 uid 时仍记入 oplog 并带 uid；UX 补全 A-02 的结果态清单、每态文案与出口；恢复路径改为“联系其他运营人员启用”。 |
| U-109 | 中 | 未制定完善 | 角色/权限/菜单管理页职责未定义 | 仍成立·未登记 | `docs/00-product/DECISIONS.md:96` | 明确这三页是否保留：若仅部署时使用，则运行期菜单隐藏并对内置对象加只读保护；若保留，补充页面规格、内置对象保护与审计要求。 |
| U-61 | 中 | 未制定完善 | oplog 动作枚举缺项与系统动作无归因 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:880` | 在 DATA_MODEL 10.8 与 OPS 13 补全枚举（账号创建、启用、停用、密码重置、配置类实体变更/删除、系统任务的固定操作者标识），把 activity_pickup_changed 补入枚举与 D-077；操作人展示时联表取用户名或在日志里存用户名摘要。 |
| U-142 | 低 | 未制定完善 | 审计字段 case_no 口径不统一 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:411` | 规定 case_no 一律取源事项编号（report_no、appeal_no、privacy case_no、检测记录编号），处置流水号另存字段。 |
| U-143 | 低 | 未制定完善 | 权限点 ops-sys-error 归属与规格 | 仍成立·已登记 | `docs/03-release/ADMIN_KNOWN_ISSUES.md:215` | 决定保留还是删除，并在文档中写明是否采集设备与错误数据。 |

### 后台查询与统计（13）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-110 | 中 | 未制定完善 | 隐私事项进入工作台的状态口径未定义 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:99` | 在 OPS 4.2 写明档 3 隐私事项只含“已到期待处理”和“执行失败”（已登记、限制处理中在保存期内不算待办）；或明确保留现行口径并说明理由。 |
| I-45 | 中 | 实现偏离 | 工作台数量被 limit 50 截断，角标与最近处理缺失 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:2098` | OPS 4.2 补：待办数量以全量 count 为准，列表分页或设显示上限；“最近处理”明确数据源（例如 oplog 中本人最近 N 条）与条数，或删掉这条需求；前端接入 badge_count。 |
| I-65 | 中 | 实现偏离 | 订单检索不返回明细，详情弹窗无明细 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1131` | searchOrders 或新增订单详情方法读取 order-item 并返回 items（商品名、单位、数量、价格快照）与 cancel_reason；CLOUD_API 批 C 补一行订单详情。 |
| U-73 | 中 | 未制定完善 | 全局检索键、账号类型、关联治理事项未定义 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:131` | 在 OPS 4.4、4.5 增加“检索键表”：每类对象的允许键、精确或模糊、是否允许按手机号和昵称；定义“账号类型”的取值（如用户名密码注册/微信/已绑定）；“关联治理事项”指举报、处置、限制记录，需给出展示字段。 |
| I-54 | 中 | 实现偏离 | 统计时间筛选与规格不符 | 仍成立·未登记 | `grouporder-admin/pages/grouporder/stat/overview.vue:102` | 页面改为今天、近 7 天、近 30 天、自定义（起止日期选择），去掉未定义的 90 天与“全部”，或先在 OPS 4.6 补充；起止时间以服务端和统一时区计算。 |
| U-74 | 中 | 未制定完善 | 统计时间口径、时区与日期边界未定义 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:138` | 在 OPS 11.1 补充：统计为实时聚合（asOf=服务端查询时间）或预汇总；时区固定为 UTC+8 自然日，结束日含当天；start_date/end_date 类型；草稿与审核中活动在时间筛选下按创建时间还是不纳入，并在页面提示。 |
| I-42 | 中 | 实现偏离 | 团长汇总缺账号状态与微信绑定，页面读不存在字段 | 仍成立·未登记 | `grouporder-admin/pages/grouporder/stat/overview.vue:55` | statOverview 补充按 leader_uid 关联 uni-id-users 与 grouporder-user-ext 的账号状态、微信绑定、发布限制；页面展示草稿数；活动列表行补 ever_reported。 |
| U-111 | 中 | 未制定完善 | 绑定申诉“处理中”状态无触发者与迁移 | 仍成立·未登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:364` | 要么补充一个领取动作（与 reportClaim 对称，写审计并记录处理人），要么在 OPS 12.1 与 DATA_MODEL 删除“处理中”并说明并发靠 resolve 的状态条件更新。 |
| U-112 | 中 | 未制定完善 | 汇总延迟态无触发条件，实为实时聚合 | 仍成立·已登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:381` | 在 OPS 11.1 明确首版统计为实时聚合，数据截至时间等于查询时刻，删除或改写“延迟/未完成”状态；同时定义聚合失败时的提示和重试。若将来引入预聚合再恢复该状态。 |
| I-66 | 中 | 实现偏离 | 加载失败被显示成空态或零值 | 仍成立·未登记 | `grouporder-admin/pages/index/index.vue:102` | catch 分支设置独立的错误状态并展示“加载失败，点击重试”；统计页失败时不显示零值。 |
| I-67 | 中 | 实现偏离 | A-07 送审快照实际读取当前内容 | 仍成立·未登记 | `grouporder-admin/pages/grouporder/activity/detail.vue:9` | 文档需先定义活动内容按版本保存的位置（或明确以内容检测记录的 content_snapshot 为证据来源）；页面据此展示，并把标签改为如实描述；处置历史可内嵌 oplog 摘要。 |
| I-68 | 中 | 实现偏离 | A-04 筛选键与云对象支持字段不一致 | 仍成立·未登记 | `grouporder-admin/pages/grouporder/search/index.vue:247` | 以 CLOUD_API 14.7 的 filters 为准修改页面键名；云对象补充 delivery_type、截止时间、注册时间的支持，或去掉对应列头筛选；提示文案与实际字段一致。 |
| I-46 | 中 | 实现偏离 | 团长统计读取上限导致静默截断 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1394` | 改为分页遍历或按团长聚合，超限时提示；在 OPS 11 写明统计规模的预期上限和超限行为。 |

### 隐私与数据留存（17）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-113 | 中 | 未制定完善 | 检索与详情查看审计粒度未定义 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:1107` | 在 OPS 13 增加“检索、详情查看”为必记事件，并规定：记录检索条件摘要（不含完整个人信息本身）、命中条数、返回对象标识列表或范围（分页时逐页记）；页面提示与实现一致。 |
| U-114 | 中 | 未制定完善 | 注销限制处理对团长清单与文件影响未规定 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-export-co/index.obj.js:101` | 由产品在 D-035 附近补充：限制处理订单在团长清单中的处置（继续显示至履约完成 / 从清单剔除 / 只显示脱敏），团长注销时文件的删除时点，三年匿名化后是否可再生成；再更新 STATE_MATRIX 与代码。 |
| U-75 | 中 | 未制定完善 | 自提联系人个人信息保存与披露规则缺失 | 仍成立·未登记 | `docs/00-product/DECISIONS.md:50` | 改 D-029、清单 3.8、PRD §10 的相关表述为「账号不采集手机号」；清单 3.2 增补自提点地址与联系人；由产品补一条规则：联系人电话对谁可见、保存多久、是否需团长承诺已获本人同意。 |
| U-62 | 中 | 未制定完善 | 自提联系人电话对游客可见，敏感性与校验未规定 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js:419` | 由产品明确：该电话是否对游客可见（否则未登录只展示地址与时间）、是否做格式校验；隐私指引清单 3.2 增加「团长填写的自提现场联系人」；按结论更新 D-033/D-034 的敏感字段定义。 |
| U-115 | 中 | 未制定完善 | 地址簿软删除记录无清除期限 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:162` | 规定软删记录在删除时即清空 name/mobile/address 只留占位，或规定不超过 N 天物理清除。 |
| U-116 | 中 | 未制定完善 | 注销后限制处理访问范围与保存期限未定义 | 仍成立·已登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:511` | 由合规/产品在 OPS 16 补充：限制处理状态下各角色（团长、运营）可见字段和例外程序；补定举报、检测、审计记录及备份的保存期限。 |
| I-55 | 中 | 实现偏离 | 审核中到期截止未写订单保存期起点 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:973` | ops-co 审核到期分支调用 stampRetention；autoclose 改为先写留存字段再改状态，或在扫描条件中补「已截止且无留存到期日」的兜底修复。 |
| I-69 | 中 | 实现偏离 | 注销前置校验只读前 50 活动/200 订单 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-user-co/index.obj.js:315` | 改为直接按活动状态反查用户订单（先取未截止活动 ID 再查订单），或分页遍历直到覆盖，并在 CLOUD_API 写明 blockers 的展示上限。 |
| I-47 | 中 | 实现偏离 | 60 天清理任务窗口与批量上限致文件可能不删 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-task-export-cleanup/index.js:12` | 清理改为循环直到无更多记录，或按已过期未清理集合扫描；同时回到 #2 的决定，减少重复生成。CLOUD_API 594 的窗口设计应在文档中改为『到期即清』。 |
| U-117 | 中 | 未制定完善 | 审计与登录日志保留期未决定 | 仍成立·已登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:416` | 新增决策写明 oplog 与 uni-id-log 的保存期限、到期动作（删除或聚合）及执行者，并说明与 D-035 的关系。 |
| U-118 | 中 | 未制定完善 | 举报、检测、审计记录保存期限未确定 | 仍成立·已登记 | `docs/00-product/OPS_ADMIN_REQUIREMENTS.md:513` | 由产品与合规给出各类记录的保存期限和到期处理方式，写入 D-035 或新增决策；retention 任务按期限覆盖对应表。 |
| U-54 | 中 | 未制定完善 | 自提点与联系人电话对游客可见性未定义 | 仍成立·未登记 | `docs/00-product/PRD.md:264` | 由产品在 PRD 8.1 明确自提点的可见层级，再改 activityGetDetail 和 detail.vue。 |
| U-119 | 中 | 未制定完善 | 地址簿软删除记录无保留清除规则 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:290` | D-046/DATA_MODEL 补充：软删记录的保留期限（例如随所关联订单的三年期匿名化，或立即抹去姓名电话地址仅留 _id），并让 task-retention 处理。 |
| U-120 | 中 | 未制定完善 | 团长可读参与者字段缺字段级可见性定义 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:637` | 在 DATA_MODEL 8.5 补一张「实体×字段×角色」可见性表（游客、参与者、团长、其他活动参与者、运营），逐字段写明团长对有效、已取消、已作废订单分别能看什么。 |
| I-48 | 中 | 实现偏离 | 审核中到期转已截止未写留存到期日 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-ops-co/index.obj.js:975` | 以 DATA_MODEL §9 为准：reviewSubmit 该分支改用与 autoclose 相同的公共逻辑（更新状态并 stampRetention）；或规定所有转已截止的入口必须调用同一函数。 |
| U-55 | 中 | 未制定完善 | 注销时商品库等数据去向未定义且误引 D-056 | 仍成立·未登记 | `docs/02-arch/GOODS_LIB_SPEC.md:74` | 在 D-035 或新决策里补充：商品库（含软删记录与图片）、草稿、团长展示资料在注销时的动作；D-056 增加对待处理举报与永久限制的处理规则；修正 GOODS_LIB_SPEC 对 D-056 的错误引用。 |
| I-70 | 中 | 实现偏离 | 匿名化任务单次仅 100 单且无续跑 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-task-retention/index.js:11` | DATA_MODEL §9 补处理时限（例如到期后 N 日内完成）；任务内循环分页处理直到取尽或超时，超时则触发再次调度；has_more 为真时告警。 |

### 合规与上线（6）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-121 | 中 | 未制定完善 | 类目核验结论前的允许范围与红灯回退未定义 | 仍成立·已登记 | `docs/03-release/CATEGORY_VERIFICATION.md:108` | DECISIONS 优先级最高，应由产品负责人裁定：是保留「架构前必须核验」并立刻做步骤 1，还是把 P1-09 的时点改为「提审前」并同步修改 DECISIONS、PRD §10、CATEGORY_VERIFICATION、README 缺口表。无论选哪个，需在 CATEGORY_VERIFICATION 增加「结论 |
| U-122 | 中 | 未制定完善 | 举报/审计记录期限与 oplog 去标识化规则未定 | 仍成立·未登记 | `docs/00-product/DECISIONS.md:121` | 合规先确定各类记录期限和备份策略，再在 P1-07 明确「上线前必须关闭」的子项，并给 oplog 规定：期限届满后的处理，或注销后对操作人/对象标识做去标识化（这是对 OPS 13 不可改删的受控例外）。 |
| I-71 | 中 | 实现偏离 | 接龙不代表已付款声明未在客户端展示 | 仍成立·未登记 | `docs/03-release/UX_REVIEW_GATE.md:191` | UX_FLOW_SPEC 补声明的位置（M-13 顶部、M-14 提交前）与固定文案，客户端按原型实现。 |
| U-123 | 中 | 未制定完善 | UX 评审门追踪表停在 D-056 | 仍成立·已登记 | `docs/03-release/UX_REVIEW_GATE.md:22` | 追踪表扩展到 D-080，Gate B/C 增加 M-27～M-32 和 A-17/A-18 的入口、出口核验以及审核冻结、重审、自提点、商品库的检查项；自审表回扫后重做。 |
| U-76 | 中 | 未制定完善 | 定时任务触发器未登记且说法不一 | 仍成立·未登记 | `docs/01-ux/UX_FLOW_SPEC.md:152` | 把触发表达式写入 package.json 的 cloudfunction-config，或在 RELEASE_AUDIT_CHECKLIST 增加「四个函数的触发器已配置」检查项；UX 文案改为服务端定时任务。不确定之处：触发器也可能只在 uniCloud 控制台配置，仓库外无法核实。 |
| U-144 | 低 | 未制定完善 | 审核员入口与违规拦截表现未定义 | 仍成立·未登记 | `docs/03-release/RELEASE_AUDIT_CHECKLIST.md:82` | 清单 4.4 补：提审备注需含测试活动的入口路径、两类测试账号、两种交付方式各一场进行中活动，并写明违规内容的预期拦截表现。 |

### 跨主题（6）

| 编号 | 严重度 | 类型 | 问题 | 状态 | 位置 | 建议 |
|---|---|---|---|---|---|---|
| U-124 | 中 | 未制定完善 | 有效总份数跨单位相加无业务口径 | 仍成立·未登记 | `docs/00-product/PRD.md:196` | 产品明确有效总份数只是数量合计、不带单位含义，并规定展示措辞；或改为只在单位一致时展示。 |
| U-125 | 中 | 未制定完善 | 未知异常映射 INVALID_PARAM 且 DUPLICATE 一码两义 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/errors.js:78` | CLOUD_API 2.3 增加服务端异常码（如 SERVER_ERROR），normalize 使用之；同名冲突改用独立码（如 NAME_DUPLICATED），DUPLICATE 只保留幂等含义。 |
| U-145 | 低 | 未制定完善 | 以服务端时间为准缺可验收口径 | 仍成立·未登记 | `docs/02-arch/DATA_MODEL.md:633` | 在 §8.4 写明边界为 now >= end_time 即已截止，并规定时钟来源与截止瞬间的用户提示文案。 |
| I-82 | 低 | 实现偏离 | ops-co 参数错误码缺 OPS_ 前缀 | 仍成立·已登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/common/grouporder-common/errors.js:83` | 以 CLOUD_API 为准，ops-co 内的参数校验改用 throwOps('INVALID_PARAM')，或在 _after 统一补前缀。 |
| I-83 | 低 | 实现偏离 | content_version 文档 string 与 schema int 不一致 | 仍成立·已登记 | `docs/02-arch/DATA_MODEL.md:727` | schema 是产物唯一真相：统一为 int（与 activity.content_version 一致），改 contentcheck.js 不再转字符串和 ops-co 的 String() 查询，DATA_MODEL 字段表改为 int。 |
| U-146 | 低 | 未制定完善 | ext-storage-co 无鉴权上传入口未登记 | 仍成立·未登记 | `grouporder-admin/uniCloud-alipay/cloudfunctions/ext-storage-co/index.obj.js:3` | 确认业务不使用则从项目中移除或停用；若要使用，须在 CLOUD_API 登记并加登录鉴权与内容检测。 |

## 4. 审核期间已被处理的项（3）

| 编号 | 问题 | 主题 | 现状依据 |
|---|---|---|---|
| R-01 | 分享卡片与 getShareEntry 链路已实现 | 大厅待办与分享 | publish.vue、manage.vue、detail.vue 均已有 onShareAppMessage 并调用 activityGetShareEntry，detail.vue 已删 short_code 分支，SHARE_SPEC 声明 S-01~S-04 已实施；OPEN_ISSUES 第130行为过时描述。 |
| R-02 | 复制历史接龙已复制自提点字段 | 活动生命周期 | activityCopy 现已复制四个自提点字段，见 activity-co 696-699 行。 |
| R-03 | DATA_MODEL引用OPS交付方式可见字段的悬空引用 | 后台查询与统计 | DATA_MODEL 174 行已不再含该引用，现为 stat_* 说明；交付方式规则由 D-060 与 DATA_MODEL 135 行定义。OPS 8.1 仍未逐字写自提显示，但悬空引用本身已消除。 |

## 5. 被复核驳回的疑似项（5）

- 4 位 short_code 可枚举活动详情（原类型 实现偏离、严重度 高）：驳倒依据：DECISIONS.md 第 101 行 D-083 已确认方案 1，activity-co/index.obj.js 第 384-395 行只 assertParam(params.activity_id) 后调用 _getActivity，无 short_code 分支；CLOUD_API.md 第 170 行、SHARE_SPEC.md 头部均已同步。唯一残留：client detail.vue 第 137 行仍有 q.short_code 作为 activityId 的兜底，传给服务端会因非有效 activity_id 失败，属死代码，不构成枚举风险。
- 分享入口未接线（原类型 实现偏离、严重度 高）：驳倒依据：grep 得 publish.vue:110、manage.vue:74、detail.vue:124 均定义 onShareAppMessage，path 均为 '/pages/activity/detail?id=' + activityId；publish.vue:101、manage.vue:66 调用 api.activity.activityGetShareEntry；UX_FLOW_SPEC 第112行也规定 M-12 与 M-20 分享卡片直达 M-13。docs/03-release/OPEN_ISSUES.md:130 有类似的旧阻断记录，说明该发现可能来自旧材料
- 4 位短码免登录取详情与入口不可枚举互斥（原类型 矛盾、严重度 高）：驳倒依据：DECISIONS.md 第101行 D-083 已裁决方案 1；CLOUD_API.md 第414行入参已无 short_code，第170行注明分支已移除；代码 index.obj.js 约第380-392行 activityGetDetail 已不再按 short_code 查表。残留小问题：DATA_MODEL 第564行仍有“短码解析”索引用途说明，属措辞，不构成冲突。
- 已取消活动行禁止操作写成计入有效汇总（原类型 文档过期、严重度 低）：驳倒依据：同表所有行的“禁止操作”列都写被禁止的动作，列义一致（如 131 行“将下架计为取消”）；OPS 342、472 行明确不计入；无实现者会因此做错。
- PRD 清单含收货地址与自提清单不输出地址列不一致（原类型 文档过期、严重度 低）：该行剩余的表头区自提点问题已由 I-34 单独覆盖。

## 6. 覆盖说明

- 当前 DECISIONS 共 80 条决策；没有被任何审核员的发现、需求行或覆盖说明提到的有 5 条：D-002、D-004、D-005、D-006、D-010
- 各审核员自述的覆盖范围：

  - A:AUTH：已读文件与行段：docs/00-product/DECISIONS.md 相关决策行（D-029/030/031/033/034/038/055/056/069、D-042/078、P1-01/02、风险表126）；PRD.md 140-150、214-221、255-272、382-383；OPS_ADMIN_REQUIREMENTS.md 59-64、128-165、278-297、358-366、450-452；UX_FLOW_SPEC.md 28-40、85-100、108-114、200-210；UX_STATE_MATRIX.md 24-32、75-90、180-190、104-1
  - A:ACT：已读并核对（磁盘当前内容）：docs/00-product/DECISIONS.md 全文（D-001~D-080 及变更记录）；PRD.md 的 3.1、3.2、4.1、5.2、6、8.1~8.8、9；OPS_ADMIN_REQUIREMENTS.md 的 4.3、4.11（审核模式）、5.2、6.1、6.2、7、11.2、12.1 及与审核相关的关键词命中行；UX_STATE_MATRIX.md 全文（重点 §2、§3、§8、§11、§12）；UX_FLOW_SPEC.md 的 §3 页面表、F-M03~F-M09、§6；UX_REVIEW_GATE.md 与审核、截止相关的行；DATA_
  - A:GOODS：已精读：docs/00-product/DECISIONS.md 中 D-011/012/018/019/024/026/028/036/039/041/043/044/045/048/050/054/057/058/065/067 等行及版本表相关行；PRD.md 第 150–182 行（5.2、5.3）、第 195–201、302–320、330–375、416 行（8.5、9、12）；OPS_ADMIN_REQUIREMENTS.md 商品相关行（46–52、110–126、204–224、320–349、400、434–443、490）；UX_STATE_MATRIX.md 第 4 节
  - A:LIB：已读（磁盘当前内容，未读密钥.md、REVIEW_REPORT_2026-09-22.md、99-archive、uni_modules）。文档：docs/00-product/DECISIONS.md 全文的 D-024/035/041/043-045/048/056/058/060/063-067/077 行与 P1-08、变更记录 157-168 行；PRD.md 第 80-96、159、225-240、340-372 行；OPS_ADMIN_REQUIREMENTS.md 第 114、208-228、390 行；docs/02-arch/GOODS_LIB_SPEC.md 全文 1-7
  - A:ORDER：已读：DECISIONS.md 第 25–172 行（D-011 至 D-078 全文，重点 D-012/014/015/018/024/025/026/028/036/037/039/044/048/049/050/051/052/060）；PRD.md 第 56–66、114–224（5.1–5.7）、244–330（第 7 节、8.1–8.6）；OPS_ADMIN_REQUIREMENTS.md 仅读订单/统计相关段（约 31–49、318–349）；UX_STATE_MATRIX.md 第 1–74、170–214 行；UX_FLOW_SPEC.md 第 45–58、108–158、2
  - A:ADDR：已读（磁盘当前版本）：DECISIONS.md D-013/D-032/D-033/D-046/D-060/D-077 所在行（34/53/54/66/79/95）；PRD.md 第55-100、185-213、216-218、232-252、264、270-282、290-294、330-336、345-352、374-385 行段；OPS_ADMIN_REQUIREMENTS.md 第112-125、239-252 行及全文对 交付/自提/pickup 的 grep；UX_FLOW_SPEC.md 第21-22、42-52、113、117-127、157、240 行；UX_STATE_MA
  - A:EXPORT：已读（grep -n 定位后 sed/cat 精读）：DECISIONS.md 第 13、40-46、56-60、70-73、79、81、89-91、116、134-135 行及变更记录相关行；PRD.md 第 13-26、54、82、89、150-165、200-235、290-336、365-376、393、435-442 行；OPS_ADMIN_REQUIREMENTS.md 第 22-75、150-156、240-266、299-316、320、388-397、456-459、489-492、500-513、532-547 行；UX_FLOW_SPEC.md 第 12-14、33、50
  - A:HALL：已读：DECISIONS.md（D-027、D-032、D-033、D-034、D-041、D-043、D-058、D-059、D-061、D-062、D-067、D-070、D-077 全文行，及第 1-25 行头部）；UX_STATE_MATRIX.md 第 20-48 行、62-90 行、104-122 行、146-195 行；UX_FLOW_SPEC.md 第 25-62、84-130、225-245 行；PRD.md 第 45-92、153-162、222-240、262-304、349-356 行；OPS_ADMIN_REQUIREMENTS.md 仅 99-103 行（后台待办，
  - A:GOV：已读：DECISIONS.md 全部决策表（重点 D-022/042/043/048/054/057/058/059/062/064/067/070/072/076/077/078/079/080）；OPS_ADMIN_REQUIREMENTS.md 第 2、3、4.2~4.3、4.7~4.11、5、6、7、12、13、14.3、14.4 节；PRD.md 4.1、6、8.6~8.8 及相关行；DATA_MODEL.md 4.1、5.1、5.3、10.0~10.4、10.8、10.9 及第 12 节；CLOUD_API.md 第 2、9~12、14.6~14.8 节及 reportConclu
  - A:OPSCORE：已读（行段）：DECISIONS 第 62、87–96 行及变更记录 146–172 行；OPS_ADMIN_REQUIREMENTS 第 1–106、135–180、181–203、239–277、345–430、431–476、477–573 行（含 §3、4.1、4.2、4.6–4.11、5、8、11.4、12、13、14、15、16、17、18）；UX_FLOW_SPEC 第 16–30、60–90、165–230、256–261 行；UX_STATE_MATRIX 第 100–135、190–191 行及关键词 grep；UX_REVIEW_GATE 仅做关键词 grep（第 87、
  - A:OPSQ：已读（行段以磁盘当前内容为准，审核期间发现 docs 文件仍在被改动，UX_FLOW_SPEC 等行号曾漂移约 2 行，所有引用行号已在最后统一重新 grep 核对）。文档：DECISIONS 全文中的 D-015/016/036/037/042/043/048/051/052/057/058/059/070/072-076/078/079 及变更记录；OPS_ADMIN_REQUIREMENTS 第 1-4 章（4.2-4.6、4.11）、第 8、11、12、13、14.1/14.2/14.7/14.8、15 章；PRD 5.4-5.7 与 8.4 相关行、159、174；UX_FLOW_S
  - A:PRIV：已读：DECISIONS 的 D-035、D-042、D-056、D-070~D-073、D-077、D-078 与 P1-07（56、75、88-96、118 行）；PRD 5.6/5.7/8.x 与第 10 节（210-223、370-395 行）；OPS 第 3、8、10、12、13、15、16、17 节相关段（39、70-100、239-277、301-314、352-368、384-402、483-520、546 行）；UX_FLOW_SPEC 的 M-08、A-16、F-A10（42、85、227-232 行）；UX_STATE_MATRIX 第 10 节与第 12 节异常（139
  - A:COMP：已读：CATEGORY_VERIFICATION.md 与 RELEASE_AUDIT_CHECKLIST.md 全文；UX_REVIEW_GATE.md 全文（含第 1–246 行）；DECISIONS.md 全文（D-001 至 D-080、§4 至 §6、变更记录）；PRD.md 第 9–30、41–445 行（含 §3、§4、§5、§8、§10）；OPS_ADMIN_REQUIREMENTS.md 第 100–125、204–225、495–574 行及多处 grep；UX_STATE_MATRIX.md 与 UX_FLOW_SPEC.md 仅 grep 相关行（下架、注销、M-08、
  - B:DEC1：已读：docs/00-product/DECISIONS.md 全文 1-175（重点 1-95，并读 96-175 以核对 D-078/D-079/D-080、P1-xx、风险表与变更记录）；PRD.md 约 147、150-175、206、264、321-335、350-354、378-395、416；OPS_ADMIN_REQUIREMENTS.md 约 88-160、204-224、239-262、276-314、384-417、498-521；UX_FLOW_SPEC.md 84-125、204-230；UX_STATE_MATRIX.md 22-50、114-117、144-172
  - B:DEC2：实际读了：docs/00-product/DECISIONS.md 全文（重点第 54-56、62-96、95-175 行，含 D-042/D-043/D-048/D-057~D-080、§4、P1、风险表、变更记录）；docs/00-product/OPS_ADMIN_REQUIREMENTS.md 第 25-105、108-120、155-176、241-275、300-310、340-350、500-547、569-571 行；PRD.md 第 145-232、278、330、340-350 行片段；UX_FLOW_SPEC.md 关于 M-27/M-31/M-32/A-xx 的相关行；
  - B:PRD：已读：docs/00-product/PRD.md 全文 1-445 行；docs/00-product/DECISIONS.md 全文 1-175 行；OPS_ADMIN_REQUIREMENTS.md 仅读 100-140 行并以 grep 查看 21-52、141、175、273-300、339-342、500-516 相关行；docs/01-ux/UX_FLOW_SPEC.md 25-75、92-104 行；UX_STATE_MATRIX.md 20-75 行及 141-165 行；DATA_MODEL.md 90-96、500-560、639-650 行及 grep 命中的若干行；C
  - B:OPS1：已读：docs/00-product/OPS_ADMIN_REQUIREMENTS.md 第1~300行全文，另读第301~574行（第10~18章）用于交叉核对；DECISIONS.md 第44~99行决策表、第100~175行（负面清单、待定事项、变更记录）；UX_FLOW_SPEC.md 第67~88行(3.2)与第169~232行(F-A01~F-A10)，第98~104行(F-M02)；UX_STATE_MATRIX.md 第80~86、100~140行；DATA_MODEL.md 第292~318行(4.6)与第649~900行(第10章，含10.0~10.9)；CLOUD_API
  - B:OPS2：已精读：docs/00-product/OPS_ADMIN_REQUIREMENTS.md 300-574 全段；PRD.md 5.2-5.7（151-224）；DECISIONS.md D-035/D-071/D-072/D-073/D-076/D-078 及 P1-07 行；DATA_MODEL.md 第 9 节、10.6-10.8、部分 4.1 字段；CLOUD_API.md 中统计与隐私相关行；UX_STATE_MATRIX.md 第 9、10 节及部分状态行；UX_FLOW_SPEC.md F-A02、F-A10；UX_REVIEW_GATE.md 相关行；RELEASE_AUDIT
  - B:UXFLOW：已读：docs/01-ux/UX_FLOW_SPEC.md 全文（1-267 行，中途检测到文件被修改后重读 8-120 行并复核行号）；docs/03-release/UX_REVIEW_GATE.md 全文；docs/01-ux/UX_STATE_MATRIX.md 全文（1-216 行）；docs/00-product/DECISIONS.md 的 D-001～D-080 与变更记录；docs/00-product/PRD.md 的 20-300 行；docs/00-product/OPS_ADMIN_REQUIREMENTS.md 的 1-330 行；docs/02-arch/DATA
  - B:UXMAT：已读：docs/01-ux/UX_STATE_MATRIX.md 全文（1-216）；docs/00-product/DECISIONS.md 全文（1-176，含 D-011~D-080 与变更记录）；docs/00-product/PRD.md 全文（1-446，重点 5.2~5.7、8.x）；docs/00-product/OPS_ADMIN_REQUIREMENTS.md 第 100-260 行（4.3~6.2、7、8）；docs/02-arch/DATA_MODEL.md 第 117-275 行（4.1~4.4）、354-375 行（4.8 待办）、500-700 行（5 状态机、6
  - B:DM1：已读：docs/02-arch/DATA_MODEL.md 第 1~640 行（含 §5 状态机、§6 索引、§7 订单号与短码、§8 并发幂等、§9 留存，超出指定范围以核对状态迁移）；docs/00-product/DECISIONS.md 全文（D-001~D-080）；docs/00-product/PRD.md 第 150~230、279~283、306、330、383 行附近；docs/02-arch/CLOUD_API.md 第 100、137、155~200、414~452 行；docs/02-arch/GOODS_LIB_SPEC.md 第 420~440、476~530、6
  - B:DM2：实际读了：docs/02-arch/DATA_MODEL.md 全部第 500–986 行（§5 状态机、§6 索引、§7 订单号、§8 并发幂等安全、§9 留存、§10 及 10.0–10.10、§11、§12、§13 变更记录），并核对了 §4.1 activity 字段（约 130–175 行）与 §4.4 订单明细字段；docs/00-product/DECISIONS.md 全文（含新出现的 D-081、D-082，读取期间文件被他方修改，行号以最后一次核对为准）；docs/00-product/OPS_ADMIN_REQUIREMENTS.md 的 §4–§18；docs/01-u
  - B:SCHEMA：已读（磁盘 2026-09-29 18:00 前后）：docs/02-arch/DATA_MODEL.md 全文（1-1013 行，后续因文档被改动，行号已重新用 awk/grep 复核）；docs/02-arch/schema 与 grouporder-admin/uniCloud-alipay/database 下全部 grouporder-*.schema.json 和 index.json（脚本逐字段导出并互相 diff，含 permission 与 required）；uni-id-roles/permissions 的 init_data；docs/02-arch/GOODS_LI
  - B:API：实读范围（以当前磁盘内容为准，读取期间用户在并行修改文档，DECISIONS 由 v1.16 变为 v1.17 新增 D-081/D-082，CLOUD_API 由 v0.8 变为 v0.9，我在读完后重新核对了这些变化并以新内容为准）：docs/02-arch/CLOUD_API.md 全文；GOODS_LIB_SPEC.md 第 4、5、7、8、9、10、12 节及变更记录；DECISIONS.md 全文；PRD.md 第 159–221、383 行附近；OPS_ADMIN_REQUIREMENTS.md 第 175–260、330–350、483–520 行；UX_STATE_MATRI
  - B:GLSPEC：实际读过：docs/02-arch/GOODS_LIB_SPEC.md 全文（1-734 行，含 §2、§3、§4、§5.1-5.7、§6-§15、§12 全部 AC）；docs/00-product/DECISIONS.md D-024、D-035、D-048、D-056、D-058、D-063~D-067、D-079、D-080、D-082 原文；docs/02-arch/CLOUD_API.md §1.2、§2.3、§4.2（goods 相关）、§6、§14.1、§14.3 及治理方法行；docs/02-arch/DATA_MODEL.md §4.7 说明与 §4.10 AC-AC-00
  - B:PROTOMP：实际读取：prototype/mockup-v3.html 全部可见内容（行约560至1377，含 A 大厅三 tab、B 商品库、C 复用历史接龙、D 参与者详情与自提确认，CSS 部分仅扫描），docs/00-product/DECISIONS.md 第1至100行的决策表（含 D-011 至 D-082）与变更记录，UX_FLOW_SPEC.md 第20至70行页面表与第96至150行流程及第239至242行 tabBar 说明，UX_STATE_MATRIX.md 第144至170行待办矩阵，PRD 第170至180、206、330、353、382行，DATA_MODEL 的 §4.1
  - B:PROTOAD：实际读取：prototype/admin/admin-mockup-v3.html 页头 1-30、350-450（总览与红线表）以及 A-01 至 A-18 全部屏的正文（约 456-2365 行，去标签后精读，未读 CSS 与内联脚本）；docs/00-product/OPS_ADMIN_REQUIREMENTS.md 全文（读取期间文件被更新到 v0.19，已按新版复读 §5.1、§6.1、§4.2、§4.3 等关键段）；docs/00-product/DECISIONS.md 的 D-042、D-069 至 D-082 及相关变更行；docs/01-ux/UX_FLOW_SPEC.md
  - C:ACT1：实际读过：grouporder-admin/uniCloud-alipay/cloudfunctions/grouporder-activity-co/index.obj.js 第 1-640 行（主审 1-540，加读 542-640 的 activityClose/activityCancel/activityGetShareEntry/activityCopySourceList 用于核对状态迁移，并用 grep 看到 674 行 activityCopy 仍用 60 秒窗口）；common/grouporder-common/state.js、review.js 全文；contentc
  - C:ACT2：实际读取：grouporder-activity-co/index.obj.js 第 1-1087 行全文（含 540-1081 范围及创建、编辑、提审、撤回、详情、我发起的）；grouporder-task-autoclose/index.js 与 package.json 全文；common/grouporder-common 的 state.js、review.js、snapshot.js、goodslib.js、contentcheck.js、stock.js 全文，errors.js 前 60 行；grouporder-task-retention/index.js 前 60 行；g
  - C:ORD：已读：grouporder-order-co/index.obj.js 1-715 全文；common/grouporder-common/stock.js、idempotent.js、snapshot.js、state.js 全文，以及 auth.js、errors.js、paging.js、review.js 全文、exportlog.js 60-128。文档：DECISIONS.md 第 3 节 D-011 至 D-082 全部条目；PRD 5.2、5.3、5.4、5.5、8.1-8.6；DATA_MODEL 4.3、4.4、5（状态机）、6（索引）、7、8、9、10.8；CLOUD_A
  - C:GOODSGOV：已读（全文）：grouporder-goods-co/index.obj.js 1-490；common/grouporder-common/goodslib.js 1-167、contentcheck.js 1-167、review.js 1-83、config.js、errors.js 1-80、state.js 1-140；grouporder-check-callback/index.js 1-145；grouporder-report-co/index.obj.js 1-198；docs/02-arch/GOODS_LIB_SPEC.md 1-734。已读（片段）：DECISIONS
  - C:USER：实际读取：user-co/index.obj.js 全文（1–584 行）；common/grouporder-common 的 auth.js、restriction.js、config.js、errors.js、paging.js 全文；另读 idempotent.js（runOnce 及短码部分）、review.js 全文、state.js 前 60 行、snapshot.js 前 80 行、contentcheck.js 前 60 行；activity-co 的 activityCreateDraft/SubmitReview/Copy 中 assertCanPublish 调用处、a
  - C:EXP：已读全文：grouporder-export-co/index.obj.js（1-377）、common/grouporder-common/exportlog.js（1-128）、oplog.js（1-151）、grouporder-task-export-cleanup/index.js、grouporder-task-retention/index.js、ext-storage-co/index.obj.js、state.js、auth.js 前 140 行。规格侧读了 DECISIONS 中 D-021/024/035/039/051/052/053/060/071 到 D-082 相
  - C:OPS1：实际读取：grouporder-ops-co/index.obj.js 第 1-1075 行（含范围外的 checkHandle、publisherRestrict、reviewList/Detail/Submit、configGet/Set）以及 2040-2278 行（oplogList、workbenchTodo、accountSetStatus、roleAssign），中间 1076-2040 的检索、统计、申诉、隐私、导出审计未读，仅按 grep 核对 exportSearchResult 与 statExport 的云存储路径（1356、1603 行）。文档：OPS_ADMIN_R
  - C:OPS2：已读：grouporder-ops-co/index.obj.js 第 1~130 行（工具函数）、238~440 行（_governanceOn 全文与治理入口）、560~650 行（reportConclude）、720~1575 行（checkList、checkHandle、publisherRestrict、reviewList/Detail/Submit、configGet/Set、四类检索、exportSearchResult、statOverview、statActivityDrill 至 1575）及 2090~2130 行（工作台待办查询）；common/grouporde
  - C:OPS3：实际读取：grouporder-ops-co/index.obj.js 第 1~140、1300~1382、1376~2278 行（含 statOverview、statActivityDrill、statExport、appeal*、privacyCase*、exportLogList、exportDownload、oplogList、workbenchTodo、accountSetStatus、roleAssign），另 reportClaim 515~560 行。文档：OPS_ADMIN_REQUIREMENTS 第 54~180、239~420、418~571 行（含第 4、8、9、1
  - C:CLI1：已读（全文）：grouporder-client/src 下 pages.json、api/index.js、api/client.js、common/grouporder/dict.js、request.js、App.vue、pages/hall/{jielong,my,faqi}.vue、components/{go-tabbar,go-pickup,go-result,activity-form}、pages/activity/{detail,manage,publish,edit,close,export,goods-edit,goods-manage,pickup-edit}、pag
  - C:CLI2：已读（磁盘当前内容）：docs/00-product/DECISIONS.md 第 28 至 153 行全文；PRD.md 第 155 至 225 行、第 343、383、388 行及若干 grep 命中段；UX_FLOW_SPEC.md 全文 1 至 266 行；UX_STATE_MATRIX.md 全文 1 至 217 行；CLOUD_API.md 第 30 至 135、186 至 232、445 至 500 行；DATA_MODEL.md 第 225 至 330、503 至 700 行；GOODS_LIB_SPEC.md 第 1 至 200 行及第 200 至 734 行的规则正文；UX
  - C:ADM：实际读过：DECISIONS.md D-069~D-078 全文行；OPS_ADMIN_REQUIREMENTS.md 第 40-106 行（§2.2、§3、§4.1、§4.2）、145-182 行（§4.7~4.11）、330-360 行（§11.3-11.4）、380-410 行（§13 开头）；UX_FLOW_SPEC 第 72-88 行（A-01~A-18 清单）和 172-200 行；uni-id-roles、uni-id-permissions 的 init_data 主要段落；admin.config.js 全文；pages.json 页面路径清单；ops-account.js 
  - D:ENTER：已读（全文或主要段落）：docs/00-product/DECISIONS.md 全文；PRD.md 30-450（含 3、4、5.1-5.7、6、8.1-8.8、9、10）；OPS_ADMIN_REQUIREMENTS.md 的 136-156、276-310、490-571，并 grep 全文的注销、业务数据、身份核验、账号状态；UX_FLOW_SPEC.md 全文；UX_STATE_MATRIX.md 全文；SHARE_SPEC.md 全文；CLOUD_API.md 60-250 与关键词 grep（用户、登录、封禁、注销）；DATA_MODEL.md 88-112、755-792 及关
  - D:LEADER：实际读取：docs/00-product/DECISIONS.md 第28-143行（D-011 至 D-083 及风险表，表格已压缩空白后精读）；PRD.md 第41-68行、114-200行、268-345行；OPS_ADMIN_REQUIREMENTS.md 第100-135行及关键词命中行（113、114、174-175）；CLOUD_API.md 第150-200行（activity-co、order-co 方法表）；DATA_MODEL.md 第505-560行（状态机）及关键词命中行；GOODS_LIB_SPEC.md 第510-518行；UX_STATE_MATRIX.md 第
  - D:JOIN：已读：docs/00-product/DECISIONS.md 全文（含 D-011 至 D-083）；PRD.md 的 1 至 5、47-92、143-224、230-255、266 附近相关行（grep 定位）；UX_FLOW_SPEC.md 的 48-56、112-135、235-253；UX_STATE_MATRIX.md 的 20-75；CLOUD_API.md 的 192-199、454-462；DATA_MODEL.md 的 268-282、596-660 和 8.x 幂等/竞态段；grouporder-order-co/index.obj.js 全文；common/groupo
  - D:RACE：实际读过的内容如下。PRD 的 157-162、290-330、360-376 行段。DECISIONS 中 D-018/019/025-028/035/043/048/050-052/056-058/077-081 相关行。DATA_MODEL 的 172-210、505-535、599-635 行段。UX_STATE_MATRIX 的 93、165-200 行段。CLOUD_API 的 112-116、194-197、243、596 等行。代码方面：order-co 的 185-330 和 420-600 行，state.js、stock.js、review.js、exportlog.js
  - D:GOVE2E：已读：DECISIONS.md 的 D-054/058/064/082 全文及 D-019/050/072/078 行，grep 定位 D-022/042/062/070/080；PRD.md 举报与治理相关行（约 86-92、155-185、315-354）；OPS_ADMIN_REQUIREMENTS.md 4.3、5、6、7、11 段落及状态表；UX_STATE_MATRIX.md 41-48 行、UX_FLOW_SPEC.md 相关 grep 行；CLOUD_API.md 的 reportConclude/reportRecheck/checkHandle/check-callback
  - D:NOTIFY：实际读取：DECISIONS.md 第 53、76-84 行；PRD.md 第 162、170-187、229、329、342 行附近；UX_FLOW_SPEC.md 第 32-43、225-250 行；UX_STATE_MATRIX.md 第 12、26-28、113、147-167 行；CLOUD_API.md 第 226-231、256、356-360、493-504 行；DATA_MODEL.md 第 355-373、688 行；OPS_ADMIN_REQUIREMENTS.md 第 116-118、189-191、230-235 行（grep 命中的片段）；grouporder-us
  - D:PERM：共约 35 次工具调用。实际读取：DECISIONS.md 第 37、60、89、90、91、93、94、95、96 行；DATA_MODEL.md 635-660 与 1 至 8 章标题；OPS_ADMIN_REQUIREMENTS.md 54-72、160-175、205-213、245-262、440-462 及若干 grep 命中行；PRD.md 40-60、132-135、181-187、195-210、258-272 及 grep 命中；CLOUD_API.md 166、276-320、346、588 行附近；GOODS_LIB_SPEC.md grep 命中。代码：activit
  - D:METRIC：实际读取：DECISIONS.md 第 33、37、45、57、58、65、70 行；PRD.md 第 124-140、176-215、296-310 行及 D-067/D-080 相关行，另 grep 了 PRD 219-224；OPS_ADMIN_REQUIREMENTS.md 第 315-355 行；UX_STATE_MATRIX.md 第 125-140 行及若干 grep 命中行；DATA_MODEL.md 第 36-44、173-178、190-210 行；CLOUD_API.md 仅 grep 命中行。代码读取：export-co 92-125 行，order-co 300-32
