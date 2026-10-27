<!--
  M-20 团长活动管理（团长侧枢纽页）

  D-115 改版：
  - 草稿：标题区 + 一个大按钮「继续编辑草稿」（从未发布过的可「删除草稿」，D-090）；商品与发布都在编辑页完成。
  - 其他状态：标题区（标题行右侧「⋯」菜单 + 截止 / 取消按钮）、接龙数、分享，下面三个 tab：
    接龙记录（go-order-records：全部 / 未收款 / 未取货、接龙码搜索、核销）、商品（go-goods-panel）、统计（go-stat-panel）。
    「⋯」菜单：编辑活动（D-120）、发布预览（审核中为「发布预览 / 撤回审核」）、修改自提点。
  - 路由参数 tab=records|goods|stat、mark=unpaid|undelivered（团长统计「待处理」进入时预选）。
  红线⑦：业务状态与治理状态分列。红线⑧：统计只用白名单指标。
-->
<template>
  <!-- 商品 tab 拖动排序时锁住页面滚动（D-124）；page-meta 必须是页面第一个节点 -->
  <page-meta :page-style="goodsDragging ? 'overflow: hidden;' : ''" />
  <go-result v-if="loadFailed" type="unknown" detail="页面加载失败，请检查网络后重试" @retry="load" />
  <view class="page" v-if="loaded">
    <!-- 菜单打开时的透明遮罩：点任意处收起 -->
    <view v-if="menuOpen" class="pop-mask" @click="menuOpen = false" @touchmove.stop.prevent="menuOpen = false" />
    <!-- 标题区（D-110、D-111、D-123）：第一行 = 标题 + 紧跟的状态标签（左）、「⋯」操作菜单（最右，含结束 / 取消活动）；
         活动码可复制；时间段用完整日期 -->
    <view class="head">
      <view class="head__row">
        <view class="head__main">
          <text class="head__title">{{ act.title }}</text>
          <text class="tag tag--biz">{{ labelOf(ACTIVITY_STATUS, act.status) }}</text>
          <text v-if="act.not_started" class="tag tag--warn">未开始</text>
          <text v-if="act.governance_status === 1" class="tag tag--gov">已下架</text>
          <text v-if="act.review_result === 2" class="tag tag--warn">审核不通过</text>
        </view>
        <!-- 「⋯」小菜单（D-121、D-123）：活动的全部操作（含结束 / 取消活动）都在这里；按钮做成显眼的圆角块 -->
        <view v-if="menuItems.length" class="more">
          <text class="head__more" @click.stop="menuOpen = !menuOpen">⋯</text>
          <view v-if="menuOpen" class="pop">
            <view v-for="it in menuItems" :key="it.text" class="pop__i" :class="{ 'pop__i--danger': it.danger }" hover-class="pop__i--hover" @click.stop="pickMenu(it)">{{ it.text }}</view>
          </view>
        </view>
      </view>
      <view class="head__meta head__code" v-if="act.short_code">活动码：<text class="head__code-v">{{ act.short_code }}</text><text class="head__copy" @click="copyCode">复制</text></view>
      <view class="head__meta" v-if="act.end_time">{{ timeRange(act.start_time, act.end_time) }}</view>
      <view class="head__meta" v-if="(act.delivery_types || []).length">{{ deliveryText(act.delivery_types) }}</view>
      <view class="head__reason" v-if="act.governance_status === 1 && act.governance_reason">下架原因：{{ act.governance_reason }}</view>
    </view>

    <!-- 草稿（D-115）：只给一个大按钮；商品与发布都在编辑页里完成 -->
    <block v-if="act.status === 0">
      <view class="draft-tip">{{ act.review_result === 2 ? '审核未通过，请按原因修改后重新提交。' : act.publish_date ? '活动已撤回成草稿，参与者暂时看不到。' : '草稿未发布，参与者看不到。继续编辑完成后提交审核。' }}</view>
      <button class="draft-btn" type="primary" @click="edit">继续编辑草稿</button>
      <!-- 从未发布过的草稿可删除（D-090）；发布过的只能取消 -->
      <view v-if="canDeleteDraft" class="draft-del" @click="deleteDraft">删除草稿</view>
    </block>

    <block v-else>
      <!-- 接龙数（D-114）：只留一行有效订单数，只展示不可点 -->
      <view class="stat-line" v-if="act.stat">
        <uni-icons type="staff" size="16" color="#168a55" />
        <text class="stat-line__t">接龙数：<text class="stat-line__n">{{ act.stat.valid_order_count || 0 }}</text></text>
      </view>

      <!-- 便捷分享（效果图 share-mockup A 组，D-112）：进行中且未下架才显示。
           「分享到微信」打开分享弹窗；「生成海报」并列（仅 H5，小程序待小程序码），两者都会先复核活动状态 -->
      <view v-if="canShare" class="share-row">
        <button class="share-cta" @click="openShare">分享到微信<text class="share-cta__sub">{{ shareSub }}</text></button>
        <!-- #ifdef H5 -->
        <button class="share-cta share-cta--ghost" @click="openPoster">生成海报<text class="share-cta__sub">保存图片发朋友圈</text></button>
        <!-- #endif -->
      </view>

      <!-- 三个 tab（D-115），吸顶；面板首次切到时才挂载，之后切换只隐藏不销毁（保留滚动加载的列表） -->
      <view class="tabs">
        <text v-for="t in tabs" :key="t.v" class="tabs__i" :class="{ 'tabs__i--on': tab === t.v }" @click="switchTab(t.v)">{{ t.text }}</text>
      </view>
      <go-order-records v-if="mounted.records" v-show="tab === 'records'" ref="recordsRef" :activity-id="activityId" :activity-status="act.status" :initial-mark="initialMark" @changed="onRecordsChanged" />
      <go-goods-panel v-if="mounted.goods" v-show="tab === 'goods'" :act="act" @changed="load" @dragging="(v) => (goodsDragging = v)" />
      <go-stat-panel v-if="mounted.stat" v-show="tab === 'stat'" ref="statRef" :activity-id="activityId" :pickup-address="act.pickup_address || ''" />
    </block>

    <go-share-sheet ref="shareSheet" @ready="onShareReady" />

    <!-- 授权复制（D-155）：转发链接给他人，对方打开后可一键发布一模一样的接龙 -->
    <uni-popup ref="copyPopup" type="bottom">
      <view class="cp">
        <view class="cp__title">授权他人复制这个接龙</view>
        <view class="cp__desc">把链接发给对方，对方打开后可以<text class="cp__b">一键发布一个一模一样的接龙</text>（内容完整复制，包括商品、价格、库存、限购和自提点），以对方的身份发布，订单与统计和你无关。随时可以取消授权，取消后链接立即失效。</view>
        <!-- #ifdef MP-WEIXIN -->
        <button class="cp__btn" type="primary" open-type="share" data-kind="copy">转发给微信好友 / 群</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view class="cp__link">{{ copyUrl }}</view>
        <button class="cp__btn" type="primary" @click="copyLink">复制链接</button>
        <!-- #endif -->
        <view class="cp__ops">
          <text class="cp__revoke" @click="revokeCopy">取消授权</text>
          <text class="cp__close" @click="closeCopy">关闭</text>
        </view>
      </view>
    </uni-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import GoResult from '@/components/go-result/go-result.vue';
