<!--
  M-29 商品库管理（账号级）

  职责：按分类筛选列表、编辑内容与三项默认值（默认价格/库存/限购，库字段 last_*，复用到活动时作为预填值，D-092 起不强制确认）、软删；被封禁记录不可编辑，可删除。
  分类快捷整理（D-066：一件商品至多属于一个分类）：
    - 每件商品的分类标签可点，弹出分类列表直接改（单件）；
    - 选中某个分类时，可把商品「移出分类」（回到未分组，商品本身保留），只改 category_id。
  「＋ 添加商品」= 在商品库直接新建一件商品（libCreate，D-088）。选中真实大类时，分类只列该大类下的小类，
  默认归入与大类同名的小类（D-151，新建大类自带）；小类标题旁的「＋」默认归入该小类；选中「未分类」时可选全部小类。
  大类栏末尾「＋ 大类」可直接新建大类（D-151）；没有商品的小类也列出（只显示小标题与「暂无商品」）。
  换图（D-084）：编辑弹窗里选图只记本地路径，点「保存」才上传到 lib/上传日期/用户ID/，取消不产生云端文件；
  被换下的旧图由 libUpdate 按三表引用回收。
  红线⑥：lib_id 只用于治理定位，这里不联表读活动商品；商品库是独立于活动的模板集合。
  D-143 修订：编辑已有商品时，名称、说明、图片的改动由服务端自动同步到本人未结束活动里的同一商品，保存后提示同步结果。
  商品库不设数量上限，列表分页加载。
