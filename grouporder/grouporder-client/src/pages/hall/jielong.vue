<!--
  接龙 tab（大厅）—— 含三个子页，默认「待办事项」（M-27 / M-09 / M-18）

  CLIENT_FRONTEND_BRIEF §4 约束 4：接龙 tab 含三子页，子页切换在 tab 内部完成，
  不是三个独立 tabBar 项；默认落在待办事项。

  M-27 待办：派生视图，条目由云对象按对象状态实时生成（不单独建表），
  「关闭」只记录已读状态并落库（D-062，grouporder-user-co.todoDismiss）。
  ⚠ 交接书 §6 有一条「待办没有关闭按钮（D-070）」与 §3.1 + D-062 + todoDismiss 冲突，
     已按后三者实现，冲突见交付说明。
-->
<template>
  <view class="page">
    <!-- 子页切换 -->
    <view class="subtabs">
      <view v-for="s in subtabs" :key="s.key" class="subtabs__item" :class="{ 'subtabs__item--on': sub === s.key }" @click="switchSub(s.key)">
        {{ s.text }}
        <text v-if="s.key === 'todo' && todoBadge > 0" class="subtabs__badge">{{ todoBadge }}</text>
      </view>
    </view>

    <scroll-view class="body" scroll-y>
      <!-- M-27 待办事项 -->
      <view v-if="sub === 'todo'">
        <!-- 样式按效果图 v3 A 组「今日待办」：事项标签 + 标题 + 说明 + ›，标签颜色按优先级档位 -->
        <view class="section-head">
          <text class="section-head__title">今日待办</text>
          <text class="section-head__meta">按优先级排列</text>
        </view>
        <view v-if="!todoLoading && !todoList.length" class="empty">今日暂无待办</view>
        <view v-for="item in todoList" :key="item.todo_key" class="todo" @click="openTodo(item)">
          <view class="todo__body">
            <text class="todo__tag" :class="'lv' + item.level">{{ todoLabel(item) }}</text>
            <view class="todo__title">{{ item.title }}</view>
            <view v-if="item.description" class="todo__desc">{{ item.description }}</view>
          </view>
          <view class="todo__side">
            <!-- 关闭只记已读（D-062），不改活动数据 -->
            <text class="todo__close" @click.stop="dismiss(item)">关闭</text>
            <text class="todo__chevron">›</text>
          </view>
        </view>
      </view>

      <!-- M-09 我发起的 -->
      <view v-else-if="sub === 'lead'">
        <view v-if="!leadLoading && !leadList.length" class="empty">你还没有发起过接龙</view>
        <view v-for="a in leadList" :key="a._id" class="card" @click="openLead(a)">
          <image v-if="a.cover_image && a.cover_image.url" class="card__cover" :src="a.cover_image.url" mode="aspectFill" />
          <view class="card__main">
            <view class="card__title">{{ a.title }}</view>
            <view class="card__tags">
              <text class="tag tag--biz">{{ labelOf(ACTIVITY_STATUS, a.status) }}</text>
              <text v-if="a.governance_status === 1" class="tag tag--gov">已下架</text>
              <text v-if="a.review_result === 2" class="tag tag--warn">审核不通过</text>
              <!-- 已发布但未到起始时间（D-087）：不新增业务状态，只在这里标出 -->
              <text v-if="a.not_started" class="tag tag--warn">未开始</text>
            </view>
            <view class="card__meta">
              <text v-if="a.not_started">{{ fmtDate(a.start_time) }} 开始 · </text>
              <text v-if="a.end_time">截止 {{ fmtDate(a.end_time) }}</text>
              <text v-if="a.valid_total_qty !== undefined"> · 有效 {{ a.valid_total_qty }} 份</text>
            </view>
          </view>
          <view class="card__side">
            <!-- 只有已截止且未被下架的活动可作为复制源（D-085） -->
            <button v-if="a.status === 3 && a.governance_status !== 1" class="mini-btn" size="mini" @click.stop="reuse(a)">再来一次</button>
            <!-- 从未发布过的草稿可删除（D-090）；发布过的只能取消或截止 -->
            <button v-if="canDeleteDraft(a)" class="mini-btn mini-btn--del" size="mini" @click.stop="deleteDraft(a)">删除</button>
          </view>
        </view>
      </view>

      <!-- M-18 我参与的 -->
      <view v-else>
        <view v-if="!joinLoading && !joinList.length" class="empty">你还没有参与过接龙</view>
        <view v-for="g in joinList" :key="g.activity_id" class="card card--join" @click="openActivity(g.activity_id)">
          <view class="card__main">
            <view class="card__title">{{ g.title || g.activity_id }}</view>
            <view class="card__meta">共 {{ g.orders.length }} 张订单</view>
            <view v-for="o in g.orders" :key="o._id" class="join-order" @click.stop="openOrder(o._id)">
              <text>{{ o.order_no }}</text>
              <text class="join-order__qty">{{ o.total_qty }} 份 · ￥{{ fen2yuan(o.total_amount) }}</text>
              <text class="tag" :class="o.status === 1 ? 'tag--biz' : 'tag--warn'">{{ labelOf(ORDER_STATUS, o.status) }}</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <go-tabbar current="jielong" :badge="todoBadge" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onHide, onUnload, onPullDownRefresh } from '@dcloudio/uni-app';