import { onLoad, onShow, onHide, onUnload, onShareAppMessage, onReachBottom } from '@dcloudio/uni-app';
// @ts-ignore
import { serverOffset, scheduleBoundary, timeRange } from '@/common/grouporder/activity-time.js';
// @ts-ignore
import { safeBack, backTo } from '@/common/grouporder/nav.js';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { canDeleteDraft as canDelete, confirmDeleteDraft } from '@/common/grouporder/draft.js';
// @ts-ignore
import { ACTIVITY_STATUS, deliveryText, labelOf } from '@/common/grouporder/dict.js';
import GoShareSheet from '@/components/go-share-sheet/go-share-sheet.vue';
import GoOrderRecords from '@/components/go-order-records/go-order-records.vue';
import GoGoodsPanel from '@/components/go-goods-panel/go-goods-panel.vue';
import GoStatPanel from '@/components/go-stat-panel/go-stat-panel.vue';

const activityId = ref('');
const act = ref<any>({});
const loaded = ref(false);

// 复制活动码（D-104 / D-110）：参与者可在「我参与的」按码查找
const copyCode = () => {
  if (!act.value.short_code) return;
  uni.setClipboardData({ data: act.value.short_code, success: () => uni.showToast({ title: '活动码已复制', icon: 'none' }) });
};


