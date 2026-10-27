<!--
  使用帮助（M-08「帮助与客服」进入，D-105）

  静态问答，按「参与接龙 / 发起接龙 / 其他」分组，点问题展开答案；未登录也可看。
  内容须与实际功能一致：功能变化时同步修改本页。
-->
<template>
  <view class="page">
    <!-- 图文指南入口放最上面（D-148、D-149） -->
    <view class="guide-entry" @click="openGuide">📘 发起接龙图文指南 ›</view>
    <view v-for="(g, gi) in groups" :key="gi" class="grp">
      <view class="grp__title">{{ g.title }}</view>
      <view class="grp__box">
        <view v-for="(q, qi) in g.items" :key="qi" class="qa">
          <view class="qa__q" @click="toggle(gi + '-' + qi)">
            <text class="qa__qt">{{ q.q }}</text>
            <text class="qa__arrow" :class="{ 'qa__arrow--open': open[gi + '-' + qi] }">›</text>
          </view>
          <text v-if="open[gi + '-' + qi]" class="qa__a" user-select>{{ q.a }}</text>
        </view>
      </view>
    </view>
    <view class="foot">
      还有问题？可以在「我的 → 举报 / 反馈」告诉我们，或查看
      <text class="foot__link" @click="openLegal('service')">用户服务协议</text>末尾的联系方式。
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

const open = reactive<Record<string, boolean>>({});
const toggle = (k: string) => { open[k] = !open[k]; };
const openGuide = () => uni.navigateTo({ url: '/pages/common/guide-create' });
const openLegal = (type: string) => uni.navigateTo({ url: '/pages/common/legal?type=' + type });

const groups = [
  {
    title: '发起接龙',
    items: [
      { q: '第一次发起接龙，怎么操作最省事？', a: '建议先在「我的 → 商品库管理」把要卖的商品添加好，发起接龙时点「从商品库添加」一次勾选，下次还能直接复用。点页面底部的「发起接龙图文指南」可以看分步图示。' },
      { q: '怎么发起一个接龙？', a: '在底部「发起接龙」填写标题、说明、截止时间和交付方式（送货上门 / 自提），添加商品并设置价格、库存和每人限购，然后预览并提交审核。审核通过后活动才对外可见。' },
      { q: '怎么把接龙发给大家？', a: '活动审核通过后，在活动管理页点「分享到微信」复制链接发到微信群，或点旁边的「生成海报」保存图片发朋友圈；把活动码告诉大家也能查到。' },
      { q: '能复用以前的商品或接龙吗？', a: '可以。添加商品时可「从商品库添加」，保存过的商品会自动进入商品库，可在「我的 → 商品库管理」维护。已结束的接龙可以在发起页「复用历史接龙」，复制后修改再发布。' },
      { q: '怎么查看订单、统计和对账？', a: '在活动管理页的「接龙记录」里逐单标记「已收款」「已取货」，可按全部 / 未收款 / 未取货切换，也能输入接龙码、姓名或电话尾号搜索；「统计」里看有效订单、份数和商品汇总。这些标记只是你自己的记录。' },
      { q: '怎么把清单发到群里或导出 Excel？', a: '在活动管理页的「统计」里：备货信息旁点「复制备货清单」（按商品汇总份数），接龙明细旁点「复制接龙名单」（按参与者，姓名默认部分隐藏），复制后粘贴到群里。活动结束后，页面最下方的「导出 Excel 清单」可以生成并下载。' },
      { q: '团长名片有什么用？', a: '在「我的 → 团长名片」填写的头像、昵称、电话或微信，会显示在你发起的所有活动页和参与者的订单详情里，方便参与者付款、问交付时找到你。打开活动的人都能看到，请只填愿意公开的信息。' },
      { q: '活动可以提前结束或取消吗？', a: '可以。活动开始后，在活动管理页标题右侧的「⋯」菜单里点「结束活动」提前结束，结束后不能再下单，可以导出清单；活动开始前可以点「取消活动」，开始后就不能取消了。取消后活动不可恢复，已有订单不再有效、不进入清单，请提前和参与者沟通。' },
    ],
  },
  {
    title: '参与接龙',
    items: [
      { q: '怎么参与别人发起的接龙？', a: '打开团长发来的链接，或在「接龙 → 我参与的」顶部输入活动码查找活动。选好商品数量后点提交，首次提交需要登录，再填写收货信息即可。' },
      { q: '活动码是什么？在哪里看？', a: '每个活动都有一个活动码（新活动 6 位，早期活动 4 位），显示在活动页标题下方，点一下可以复制。团长把活动码告诉你，你就能在「我参与的」里查到这个活动。' },
      { q: '怎么修改或取消订单？', a: '活动截止前，在「接龙 → 我参与的」点开订单，可以修改数量、交付方式、收货信息，或取消订单。截止后不能再修改，如有问题请联系团长。' },
      { q: '在哪里付款？平台会收款吗？', a: '平台不收款，也不负责发货和售后。接龙成功只表示你登记了想要的商品，付款方式和交付时间请按团长的说明线下处理。活动页的「联系团长」里有团长留的电话或微信。付款前请确认团长身份，谨防诈骗。' },
      { q: '「团长已记录：已收款 / 已取货」是什么意思？', a: '这是团长在自己的对账记录里做的标记，方便团长核对谁付了款、谁拿了货。平台不核实这些记录，有疑问请直接联系团长。' },
      { q: '收货信息怎么管理？', a: '在「我的 → 收货信息」可以新增、修改、删除常用的收货人和地址，下单时直接选择。已提交的订单保留下单时的信息，改收货信息不影响已提交的订单。' },
    ],
  },
  {
    title: '其他',
    items: [
      { q: '使用要收费吗？', a: '不收费，目前没有任何付费功能。' },
      { q: '忘记密码怎么办？', a: '暂不支持自助找回密码，请通过用户服务协议末尾的联系方式联系我们协助处理。' },
      { q: '发现违规内容怎么办？', a: '在活动页点举报，或在「我的 → 举报 / 反馈」提交，我们会尽快处理。' },
      { q: '怎么注销账号？', a: '请通过用户服务协议末尾的联系方式提出注销申请，我们核实身份后处理。如果你还有进行中的活动或未截止的有效订单，需要先处理完。注销后账号不可恢复。' },
    ],
  },
];
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding: 8rpx 0 60rpx; }
.grp__title { padding: 32rpx 32rpx 14rpx; font-size: 28rpx; font-weight: 700; color: $go-ink; }
.grp__box { background: #fff; }
.qa { border-bottom: 1rpx solid $go-soft; }
.qa__q { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 32rpx; }
.qa__qt { flex: 1; font-size: 28rpx; color: $go-ink; }
.qa__arrow { font-size: 30rpx; color: $go-placeholder; transition: transform 0.2s; }
.qa__arrow--open { transform: rotate(90deg); }
.qa__a { display: block; padding: 0 32rpx 28rpx; font-size: 26rpx; line-height: 1.75; color: $go-text; }
.foot { padding: 36rpx 32rpx; font-size: 24rpx; line-height: 1.7; color: $go-muted; text-align: center; }
.foot__link { color: $go-primary; }
.guide-entry { margin: 24rpx 32rpx 8rpx; padding: 26rpx 28rpx; background: $go-primary-soft; color: $go-primary-dark; border-radius: 20rpx; font-size: 27rpx; font-weight: 600; }
</style>
