<template>
	<view class="content">
		<image class="logo" src="/static/logo.png"></image>
		<view class="text-area">
			<text class="title">{{title}}</text>
		</view>
	</view>
</template>

<script setup>
	import {onLoad , onUnload} from "@dcloudio/uni-app"
	import StoreKey from '@/common/StoreKey.js';
	import { ref } from 'vue';
	
	const title = ref("title---test--")
	
	onLoad((e)=>{
		console.log("==index==onLoad==")
		uni.Events.on(uni.EventNames.Evt_Login_Success , onLogin_Success);
		uni.Events.on(uni.EventNames.Evt_TokenLogin_Fail , onTokenLogin_Fail);
		
		gotoWeChatOAuth();
	})
	onUnload((e)=>{
		console.log("==onUnload==2121==")
		uni.Events.off(uni.EventNames.Evt_Login_Success , onLogin_Success);
		uni.Events.off(uni.EventNames.Evt_TokenLogin_Fail , onTokenLogin_Fail);
	})
	
	const onLogin_Success = ()=>{
		console.log("===onLogin_Success=======" , uni.Dal.userinfo)
	}
	const onTokenLogin_Fail = ()=>{
		console.log("===onTokenLogin_Fail=======" )
		//uni.Dal.userinfo.setLoginInfoByWX("111111" , "111111", "");
		//gotoWeChatOAuth();
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
			const vid = uni.getStorageSync(StoreKey.KEY_VID) || "0";
			const appid = res0.data; //'wx12ab386d5286e0bb';
			const redirectUri = encodeURIComponent(`${location.origin}${location.pathname}#/wx-callback`);
			const scope = 'snsapi_userinfo'; // 或 snsapi_base
			const state = vid;
			
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
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
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
		font-size: 36rpx;
		color: #8f8f94;
	}
</style>
