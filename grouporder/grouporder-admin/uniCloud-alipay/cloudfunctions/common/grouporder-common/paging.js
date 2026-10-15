/**
 * 列表方法的入参归一与出参包装（CLOUD_API §2.2）
 * 入参 { page, pageSize, filters, orderBy }，出参 { list, total, asOf }
 */
const { assertParam } = require('./errors')

const MAX_PAGE_SIZE = 100

/**
 * @param {object} params 原始入参
 * @param {object} opts { defaultOrderBy: { field, direction }, allowOrderFields: [] }
 */
function normalize (params, opts = {}) {
  const p = params || {}
  let page = parseInt(p.page, 10)
  let pageSize = parseInt(p.pageSize, 10)
  if (!Number.isInteger(page) || page < 1) page = 1
  if (!Number.isInteger(pageSize) || pageSize < 1) pageSize = 20
  // 服务端强制上限，不信任客户端
  if (pageSize > MAX_PAGE_SIZE) pageSize = MAX_PAGE_SIZE

  let orderBy = p.orderBy || opts.defaultOrderBy || null
  if (orderBy) {
    const field = String(orderBy.field || '')
    const direction = orderBy.direction === 'asc' ? 'asc' : 'desc'
    // 排序字段白名单：防止按敏感字段或无索引字段排序
    if (opts.allowOrderFields && opts.allowOrderFields.length) {
      assertParam(opts.allowOrderFields.includes(field), '不支持按该字段排序', { field })
    }
    orderBy = { field, direction }
  }

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    filters: p.filters && typeof p.filters === 'object' ? p.filters : {},
    orderBy
  }
}

/**
 * @param {Array} list
 * @param {number} total
 * @param {number} asOf 数据截至时间（服务端时间戳），统计类必须返回（OPS §12.2）
 */
function wrap (list, total, asOf) {
  return {
    list: list || [],
    total: typeof total === 'number' ? total : (list || []).length,
    asOf: asOf || Date.now()
  }
}

/** 单次读取条数：低于云数据库单次 get 上限 */
const READ_BATCH = 500

/**
 * 分批读完全部匹配记录：单次 get 有条数上限，名单、清单类读取不能只取第一批。
 * @param {Function} makeQuery 每次调用返回一个新的、已带 where / field / orderBy 的查询（需有稳定排序，否则分批可能重复或遗漏）
 * @returns {Promise<Array>}
 */
async function fetchAll (makeQuery, batch = READ_BATCH) {
  const out = []
  for (let skip = 0; ; skip += batch) {
    const { data } = await makeQuery().skip(skip).limit(batch).get()
    out.push(...(data || []))
    if (!data || data.length < batch) break
  }
  return out
}

/** 数组按 n 个一组切分：dbCmd.in 的 id 数量过多时分批查询 */
function chunk (arr, n = 100) {
  const out = []
  for (let i = 0; i < (arr || []).length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/**
 * 按 id 列表分批读完另一张表的记录（如按 order_id 读明细）
 * @param {Function} makeQuery (ids) => 查询，已带 where(field in ids) 与稳定排序
 */
async function fetchAllByIds (ids, makeQuery, size = 100) {
  const out = []
  for (const part of chunk([...new Set(ids || [])], size)) {
    out.push(...await fetchAll(() => makeQuery(part)))
  }
  return out
}

/** 聚合分组结果的显式上限：不依赖平台默认返回条数（可能只有 20） */
const AGG_LIMIT = 1000

module.exports = { normalize, wrap, MAX_PAGE_SIZE, READ_BATCH, fetchAll, chunk, fetchAllByIds, AGG_LIMIT }
