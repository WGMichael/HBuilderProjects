/**
 * 用户商品库的沉淀与治理反写（GOODS_LIB_SPEC §4、§7，D-063、D-064）
 *
 * 放在 common 而不是 goods-co：sinkToLib 被 activity-co 调用、
 * blockLibByGoods 被 ops-co 调用，放在 goods-co 会形成云对象互调。
 */
const oplog = require('./oplog')

/**
 * 商品保存时自动沉淀（§4.2）。
 *
 * 判定键：user_id（活动的团长，不是当前操作者）+ name（trim 后精确匹配）+ deleted = 0
 * - 未命中 → 新建；use_count = 0，category_id 留空（沉淀不猜测分类）
 * - 命中   → 更新内容与三个 last_* 值；use_count 与 category_id 不变
 * - governance_blocked = 1 的记录跳过更新，不因团长重新编辑而解除封禁
 *
 * §4.4：沉淀失败【不得导致商品保存失败】。商品保存是主动作，沉淀是附属动作。
 */
async function sinkToLib (ctx, goodsDoc, leaderUid) {
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
        cover_image: goodsDoc.cover_image,
        detail_images: goodsDoc.detail_images || [],
        unit: goodsDoc.unit || '份',
        last_price: goodsDoc.price,
        last_total_stock: goodsDoc.total_stock,
        last_per_user_limit: goodsDoc.per_user_limit,
        is_recommend: goodsDoc.is_recommend || 0,
        img_check_status: goodsDoc.img_check_status || 0,
        last_used_time: ctx.now,
        update_date: ctx.now
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
      category_id: '',
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

module.exports = { sinkToLib, blockLibByGoods, unblockLibByGoods }
