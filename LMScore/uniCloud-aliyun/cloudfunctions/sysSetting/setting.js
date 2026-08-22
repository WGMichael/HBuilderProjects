// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129
// cloudobjects/common/configCache.js
const db = uniCloud.database()

let cache = {
  data: null,        // { key: value }
  expireAt: 0
}
let inFlight = null

const TTL_MS = 3600 * 1000 // 60秒，可改

async function loadAllFromDB() {
  const res = await db.collection('lm-syssetting').get()
  const map = {}
  if(res.data.length > 0){
	  const mdata = res.data[0];
	  for (const key of Object.keys(mdata)) {
		map[key] = mdata[key]
	  }
  }
  
  return map
}

async function ensureLoaded(force = false) {
  const now = Date.now()
 
  if (!force && cache.data && cache.expireAt > now) {
    return cache.data
  }

  if (!force && inFlight) return inFlight

  inFlight = (async () => {
    const data = await loadAllFromDB()
    cache.data = data
    cache.expireAt = Date.now() + TTL_MS
    return data
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

function getSync(key, defaultValue = null) {
  if (!cache.data) return defaultValue
  return (key in cache.data) ? cache.data[key] : defaultValue
}

function clear() {
  cache.data = null
  cache.expireAt = 0
}

module.exports = {
  ensureLoaded,
  getSync,
  clear,
  loadAllFromDB
}