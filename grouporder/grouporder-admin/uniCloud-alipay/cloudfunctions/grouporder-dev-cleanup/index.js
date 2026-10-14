/**
 * grouporder-dev-cleanup · 开发 / 测试数据一次性清理
 *
 * ⚠⚠⚠ 仅限开发 / 测试环境使用，严禁上传到生产服务空间 ⚠⚠⚠
 *   - 本函数会【物理删除】整张集合的全部数据，不可恢复。
 *   - 正式运营后台不得提供此能力（OPS §2.2 红线④：运营不得代替团长经营；
 *     治理用下架不用删除；D-035 订单三年留存）。因此它是一个独立的开发用云函数，
 *     不接入任何后台菜单、不走 ops 云对象、不对运营开放。
 *   - 用途：本地 / 测试环境把跑出来的测试活动、订单、商品、治理记录清干净，
 *     重置到空库状态，便于重新走一遍流程。
 *
 * 运行方式：HBuilderX 右键本函数「本地运行」或「上传并运行」，或在 uniCloud 控制台测试。
 * 必须传确认口令，否则拒绝执行（防误触）。
 *
 * 入参：
 *   {
 *     "confirm": "WIPE-ALL",                 // 必填，固定口令，缺失或不符一律拒绝
 *     "scopes": ["activity","order","goodslib","governance"]  // 选填，默认全部四组
 *   }
 * 出参：
 *   { ok: true, deleted: { 集合名: 条数, ... }, scopes: [...] }
 */

const CONFIRM_TOKEN = 'WIPE-ALL'

// 清理分组 → 集合清单。按需扩展，但不要把 uni-id-users / uni-pay-orders 等非本业务表放进来。
const GROUPS = {
  // 活动 + 活动内商品
  activity: ['grouporder-activity', 'grouporder-goods'],
  // 订单 + 订单明细
  order: ['grouporder-order', 'grouporder-order-item'],
  // 账号级商品库 + 分类
  goodslib: ['grouporder-goods-lib', 'grouporder-goods-category'],
  // 举报 / 复核 / 内容检测 / 发布者处置（含工作台堆积的内容检测记录）
  governance: ['grouporder-report', 'grouporder-report-review', 'grouporder-content-check', 'grouporder-restriction'],
}

const BATCH = 500

/** 清空一张集合（分批删，返回删除条数）。_id 恒非空，neq('') 即匹配全部 */
async function wipeCollection (db, dbCmd, name) {
  let total = 0
  for (;;) {
    const { data } = await db.collection(name).where({ _id: dbCmd.neq('') }).field({ _id: true }).limit(BATCH).get()
    if (!data || !data.length) break
    const ids = data.map((d) => d._id)
    const res = await db.collection(name).where({ _id: dbCmd.in(ids) }).remove()
    total += (res.deleted || ids.length)
    if (data.length < BATCH) break
  }
  return total
}

exports.main = async (event = {}) => {
  // 定时触发器参数带 Type==='Timer'，这里额外挡一道：绝不因误配触发器而自动清库
  if (event && event.Type === 'Timer') {
    return { ok: false, error: '本函数禁止由定时触发器调用' }
  }
  if (event.confirm !== CONFIRM_TOKEN) {
    return { ok: false, error: `需要传 confirm:"${CONFIRM_TOKEN}" 才会执行；这是不可恢复的清库操作` }
  }

  const db = uniCloud.database()
  const dbCmd = db.command

  const scopes = Array.isArray(event.scopes) && event.scopes.length ? event.scopes : Object.keys(GROUPS)
  const collections = [...new Set(scopes.flatMap((s) => GROUPS[s] || []))]
  if (!collections.length) {
    return { ok: false, error: '没有匹配的清理分组，scopes 可选：' + Object.keys(GROUPS).join(' / ') }
  }

  const deleted = {}
  for (const name of collections) {
    try {
      deleted[name] = await wipeCollection(db, dbCmd, name)
    } catch (e) {
      deleted[name] = `失败：${e.message}`
      console.error('[dev-cleanup] 清理失败', name, e)
    }
  }

  console.warn('[dev-cleanup] 已清理', JSON.stringify({ scopes, deleted }))
  return { ok: true, scopes, deleted }
}
