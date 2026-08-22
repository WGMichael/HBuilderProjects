<template>
  <view class="page">
    <!-- 智能识别：粘贴混排文本，自动拆分填入表单 -->
    <view class="paste-box">
      <textarea
        class="paste-input"
        v-model="pasteText"
        placeholder="粘贴收货人、手机号、地址，点识别自动填写&#10;如：张三 13800138000 广东省深圳市罗湖区春风路1号"
        placeholder-class="ph"
        :maxlength="200"
        auto-height
      />
      <view class="parse-btn" @tap="onParse">识别</view>
    </view>

    <view class="form">
      <!-- 姓名 -->
      <view class="field">
        <text class="label">收货人</text>
        <input class="input" v-model="form.name" placeholder="请输入收货人姓名" placeholder-class="ph" />
      </view>

      <!-- 手机号 -->
      <view class="field">
        <text class="label">手机号</text>
        <input
          class="input"
          v-model="form.phone"
          type="number"
          maxlength="11"
          placeholder="请输入手机号"
          placeholder-class="ph"
        />
      </view>

      <!-- 省市区 -->
      <view class="field">
        <text class="label">所在地区</text>
        <picker mode="region" :value="regionArr" @change="onRegionChange">
          <view class="picker" :class="{ ph: !form.region }">
            {{ form.region || '请选择省市区' }}
          </view>
        </picker>
      </view>

      <!-- 详细地址 -->
      <view class="field align-top">
        <text class="label">详细地址</text>
        <textarea
          class="textarea"
          v-model="form.detail"
          placeholder="街道、门牌号、楼层等"
          placeholder-class="ph"
          :maxlength="120"
          auto-height
        />
      </view>

      <!-- 设为默认 -->
      <view class="field" @tap="form.isDefault = !form.isDefault">
        <text class="label">设为默认地址</text>
        <view class="toggle" :class="{ on: form.isDefault }">
          <view class="knob" />
        </view>
      </view>
    </view>

    <!-- 保存 -->
    <view class="save-bar">
      <view class="save-btn" @tap="onSave">保存</view>
    </view>
  </view>
</template>

<script setup lang="ts">
/** 地址表单：带 id 为编辑、无 id 为新增；保存后返回列表页（由其 onShow 刷新） */
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { db } from '@/data'
import { parseAddress } from '@/utils/address-parse'
import type { Address } from '@/types'

// 智能识别输入
const pasteText = ref('')

// 编辑中的地址 id（新增为 null）
const editId = ref<number | null>(null)

const form = reactive<Omit<Address, 'id'>>({
  name: '',
  phone: '',
  region: '',
  detail: '',
  isDefault: false
})

// region picker 需要 [省, 市, 区] 数组回填
const regionArr = ref<string[]>([])

onLoad(async (options) => {
  const id = options?.id ? Number(options.id) : NaN
  if (!Number.isNaN(id)) {
    editId.value = id
    uni.setNavigationBarTitle({ title: '编辑地址' })
    await loadAddress(id)
  } else {
    uni.setNavigationBarTitle({ title: '新增地址' })
    // #ifdef H5
    // H5 不支持 picker mode="region"，无法选省市区；给默认值保证能正常保存
    form.region = '广东省 深圳市 罗湖区'
    regionArr.value = ['广东省', '深圳市', '罗湖区']
    // #endif
  }
})

async function loadAddress(id: number) {
  try {
    const list = (await db.getAddresses?.()) ?? []
    const a = list.find((x) => x.id === id)
    if (!a) {
      uni.showToast({ title: '地址不存在', icon: 'none' })
      return
    }
    Object.assign(form, {
      name: a.name,
      phone: a.phone,
      region: a.region,
      detail: a.detail,
      isDefault: a.isDefault
    })
    // 省市区按空格拆分回填 picker（不足 3 段则留空）
    const parts = a.region.split(/\s+/).filter(Boolean)
    if (parts.length === 3) regionArr.value = parts
  } catch (e) {
    console.warn('[address-edit] 加载地址失败', e)
  }
}

function onRegionChange(e: { detail: { value: string[] } }) {
  const value = e.detail.value || []
  regionArr.value = value
  form.region = value.join(' ')
}

