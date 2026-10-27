<!--
  接龙记录（M-20「接龙记录」tab，D-115）

  有效订单列表。卡片只展示（D-116）：下单账号与时间、收款 / 取货状态、「接龙码：xxxx」与商品；核销（D-100 团长记录）与
  作废在点进去的 M-36 订单详情里做，M-36 操作成功后发 uni.$emit('go-order-updated')，这里就地更新该行，
  返回时不整页重载（保留滚动位置）。
  子 tab：全部 / 未收款 / 未取货（计数由 orderLeaderList 第一页给出）。
  搜索：在服务端查本活动的全部有效订单（不限于已加载的页），4 位数字按接龙码精确或电话尾号匹配，
  其他按收货人姓名匹配（filters.keyword）；点「查询」或键盘搜索键触发，输入满 4 位数字时自动查，清空即恢复。
  已取消 / 已作废的订单在「统计」tab 底部查看。
  分页：由所在页面的 onReachBottom 调 loadMore()。
  一键收款 / 一键取货（D-153）：把本活动所有未标记的有效订单一次标为已收款 / 已取货，二次确认后执行；不提供一键撤销。
-->
<template>
  <view class="rec">
    <view class="search">
      <view class="search__box">
        <uni-icons type="search" size="16" color="#b5bdb9" />
        <input class="search__in" v-model="keyword" placeholder="输入接龙码 / 姓名 / 电话尾号" confirm-type="search" @confirm="search" @input="onInput" />
        <text v-if="keyword" class="search__clear" @click="clearKeyword">✕</text>
      </view>
      <button class="search__btn" size="mini" @click="search">查询</button>
    </view>
    <view v-if="searched" class="search__hint">「{{ searched }}」的查询结果：{{ total }} 单</view>

    <view class="subs">
      <text v-for="t in subTabs" :key="t.v" class="subs__i" :class="{ 'subs__i--on': mark === t.v }" @click="switchMark(t.v)">{{ t.text }} {{ countOf(t.v) }}</text>
    </view>
    <view v-if="canMark" class="note">点订单可标记收款、取货（只是你自己的记录，平台不收款）。</view>
    <view v-if="canMark" class="bulk">
      <text class="bulk__btn" :class="{ 'bulk__btn--dis': !counts.unpaid || bulking }" @click="markAll('paid')">一键收款{{ counts.unpaid ? '（' + counts.unpaid + ' 单）' : '' }}</text>
      <text class="bulk__btn" :class="{ 'bulk__btn--dis': !counts.undelivered || bulking }" @click="markAll('delivered')">一键取货{{ counts.undelivered ? '（' + counts.undelivered + ' 单）' : '' }}</text>
    </view>

    <!-- 卡片（D-116）：①下单账号 · 下单时间 ②收款 / 取货状态 ③接龙码（即接龙码）④商品；右上交付方式；点卡片进 M-36 管理 -->
    <view v-for="o in orders" :key="o._id" class="o" hover-class="o--hover" @click="openDetail(o)">
      <text class="o__dlv" :class="o.delivery_type === 2 ? 'o__dlv--pick' : 'o__dlv--home'">{{ labelOf(DELIVERY_TYPE, o.delivery_type) }}</text>
      <view class="o__l1"><text class="o__who">{{ o.buyer_name || o.consignee_name }}</text><text class="o__time">{{ fmtDateTime(o.create_date) }}</text></view>
      <view class="o__marks">
        <text class="st" :class="{ 'st--on': o.leader_paid }">{{ o.leader_paid ? '已收款' : '未收款' }}</text>
        <text class="st" :class="{ 'st--on': o.leader_delivered }">{{ o.leader_delivered ? '已取货' : '未取货' }}</text>
        <text v-if="o.paid_amount_changed" class="st st--warn">金额有变</text>
      </view>
      <view v-if="o.order_code" class="o__l3">接龙码：<text class="o__code">{{ o.order_code }}</text></view>
      <view class="o__l3 o__goods">{{ (o.items || []).map(it => it.goods_name + '×' + it.qty + (it.unit || '')).join('、') }}</view>
      <text class="o__a">›</text>
    </view>

    <view v-if="!orders.length && !loading" class="empty">{{ searched ? '没有找到匹配的订单' : mark ? '没有符合条件的订单' : '还没有人接龙' }}</view>
    <view v-if="orders.length" class="foot">{{ loading ? '加载中…' : orders.length < total ? '上滑加载更多' : '没有更多了' }}</view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { DELIVERY_TYPE, labelOf } from '@/common/grouporder/dict.js';
// @ts-ignore
import { fmtDateTime } from '@/common/grouporder/activity-time.js';

const props = defineProps({
  activityId: { type: String, default: '' },
  // 活动业务状态：已取消（4）不再记录收款取货；已结束（3）才可作废
  activityStatus: { type: Number, default: 0 },
  // 初始子 tab：'' 全部 / 'unpaid' / 'undelivered'（团长统计「待处理」进入时预选）
  initialMark: { type: String, default: '' },
});
const emit = defineEmits(['changed']);

