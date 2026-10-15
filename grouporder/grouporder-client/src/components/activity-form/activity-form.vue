<!--
  M-10 创建 / 编辑活动 表单核心（faqi 新建 tab 与 edit 改草稿页共用）

  CLIENT_FRONTEND_BRIEF §4：
    - 「发起接龙」tab 恒为新建态（约束 3）：无 activity_id 进入。
    - 三个并列按钮（按主次区分样式）：＋添加新商品 / 从商品库添加（原「复用历史商品」）/ ↺复用历史接龙。
    - 「管理商品库 ›」是轻量文字链接，不是第四个并列按钮。
  D-060 / D-086：交付方式可多选（送货上门、自提至少一种），发布后不可修改；参与者下单时在其中选一种，自提只收姓名+电话。

  草稿模型：加商品 / 从商品库添加都需要 activity_id，所以首次执行这类动作前
  先用当前标题创建草稿（activityCreateDraft）拿到 id；之后的商品操作直接落服务端。
  图片先选后传（common/grouporder/upload.js）：建草稿时不传图，「保存草稿 / 下一步」时才上传。
  资料齐全性（封面图、商品、自提地址）只在「下一步」时检查，填写过程中不拦（D-041）。
  复制预填（D-091）：从 M-31 选源后进入本表单，内容按源活动预填但【不生成记录】；
  保存草稿 / 下一步，或首次对商品编辑 / 删除 / 添加时，才按源生成草稿（activityCopy），
  再用表单内容覆盖。被平台下架的商品预先提示且不会复制。
