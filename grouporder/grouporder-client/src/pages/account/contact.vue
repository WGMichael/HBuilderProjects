<!--
  团长名片设置（M-08 进入，D-103 / D-109）

  账号级：头像、昵称、联系电话、微信号填一次，本人发起的所有活动页与参与者订单详情都显示；填了哪项显示哪项。
  头像昵称与账号资料分开维护；从未保存过名片时，预填账号的昵称与头像。
  服务端校验号码与微信号格式、昵称同步文本检测、头像送图片检测（leadercontact），这里做同样的前置提示。
-->
<template>
  <go-result v-if="loadFailed" type="unknown" detail="页面加载失败，请检查网络后重试" @retry="load" />
  <view class="page" v-if="loaded">
    <!-- 预览：参与者在活动页看到的样子 -->
    <view class="label">参与者看到的样子</view>
    <view class="card">
      <view v-if="isEmpty" class="card__empty">名片为空，活动页不会显示</view>
      <block v-else>
        <view class="card__head">
          <view class="avatar">
            <image v-if="avatar && avatar.preview && !avatarBlocked" class="avatar__img" :src="avatar.preview" mode="aspectFill" />
            <text v-else class="avatar__txt">{{ (nickname.trim() || '团').slice(0, 1) }}</text>
          </view>
          <view class="card__who">
            <view class="card__name">{{ nickname.trim() || '团长' }}</view>
            <view class="card__role">本次接龙团长</view>
          </view>
        </view>
        <view class="card__row" v-if="mobile.trim()"><text class="card__k">电话</text><text class="card__v">{{ mobile.trim() }}</text><text class="card__act">拨号</text></view>
        <view class="card__row" v-if="wechat.trim()"><text class="card__k">微信</text><text class="card__v">{{ wechat.trim() }}</text><text class="card__act">复制</text></view>
      </block>
    </view>

    <view v-if="prefilled" class="notice notice--green">已带入你的账号昵称和头像，可修改；保存后才会显示在活动页。</view>
    <view v-if="avatarBlocked" class="notice notice--red">当前头像未通过内容检测，参与者看不到，请更换。</view>

    <view class="form">
      <view class="row" @click="pickAvatar">
        <text class="row__k">头像</text>
        <view class="row__avatar">
          <view class="avatar avatar--sm">
            <image v-if="avatar && avatar.preview" class="avatar__img" :src="avatar.preview" mode="aspectFill" />
            <text v-else class="avatar__txt">{{ (nickname.trim() || '团').slice(0, 1) }}</text>
          </view>
          <text v-if="avatar" class="row__link" @click.stop="removeAvatar">移除</text>
          <text class="row__a">›</text>
        </view>
      </view>
      <view class="row">
        <text class="row__k">昵称</text>
        <input class="row__in" v-model="nickname" type="text" :maxlength="NICKNAME_MAX" placeholder="参与者看到的称呼，选填" />
      </view>
      <view class="row">
        <text class="row__k">联系电话</text>
        <input class="row__in" v-model="mobile" type="text" maxlength="20" placeholder="手机或座机，选填" />
      </view>
      <view class="row row--last">
        <text class="row__k">微信号</text>
        <input class="row__in" v-model="wechat" type="text" maxlength="20" placeholder="微信号或绑定微信的手机号，选填" />
      </view>
    </view>
    <view class="tip">微信号在微信「我 → 个人资料」里查看，以字母开头，6～20 位。</view>

    <view class="notice">名片会显示在你发起的<text class="b">所有接龙活动页</text>和参与者的订单详情里，打开活动的人都能看到，请只填愿意公开的信息。各项都可留空，留空就不显示。</view>

    <button class="save" type="primary" :loading="saving" @click="save">保存</button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import GoResult from '@/components/go-result/go-result.vue';
// @ts-ignore
import api from '@/common/grouporder/request.js';
// @ts-ignore
import { safeBack } from '@/common/grouporder/nav.js';
// @ts-ignore
import { toItem, pickImages, uploadPending, leaderCardImageDir } from '@/common/grouporder/upload.js';

const NICKNAME_MAX = 20;
const PHONE_RE = /^[0-9+\-() ]{5,20}$/;
const WECHAT_RE = /^([a-zA-Z][-_a-zA-Z0-9]{5,19}|1\d{10})$/;

const nickname = ref('');
const avatar = ref<any>(null); // upload.js 的 item：{ file, localPath, preview }
const mobile = ref('');
const wechat = ref('');
const avatarBlocked = ref(false);
const prefilled = ref(false);
const loaded = ref(false);
const loadFailed = ref(false);
const saving = ref(false);

const isEmpty = computed(() => !nickname.value.trim() && !avatar.value && !mobile.value.trim() && !wechat.value.trim());

