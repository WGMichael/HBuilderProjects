<template>
	<view class="content">
		<view class="login-cell" @click="onClickAccount">
			<up-icon name="account" color="#2979ff" size="58"></up-icon>
			<text class="title">账号登录</text>
		</view>
		
		<view class="login-cell" @click="onClickWX">
			<up-icon name="weixin-fill" color="#2979ff" size="58"></up-icon>
			<text class="title">微信登录</text>
		</view>
		
	</view>
</template>

<script setup>
	import {onLoad ,onHide, onShow , onUnload} from "@dcloudio/uni-app"
	import StoreKey from '@/common/StoreKey.js';
	import { ref } from 'vue';
	
	onLoad((e)=>{
		const token = uni.getStorageSync(StoreKey.KEY_TOKEN);
		if(token) uni.Dal.userinfo.AuthenticTokenStatus();
	})
	onShow((e)=>{
		console.log("==index==onLoad=000=")
		uni.Events.on(uni.EventNames.Evt_Login_Success , onLogin_Success);
		uni.Events.on(uni.EventNames.Evt_TokenLogin_Fail , onTokenLogin_Fail);
	})
	
	onHide((e)=>{
		console.log("==onHide==index==")
		uni.Events.off(uni.EventNames.Evt_Login_Success , onLogin_Success);
		uni.Events.off(uni.EventNames.Evt_TokenLogin_Fail , onTokenLogin_Fail);
	})
	onUnload((e)=>{
		console.log("==onUnload==index==")
		uni.Events.off(uni.EventNames.Evt_Login_Success , onLogin_Success);
		uni.Events.off(uni.EventNames.Evt_TokenLogin_Fail , onTokenLogin_Fail);
	})
	
	const onLogin_Success = ()=>{
		console.log("==onLogin_Success==555555==")
		const vid = uni.getStorageSync(StoreKey.KEY_VID);
		if(vid.length > 0){
			uni.redirectTo({
				url : "/pages/vote/voteui" + "?vid=" + vid,
			})
		}else{
			uni.redirectTo({
				url : "/pages/selfinfo/selfmaininfo",
			})
		}
	}
	const onTokenLogin_Fail = ()=>{
		uni.showToast({
			title: "自动登录失败，请选择登录方式",
			icon:'none'
		})
	}
	
	const onClickAccount = ()=>{
		uni.redirectTo({
			url : "/pages/account/login"
		})
	}
	const onClickWX = ()=>{
		uni.showLoading()
		gotoWeChatOAuth();
	}
	
	const getQueryParam = (name)=> {
	  const q = location.search || ''; // 注意：微信会把 code 放在 redirect_uri 的 query 上
	  const m = q.match(new RegExp(`[?&]${name}=([^&]+)`));
	  return m ? decodeURIComponent(m[1]) : '';
	}
	
	const gotoWeChatOAuth = async ()=>{
		const wx = uniCloud.importObject('wxLogin', { customUI: true });
		const res0 = await wx.getAppid();
		if(res0.errCode == 0){
			let vid = uni.getStorageSync(StoreKey.KEY_VID);
			vid = vid.length > 0 ? vid : "0";
			const appid = res0.data; //'wx12ab386d5286e0bb';
			const redirectUri = encodeURIComponent(`${location.origin}${location.pathname}#/wx-callback`);
			const scope = 'snsapi_userinfo'; // 或 snsapi_base
			const state = vid.toString();
			
			const url =
			`https://open.weixin.qq.com/connect/oauth2/authorize` +
			`?appid=${appid}` +
			`&redirect_uri=${redirectUri}` +
			`&response_type=code` +
			`&scope=${scope}` +
			`&state=${state}` +
			`#wechat_redirect`;
			location.replace(url);
		}
	}
		
		
</script>

<style>
	.content {
		width: 100vw;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-top: 38vh;
	}
	
	.login-cell{
		width: 30vw;
		display: flex;
		flex-direction: column;
		align-items: center;
		pad: 30rpx;
	}

	.logo {
		height: 200rpx;
		width: 200rpx;
		margin-top: 200rpx;
		margin-left: auto;
		margin-right: auto;
		margin-bottom: 50rpx;
	}

	.text-area {
		display: flex;
		justify-content: center;
	}

	.title {
		font-size: 26rpx;
		color: #8f8f94;
	}
</style>
