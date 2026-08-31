'use strict';
/**
 * 商城云对象 shop
 * 小程序端调用链:页面 -> db(数据层) -> CloudDataSource -> api(uniCloud.importObject('shop')) -> 本文件
 * 只提供「读」接口(商品/分类/轮播);商品的增删改由 uni-admin 后台按 schema 权限直接操作 DB。
 *
 * 返回约定:方法直接 return 业务数据(数组/对象/null),前端 await 即拿到结果;
 *          出错则 throw,前端 catch 到 rejection。字段与 src/types/index.ts 对齐。
 *
 * 图片:后台存的是云存储 fileID(cloud://,永久有效)。下发前用 resolveImages 批量转成
 *      可访问的 https 临时地址,前端拿到的仍是 https(契约不变)。
 *
 * 鉴权:地址等用户私有数据用 uni-id 校验 token 得到 uid,按 uid 隔离(仅操作本人数据)。
 */
const uniID = require('uni-id-common');
const db = uniCloud.database();

// 取当前登录用户 uid;未登录或 token 无效则抛错(前端 catch 到 rejection)。
// 用模块级函数而非云对象的 _xxx 私有方法:后者会被 uniCloud 从实例上剔除,this 调不到。
// 入参 that 为云对象上下文(this),用于读取 token / clientInfo。
async function getUid(that) {
  const token = that.getUniIdToken();
  if (!token) throw new Error('未登录');
  const uniIdIns = uniID.createInstance({ clientInfo: that.getClientInfo() });
  const res = await uniIdIns.checkToken(token);
  if (res.errCode) throw new Error(res.errMsg || '登录状态无效');
  return res.uid;
}

// 单次限购兜底：与前端一致，缺省/≤0 视为默认 1
function capLimit(limitPerOrder) {
  const l = Number(limitPerOrder);
  return l && l > 0 ? l : 1;
}