-->
<template>
  <view class="af" :class="{ 'af--tabbar': withTabbar }">
    <view class="af__field">
      <text class="af__label">接龙标题 <text class="req">*</text></text>
      <input class="af__input" v-model="form.title" placeholder="给这次接龙起个名字" maxlength="40" />
    </view>

    <view class="af__field">
      <text class="af__label">活动说明（选填）</text>
      <textarea class="af__textarea" v-model="form.description" placeholder="补充说明，所有参与者可见" maxlength="500" />
    </view>

    <!-- 图片（D-041）：封面必填，轮播图选填最多 9 张 -->
    <view class="af__field">
      <text class="af__label">封面图 <text class="req">*</text></text>
      <view class="af__imgs">
        <view v-if="cover.length" class="af__img">
          <image class="af__img-pic" :src="cover[0].preview" mode="aspectFill" @click="chooseCover" />
          <text class="af__img-del" @click="cover = []">×</text>
        </view>
        <view v-else class="af__img-add" @click="chooseCover">＋</view>
      </view>
      <text class="af__label af__label--sub">轮播图（选填，最多 {{ MAX_IMAGES }} 张）</text>
      <view class="af__imgs">
        <view v-for="(it, i) in images" :key="i" class="af__img">
          <image class="af__img-pic" :src="it.preview" mode="aspectFill" />
          <text class="af__img-del" @click="images.splice(i, 1)">×</text>
        </view>
        <view v-if="images.length < MAX_IMAGES" class="af__img-add" @click="chooseImages">＋</view>
      </view>
    </view>

    <!-- 商品列表 -->
    <view class="af__block">
      <view class="af__block-head">
        <text class="af__block-title">商品列表（{{ goods.length }}）</text>
        <text class="af__link" @click="goLibManage">管理商品库 ›</text>
      </view>

      <!-- 复制预填（D-091）：尚未生成活动 -->
      <view v-if="copyMode" class="af__copy-tip">复制自「{{ copySourceTitle }}」。点「保存草稿」或「下一步」后才会生成新的活动；在此之前编辑商品也会先生成草稿。</view>
      <view v-if="excludedGoods.length" class="af__pending-tip">以下 {{ excludedGoods.length }} 件商品因违规已被平台下架，不会复制：{{ excludedGoods.map((g) => g.name).join('、') }}</view>
      <view v-for="(g, i) in goods" :key="g._id || i" class="goods-row">
        <view class="goods-row__main">
          <text class="goods-row__name">{{ g.name }}</text>
          <text class="goods-row__meta">￥{{ fen2yuan(g.price) }} / {{ g.unit || '份' }} · 库存 {{ g.total_stock > 0 ? g.total_stock : '不限' }} · {{ g.per_user_limit > 0 ? '每人限 ' + g.per_user_limit : '不限购' }}</text>
        </view>
        <text class="goods-row__edit" @click="editGoods(g)">编辑</text>
        <text class="goods-row__del" @click="removeGoods(g)">删除</text>
      </view>

      <view class="af__actions">
        <!-- 按主次区分：新建为主操作，从商品库挑选为次操作，整场照搬为辅助操作 -->
        <button class="af__btn af__btn--primary" size="mini" @click="addGoods">＋ 添加新商品</button>
        <button class="af__btn af__btn--outline" size="mini" @click="reuseGoods">从商品库添加</button>
        <button class="af__btn af__btn--plain" size="mini" @click="reuseActivity">↺ 复用历史接龙</button>
      </view>
      <view class="af__hint">添加新商品＝现填一件；从商品库添加＝从你保存过的商品里挑几件；复用历史接龙＝整场照搬，含活动资料与全部商品</view>
    </view>

    <!-- 本次接龙设置 -->
    <view class="af__block">
      <view class="af__block-title">本次接龙设置</view>
      <!-- 起止时间（D-087）：精确到分钟。已发布且已开始的活动，起始时间只读 -->
      <view class="af__set-row">
        <text class="af__set-k">起始时间</text>
        <view v-if="startLocked" class="af__set-v">{{ startDate }} {{ startTime }}（已开始）</view>
        <view v-else class="af__dt">
          <picker mode="date" :value="startDate" @change="onStartDate"><text class="af__set-v">{{ startDate }}</text></picker>
          <picker mode="time" :value="startTime" @change="onStartTime"><text class="af__set-v af__dt-time">{{ startTime }} ›</text></picker>
        </view>
      </view>
      <view class="af__set-row">
        <text class="af__set-k">截止时间</text>
        <view class="af__dt">
          <picker mode="date" :value="endDate" @change="onEndDate"><text class="af__set-v">{{ endDate || '选择日期' }}</text></picker>
          <picker mode="time" :value="endTime" @change="onEndTime"><text class="af__set-v af__dt-time">{{ endTime }} ›</text></picker>
        </view>
      </view>
      <view class="af__hint">起始时间默认现在；设在以后即为提前发布，开始前参与者能看到活动但不能下单。发布后未开始可改起始时间，开始后不可改。</view>
      <view class="af__set-row">
        <text class="af__set-k">交付方式（可多选）</text>
        <view class="af__radio-group">
          <text class="af__radio" :class="{ 'af__radio--on': hasDelivery(1) }" @click="toggleDelivery(1)">送货上门</text>
          <text class="af__radio" :class="{ 'af__radio--on': hasDelivery(2) }" @click="toggleDelivery(2)">自提</text>
        </view>
      </view>
      <view class="af__hint">至少选一种，发布后不可修改。两种都选时由参与者下单时自己选；自提只收集收货人姓名与电话，不收集地址。</view>

      <!-- 自提点（D-077）：支持自提时填写，告诉参与者「去哪取、何时取、找谁」 -->
      <block v-if="isSelfPick">
        <view class="af__set-row af__set-row--col">
          <text class="af__set-k">自提地址 <text class="af__req">*</text></text>
          <input class="af__input" v-model="form.pickup_address" placeholder="如「XX小区北门快递柜旁」" maxlength="200" />
        </view>
        <view class="af__set-row af__set-row--col">
          <text class="af__set-k">自提时间</text>
          <input class="af__input" v-model="form.pickup_time_desc" placeholder="如「周六 9:00–18:00」" maxlength="100" />
        </view>
        <view class="af__set-row af__set-row--col">
          <text class="af__set-k">现场联系人</text>
          <input class="af__input" v-model="form.pickup_contact_name" placeholder="取货时找谁（选填）" maxlength="20" />
        </view>
        <view class="af__set-row af__set-row--col">
          <text class="af__set-k">联系电话</text>
          <input class="af__input" v-model="form.pickup_contact_mobile" placeholder="取货联系电话（选填）" maxlength="20" />
        </view>
        <view class="af__hint">自提时间指截止后去取货的时段，与上面的接龙截止时间是两回事。自提点发布后仍可修改，改完即时对所有人生效。</view>
      </block>
    </view>

    <!-- tab 页底部有 fixed 的 go-tabbar，按钮栏不能再 fixed 贴底，否则被盖住；改为跟随内容排在末尾 -->
    <view class="af__footer" :class="{ 'af__footer--inline': withTabbar }">
      <button class="af__save" size="default" :loading="saving" @click="saveDraft">保存草稿</button>
      <button class="af__next" size="default" type="primary" :loading="publishing" @click="goPublish">下一步：确认发布</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