-->
<template>
  <view class="page">
    <view class="pad">
      <view class="head">
        <text class="meta">保存过的商品会自动出现在这里 · 共 {{ totalAll }} 件</text>
        <text class="mini-btn" @click="goCategory">管理分类</text>
      </view>

      <!-- 大类横向筛选（无「全部」）：真实大类 + 末尾「未分类」大类；切大类是纯前端重分组 -->
      <scroll-view v-if="parentChips.length" class="chips" scroll-x>
        <text v-for="p in parentChips" :key="p._id" class="chip" :class="{ 'chip--on': parentId === p._id, 'chip--uncat': p._id === '__uncat__' }" @click="pickParent(p._id)">{{ p.name }} {{ p.goods_count }}</text>
        <text class="chip chip--add" @click="createParent">＋ 大类</text>
      </scroll-view>

      <view class="cat-bar">
        <text class="meta">共 {{ totalAll }} 件商品</text>
        <text class="mini-btn mini-btn--primary" @click="openCreate">＋ 添加商品</text>
      </view>

      <!-- 竖式分段：每个小类一个小标题，其下为该小类商品；未分类放最后 -->
      <view v-for="sec in sections" :key="sec.key" class="sec">
        <view class="sec__head">
          <text class="sec__name" :class="{ 'sec__name--none': sec.key === '__none__' }">{{ sec.name }}</text>
          <view class="sec__right">
            <text class="sec__count">{{ sec.goods.length }} 件</text>
            <text v-if="sec.key !== '__none__'" class="sec__add" @click="openCreate(sec.key)">＋</text>
          </view>
        </view>
        <view v-if="!sec.goods.length" class="sec__empty">{{ finished ? '暂无商品' : '暂无已加载的商品，上滑加载更多' }}</view>
        <view v-for="g in sec.goods" :key="g._id" class="card" :class="{ 'card--blocked': g.governance_blocked === 1 }">
          <view class="thumb">
            <image v-if="g.cover_image && g.cover_image.url" class="thumb__img" :src="g.cover_image.url" mode="aspectFill" />
            <text v-else class="thumb__txt">{{ g.name.slice(0, 4) }}</text>
          </view>
          <view class="card__main">
            <view class="card__title">
              <text class="card__name">{{ g.name }}</text>
              <!-- 点分类标签快捷改分类 -->
              <text class="tag tag--cat" :class="{ 'tag--dis': g.governance_blocked === 1, 'tag--none': catNameOf(g.category_id) === '未分组' }" @click="openCatSheet(g)">{{ catNameOf(g.category_id) }} ›</text>
              <text v-if="g.governance_blocked === 1" class="tag tag--red">禁止复用</text>
            </view>
            <block v-if="g.governance_blocked !== 1">
              <view class="meta card__line">默认 ¥{{ fen2yuan(g.last_price) }}{{ g.unit ? ' / ' + g.unit : '' }} · 库存 {{ g.last_total_stock > 0 ? g.last_total_stock : '不限' }} · {{ g.last_per_user_limit > 0 ? '限购 ' + g.last_per_user_limit : '不限购' }}</view>
              <view class="meta card__line2">用过 {{ g.use_count }} 次{{ g.last_used_time ? ' · 最近 ' + md(g.last_used_time) : '' }}</view>
            </block>
            <view v-else class="meta meta--red card__line">曾被平台下架，不可编辑或复用</view>
            <view class="btn-row">
              <text class="mini-btn" :class="{ 'mini-btn--dis': g.governance_blocked === 1 }" @click="openEdit(g)">编辑</text>
              <text v-if="catNameOf(g.category_id) !== '未分组'" class="mini-btn" :class="{ 'mini-btn--dis': g.governance_blocked === 1 }" @click="moveOut(g)">移出分类</text>
              <text class="mini-btn" @click="del(g)">删除</text>
            </view>
          </view>
        </view>
      </view>

      <view v-if="!sections.length && !loading" class="empty">{{ parentId === UNCAT ? '没有未分类的商品' : '这个大类下还没有小类，可在「管理分类」里新建' }}</view>
      <view v-else-if="!finished" class="more">{{ loading ? '加载中…' : '上滑加载更多' }}</view>
    </view>

    <view class="notice">商品按小类归类；发起接龙时，<text class="b">所选小类会作为买家详情里的分组小标题</text>。大类只给你自己归类用，不展示给买家；分类不进入清单。</view>

    <!-- 编辑弹窗 -->
    <uni-popup ref="popup" type="bottom">
      <view class="sheet" v-if="editing">
        <view class="sheet__title">{{ editing._id ? '编辑商品' : '新建商品' }}</view>
        <scroll-view class="sheet__body" scroll-y>
          <view class="f"><text class="f__k">名称</text><input class="f__v" v-model="editing.name" maxlength="40" /></view>
          <view class="f"><text class="f__k">单位</text><input class="f__v" v-model="editing.unit" maxlength="10" /></view>
          <view class="f"><text class="f__k">默认价格(元)</text><input class="f__v" v-model="editPrice" type="digit" /></view>
          <view class="f"><text class="f__k">默认库存</text><input class="f__v" v-model.number="editing.last_total_stock" type="number" /></view>
          <view class="f"><text class="f__k">默认限购</text><input class="f__v" v-model.number="editing.last_per_user_limit" type="number" /></view>
          <view class="f-tip">默认价格 / 库存 / 限购：复用到活动时作为预填值，需要时在活动里直接修改；0 表示不限。活动里保存该商品时会更新为当次的值。</view>
          <view class="f"><text class="f__k">商品说明</text><input class="f__v" v-model="editing.description" placeholder="选填" maxlength="300" /></view>
          <!-- 推荐：复用进活动时的默认值，只加角标不改顺序（D-065） -->
          <view class="f f--row"><text class="f__k">推荐商品</text><switch :checked="editing.is_recommend === 1" @change="onRecommend" color="#168a55" /></view>
          <view class="f"><text class="f__k">分类</text>
            <picker :range="catNames" :value="catIndex" @change="onCat"><text class="f__v">{{ catNames[catIndex] || '未分组' }} ›</text></picker>
            <text v-if="createScope" class="f__scope">仅列出「{{ createScope.name }}」下的小类</text>
          </view>
          <view class="f f--col">
            <text class="f__k">封面图 <text class="req">*</text></text>
            <view class="imgs">
              <view v-if="cover.length" class="img">
                <image class="img-pic" :src="cover[0].preview" mode="aspectFill" @click="chooseCover" />
                <text class="img-del" @click="cover = []">×</text>
              </view>
              <view v-else class="img-add" @click="chooseCover">＋</view>
            </view>
            <text class="f__k f__k--sub">详情图（选填，最多 {{ MAX_IMAGES }} 张）</text>
            <view class="imgs">
              <view v-for="(it, i) in details" :key="i" class="img">
                <image class="img-pic" :src="it.preview" mode="aspectFill" />
                <text class="img-del" @click="details.splice(i, 1)">×</text>
              </view>
              <view v-if="details.length < MAX_IMAGES" class="img-add" @click="chooseDetails">＋</view>
            </view>
          </view>
        </scroll-view>
        <!-- D-143：编辑已有商品时提示自动同步 -->
        <view v-if="editing && editing._id" class="sync-tip">保存后，名称、说明、图片会同步到你未结束活动里的这个商品；进行中的活动会因此重新审核。</view>
        <view class="sheet__act">
          <button class="btn" @click="closeEdit">取消</button>
          <button class="btn btn--primary" :loading="saving" @click="saveEdit">保存</button>
        </view>
      </view>
    </uni-popup>

    <!-- 单件快捷改分类 -->
    <uni-popup ref="catPopup" type="bottom">
      <view class="sheet" v-if="catTarget">
        <view class="sheet__title">「{{ catTarget.name }}」移到</view>
        <scroll-view class="sheet__list" scroll-y>
          <view v-for="o in catOptions" :key="o.id" class="opt" :class="{ 'opt--on': (catTarget.category_id || '') === o.id }" @click="pickCat(o.id)">
            <text>{{ o.name }}</text>
            <text v-if="(catTarget.category_id || '') === o.id" class="opt__check">当前</text>
          </view>
        </scroll-view>
        <view class="sheet__act"><button class="btn" @click="closeCatSheet">取消</button></view>
      </view>
    </uni-popup>

  </view>
