<template>
	<view>
		<view class="custom-navbar" :style="{ paddingTop: statusBarHeight + 'px' }">
			<view class="nav-content">
				<view class="nav-left" @click="goBack">
				   <uni-icons style="margin-left: 3vw;" type="left" size="23"></uni-icons>
				</view>
				<view class="nav-title">{{ title }}</view>
				<view class="nav-right">
				<slot name="right"></slot>
				</view>
			</view>
		</view>
	    <view style="width: 100vw; height: 44px;" />
  </view>
</template>

<script>
export default {
  name: "CustomNavbar",
  props: {
    title: {
      type: String,
      default: '标题'
    },
	clickback: {
      type: Function,
      default: null
    },
  },
  data() {
    return {
      statusBarHeight: 0
    };
  },
  mounted() {
    uni.getSystemInfo({
      success: (res) => {
        this.statusBarHeight = res.statusBarHeight;
      }
    });
  },
  methods: {
    goBack() {
		if(typeof this.clickback === 'function'){
			this.clickback();
		}else{
			uni.navigateBack();
		}
    }
  }
};
</script>

<style scoped>
.custom-navbar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  background-color: #ffffff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
  z-index: 999;
}

.nav-content {
  width: 100vw;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-left, .nav-right {
  width: 15vw;
  height: 100%;
  display: flex;
  align-items: center;
}

.nav-title {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: bold;
}

.icon {
  font-size: 20px;
}
</style>
