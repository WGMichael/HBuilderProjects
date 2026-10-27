/**
 * 用户商品库的沉淀与治理反写（GOODS_LIB_SPEC §4、§7，D-063、D-064）
 *
 * 放在 common 而不是 goods-co：sinkToLib 被 activity-co 调用、
 * blockLibByGoods 被 ops-co 调用，放在 goods-co 会形成云对象互调。
 */
const oplog = require('./oplog')
const { throwBiz } = require('./errors')

/**
 * 商品保存时自动沉淀（§4.2）。
 *
 * 判定键：user_id（活动的团长，不是当前操作者）+ name（trim 后精确匹配）+ deleted = 0
 * - 未命中 → 新建；use_count = 0，category_id 取团长显式选择的分类，未选则留空（沉淀不猜测分类）
 * - 命中   → 更新内容与三个 last_* 值；use_count 不变，category_id 仅在团长显式选择时改写（D-088）
 * - governance_blocked = 1 的记录跳过更新，不因团长重新编辑而解除封禁
 *
 * §4.4：沉淀失败【不得导致商品保存失败】。商品保存是主动作，沉淀是附属动作。
 *
 * opts.categoryId（D-088）：团长在 M-11 显式选择的商品库分类。undefined 表示不指定——
 * 新建记录归入未分组、已有记录保持原分类（沉淀不猜测分类）；'' 表示归入未分组。
 * 调用方须先用 assertOwnCategory 校验归属，这里不再校验（沉淀失败不能反噬商品保存）。
 */
async function sinkToLib (ctx, goodsDoc, leaderUid, opts = {}) {
  const categoryId = opts.categoryId
  try {
    const name = String(goodsDoc.name || '').trim()
    if (!name) return null

    const coll = ctx.db.collection('grouporder-goods-lib')
    const { data } = await coll.where({
      user_id: leaderUid,
      name,
      deleted: 0
    }).limit(1).get()

    const existing = data && data[0]

    if (existing) {
      if (existing.governance_blocked === 1) {
        // 被封禁的库记录不更新，否则团长可以靠重新保存洗白
        return existing._id
      }
      await coll.doc(existing._id).update({
        name,
        description: goodsDoc.description || '',
        // 整体替换：update() 对对象值默认按子字段合并，会残留旧图的子字段
        cover_image: goodsDoc.cover_image ? ctx.db.command.set(goodsDoc.cover_image) : goodsDoc.cover_image,
        detail_images: goodsDoc.detail_images || [],
        unit: goodsDoc.unit || '份',
        last_price: goodsDoc.price,
        last_total_stock: goodsDoc.total_stock,
        last_per_user_limit: goodsDoc.per_user_limit,
        is_recommend: goodsDoc.is_recommend || 0,
        img_check_status: goodsDoc.img_check_status || 0,
        last_used_time: ctx.now,
        update_date: ctx.now,
        ...(categoryId !== undefined ? { category_id: categoryId || '' } : {})
      })
      return existing._id
    }

    const res = await coll.add({
      user_id: leaderUid,
      name,
      description: goodsDoc.description || '',
      cover_image: goodsDoc.cover_image,
      detail_images: goodsDoc.detail_images || [],
      unit: goodsDoc.unit || '份',
      last_price: goodsDoc.price,
      last_total_stock: goodsDoc.total_stock,
      last_per_user_limit: goodsDoc.per_user_limit,
      last_used_time: ctx.now,
      use_count: 0,
      is_recommend: goodsDoc.is_recommend || 0,
      category_id: categoryId || '',
      img_check_status: goodsDoc.img_check_status || 0,
      governance_blocked: 0,
      deleted: 0,
      create_date: ctx.now,
      update_date: ctx.now
    })
    return res.id
  } catch (e) {
    // §4.4：只记服务端日志，不向上抛
    console.error('[goodslib] 沉淀失败，商品保存不受影响：', e)
    return null
  }
}

/**
 * 治理反写：商品被下架时封禁商品库记录（§7、D-064）。
 *
 * 匹配条件是两条的【并集】，两条都要执行：
 * ① _id = goods.lib_id（lib_id 非空时）——覆盖复制后被团长改名
 * ② user_id = 活动团长 且 name = goods.name 且 deleted = 0
 *    ——覆盖手工新增、以及删掉旧记录后同名重新沉淀
 *
 * 命中记录即使 deleted = 1 也要封禁，防止恢复软删后重新可用。
 * 两条都匹配不到时静默跳过、不报错。
 */
