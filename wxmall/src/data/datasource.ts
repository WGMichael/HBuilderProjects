/**
 * 数据源接口（数据层的「协议」）
 * 页面永远只依赖这个接口，不关心数据来自 mock 还是后台。
 * mock 与 cloud 两种实现都遵守它 —— 这就是「data 层与后台通过协议同步」的落点。
 */
import type {
  Banner, Category, Product, PageQuery, PageResult,
  Order, OrderStatus, Address, UserInfo, MemberStats, CreateOrderParams
} from '@/types'

export interface IDataSource {
  /* 首页 / 商品 */
  getBanners(): Promise<Banner[]>
  getCategories(): Promise<Category[]>
  getHotProducts(): Promise<Product[]>
  getProducts(query?: PageQuery): Promise<PageResult<Product>>
  getProductDetail(id: number): Promise<Product | null>

  /* 订单（后续接入，先留接口） */
  createOrder?(params: CreateOrderParams): Promise<Order>
  /** 订单列表，status 省略或 'all' 表示全部 */
  getOrders?(status?: OrderStatus | 'all'): Promise<Order[]>

  /* 地址（收货地址管理） */
  getAddresses?(): Promise<Address[]>
  /** 新增或更新地址：带 id 视为更新，无 id 视为新增；返回保存后的地址 */
  saveAddress?(addr: Omit<Address, 'id'> & { id?: number }): Promise<Address>
  /** 删除地址 */
  deleteAddress?(id: number): Promise<void>
  /** 设为默认地址 */
  setDefaultAddress?(id: number): Promise<void>

  /* 用户 / 会员（后续接入） */
  getUserInfo?(): Promise<UserInfo>
  /** 会员统计（积分/优惠券/余额/收藏），供「我的」页展示 */
  getMemberStats?(): Promise<MemberStats>
}

