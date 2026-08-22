<template>
	<view class="">
		<CustomNavbar :title="$t('usermgr_title')"></CustomNavbar>
		
		<view class="handles-list"> 
		<view class="navigate-cell" @click="clickClearAllVote">
			<up-icon name="edit-pen" color="#2979ff" size="58"></up-icon>
			<text class="title">清空所有创建的投票</text>
		</view>
		
			<view class="navigate-cell" @click="clickClearAllUserVote">
				<up-icon name="man-add-fill" color="#2979ff" size="58"></up-icon>
				<text class="title">清空玩家的投票</text>
			</view>
			
			<view class="navigate-cell" @click="clickClearExpRecord">
				<up-icon name="thumb-up" color="#2979ff" size="58"></up-icon>
				<text class="title">清空积分纪录</text>
			</view>
			
		
			<!-- <button type="primary" @click="clickUserMgr">{{$t("member_mgr")}}</button>
			<button type="warn" @click="clickAllData">清除所有投票记录相关数据</button>
			<button type="warn" @click="clickTEST">临时测试</button> -->
		</view>
	</view>
	
</template>
	
<script setup>
	import CustomNavbar from '@/pages/common/CustomNavbar.vue';
	import { ref } from 'vue';
	import {onLoad, onHide , onUnload} from "@dcloudio/uni-app"
	import { getCurrentInstance , computed} from 'vue';
	
	 const uo_vo = uniCloud.importObject("createVoInfo");
	 const uo_user = uniCloud.importObject("uservoteInfo");
	 const uo_exprecord = uniCloud.importObject("ExpChangeRecord");
	 const { proxy } = getCurrentInstance();
	
	const m_data = ref({
		name:"",
		icon:"",
		exp:0
	})
	
	onLoad((e)=>{
		uni.Events.on(uni.EventNames.Evt_UserInfo_Update , refreshUserData);
		refreshUserData();
	})
	onHide((e)=>{
		console.log("==onHide==selfmaininfo==")
		uni.Events.off(uni.EventNames.Evt_UserInfo_Update , refreshUserData);
	})
	
	const refreshUserData = ()=>{
		
	}
	
	const clickClearAllVote= async ()=>{
		const res = await uo_vo.Test_ClearAllData();
		console.log("====clickClearAllVote==" , res)
	}
	const clickClearAllUserVote = async ()=>{
		const res = await uo_user.Test_ClearAllData();
		console.log("====clickClearAllUserVote==" , res)
	}
	const clickClearExpRecord = async ()=>{
		const res = await uo_exprecord.Test_ClearAllData();
		console.log("====clickClearExpRecord==" , res)
	}
	
	
</script>



<style lang="scss" scoped>

	.info{
		width: 100vw;
		margin-top: 30rpx;
		display: flex;
		align-items: center;
		gap: 38rpx;
		
		image{
			width: 128rpx;
			height: 128rpx;
			margin-left: 38rpx;
			background-color: $uni-bg-color-grey;
		}
		.name{
			font-size: 18px;
		}
		.exp{
			color: green;
			font-size: 18px;
		}
	}

	.handles-list{
		width: 100vw;
		margin-top: 88rpx;
		display: flex;
		flex-direction: row;
		justify-content: space-evenly;
		flex-wrap: wrap;
		
		gap: 18rpx;
		
		.navigate-cell{
			width: 25vw;
			display: flex;
			background-color: $uni-bg-color-grey;
			flex-direction: column;
			align-items: center;
			gap: rpx;
			padding: 18rpx 0px;
		}
		
		button{
			width: 40vw;
			margin-left: 3vw;
		}
	}
</style>
