<!--
  M-24 清单预览与导出（团长，活动已截止后）

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

    <view class="block" v-if="(preview.detail || []).length">
      <view class="block__title">参与者明细（{{ preview.detail.length }}）</view>
      <view v-for="(d, i) in preview.detail" :key="i" class="drow">
        <text>{{ d.consignee_name || d.name }} {{ d.consignee_mobile || d.mobile }}</text>
        <text class="drow__qty">{{ d.total_qty || d.qty }} 份</text>
      </view>
    </view>

    <view class="footer">
      <button class="btn" :loading="generating" @click="generate">生成清单</button>
      <button class="btn btn--primary" type="primary" :disabled="!fileVersion" :loading="downloading" @click="download">下载清单</button>
    </view>
    <view class="note">下载时会重新校验权限并换取有效期有限的临时链接，页面不保存历史链接。</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
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

const load = async () => {
  preview.value = (await guarded(api.exportList.listPreview({ activity_id: activityId.value }))) || {};
  fileVersion.value = preview.value.file_version || '';
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
      window.open(data.url);
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
.page { min-height: 100vh; background: #f4f5f7; padding-bottom: 160rpx; }
.head { background: #fff; padding: 28rpx; }
.head__title { font-size: 32rpx; color: #303133; }
.head__meta { font-size: 24rpx; color: #909399; margin-top: 10rpx; }
.block { background: #fff; margin-top: 16rpx; padding: 24rpx 28rpx; }
.block__title { font-size: 28rpx; color: #303133; font-weight: 600; margin-bottom: 16rpx; }
.row, .drow { display: flex; justify-content: space-between; padding: 14rpx 0; border-bottom: 1rpx solid #f5f5f5; font-size: 28rpx; color: #303133; }
.row__qty, .drow__qty { color: #909399; }
.footer { position: fixed; left: 0; right: 0; bottom: 60rpx; display: flex; gap: 16rpx; padding: 20rpx; }
.btn { flex: 1; margin: 0; font-size: 30rpx; background: #fff; color: #606266; }
.btn--primary { background: #2979ff; color: #fff; }
.note { position: fixed; left: 0; right: 0; bottom: 0; text-align: center; font-size: 20rpx; color: #909399; padding: 12rpx; }
</style>
