/**
 * 库存 / 限购相关工具
 */

/**
 * 数量上限 = min(库存, 单次限购)。
 * 约定：
 *   - 库存 0/缺省 视为「不限」（售罄另由购物车校验标失效，不在此阻断）；
 *   - 单次限购 0/缺省 视为「未设置」，默认上限为 1（即没配限购的商品每单最多 1 件）。
 * 前端仅作软限制，最终以下单时后端校验为准。
 */
export function purchaseCap(stock?: number, limitPerOrder?: number): number {
  const s = stock && stock > 0 ? stock : Infinity
  const l = limitPerOrder && limitPerOrder > 0 ? limitPerOrder : 1 // 未设置默认 1
  return Math.min(s, l)
}
