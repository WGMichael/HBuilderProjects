/**
 * 购物车状态（Vue3 reactive 全局单例）
 * 页面直接引用 cartStore.items / cartStore.add(...) 即可，自动响应式更新。
 * 本地持久化到 storage，后续可在 add/remove 时同步到后台。
 */
import { reactive, computed } from 'vue'
import { config } from '@/config'
import { purchaseCap } from '@/utils/stock'
import type { CartItem, Product, Sku } from '@/types'

interface CartState {
  items: CartItem[]
}

const state = reactive<CartState>({
  items: uni.getStorageSync(config.storageKeys.cart) || []
})

function persist() {
  uni.setStorageSync(config.storageKeys.cart, state.items)
}

export const cartStore = {
  state,

  /** 加入购物车（同一「商品+规格」累加数量，不超过 min(库存, 单次限购)） */
  add(product: Product, sku: Sku, qty = 1) {
    const cap = purchaseCap(sku.stock, sku.limitPerOrder)
    // 购物车行的唯一性 = productId + skuId：避免不同商品因 skuId 相同（含兜底 0）被误并
    const exist = state.items.find((i) => i.productId === product.id && i.skuId === sku.id)
    if (exist) {
      exist.qty = Math.min(exist.qty + qty, cap)
      exist.stock = sku.stock // 刷新库存 / 限购快照
      exist.limitPerOrder = sku.limitPerOrder
    } else {
      state.items.push({
        productId: product.id,
        skuId: sku.id,
        title: product.title,
        cover: product.cover,
        specName: sku.name,
        price: sku.price,
        qty: Math.min(qty, cap),
        checked: true,
        stock: sku.stock,
        limitPerOrder: sku.limitPerOrder
      })
    }
    persist()
    // TODO: config.USE_MOCK=false 时同步到后台 cart 接口
  },

  updateQty(productId: number, skuId: number, qty: number) {
    const it = state.items.find((i) => i.productId === productId && i.skuId === skuId)
    if (!it) return
    // 集中夹在 [1, min(库存, 单次限购)] 内，页面调用无需重复校验
    const cap = purchaseCap(it.stock, it.limitPerOrder)
    it.qty = Math.min(Math.max(1, Math.floor(qty)), cap)
    persist()
  },

  remove(productId: number, skuId: number) {
    const idx = state.items.findIndex((i) => i.productId === productId && i.skuId === skuId)
    if (idx > -1) {
      state.items.splice(idx, 1)
      persist()
    }
  },

  toggle(productId: number, skuId: number) {
    const it = state.items.find((i) => i.productId === productId && i.skuId === skuId)
    if (it) {
      it.checked = !it.checked
      persist()
    }
  },

  clear() {
    state.items = []
    persist()
  },

  /** 全选 / 反选：一次性设置所有项的选中态（替代页面里循环调 toggle） */
  setAllChecked(checked: boolean) {
    state.items.forEach((i) => {
      i.checked = checked
    })
    persist()
  },

  /** 删除所有已选中的商品 */
  removeChecked() {
    state.items = state.items.filter((i) => !i.checked)
    persist()
  },

  /** 按「productId_skuId」组合键批量删除（用于清空失效商品等场景） */
  removeByKeys(keys: string[]) {
    const set = new Set(keys)
    state.items = state.items.filter((i) => !set.has(`${i.productId}_${i.skuId}`))
    persist()
  },

  /**
   * 批量刷新库存快照，并把超过库存的数量夹回。
   * 进购物车校验(validateCart)时调用：覆盖旧数据无 stock、以及后台库存变动的情况。
   */
  syncStocks(updates: { productId: number; skuId: number; stock?: number; limitPerOrder?: number }[]) {
    let changed = false
    updates.forEach((u) => {
      const it = state.items.find((i) => i.productId === u.productId && i.skuId === u.skuId)
      if (!it) return
      if (it.stock !== u.stock) {
        it.stock = u.stock
        changed = true
      }
      if (it.limitPerOrder !== u.limitPerOrder) {
        it.limitPerOrder = u.limitPerOrder
        changed = true
      }
      const cap = purchaseCap(u.stock, u.limitPerOrder)
      if (it.qty > cap) {
        it.qty = cap // 库存/限购降到低于当前数量时，静默夹回（前端为软限制，最终以下单为准）
        changed = true
      }
    })
    if (changed) persist()
  },

  /** 选中商品总数 */
  totalCount: computed(() =>
    state.items.reduce((s, i) => s + (i.checked ? i.qty : 0), 0)
  ),

  /** 选中商品总价 */
  totalPrice: computed(() =>
    state.items.reduce((s, i) => s + (i.checked ? i.qty * i.price : 0), 0)
  ),

  /** 角标：购物车全部件数 */
  badge: computed(() => state.items.reduce((s, i) => s + i.qty, 0))
}
