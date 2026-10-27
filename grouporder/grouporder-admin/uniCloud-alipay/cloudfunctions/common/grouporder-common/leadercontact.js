/**
 * 团长名片（D-103 联系方式 + D-109 头像昵称）
 *
 * 账号级：团长在「我的 → 团长名片」填一次，所有本人发起的活动页与参与者订单详情都显示；填了哪项显示哪项。
 * 存在 grouporder-user-ext（与 uni-id-users 一对一的业务扩展表），不改 uni-id 第三方表。
 * 放在 common：user-co 读写，activity-co（活动详情）与 order-co（订单详情）只读，云对象之间不互相调用。
 *
 * 电话、微信号只接受号码与微信号格式：严格格式即可杜绝借此发广告，不送内容检测。
 * 昵称、头像是自由内容且对外公开（D-109）：昵称保存时同步文本检测，不通过拒绝保存；
 * 头像走图片送检，被拦截（img_check_status = 已拦截）后不再对外返回。
 */
const { assertParam, throwBiz } = require('./errors')
const contentcheck = require('./contentcheck')
const files = require('./files')

// 手机号或座机：数字、空格、+、-、括号，5～20 位，至少 5 个数字
const PHONE_RE = /^[0-9+\-() ]{5,20}$/
// 微信号规则：字母开头，6～20 位字母、数字、下划线、减号；也允许直接填已绑定微信的手机号
const WECHAT_RE = /^([a-zA-Z][-_a-zA-Z0-9]{5,19}|1\d{10})$/
const NICKNAME_MAX = 20

/** 校验并规整入参；空串 / null 表示清除该项 */
function normalize (params) {
  const p = params || {}
  const mobile = String(p.mobile || '').trim()
  const wechat = String(p.wechat || '').trim()
  const nickname = String(p.nickname || '').trim()
  // 头像为文件对象；预填的账号头像（uni-id avatar_file）可能只有 url 没有 fileID，两者有其一即可
  const avatar = p.avatar && (p.avatar.fileID || p.avatar.url) ? p.avatar : null
  if (mobile) {
    assertParam(PHONE_RE.test(mobile) && (mobile.match(/\d/g) || []).length >= 5, '联系电话格式不正确', { field: 'mobile' })
  }
  if (wechat) {
    assertParam(WECHAT_RE.test(wechat), '微信号格式不正确：需以字母开头，6～20 位字母、数字、下划线或减号；也可填手机号', { field: 'wechat' })
  }
  assertParam(nickname.length <= NICKNAME_MAX, `昵称最多 ${NICKNAME_MAX} 个字`, { field: 'nickname' })
  assertParam(!p.avatar || !!avatar, '头像文件无效，请重新上传', { field: 'avatar' })
  return { mobile, wechat, nickname, avatar }
}

/** ext 记录 → 名片；selfView 为 true 时（本人设置页）被拦截的头像也返回，便于提示更换 */
function toCard (ext, selfView) {
  const avatarBlocked = !!(ext && ext.leader_card_avatar && ext.img_check_status === contentcheck.CHECK_STATUS.BLOCKED)
  return {
    nickname: (ext && ext.leader_card_nickname) || '',
    avatar: (ext && ext.leader_card_avatar && (selfView || !avatarBlocked)) ? ext.leader_card_avatar : null,
    avatar_blocked: avatarBlocked,
    mobile: (ext && ext.leader_contact_mobile) || '',
    wechat: (ext && ext.leader_contact_wechat) || ''
  }
}

/** 头像的比较 / 送检键：优先 fileID，没有时用 url */
function avatarKey (avatar) {
  return files.fileIdsOf(avatar)[0] || (avatar && avatar.url) || ''
}

async function findExt (ctx, uid) {
  const { data } = await ctx.db.collection('grouporder-user-ext').where({ user_id: uid }).limit(1).get()
  return (data && data[0]) || null
}

/** 对外展示用：读某个用户的名片；四项都没有返回 null */
async function get (ctx, uid) {
  if (!uid) return null
  const c = toCard(await findExt(ctx, uid), false)
  return c.nickname || c.avatar || c.mobile || c.wechat
    ? { nickname: c.nickname, avatar: c.avatar, mobile: c.mobile, wechat: c.wechat }
    : null
}

/** 本人设置页用：总是返回对象，含 has_card（是否保存过名片）与 avatar_blocked */
async function getOwn (ctx, uid) {
  const ext = await findExt(ctx, uid)
  const card = toCard(ext, true)
  card.has_card = !!(ext && (ext.leader_card_nickname || ext.leader_card_avatar ||
    ext.leader_contact_mobile || ext.leader_contact_wechat))
  return card
}

/**
 * 写入（upsert）：没有扩展记录时新建一条，发布限制按正常初始化。
 * 昵称变化时先做文本检测，不通过整单拒绝；头像变化时写库后送图片检测。
 */
async function set (ctx, uid, card) {
  const coll = ctx.db.collection('grouporder-user-ext')
  let ext = await findExt(ctx, uid)
  if (!ext) {
    const res = await coll.add({ user_id: uid, publish_restriction: 0, create_date: ctx.now })
    ext = { _id: res.id, user_id: uid }
  }

  if (card.nickname && card.nickname !== (ext.leader_card_nickname || '')) {
    const r = await contentcheck.checkText(ctx, {
      objectType: contentcheck.OBJECT_TYPE.LEADER_CARD,
      objectId: ext._id,
      contentVersion: 1,
      snapshot: { nickname: card.nickname }
    })
    if (r.check_result !== contentcheck.RESULT.PASS) {
      throwBiz('INVALID_PARAM', '昵称包含不适宜公开的内容，请修改后再保存', { field: 'nickname' })
    }
  }

  const prevAvatarId = avatarKey(ext.leader_card_avatar)
  const nextAvatarId = avatarKey(card.avatar)
  const avatarChanged = prevAvatarId !== nextAvatarId

  const patch = {
    leader_card_nickname: card.nickname,
    leader_contact_mobile: card.mobile,
    leader_contact_wechat: card.wechat,
    update_date: ctx.now
  }
  if (avatarChanged) {
    // 对象值用 set 整体替换，避免原值为 null 时按子字段合并报错（同 files.toDbPatch）
    patch.leader_card_avatar = card.avatar ? ctx.db.command.set(card.avatar) : null
    patch.img_check_status = card.avatar ? contentcheck.CHECK_STATUS.PENDING : contentcheck.CHECK_STATUS.PASS
  }
  await coll.doc(ext._id).update(patch)

  if (avatarChanged && nextAvatarId) {
    await contentcheck.submitImages(ctx, {
      objectType: contentcheck.OBJECT_TYPE.LEADER_CARD,
      objectId: ext._id,
      contentVersion: 1,
      fileIds: [nextAvatarId]
    })
  }
  return getOwn(ctx, uid)
}

module.exports = { normalize, get, getOwn, set }