// @ts-ignore
import api, { guarded, ensureLogin } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';
// @ts-ignore
import { toItem, pickImages, imageDir, uploadPending } from '@/common/grouporder/upload.js';

const MAX_IMAGES = 9;

const props = defineProps({
  // 有值则为编辑草稿模式；无值为新建
  activityId: { type: String, default: '' },
  // 所在页面底部有 go-tabbar（faqi tab）时为 true：按钮栏不固定在底部，跟随内容
  withTabbar: { type: Boolean, default: false },
});

const form = ref<any>({ title: '', description: '', delivery_types: [1], pickup_address: '', pickup_time_desc: '', pickup_contact_name: '', pickup_contact_mobile: '' });
// 图片 item 见 upload.js；封面最多 1 张
const cover = ref<any[]>([]);
const images = ref<any[]>([]);
const goods = ref<any[]>([]);
const draftId = ref(props.activityId || '');
// 活动创建日期，决定图片的云存储目录
const createDate = ref<number>(0);
// 建草稿幂等键（D-081）：每次新建意图生成一次，建草稿请求的重试复用同一个，reset 时换新
const newCreateKey = () => 'ac_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
let createKey = newCreateKey();
const saving = ref(false);
const publishing = ref(false);

// —— 复制预填（D-091）——
const copySourceId = ref('');
const copySourceTitle = ref('');
const excludedGoods = ref<any[]>([]);
// 已按源预填、但服务端还没有这份活动
const copyMode = computed(() => !!copySourceId.value && !draftId.value);
// 时间戳 ↔ 选择器的「YYYY-MM-DD」「HH:mm」
const pad2 = (n: number) => String(n).padStart(2, '0');
const toDate = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const toTime = (ts: number) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const toTs = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();

// 起始时间（D-087）：新建默认当前时间
const startDate = ref(toDate(Date.now()));
const startTime = ref(toTime(Date.now()));
// 旧活动没有起始时间（视为已开始），不回传，避免被服务端当成「修改已开始活动的起始时间」
const sendStart = ref(true);
// 已发布且已开始：起始时间只读
const startLocked = ref(false);
const endDate = ref('');
const endTime = ref('18:00');

const hasDelivery = (t: number) => form.value.delivery_types.includes(t);
const isSelfPick = computed(() => hasDelivery(2));

/** 「下一步」时的齐全性检查，返回第一条缺失提示；服务端 activitySubmitReview 会再拦一次（D-041、D-077） */
const missingForPublish = () => {
  if (!form.value.title.trim()) return '请填写接龙标题';
  if (!cover.value.length) return '请上传封面图';
  if (!goods.value.length) return '请至少添加一个商品';
  if (isSelfPick.value && !form.value.pickup_address.trim()) return '请填写自提地址';
  if (sendStart.value && startTimestamp() >= endTimestamp()) return '起始时间必须早于截止时间';
  return '';
};