// —— 三个 tab（D-115）——
const tabs = [
  { v: 'records', text: '接龙记录' },
  { v: 'goods', text: '商品' },
  { v: 'stat', text: '统计' },
];
const tab = ref('records');
const goodsDragging = ref(false);
const initialMark = ref('');
// 面板首次切到时才挂载（各自会发请求），之后只隐藏
const mounted = reactive<Record<string, boolean>>({ records: false, goods: false, stat: false });
const recordsRef = ref<any>(null);
const statRef = ref<any>(null);
const switchTab = (v: string) => {
  tab.value = v;
  if (!mounted[v]) mounted[v] = true;
  // 切回统计时刷新（核销后单数会变）；接龙记录切回不重载，保留已加载的列表与滚动位置
  else if (v === 'stat') refreshPanel(v);
};
const refreshPanel = (v: string) => {
  if (v === 'records' && recordsRef.value) recordsRef.value.reload();
  if (v === 'stat' && statRef.value) statRef.value.reload();
};
// 作废后：接龙数与统计变化，刷新标题区；统计面板下次切到时刷新
const onRecordsChanged = () => load();
onReachBottom(() => {
  if (tab.value === 'records' && recordsRef.value) recordsRef.value.loadMore();
  // 统计 tab 的接龙明细同样分页（D-126）
  if (tab.value === 'stat' && statRef.value) statRef.value.loadMore();
});

// —— 「⋯」菜单（D-115、D-120、D-121）：编辑活动、发布预览、修改自提点，末尾是结束 / 取消活动（与标题行按钮同一操作）——
const menuOpen = ref(false);
const menuItems = computed(() => {
  const a = act.value;
  const items: { text: string; run: () => void; danger?: boolean }[] = [];
  // 编辑活动（D-120）：审核中 / 进行中且未被下架；延长截止时间、改自提点不重新审核，改标题说明图片会重新审核
  if ((a.status === 1 || a.status === 2) && a.governance_status !== 1) items.push({ text: '编辑活动', run: editPublished });
  // 入口是 M-12 发布预览（参与者视角预览；审核中还能在那里撤回审核）
  if (a.status === 1) items.push({ text: '发布预览 / 撤回审核', run: publish });
  else if (a.status === 2) items.push({ text: '发布预览', run: publish });
  // 自提点发布后可改、即时生效、不重新审核（D-077）；已取消的活动无履约可言
  if (a.status !== 0 && a.status !== 4 && (a.delivery_types || []).includes(2)) items.push({ text: '修改自提点', run: pickupEdit });
  // 授权复制（D-155）：审核通过（进行中 / 已结束）且未被下架
  if ((a.status === 2 || a.status === 3) && a.governance_status !== 1) items.push({ text: a.copy_token ? '授权复制（已开启）' : '授权复制', run: openCopyAuth });
  if (headAction.value) items.push({ text: headAction.value.text, run: closeOrCancel, danger: true });
  return items;
});
const pickMenu = (it: any) => {
  menuOpen.value = false;
  it.run();
};