// @ts-ignore
import { serverOffset, applyLiveStatus, scheduleBoundary } from '@/common/grouporder/activity-time.js';
// @ts-ignore
import { takeHallSub } from '@/common/grouporder/hall.js';
import GoTabbar from '@/components/go-tabbar/go-tabbar.vue';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { canDeleteDraft, confirmDeleteDraft } from '@/common/grouporder/draft.js';
// @ts-ignore
import { ACTIVITY_STATUS, ORDER_STATUS, TODO_LEVEL_LABEL, TODO_TYPE_LABEL, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

const subtabs = [
  { key: 'todo', text: '待办' },
  { key: 'lead', text: '我发起的' },
  { key: 'join', text: '我参与的' },
];
const sub = ref('todo');

const todoList = ref<any[]>([]);
const todoBadge = ref(0);
const todoLoading = ref(false);
const leadList = ref<any[]>([]);
const leadLoading = ref(false);
const joinList = ref<any[]>([]);
const joinLoading = ref(false);

const todoLabel = (item: any) => TODO_TYPE_LABEL[item.type] || TODO_LEVEL_LABEL[item.level] || '待办';
const fmtDate = (ts: number) => (ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const loadTodo = async () => {
  todoLoading.value = true;
  try {
    const data = (await guarded(api.user.todoList())) || {};
    todoList.value = data.list || [];
    // 角标 = 前两档合计（最紧迫的）
    const c = data.count_by_level || {};
    todoBadge.value = (c[1] || 0) + (c[2] || 0);
  } catch (e) {
    todoList.value = [];
  } finally {
    todoLoading.value = false;
  }
};

// —— 起止时间点：页面开着时到点本地重算状态标签，不发请求（common/grouporder/activity-time.js）——
let leadOffset = 0;
let cancelLeadTick = () => {};
const armLeadTick = () => {
  cancelLeadTick();
  cancelLeadTick = scheduleBoundary(leadList.value, leadOffset, () => {
    const now = Date.now() + leadOffset;
    leadList.value = leadList.value.map((a: any) => applyLiveStatus({ ...a }, now));
    armLeadTick();
  });
};

const loadLead = async () => {
  leadLoading.value = true;
  try {
    const data = (await guarded(api.activity.activityMyList({ page: 1, pageSize: 50 }))) || {};
    leadList.value = data.list || [];
    leadOffset = serverOffset(data.asOf);
    armLeadTick();
  } catch (e) {
    leadList.value = [];
  } finally {
    leadLoading.value = false;
  }
};

const loadJoin = async () => {
  joinLoading.value = true;
  try {
    // 我参与的：按订单聚合到活动。orderMyList 返回本人订单，前端按 activity_id 分组
    const data = (await guarded(api.order.orderMyList({ page: 1, pageSize: 100 }))) || {};
    const groups = new Map<string, any>();
    for (const o of data.list || []) {
      if (!groups.has(o.activity_id)) groups.set(o.activity_id, { activity_id: o.activity_id, title: o.activity_title || o.title, orders: [] });
      groups.get(o.activity_id).orders.push(o);
    }
    joinList.value = [...groups.values()];
  } catch (e) {
    joinList.value = [];
  } finally {
    joinLoading.value = false;
  }
};

const loadCurrent = () => {
  if (sub.value === 'todo') loadTodo();
  else if (sub.value === 'lead') loadLead();
  else loadJoin();
};

const switchSub = (key: string) => {
  sub.value = key;
  loadCurrent();
};

const dismiss = async (item: any) => {
  try {
    await api.user.todoDismiss({ todo_key: item.todo_key });
    todoList.value = todoList.value.filter((t) => t.todo_key !== item.todo_key);
  } catch (e) {
    /* 提示已由 client.js 统一处理 */
  }
};

// 待办点进对应对象
const openTodo = (item: any) => {
  const t = item.type;
  if (t === 'activity_offline' || t === 'review_rejected' || t === 'activity_closed_export' || t === 'ending_soon_leader' || t === 'draft_stale') {
    uni.navigateTo({ url: '/pages/activity/manage?id=' + item.object_id });
  } else if (t === 'joined_cancelled' || t === 'joined_offline' || t === 'ending_soon_joiner') {
    uni.navigateTo({ url: '/pages/activity/detail?id=' + item.object_id });
  } else {
    // report_result / appeal_result：进个人中心相应入口
    uni.switchTab({ url: '/pages/hall/my' });
  }
};

const openLead = (a: any) => uni.navigateTo({ url: '/pages/activity/manage?id=' + a._id });
// —— 删除草稿（D-090）：确认、遮罩、提示统一在 common/grouporder/draft.js ——
const deleteDraft = async (a: any) => {
  if (!(await confirmDeleteDraft(a))) return;
  // 先从当前列表移除，立刻看到结果；再向服务端刷新列表与待办（草稿超时提醒随之消失）
  leadList.value = leadList.value.filter((x: any) => x._id !== a._id);
  loadLead();
  loadTodo();
};

const reuse = (a: any) => uni.navigateTo({ url: '/pages/lib/history-activity?source=' + a._id });
const openActivity = (id: string) => uni.navigateTo({ url: '/pages/activity/detail?id=' + id });
const openOrder = (id: string) => uni.navigateTo({ url: '/pages/order/detail?id=' + id });

onShow(() => {
  // 从「我的」统计项等入口指定了子页时，先切过去（hall.js 经缓存中转，读取即清除）
  const target = takeHallSub();
  if (target) sub.value = target;
  // 每次进入都刷新当前子页 + 待办角标（派生视图，不缓存）
  loadCurrent();
  if (sub.value !== 'todo') loadTodo();
});

// 页面隐藏 / 卸载时取消定时器，不在后台跑
onHide(() => cancelLeadTick());
onUnload(() => cancelLeadTick());

onPullDownRefresh(async () => {
  await Promise.resolve(loadCurrent());
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  /* 底部留白避开 fixed 的 go-tabbar，含安全区 */
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  background: $go-canvas;
}
.subtabs {
  display: flex;
  background: #fff;
  border-bottom: 1rpx solid $go-line;
  &__item {
    flex: 1;
    text-align: center;
    padding: 26rpx 0 22rpx;
    font-size: 28rpx;
    color: #8b948f;
    position: relative;
    &--on {
      color: $go-primary-dark;
      font-weight: 700;
      /* 选中下划线（效果图 v3 sub-tabs） */
      &::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: 0;
        transform: translateX(-50%);
        width: 52rpx;
        height: 6rpx;
        border-radius: 6rpx;
        background: $go-primary;
      }
    }
  }
  &__badge {
    display: inline-block;
    min-width: 28rpx;
    height: 28rpx;
    line-height: 28rpx;
    padding: 0 6rpx;
    margin-left: 6rpx;
    border-radius: 14rpx;
    background: $go-red;
    color: #fff;
    font-size: 18rpx;
    vertical-align: top;
  }
}
.body {
  height: calc(100vh - 240rpx);
  padding: 24rpx 32rpx 32rpx;
  box-sizing: border-box;
}
.empty {
  text-align: center;
  color: $go-muted;
  font-size: 26rpx;
  padding: 120rpx 0;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 20rpx 4rpx 20rpx;
  &__title { font-size: 32rpx; font-weight: 700; color: $go-ink; }
  &__meta { font-size: 22rpx; color: $go-muted; }
}
.todo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20rpx;
  background: #fff;
  border: 1rpx solid $go-line;
  border-radius: 32rpx;
  padding: 30rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 8rpx 28rpx rgba(37, 55, 45, 0.03);
  &__body { flex: 1; min-width: 0; }
  /* 档位配色：1 红 / 2 橙 / 3、4 灰（效果图 v3） */
  &__tag {
    display: inline-block;
    font-size: 20rpx;
    font-weight: 600;
    padding: 8rpx 16rpx;
    border-radius: 999rpx;
    &.lv1 { background: $go-red-soft; color: $go-red; }
    &.lv2 { background: $go-orange-soft; color: $go-orange; }
    &.lv3, &.lv4 { background: $go-tag-bg; color: $go-tag-text; }
  }
  &__title { font-size: 30rpx; font-weight: 600; color: $go-ink; margin: 16rpx 0 10rpx; }
  &__desc { font-size: 22rpx; color: $go-muted; line-height: 1.55; }
  &__side { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; align-self: stretch; }
  &__close { font-size: 22rpx; color: $go-placeholder; padding: 4rpx 0 4rpx 16rpx; }
  &__chevron { font-size: 44rpx; line-height: 1; color: #abb4af; }
}
.card {
  display: flex;
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  &__cover { width: 120rpx; height: 120rpx; border-radius: 12rpx; margin-right: 20rpx; }
  &__main { flex: 1; min-width: 0; }
  &__title { font-size: 30rpx; color: $go-ink; }
  &__tags { margin: 10rpx 0; }
  &__meta { font-size: 24rpx; color: $go-muted; }
  &__side { display: flex; align-items: center; }
}
.tag {
  display: inline-block;
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  margin-right: 10rpx;
  &--biz { background: $go-primary-soft; color: $go-primary; }
  &--gov { background: $go-red-soft; color: $go-red; }
  &--warn { background: $go-orange-soft; color: $go-orange; }
}
.join-order {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 24rpx;
  color: $go-text;
  padding: 12rpx 0;
  border-top: 1rpx solid $go-soft;
  margin-top: 12rpx;
  &__qty { color: $go-ink; }
}
.mini-btn {
  margin: 0;
  font-size: 24rpx;
  color: $go-primary;
  background: $go-primary-soft;
}
.mini-btn--del { color: $go-red; background: $go-red-soft; }
</style>
