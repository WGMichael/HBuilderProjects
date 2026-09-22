<!--
  M-10 创建 / 编辑活动 表单核心（faqi 新建 tab 与 edit 改草稿页共用）

  CLIENT_FRONTEND_BRIEF §4：
    - 「发起接龙」tab 恒为新建态（约束 3）：无 activity_id 进入。
    - 三个并列主按钮：＋添加商品 / ↺复用历史商品 / ↺复用历史接龙。
    - 「管理商品库 ›」是轻量文字链接，不是第四个并列按钮。
  D-060：交付方式发布后不可修改；自提只收姓名+电话，不收地址。

  草稿模型：加商品 / 复用历史商品都需要 activity_id，所以首次执行这类动作前
  先用当前标题创建草稿（activityCreateDraft）拿到 id；之后的商品操作直接落服务端。
-->
<template>
  <view class="af">
    <view class="af__field">
      <text class="af__label">接龙标题 <text class="req">*</text></text>
      <input class="af__input" v-model="form.title" placeholder="给这次接龙起个名字" maxlength="40" />
    </view>

    <view class="af__field">
      <text class="af__label">活动说明（选填）</text>
      <textarea class="af__textarea" v-model="form.description" placeholder="补充说明，所有参与者可见" maxlength="500" />
    </view>

    <!-- 商品列表 -->
    <view class="af__block">
      <view class="af__block-head">
        <text class="af__block-title">商品列表（{{ goods.length }}）</text>
        <text class="af__link" @click="goLibManage">管理商品库 ›</text>
      </view>

      <view v-for="(g, i) in goods" :key="g._id || i" class="goods-row">
        <view class="goods-row__main">
          <text class="goods-row__name">{{ g.name }}</text>
          <text class="goods-row__meta">￥{{ fen2yuan(g.price) }} / {{ g.unit || '份' }} · 库存 {{ g.total_stock > 0 ? g.total_stock : '不限' }}</text>
        </view>
        <text class="goods-row__edit" @click="editGoods(g)">编辑</text>
        <text class="goods-row__del" @click="removeGoods(g)">删除</text>
      </view>

      <view class="af__actions">
        <button class="af__btn" size="mini" @click="addGoods">＋ 添加商品</button>
        <button class="af__btn" size="mini" @click="reuseGoods">↺ 复用历史商品</button>
        <button class="af__btn" size="mini" @click="reuseActivity">↺ 复用历史接龙</button>
      </view>
      <view class="af__hint">复用历史商品＝挑几件；复用历史接龙＝整场照搬，含活动资料与全部商品</view>
    </view>

    <!-- 本次接龙设置 -->
    <view class="af__block">
      <view class="af__block-title">本次接龙设置</view>
      <view class="af__set-row">
        <text class="af__set-k">截止时间</text>
        <picker mode="date" :value="endDate" @change="onEndDate">
          <text class="af__set-v">{{ endDate || '选择日期' }} {{ endTime }} ›</text>
        </picker>
      </view>
      <view class="af__set-row">
        <text class="af__set-k">交付方式</text>
        <view class="af__radio-group">
          <text class="af__radio" :class="{ 'af__radio--on': form.delivery_type === 1 }" @click="setDelivery(1)">送货上门</text>
          <text class="af__radio" :class="{ 'af__radio--on': form.delivery_type === 2 }" @click="setDelivery(2)">自提</text>
        </view>
      </view>
      <view class="af__hint">交付方式发布后不可修改。选「自提」时只收集收货人姓名与电话，不收集地址。</view>
    </view>

    <view class="af__footer">
      <button class="af__save" size="default" :loading="saving" @click="saveDraft">保存草稿</button>
      <button class="af__next" size="default" type="primary" :disabled="!canPublish" @click="goPublish">下一步：确认发布</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const props = defineProps({
  // 有值则为编辑草稿模式；无值为新建
  activityId: { type: String, default: '' },
});

const form = ref<any>({ title: '', description: '', delivery_type: 1, cover_image: null, images: [] });
const goods = ref<any[]>([]);
const draftId = ref(props.activityId || '');
const saving = ref(false);
const endDate = ref('');
const endTime = ref('18:00');

const canPublish = computed(() => !!form.value.title.trim() && goods.value.length > 0 && !!draftId.value);

// —— 编辑模式：载入已有草稿 ——
const loadDraft = async () => {
  if (!draftId.value) return;
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: draftId.value }))) || {};
  form.value.title = data.title || '';
  form.value.description = data.description || '';
  form.value.delivery_type = data.delivery_type || 1;
  form.value.cover_image = data.cover_image || null;
  form.value.images = data.images || [];
  goods.value = data.goods || [];
  if (data.end_time) {
    const d = new Date(data.end_time);
    endDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    endTime.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
};

const endTimestamp = () => {
  if (!endDate.value) {
    // 兜底：默认 3 天后（与 D-067 复制兜底一致的宽松取值）
    return Date.now() + 3 * 24 * 3600 * 1000;
  }
  return new Date(`${endDate.value}T${endTime.value}:00`).getTime();
};

const onEndDate = (e: any) => { endDate.value = e.detail.value; };
const setDelivery = (t: number) => {
  // 编辑草稿阶段可改；发布后由服务端拒绝（D-060）
  form.value.delivery_type = t;
};

const buildPayload = () => ({
  title: form.value.title.trim(),
  description: form.value.description.trim(),
  cover_image: form.value.cover_image,
  images: form.value.images,
  delivery_type: form.value.delivery_type,
  end_time: endTimestamp(),
});

