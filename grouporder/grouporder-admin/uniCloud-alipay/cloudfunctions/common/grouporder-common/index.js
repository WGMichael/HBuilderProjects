/**
 * 群接龙业务公共模块（CLOUD_API §3）
 *
 * 硬约束①：云对象之间【不互相调用】，跨对象逻辑一律下沉到本模块。
 */
module.exports = {
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
