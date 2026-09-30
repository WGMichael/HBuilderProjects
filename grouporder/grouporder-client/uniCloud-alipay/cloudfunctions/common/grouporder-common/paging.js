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

module.exports = { normalize, wrap, MAX_PAGE_SIZE }