/** 确保草稿已存在，返回 activity_id。加商品 / 复用前调用 */
const ensureDraft = async () => {
  if (draftId.value) return draftId.value;
  if (!form.value.title.trim()) {
    uni.showToast({ title: '请先填写接龙标题', icon: 'none' });
    return '';
  }
  const data = (await guarded(api.activity.activityCreateDraft(buildPayload()))) || {};
  draftId.value = data.activity_id || '';
  return draftId.value;
};

const saveDraft = async () => {
  if (!form.value.title.trim()) {
    uni.showToast({ title: '请先填写接龙标题', icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    if (draftId.value) {
      await guarded(api.activity.activityUpdateDraft(Object.assign({ activity_id: draftId.value }, buildPayload())));
    } else {
      const data = (await guarded(api.activity.activityCreateDraft(buildPayload()))) || {};
      draftId.value = data.activity_id || '';
    }
    uni.showToast({ title: '草稿已保存', icon: 'none' });
  } catch (e) {
    /* 统一提示 */
  } finally {
    saving.value = false;
  }
};

// —— 商品：M-11 ——
const addGoods = async () => {
  const id = await ensureDraft();
  if (!id) return;
  uni.navigateTo({
    url: '/pages/activity/goods-edit?activity_id=' + id,
    events: { saved: () => reloadGoods() },
  });
};
const editGoods = (g: any) => {
  uni.navigateTo({
    url: '/pages/activity/goods-edit?activity_id=' + draftId.value + '&goods_id=' + g._id,
    events: { saved: () => reloadGoods() },
  });
};
const removeGoods = (g: any) => {
  uni.showModal({
    title: '删除商品',
    content: `确认从本次接龙中删除「${g.name}」？`,
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await api.activity.goodsDelete({ goods_id: g._id });
        reloadGoods();
      } catch (e) {}
    },
  });
};
const reloadGoods = async () => {
  if (!draftId.value) return;
  const data = (await guarded(api.activity.activityGetDetail({ activity_id: draftId.value }))) || {};
  goods.value = data.goods || [];
};

// —— 复用历史商品 M-28 ——
const reuseGoods = async () => {
  const id = await ensureDraft();
  if (!id) return;
  uni.navigateTo({
    url: '/pages/lib/history-goods?activity_id=' + id,
    events: { added: () => reloadGoods() },
  });
};

// —— 复用历史接龙 M-31：创建全新草稿，不影响当前 ——
const reuseActivity = () => {
  uni.navigateTo({ url: '/pages/lib/history-activity' });
};

const goLibManage = () => uni.navigateTo({ url: '/pages/lib/manage' });

const goPublish = () => {
  if (!canPublish.value) return;
  uni.navigateTo({ url: '/pages/activity/publish?id=' + draftId.value });
};

/** 供父组件（faqi tab）在每次进入时重置为新建态 */
const reset = () => {
  form.value = { title: '', description: '', delivery_type: 1, cover_image: null, images: [] };
  goods.value = [];
  draftId.value = '';
  endDate.value = '';
  endTime.value = '18:00';
};

defineExpose({ loadDraft, reloadGoods, reset });

if (props.activityId) loadDraft();
</script>

<style lang="scss" scoped>
.af { padding: 20rpx; padding-bottom: 180rpx; }
.af__field { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.af__label { font-size: 26rpx; color: #606266; }
.req { color: #fa3534; }
.af__input { margin-top: 12rpx; font-size: 30rpx; color: #303133; }
.af__textarea { margin-top: 12rpx; width: 100%; height: 140rpx; font-size: 28rpx; color: #303133; }
.af__block { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 16rpx; }
.af__block-head { display: flex; align-items: center; justify-content: space-between; }
.af__block-title { font-size: 28rpx; color: #303133; font-weight: 600; }
.af__link { font-size: 24rpx; color: #2979ff; }
.goods-row { display: flex; align-items: center; padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.goods-row__main { flex: 1; min-width: 0; }
.goods-row__name { font-size: 28rpx; color: #303133; }
.goods-row__meta { display: block; font-size: 22rpx; color: #909399; margin-top: 4rpx; }
.goods-row__edit { font-size: 24rpx; color: #2979ff; padding: 0 12rpx; }
.goods-row__del { font-size: 24rpx; color: #fa3534; padding: 0 4rpx; }
.af__actions { display: flex; flex-wrap: wrap; gap: 16rpx; margin-top: 20rpx; }
.af__btn { margin: 0; font-size: 24rpx; color: #2979ff; background: #e8f3ff; }
.af__hint { font-size: 22rpx; color: #909399; line-height: 1.7; margin-top: 16rpx; }
.af__set-row { display: flex; align-items: center; justify-content: space-between; padding: 20rpx 0; border-bottom: 1rpx solid #f5f5f5; }
.af__set-k { font-size: 26rpx; color: #606266; }
.af__set-v { font-size: 26rpx; color: #303133; }
.af__radio-group { display: flex; gap: 16rpx; }
.af__radio { font-size: 24rpx; color: #606266; padding: 8rpx 24rpx; border: 1rpx solid #dcdfe6; border-radius: 32rpx; }
.af__radio--on { color: #2979ff; border-color: #2979ff; background: #e8f3ff; }
.af__footer { position: fixed; left: 0; right: 0; bottom: 0; display: flex; gap: 20rpx; padding: 20rpx; padding-bottom: calc(20rpx + env(safe-area-inset-bottom)); background: #fff; border-top: 1rpx solid #ececec; }
.af__save { flex: 1; margin: 0; font-size: 28rpx; background: #f5f5f5; color: #606266; }
.af__next { flex: 2; margin: 0; font-size: 28rpx; }
</style>
