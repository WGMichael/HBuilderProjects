/**
 * grouporder-goods-co · 商品库与分类（账号级）
 * 服务对象：client
 * 契约：docs/arch/CLOUD_API.md §6、GOODS_LIB_SPEC §5、§10
 *
 * 商品库是【账号级】资产，与任何单个活动无关。
 * 沉淀 _sinkToLib 与治理反写 _blockLibByGoods 都在 common/goodslib.js，
 * 不在本对象暴露为方法——前者被 activity-co 调用、后者被 ops-co 调用。
 */
const {
  auth, errors, paging, state, review, contentcheck, files, goodslib, bindMethods
} = require('grouporder-common')
const { fileurl } = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors
const { GOVERNANCE, ACTIVITY } = state
// 商品库改动同步到活动商品的字段（D-143）：只同步内容；价格 / 库存 / 限购每场可不同，单位有订单后改动影响明细显示，推荐是活动内标识
const LIB_SYNC_FIELDS = ['name', 'description', 'cover_image', 'detail_images']

const MAX_PARENT_CATEGORY = 50     // 大类上限（D-066）
const MAX_CHILD_CATEGORY = 100     // 每个大类下的小类上限（D-066）
const MAX_GOODS_PER_ACTIVITY = 50  // 活动商品上限（D-024、AC-GL-013）
const MAX_RECOMMEND_PER_ACTIVITY = 5
const UNGROUPED = '__none__'       // 未分组筛选标识，不是一条分类记录（category_id 为空的商品集合）
const UNCATEGORIZED = '__uncat__'  // 虚拟「未分类」大类标识，容纳未分组小类，不是一条分类记录
// 商品表无幂等键字段，复用请求的重试按「同活动 + 同来源库记录 + 窗口内」判重
const COPY_IDEMPOTENT_WINDOW_MS = 60 * 1000

