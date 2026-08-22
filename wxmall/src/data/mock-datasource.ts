/**
 * 本地 mock 数据源实现
 * 用内存数组模拟接口，带一点延时更接近真实请求。
 */
import type { IDataSource } from './datasource'
import type {
  Banner, Category, Product, PageQuery, PageResult,
  Order, OrderStatus, Address, MemberStats
} from '@/types'
import { banners, categories, products, orders, addresses, memberStats } from './mock'

function delay<T>(data: T, ms = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms))
}

export class MockDataSource implements IDataSource {
  getBanners(): Promise<Banner[]> {
    return delay(banners)
  }

  getCategories(): Promise<Category[]> {
    return delay([...categories].sort((a, b) => (a.sort || 0) - (b.sort || 0)))
  }

  getHotProducts(): Promise<Product[]> {
    return delay([...products].sort((a, b) => b.sold - a.sold).slice(0, 4))
  }

  getProducts(query: PageQuery = {}): Promise<PageResult<Product>> {
    const { page = 1, pageSize = 10, keyword, categoryId } = query
    let list = products
    if (categoryId) list = list.filter((p) => p.categoryId === categoryId)
    if (keyword) list = list.filter((p) => p.title.includes(keyword))
    const total = list.length
    const start = (page - 1) * pageSize
    return delay({ list: list.slice(start, start + pageSize), total, page, pageSize })
  }

  getProductDetail(id: number): Promise<Product | null> {
    return delay(products.find((p) => p.id === id) || null)
  }

  /* ============ 会员 / 订单 / 地址 ============ */
  getMemberStats(): Promise<MemberStats> {
    return delay({ ...memberStats })
  }

  getOrders(status?: OrderStatus | 'all'): Promise<Order[]> {
    const list = !status || status === 'all'
      ? orders
      : orders.filter((o) => o.status === status)
    return delay([...list])
  }

  getAddresses(): Promise<Address[]> {
    // 默认地址排在最前
    return delay([...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)))
  }

  saveAddress(addr: Omit<Address, 'id'> & { id?: number }): Promise<Address> {
    // 设为默认时，先清掉其它地址的默认标记
    const clearOthers = (exceptId: number) => {
      if (!addr.isDefault) return
      addresses.forEach((a) => {
        if (a.id !== exceptId) a.isDefault = false
      })
    }

    if (addr.id != null) {
      // 更新
      const idx = addresses.findIndex((a) => a.id === addr.id)
      if (idx === -1) return Promise.reject(new Error('地址不存在'))
      clearOthers(addr.id)
      addresses[idx] = { ...addresses[idx], ...addr, id: addr.id }
      return delay({ ...addresses[idx] })
    }

    // 新增：自增 id；首条地址强制为默认
    const id = addresses.length ? Math.max(...addresses.map((a) => a.id)) + 1 : 1
    const isDefault = addr.isDefault || addresses.length === 0
    const created: Address = { ...addr, id, isDefault }
    clearOthers(id)
    addresses.push(created)
    return delay({ ...created })
  }

  deleteAddress(id: number): Promise<void> {
    const idx = addresses.findIndex((a) => a.id === id)
    if (idx === -1) return Promise.reject(new Error('地址不存在'))
    const wasDefault = addresses[idx].isDefault
    addresses.splice(idx, 1)
    // 删掉的是默认地址且仍有其它地址：把第一条提升为默认
    if (wasDefault && addresses.length) addresses[0].isDefault = true
    return delay(undefined)
  }

  setDefaultAddress(id: number): Promise<void> {
    let hit = false
    addresses.forEach((a) => {
      a.isDefault = a.id === id
      if (a.id === id) hit = true
    })
    return hit ? delay(undefined) : Promise.reject(new Error('地址不存在'))
  }
}