// —— 编辑模式：载入已有草稿 ——
const loadDraft = async () => {
  if (!draftId.value) return;
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: draftId.value }))) || {};
  form.value.title = data.title || '';
  form.value.description = data.description || '';
  form.value.delivery_types = (data.delivery_types && data.delivery_types.length) ? data.delivery_types.slice() : [1];
  form.value.pickup_address = data.pickup_address || '';
  form.value.pickup_time_desc = data.pickup_time_desc || '';
  form.value.pickup_contact_name = data.pickup_contact_name || '';
  form.value.pickup_contact_mobile = data.pickup_contact_mobile || '';
  cover.value = data.cover_image ? [toItem(data.cover_image)] : [];
  images.value = (data.images || []).map(toItem);
  createDate.value = data.create_date || 0;
  goods.value = data.goods || [];
  if (data.end_time) {
    endDate.value = toDate(data.end_time);
    endTime.value = toTime(data.end_time);
  }
  if (data.start_time) {
    startDate.value = toDate(data.start_time);
    startTime.value = toTime(data.start_time);
    sendStart.value = true;
    startLocked.value = !!data.publish_date && Date.now() >= data.start_time;
  } else {
    // 旧活动：草稿可补设起始时间；已发布的视为已开始，只读且不回传
    sendStart.value = !data.publish_date;
    startLocked.value = !!data.publish_date;
  }
};

const startTimestamp = () => toTs(startDate.value, startTime.value);
const onStartDate = (e: any) => { startDate.value = e.detail.value; sendStart.value = true; };
const onStartTime = (e: any) => { startTime.value = e.detail.value; sendStart.value = true; };
const onEndTime = (e: any) => { endTime.value = e.detail.value; };

const endTimestamp = () => {
  if (!endDate.value) {
    // 兜底：默认 3 天后（与 D-067 复制兜底一致的宽松取值）
    return Date.now() + 3 * 24 * 3600 * 1000;
  }
  return toTs(endDate.value, endTime.value);
};

const onEndDate = (e: any) => { endDate.value = e.detail.value; };
const toggleDelivery = (t: number) => {
  // 编辑草稿阶段可改；发布后由服务端拒绝（D-060、D-086）
  const cur = form.value.delivery_types;
  if (cur.includes(t)) {
    if (cur.length === 1) {
      uni.showToast({ title: '至少保留一种交付方式', icon: 'none' });
      return;
    }
    form.value.delivery_types = cur.filter((x: number) => x !== t);
  } else {
    form.value.delivery_types = [...cur, t].sort();
  }
};

// 文字资料；图片要等上传完才有 fileID，由 persist 单独带上
const buildPayload = () => ({
  title: form.value.title.trim(),
  description: form.value.description.trim(),
  delivery_types: form.value.delivery_types,
  end_time: endTimestamp(),
  // 起始时间（D-087）：旧的已发布活动不回传
  ...(sendStart.value && !startLocked.value ? { start_time: startTimestamp() } : {}),
  // 自提点四字段（D-077）。送货上门时服务端会统一清空，这里照传不做判断
  pickup_address: form.value.pickup_address.trim(),
  pickup_time_desc: form.value.pickup_time_desc.trim(),
  pickup_contact_name: form.value.pickup_contact_name.trim(),
  pickup_contact_mobile: form.value.pickup_contact_mobile.trim(),
});

/** 确保草稿已存在，返回 activity_id。加商品 / 复用前调用 */
const ensureDraft = async () => {
  if (draftId.value) return draftId.value;
  if (!form.value.title.trim()) {
    uni.showToast({ title: '请先填写接龙标题', icon: 'none' });
    return '';
  }
  if (!requireLogin()) return '';
  if (copySourceId.value) {
    // 复制预填（D-091）：此刻才按源生成草稿（商品、图片引用、被下架商品剔除均由服务端完成），
    // 表单里改过的资料随后由 persist 覆盖；复制来的价格 / 库存 / 限购为预填值，不强制确认（D-092）
    const data = (await guarded(api.activity.activityCopy({ source_activity_id: copySourceId.value, idempotent_key: createKey }))) || {};
    draftId.value = data.activity_id || '';
    createDate.value = Date.now();
    if (draftId.value) await reloadGoods();
    return draftId.value;
  }
  // 只建文字草稿，不传图：图片留到保存草稿 / 下一步时再上传
  const data = (await guarded(api.activity.activityCreateDraft(Object.assign({ idempotent_key: createKey }, buildPayload())))) || {};
  draftId.value = data.activity_id || '';
  createDate.value = data.create_date || Date.now();
  return draftId.value;
};