async function blockLibByGoods (ctx, goodsDoc, leaderUid, caseNo) {
  const coll = ctx.db.collection('grouporder-goods-lib')
  const hits = new Map()

  if (goodsDoc.lib_id) {
    const { data } = await coll.doc(goodsDoc.lib_id).get().catch(() => ({ data: [] }))
    if (data && data[0]) hits.set(data[0]._id, data[0])
  }

  const name = String(goodsDoc.name || '').trim()
  if (name) {
    // 条件②只限定 deleted = 0；条件①命中的软删记录已在上面收进来
    const { data } = await coll.where({ user_id: leaderUid, name, deleted: 0 }).get()
    for (const d of (data || [])) hits.set(d._id, d)
  }

  const blocked = []
  for (const [libId, doc] of hits) {
    if (doc.governance_blocked === 1) continue
    await coll.doc(libId).update({ governance_blocked: 1, update_date: ctx.now })
    blocked.push(libId)
    // 反写动作单独写一条审计，与主操作共用 request_id
    await oplog.success(ctx, {
      action_type: oplog.ACTION.GOODS_LIB_BLOCKED,
      object_type: 'goods_lib',
      object_id: libId,
      case_no: caseNo || '',
      reason: `商品「${name}」被治理下架，反写封禁商品库记录`,
      prev_state: { governance_blocked: doc.governance_blocked || 0 },
      next_state: { governance_blocked: 1 },
      request_id: ctx.requestId
    })
  }
  return blocked
}

/**
 * 恢复商品时把库记录的封禁标记置回（§7、OPS §6.2）。
 * 匹配口径与封禁一致，否则会留下解不掉的封禁。
 */
async function unblockLibByGoods (ctx, goodsDoc, leaderUid, caseNo) {
  const coll = ctx.db.collection('grouporder-goods-lib')
  const hits = new Map()

  if (goodsDoc.lib_id) {
    const { data } = await coll.doc(goodsDoc.lib_id).get().catch(() => ({ data: [] }))
    if (data && data[0]) hits.set(data[0]._id, data[0])
  }
  const name = String(goodsDoc.name || '').trim()
  if (name) {
    const { data } = await coll.where({ user_id: leaderUid, name, deleted: 0 }).get()
    for (const d of (data || [])) hits.set(d._id, d)
  }

  const released = []
  for (const [libId, doc] of hits) {
    if (doc.governance_blocked !== 1) continue
    await coll.doc(libId).update({ governance_blocked: 0, update_date: ctx.now })
    released.push(libId)
    await oplog.success(ctx, {
      action_type: oplog.ACTION.GOODS_LIB_BLOCKED,
      object_type: 'goods_lib',
      object_id: libId,
      case_no: caseNo || '',
      reason: `商品「${name}」治理恢复，解除商品库封禁`,
      prev_state: { governance_blocked: 1 },
      next_state: { governance_blocked: 0 },
      request_id: ctx.requestId
    })
  }
  return released
}

/**
 * 活动里单独调整库存 / 限购（goodsAdjustStock）后，同步到同名库记录的默认值。
 *
 * 只改 last_total_stock / last_per_user_limit：调库存不是一次完整的保存，
 * 不新建库记录、不刷新 last_used_time、不动其他内容字段；封禁记录跳过（D-064）。
 * 与 sinkToLib 同一判定键（团长 + 名称 + 未删除），同样不得反噬主操作。
 */
async function syncStockToLib (ctx, goodsDoc, leaderUid) {
  try {
    const name = String(goodsDoc.name || '').trim()
    if (!name) return
    await ctx.db.collection('grouporder-goods-lib')
      .where({ user_id: leaderUid, name, deleted: 0, governance_blocked: ctx.db.command.neq(1) })
      .update({
        last_total_stock: goodsDoc.total_stock || 0,
        last_per_user_limit: goodsDoc.per_user_limit || 0,
        update_date: ctx.now
      })
  } catch (e) {
    console.error('[goodslib] 库存默认值同步失败，调整本身不受影响：', e)
  }
}

/**
 * 校验商品库分类属于该用户（D-088）。空串 / undefined 表示未分组或不指定，直接通过
 */
async function assertOwnCategory (ctx, uid, categoryId) {
  if (!categoryId) return null
  const { data } = await ctx.db.collection('grouporder-goods-category').doc(categoryId).get()
  const cat = data && data[0]
  if (!cat) throwBiz('NOT_FOUND', '分类不存在')
  if (cat.user_id !== uid) throwBiz('FORBIDDEN', '无权使用他人的分类')
  return cat // 返回分类文档，调用方可取 name 做展示小类快照（D-066 修订）
}

/**
 * 小类所属大类的名称，供活动商品快照 category_parent_name（Excel 清单「类别」列，D-149）。
 * 传入已校验归属的小类文档；大类本身或查不到时返回空串
 */
async function parentNameOf (ctx, cat) {
  if (!cat || !cat.parent_id) return ''
  const { data } = await ctx.db.collection('grouporder-goods-category').doc(cat.parent_id).get()
  const parent = data && data[0]
  return (parent && parent.user_id === cat.user_id) ? (parent.name || '') : ''
}

module.exports = { sinkToLib, syncStockToLib, blockLibByGoods, unblockLibByGoods, assertOwnCategory, parentNameOf }