</template>

<script setup lang="ts">
// @ts-ignore
import { fmtDate } from '@/common/grouporder/activity-time.js';
import { ref, computed } from 'vue';
import { onShow, onReachBottom } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';
// @ts-ignore
import { toItem, pickImages, libImageDir, uploadPending } from '@/common/grouporder/upload.js';

const MAX_IMAGES = 9;

const PAGE_SIZE = 100; // 一页尽量多取，减少加载次数（服务端上限 100）

const tree = ref<any[]>([]);     // 两级树：大类→小类，含虚拟「未分类」
const leafCats = ref<any[]>([]); // 扁平小类（带 parent_name），供改分类 / 编辑选择器
const ungroupedCount = ref(0);
const parentId = ref('');        // 当前选中的大类；切大类是纯前端重分组，不重新请求
const list = ref<any[]>([]);     // 全部商品的分页池（不按分类过滤，按小类在前端分段）
const page = ref(1);
const loading = ref(false);
const finished = ref(false);
let reqSeq = 0; // 快速翻页时丢弃过期响应

const popup = ref<any>(null);
const editing = ref<any>(null);
const editPrice = ref('');
const catIndex = ref(0);
const saving = ref(false);
// 编辑弹窗的图片 item 见 upload.js；封面最多 1 张
const cover = ref<any[]>([]);
const details = ref<any[]>([]);
let eventChannel: any = null;