// —— 分享（SHARE_SPEC §5，M-20）——
// 进行中且未被平台下架才给入口；卡片内容同步返回，故预先取好（§4.3）
const shareEntry = ref<any>(null);
/**
 * 结束 / 取消活动（D-111；D-123 起只在「⋯」菜单里）：已开始的进行中活动只能「截止」；开始前（已通过但未到起始时间、
 * 发布过又撤回成草稿）只能「取消」；审核中可「截止」（服务端不允许审核中取消，可先撤回审核）。
 * 其余状态（未发布的草稿走删除、已结束、已取消）不显示
 */
const headAction = computed(() => {
  const a = act.value;
  // 操作名称叫「结束活动」（D-121）；结束后的业务状态仍称「已结束」
  if (a.status === 2) return a.not_started ? { mode: 'cancel', text: '取消活动' } : { mode: 'close', text: '结束活动' };
  if (a.status === 1) return { mode: 'close', text: '结束活动' };
  if (a.status === 0 && a.publish_date) return { mode: 'cancel', text: '取消活动' };
  return null;
});
const canShare = computed(() => act.value.status === 2 && act.value.governance_status === 0);

const loadShareEntry = async () => {
  if (!canShare.value) { shareEntry.value = null; return; }
  try {
    shareEntry.value = await guarded(
      api.activity.activityGetShareEntry({ activity_id: activityId.value }),
      { silent: true }
    );
  } catch (e) {
    shareEntry.value = null;
  }
};

// 分享弹窗：复核通过后由组件给出卡片内容，onShareAppMessage 优先用它（必须同步返回）
const shareSheet = ref<any>(null);
const shareCard = ref<any>(null);
const openShare = () => shareSheet.value && shareSheet.value.open({ _id: activityId.value });
const openPoster = () => shareSheet.value && shareSheet.value.openPoster({ _id: activityId.value });
// 「分享到微信」副标题：小程序是原生转发，H5 是复制链接（D-095）
let shareSub = '复制链接发给好友';
// #ifdef MP-WEIXIN
shareSub = '转发给微信好友或群';
// #endif
const onShareReady = (c: any) => { shareCard.value = c; };

// —— 授权复制（D-155）——
const copyPopup = ref<any>(null);
const copyToken = ref('');
const copyPath = computed(() => '/pages/activity/copy?token=' + copyToken.value);
// H5：按当前页面地址拼（hash 路由），同 go-share-sheet
const copyUrl = computed(() => {
  let base = '';
  // #ifdef H5
  base = location.origin + location.pathname;
  // #endif
  return base + '#' + copyPath.value;
});
const openCopyAuth = async () => {
  try {
    const r = (await guarded(api.activity.activityCopyAuthorize({ activity_id: activityId.value, enable: true }))) || {};
    copyToken.value = r.copy_token || '';
    if (!copyToken.value) return;
    act.value = Object.assign({}, act.value, { copy_token: copyToken.value });
    copyPopup.value && copyPopup.value.open();
  } catch (e) {}
};
const closeCopy = () => copyPopup.value && copyPopup.value.close();
const copyLink = () => {
  uni.setClipboardData({ data: '复制接龙丨' + (act.value.title || '') + '\n' + copyUrl.value, success: () => uni.showToast({ title: '链接已复制，发给对方即可', icon: 'none' }) });
};
const revokeCopy = () => {
  uni.showModal({
    title: '取消授权',
    content: '取消后，已发出去的复制链接立即失效；对方已经复制发布的接龙不受影响。',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await guarded(api.activity.activityCopyAuthorize({ activity_id: activityId.value, enable: false }));
        copyToken.value = '';
        act.value = Object.assign({}, act.value, { copy_token: '' });
        closeCopy();
        uni.showToast({ title: '已取消授权', icon: 'none' });
      } catch (e) {}
    },
  });
};

