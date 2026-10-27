/**
 * 图片访问地址统一刷新（D-119）
 *
 * 库里图片字段存的是 file 对象 { fileID, url, ... }，其中 url 是上传时 getTempFileURL 换来的【临时地址】
 * （支付宝云带 expire_at / er_sign，约 10 分钟过期）。现在能打开只是因为云存储为公开读、签名未生效；
 * 一旦改为私有读或平台开始校验签名，所有已存图片都会打不开。
 *
 * 因此以 fileID 为准：云对象出参经 _after 调用 refresh(result)，自动找出结果里所有带 fileID 的 file 对象，
 * 批量换成新的访问地址并覆盖 url。所有返回图片的接口（含以后新增的）都被覆盖，无需逐个改。
 * 写库时 url 照存（前端回传的新地址），判断「是否换图」一律按 fileID（common/files.fileIdsOf），不受影响。
 *
 * 实例内缓存 5 分钟（临时地址约 10 分钟有效），同一云函数实例的连续请求不重复换取。
 * 刷新是附加动作：任何失败只记日志，原样返回，不影响主流程。
 */
const CACHE = new Map() // fileID -> { url, exp }
const CACHE_TTL = 5 * 60 * 1000
const CACHE_MAX = 5000
const BATCH = 50
const MAX_DEPTH = 10

/** 递归收集 file 对象：有字符串 fileID（cloud:// 开头）且有 url 键的对象 */
function collect (node, out, depth) {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
  if (Array.isArray(node)) {
    for (const it of node) collect(it, out, depth + 1)
    return
  }
  if (typeof node.fileID === 'string' && node.fileID.indexOf('cloud://') === 0 && 'url' in node) out.push(node)
  for (const k of Object.keys(node)) {
    const v = node[k]
    if (v && typeof v === 'object') collect(v, out, depth + 1)
  }
}

/** 批量换取访问地址，返回 Map(fileID → url)；取不到的不放进结果 */
async function fetchUrls (ids, now) {
  const map = new Map()
  const need = []
  for (const id of ids) {
    const c = CACHE.get(id)
    if (c && c.exp > now) map.set(id, c.url)
    else need.push(id)
  }
  for (let i = 0; i < need.length; i += BATCH) {
    const part = need.slice(i, i + BATCH)
    const res = await uniCloud.getTempFileURL({ fileList: part })
    for (const f of (res && res.fileList) || []) {
      const ok = f && f.tempFileURL && (!f.code || f.code === 'SUCCESS')
      if (!ok) continue
      map.set(f.fileID, f.tempFileURL)
      CACHE.set(f.fileID, { url: f.tempFileURL, exp: now + CACHE_TTL })
    }
  }
  if (CACHE.size > CACHE_MAX) CACHE.clear()
  return map
}

/**
 * 刷新云对象出参里的图片地址（就地修改并返回 result）。
 * result 为 { errCode, data } 结构；errCode 非 0 或没有 data 时原样返回
 */
async function refresh (result) {
  try {
    if (!result || result.errCode || !result.data) return result
    const objs = []
    collect(result.data, objs, 0)
    if (!objs.length) return result
    const map = await fetchUrls([...new Set(objs.map(o => o.fileID))], Date.now())
    for (const o of objs) {
      const url = map.get(o.fileID)
      if (url) o.url = url
    }
  } catch (e) {
    console.error('[fileurl] 刷新图片地址失败，返回原地址：', e)
  }
  return result
}

module.exports = { refresh }
