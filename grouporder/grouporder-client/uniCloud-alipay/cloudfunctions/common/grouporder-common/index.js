/**
 * 群接龙业务公共模块（CLOUD_API §3）
 *
 * 硬约束①：云对象之间【不互相调用】，跨对象逻辑一律下沉到本模块。
 */

/**
 * 把云对象导出的方法挂到本次调用的 this 上。
 * 运行器调用方法时 this 是它新建的上下文对象（只带 getClientInfo 等内置方法），
 * 不是 module.exports，因此 this.xxx() 调不到同对象内的其他方法。
 * 须在 _before 第一行调用；已存在的属性不覆盖，避免盖掉运行器内置方法。
 */
function bindMethods (ctx, obj) {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'function' && !(key in ctx)) ctx[key] = obj[key]
  }
}

module.exports = {
  bindMethods,
  auth: require('./auth'),
  errors: require('./errors'),
  paging: require('./paging'),
  idempotent: require('./idempotent'),
  state: require('./state'),
  stock: require('./stock'),
  snapshot: require('./snapshot'),
  oplog: require('./oplog'),
  exportlog: require('./exportlog'),
  goodslib: require('./goodslib'),
  config: require('./config'),
  contentcheck: require('./contentcheck'),
  restriction: require('./restriction'),
  review: require('./review')
}