const load = async () => {
  loadFailed.value = false;
  try {
    const c = (await api.user.leaderContactGet()) || {};
    if (c.has_card) {
      nickname.value = c.nickname || '';
      avatar.value = c.avatar ? toItem(c.avatar) : null;
    } else {
      // 从未保存过名片：预填账号昵称与头像
      nickname.value = (c.account_nickname || '').slice(0, NICKNAME_MAX);
      avatar.value = c.account_avatar ? toItem(c.account_avatar) : null;
      prefilled.value = !!(nickname.value || avatar.value);
    }
    mobile.value = c.mobile || '';
    wechat.value = c.wechat || '';
    avatarBlocked.value = !!c.avatar_blocked;
    loaded.value = true;
  } catch (e) {
    if (!loaded.value) loadFailed.value = true;
  }
};

const pickAvatar = async () => {
  const items = await pickImages(1);
  if (!items.length) return;
  avatar.value = items[0];
  avatarBlocked.value = false;
};
const removeAvatar = () => {
  avatar.value = null;
  avatarBlocked.value = false;
};

const save = async () => {
  const n = nickname.value.trim();
  const m = mobile.value.trim();
  const w = wechat.value.trim();
  if (n.length > NICKNAME_MAX) return uni.showToast({ title: `昵称最多 ${NICKNAME_MAX} 个字`, icon: 'none' });
  if (m && !(PHONE_RE.test(m) && (m.match(/\d/g) || []).length >= 5)) return uni.showToast({ title: '联系电话格式不正确', icon: 'none' });
  if (w && !WECHAT_RE.test(w)) return uni.showToast({ title: '微信号需以字母开头，6～20 位；也可填手机号', icon: 'none' });
  saving.value = true;
  try {
    // 头像先选后传：保存时才上传，中途换掉的图不会传到云端
    if (avatar.value && avatar.value.localPath) await uploadPending([avatar.value], leaderCardImageDir(), 'avatar');
    await api.user.leaderContactSet({ nickname: n, avatar: avatar.value ? avatar.value.file : null, mobile: m, wechat: w });
    uni.showToast({ title: isEmpty.value ? '已清除' : '已保存', icon: 'success' });
    setTimeout(() => safeBack('/pages/hall/my'), 600);
  } catch (e) {
    // 错误提示由 client.js 默认 toast 给出（含昵称未通过检测、上传失败）
  } finally {
    saving.value = false;
  }
};

onLoad(() => load());
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $go-canvas; padding: 32rpx 32rpx 60rpx; }
.label { font-size: 22rpx; color: $go-muted; margin: 0 4rpx 14rpx; }

.card { background: #fff; border: 1rpx solid $go-line; border-radius: 32rpx; padding: 30rpx; box-shadow: 0 8rpx 28rpx rgba(37, 55, 45, 0.03); }
.card__empty { text-align: center; color: $go-placeholder; font-size: 26rpx; padding: 24rpx 0; }
.card__head { display: flex; align-items: center; }
.card__who { margin-left: 22rpx; min-width: 0; }
.card__name { font-size: 30rpx; font-weight: 600; color: $go-ink; }
.card__role { font-size: 22rpx; color: $go-muted; margin-top: 4rpx; }
.card__row { display: flex; align-items: center; margin-top: 18rpx; padding-top: 18rpx; border-top: 1rpx solid $go-line; }
.card__k { width: 72rpx; font-size: 24rpx; color: $go-muted; }
.card__v { flex: 1; font-size: 26rpx; color: $go-ink; word-break: break-all; }
.card__act { font-size: 24rpx; color: $go-primary; }

.avatar { width: 96rpx; height: 96rpx; border-radius: 50%; background: $go-primary; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.avatar--sm { width: 72rpx; height: 72rpx; }
.avatar__img { width: 100%; height: 100%; }
.avatar__txt { color: #fff; font-size: 36rpx; }
.avatar--sm .avatar__txt { font-size: 28rpx; }

.notice { margin-top: 24rpx; border-radius: 24rpx; padding: 22rpx 24rpx; font-size: 22rpx; line-height: 1.6; color: $go-orange-text; background: $go-orange-soft; }
.notice--green { color: $go-primary-dark; background: $go-primary-soft; }
.notice--red { color: $go-red; background: $go-red-soft; }
.b { font-weight: 700; }

.form { margin-top: 28rpx; background: #fff; border: 1rpx solid $go-line; border-radius: 28rpx; overflow: hidden; }
.row { display: flex; align-items: center; padding: 28rpx 30rpx; border-bottom: 1rpx solid $go-line; }
.row--last { border-bottom: 0; }
.row__k { width: 160rpx; font-size: 28rpx; color: $go-ink; flex-shrink: 0; }
.row__in { flex: 1; font-size: 28rpx; color: $go-ink; }
.row__avatar { flex: 1; display: flex; align-items: center; justify-content: flex-end; }
.row__link { font-size: 24rpx; color: $go-muted; margin-left: 20rpx; }
.row__a { font-size: 28rpx; color: $go-placeholder; margin-left: 16rpx; }
.tip { font-size: 22rpx; color: $go-muted; padding: 16rpx 8rpx 0; }

.save { margin-top: 40rpx; border-radius: 24rpx; }
</style>