// —— 分类分组 ——
const UNCAT = '__uncat__'; // 「未分类」作为一个大类的标识
const realParents = computed(() => tree.value.filter((p: any) => !p.is_virtual)); // 真实大类（不含虚拟「未分类」）
const curParent = computed(() => realParents.value.find((p: any) => p._id === parentId.value) || null);
const validLeafIds = computed(() => { const s = new Set<string>(); leafCats.value.forEach((c: any) => s.add(c._id)); return s; });
// 未分类商品 = 全部 − 落在各真实小类里的；含真未分组与指向无效小类的迁移孤儿
const uncatCount = computed(() => Math.max(0, totalAll.value - realParents.value.reduce((s: number, p: any) => s + (p.goods_count || 0), 0)));
// 大类栏：真实大类 + 末尾一个「未分类」大类（有未分类商品时才出现）
const parentChips = computed(() => {
  const chips = realParents.value.map((p: any) => ({ _id: p._id, name: p.name, goods_count: p.goods_count }));
  chips.push({ _id: UNCAT, name: '未分类', goods_count: uncatCount.value }); // 始终显示，哪怕 0 件
  return chips;
});
// 选中「未分类」大类 → 只显示未分组商品；选中真实大类 → 只显示它的小类分段（不再全局追加未分类）
const sections = computed(() => {
  if (parentId.value === UNCAT) {
    const none = list.value.filter((g: any) => !g.category_id || !validLeafIds.value.has(g.category_id));
    return none.length ? [{ key: '__none__', name: '未分类', goods: none }] : [];
  }
  const secs: any[] = [];
  const children = curParent.value ? curParent.value.children || [] : [];
  // 没有商品的小类也列出（只显示小标题与「暂无商品」），新建的小类返回后能立刻看到
  for (const c of children) {
    secs.push({ key: c._id, name: c.name, goods: list.value.filter((g: any) => g.category_id === c._id) });
  }
  return secs;
});
const catOptions = computed(() => [{ id: '', name: '未分组' }, ...leafCats.value.map((c: any) => ({ id: c._id, name: c.parent_name + ' / ' + c.name }))]);

/** 只改分类：libUpdate 只带 category_id，其余字段不动 */
const setCategory = (libId: string, catId: string) => api.goodsLib.libUpdate({ lib_id: libId, category_id: catId });

const catPopup = ref<any>(null);
const catTarget = ref<any>(null);
const openCatSheet = (g: any) => {
  if (g.governance_blocked === 1) { uni.showToast({ title: '封禁记录不可修改', icon: 'none' }); return; }
  catTarget.value = g;
  catPopup.value.open();
};
const closeCatSheet = () => { catPopup.value.close(); catTarget.value = null; };
const pickCat = async (catId: string) => {
  const g = catTarget.value;
  if (!g || (g.category_id || '') === catId) { closeCatSheet(); return; }
  try {
    await guarded(setCategory(g._id, catId));
    uni.showToast({ title: '已移到「' + catNameOf(catId) + '」', icon: 'none' });
    closeCatSheet();
    refreshAll();
    notifyOpener();
  } catch (e) {}
};

const moveOut = (g: any) => {
  if (g.governance_blocked === 1) { uni.showToast({ title: '封禁记录不可修改', icon: 'none' }); return; }
  uni.showModal({
    title: '移出分类',
    content: `把「${g.name}」移出「${catNameOf(g.category_id)}」？商品仍保留在商品库，归入未分组。`,
    success: async (r) => {
      if (!r.confirm) return;
      try { await guarded(setCategory(g._id, '')); refreshAll(); notifyOpener(); } catch (e) {}
    },
  });
};


// 「全部」用服务端权威总数（含迁移遗留、未归入任何小类的商品），不靠分类树累加
const totalAll = ref(0);
// 编辑 / 新建弹窗的分类选项（catIndex 指向这里）：
// 在真实大类下新建 → 只列该大类的小类（D-151）；其余情况 → 未分组 + 全部小类（显示「大类 / 小类」）
const createScope = ref<any>(null); // 新建时限定的大类（含 children），null = 不限
const editOptions = computed(() => {
  const scope = createScope.value;
  if (scope && scope.children && scope.children.length) return scope.children.map((c: any) => ({ id: c._id, name: c.name }));
  return [{ id: '', name: '未分组' }, ...leafCats.value.map((c: any) => ({ id: c._id, name: c.parent_name + ' / ' + c.name }))];
});
const catNames = computed(() => editOptions.value.map((o: any) => o.name));
const catNameOf = (id: string) => {
  const c = id ? leafCats.value.find((x: any) => x._id === id) : null;
  return c ? c.name : '未分组';
};
// 统一日期格式 yyyy/mm/dd（D-145）
const md = (ts: number) => fmtDate(ts);

