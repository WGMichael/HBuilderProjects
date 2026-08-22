'use strict';

/**
 * 进程内缓存（每个云对象实例各自一份）
 * 结构：key -> { value, expireAt }
 */
const STORE = globalThis.__MEM_CACHE__ || (globalThis.__MEM_CACHE__ = new Map());

function now() {
  return Date.now();
}

module.exports = {
  /**
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const hit = STORE.get(key);
    if (!hit) return null;

    if (hit.expireAt && hit.expireAt <= now()) {
      STORE.delete(key);
      return null;
    }
    return hit.value;
  },

  /**
   * @param {string} key
   * @param {any} value
   * @param {number} ttlSeconds
   */
  set(key, value, ttlSeconds = 600) {
    STORE.set(key, {
      value,
      expireAt: now() + ttlSeconds * 1000
    });
  },

  /**
   * @param {string} key
   */
  del(key) {
	  console.log("====STORE====" , STORE)
    STORE.delete(key);
  },

  /**
   * 可选：清理过期（不一定需要）
   */
  cleanupExpired() {
    const t = now();
    for (const [k, v] of STORE.entries()) {
      if (v.expireAt && v.expireAt <= t) STORE.delete(k);
    }
  }
};