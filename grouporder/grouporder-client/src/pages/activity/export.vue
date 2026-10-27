<!--
  M-24 清单预览与导出（团长，活动已结束后）

  职责：商品汇总、参与者明细、Excel 生成和受控下载。
  D-071：下载时换取新的临时地址（有效期有限），页面不缓存 / 不复用历史地址。
  清单版本由订单变动驱动；作废订单会使版本变化。
-->
<template>
  <view class="page" v-if="loaded">
    <view class="head">
      <view class="head__title">{{ preview.title }}</view>
      <view class="head__meta">有效订单 {{ preview.valid_order_count || 0 }} · 有效份数 {{ preview.valid_total_qty || 0 }} · 预计 ￥{{ fen2yuan(preview.estimated_amount) }}</view>
    </view>

    <view class="block">
      <view class="block__title">商品汇总</view>
      <view v-for="g in preview.goods_summary || []" :key="g.goods_id || g.goods_name" class="row">
        <text class="row__name">{{ g.goods_name }}</text>
        <text class="row__qty">{{ g.sold_qty || g.qty || 0 }} 份</text>
      </view>
    </view>

    <!-- 服务端 detail 是「一条商品明细一行」（D-053，与 Excel 一致）；页面按订单归并展示，一单一块 -->
    <view class="block" v-if="orderRows.length">
      <view class="block__title">参与者明细（{{ orderRows.length }} 单）</view>
      <view v-for="o in orderRows" :key="o.order_no" class="drow">
        <view class="drow__head">
          <text>{{ o.consignee_name }} {{ o.consignee_mobile }}</text>
          <text class="drow__qty">{{ o.qty }} 份 · ￥{{ fen2yuan(o.amount) }}</text>
        </view>
        <!-- 团长记录（D-100）：Excel 里同样有两列，以生成时为准 -->
        <view v-if="o.leader_paid || o.leader_delivered" class="drow__marks">
          <text v-if="o.leader_paid" class="drow__mark">已收款</text>
          <text v-if="o.leader_delivered" class="drow__mark">已取货</text>
        </view>
        <view class="drow__items">{{ o.items.join('，') }}</view>
        <view v-if="o.consignee_address" class="drow__addr">{{ o.consignee_address }}</view>
      </view>
    </view>

    <view class="footer">
      <button class="btn" :loading="generating" @click="generate">生成清单</button>
      <button class="btn btn--primary" type="primary" :disabled="!fileVersion" :loading="downloading" @click="download">下载清单</button>
    </view>
    <view class="note">下载时会重新校验权限并换取有效期有限的临时链接，页面不保存历史链接。清单里的收款 / 取货记录以生成时为准，记录有变化时请重新生成。</view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
// @ts-ignore
import api, { guarded } from '@/common/grouporder/request.js';
// @ts-ignore
import { fen2yuan } from '@/common/grouporder/dict.js';

const activityId = ref('');
const preview = ref<any>({});
const loaded = ref(false);
const fileVersion = ref('');
const generating = ref(false);
const downloading = ref(false);

// 明细按订单号归并：同一订单的多件商品合成一块
const orderRows = computed(() => {
  const map = new Map<string, any>();
  for (const d of preview.value.detail || []) {
    if (!map.has(d.order_no)) {
      map.set(d.order_no, { order_no: d.order_no, consignee_name: d.consignee_name, consignee_mobile: d.consignee_mobile, consignee_address: d.consignee_address, leader_paid: d.leader_paid, leader_delivered: d.leader_delivered, qty: 0, amount: 0, items: [] });
    }
    const o = map.get(d.order_no);
    o.qty += d.qty || 0;
    o.amount += d.amount || 0;
    o.items.push(d.goods_name + '×' + d.qty);
  }
  return [...map.values()];
});

const load = async () => {
  preview.value = (await guarded(api.exportList.listPreview({ activity_id: activityId.value }))) || {};
  // 可下载的版本：versions 按生成时间倒序，取最新一个未失效的（作废订单会使旧版本失效，D-051）
  const v = (preview.value.versions || []).find((x: any) => !x.invalidated);
  fileVersion.value = (v && v.file_version) || '';
  loaded.value = true;
};

const generate = async () => {
  generating.value = true;
  try {
    const data = (await guarded(api.exportList.listGenerate({ activity_id: activityId.value }))) || {};
    fileVersion.value = data.file_version || '';
    uni.showToast({ title: '清单已生成', icon: 'none' });
  } catch (e) {} finally { generating.value = false; }
};

const download = async () => {
  if (!fileVersion.value) return;
  downloading.value = true;
  try {
    const data = (await guarded(api.exportList.listDownload({ activity_id: activityId.value, file_version: fileVersion.value }))) || {};
    if (data.url) {
      // #ifdef H5
      // 地址是请求返回后才拿到的，window.open 已不算用户手势，iOS / 微信内常被拦截：被拦截就在当前页打开下载
      const w = window.open(data.url);
      if (!w) location.href = data.url;
      // #endif
      // #ifndef H5
      uni.setClipboardData({ data: data.url, success: () => uni.showToast({ title: '下载链接已复制', icon: 'none' }) });
      // #endif
    }
  } catch (e) {} finally { downloading.value = false; }
};

onLoad((q: any = {}) => { activityId.value = q.id || ''; });
onShow(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding-bottom: 160rpx; }
.head { background: #fff; padding: 28rpx; }
.head__title { font-size: 32rpx; color: $go-ink; }
.head__meta { font-size: 24rpx; color: $go-muted; margin-top: 10rpx; }
.block { background: #fff; margin-top: 16rpx; padding: 24rpx 28rpx; }
.block__title { font-size: 28rpx; color: $go-ink; font-weight: 600; margin-bottom: 16rpx; }
.row, .drow { display: flex; justify-content: space-between; padding: 14rpx 0; border-bottom: 1rpx solid $go-soft; font-size: 28rpx; color: $go-ink; }
.row__qty, .drow__qty { color: $go-muted; }
.drow { flex-direction: column; }
.drow__head { display: flex; justify-content: space-between; }
.drow__items { font-size: 24rpx; color: $go-text; margin-top: 6rpx; }
.drow__addr { font-size: 22rpx; color: $go-muted; margin-top: 4rpx; }
.footer { position: fixed; left: 0; right: 0; bottom: 60rpx; display: flex; gap: 16rpx; padding: 20rpx; }
.btn { flex: 1; margin: 0; font-size: 30rpx; background: #fff; color: $go-text; }
.btn--primary { background: $go-primary; color: #fff; }
.note { position: fixed; left: 0; right: 0; bottom: 0; text-align: center; font-size: 20rpx; color: $go-muted; padding: 12rpx; }
.drow__marks { display: flex; gap: 12rpx; margin-top: 8rpx; }
.drow__mark { font-size: 20rpx; color: $go-primary; background: $go-primary-soft; padding: 2rpx 12rpx; border-radius: 8rpx; }
</style>
