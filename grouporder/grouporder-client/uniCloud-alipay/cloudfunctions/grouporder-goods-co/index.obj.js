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
  auth, errors, paging, state, review, contentcheck, files, bindMethods
} = require('grouporder-common')

const { throwBiz, assertParam, ok } = errors
const { GOVERNANCE } = state

const MAX_CATEGORY = 20            // 分类上限（D-066、AC-GL-023）
const MAX_GOODS_PER_ACTIVITY = 50  // 活动商品上限（D-024、AC-GL-013）
const MAX_RECOMMEND_PER_ACTIVITY = 5
const UNGROUPED = '__none__'       // 未分组筛选标识，不是一条分类记录
// 商品表无幂等键字段，复用请求的重试按「同活动 + 同来源库记录 + 窗口内」判重
const COPY_IDEMPOTENT_WINDOW_MS = 60 * 1000

module.exports = {
  async _before () {
    bindMethods(this, module.exports)
    this.ctx = await auth.createContext(this, { admin: false })
    this.db = this.ctx.db
    this.dbCmd = this.ctx.db.command
  },

  _after (error, result) {
    // 使用中自动续期登录（auth.attachNewToken）
    if (error) return auth.attachNewToken(this.ctx, errors.normalize(error))
    return auth.attachNewToken(this.ctx, result)
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
    if (categoryId === UNGROUPED) {
      // 「未分组」= category_id 为空的集合，不是一条分类记录
      where.category_id = this.dbCmd.in(['', null])
    } else if (categoryId) {
      where.category_id = categoryId
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

    if (imgChanged) {
      const merged = Object.assign({}, lib, patch)
      // 库记录送检用 goods_lib 类型：object_id 是库记录 id，回调据此回写商品库而不是活动商品
      await contentcheck.submitImages(ctx, {
        objectType: contentcheck.OBJECT_TYPE.GOODS_LIB,
        objectId: lib._id,
        contentVersion: 1,
        fileIds: files.fileIdsOf(merged.cover_image, merged.detail_images)
      })
      // 换下来的旧图，各表都无人引用时从云存储删除（D-084）
      await files.releaseFiles(ctx,
        files.fileIdsOf(lib.cover_image, lib.detail_images),
        files.fileIdsOf(merged.cover_image, merged.detail_images)
      )
    }

    return ok({ lib_id: lib._id, img_recheck: imgChanged, changed: true })
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
      throwBiz('ACTIVITY_CLOSED', '活动已截止，不能再添加商品')
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

        const doc = {
          activity_id: activity._id,
          lib_id: lib._id,                       // 来源追溯，治理反写用
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
        // category_id 不复制：分类不进入活动、清单与参与者视图（D-066）
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
      .limit(MAX_CATEGORY)
      .get()

    // 顺带给出各分类与未分组的商品数，M-28 的筛选 chips 要用
    const agg = await this.db.collection('grouporder-goods-lib').aggregate()
      .match({ user_id: uid, deleted: 0 })
      .group({ _id: '$category_id', cnt: { $sum: 1 } })
      // 显式上限：20 个分类 + 未分组共 21 组，可能超过平台默认返回条数
      .limit(paging.AGG_LIMIT)
      .end()
    const cntMap = (agg.data || []).reduce((m, r) => { m[r._id || ''] = r.cnt; return m }, {})

    const list = (data || []).map(c => ({
      _id: c._id,
      name: c.name,
      sort: c.sort || 0,
      goods_count: cntMap[c._id] || 0
    }))
    return ok({
      list,
      ungrouped_count: cntMap[''] || 0,
      total: list.length,
      asOf: ctx.now
    })
  },

  /** 新建分类；上限 20 个，由服务端校验（AC-GL-023）。分类名不做内容安全检测（D-066） */
  async categoryCreate (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const name = String(params.name || '').trim()
    assertParam(name.length >= 1 && name.length <= 10, '分类名称为 1–10 字')

    const { total } = await this.db.collection('grouporder-goods-category')
      .where({ user_id: uid }).count()
    assertParam(total < MAX_CATEGORY, `最多创建 ${MAX_CATEGORY} 个分类`, { max: MAX_CATEGORY })

    const dup = await this.db.collection('grouporder-goods-category')
      .where({ user_id: uid, name }).limit(1).get()
    if (dup.data && dup.data.length) throwBiz('DUPLICATE', '已存在同名分类')

    const res = await this.db.collection('grouporder-goods-category').add({
      user_id: uid,
      name,
      sort: total + 1,
      create_date: ctx.now
    })
    return ok({ category_id: res.id, name, sort: total + 1 })
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
        const dup = await this.db.collection('grouporder-goods-category')
          .where({ user_id: uid, name: n }).limit(1).get()
        if (dup.data && dup.data.length) throwBiz('DUPLICATE', '已存在同名分类')
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
   * 删除分类。
   * 【删除分类不删除商品】，其下商品的 category_id 置空，归入未分组（AC-GL-022）。
   */
  async categoryDelete (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const cat = await this._getOwnCategory(uid, params.category_id)

    // 先摘除引用再删分类：反过来会留下指向已删分类的悬空 category_id
    const res = await this.db.collection('grouporder-goods-lib')
      .where({ user_id: uid, category_id: cat._id })
      .update({ category_id: '', update_date: ctx.now })

    await this.db.collection('grouporder-goods-category').doc(cat._id).remove()
    return ok({ category_id: cat._id, affected: res.updated || 0 })
  },

  /**
   * 分类批量排序（M-30 拖拽）
   * 与 goodsSort 同一原则：整体重写为从 1 起的连续值，不留混合状态。
   */
  async categorySort (params = {}) {
    const ctx = this.ctx
    const uid = auth.requireLogin(ctx)
    const ids = params.category_ids
    assertParam(Array.isArray(ids) && ids.length > 0, '缺少排序后的分类顺序')

    const { data } = await this.db.collection('grouporder-goods-category')
      .where({ user_id: uid }).limit(MAX_CATEGORY).get()
    const currentIds = (data || []).map(c => c._id)
    assertParam(ids.length === currentIds.length,
      '排序必须提交全部分类', { expected: currentIds.length, received: ids.length })

    const set = new Set(currentIds)
    for (const id of ids) {
      assertParam(set.has(id), '排序列表包含不属于你的分类', { category_id: id })
      set.delete(id)
    }
    assertParam(set.size === 0, '排序列表存在重复分类')

    for (let i = 0; i < ids.length; i++) {
      await this.db.collection('grouporder-goods-category').doc(ids[i]).update({ sort: i + 1 })
    }
    return ok({ sorted: ids.length, asOf: ctx.now })
  }
}