onShareAppMessage((res: any) => {
  // 授权复制面板里的转发按钮：卡片指向复制落地页
  const kind = res && res.from === 'button' && res.target && res.target.dataset ? res.target.dataset.kind : '';
  if (kind === 'copy' && copyToken.value) {
    return {
      title: '复制接龙丨' + (act.value.title || ''),
      path: copyPath.value,
      imageUrl: (act.value.cover_image && act.value.cover_image.url) || '',
    };
  }
  if (shareCard.value) return shareCard.value;
  // 右上角菜单直接转发时不经弹窗，用页面加载时预取的复核结果
  const e = shareEntry.value || {};
  return {
    title: e.title ? '接龙丨' + e.title : act.value.title || '',
    path: '/pages/activity/detail?id=' + activityId.value,
    imageUrl: (e.cover_image && e.cover_image.url) || '',
  };
});

const loadInner = async () => {
  if (!activityId.value) return;
  const prevStatus = loaded.value ? act.value.status : undefined;
  act.value = (await guarded(api.activity.activityGetDetail({ activity_id: activityId.value }))) || {};
  await loadShareEntry();
  loaded.value = true;
  if (act.value.status !== 0 && !mounted[tab.value]) mounted[tab.value] = true;
  // 活动状态变了（结束 / 取消 / 到点自动截止）：已挂载的面板各自拉的数据也要刷新，
  // 否则统计里的「导出 Excel」等仍按旧状态显示，要退出重进才更新
  if (prevStatus !== undefined && prevStatus !== act.value.status) {
    if (mounted.stat) refreshPanel('stat');
    if (mounted.records) refreshPanel('records');
  }
  armTick();
};

// 加载失败（断网、非对象级错误）时给出重试，不白屏；对象级错误由 guarded 跳 M-26
const loadFailed = ref(false);
const load = async () => {
  loadFailed.value = false;
  try {
    await loadInner();
  } catch (e) {
    if (!loaded.value) loadFailed.value = true;
  }
};

// —— 删除草稿（D-090）：确认、遮罩、提示统一在 common/grouporder/draft.js ——
const canDeleteDraft = computed(() => canDelete(act.value));
const deleteDraft = async () => {
  if (!(await confirmDeleteDraft({ _id: activityId.value, title: act.value.title }))) return;
  // 留出「删除成功」提示的时间再返回；「我发起的」在 onShow 时刷新
  setTimeout(() => safeBack('/pages/hall/jielong'), 1200);
};

const edit = () => uni.navigateTo({ url: '/pages/activity/edit?id=' + activityId.value });
const editPublished = () => uni.navigateTo({ url: '/pages/activity/edit?id=' + activityId.value + '&mode=edit' });
const publish = () => uni.navigateTo({ url: '/pages/activity/publish?id=' + activityId.value });
const pickupEdit = () => uni.navigateTo({ url: '/pages/activity/pickup-edit?id=' + activityId.value });
/**
 * 截止 / 取消（D-111、D-113）：确认框直接完成，不再跳 M-23。
 * 第一步说明后果并确认；取消再弹一个输入框填原因——uni 的 editable 确认框会把 content 预填进输入框，
 * 说明与输入不能放在同一个框里。进行中（未开始）的活动服务端要求原因必填，撤回成草稿的可不填。
 * 成功后刷新本页；失败由 guarded 提示或跳结果页
 */
