<template>
	<view class="">
		<CustomNavbar :title="$t('usermgr_title')"></CustomNavbar>
		
		<view class="info">
			<image :src="m_data.icon" mode="aspectFit"></image>
			<view style="display: flex; flex-direction: column; align-items: flex-start; gap: 12rpx;">
				<view class="name">{{$t("source_id") + "：" + m_data.name}}</view>
				<view style="display: flex; align-items: center;">
					<view class="exp">{{$t("exp") + "：" + m_data.exp}}</view>
					<up-icon style="margin-left: 68rpx;" name="reload" color="#2979ff" size="28" @click="reloadUserInfo"></up-icon>
				</view>
				
			</view>
		</view>
		<view class="handles-list"> 
		<view class="navigate-cell" @click="clickCurrentVotes">
			<up-icon name="edit-pen" color="#2979ff" size="58"></up-icon>
			<text class="title">{{$t("current_votes")}}</text>
		</view>
		
			<view class="navigate-cell" @click="clickMyOpen">
				<up-icon name="man-add-fill" color="#2979ff" size="58"></up-icon>
				<text class="title">{{$t("my_create")}}</text>
			</view>
			
			<!-- <view class="navigate-cell" @click="clickMyShow">
				<up-icon name="thumb-up" color="#2979ff" size="58"></up-icon>
				<text class="title">{{$t("my_contest")}}</text>
			</view> -->
			
			<view class="navigate-cell" @click="clickMyWatch">
				<up-icon name="list" color="#2979ff" size="58"></up-icon>
				<text class="title">{{$t("my_vote")}}</text>
			</view>
			
			<view class="navigate-cell" @click="clickMyExpChange">
				<up-icon name="order" color="#2979ff" size="58"></up-icon>
				<text class="title">{{$t("exp_record")}}</text>
			</view>
			
			<view class="navigate-cell" @click="clickExitAccount">
				<up-icon name="cut" color="#2979ff" size="58"></up-icon>
				<text class="title">{{$t("exit_account")}}</text>
			</view>
			
			<view class="navigate-cell" @click="clickCreateVote">
				<up-icon name="edit-pen" color="#2979ff" size="58"></up-icon>
				<text class="title">{{$t("create_vote")}}</text>
			</view>
		
			<view class="navigate-cell" @click="clickTest">
				<up-icon name="edit-pen" color="#2979ff" size="58"></up-icon>
				<text class="title">测试专用</text>
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
	import {onLoad, onHide, onShow , onUnload} from "@dcloudio/uni-app"
	import { getCurrentInstance , computed} from 'vue';
	
	// const uo_vo = uniCloud.importObject("vo-About");
	// const uo_user = uniCloud.importObject("userinfoMgr");
	// const uo_group = uniCloud.importObject("groupMgr");
	const { proxy } = getCurrentInstance();
	
	const m_data = ref({
		name:"",
		icon:"",
		exp:0
	})
	
	onShow((e)=>{
		uni.Events.on(uni.EventNames.Evt_UserInfo_Update , refreshUserData);
		refreshUserData();
	})
	onUnload((e)=>{
		console.log("==onUnload==selfmaininfo==")
		uni.Events.off(uni.EventNames.Evt_UserInfo_Update , refreshUserData);
	})
	onHide((e)=>{
		console.log("==onHide==selfmaininfo==")
		uni.Events.off(uni.EventNames.Evt_UserInfo_Update , refreshUserData);
	})
	
	const reloadUserInfo = ()=>{
		uni.Dal.userinfo.refreshUserExp(true);
	}
	
	const clickCurrentVotes= ()=>{
		uni.navigateTo({
			url : "/pages/vote/currentVoteList"
		})
	}
	const clickMyOpen = ()=>{
		uni.navigateTo({
			url : "/pages/vote/myCreateList"
		})
	}
	const clickMyShow = ()=>{
		
	}
	const clickMyWatch = ()=>{
		uni.navigateTo({
			url : "/pages/vote/selfvoterecord"
		})
	}
	const clickMyExpChange = ()=>{
		uni.navigateTo({
			url : "/pages/selfinfo/expChangeInfo"
		})
	}
	const clickCreateVote = ()=>{
		uni.navigateTo({
			url : "/pages/vote/createvoteui"
		})
	}
	const clickTest = ()=>{
		uni.navigateTo({
			url : "/pages/selfinfo/testUI"
		})
	}
	
	
	const clickAllData = (e)=>{
		clickAllData0();
	}
	const clickTEST = (e)=>{
		// let idstr = "68663a8021821bbfdbf65fc3$68663a8021821bbfdbf65fc4";
		// uni.redirectTo({
		// 	url : "/pages/luoma/createvote/votedeail?ids="+idstr,
		// })
		let idstr = "6875e27af2949c1a83a478d9";
		uni.navigateTo({
			url : "/pages/luoma/createvote/voteui?id="+idstr
		})
	}
	const clickAllData0 = async ()=>{
		let res = await uo_vo.DelAllAboutVotes();
		console.log("===clickClearAllVotes0=====" , res);
	}
	
	const clickExitAccount = ()=>{
		uni.Dal.userinfo.clearStorage();
		uni.redirectTo({
			url : "/pages/index/index"
		})
	}
	const clickUserMgr = ()=>{
		uni.navigateTo({
			url : "/pages/luoma/usermgr/usermgr"
		})
	}
	
	const refreshSelfExp = ()=>{
		m_data.value.exp = uni.Dal.userinfo.exp;
	}
	
	const refreshUserData =()=>{
		console.log("==uni.Dal.userinfo.name===" , uni.Dal.userinfo)
		m_data.value.name = uni.Dal.userinfo.nickname;
		m_data.value.icon = uni.Dal.userinfo.icon;
		m_data.value.exp = uni.Dal.userinfo.exp;
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
