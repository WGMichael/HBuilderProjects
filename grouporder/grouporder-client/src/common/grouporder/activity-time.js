/**
 * 活动起止时间点的前端处理：页面开着时，到点按服务端时间更新显示，不轮询
 *
 * - 时间一律按服务端算：用接口返回的 asOf 求出「服务端 − 本机」时差，本机时间不准也不影响；
 * - 只为【最近的下一个】起止时间点设一个定时器，到点处理完再找下一个；页面隐藏时取消；
 * - 列表页到点只在本地重算状态标签（不发请求）；详情 / 管理页到点刷新一次（可下单状态等需要服务端确认）。
 * 口径与服务端一致：common/lifecycle（到期即已截止）、state.isNotStarted（进行中但未到起始时间）。
 */

const ACTIVITY = { REVIEWING: 1, ONGOING: 2, CLOSED: 3 };
// setTimeout 上限约 24.8 天，更远的时间点等下次进入页面再算
const MAX_DELAY = 2147483647;

/** 服务端 − 本机 的时差（毫秒） */
export function serverOffset(asOf) {
  return asOf ? asOf - Date.now() : 0;
}

/** 按服务端时间就地重算显示状态：到期显示为已截止，未到起始时间标「未开始」 */
export function applyLiveStatus(a, now) {
  if (!a) return a;
  if ((a.status === ACTIVITY.REVIEWING || a.status === ACTIVITY.ONGOING) && a.end_time && now >= a.end_time) {
    a.status = ACTIVITY.CLOSED;
    a.not_started = false;
  } else {
    a.not_started = a.status === ACTIVITY.ONGOING && !!a.start_time && now < a.start_time;
  }
  return a;
}

/** 列表里最近的下一个会改变显示的时间点；没有则返回 0 */
export function nextBoundary(list, now) {
  let next = 0;
  const consider = (t) => { if (t && t > now && (!next || t < next)) next = t; };
  for (const a of list || []) {
    if (a.status === ACTIVITY.ONGOING && a.start_time) consider(a.start_time);
    if (a.status === ACTIVITY.REVIEWING || a.status === ACTIVITY.ONGOING) consider(a.end_time);
  }
  return next;
}

/**
 * 到最近的时间点时回调一次（多给 1 秒，避开服务端判定的临界点）。
 * @returns {Function} 取消函数
 */
export function scheduleBoundary(list, offset, onTick) {
  const now = Date.now() + (offset || 0);
  const t = nextBoundary(list, now);
  if (!t) return () => {};
  const h = setTimeout(onTick, Math.min(t - now + 1000, MAX_DELAY));
  return () => clearTimeout(h);
}