const acting = ref(false);
const modal = (opts: any) => new Promise<any>((resolve) => uni.showModal({ ...opts, success: resolve, fail: () => resolve({ confirm: false }) }));
const closeOrCancel = async () => {
  const ac = headAction.value;
  if (!ac || acting.value) return;
  const isCancel = ac.mode === 'cancel';
  const ok = await modal({
    title: isCancel ? '取消活动' : '结束活动',
    content: isCancel
      ? '取消后参与者不能再下单或改单；已有订单保留记录，但不再计入有效统计、不生成清单。此操作不可恢复。'
      : '结束后立即停止接龙，活动变为「已结束」，不能再新建或扩大订单；已有有效订单保留，可生成清单。此操作不可恢复。',
    confirmText: isCancel ? '继续取消' : '确认结束',
    confirmColor: '#c7463f',
  });
  if (!ok.confirm) return;
  let reason = '';
  if (isCancel) {
    const required = act.value.status === 2;
    const r = await modal({
      title: '填写取消原因',
      content: '',
      editable: true,
      placeholderText: required ? '必填，参与者可以看到' : '选填，参与者可以看到',
      confirmText: '确认取消',
      confirmColor: '#c7463f',
    });
    if (!r.confirm) return;
    reason = String(r.content || '').trim();
    if (required && !reason) {
      uni.showToast({ title: '请填写取消原因', icon: 'none' });
      return;
    }
  }
  acting.value = true;
  try {
    if (isCancel) await guarded(api.activity.activityCancel({ activity_id: activityId.value, reason }));
    else await guarded(api.activity.activityClose({ activity_id: activityId.value }));
    uni.showToast({ title: isCancel ? '已取消' : '已结束', icon: 'none' });
  } catch (e) {
    // 提示由 guarded / 默认 toast 给出；状态可能已变，下面照样刷新
  } finally {
    acting.value = false;
    load();
  }
};