module.exports = {
  async _before () {
    bindMethods(this, module.exports)
    this.ctx = await auth.createContext(this, { admin: false })
    this.db = this.ctx.db
    this.dbCmd = this.ctx.db.command
  },

  async _after (error, result) {
    // 使用中自动续期登录（auth.attachNewToken）
    if (error) return auth.attachNewToken(this.ctx, errors.normalize(error))
    // 图片地址以 fileID 为准换成新的访问地址（D-119，common/fileurl）
    return auth.attachNewToken(this.ctx, await fileurl.refresh(result))
  },

  // ==========================================================================
  // 内部工具
  // ==========================================================================

  /** 读库记录并校验归属：所有 lib_id 入参都要过这一关，防止越权读写他人商品 */
  async _getOwnLib (uid, libId) {
    assertParam(libId, '缺少商品库记录标识')
    const { data } = await this.db.collection('grouporder-goods-lib').doc(libId).get()
    const lib = data && data[0]
    if (!lib) throwBiz('NOT_FOUND', '商品库记录不存在')
    if (lib.user_id !== uid) throwBiz('FORBIDDEN', '无权操作他人的商品库记录')
    return lib
  },

  async _getOwnCategory (uid, categoryId) {
    assertParam(categoryId, '缺少分类标识')
    const { data } = await this.db.collection('grouporder-goods-category').doc(categoryId).get()
    const cat = data && data[0]
    if (!cat) throwBiz('NOT_FOUND', '分类不存在')
    if (cat.user_id !== uid) throwBiz('FORBIDDEN', '无权操作他人的分类')
    return cat
  },

  // ==========================================================================
  // 商品库
  // ==========================================================================

  /**
   * 商品库列表（M-28 / M-29）
   * 只返回当前登录用户的记录，【不接受任何 user_id 入参】（GOODS_LIB_SPEC §5.5）。
   * 按 last_used_time 倒序；被封禁记录仍返回但标记为不可选，由前端置灰并说明原因。
   */
  async libList (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const p = paging.normalize(params, {
      defaultOrderBy: { field: 'last_used_time', direction: 'desc' },
      allowOrderFields: ['last_used_time', 'create_date']
    })

    const where = { user_id: uid, deleted: 0 }
    const categoryId = params.category_id !== undefined ? params.category_id : p.filters.category_id
    if (categoryId === UNGROUPED || categoryId === UNCATEGORIZED) {
      // 「未分组」/「未分类」= category_id 为空的集合，不是一条分类记录
      where.category_id = this.dbCmd.in(['', null])
    } else if (categoryId) {
      // 传入大类时展开到旗下所有小类；传入小类时精确匹配。查不到归属的当作精确匹配（空结果）
      const { data: catData } = await this.db.collection('grouporder-goods-category').doc(categoryId).get()
      const cat = catData && catData[0]
      if (cat && cat.user_id === uid && !cat.parent_id) {
        const childRes = await this.db.collection('grouporder-goods-category')
          .where({ user_id: uid, parent_id: categoryId }).field({ _id: true }).limit(MAX_CHILD_CATEGORY).get()
        const childIds = (childRes.data || []).map(c => c._id)
        where.category_id = this.dbCmd.in(childIds.length ? childIds : ['__no_such__'])
      } else {
        where.category_id = categoryId
      }
    }
    const keyword = String(params.keyword || p.filters.keyword || '').trim()
    if (keyword) {
      where.name = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    }

    const coll = this.db.collection('grouporder-goods-lib').where(where)
    const [listRes, countRes] = await Promise.all([
      coll.orderBy(p.orderBy.field, p.orderBy.direction).skip(p.skip).limit(p.pageSize).get(),
      coll.count()
    ])

    const list = (listRes.data || []).map(d => ({
      _id: d._id,
      name: d.name,
      description: d.description || '',
      cover_image: d.cover_image,
      detail_images: d.detail_images || [],
      unit: d.unit,
      last_price: d.last_price,
      last_total_stock: d.last_total_stock,
      last_per_user_limit: d.last_per_user_limit,
      last_used_time: d.last_used_time,
      use_count: d.use_count || 0,
      is_recommend: d.is_recommend || 0,
      category_id: d.category_id || '',
      img_check_status: d.img_check_status || 0,
      governance_blocked: d.governance_blocked || 0,
      // 被封禁与图片被拦截的记录都不可复用
      selectable: d.governance_blocked !== 1 && d.img_check_status !== contentcheck.CHECK_STATUS.BLOCKED,
      unselectable_reason: d.governance_blocked === 1
        ? '该商品曾被平台下架，不能继续使用'
        : (d.img_check_status === contentcheck.CHECK_STATUS.BLOCKED ? '该商品图片未通过内容检测' : '')
    }))
    return ok(paging.wrap(list, countRes.total, ctx.now))
  },

  /**
   * 编辑库记录与三项预填值（M-29，GOODS_LIB_SPEC §5.6）
   * 改名撞库则拒绝；按 fileID 判定真的换了图才把 img_check_status 归 0 并重新送检；
   * governance_blocked = 1 的记录禁止编辑（否则可靠改名洗白）；
   * 编辑写 update_date，【不更新 last_used_time】——编辑不是使用。
   */
  /**
   * 商品库改动自动同步到活动商品（D-143，修订 D-063 / D-064 的「复制不是引用、不做字段同步」）
   *
   * 范围：本人草稿 / 审核中 / 进行中、未被下架的活动；活动商品以「来源是该库记录（lib_id）或名称等于修改前的库名称」认定，
   * 被下架的商品跳过。字段：LIB_SYNC_FIELDS 中本次真正改了的；同一活动已有同名商品时该活动跳过改名、其余照改。
   * 换图的活动商品重新送检；有内容改动的活动按 D-048 走 review.applyContentChange（进行中 / 审核中重新审核，草稿只升版本）。
   * 不再沉淀回商品库，避免循环。任何单个活动失败只记日志，不影响商品库本身的保存。
   * @returns {{ activityCount, goodsCount, recheckCount, oldFileIds }}
   */
  async _syncLibToActivities (uid, lib, patch) {
    const ctx = this.ctx
    const out = { activityCount: 0, goodsCount: 0, recheckCount: 0, oldFileIds: [] }
    const fields = LIB_SYNC_FIELDS.filter(k => patch[k] !== undefined)
    if (!fields.length) return out
    const cmd = this.dbCmd
    try {
      const acts = await paging.fetchAll(() => this.db.collection('grouporder-activity')
        .where({ leader_uid: uid, status: cmd.in([ACTIVITY.DRAFT, ACTIVITY.REVIEWING, ACTIVITY.ONGOING]), governance_status: cmd.neq(GOVERNANCE.OFF) })
        .orderBy('_id', 'asc'))
      if (!acts.length) return out
      const actMap = new Map(acts.map(a => [a._id, a]))
      const oldName = String(lib.name || '').trim()
      const goodsList = await paging.fetchAllByIds(acts.map(a => a._id), ids => this.db.collection('grouporder-goods')
        .where(cmd.and([
          { activity_id: cmd.in(ids) },
          cmd.or([{ lib_id: lib._id }, { name: oldName }])
        ]))
        .orderBy('_id', 'asc'))
      const touchedActs = new Map() // activity_id → 是否有内容改动
      for (const g of goodsList) {
        if (g.governance_status === GOVERNANCE.OFF) continue
        const a = actMap.get(g.activity_id)
        if (!a) continue
        const gp = {}
        for (const k of fields) gp[k] = patch[k]
        // 改名：同一活动已有同名商品时，这个活动跳过改名（D-093 活动内不重名）
        if (gp.name !== undefined && gp.name !== String(g.name || '').trim()) {
          const { total } = await this.db.collection('grouporder-goods')
            .where({ activity_id: g.activity_id, name: gp.name, _id: cmd.neq(g._id) }).count()
          if (total) delete gp.name
        } else if (gp.name !== undefined) {
          delete gp.name
        }
        if (gp.description !== undefined && String(gp.description) === String(g.description || '')) delete gp.description
        const same = (x, y) => files.fileIdsOf(x).join('|') === files.fileIdsOf(y).join('|')
        if (gp.cover_image !== undefined && same(gp.cover_image, g.cover_image)) delete gp.cover_image
        if (gp.detail_images !== undefined && same(gp.detail_images || [], g.detail_images || [])) delete gp.detail_images
        if (!Object.keys(gp).length) continue
        try {
          const img = gp.cover_image !== undefined || gp.detail_images !== undefined
          const dbPatch = files.toDbPatch(ctx, gp)
          if (img) dbPatch.img_check_status = contentcheck.CHECK_STATUS.PENDING
          await this.db.collection('grouporder-goods').doc(g._id).update(dbPatch)
          if (img) {
            const mg = Object.assign({}, g, gp)
            await contentcheck.submitImages(ctx, {
              objectType: contentcheck.OBJECT_TYPE.GOODS,
              objectId: g._id,
              contentVersion: a.content_version || 1,
              fileIds: files.fileIdsOf(mg.cover_image, mg.detail_images)
            })
            out.oldFileIds.push(...files.fileIdsOf(g.cover_image, g.detail_images))
          }
          out.goodsCount++
          touchedActs.set(a._id, touchedActs.get(a._id) || review.isContentChange(gp))
        } catch (e) {
          console.error('[goods-co] 商品库同步到活动商品失败', g._id, e)
        }
      }
      for (const [actId, content] of touchedActs) {
        out.activityCount++
        if (!content) continue
        try {
          const r = await review.applyContentChange(ctx, actMap.get(actId))
          if (r && r.need_recheck) out.recheckCount++
        } catch (e) {
          console.error('[goods-co] 同步后重新审核失败', actId, e)
        }
      }
    } catch (e) {
      console.error('[goods-co] 商品库同步到活动失败，商品库已保存', e)
    }
    return out
  },

  async libUpdate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const lib = await this._getOwnLib(uid, params.lib_id)

    if (lib.governance_blocked === 1) {
      throwBiz('FORBIDDEN', '该商品曾被平台下架，商品库记录不可编辑')
    }
    if (lib.deleted === 1) throwBiz('NOT_FOUND', '该商品库记录已删除')

    // 只有值真正变化的字段才进 patch（同 activity-co goodsUpdate）：前端编辑页每次都整表提交封面与详情图，
    // 若照单全收，每次保存都会把图片检测重置为待检并重新送检——被拦截的图改个名就能重新变成可选
    const sameFiles = (a, b) => files.fileIdsOf(a).join('|') === files.fileIdsOf(b).join('|')
    const patch = {}
    if (params.name !== undefined) {
      const n = String(params.name).trim()
      assertParam(n.length >= 1 && n.length <= 50, '商品名称为 1–50 字')
      if (n !== lib.name) {
        // 同名是沉淀去重的判定依据，库中出现两条同名会让后续沉淀行为不确定
        const dup = await this.db.collection('grouporder-goods-lib')
          .where({ user_id: uid, name: n, deleted: 0 }).limit(1).get()
        if (dup.data && dup.data.length && dup.data[0]._id !== lib._id) {
          throwBiz('DUPLICATE', '商品库中已存在同名商品，请换一个名称')
        }
        patch.name = n
      }
    }
    if (params.description !== undefined) {
      assertParam(String(params.description).length <= 500, '商品说明不超过 500 字')
      if (String(params.description) !== String(lib.description || '')) patch.description = String(params.description)
    }
    if (params.cover_image !== undefined) {
      assertParam(params.cover_image, '商品必须包含封面图')
      if (!sameFiles(params.cover_image, lib.cover_image)) patch.cover_image = params.cover_image
    }
    if (params.detail_images !== undefined) {
      assertParam((params.detail_images || []).length <= 9, '详情图最多 9 张')
      if (!sameFiles(params.detail_images || [], lib.detail_images || [])) patch.detail_images = params.detail_images
    }
    if (params.unit !== undefined) {
      const u = String(params.unit).trim()
      assertParam(u, '商品单位不能为空')
      if (u !== lib.unit) patch.unit = u
    }
    // 三个 last_* 允许直接编辑：语义是「下次复用时的预填值」
    if (params.last_price !== undefined) {
      assertParam(Number.isInteger(params.last_price) && params.last_price >= 0, '单价必须是不小于 0 的整数（单位：分）')
      if (params.last_price !== lib.last_price) patch.last_price = params.last_price
    }
    if (params.last_total_stock !== undefined) {
      assertParam(Number.isInteger(params.last_total_stock) && params.last_total_stock >= 0, '总库存必须是不小于 0 的整数')
      if (params.last_total_stock !== lib.last_total_stock) patch.last_total_stock = params.last_total_stock
    }
    if (params.last_per_user_limit !== undefined) {
      assertParam(Number.isInteger(params.last_per_user_limit) && params.last_per_user_limit >= 0, '每人限购必须是不小于 0 的整数')
      if (params.last_per_user_limit !== lib.last_per_user_limit) patch.last_per_user_limit = params.last_per_user_limit
    }
    if (params.is_recommend !== undefined) {
      const want = params.is_recommend === 1 ? 1 : 0
      if (want !== (lib.is_recommend || 0)) patch.is_recommend = want
    }
    if (params.category_id !== undefined) {
      if (params.category_id) await this._getOwnCategory(uid, params.category_id)
      const c = params.category_id || ''
      if (c !== (lib.category_id || '')) patch.category_id = c
    }
    // 什么都没变：不写库、不送检，按成功返回（前端整表提交时属正常情况）
    if (!Object.keys(patch).length) {
      return ok({ lib_id: lib._id, img_recheck: false, changed: false })
    }

    // 按 fileID 判断是否真的换了图；没换图不重置送检状态
    const imgChanged = patch.cover_image !== undefined || patch.detail_images !== undefined
    if (imgChanged) patch.img_check_status = contentcheck.CHECK_STATUS.PENDING
    patch.update_date = ctx.now

    // cover_image 整体替换（见 common/files.toDbPatch）；patch 本身保持原始值，下面送检与回收还要用
    await this.db.collection('grouporder-goods-lib').doc(lib._id).update(files.toDbPatch(ctx, patch))

    const merged = Object.assign({}, lib, patch)
    if (imgChanged) {
      // 库记录送检用 goods_lib 类型：object_id 是库记录 id，回调据此回写商品库而不是活动商品
      await contentcheck.submitImages(ctx, {
        objectType: contentcheck.OBJECT_TYPE.GOODS_LIB,
        objectId: lib._id,
        contentVersion: 1,
        fileIds: files.fileIdsOf(merged.cover_image, merged.detail_images)
      })
    }

    // 同步到未结束活动里的同一商品（D-143）；放在回收旧图之前，活动商品换下的旧图一起回收
    const synced = await this._syncLibToActivities(uid, lib, patch)

    if (imgChanged) {
      // 换下来的旧图（库记录 + 被同步的活动商品），各表都无人引用时从云存储删除（D-084）
      await files.releaseFiles(ctx,
        files.fileIdsOf(lib.cover_image, lib.detail_images).concat(synced.oldFileIds),
        files.fileIdsOf(merged.cover_image, merged.detail_images)
      )
    }

    return ok({
      lib_id: lib._id,
      img_recheck: imgChanged,
      changed: true,
      // 同步结果（D-143）：同步了几个活动 / 几件商品，其中几个活动因此进入（重新）审核
      synced: { activity_count: synced.activityCount, goods_count: synced.goodsCount, recheck_count: synced.recheckCount }
    })
  },

  /**
   * 在商品库直接新建商品（M-29，D-088）
   * 补充 D-063「库记录只由活动商品沉淀」：团长可以先建库存模板，再复用到活动。
   * 口径与沉淀一致：同一用户未删除的记录不得同名（同名是沉淀判重依据）；封面必填、详情图 ≤ 9（D-041）；
   * use_count = 0，last_used_time = now（新建排在列表最前）；有图即送检（D-058）。
   */
  async libCreate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)

    const name = String(params.name || '').trim()
    assertParam(name.length >= 1 && name.length <= 50, '商品名称为 1–50 字')
    const description = String(params.description || '')
    assertParam(description.length <= 500, '商品说明不超过 500 字')
    assertParam(params.cover_image, '商品必须包含封面图')
    assertParam((params.detail_images || []).length <= 9, '详情图最多 9 张')
    const unit = String(params.unit || '份').trim()
    assertParam(unit, '商品单位不能为空')
    const lastPrice = params.last_price === undefined ? 0 : params.last_price
    assertParam(Number.isInteger(lastPrice) && lastPrice >= 0, '单价必须是不小于 0 的整数（单位：分）')
    const lastStock = params.last_total_stock === undefined ? 0 : params.last_total_stock
    assertParam(Number.isInteger(lastStock) && lastStock >= 0, '总库存必须是不小于 0 的整数')
    const lastLimit = params.last_per_user_limit === undefined ? 0 : params.last_per_user_limit
    assertParam(Number.isInteger(lastLimit) && lastLimit >= 0, '每人限购必须是不小于 0 的整数')
    if (params.category_id) await this._getOwnCategory(uid, params.category_id)

    const coll = this.db.collection('grouporder-goods-lib')
    const dup = await coll.where({ user_id: uid, name, deleted: 0 }).limit(1).get()
    if (dup.data && dup.data.length) throwBiz('DUPLICATE', '商品库中已存在同名商品，请换一个名称')

    const doc = {
      user_id: uid,
      name,
      description,
      cover_image: params.cover_image,
      detail_images: params.detail_images || [],
      unit,
      last_price: lastPrice,
      last_total_stock: lastStock,
      last_per_user_limit: lastLimit,
      last_used_time: ctx.now,
      use_count: 0,
      is_recommend: params.is_recommend === 1 ? 1 : 0,
      category_id: params.category_id || '',
      img_check_status: contentcheck.CHECK_STATUS.PENDING,
      governance_blocked: 0,
      deleted: 0,
      create_date: ctx.now,
      update_date: ctx.now
    }
    const res = await coll.add(doc)

    // 库记录送检用 goods_lib 类型（object_id 是库记录 id）
    await contentcheck.submitImages(ctx, {
      objectType: contentcheck.OBJECT_TYPE.GOODS_LIB,
      objectId: res.id,
      contentVersion: 1,
      fileIds: files.fileIdsOf(doc.cover_image, doc.detail_images)
    })
    return ok({ lib_id: res.id })
  },

  /**
   * 软删库记录（M-29）
   * 软删记录【同样保持封禁状态】（D-064），恢复后不可重新可用。
   * 删除不触碰云存储文件——同一 fileID 可能被活动商品引用（GOODS_LIB_SPEC §6）。
   */
  async libDelete (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const lib = await this._getOwnLib(uid, params.lib_id)
    if (lib.deleted === 1) return ok({ lib_id: lib._id, deleted: true, changed: false })

    await this.db.collection('grouporder-goods-lib').doc(lib._id).update({
      deleted: 1,
      update_date: ctx.now
    })
    return ok({ lib_id: lib._id, deleted: true, changed: true })
  },

  /**
   * 复用到当前活动（M-28，GOODS_LIB_SPEC §5.2）
   * 多选；价格/总库存/每人限购预填但必须逐项确认（D-063）；被下架商品不可选。
   * 复用 = 向活动新增商品 = 内容改动，按 D-048 会触发重新审核（§5.4）。
   */
  async libCopyToActivity (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    assertParam(Array.isArray(params.lib_ids) && params.lib_ids.length > 0, '请至少选择一个商品')
    // 同一次请求里重复的 id 只算一次
    const libIds = [...new Set(params.lib_ids.filter(Boolean))]

    // 校验目标活动：本人团长、草稿或进行中且未截止、治理状态正常（§5.5）
    const activity = await auth.requireLeader(ctx, params.activity_id)
    if (activity.governance_status === GOVERNANCE.OFF) throwBiz('ACTIVITY_OFFLINE')
    if (!review.canEditContent(activity, ctx.now)) {
      if (activity.status === state.ACTIVITY.CANCELLED) throwBiz('ACTIVITY_CANCELLED')
      throwBiz('ACTIVITY_CLOSED', '活动已结束，不能再添加商品')
    }

    const { data: existing } = await this.db.collection('grouporder-goods')
      .where({ activity_id: activity._id }).limit(MAX_GOODS_PER_ACTIVITY + 10).get()
    const current = existing || []
    const remainSlot = MAX_GOODS_PER_ACTIVITY - current.length
    assertParam(remainSlot > 0,
      `一个活动最多 ${MAX_GOODS_PER_ACTIVITY} 个商品，已达上限`, { remain: 0 })
    assertParam(libIds.length <= remainSlot,
      `一个活动最多 ${MAX_GOODS_PER_ACTIVITY} 个商品，当前还可添加 ${remainSlot} 个`,
      { remain: remainSlot })

    // 去重：本活动已有同名商品、或已有从同一条库记录复制来的商品，不再重复加入
    // （库记录按「团长 + 名称」唯一，活动里手工新建的同名商品也算已存在）
    const namesInActivity = new Set(current.map(g => String(g.name || '').trim()))
    const libIdsInActivity = new Set(current.map(g => g.lib_id).filter(Boolean))

    let recommendCount = current.filter(g => g.is_recommend === 1).length
    let maxSort = current.reduce((m, g) => Math.max(m, g.sort || 0), 0)

    const created = []
    const failed = []
    // 分类快照缓存：把来源库记录的小类名带进活动商品供买家分组（D-066 修订），
    // 大类名一并快照供 Excel 清单「类别」列（D-149）；避免重复查分类表
    const catNameCache = new Map()
    const resolveCatName = async (categoryId) => {
      const none = { name: '', parentName: '' }
      if (!categoryId) return none
      if (catNameCache.has(categoryId)) return catNameCache.get(categoryId)
      const { data } = await this.db.collection('grouporder-goods-category').doc(categoryId).get()
      const c = data && data[0]
      const names = (c && c.user_id === uid)
        ? { name: c.name || '', parentName: await goodslib.parentNameOf(ctx, c) }
        : none
      catNameCache.set(categoryId, names)
      return names
    }

    for (const libId of libIds) {
      try {
        const lib = await this._getOwnLib(uid, libId)
        if (lib.deleted === 1) throwBiz('NOT_FOUND', '该商品库记录已删除')
        if (lib.governance_blocked === 1) {
          throwBiz('FORBIDDEN', '该商品曾被平台下架，不能继续使用')
        }

        // 幂等：窗口内同一活动已从同一库记录复制过，视作重试
        const dup = await this.db.collection('grouporder-goods').where({
          activity_id: activity._id,
          lib_id: libId,
          create_date: this.dbCmd.gte(ctx.now - COPY_IDEMPOTENT_WINDOW_MS)
        }).limit(1).get()
        if (dup.data && dup.data.length) {
          created.push({ lib_id: libId, goods_id: dup.data[0]._id, name: lib.name, duplicated: true })
          continue
        }
        // 幂等窗口之外的重复：如实列入失败，不当作成功
        if (libIdsInActivity.has(libId) || namesInActivity.has(String(lib.name || '').trim())) {
          throwBiz('DUPLICATE', `本次接龙已有「${lib.name}」，不能重复添加`)
        }

        const wantRecommend = lib.is_recommend === 1 ? 1 : 0
        // 推荐上限由服务端把关，绕过前端直接调接口同样要挡住（AC-GL-019）
        const isRecommend = (wantRecommend === 1 && recommendCount < MAX_RECOMMEND_PER_ACTIVITY) ? 1 : 0
        if (isRecommend) recommendCount++
        maxSort++
        const catNames = await resolveCatName(lib.category_id)

        const doc = {
          activity_id: activity._id,
          lib_id: lib._id,                       // 来源追溯，治理反写用
          category_name: catNames.name,          // 展示小类快照（D-066 修订）
          category_parent_name: catNames.parentName, // 大类快照，仅用于 Excel 清单（D-149）
          is_recommend: isRecommend,
          name: lib.name,
          description: lib.description || '',
          cover_image: lib.cover_image,          // 复制文件引用，不重新上传
          detail_images: lib.detail_images || [],
          price: lib.last_price,                 // 预填，须逐项确认
          unit: lib.unit || '份',
          total_stock: lib.last_total_stock,     // 预填，须逐项确认
          sold_qty: 0,
          per_user_limit: lib.last_per_user_limit, // 预填，须逐项确认
          on_sale: 1,
          governance_status: GOVERNANCE.NORMAL,
          ever_ordered: 0,
          sort: maxSort,
          // 库记录为通过则直接复制状态，不重复送检；其余一律置 0 重新检测（§8）
          img_check_status: lib.img_check_status === contentcheck.CHECK_STATUS.PASS
            ? contentcheck.CHECK_STATUS.PASS
            : contentcheck.CHECK_STATUS.PENDING,
          create_date: ctx.now
        }
        // category_id（分类归属）不复制，只快照小类名 category_name 供买家分组展示（D-066 修订）
        const res = await this.db.collection('grouporder-goods').add(doc)

        if (doc.img_check_status === contentcheck.CHECK_STATUS.PENDING) {
          await contentcheck.submitImages(ctx, {
            objectType: contentcheck.OBJECT_TYPE.GOODS,
            objectId: res.id,
            contentVersion: activity.content_version || 1,
            fileIds: [doc.cover_image, ...(doc.detail_images || [])].map(f => (f && f.fileID) || f)
          })
        }

        // 被复用的库记录：use_count + 1，last_used_time = now
        await this.db.collection('grouporder-goods-lib').doc(lib._id).update({
          use_count: this.dbCmd.inc(1),
          last_used_time: ctx.now,
          update_date: ctx.now
        })

        created.push({ lib_id: lib._id, goods_id: res.id, name: lib.name, duplicated: false })
        namesInActivity.add(String(lib.name || '').trim())
        libIdsInActivity.add(lib._id)
      } catch (e) {
        // 部分失败不得显示整体成功，已成功的保留（GOODS_LIB_SPEC §9）
        failed.push({ lib_id: libId, errCode: e.errCode || 'INVALID_PARAM', errMsg: e.errMsg || e.message })
      }
    }

    let recheck = { need_recheck: false, next_status: activity.status }
    if (created.length) {
      recheck = await review.applyContentChange(ctx, activity)
    }

    const payload = {
      created,
      failed,
      need_recheck: recheck.need_recheck,
      activity_status: recheck.next_status
    }
    if (failed.length && created.length) {
      // 明确列出成功与失败对象，不显示整体成功
      return errors.fail('PARTIAL_FAILED', '部分商品未能加入活动', payload)
    }
    if (failed.length && !created.length) {
      return errors.fail(failed[0].errCode, failed[0].errMsg, payload)
    }
    return ok(payload)
  },

  // ==========================================================================
  // 分类（M-30）
  // 用户私有，仅用于商品库筛选；不进活动展示与清单，参与者永远不可见（D-066）。
  // ==========================================================================

  /** 分类列表，按用户自定义顺序正序 */
  async categoryList () {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const { data } = await this.db.collection('grouporder-goods-category')
      .where({ user_id: uid })
      .orderBy('sort', 'asc')
      .orderBy('create_date', 'asc')
      // 够覆盖所有大类 + 全部小类
      .limit(MAX_PARENT_CATEGORY * (MAX_CHILD_CATEGORY + 1))
      .get()

    // 各小类与未分组的商品数（商品只挂小类，按 category_id 聚合即可）
    const agg = await this.db.collection('grouporder-goods-lib').aggregate()
      .match({ user_id: uid, deleted: 0 })
      .group({ _id: '$category_id', cnt: { $sum: 1 } })
      .limit(paging.AGG_LIMIT)
      .end()
    const cntMap = (agg.data || []).reduce((m, r) => { m[r._id || ''] = r.cnt; return m }, {})
    const ungrouped = cntMap[''] || 0
    // 「全部」用权威总数，不靠分类树累加：迁移遗留的商品 category_id 可能指向旧扁平分类（现算大类），
    // 不落在任何小类也不是未分组，树累加会漏掉它们（导致「全部 0 但列表有货」）
    const { total: totalGoods } = await this.db.collection('grouporder-goods-lib')
      .where({ user_id: uid, deleted: 0 }).count()

    const all = data || []
    const parents = all.filter(c => !c.parent_id)

    // 两级树：大类（含商品数合计）→ 小类
    const tree = parents.map(p => {
      const children = all.filter(c => c.parent_id === p._id)
        .map(c => ({ _id: c._id, name: c.name, sort: c.sort || 0, parent_id: p._id, goods_count: cntMap[c._id] || 0 }))
      return {
        _id: p._id, name: p.name, sort: p.sort || 0, is_virtual: false,
        goods_count: children.reduce((s, c) => s + c.goods_count, 0),
        children
      }
    })
    // 虚拟「未分类」大类 →「未分组」小类（category_id 为空的商品集合，不是真实记录）
    tree.push({
      _id: UNCATEGORIZED, name: '未分类', sort: 9999, is_virtual: true, goods_count: ungrouped,
      children: [{ _id: UNGROUPED, name: '未分组', sort: 0, parent_id: UNCATEGORIZED, goods_count: ungrouped, is_virtual: true }]
    })

    // 扁平小类列表（带所属大类信息），供「单件改分类」选择器与兼容旧页面使用
    const list = []
    for (const p of tree) {
      if (p.is_virtual) continue
      for (const c of p.children) list.push({ _id: c._id, name: c.name, sort: c.sort, parent_id: p._id, parent_name: p.name, goods_count: c.goods_count })
    }

    return ok({
      tree,
      list,
      ungrouped_count: ungrouped,
      total_goods: totalGoods, // 该用户全部未删商品数（「全部」chip 用，含迁移遗留的孤儿分类商品）
      total: parents.length,
      asOf: ctx.now
    })
  },

  /**
   * 新建分类（固定两级）。分类名不做内容安全检测（D-066）。
   * 不传 parent_id = 建大类（上限 50）；传 parent_id = 在该大类下建小类（每个大类上限 100）。
   */
  async categoryCreate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const name = String(params.name || '').trim()
    assertParam(name.length >= 1 && name.length <= 10, '分类名称为 1–10 字')
    const parentId = String(params.parent_id || '').trim()

    if (!parentId) {
      // 建大类
      const { total } = await this.db.collection('grouporder-goods-category')
        .where({ user_id: uid, parent_id: this.dbCmd.in(['', null]) }).count()
      assertParam(total < MAX_PARENT_CATEGORY, `最多创建 ${MAX_PARENT_CATEGORY} 个大类`, { max: MAX_PARENT_CATEGORY })
      const dup = await this.db.collection('grouporder-goods-category')
        .where({ user_id: uid, parent_id: this.dbCmd.in(['', null]), name }).limit(1).get()
      if (dup.data && dup.data.length) throwBiz('DUPLICATE', '已存在同名大类')
      const res = await this.db.collection('grouporder-goods-category').add({
        user_id: uid, parent_id: '', name, sort: total + 1, create_date: ctx.now
      })
      // 同时建一个同名小类（D-151）：在该大类下新建商品默认归入它，收纳「还没细分」的商品；
      // 它就是普通小类，可改名、删除，删大类时随大类级联删除
      const child = await this.db.collection('grouporder-goods-category').add({
        user_id: uid, parent_id: res.id, name, sort: 1, create_date: ctx.now
      })
      return ok({ category_id: res.id, parent_id: '', name, sort: total + 1, default_child_id: child.id })
    }

    // 建小类：父级必须是本人的大类（固定两级，不能挂在小类或虚拟「未分类」下）
    assertParam(parentId !== UNCATEGORIZED, '「未分类」是系统默认分组，不能在其下新建小类')
    const parent = await this._getOwnCategory(uid, parentId)
    assertParam(!parent.parent_id, '只能在大类下新建小类（固定两级）')
    const { total } = await this.db.collection('grouporder-goods-category')
      .where({ user_id: uid, parent_id: parentId }).count()
    assertParam(total < MAX_CHILD_CATEGORY, `每个大类下最多 ${MAX_CHILD_CATEGORY} 个小类`, { max: MAX_CHILD_CATEGORY })
    const dup = await this.db.collection('grouporder-goods-category')
      .where({ user_id: uid, parent_id: parentId, name }).limit(1).get()
    if (dup.data && dup.data.length) throwBiz('DUPLICATE', '同一大类下已存在同名小类')
    const res = await this.db.collection('grouporder-goods-category').add({
      user_id: uid, parent_id: parentId, name, sort: total + 1, create_date: ctx.now
    })
    return ok({ category_id: res.id, parent_id: parentId, name, sort: total + 1 })
  },

  /** 重命名或调整单个分类的顺序 */
  async categoryUpdate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const cat = await this._getOwnCategory(uid, params.category_id)

    const patch = {}
    if (params.name !== undefined) {
      const n = String(params.name).trim()
      assertParam(n.length >= 1 && n.length <= 10, '分类名称为 1–10 字')
      if (n !== cat.name) {
        // 同名只在同级之间判重：大类之间、或同一大类下的小类之间
        const sibWhere = cat.parent_id
          ? { user_id: uid, parent_id: cat.parent_id, name: n }
          : { user_id: uid, parent_id: this.dbCmd.in(['', null]), name: n }
        const dup = await this.db.collection('grouporder-goods-category')
          .where(sibWhere).limit(1).get()
        if (dup.data && dup.data.length) throwBiz('DUPLICATE', cat.parent_id ? '同一大类下已存在同名小类' : '已存在同名大类')
      }
      patch.name = n
    }
    if (params.sort !== undefined) {
      assertParam(Number.isInteger(params.sort), '排序值必须是整数')
      patch.sort = params.sort
    }
    assertParam(Object.keys(patch).length > 0, '没有需要修改的内容')

    await this.db.collection('grouporder-goods-category').doc(cat._id).update(patch)
    return ok({ category_id: cat._id })
  },

  /**
   * 删除分类（固定两级）：只删分类记录，【都不删商品】，其下商品 category_id 置空归入未分组（AC-GL-022）。
   * - 删小类：该小类下商品归入未分组，小类记录硬删。
   * - 删大类：连同其下所有小类一并硬删，这些小类下的商品全部归入未分组（与删小类同义，只是一次清掉整组分类）。
   */
  async categoryDelete (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const cat = await this._getOwnCategory(uid, params.category_id)

    if (!cat.parent_id) {
      // 删大类：取旗下小类，把这些小类下的商品归入未分组，再删小类与大类记录
      const childRes = await this.db.collection('grouporder-goods-category')
        .where({ user_id: uid, parent_id: cat._id }).field({ _id: true }).limit(MAX_CHILD_CATEGORY).get()
      const childIds = (childRes.data || []).map(c => c._id)
      let affected = 0
      if (childIds.length) {
        // 先摘除引用再删分类，避免留下悬空 category_id
        const gRes = await this.db.collection('grouporder-goods-lib')
          .where({ user_id: uid, category_id: this.dbCmd.in(childIds) })
          .update({ category_id: '', update_date: ctx.now })
        affected = gRes.updated || 0
        await this.db.collection('grouporder-goods-category')
          .where({ user_id: uid, parent_id: cat._id }).remove()
      }
      await this.db.collection('grouporder-goods-category').doc(cat._id).remove()
      return ok({ category_id: cat._id, children_deleted: childIds.length, affected })
    }

    // 删小类：先摘除引用再删分类，避免留下悬空 category_id
    const res = await this.db.collection('grouporder-goods-lib')
      .where({ user_id: uid, category_id: cat._id })
      .update({ category_id: '', update_date: ctx.now })
    await this.db.collection('grouporder-goods-category').doc(cat._id).remove()
    return ok({ category_id: cat._id, affected: res.updated || 0 })
  },

  /**
   * 分类批量排序（M-30 拖拽），按层级分别排：
   * 不传 parent_id = 排大类；传 parent_id = 排该大类下的小类。
   * 与 goodsSort 同一原则：整体重写为从 1 起的连续值，必须提交该层级的全部分类。
   */
  async categorySort (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const ids = params.category_ids
    assertParam(Array.isArray(ids) && ids.length > 0, '缺少排序后的分类顺序')
    const parentId = String(params.parent_id || '').trim()

    const where = parentId
      ? { user_id: uid, parent_id: parentId }
      : { user_id: uid, parent_id: this.dbCmd.in(['', null]) }
    const { data } = await this.db.collection('grouporder-goods-category')
      .where(where).limit(MAX_PARENT_CATEGORY * MAX_CHILD_CATEGORY).get()
    const currentIds = (data || []).map(c => c._id)
    assertParam(ids.length === currentIds.length,
      '排序必须提交该层级的全部分类', { expected: currentIds.length, received: ids.length })

    const set = new Set(currentIds)
    for (const id of ids) {
      assertParam(set.has(id), '排序列表包含不属于该层级的分类', { category_id: id })
      set.delete(id)
    }
    assertParam(set.size === 0, '排序列表存在重复分类')

    for (let i = 0; i < ids.length; i++) {
      await this.db.collection('grouporder-goods-category').doc(ids[i]).update({ sort: i + 1 })
    }
    return ok({ sorted: ids.length, parent_id: parentId, asOf: ctx.now })
  }
}