const loadCategories = async () => {
  const data = (await guarded(api.goodsLib.categoryList())) || {};
  tree.value = data.tree || [];
  leafCats.value = data.list || [];
  ungroupedCount.value = data.ungrouped_count || 0;
  totalAll.value = data.total_goods || 0;
  // 当前选中的大类不存在（没选过/被删/未分类已清空）时，落到第一个可用大类（真实大类优先，否则未分类）
  const allowed = realParents.value.map((p: any) => p._id);
  allowed.push(UNCAT); // 未分类大类始终可选
  if (!allowed.includes(parentId.value)) parentId.value = allowed[0] || UNCAT;
};

const loadPage = async (reset: boolean) => {
  if (!reset && (loading.value || finished.value)) return;
  const seq = ++reqSeq;
  const p = reset ? 1 : page.value + 1;
  loading.value = true;
  try {
    // 不按分类过滤，取全部商品的分页；大类/小类分段在前端按 category_id 完成
    const data = (await guarded(api.goodsLib.libList({ page: p, pageSize: PAGE_SIZE }))) || {};
    if (seq !== reqSeq) return;
    const rows = data.list || [];
    list.value = reset ? rows : list.value.concat(rows);
    page.value = p;
    finished.value = (data.total ? list.value.length >= data.total : false) || rows.length < PAGE_SIZE;
  } catch (e) {
    /* guarded 已处理提示 */
  } finally {
    if (seq === reqSeq) loading.value = false;
  }
};
const reload = () => loadPage(true);
const refreshAll = async () => {
  try { await loadCategories(); } catch (e) {}
  reload();
};

// 切大类纯前端重分组，不重新请求（全部商品已在池中）
const pickParent = (id: string) => { parentId.value = id; };

const openEdit = (g: any) => {
  if (g.governance_blocked === 1) { uni.showToast({ title: '封禁记录不可编辑', icon: 'none' }); return; }
  editing.value = { ...g };
  editPrice.value = fen2yuan(g.last_price);
  createScope.value = null; // 编辑已有商品可改到任意小类
  const idx = editOptions.value.findIndex((o: any) => o.id === g.category_id);
  catIndex.value = idx >= 0 ? idx : 0;
  cover.value = g.cover_image ? [toItem(g.cover_image)] : [];
  details.value = (g.detail_images || []).map(toItem);
  popup.value.open();
};

// —— 图片：只记本地路径，点保存时才上传 ——
// 手机上选图会打开系统相册，返回时触发本页 onShow；不跳过的话会整页重载列表（回到第一页、滚动位置丢失），
// 编辑弹窗里的内容虽不丢，但体验差。选图期间打标记，onShow 见到就跳过一次；
// H5 等不触发 onShow 的平台，选完稍等自动清标记，不影响之后正常返回时的刷新。
let pickingImage = false;
const pickKeepingList = async (count: number) => {
  pickingImage = true;
  try {
    return await pickImages(count);
  } finally {
    setTimeout(() => { pickingImage = false; }, 800);
  }
};
const chooseCover = async () => {
  const picked = await pickKeepingList(1);
  if (picked.length) cover.value = picked;
};
const chooseDetails = async () => {
  const picked = await pickKeepingList(MAX_IMAGES - details.value.length);
  details.value = details.value.concat(picked);
};
const onCat = (e: any) => { catIndex.value = Number(e.detail.value); };
const onRecommend = (e: any) => { editing.value.is_recommend = e.detail.value ? 1 : 0; };

/**
 * 新建：复用编辑弹窗。childId 来自小类标题旁的「＋」。
 * 选中真实大类且有小类时，分类只列该大类的小类，默认 childId → 与大类同名的小类 → 第一个小类；
 * 选中「未分类」或大类下还没有小类时，默认未分组、可选全部小类。
 */
