/**
 * 后台数据源实现
 * 调用 api 层拿真实数据；接口签名与 MockDataSource 完全一致，页面无感切换。
 */
import type { IDataSource } from './datasource'
import type {
  Banner, Category, Product, PageQuery, PageResult,
  Order, OrderStatus, Address, MemberStats, CreateOrderParams
} from '@/types'
import { api } from '@/api'

export class CloudDataSource implements IDataSource {
  getBanners(): Promise<Banner[]> {
    return api.getBanners()
  }

  getCategories(): Promise<Category[]> {
    return api.getCategories()
  }

  getHotProducts(): Promise<Product[]> {
    return api.getHotProducts()
  }

  getProducts(query: PageQuery = {}): Promise<PageResult<Product>> {
    return api.getProducts(query)
  }

  async getProductDetail(id: number): Promise<Product | null> {
    return (await api.getProductDetail(id)) || null
  }

  /* ============ 会员 / 订单 / 地址 ============ */
  getMemberStats(): Promise<MemberStats> {
    return api.getMemberStats()
  }

  getOrders(status?: OrderStatus | 'all'): Promise<Order[]> {
    return api.getOrders(status)
  }

  createOrder(params: CreateOrderParams): Promise<Order> {
    return api.createOrder(params)
  }

  getAddresses(): Promise<Address[]> {
    return api.getAddresses()
  }

  saveAddress(addr: Omit<Address, 'id'> & { id?: number }): Promise<Address> {
    return api.saveAddress(addr)
  }

  deleteAddress(id: number): Promise<void> {
    return api.deleteAddress(id)
  }

  setDefaultAddress(id: number): Promise<void> {
    return api.setDefaultAddress(id)
  }
}
