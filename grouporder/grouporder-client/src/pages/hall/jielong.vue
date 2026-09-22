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
        <view v-if="!todoLoading && !todoList.length" class="empty">今日暂无待办</view>
        <view v-for="item in todoList" :key="item.todo_key" class="todo" @click="openTodo(item)">
          <view class="todo__tag" :class="'lv' + item.level">{{ levelLabel(item.level) }}</view>
          <view class="todo__body">
            <view class="todo__title">{{ item.title }}</view>
            <view class="todo__desc">{{ item.description }}</view>
          </view>
          <text class="todo__close" @click.stop="dismiss(item)">关闭</text>
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
            </view>
            <view class="card__meta">
              <text v-if="a.end_time">截止 {{ fmtDate(a.end_time) }}</text>
              <text v-if="a.valid_total_qty !== undefined"> · 有效 {{ a.valid_total_qty }} 份</text>
            </view>
          </view>
          <view class="card__side">
            <button class="mini-btn" size="mini" @click.stop="reuse(a)">再来一次</button>
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
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import GoTabbar from '@/components/go-tabbar/go-tabbar.vue';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { ACTIVITY_STATUS, ORDER_STATUS, TODO_LEVEL_LABEL, labelOf, fen2yuan } from '@/common/grouporder/dict.js';

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

const levelLabel = (lv: number) => TODO_LEVEL_LABEL[lv] || '待办';
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

const loadLead = async () => {
  leadLoading.value = true;
  try {
    const data = (await guarded(api.activity.activityMyList({ page: 1, pageSize: 50 }))) || {};
    leadList.value = data.list || [];
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
const reuse = (a: any) => uni.navigateTo({ url: '/pages/lib/history-activity?source=' + a._id });
const openActivity = (id: string) => uni.navigateTo({ url: '/pages/activity/detail?id=' + id });
const openOrder = (id: string) => uni.navigateTo({ url: '/pages/order/detail?id=' + id });

onShow(() => {
  // 每次进入都刷新当前子页 + 待办角标（派生视图，不缓存）
  loadCurrent();
  if (sub.value !== 'todo') loadTodo();
});

onPullDownRefresh(async () => {
  await Promise.resolve(loadCurrent());
  uni.stopPullDownRefresh();
});
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  padding-bottom: 140rpx;
  background: #f4f5f7;
}
.subtabs {
  display: flex;
  background: #fff;
  border-bottom: 1rpx solid #ececec;
  &__item {
    flex: 1;
    text-align: center;
    padding: 24rpx 0;
    font-size: 28rpx;
    color: #606266;
    position: relative;
    &--on {
      color: #2979ff;
      font-weight: 600;
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
    background: #fa3534;
    color: #fff;
    font-size: 18rpx;
    vertical-align: top;
  }
}
.body {
  height: calc(100vh - 240rpx);
  padding: 20rpx;
  box-sizing: border-box;
}
.empty {
  text-align: center;
  color: #909399;
  font-size: 26rpx;
  padding: 120rpx 0;
}
.todo {
  display: flex;
  align-items: flex-start;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  &__tag {
    flex-shrink: 0;
    font-size: 20rpx;
    color: #fff;
    padding: 4rpx 12rpx;
    border-radius: 8rpx;
    margin-right: 16rpx;
    margin-top: 4rpx;
    &.lv1 { background: #fa3534; }
    &.lv2 { background: #f3a73f; }
    &.lv3 { background: #2979ff; }
    &.lv4 { background: #909399; }
  }
  &__body { flex: 1; }
  &__title { font-size: 28rpx; color: #303133; }
  &__desc { font-size: 24rpx; color: #909399; margin-top: 8rpx; }
  &__close { flex-shrink: 0; font-size: 24rpx; color: #c0c4cc; padding: 0 8rpx; }
}
.card {
  display: flex;
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 16rpx;
  &__cover { width: 120rpx; height: 120rpx; border-radius: 12rpx; margin-right: 20rpx; }
  &__main { flex: 1; min-width: 0; }
  &__title { font-size: 30rpx; color: #303133; }
  &__tags { margin: 10rpx 0; }
  &__meta { font-size: 24rpx; color: #909399; }
  &__side { display: flex; align-items: center; }
}
.tag {
  display: inline-block;
  font-size: 20rpx;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  margin-right: 10rpx;
  &--biz { background: #e8f3ff; color: #2979ff; }
  &--gov { background: #fef0f0; color: #fa3534; }
  &--warn { background: #fdf6ec; color: #f3a73f; }
}
.join-order {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 24rpx;
  color: #606266;
  padding: 12rpx 0;
  border-top: 1rpx solid #f5f5f5;
  margin-top: 12rpx;
  &__qty { color: #303133; }
}
.mini-btn {
  margin: 0;
  font-size: 24rpx;
  color: #2979ff;
  background: #e8f3ff;
}
</style>
