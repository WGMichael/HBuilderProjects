<template>
	<view class="container">
		<view class="list">
			<input v-model="addData.sourceid" :placeholder="$t('source_id')"/>
			<input v-model="addData.sourcename" :placeholder="$t('source_name')"/>
			
			<!-- <view class="img">
				<uni-file-picker
					ref="filepicker"
					v-model="addData.picurl"
					return-type="object"
					fileMediatype="image" 
					@select="selectImage" 
					@progress="uploadprogress" 
					@success="uploadsuccess" 
					@fail="uploadfail" 
					@delete="selectDelet" 
					:autoUpload="false"
				></uni-file-picker>
			</view> -->
		
			<button size="default" type="primary" @click="clickLogin">{{$t('login')}}</button>
		</view>
	</view>
</template>


<script setup>
	import { ref } from 'vue';
	import {onLoad, onHide , onUnload} from "@dcloudio/uni-app"
	import StoreKey from '@/common/StoreKey.js';
	
	const filepicker = ref(null)
	const db = uniCloud.database();
	
	const addData = ref({
		sourceid : "",
		sourcename : "",
		picurl : {}
	});
	let isSelectedImg = false;
	let imgremoteurl = "";
	
	const selectImage = (e)=>{
		isSelectedImg = true;
	}
	const selectDelet = (e)=>{
		isSelectedImg = false;
	}
	
	onLoad((e)=>{
		console.log("==index==onLoad==")
		uni.Events.on(uni.EventNames.Evt_Login_Success , onLogin_Success);
		uni.Events.on(uni.EventNames.Evt_TokenLogin_Fail , onTokenLogin_Fail);
	})
	onUnload((e)=>{
		console.log("==onUnload==login==")
		uni.Events.off(uni.EventNames.Evt_Login_Success , onLogin_Success);
		uni.Events.off(uni.EventNames.Evt_TokenLogin_Fail , onTokenLogin_Fail);
	})
	onHide((e)=>{
		console.log("==onHide==login==")
		uni.Events.off(uni.EventNames.Evt_Login_Success , onLogin_Success);
		uni.Events.off(uni.EventNames.Evt_TokenLogin_Fail , onTokenLogin_Fail);
	})
	
	const onLogin_Success = ()=>{
		console.log("==onLogin_Success==444==")
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
		//console.log("===onTokenLogin_Fail===2222====" )
	}
	
	const clickLogin = (e)=>{
		if(!addData.value.sourceid || !addData.value.sourcename){
			uni.showToast({
				title: "请输入资料",
				icon:'none'
			})
			return;
		}
		uni.Dal.userinfo.LoginByAccountAndPWD(addData.value.sourceid, addData.value.sourcename);
	}
	
	const uploadprogress = (e)=>{
		console.log("uploadprogress" , e.progress)
	}
	const uploadsuccess = (e)=>{
		uni.hideLoading();
		imgremoteurl = e.tempFilePaths[0];
		//goToRegist0();
	}
	const uploadfail = (e)=>{
		uni.hideLoading();
		uni.showToast({
			title: this.$t("upload_fail_icon"),
			icon:'none'
		})
		console.log("uploadfail" , e)
	}
	
	const goToRegist = () =>{
		if(!isSelectedImg){
			uni.showToast({
				title: uni.$t("select_icon"),
				icon:'none'
			})
			return;
		}
		uni.showLoading();
		filepicker.value.upload();
	}
	
	const goToRegist0 = async () =>{
		uni.showLoading();
		let res = await db.collection("lm-user").add({
			sourceid: addData.value.sourceid,
			sourcename: addData.value.sourcename,
			sourceicon: imgremoteurl,
			groupid:"0",
		})
		uni.hideLoading();
		if(res.result.errCode == 0){
			console.log("注册成功==" , res)
			uni.Dal.userinfo.setLoginInfo(res.result.id ,addData.value.sourceid, addData.value.sourcename, imgremoteurl, "");
			uni.Dal.userinfo.saveToStorage();
			uni.redirectTo({
				url : "/pages/luoma/group/selectgroup"
			})
		}else{
			
		}
	}
	
	onLoad((e)=>{
		
	})
</script>



<style lang="scss" scoped>
	.container {  
		/* 1. 设置高度占满全屏 */  
		height: 100vh;  
		width: 100%;    
		/* 2. 开启 Flex 布局 */  
		display: flex;    
		/* 3. 水平居中 */  
		justify-content: center;    
		/* 4. 垂直居中 */  
		align-items: center;
	}
	.list{
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 30rpx;
		margin-top: -180rpx;
		input{
			width: 80vw;
			height: 80rpx;
			border: 1px lightgrey solid;
			padding-left: 30rpx;
		}
		
		.img{
			width: 80%;
			//height: 500rpx;
			display: flex;
			flex-direction: column;
			justify-content: center;
			align-items: center;
			
		}
		
		button{
			width: 60vw;
			margin-top: 120rpx;
		}
	}
</style>
