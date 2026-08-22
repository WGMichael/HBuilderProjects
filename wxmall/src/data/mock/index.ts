/**
 * 本地 mock 数据（开发/演示用）
 * 字段结构与 types 完全一致，后台建表可直接对齐。
 */
import type { Banner, Category, Product, Order, Address, MemberStats } from '@/types'

export const banners: Banner[] = [
  { id: 1, title: '山货直供 · 顺丰包邮', sub: '老家现摘现做，一件也发货' },
  { id: 2, title: '新到土蜂蜜', sub: '深山一年一割，天然无添加' }
]

export const categories: Category[] = [
  { id: 1, name: '水果', icon: '🍎', sort: 1 },
  { id: 2, name: '坚果', icon: '🌰', sort: 2 },
  { id: 3, name: '零食', icon: '🍬', sort: 3 },
  { id: 4, name: '礼盒', icon: '🎁', sort: 4 },
  { id: 5, name: '蜂蜜', icon: '🍯', sort: 5 }
]

export const products: Product[] = [
  {
    id: 101,
    title: '若羌灰枣 500g 新疆自然晾晒',
    subtitle: '甜度高 · 无添加',
    categoryId: 1,
    cover: '🌰',
    images: ['🫐', '🌰', '🏜️'],
    price: 39,
    oldPrice: 59,
    sold: 532,
    stock: 999,
    rating: 5,
    tags: ['顺丰包邮', '7天退换'],
    desc: '新疆若羌自然晾晒，颗粒饱满，甜度高，无添加。',
    detailImages: ['📷 商品实拍详情图', '📷 产地 / 包装图'],
    skus: [
      { id: 1011, name: '500g', price: 39, oldPrice: 59, stock: 500, limitPerOrder: 10 },
      { id: 1012, name: '1000g', price: 72, oldPrice: 108, stock: 300, limitPerOrder: 6 },
      { id: 1013, name: '礼盒装', price: 128, oldPrice: 168, stock: 100, limitPerOrder: 2 }
    ]
  },
  {
    id: 102,
    title: '纸皮核桃 500g 薄皮易剥',
    subtitle: '当年新货',
    categoryId: 2,
    cover: '🥜',
    images: ['🥜', '🌰'],
    price: 59,
    sold: 210,
    stock: 800,
    rating: 5,
    tags: ['顺丰包邮'],
    desc: '薄皮易剥，仁大饱满，当年新货。',
    detailImages: ['📷 商品实拍详情图'],
    skus: [
      { id: 1021, name: '500g', price: 59, stock: 400, limitPerOrder: 10 },
      { id: 1022, name: '1000g', price: 108, stock: 400, limitPerOrder: 6 }
    ]
  },
  {
    id: 103,
    title: '吐鲁番葡萄干 300g 无核',
    subtitle: '颗颗爆汁',
    categoryId: 3,
    cover: '🍇',
    images: ['🍇', '🏜️'],
    price: 29,
    oldPrice: 39,
    sold: 156,
    stock: 600,
    rating: 5,
    tags: ['无核', '包邮'],
    desc: '吐鲁番无核葡萄干，自然晾晒，颗颗饱满。',
    detailImages: ['📷 商品实拍详情图'],
    skus: [
      { id: 1031, name: '300g', price: 29, oldPrice: 39, stock: 300, limitPerOrder: 10 },
      { id: 1032, name: '600g', price: 55, oldPrice: 79, stock: 300, limitPerOrder: 6 }
    ]
  },
  {
    id: 104,
    title: '农家土蜂蜜 500g 现摘现装',
    subtitle: '深山一年一割',
    categoryId: 5,
    cover: '🍯',
    images: ['🍯', '🐝', '🏞️'],
    price: 88,
    sold: 97,
    stock: 200,
    rating: 5,
    tags: ['顺丰包邮', '7天退换'],
    desc: '深山养蜂场，一年一割，未经加工浓缩。冲水温不超过 40℃，风味更佳。',
    detailImages: ['📷 商品实拍详情图', '📷 产地 / 包装图'],
    skus: [
      { id: 1041, name: '500g 瓶装', price: 88, oldPrice: 108, stock: 120, limitPerOrder: 5 },
      { id: 1042, name: '1kg 礼盒装', price: 158, oldPrice: 198, stock: 80, limitPerOrder: 3 }
    ]
  }
]

/* ============ 会员统计（「我的」页四宫格） ============ */
export const memberStats: MemberStats = {
  points: 320,
  couponCount: 2,
  balance: 0,
  favoriteCount: 8
}

/* ============ 收货地址 ============ */
export const addresses: Address[] = [
  {
    id: 1,
    name: '张女士',
    phone: '138****6688',
    region: '新疆维吾尔自治区 巴音郭楞蒙古自治州 若羌县',
    detail: '楼兰路 88 号阳光小区 3 栋 2 单元 601',
    isDefault: true
  },
  {
    id: 2,
    name: '李先生',
    phone: '139****2233',
    region: '广东省 深圳市 南山区',
    detail: '科技园科苑路 15 号软件大厦 A 座 1203',
    isDefault: false
  }
]

/* ============ 订单（演示：覆盖各状态） ============ */
export const orders: Order[] = [
  {
    id: '20260701001',
    status: 'unshipped',
    goods: [
      { productId: 101, skuId: 1012, title: '若羌灰枣 500g 新疆自然晾晒', cover: '🌰', specName: '1000g', price: 72, qty: 1 }
    ],
    goodsAmount: 72,
    freight: 0,
    discount: 0,
    payAmount: 72,
    address: addresses[0],
    createdAt: '2026-07-01 10:24'
  },
  {
    id: '20260628007',
    status: 'done',
    goods: [
      { productId: 104, skuId: 1042, title: '农家土蜂蜜 500g 现摘现装', cover: '🍯', specName: '1kg 礼盒装', price: 158, qty: 1 },
      { productId: 103, skuId: 1031, title: '吐鲁番葡萄干 300g 无核', cover: '🍇', specName: '300g', price: 29, qty: 2 }
    ],
    goodsAmount: 216,
    freight: 0,
    discount: 10,
    payAmount: 206,
    address: addresses[0],
    expressCompany: '顺丰速运',
    expressNo: 'SF1234567890',
    createdAt: '2026-06-28 19:07'
  },
  {
    id: '20260705012',
    status: 'unpaid',
    goods: [
      { productId: 102, skuId: 1021, title: '纸皮核桃 500g 薄皮易剥', cover: '🥜', specName: '500g', price: 59, qty: 1 }
    ],
    goodsAmount: 59,
    freight: 8,
    discount: 0,
    payAmount: 67,
    createdAt: '2026-07-05 08:41'
  },
  {
    id: '20260620003',
    status: 'shipped',
    goods: [
      { productId: 101, skuId: 1013, title: '若羌灰枣 500g 新疆自然晾晒', cover: '🌰', specName: '礼盒装', price: 128, qty: 1 }
    ],
    goodsAmount: 128,
    freight: 0,
    discount: 0,
    payAmount: 128,
    address: addresses[1],
    expressCompany: '中通快递',
    expressNo: 'ZTO9988776655',
    createdAt: '2026-06-20 14:12'
  }
]
