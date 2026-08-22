// common/timeUtils.js
const TimeUtils = {
  // =========================
  // 基础：当前时间 & 时间戳
  // =========================

  /** 当前时间戳（毫秒） */
  nowMs() {
    return Date.now();
  },

  /** 当前时间戳（秒） */
  nowS() {
    return Math.floor(Date.now() / 1000);
  },

  // =========================
  // 时间戳 ↔ Date
  // =========================

  /** 秒时间戳 -> Date */
  fromUnixS(unixS) {
    return new Date(unixS * 1000);
  },

  /** 毫秒时间戳 -> Date */
  fromUnixMs(unixMs) {
    return new Date(unixMs);
  },

  /** Date -> 秒时间戳 */
  toUnixS(date) {
    return Math.floor(date.getTime() / 1000);
  },

  /** Date -> 毫秒时间戳 */
  toUnixMs(date) {
    return date.getTime();
  },

  // =========================
  // UTC / Local（Date 本质存 UTC，但显示按本地）
  // =========================

  /** 获取本地当天 00:00:00 的毫秒时间戳 */
  startOfTodayLocalMs() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },

  /** 获取本地当天 00:00:00 的秒时间戳 */
  startOfTodayLocalS() {
    return Math.floor(this.startOfTodayLocalMs() / 1000);
  },

  // =========================
  // 是否今天/昨天/天数差（按本地自然日）
  // =========================

  /** 是否今天（按本地日期）unixS: 秒时间戳 */
  isToday(unixS) {
    const d = this.fromUnixS(unixS);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
  },

  /** 是否昨天（按本地日期）unixS: 秒时间戳 */
  isYesterday(unixS) {
    const d = this.fromUnixS(unixS);
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return d.getFullYear() === y.getFullYear() &&
      d.getMonth() === y.getMonth() &&
      d.getDate() === y.getDate();
  },

  /**
   * 距今过去多少天（按本地自然日）
   * 今天=0，昨天=1
   */
  daysPassed(unixS) {
    const target = this.fromUnixS(unixS);
    const targetStart = new Date(target);
    targetStart.setHours(0, 0, 0, 0);

    const todayStartMs = this.startOfTodayLocalMs();
    const diffMs = todayStartMs - targetStart.getTime();
    return Math.floor(diffMs / (24 * 3600 * 1000));
  },

  // =========================
  // token / 会话常用
  // =========================

  /** 生成过期时间（秒）: now + ttlSeconds */
  genExpireS(ttlSeconds) {
    return this.nowS() + ttlSeconds;
  },

  /** 是否过期（秒） */
  isExpired(expireUnixS) {
    return this.nowS() >= expireUnixS;
  },

  /** 剩余多少秒 */
  remainSeconds(expireUnixS) {
    return expireUnixS - this.nowS();
  },

  /** 是否需要续期：剩余 <= thresholdSeconds */
  needRenew(expireUnixS, thresholdSeconds) {
    return this.remainSeconds(expireUnixS) <= thresholdSeconds;
  },

  // =========================
  // 格式化（简单可用版）
  // =========================

  /** 补零 */
  pad2(n) {
    return String(n).padStart(2, '0');
  },

  /** 格式化为 YYYY-MM-DD HH:mm:ss（本地时间） */
  formatLocal(unixS) {
    const d = this.fromUnixS(unixS);
    const Y = d.getFullYear();
    const M = this.pad2(d.getMonth() + 1);
    const D = this.pad2(d.getDate());
    const h = this.pad2(d.getHours());
    const m = this.pad2(d.getMinutes());
    const s = this.pad2(d.getSeconds());
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  },
};

export default TimeUtils;