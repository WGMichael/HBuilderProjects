/**
 * 后台接口定义（真实数据用）
 * - backend='http' 时：走 utils/request（uni.request）
 * - backend='cloud' 时：走 uniCloud.callFunction / clientDB
 * cloud-datasource 会调用这里的方法。先给出 HTTP 版实现 + uniCloud 示例注释。
 */
import { config } from '@/config'
import { request } from '@/utils/request'
import type {
  Banner, Category, Product, PageQuery, PageResult,
  Order, OrderStatus, Address, MemberStats, CreateOrderParams
} from '@/types'

/* ---------- HTTP 版实现 ---------- */
const httpApi = {
  getBanners: () => request.get<Banner[]>('/banner/list'),
  getCategories: () => request.get<Category[]>('/category/list'),
  getHotProducts: () => request.get<Product[]>('/product/hot'),
  getProducts: (q: PageQuery) => request.get<PageResult<Product>>('/product/list', q),
  getProductDetail: (id: number) => request.get<Product>('/product/detail', { id }),
  // 会员 / 订单 / 地址（后台就绪后对齐接口路径）
  getMemberStats: () => request.get<MemberStats>('/member/stats'),
  getOrders: (status?: OrderStatus | 'all') => request.get<Order[]>('/order/list', { status }),
  getAddresses: () => request.get<Address[]>('/address/list'),
  saveAddress: (addr: Omit<Address, 'id'> & { id?: number }) => request.post<Address>('/address/save', addr),
  deleteAddress: (id: number) => request.post<void>('/address/delete', { id }),
  setDefaultAddress: (id: number) => request.post<void>('/address/set-default', { id }),
  createOrder: (params: CreateOrderParams) => request.post<Order>('/order/create', params)
}

/* ---------- uniCloud 云对象版实现 ----------
 * 服务端为云对象 shop，定义在 uniCloud-aliyun/cloudfunctions/shop/index.obj.js。
 * 用 uniCloud.importObject 拿到云对象后，直接调用其方法即拿到业务数据（框架已解包 result）。
 * 方法签名与 MockDataSource 完全一致，页面无感切换。
 */
// 懒加载云对象：仅在 backend='cloud' 真正调用时才 importObject，
// 避免 mock 阶段或非云环境下过早触发 uniCloud 初始化报错。
let _shop: any = null
function shop(): any {
  if (!_shop) {
    // customUI:true 关闭云对象自带的 loading/错误弹窗，交由前端统一处理
    _shop = uniCloud.importObject('shop', { customUI: true })
  }
  return _shop
}

const cloudApi = {
  getBanners: (): Promise<Banner[]> => shop().banners(),
  getCategories: (): Promise<Category[]> => shop().categories(),
  getHotProducts: (): Promise<Product[]> => shop().hotProducts(),
  getProducts: (q: PageQuery): Promise<PageResult<Product>> => shop().products(q),
  getProductDetail: (id: number): Promise<Product> => shop().productDetail({ id }),
  // TODO: 云对象 shop 需实现 memberStats / orders / addresses 三个 action
  getMemberStats: (): Promise<MemberStats> => shop().memberStats(),
  getOrders: (status?: OrderStatus | 'all'): Promise<Order[]> => shop().orders({ status }),
  getAddresses: (): Promise<Address[]> => shop().addresses(),
  saveAddress: (addr: Omit<Address, 'id'> & { id?: number }): Promise<Address> => shop().saveAddress(addr),
  deleteAddress: (id: number): Promise<void> => shop().deleteAddress({ id }),
  setDefaultAddress: (id: number): Promise<void> => shop().setDefaultAddress({ id }),
  createOrder: (params: CreateOrderParams): Promise<Order> => shop().createOrder(params)
}

/** 按配置选择后端实现 */
export const api = config.backend === 'cloud' ? cloudApi : httpApi
