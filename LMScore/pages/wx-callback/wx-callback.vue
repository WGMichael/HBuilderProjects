<template>
	<view>
		
	</view>
</template>

<script setup>
	//import CustomNavbar from '@/pages/common/CustomNavbar.vue';
	import { ref , getCurrentInstance } from 'vue';
	import {onLoad , onUnload} from "@dcloudio/uni-app"
	
	const { proxy } = getCurrentInstance();
	
	onLoad((e)=>{
		const code = getQueryParam('code');
		if (!code) return;
		const wx = uniCloud.importObject('wxLogin', { customUI: true });
		const res = await wx.loginByCode({ code });
		
		if(res.errCode == 0){
			// res 里一般返回：openid / unionid / nickname / headimgurl + 你自己的业务token
			// 建议：登录成功后把业务 token 存起来
			// uni.setStorageSync('token', res.token)
			uni.Dal.userinfo.setLoginInfoByWX(res.openid , res.nickname, res.headimgurl);
		}else{
			
		}
		
		uni.Events.on(uni.EventNames.Evt_Login_Success , onLogin_Success);
		
	})
	onUnload((e)=>{
		console.log("==onUnload==2121==")
		uni.Events.off(uni.EventNames.Evt_Login_Success , onLogin_Success);
	})
	
	const onLogin_Success = ()=>{
		
	}
	
	const getQueryParam = (name)=> {
	  const q = location.search || ''; // 注意：微信会把 code 放在 redirect_uri 的 query 上
	  const m = q.match(new RegExp(`[?&]${name}=([^&]+)`));
	  return m ? decodeURIComponent(m[1]) : '';
	}
	
</script>



<style lang="scss" scoped>

</style>