/**
 * 商品操作前确保拿到真实商品：复制预填时先生成草稿，再按「名称 + 排序」找到对应的新商品
 * （activityCopy 原样保留名称与 sort）；非复制预填直接用当前商品
 */
const withReal = async (g: any, fn: (real: any) => any) => {
  if (!copyMode.value) return fn(g);
  try {
    const id = await ensureDraft();
    if (!id) return;
  } catch (e) {
    return;
  }
  const real = goods.value.find((x: any) => x.name === g.name && (x.sort || 0) === (g.sort || 0))
    || goods.value.find((x: any) => x.name === g.name);
  if (!real) {
    uni.showToast({ title: '已生成草稿，请再操作一次', icon: 'none' });
    return;
  }
  return fn(real);
};

/** 按源活动预填（D-091）：不生成任何记录；起止时间按 D-067 / D-087 推算 */
const loadCopySource = async (srcId: string) => {
  reset();
  const src = (await guarded(api.activity.activityGetDetail({ activity_id: srcId }))) || {};
  copySourceId.value = srcId;
  copySourceTitle.value = src.title || '';
  form.value.title = src.title || '';
  form.value.description = src.description || '';
  form.value.delivery_types = (src.delivery_types && src.delivery_types.length) ? src.delivery_types.slice() : [1];
  form.value.pickup_address = src.pickup_address || '';
  form.value.pickup_time_desc = src.pickup_time_desc || '';
  form.value.pickup_contact_name = src.pickup_contact_name || '';
  form.value.pickup_contact_mobile = src.pickup_contact_mobile || '';
  // 图片沿用源文件引用，保存时不重新上传（toItem 视为已在云端）
  cover.value = src.cover_image ? [toItem(src.cover_image)] : [];
  images.value = (src.images || []).map(toItem);
  const now = Date.now();
  const base = src.start_time || src.publish_date || src.create_date;
  let duration = (src.end_time || 0) - (base || 0);
  if (!(duration > 0)) duration = 3 * 24 * 3600 * 1000;
  startDate.value = toDate(now);
  startTime.value = toTime(now);
  endDate.value = toDate(now + duration);
  endTime.value = toTime(now + duration);
  const all = src.goods || [];
  // 红线③：被平台下架的商品不复制，预先告知
  goods.value = all.filter((g: any) => g.governance_status !== 1);
  excludedGoods.value = all.filter((g: any) => g.governance_status === 1);
};

/** 最终确认：确保草稿存在 → 上传待传图片 → 整体写回。成功返回 true */
const persist = async () => {
  try {
    const id = await ensureDraft();
    if (!id) return false;
    const dir = imageDir(createDate.value, id);
    uni.showLoading({ title: '上传图片中', mask: true });
    try {
      await uploadPending(cover.value, dir, 'cover');
      await uploadPending(images.value, dir, 'img');
    } catch (e) {
      uni.showModal({ content: '图片上传失败，请重试', showCancel: false });
      return false;
    } finally {
      // 要在写回请求之前关：小程序 loading 与 toast 共用一个层，晚关会把接口的错误提示一起关掉
      uni.hideLoading();
    }
    await guarded(api.activity.activityUpdateDraft(Object.assign({ activity_id: id }, buildPayload(), {
      cover_image: cover.value.length ? cover.value[0].file : null,
      images: images.value.map((it) => it.file),
    })));
    return true;
  } catch (e) {
    /* 统一提示 */
    return false;
  }
};

const saveDraft = async () => {
  saving.value = true;
  try {
    if (await persist()) uni.showToast({ title: '草稿已保存', icon: 'none' });
  } finally {
    saving.value = false;
  }
};

// —— 图片：只记本地路径，不上传 ——
const chooseCover = async () => {
  const picked = await pickImages(1);
  if (picked.length) cover.value = picked;
};
const chooseImages = async () => {
  const picked = await pickImages(MAX_IMAGES - images.value.length);
  images.value = images.value.concat(picked);
};