onLoad((q: any = {}) => {
  activityId.value = q.id || '';
  if (q.tab === 'records' || q.tab === 'goods' || q.tab === 'stat') tab.value = q.tab;
  if (q.mark === 'unpaid' || q.mark === 'undelivered') initialMark.value = q.mark;
});
// 起止时间点：页面开着时到点刷新一次（未开始 → 可下单、进行中 → 已结束），隐藏即取消
let cancelTick = () => {};
const armTick = () => {
  cancelTick();
  cancelTick = scheduleBoundary([act.value], serverOffset(act.value.asOf), () => load());
};
let shownOnce = false;
onShow(() => {
  load();
  // 从子页面返回时刷新当前 tab（首次进入由面板挂载时自行加载）
  if (shownOnce) refreshPanel(tab.value);
  shownOnce = true;
});
onHide(() => cancelTick());
onUnload(() => cancelTick());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding-bottom: calc(40rpx + env(safe-area-inset-bottom)); }
.head { background: #fff; padding: 32rpx 28rpx; }
.head__row { display: flex; align-items: flex-start; justify-content: space-between; gap: 20rpx; margin-bottom: 12rpx; }
/* 标题与标签同在一段文字流里：标题长时标签跟在末尾一起折行 */
.head__main { flex: 1; min-width: 0; line-height: 1.5; }
.head__main .tag { margin-left: 10rpx; vertical-align: 4rpx; }
.head__title { font-size: 34rpx; color: $go-ink; font-weight: 600; }
.head__code { display: flex; align-items: center; }
.head__code-v { color: $go-ink; font-weight: 600; letter-spacing: 2rpx; }
.head__copy { margin-left: 16rpx; font-size: 22rpx; color: $go-primary; border: 1rpx solid $go-primary; border-radius: 20rpx; padding: 0 16rpx; line-height: 36rpx; }
.head__meta { font-size: 24rpx; color: $go-muted; line-height: 1.7; }
.head__reason { font-size: 24rpx; color: $go-red; margin-top: 10rpx; }
.stat-line { display: flex; align-items: center; gap: 10rpx; background: #fff; margin-top: 2rpx; padding: 14rpx 28rpx; line-height: 1.4; }
.stat-line__t { flex: 1; font-size: 24rpx; color: $go-text; }
.stat-line__n { color: $go-primary; font-weight: 600; }
.more { position: relative; flex-shrink: 0; }
.pop-mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; z-index: 90; }
/* 小菜单：贴在「⋯」下方右对齐，带小三角 */
.pop { position: absolute; top: 68rpx; right: -8rpx; z-index: 100; min-width: 240rpx; background: #fff; border-radius: 16rpx; box-shadow: 0 12rpx 40rpx rgba(23, 35, 29, 0.18); padding: 8rpx 0; }
.pop::before { content: ''; position: absolute; top: -10rpx; right: 22rpx; width: 20rpx; height: 20rpx; background: #fff; transform: rotate(45deg); box-shadow: -4rpx -4rpx 8rpx rgba(23, 35, 29, 0.05); }
.pop__i { position: relative; padding: 22rpx 32rpx; font-size: 27rpx; color: $go-ink; white-space: nowrap; }
.pop__i + .pop__i { border-top: 1rpx solid $go-soft; }
.pop__i--hover { background: $go-soft; }
.pop__i--danger { color: $go-red; }
.head__more { display: flex; align-items: center; justify-content: center; width: 72rpx; height: 52rpx; border-radius: 26rpx; background: $go-primary-soft; border: 2rpx solid $go-primary; color: $go-primary-dark; font-size: 34rpx; font-weight: 700; line-height: 1; letter-spacing: 0; }
.draft-tip { margin: 24rpx 32rpx 0; font-size: 24rpx; color: $go-muted; line-height: 1.6; }
.draft-btn { margin: 28rpx 32rpx 0; border-radius: 28rpx; font-size: 32rpx; font-weight: 600; padding: 8rpx 0; }
.draft-del { text-align: center; margin-top: 28rpx; font-size: 26rpx; color: $go-red; }
/* 吸顶：H5 有固定导航栏，用 --window-top 让出它的高度 */
.tabs { position: sticky; top: var(--window-top, 0); z-index: 10; display: flex; background: #fff; margin-top: 24rpx; border-bottom: 1rpx solid $go-line; }
.tabs__i { flex: 1; text-align: center; font-size: 28rpx; color: $go-text; padding: 22rpx 0; }
.tabs__i--on { color: $go-primary; font-weight: 700; box-shadow: inset 0 -4rpx 0 $go-primary; }
.share-row { display: flex; gap: 20rpx; margin: 28rpx 32rpx 0; }
.share-cta { flex: 1; margin: 0; padding: 22rpx 0; border-radius: 28rpx; background: $go-primary; color: #fff; font-size: 30rpx; font-weight: 700; line-height: 1.3; box-shadow: 0 16rpx 36rpx rgba(22, 138, 85, 0.22); }
.share-cta::after { border: none; }
.share-cta--ghost { background: #fff; color: $go-primary-dark; border: 2rpx solid $go-primary; box-shadow: none; }
.share-cta__sub { display: block; font-size: 21rpx; font-weight: 500; opacity: 0.85; margin-top: 6rpx; }
.tag { display: inline-block; font-size: 20rpx; padding: 2rpx 12rpx; border-radius: 8rpx; margin-right: 8rpx; }
.tag--biz { background: $go-primary-soft; color: $go-primary; }
.tag--gov { background: $go-red-soft; color: $go-red; }
.tag--warn { background: $go-orange-soft; color: $go-orange; }
/* 授权复制面板（D-155）*/
.cp { background: #fff; border-radius: 28rpx 28rpx 0 0; padding: 36rpx 32rpx calc(28rpx + env(safe-area-inset-bottom)); }
.cp__title { font-size: 32rpx; font-weight: 700; color: $go-ink; text-align: center; }
.cp__desc { font-size: 24rpx; color: $go-text; line-height: 1.7; margin-top: 18rpx; }
.cp__b { color: $go-primary-dark; font-weight: 600; }
.cp__link { margin-top: 20rpx; padding: 18rpx 20rpx; border-radius: 16rpx; background: $go-soft; font-size: 22rpx; color: $go-muted; word-break: break-all; }
.cp__btn { margin-top: 28rpx; border-radius: 24rpx; font-size: 30rpx; }
.cp__ops { display: flex; justify-content: space-between; margin-top: 24rpx; font-size: 26rpx; }
.cp__revoke { color: $go-red; }
.cp__close { color: $go-muted; }
</style>