const subTabs = [
  { v: '', text: '全部' },
  { v: 'unpaid', text: '未收款' },
  { v: 'undelivered', text: '未取货' },
];
const mark = ref(props.initialMark === 'unpaid' || props.initialMark === 'undelivered' ? props.initialMark : '');
const keyword = ref('');
const orders = ref<any[]>([]);
const total = ref(0);
const counts = ref<any>({});
const loading = ref(false);
const canMark = computed(() => props.activityStatus !== 4);
const countOf = (v: string) => {
  const c = counts.value;
  const n = v === 'unpaid' ? c.unpaid : v === 'undelivered' ? c.undelivered : c.all;
  return typeof n === 'number' ? n : '';
};

const PAGE_SIZE = 20;
let page = 0;
let seq = 0;

const load = async (more = false) => {
  if (!props.activityId) return;
  if (more && (loading.value || orders.value.length >= total.value)) return;
  const my = ++seq;
  const next = more ? page + 1 : 1;
  loading.value = true;
  try {
    const filters: any = { status: 1 };
    if (mark.value === 'unpaid') filters.leader_paid = 0;
    if (mark.value === 'undelivered') filters.leader_delivered = 0;
    const kw = keyword.value.trim();
    if (kw) filters.keyword = kw;
    const data = (await guarded(api.order.orderLeaderList({ activity_id: props.activityId, page: next, pageSize: PAGE_SIZE, filters }))) || {};
    if (my !== seq) return;
    const list = data.list || [];
    orders.value = more ? orders.value.concat(list) : list;
    total.value = data.total || 0;
    if (data.counts) counts.value = data.counts;
    if (!more) searched.value = kw;
    page = next;
  } catch (e) {
    if (my === seq && !more) { orders.value = []; total.value = 0; }
  } finally {
    if (my === seq) loading.value = false;
  }
};
const reload = () => {
  if (skipNextReload) { skipNextReload = false; return; }
  load(false);
};
const loadMore = () => load(true);
const switchMark = (v: string) => {
  if (mark.value === v) return;
  mark.value = v;
  load(false);
};
// 输入 4 位数字（接龙码 / 电话尾号）时直接查，不用再点搜索；清空时恢复全部
let inputTimer: any = null;
const onInput = () => {
  clearTimeout(inputTimer);
  const kw = keyword.value.trim();
  if (!kw || /^\d{4}$/.test(kw)) inputTimer = setTimeout(reload, 300);
};
// 当前生效的查询词：列表展示的是它的结果（输入框里改了但没点查询时不变）
const searched = ref('');
const search = () => { clearTimeout(inputTimer); skipNextReload = false; load(false); };
const clearKeyword = () => { keyword.value = ''; search(); };

// —— 一键收款 / 取货（D-153）——
const bulking = ref(false);
const markAll = (kind: 'paid' | 'delivered') => {
  const n = kind === 'paid' ? counts.value.unpaid : counts.value.undelivered;
  if (!n || bulking.value) return;
  const what = kind === 'paid' ? '已收款' : '已取货';
  uni.showModal({
    title: kind === 'paid' ? '一键收款' : '一键取货',
    content: `把本活动 ${n} 单${kind === 'paid' ? '未收款' : '未取货'}的订单全部标记为「${what}」？只是你自己的记录；如需撤销，要进订单逐单操作。`,
    success: async (r) => {
      if (!r.confirm) return;
      bulking.value = true;
      try {
        const res = (await guarded(api.order.orderLeaderMarkAll({ activity_id: props.activityId, mark: kind }))) || {};
        uni.showToast({ title: `已标记 ${res.marked || 0} 单为${what}`, icon: 'none' });
        load(false); // 重新拉第一页与计数
      } catch (e) {} finally { bulking.value = false; }
    },
  });
};