// —— 子页跳转 ——
// faqi tab 的 onShow 在「切 tab 进入」和「从子页返回」时都会触发，只有前者该重置（D-061）。
// 表单里所有去子页的跳转都走这里打标记，faqi 用 consumeChildReturn 区分两种情况
let leftForChild = false;
/**
 * 写操作前确保已登录。去登录页同样打子页标记：登录完返回发起页时保留已填表单，
 * 不被当作「从其他 tab 切入」而清空（D-061）
 */
const requireLogin = () => {
  if (ensureLogin()) return true;
  leftForChild = true;
  return false;
};
const toChild = (opts: any) => {
  leftForChild = true;
  uni.navigateTo(Object.assign({}, opts, { fail: () => { leftForChild = false; } }));
};

// —— 商品：M-11 ——
const addGoods = async () => {
  const id = await ensureDraft();
  if (!id) return;
  toChild({
    url: '/pages/activity/goods-edit?activity_id=' + id,
    events: { saved: () => reloadGoods() },
  });
};
const editGoods = (g: any) => withReal(g, (real: any) => {
  toChild({
    url: '/pages/activity/goods-edit?activity_id=' + draftId.value + '&goods_id=' + real._id,
    events: { saved: () => reloadGoods() },
  });
});
const removeGoods = (g: any) => {
  uni.showModal({
    title: '删除商品',
    content: `确认从本次接龙中删除「${g.name}」？`,
    success: (r) => {
      if (!r.confirm) return;
      withReal(g, async (real: any) => {
        try {
          await api.activity.goodsDelete({ goods_id: real._id });
          reloadGoods();
        } catch (e) {}
      });
    },
  });
};
const reloadGoods = async () => {
  if (!draftId.value) return;
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: draftId.value }))) || {};
  goods.value = data.goods || [];
};

// —— 从商品库添加 M-28（原名「复用历史商品」）——
const reuseGoods = async () => {
  const id = await ensureDraft();
  if (!id) return;
  toChild({
    url: '/pages/lib/history-goods?activity_id=' + id,
    events: { added: () => reloadGoods() },
  });
};

// —— 复用历史接龙 M-31：选源后切回「发起接龙」预填（D-091），不影响当前草稿 ——
const reuseActivity = () => {
  toChild({ url: '/pages/lib/history-activity' });
};

const goLibManage = () => toChild({ url: '/pages/lib/manage' });

const goPublish = async () => {
  const miss = missingForPublish();
  if (miss) {
    uni.showToast({ title: miss, icon: 'none' });
    return;
  }
  publishing.value = true;
  try {
    if (await persist()) toChild({ url: '/pages/activity/publish?id=' + draftId.value });
  } finally {
    publishing.value = false;
  }
};

/** 供父组件（faqi tab）在每次进入时重置为新建态 */
const reset = () => {
  form.value = { title: '', description: '', delivery_types: [1], pickup_address: '', pickup_time_desc: '', pickup_contact_name: '', pickup_contact_mobile: '' };
  cover.value = [];
  images.value = [];
  createDate.value = 0;
  createKey = newCreateKey();
  goods.value = [];
  draftId.value = '';
  endDate.value = '';
  endTime.value = '18:00';
  startDate.value = toDate(Date.now());
  startTime.value = toTime(Date.now());
  sendStart.value = true;
  startLocked.value = false;
  copySourceId.value = '';
  copySourceTitle.value = '';
  excludedGoods.value = [];
};

/** 本次 onShow 是否由子页返回触发；读取即清除标记 */
const consumeChildReturn = () => {
  const r = leftForChild;
  leftForChild = false;
  return r;
};

/**
 * faqi 从子页返回时调用：保留表单，只刷新商品列表（商品库里改过的内容也能同步）。
 * 若草稿已在发布页提交、不再是草稿，就回到新建态，避免继续编辑一场已提交的活动
 */
const onChildReturn = async () => {
  if (!draftId.value) return;
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: draftId.value }))) || {};
  if (data.status !== undefined && data.status !== 0) {
    reset();
    return;
  }
  goods.value = data.goods || [];
};

defineExpose({ loadDraft, reloadGoods, reset, consumeChildReturn, onChildReturn, loadCopySource });

if (props.activityId) loadDraft();
</script>