// 生成订单号：yyyyMMddHHmmss + 4 位随机
function genOrderId() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${stamp}${Math.floor(1000 + Math.random() * 9000)}`;
}

// 剔除仅供后台/云端使用、不应下发给前端的内部字段
function stripInternal(doc) {
  if (!doc) return doc;
  const { _id, onSale, createTime, ...rest } = doc;
  return rest;
}

// 地址文档 -> 前端 Address(只下发契约字段,隐藏 _id/uid/createTime)
function toAddress(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    name: doc.name,
    phone: doc.phone,
    region: doc.region || '',
    detail: doc.detail || '',
    isDefault: !!doc.isDefault
  };
}

// 时间戳(ms) -> 'YYYY-MM-DD HH:mm'(契约里 createdAt 为字符串)
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 订单文档 -> 前端 Order(隐藏 _id/uid/remark,时间戳转字符串)
function toOrder(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    status: doc.status,
    goods: doc.goods || [],
    goodsAmount: doc.goodsAmount || 0,
    freight: doc.freight || 0,
    discount: doc.discount || 0,
    payAmount: doc.payAmount || 0,
    address: doc.address,
    expressCompany: doc.expressCompany,
    expressNo: doc.expressNo,
    createdAt: formatTime(doc.createdAt)
  };
}

// 批量把订单 goods[].cover 里的 cloud:// fileID 换成 https(就地替换)
async function resolveOrderCovers(orders) {
  const ids = new Set();
  orders.forEach((o) => {
    (o.goods || []).forEach((g) => {
      if (g && typeof g.cover === 'string' && g.cover.indexOf('cloud://') === 0) ids.add(g.cover);
    });
  });
  if (!ids.size) return orders;
  const res = await uniCloud.getTempFileURL({ fileList: [...ids] });
  const map = {};
  res.fileList.forEach((f) => {
    map[f.fileID] = f.tempFileURL;
  });
  orders.forEach((o) => {
    (o.goods || []).forEach((g) => {
      if (g && map[g.cover]) g.cover = map[g.cover];
    });
  });
  return orders;
}

// 把文档中图片字段的 cloud:// fileID 批量转成 https 地址(就地替换后返回 docs)
async function resolveImages(docs) {
  const list = Array.isArray(docs) ? docs : [docs];
  const ids = new Set();
  const collect = (v) => {
    if (typeof v === 'string' && v.indexOf('cloud://') === 0) ids.add(v);
  };
  list.forEach((d) => {
    if (!d) return;
    collect(d.cover);
    collect(d.image);
    collect(d.icon);
    (d.images || []).forEach(collect);
    (d.detailImages || []).forEach(collect);
  });
  if (!ids.size) return docs;
  const res = await uniCloud.getTempFileURL({ fileList: [...ids] });
  const map = {};
  res.fileList.forEach((f) => {
    map[f.fileID] = f.tempFileURL;
  });
  const conv = (v) => map[v] || v;
  list.forEach((d) => {
    if (!d) return;
    if (d.cover) d.cover = conv(d.cover);
    if (d.image) d.image = conv(d.image);
    if (d.icon) d.icon = conv(d.icon);
    if (d.images) d.images = d.images.map(conv);
    if (d.detailImages) d.detailImages = d.detailImages.map(conv);
  });
  return docs;
}

module.exports = {
  /**
   * 首页轮播图(仅启用的,按 sort 升序)
   * @returns {Promise<Array>} Banner[]
   */
  async banners() {
    const { data } = await db.collection('tc-banners')
      .where({ enable: true })
      .orderBy('sort', 'asc')
      .field({ _id: false, id: true, title: true, sub: true, image: true, link: true })
      .get();
    return await resolveImages(data);
  },

  /**
   * 商品分类(按 sort 升序)
   * @returns {Promise<Array>} Category[]
   */
  async categories() {
    const { data } = await db.collection('tc-categories')
      .orderBy('sort', 'asc')
      .field({ _id: false, id: true, name: true, icon: true, sort: true })
      .get();
    return await resolveImages(data);
  },

  /**
   * 热卖商品(isHot 标记且上架,按销量降序取前 6)
   * @returns {Promise<Array>} Product[]
   */
  async hotProducts() {
    const { data } = await db.collection('tc-products')
      .where({ onSale: true, isHot: true })
      .orderBy('heat', 'desc')
      .limit(6)
      .get();
    return await resolveImages(data.map(stripInternal));
  },

  /**
   * 新品(isNew 标记且上架,按创建时间降序取前 6)
   * @returns {Promise<Array>} Product[]
   */
  async newProducts() {
    const { data } = await db.collection('tc-products')
      .where({ onSale: true, isNew: true })
      .orderBy('createTime', 'desc')
      .limit(6)
      .get();
    return await resolveImages(data.map(stripInternal));
  },

  /**
   * 商品分页列表(仅上架中)
   * @param {Object} query { page, pageSize, keyword, categoryId }
   * @returns {Promise<Object>} PageResult<Product> { list, total, page, pageSize }
   */
  async products(query = {}) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 10;
    const where = { onSale: true };
    // 按分类筛选：匹配 categoryIds 数组「包含」该分类（商品可属于多个分类）
    if (query.categoryId) where.categoryIds = Number(query.categoryId);
    if (query.keyword) {
      where.title = new db.RegExp({ regexp: String(query.keyword), options: 'i' });
    }

    const coll = db.collection('tc-products').where(where);
    const countRes = await coll.count();
    const { data } = await coll
      .orderBy('heat', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    return {
      list: await resolveImages(data.map(stripInternal)),
      total: countRes.total,
      page,
      pageSize
    };
  },

  /**
   * 商品详情(按业务数字 id 查)
   * @param {Object} params { id }
   * @returns {Promise<Object|null>} Product | null
   */
  async productDetail(params = {}) {
    const id = Number(params.id);
    if (!id) return null;
    const { data } = await db.collection('tc-products')
      .where({ id })
      .limit(1)
      .get();
    return data.length ? await resolveImages(stripInternal(data[0])) : null;
  },

  /* ============ 订单(用户私有,按 uid 隔离,只读) ============ */

  /**
   * 当前用户的订单列表(按下单时间降序);status 省略或 'all' 表示全部
   * @param {Object} params { status }
   * @returns {Promise<Array>} Order[]
   */
  async orders(params = {}) {
    const uid = await getUid(this);
    const where = { uid };
    if (params.status && params.status !== 'all') where.status = params.status;
    const { data } = await db.collection('tc-orders')
      .where(where)
      .orderBy('createdAt', 'desc')
      .get();
    return await resolveOrderCovers(data.map(toOrder));
  },

  /* ============ 收货地址(用户私有,按 uid 隔离) ============ */

  /**
   * 当前用户的地址列表(默认地址在前,其余按 id 升序)
   * @returns {Promise<Array>} Address[]
   */
  async addresses() {
    const uid = await getUid(this);
    const { data } = await db.collection('tc-addresses')
      .where({ uid })
      .orderBy('isDefault', 'desc')
      .orderBy('id', 'asc')
      .get();
    return data.map(toAddress);
  },

  /**
   * 新增或更新地址:带 id 为更新,无 id 为新增;返回保存后的地址
   * @param {Object} addr { id?, name, phone, region, detail, isDefault }
   * @returns {Promise<Object>} Address
   */
  async saveAddress(addr = {}) {
    const uid = await getUid(this);
    const coll = db.collection('tc-addresses');
    const dbCmd = db.command;

    // 归一化入参,只取契约字段
    const payload = {
      name: String(addr.name || '').trim(),
      phone: String(addr.phone || '').trim(),
      region: String(addr.region || ''),
      detail: String(addr.detail || '').trim(),
      isDefault: !!addr.isDefault
    };

    // 设为默认时,先清掉本用户其它地址的默认标记
    const clearOtherDefault = async (exceptId) => {
      if (!payload.isDefault) return;
      const where = { uid, isDefault: true };
      if (exceptId != null) where.id = dbCmd.neq(exceptId);
      await coll.where(where).update({ isDefault: false });
    };

    if (addr.id != null) {
      // 更新:仅限本人的该条
      const id = Number(addr.id);
      const exist = await coll.where({ uid, id }).limit(1).get();
      if (!exist.data.length) throw new Error('地址不存在');
      await clearOtherDefault(id);
      await coll.where({ uid, id }).update(payload);
      const res = await coll.where({ uid, id }).limit(1).get();
      return toAddress(res.data[0]);
    }

    // 新增:生成用户内自增业务 id;首条地址强制为默认
    const last = await coll.where({ uid }).orderBy('id', 'desc').limit(1).get();
    const newId = last.data.length ? Number(last.data[0].id) + 1 : 1;
    if (newId === 1) payload.isDefault = true;
    await clearOtherDefault(newId);
    await coll.add({ id: newId, uid, ...payload });
    const res = await coll.where({ uid, id: newId }).limit(1).get();
    return toAddress(res.data[0]);
  },

  /**
   * 删除地址(仅限本人);若删的是默认地址且仍有其它地址,提升最早一条为默认
   * @param {Object} params { id }
   * @returns {Promise<null>}
   */
  async deleteAddress(params = {}) {
    const uid = await getUid(this);
    const id = Number(params.id);
    const coll = db.collection('tc-addresses');
    const exist = await coll.where({ uid, id }).limit(1).get();
    if (!exist.data.length) throw new Error('地址不存在');
    const wasDefault = !!exist.data[0].isDefault;
    await coll.where({ uid, id }).remove();
    if (wasDefault) {
      const rest = await coll.where({ uid }).orderBy('id', 'asc').limit(1).get();
      if (rest.data.length) {
        await coll.where({ uid, id: rest.data[0].id }).update({ isDefault: true });
      }
    }
    return null;
  },

  /**
   * 设为默认地址(仅限本人):清掉旧默认,置新默认
   * @param {Object} params { id }
   * @returns {Promise<null>}
   */
  async setDefaultAddress(params = {}) {
    const uid = await getUid(this);
    const id = Number(params.id);
    const coll = db.collection('tc-addresses');
    const exist = await coll.where({ uid, id }).limit(1).get();
    if (!exist.data.length) throw new Error('地址不存在');
    await coll.where({ uid, isDefault: true }).update({ isDefault: false });
    await coll.where({ uid, id }).update({ isDefault: true });
    return null;
  },

  /* ============ 下单 ============ */

  /**
   * 创建订单（待付款）。权威校验：商品上架 / 库存 / 单次限购；价格以 DB 为准。
   * 事务内「扣库存 + 建单」，防超卖；未支付超时回补、支付为后续步骤。
   * @param {Object} params { goods:[{productId,skuId,qty}], addressId }
   * @returns {Promise<Object>} Order（status=unpaid）
   */
  async createOrder(params = {}) {
    const uid = await getUid(this);
    const goodsIn = Array.isArray(params.goods) ? params.goods : [];
    if (!goodsIn.length) throw new Error('没有可下单的商品');
    const addressId = Number(params.addressId);
    if (!addressId) throw new Error('请选择收货地址');

    // 收货地址快照（仅限本人）
    const addrRes = await db.collection('tc-addresses').where({ uid, id: addressId }).limit(1).get();
    if (!addrRes.data.length) throw new Error('收货地址不存在');
    const address = toAddress(addrRes.data[0]);

    const transaction = await db.startTransaction();
    try {
      const orderGoods = [];
      let goodsAmount = 0;

      for (const line of goodsIn) {
        const productId = Number(line.productId);
        const skuId = Number(line.skuId) || 0;
        const qty = Math.floor(Number(line.qty) || 0);
        if (!productId || qty < 1) throw new Error('下单商品参数不合法');

        const pRes = await transaction.collection('tc-products').where({ id: productId }).limit(1).get();
        const p = pRes.data[0];
        if (!p || !p.onSale) throw new Error('有商品已下架或不存在，请返回核对');

        let price, specName, stock, limit;
        if (skuId && Array.isArray(p.skus) && p.skus.length) {
          const idx = p.skus.findIndex((s) => Number(s.id) === skuId);
          if (idx < 0) throw new Error(`「${p.title}」规格不存在`);
          const sku = p.skus[idx];
          stock = Number(sku.stock) || 0;
          limit = capLimit(sku.limitPerOrder);
          price = Number(sku.price) || 0;
          specName = sku.name || '';
          if (qty > stock) throw new Error(`「${p.title} ${specName}」库存不足，仅剩 ${stock} 件`);
          if (qty > limit) throw new Error(`「${p.title} ${specName}」每单限购 ${limit} 件`);
          // 扣减对应 sku 的库存
          const newSkus = p.skus.map((s, i) => (i === idx ? { ...s, stock: stock - qty } : s));
          await transaction.collection('tc-products').where({ id: productId }).update({ skus: newSkus });
        } else {
          // 无 sku 商品：用商品级库存 / 限购
          stock = Number(p.stock) || 0;
          limit = capLimit(p.limitPerOrder);
          price = Number(p.price) || 0;
          specName = '';
          if (qty > stock) throw new Error(`「${p.title}」库存不足，仅剩 ${stock} 件`);
          if (qty > limit) throw new Error(`「${p.title}」每单限购 ${limit} 件`);
          await transaction.collection('tc-products').where({ id: productId }).update({ stock: stock - qty });
        }

        goodsAmount += price * qty;
        orderGoods.push({ productId, skuId, title: p.title, cover: p.cover, specName, price, qty });
      }

      const freight = 0; // 运费规则后续可配
      const discount = 0;
      const payAmount = goodsAmount + freight - discount;
      const orderId = genOrderId();
      const createdAt = Date.now();

      await transaction.collection('tc-orders').add({
        id: orderId, uid, status: 'unpaid',
        goods: orderGoods, goodsAmount, freight, discount, payAmount,
        address, createdAt
      });

      await transaction.commit();

      // 返回创建的订单（契约里 createdAt 为字符串）
      return {
        id: orderId, status: 'unpaid',
        goods: orderGoods, goodsAmount, freight, discount, payAmount,
        address, createdAt: formatTime(createdAt)
      };
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  }
};