/** 智能识别：解析粘贴文本并回填表单（只填识别到的字段，其余保留） */
function onParse() {
  const text = pasteText.value.trim()
  if (!text) {
    uni.showToast({ title: '请先粘贴地址文本', icon: 'none' })
    return
  }
  const r = parseAddress(text)
  if (r.name) form.name = r.name
  if (r.phone) form.phone = r.phone
  if (r.region) {
    form.region = r.region
    // 省市区齐全时同步回填原生 picker
    const parts = r.region.split(/\s+/).filter(Boolean)
    if (parts.length === 3) regionArr.value = parts
  }
  if (r.detail) form.detail = r.detail

  // 提示识别结果：列出没识别到、需手动补的字段
  const missing: string[] = []
  if (!r.name) missing.push('收货人')
  if (!r.phone) missing.push('手机号')
  if (!r.region) missing.push('地区')
  if (!r.detail) missing.push('详细地址')
  uni.showToast({
    title: missing.length ? `请补全：${missing.join('、')}` : '识别成功',
    icon: 'none'
  })
}

/** 表单校验，通过返回 true */
function validate(): boolean {
  if (!form.name.trim()) {
    uni.showToast({ title: '请输入收货人', icon: 'none' })
    return false
  }
  if (!/^1\d{10}$/.test(form.phone)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
    return false
  }
  if (!form.region) {
    uni.showToast({ title: '请选择所在地区', icon: 'none' })
    return false
  }
  if (!form.detail.trim()) {
    uni.showToast({ title: '请输入详细地址', icon: 'none' })
    return false
  }
  return true
}

async function onSave() {
  if (!validate()) return
  const payload = {
    ...(editId.value != null ? { id: editId.value } : {}),
    name: form.name.trim(),
    phone: form.phone.trim(),
    region: form.region,
    detail: form.detail.trim(),
    isDefault: form.isDefault
  }
  try {
    if (!db.saveAddress) {
      uni.showToast({ title: '保存功能待后台接入', icon: 'none' })
      return
    }
    uni.showLoading({ title: '保存中', mask: true })
    await db.saveAddress(payload)
    uni.hideLoading()
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 600)
  } catch (e) {
    uni.hideLoading()
    console.warn('[address-edit] 保存失败', e)
    uni.showToast({ title: '保存失败', icon: 'none' })
  }
}
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding-bottom: 160rpx; }

/* 智能识别 */
.paste-box {
  background: $bg-card;
  margin: 20rpx;
  border-radius: $radius-card;
  padding: 24rpx;
  display: flex;
  align-items: flex-end;
}
.paste-input {
  flex: 1;
  min-height: 120rpx;
  font-size: 28rpx;
  color: $text-main;
  line-height: 1.5;
}
.parse-btn {
  flex-shrink: 0;
  margin-left: 20rpx;
  background: $brand-light;
  color: $brand;
  font-size: 28rpx;
  font-weight: bold;
  padding: 16rpx 32rpx;
  border-radius: 40rpx;
}

.form { background: $bg-card; margin-top: 0; }
.field {
  display: flex;
  align-items: center;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid $border-line;
}
.field.align-top { align-items: flex-start; }
.field:last-child { border-bottom: none; }
.label { width: 180rpx; font-size: 28rpx; color: $text-main; flex-shrink: 0; }
.input { flex: 1; font-size: 28rpx; color: $text-main; }
.textarea { flex: 1; font-size: 28rpx; color: $text-main; min-height: 80rpx; }
.picker { flex: 1; font-size: 28rpx; color: $text-main; }
.ph { color: #b8bcc4; }

/* 自定义开关 */
.toggle {
  margin-left: auto;
  width: 88rpx;
  height: 48rpx;
  border-radius: 24rpx;
  background: #dcdfe3;
  position: relative;
  transition: background .2s;
}
.toggle.on { background: $brand; }
.knob {
  position: absolute;
  top: 4rpx;
  left: 4rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: #fff;
  transition: left .2s;
}
.toggle.on .knob { left: 44rpx; }

/* 保存栏 */
.save-bar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  background: #fff;
  border-top: 1rpx solid $border-line;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
.save-btn {
  background: $brand;
  color: #fff;
  font-size: 30rpx;
  font-weight: bold;
  text-align: center;
  padding: 22rpx 0;
  border-radius: 44rpx;
}
</style>