<style lang="scss" scoped>
.af { padding: 20rpx; padding-bottom: 180rpx; }
.af--tabbar { padding-bottom: 20rpx; }
.af__field { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.af__label { font-size: 26rpx; color: $go-text; }
.req { color: $go-red; }
.af__input { margin-top: 12rpx; font-size: 30rpx; color: $go-ink; }
.af__label--sub { display: block; margin-top: 24rpx; }
.af__imgs { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 16rpx; }
.af__img { position: relative; width: 160rpx; height: 160rpx; }
.af__img-pic { width: 160rpx; height: 160rpx; border-radius: 8rpx; background: $go-soft; }
.af__img-del { position: absolute; top: -12rpx; right: -12rpx; width: 36rpx; height: 36rpx; line-height: 34rpx; text-align: center; font-size: 28rpx; color: #fff; background: rgba(0, 0, 0, 0.55); border-radius: 50%; }
.af__img-add { width: 160rpx; height: 160rpx; line-height: 160rpx; text-align: center; font-size: 56rpx; color: $go-placeholder; border: 1rpx dashed $go-border; border-radius: 8rpx; }
.af__textarea { margin-top: 12rpx; width: 100%; height: 140rpx; font-size: 28rpx; color: $go-ink; }
.af__block { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.af__block-head { display: flex; align-items: center; justify-content: space-between; }
.af__block-title { font-size: 28rpx; color: $go-ink; font-weight: 600; }
.af__link { font-size: 24rpx; color: $go-primary; }
.goods-row { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid $go-soft; }
.goods-row__main { flex: 1; min-width: 0; }
.goods-row__name { font-size: 28rpx; color: $go-ink; }
.goods-row__meta { display: block; font-size: 22rpx; color: $go-muted; margin-top: 4rpx; }
.af__copy-tip { font-size: 22rpx; color: $go-primary-dark; background: $go-primary-soft; border-radius: 12rpx; padding: 14rpx 18rpx; margin-top: 16rpx; line-height: 1.6; }
.af__pending-tip { font-size: 22rpx; color: $go-orange-text; background: $go-orange-soft; border-radius: 12rpx; padding: 14rpx 18rpx; margin-top: 16rpx; }
.goods-row__edit { font-size: 24rpx; color: $go-primary; padding: 0 12rpx; }
.goods-row__del { font-size: 24rpx; color: $go-red; padding: 0 4rpx; }
.af__actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 20rpx; }
.af__btn { margin: 0; font-size: 24rpx; color: $go-primary; background: $go-primary-soft; }
.af__btn::after { border: none; }
.af__btn--primary { color: #fff; background: $go-primary; font-weight: 600; }
.af__btn--outline { color: $go-primary-dark; background: #fff; border: 2rpx solid $go-primary; }
.af__btn--plain { color: $go-text; background: $go-soft; }
.af__hint { font-size: 22rpx; color: $go-muted; line-height: 1.7; margin-top: 16rpx; }
.af__set-row { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 0; border-bottom: 1rpx solid $go-soft; }
.af__set-k { font-size: 26rpx; color: $go-text; }
.af__set-row--col { flex-direction: column; align-items: stretch; gap: 12rpx; }
.af__req { color: $go-red; }
.af__input { font-size: 26rpx; color: $go-ink; background: $go-soft; border-radius: 8rpx; padding: 16rpx 20rpx; }
.af__dt { display: flex; align-items: center; }
.af__dt-time { margin-left: 16rpx; }
.af__set-v { font-size: 26rpx; color: $go-ink; }
.af__radio-group { display: flex; gap: 16rpx; }
.af__radio { font-size: 24rpx; color: $go-text; padding: 8rpx 24rpx; border: 1rpx solid $go-border; border-radius: 32rpx; }
.af__radio--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.af__footer { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 20rpx; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid $go-line; }
.af__footer--inline { position: static; padding: 8rpx 0 0; background: transparent; border-top: 0; }
.af__save { flex: 1; margin: 0; font-size: 28rpx; background: $go-soft; color: $go-text; }
.af__next { flex: 2; margin: 0; font-size: 28rpx; }
</style>
