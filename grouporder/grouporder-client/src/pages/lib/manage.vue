<!--
  M-29 商品库管理（账号级）

  职责：按分类筛选列表、编辑内容与三项默认值（默认价格/库存/限购，库字段 last_*，复用到活动时作为预填值，D-092 起不强制确认）、软删；被封禁记录不可编辑，可删除。
  分类快捷整理（D-066：一件商品至多属于一个分类）：
    - 每件商品的分类标签可点，弹出分类列表直接改（单件）；
    - 选中某个分类时，可把商品「移出分类」（回到未分组，商品本身保留），只改 category_id。
  「＋ 添加商品」= 在商品库直接新建一件商品（libCreate，D-088），默认归入当前选中的分类
  （「全部」「未分组」下默认未分组），弹窗内可改。
  换图（D-084）：编辑弹窗里选图只记本地路径，点「保存」才上传到 lib/上传日期/用户ID/，取消不产生云端文件；
  被换下的旧图由 libUpdate 按三表引用回收。
  红线⑥：lib_id 只用于治理定位，这里不联表读活动商品；商品库是独立于活动的模板集合。
  商品库不设数量上限，列表分页加载。
-->
<template>
  <view class="page">
    <view class="pad">
      <view class="head">
        <text class="meta">保存过的商品会自动出现在这里 · 共 {{ totalAll }} 件</text>
        <text class="mini-btn" @click="goCategory">管理分类</text>
      </view>

      <!-- 分类 tab：全部 / 各分类（按用户排序）/ 未分组（有商品时才显示）-->
      <scroll-view class="chips" scroll-x>
        <text v-for="t in tabs" :key="t.id" class="chip" :class="{ 'chip--on': categoryId === t.id }" @click="pickTab(t.id)">{{ t.name }} {{ t.count }}</text>
      </scroll-view>

      <!-- 新建商品：默认归入当前分类（D-088） -->
      <view class="cat-bar">
        <text class="meta">{{ categoryId ? '「' + catNameOf(categoryId === UNGROUPED ? '' : categoryId) + '」' : '全部' }}共 {{ total }} 件</text>
        <text class="mini-btn mini-btn--primary" @click="openCreate">＋ 添加商品</text>
      </view>

      <view v-for="g in list" :key="g._id" class="card" :class="{ 'card--blocked': g.governance_blocked === 1 }">
        <view class="thumb">
          <image v-if="g.cover_image && g.cover_image.url" class="thumb__img" :src="g.cover_image.url" mode="aspectFill" />
          <text v-else class="thumb__txt">{{ g.name.slice(0, 4) }}</text>
        </view>
        <view class="card__main">
          <view class="card__title">
            <text class="card__name">{{ g.name }}</text>
            <!-- 点分类标签快捷改分类 -->
            <text class="tag tag--cat" :class="{ 'tag--dis': g.governance_blocked === 1 }" @click="openCatSheet(g)">{{ catNameOf(g.category_id) }} ›</text>
            <text v-if="g.governance_blocked === 1" class="tag tag--red">禁止复用</text>
          </view>
          <block v-if="g.governance_blocked !== 1">
            <view class="meta card__line">默认 ¥{{ fen2yuan(g.last_price) }}{{ g.unit ? ' / ' + g.unit : '' }} · 库存 {{ g.last_total_stock > 0 ? g.last_total_stock : '不限' }} · {{ g.last_per_user_limit > 0 ? '限购 ' + g.last_per_user_limit : '不限购' }}</view>
            <view class="meta card__line2">用过 {{ g.use_count }} 次{{ g.last_used_time ? ' · 最近 ' + md(g.last_used_time) : '' }}</view>
          </block>
          <view v-else class="meta meta--red card__line">曾被平台下架，不可编辑或复用</view>
          <view class="btn-row">
            <text class="mini-btn" :class="{ 'mini-btn--dis': g.governance_blocked === 1 }" @click="openEdit(g)">编辑</text>
            <text v-if="isRealCat" class="mini-btn" :class="{ 'mini-btn--dis': g.governance_blocked === 1 }" @click="moveOut(g)">移出分类</text>
            <text class="mini-btn" @click="del(g)">删除</text>
          </view>
        </view>
      </view>

      <view v-if="!list.length && !loading" class="empty">{{ categoryId ? '这个分类下还没有商品' : '商品库为空。挑商品时点「加入本次接龙」会自动沉淀到这里。' }}</view>
      <view v-else-if="list.length" class="more">{{ loading ? '加载中…' : finished ? '没有更多了' : '' }}</view>
    </view>

    <view class="notice">分类是你自己的收纳方式，<text class="b">参与者永远看不到</text>，也不进入清单。修改模板只影响以后的复用。</view>

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
import { ref, computed } from 'vue';
import { onShow, onReachBottom } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';
// @ts-ignore
import { toItem, pickImages, libImageDir, uploadPending } from '@/common/grouporder/upload.js';

const MAX_IMAGES = 9;

const UNGROUPED = '__none__'; // 与 grouporder-goods-co 的未分组筛选标识一致，不是一条分类记录
const PAGE_SIZE = 20;

