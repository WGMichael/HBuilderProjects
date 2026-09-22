/**
 * 幂等（DATA_MODEL §8.3、CLOUD_API §2.4）
 *
 * 原则：重复提交返回【首次结果】而不是报错。
 * 实现依靠唯一索引拦截，不依赖事务。
 */
const { throwBiz } = require('./errors')

/** 判断是否唯一索引冲突。各云厂商错误形态不一致，统一用特征匹配 */
function isDuplicateKeyError (e) {
  if (!e) return false
  const text = `${e.code || ''} ${e.errCode || ''} ${e.message || ''}`.toUpperCase()
  return text.includes('DUPLICATE') || text.includes('E11000') || text.includes('UNIQUE')
}

/** 生成幂等键：调用方未传时的兜底，正常情况下由客户端为每次明确意图生成 */
function genKey (prefix, uid) {
  return `${prefix}_${uid || 'anon'}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 以唯一索引为闸门执行一次写入。
 *
 * @param {object} opts
 *   collection 目标表
 *   keyQuery   命中既有记录的查询条件。【必须与该表的唯一索引完全一致】——
 *              复合唯一索引只查其中一列会命中别人的记录（例如
 *              grouporder-todo-dismiss 的唯一索引是 (user_id, todo_key)，
 *              只按 todo_key 查会取到其他用户的关闭记录）
 *   create     () => Promise<结果>  真正的写入逻辑
 *   onExisting (doc) => Promise<结果>  命中既有记录时如何还原首次结果
 */
async function runOnce (ctx, opts) {
  const { collection, keyQuery, create, onExisting } = opts
  const coll = ctx.db.collection(collection)

  // 先查一次：绝大多数重试走这条路径，避免无谓的写冲突
  const existed = await coll.where(keyQuery).limit(1).get()
  if (existed.data && existed.data.length) {
    return onExisting ? await onExisting(existed.data[0]) : existed.data[0]
  }

  try {
    return await create()
  } catch (e) {
    if (!isDuplicateKeyError(e)) throw e
    // 并发下第二次查询，返回首次结果
    const again = await coll.where(keyQuery).limit(1).get()
    if (again.data && again.data.length) {
      return onExisting ? await onExisting(again.data[0]) : again.data[0]
    }
    throwBiz('DUPLICATE', '重复提交，但未能取回首次结果，请刷新查看')
  }
}

/**
 * 短码生成（DATA_MODEL §7）：4 位大写字母数字，排除易混的 0 O 1 I。
 * 冲突时重试，不做全局自增序列。
 */
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function randomShortCode () {
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)]
  }
  return s
}

/** 取一个当前未被占用的短码；重试上限内取不到即报错，不静默降级 */
async function allocShortCode (ctx, maxRetry = 10) {
  const coll = ctx.db.collection('grouporder-activity')
  for (let i = 0; i < maxRetry; i++) {
    const code = randomShortCode()
    const { data } = await coll.where({ short_code: code }).limit(1).get()
    if (!data || !data.length) return code
  }
  throwBiz('STATE_CHANGED', '活动短码分配失败，请重试')
}

/**
 * 订单号（DATA_MODEL §7）：YYMMDD-{short_code}-{4位随机}
 * 唯一性最终由唯一索引保证，这里只负责生成候选值。
 */
function buildOrderNo (shortCode, now) {
  const d = new Date(now)
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `${yy}${mm}${dd}-${shortCode}-${rand}`
}

/** 各类业务编号：举报、复核、处置、申诉、隐私事项、日志 */
function buildBizNo (prefix, now) {
  const d = new Date(now)
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${prefix}${ymd}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

module.exports = {
  isDuplicateKeyError,
  genKey,
  runOnce,
  allocShortCode,
  randomShortCode,
  buildOrderNo,
  buildBizNo
}