const openCreate = (childId?: any) => {
  editing.value = { _id: '', name: '', unit: '份', last_total_stock: 0, last_per_user_limit: 0, description: '', is_recommend: 0 };
  editPrice.value = '';
  const p = curParent.value;
  createScope.value = p && p.children && p.children.length ? p : null;
  let idx = 0;
  if (createScope.value) {
    const opts = editOptions.value;
    const want = typeof childId === 'string' ? childId : '';
    idx = opts.findIndex((o: any) => o.id === want);
    if (idx < 0) idx = opts.findIndex((o: any) => o.name === p.name);
    if (idx < 0) idx = 0;
  }
  catIndex.value = idx;
  cover.value = [];
  details.value = [];
  popup.value.open();
};
const closeEdit = () => { popup.value.close(); editing.value = null; createScope.value = null; cover.value = []; details.value = []; };
const notifyOpener = () => { if (eventChannel && eventChannel.emit) eventChannel.emit('changed'); };

const saveEdit = async () => {
  if (!editing.value) return;
  if (!String(editing.value.name || '').trim()) {
    uni.showToast({ title: '请填写商品名称', icon: 'none' });
    return;
  }
  if (!cover.value.length) {
    uni.showToast({ title: '请上传商品封面图', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    uni.showLoading({ title: '上传图片中', mask: true });
    try {
      const dir = libImageDir();
      await uploadPending(cover.value, dir, 'lib_cover');
      await uploadPending(details.value, dir, 'lib_img');
    } catch (e) {
      uni.showModal({ content: '图片上传失败，请重试', showCancel: false });
      return;
    } finally {
      // 要在保存请求之前关：小程序 loading 与 toast 共用一个层，晚关会把接口的错误提示一起关掉
      uni.hideLoading();
    }
    const opt = editOptions.value[catIndex.value];
    const catId = opt ? opt.id : '';
    const body = {
      name: String(editing.value.name).trim(),
      unit: editing.value.unit,
      last_price: Math.round(Number(editPrice.value || 0) * 100),
      last_total_stock: editing.value.last_total_stock || 0,
      last_per_user_limit: editing.value.last_per_user_limit || 0,
      description: editing.value.description || '',
      is_recommend: editing.value.is_recommend || 0,
      cover_image: cover.value[0].file,
      detail_images: details.value.map((it) => it.file),
      category_id: catId,
    };
    if (editing.value._id) {
      const r = (await guarded(api.goodsLib.libUpdate(Object.assign({ lib_id: editing.value._id }, body)))) || {};
      // 内容改动已自动同步到未结束活动里的同一商品（D-143），告诉团长结果
      const sy = r.synced || {};
      if (sy.goods_count) {
        uni.showModal({
          title: '已同步到活动',
          content: `名称、说明、图片的改动已同步到 ${sy.activity_count} 个未结束的活动。` + (sy.recheck_count ? `其中 ${sy.recheck_count} 个进行中的活动因内容改动转入审核中，审核通过前参与者暂时不能下单。` : ''),
          showCancel: false,
        });
      } else {
        uni.showToast({ title: '已保存', icon: 'none' });
      }
    } else {
      await guarded(api.goodsLib.libCreate(body));
      uni.showToast({ title: '已添加到「' + catNameOf(catId) + '」', icon: 'none' });
    }
    closeEdit();
    refreshAll(); // 分类可能变化，各 tab 数量一并刷新
    notifyOpener();
  } catch (e) {} finally { saving.value = false; }
};

const del = (g: any) => {
  uni.showModal({
    title: '删除商品', content: '删除后不再出现在选择列表；已经加进活动的商品不受影响。',
    success: async (r) => { if (!r.confirm) return; try { await guarded(api.goodsLib.libDelete({ lib_id: g._id })); refreshAll(); notifyOpener(); } catch (e) {} },
  });
};

const goCategory = () => uni.navigateTo({ url: '/pages/lib/category', events: { changed: () => refreshAll() } });

/** 直接新建大类（D-151）：服务端同时建同名小类；建好后切到这个大类 */
const createParent = () => {
  if (realParents.value.length >= 50) { uni.showToast({ title: '最多 50 个大类', icon: 'none' }); return; }
  uni.showModal({
    title: '新建大类', editable: true, placeholderText: '大类名称（1–10 字）',
    success: async (r: any) => {
      if (!r.confirm || !String(r.content || '').trim()) return;
      try {
        const res = (await guarded(api.goodsLib.categoryCreate({ name: String(r.content).trim() }))) || {};
        if (res.category_id) parentId.value = res.category_id;
        await refreshAll();
        notifyOpener();
      } catch (e) {}
    },
  });
};

onShow(() => {
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
  // 从系统相册返回：保留当前列表与滚动位置，不重载
  if (pickingImage) { pickingImage = false; return; }
  refreshAll();
});
onReachBottom(() => loadPage(false));
</script>

<style lang="scss" scoped>

.page { min-height: 100vh; background: $go-canvas; padding-bottom: env(safe-area-inset-bottom); }
.pad { padding: 32rpx 32rpx 0; }
.head { display: flex; justify-content: space-between; align-items: center; margin: 0 4rpx 22rpx; }
.meta { color: $go-muted; font-size: 22rpx; line-height: 1.55; }
.meta--red { color: $go-red; }

.chips { white-space: nowrap; padding-bottom: 22rpx; }
.chip { display: inline-block; margin-right: 14rpx; padding: 12rpx 26rpx; border-radius: 30rpx; background: #fff; border: 1rpx solid $go-line; font-size: 25rpx; color: #6b746f; }
.chip--on { background: $go-primary-soft; border-color: $go-primary; color: $go-primary-dark; font-weight: 600; }
.chip--uncat { color: $go-orange; } /* 「未分类」大类用橙色区分 */
.chip--uncat.chip--on { background: $go-orange-soft; border-color: $go-orange; color: $go-orange-text; }
.chip--add { color: $go-primary-dark; border-style: dashed; border-color: #bed5c7; }

/* 竖式分段：小类小标题 */
.sec { margin-bottom: 8rpx; }
.sec__head { display: flex; align-items: center; justify-content: space-between; margin: 20rpx 4rpx 14rpx; }
.sec__name { font-size: 27rpx; font-weight: 700; color: $go-ink; display: flex; align-items: center; }
.sec__name::before { content: ''; width: 6rpx; height: 26rpx; background: $go-primary; border-radius: 4rpx; margin-right: 14rpx; }
.sec__name--none::before { background: $go-orange; }
.sec__count { font-size: 22rpx; color: $go-muted; }
.sec__right { display: flex; align-items: center; }
.sec__add { margin-left: 16rpx; width: 44rpx; height: 44rpx; line-height: 40rpx; text-align: center; border-radius: 50%; border: 1rpx solid $go-primary; color: $go-primary; font-size: 30rpx; }
.sec__empty { margin: 0 4rpx 20rpx; padding: 22rpx; text-align: center; font-size: 23rpx; color: $go-placeholder; background: #fff; border: 1rpx dashed $go-line; border-radius: 20rpx; }
.f__scope { display: block; font-size: 20rpx; color: $go-muted; margin-left: 12rpx; }

.card { display: flex; background: #fff; border: 1rpx solid $go-line; border-radius: 32rpx; padding: 30rpx; margin-bottom: 24rpx; box-shadow: 0 8rpx 28rpx rgba(37, 55, 45, 0.03); }
.card--blocked { opacity: 0.6; }
.thumb { width: 108rpx; height: 108rpx; flex-shrink: 0; border-radius: 22rpx; background: #e8eee9; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-right: 24rpx; }
.thumb__img { width: 108rpx; height: 108rpx; }
.thumb__txt { width: 80rpx; font-size: 20rpx; color: #7e8a84; text-align: center; line-height: 1.3; }
.card__main { flex: 1; min-width: 0; }
.card__title { display: flex; align-items: center; flex-wrap: wrap; }
.card__name { font-size: 30rpx; font-weight: 600; color: $go-ink; }
.card__line { margin-top: 10rpx; }
.card__line2 { margin-top: 6rpx; }
.tag { margin-left: 12rpx; border-radius: 999rpx; padding: 6rpx 16rpx; font-size: 20rpx; font-weight: 600; }
.tag--gray { background: $go-tag-bg; color: $go-tag-text; }
.tag--red { background: $go-red-soft; color: $go-red; }

.cat-bar { display: flex; justify-content: space-between; align-items: center; margin: 0 4rpx 22rpx; }
.mini-btn--primary { background: $go-primary; border-color: $go-primary; color: #fff; }
.tag--cat { background: $go-primary-soft; color: $go-primary-dark; }
.tag--none { background: $go-orange; color: #fff; } /* 未分组用实心橙色区分于真实分类（绿色），更醒目 */
.tag--dis { background: $go-tag-bg; color: $go-tag-text; }
.btn-row { display: flex; margin-top: 20rpx; }
.mini-btn { display: inline-block; border: 1rpx solid $go-border; color: $go-ink; background: #fff; border-radius: 18rpx; padding: 12rpx 20rpx; font-size: 22rpx; }
.btn-row .mini-btn { flex: 1; text-align: center; }
.btn-row .mini-btn + .mini-btn { margin-left: 20rpx; }
.mini-btn--dis { color: $go-placeholder; border-color: $go-line; }

.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 100rpx 40rpx; line-height: 1.7; }
.more { text-align: center; color: $go-muted; font-size: 22rpx; padding: 8rpx 0 16rpx; }
.notice { margin: 24rpx 32rpx 32rpx; border-radius: 24rpx; padding: 22rpx 24rpx; font-size: 22rpx; line-height: 1.55; color: $go-primary-dark; background: $go-primary-soft; }
.b { font-weight: 700; }

.sheet { background: #fff; border-radius: 24rpx 24rpx 0 0; padding: 32rpx; }
.sheet__title { font-size: 30rpx; color: $go-ink; text-align: center; margin-bottom: 24rpx; }
.f { display: flex; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $go-soft; }
.f-tip { font-size: 22rpx; color: $go-muted; line-height: 1.6; padding: 12rpx 0; }
.f--row { justify-content: space-between; }
.f__k { width: 180rpx; font-size: 26rpx; color: $go-muted; }
.f__v { flex: 1; font-size: 28rpx; color: $go-ink; }
.sheet__list { max-height: 60vh; }
.opt { display: flex; align-items: center; justify-content: space-between; padding: 24rpx 8rpx; border-bottom: 1rpx solid $go-soft; font-size: 28rpx; color: $go-ink; }
.opt--on { color: $go-primary-dark; font-weight: 600; }
.opt__check { font-size: 22rpx; color: $go-primary; }
.sheet__body { max-height: 70vh; }
.f--col { flex-direction: column; align-items: stretch; }
.f__k--sub { display: block; width: auto; margin-top: 16rpx; }
.req { color: $go-red; }
.imgs { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 12rpx; }
.img { position: relative; width: 140rpx; height: 140rpx; }
.img-pic { width: 140rpx; height: 140rpx; border-radius: 16rpx; background: $go-soft; }
.img-del { position: absolute; top: -12rpx; right: -12rpx; width: 36rpx; height: 36rpx; line-height: 34rpx; text-align: center; font-size: 28rpx; color: #fff; background: rgba(0, 0, 0, 0.55); border-radius: 50%; }
.img-add { width: 140rpx; height: 140rpx; line-height: 140rpx; text-align: center; font-size: 52rpx; color: $go-placeholder; border: 1rpx dashed $go-border; border-radius: 16rpx; }
.sheet__act { display: flex; gap: 16rpx; margin-top: 32rpx; }
.btn { flex: 1; margin: 0; font-size: 30rpx; background: $go-soft; color: $go-text; }
.btn--primary { background: $go-primary; color: #fff; }
.sync-tip { font-size: 22rpx; color: $go-orange-text; background: $go-orange-soft; padding: 12rpx 24rpx; line-height: 1.5; }
</style>