const categories = ref<any[]>([]);
const ungroupedCount = ref(0);
const categoryId = ref(''); // '' = 全部
const list = ref<any[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const finished = ref(false);
let reqSeq = 0; // 快速切 tab 时丢弃过期响应

const popup = ref<any>(null);
const editing = ref<any>(null);
const editPrice = ref('');
const catIndex = ref(0);
const saving = ref(false);
// 编辑弹窗的图片 item 见 upload.js；封面最多 1 张
const cover = ref<any[]>([]);
const details = ref<any[]>([]);
let eventChannel: any = null;

// —— 分类快捷整理 ——
// 选中的是一条真实分类（不是「全部」也不是「未分组」）时，才出现添加 / 移出
const isRealCat = computed(() => !!categoryId.value && categoryId.value !== UNGROUPED);
const catOptions = computed(() => [{ id: '', name: '未分组' }, ...categories.value.map((c) => ({ id: c._id, name: c.name }))]);

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
    content: `把「${g.name}」移出「${catNameOf(categoryId.value)}」？商品仍保留在商品库，归入未分组。`,
    success: async (r) => {
      if (!r.confirm) return;
      try { await guarded(setCategory(g._id, '')); refreshAll(); notifyOpener(); } catch (e) {}
    },
  });
};


const totalAll = computed(() => categories.value.reduce((s, c) => s + (c.goods_count || 0), 0) + ungroupedCount.value);
const tabs = computed(() => {
  const t = [{ id: '', name: '全部', count: totalAll.value }];
  categories.value.forEach((c) => t.push({ id: c._id, name: c.name, count: c.goods_count || 0 }));
  if (ungroupedCount.value > 0 || categoryId.value === UNGROUPED) t.push({ id: UNGROUPED, name: '未分组', count: ungroupedCount.value });
  return t;
});
const catNames = computed(() => ['未分组', ...categories.value.map((c) => c.name)]);
const catNameOf = (id: string) => {
  const c = id ? categories.value.find((x) => x._id === id) : null;
  return c ? c.name : '未分组';
};
const md = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const loadCategories = async () => {
  const data = (await guarded(api.goodsLib.categoryList())) || {};
  categories.value = data.list || [];
  ungroupedCount.value = data.ungrouped_count || 0;
  // 当前分类已被删除，或未分组已清空时，回到「全部」
  const id = categoryId.value;
  if ((id === UNGROUPED && !ungroupedCount.value) || (id && id !== UNGROUPED && !categories.value.some((c) => c._id === id))) {
    categoryId.value = '';
  }
};

const loadPage = async (reset: boolean) => {
  if (!reset && (loading.value || finished.value)) return;
  const seq = ++reqSeq;
  const p = reset ? 1 : page.value + 1;
  loading.value = true;
  try {
    const data = (await guarded(api.goodsLib.libList({ page: p, pageSize: PAGE_SIZE, category_id: categoryId.value }))) || {};
    if (seq !== reqSeq) return;
    const rows = data.list || [];
    list.value = reset ? rows : list.value.concat(rows);
    page.value = p;
    total.value = data.total || 0;
    finished.value = list.value.length >= total.value || rows.length < PAGE_SIZE;
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

const pickTab = (id: string) => {
  if (categoryId.value === id) return;
  categoryId.value = id;
  list.value = [];
  finished.value = false;
  reload();
};

const openEdit = (g: any) => {
  if (g.governance_blocked === 1) { uni.showToast({ title: '封禁记录不可编辑', icon: 'none' }); return; }
  editing.value = { ...g };
  editPrice.value = fen2yuan(g.last_price);
  const idx = categories.value.findIndex((c) => c._id === g.category_id);
  catIndex.value = idx >= 0 ? idx + 1 : 0;
  cover.value = g.cover_image ? [toItem(g.cover_image)] : [];
  details.value = (g.detail_images || []).map(toItem);
  popup.value.open();
};

// —— 图片：只记本地路径，点保存时才上传 ——
const chooseCover = async () => {
  const picked = await pickImages(1);
  if (picked.length) cover.value = picked;
};
const chooseDetails = async () => {
  const picked = await pickImages(MAX_IMAGES - details.value.length);
  details.value = details.value.concat(picked);
};
const onCat = (e: any) => { catIndex.value = Number(e.detail.value); };
const onRecommend = (e: any) => { editing.value.is_recommend = e.detail.value ? 1 : 0; };

/** 新建：复用编辑弹窗，分类默认取当前 tab（全部 / 未分组 → 未分组） */
const openCreate = () => {
  editing.value = { _id: '', name: '', unit: '份', last_total_stock: 0, last_per_user_limit: 0, description: '', is_recommend: 0 };
  editPrice.value = '';
  const idx = isRealCat.value ? categories.value.findIndex((c) => c._id === categoryId.value) : -1;
  catIndex.value = idx >= 0 ? idx + 1 : 0;
  cover.value = [];
  details.value = [];
  popup.value.open();
};
const closeEdit = () => { popup.value.close(); editing.value = null; cover.value = []; details.value = []; };
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
    const catId = catIndex.value === 0 ? '' : categories.value[catIndex.value - 1]._id;
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
      await guarded(api.goodsLib.libUpdate(Object.assign({ lib_id: editing.value._id }, body)));
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
    title: '删除商品', content: '软删后不再出现在选择列表；历史活动里已复制的商品不受影响（复制不是引用）。',
    success: async (r) => { if (!r.confirm) return; try { await guarded(api.goodsLib.libDelete({ lib_id: g._id })); refreshAll(); notifyOpener(); } catch (e) {} },
  });
};

const goCategory = () => uni.navigateTo({ url: '/pages/lib/category', events: { changed: () => refreshAll() } });

onShow(() => {
  const pages = getCurrentPages();
  const cur: any = pages[pages.length - 1];
  if (cur && cur.getOpenerEventChannel) eventChannel = cur.getOpenerEventChannel();
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
</style>
