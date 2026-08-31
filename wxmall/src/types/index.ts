/**
 * 领域模型 + 前后端统一数据协议
 * 这些类型是「数据层」与「页面」「后台」三方共同遵守的契约。
 * 后台数据库表结构应尽量与此对齐，方便协议化同步。
 */

/* ============ 统一响应协议 ============ */
export interface ApiResult<T = unknown> {
  /** 0 = 成功，非 0 = 业务错误码 */
  code: number
  message: string
  data: T
}

/** 分页查询入参 */
export interface PageQuery {
  page?: number
  pageSize?: number
  keyword?: string
  categoryId?: number
}

/** 分页结果 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/* ============ 商品域 ============ */
export interface Category {
  id: number
  name: string
  icon?: string
  sort?: number
}

/** 商品规格（SKU） */
export interface Sku {
  id: number
  name: string
  price: number
  /** 该规格划线价（原价）；缺省时详情页回退到商品级 oldPrice */
  oldPrice?: number
  stock: number
  /** 单次限购：一次下单该规格最多可购数量；0/缺省=不限 */
  limitPerOrder?: number
}

export interface Product {
  id: number
  title: string
  subtitle?: string
  /** 主分类（= categoryIds[0]，保留以兼容单分类逻辑） */
  categoryId: number
  /** 所属分类（多选），元素为分类 id */
  categoryIds?: number[]
  /** 发货地（省份），缺省广东省 */
  shipFrom?: string
  cover: string
  images: string[]
  rating?: number
  tags: string[]
  /** 商品特色（简短描述数组） */
  features?: string[]
  desc: string
  detailImages: string[]
  skus: Sku[]
  /** 是否新品 */
  isNew?: boolean
  /** 是否热卖 */
  isHot?: boolean
  /** 热度值（前端可按此降序排序） */
  heat?: number
}

export interface Banner {
  id: number
  title: string
  sub?: string
  image?: string
  link?: string
}

/* ============ 购物车 / 订单域 ============ */
export interface CartItem {
  productId: number
  skuId: number
  title: string
  cover: string
  specName: string
  price: number
  qty: number
  checked: boolean
  /** 加购时记录的库存上限；用于购物车限购。旧数据可能缺省（视为不限） */
  stock?: number
  /** 加购时记录的单次限购；0/缺省=不限 */
  limitPerOrder?: number
}

export interface Address {
  id: number
  name: string
  phone: string
  region: string
  detail: string
  isDefault: boolean
}

export type OrderStatus = 'unpaid' | 'unshipped' | 'shipped' | 'done' | 'refund'

export interface OrderGoods {
  productId: number
  skuId: number
  title: string
  cover: string
  specName: string
  price: number
  qty: number
}

/** 结算清单（购物车结算 / 立即购买 → 确认订单页，经 storage 传递） */
export interface CheckoutPayload {
  /** 来源：cart=购物车结算（下单后清购物车对应项）；buynow=立即购买（不经购物车） */
  from: 'cart' | 'buynow'
  goods: OrderGoods[]
}

/** 下单入参：只传商品与数量、地址 id；价格 / 库存 / 限购由服务端核算，不信前端 */
export interface CreateOrderParams {
  goods: { productId: number; skuId: number; qty: number }[]
  addressId: number
}

export interface Order {
  id: string
  status: OrderStatus
  goods: OrderGoods[]
  goodsAmount: number
  freight: number
  discount: number
  payAmount: number
  address?: Address
  expressCompany?: string
  expressNo?: string
  createdAt: string
}

/* ============ 用户域 ============ */
export interface UserInfo {
  openid?: string
  nickname: string
  avatar: string
  phone?: string
  points: number
  level: string
  /** 优惠券张数 */
  couponCount?: number
  /** 账户余额 */
  balance?: number
  /** 收藏商品数 */
  favoriteCount?: number
}

/** 会员统计（「我的」页顶部四宫格） */
export interface MemberStats {
  /** 积分 */
  points: number
  /** 优惠券张数 */
  couponCount: number
  /** 账户余额 */
  balance: number
  /** 收藏商品数 */
  favoriteCount: number
}