// —— 订单详情（D-116）——
// 进详情后返回时，M-20 的 onShow 会调 reload；这里跳过那一次，靠事件就地更新，保留列表与滚动位置
let skipNextReload = false;
const openDetail = (o: any) => {
  skipNextReload = true;
  uni.navigateTo({ url: '/pages/activity/order-manage?id=' + o._id, fail: () => { skipNextReload = false; } });
};
const onOrderUpdated = (u: any) => {
  const i = orders.value.findIndex((x) => x._id === u._id);
  if (i < 0) return;
  const old = orders.value[i];
  const c = counts.value;
  // 不再有效（作废）就移出列表，并修正计数
  if (u.status !== 1) {
    orders.value.splice(i, 1);
    total.value = Math.max(0, total.value - 1);
    if (typeof c.all === 'number') c.all = Math.max(0, c.all - 1);
    if (!old.leader_paid && typeof c.unpaid === 'number') c.unpaid = Math.max(0, c.unpaid - 1);
    if (!old.leader_delivered && typeof c.undelivered === 'number') c.undelivered = Math.max(0, c.undelivered - 1);
    emit('changed');
    return;
  }
  if (!!old.leader_paid !== !!u.leader_paid && typeof c.unpaid === 'number') c.unpaid = Math.max(0, c.unpaid + (u.leader_paid ? -1 : 1));
  if (!!old.leader_delivered !== !!u.leader_delivered && typeof c.undelivered === 'number') c.undelivered = Math.max(0, c.undelivered + (u.leader_delivered ? -1 : 1));
  Object.assign(old, {
    leader_paid: u.leader_paid, leader_paid_time: u.leader_paid_time, leader_paid_amount: u.leader_paid_amount,
    paid_amount_changed: u.paid_amount_changed, leader_delivered: u.leader_delivered, leader_delivered_time: u.leader_delivered_time,
  });
};
onMounted(() => uni.$on('go-order-updated', onOrderUpdated));
onUnmounted(() => uni.$off('go-order-updated', onOrderUpdated));

// 挂载即加载第一页（由 M-20 首次切到本 tab 时挂载）
onMounted(reload);

// changed 只在订单被作废（M-36 发回的状态不再有效）后发出：作废会改变接龙数
defineExpose({ reload, loadMore });
</script>

<style lang="scss" scoped>
.rec { padding: 16rpx 24rpx 24rpx; }
.search { display: flex; align-items: center; gap: 16rpx; }
.search__box { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12rpx; background: #fff; border: 1rpx solid $go-line; border-radius: 40rpx; padding: 12rpx 24rpx; }
.search__btn { margin: 0; border-radius: 40rpx; background: $go-primary; color: #fff; font-size: 26rpx; padding: 0 32rpx; line-height: 68rpx; }
.search__btn::after { border: none; }
.search__hint { font-size: 22rpx; color: $go-muted; margin-top: 12rpx; }
.search__in { flex: 1; font-size: 26rpx; color: $go-ink; height: 48rpx; }
.search__clear { font-size: 24rpx; color: $go-placeholder; padding: 0 4rpx; }
.subs { display: flex; gap: 16rpx; margin: 20rpx 0 8rpx; }
.subs__i { font-size: 24rpx; color: $go-text; padding: 6rpx 22rpx; border: 1rpx solid $go-border; border-radius: 32rpx; background: #fff; }
.subs__i--on { color: $go-primary; border-color: $go-primary; background: $go-primary-soft; }
.note { font-size: 22rpx; color: $go-muted; margin-bottom: 8rpx; }
.bulk { display: flex; gap: 16rpx; margin: 8rpx 0 4rpx; }
.bulk__btn { flex: 1; text-align: center; font-size: 25rpx; padding: 14rpx 0; border-radius: 16rpx; color: $go-primary-dark; background: $go-primary-soft; border: 1rpx solid $go-primary; }
.bulk__btn--dis { color: $go-placeholder; background: $go-soft; border-color: $go-line; }
.o { position: relative; background: #fff; border-radius: 20rpx; padding: 20rpx 64rpx 20rpx 24rpx; margin-top: 16rpx; }
.o--hover { background: $go-soft; }
/* 交付方式角标：实色底白字，自提主色、送货上门橙色，一眼可分 */
.o__dlv { position: absolute; top: 0; right: 0; font-size: 22rpx; font-weight: 600; color: #fff; padding: 6rpx 20rpx; border-radius: 0 20rpx 0 20rpx; letter-spacing: 1rpx; }
.o__dlv--pick { background: $go-primary; }
.o__dlv--home { background: $go-orange; }
.o__l1 { display: flex; align-items: baseline; gap: 16rpx; padding-right: 80rpx; }
.o__who { font-size: 28rpx; color: $go-ink; font-weight: 600; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.o__time { font-size: 22rpx; color: $go-muted; }
.o__marks { display: flex; gap: 12rpx; margin-top: 12rpx; }
.st { font-size: 20rpx; padding: 2rpx 14rpx; border-radius: 8rpx; background: $go-tag-bg; color: $go-tag-text; }
.st--on { background: $go-primary-soft; color: $go-primary; }
.st--warn { background: $go-orange-soft; color: $go-orange-text; }
.o__l3 { font-size: 24rpx; color: $go-text; margin-top: 12rpx; line-height: 1.5; }
.o__code { color: $go-primary-dark; font-weight: 700; letter-spacing: 2rpx; }
.o__goods { margin-top: 6rpx; }
.o__a { position: absolute; right: 24rpx; top: 50%; transform: translateY(-50%); font-size: 30rpx; color: $go-placeholder; }
.empty { text-align: center; color: $go-muted; font-size: 26rpx; padding: 80rpx 0; }
.foot { text-align: center; font-size: 22rpx; color: $go-muted; padding: 24rpx 0 8rpx; }
</style>
