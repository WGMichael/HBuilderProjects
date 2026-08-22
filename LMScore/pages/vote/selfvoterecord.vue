<template>
	<view>
		<CustomNavbar :title="$t('uservote_title')"></CustomNavbar>
		<view class="vote-cell" v-for="(vote , i) in votelist" :key="vote._id">
			<view style="width: 100%; padding: 12rpx 0rpx; display: flex; flex-direction: column; align-items: center; justify-content: space-between; background-color: floralwhite;">
				<text style="font-size: 16px; margin-left: 18rpx;">{{$t("title") + "：" + vote.votetitle}}</text>
				<text style="font-size: 16px; margin-left: 18rpx;">{{$t("uservote_votetarget") + "：" + vote.vote_target_title}}</text>
				<text style="font-size: 16px; margin-left: 18rpx;">{{$t("vote_selfvotevalidcount") + " / " + $t("vote_selfvotecount") + "：" + vote.votecountvalid + " / " + vote.votecount}}</text>
				<text style="font-size: 16px; margin-left: 18rpx;">{{$t("rate") + "：" + vote.voterate}}</text>
				<text v-if="vote.votestatus == 4" style="font-size: 16px; margin-left: 18rpx;">{{$t("uservote_result") + "：" + vote.awardcount}}</text>
				<text style="color: blue; font-size: 13px; margin-top: 8rpx; margin-right: 28rpx;">{{$t('detail_votestatus') + "：" + Dal.systemsetting.getvoteStatus(vote.votestatus)}}</text>
			</view>
		</view>
	</view>
</template>

<script setup>
	import CustomNavbar from '@/pages/common/CustomNavbar.vue';
	import { ref , getCurrentInstance } from 'vue';
	import {onLoad, onHide , onUnload} from "@dcloudio/uni-app"
	import SystemUtils from '@/common/SystemUtils.js';
	
	
	const { proxy } = getCurrentInstance();
	const user_vo = uniCloud.importObject("uservoteInfo");
	
	const votelist = ref([]);
	
	const player_voteinfos = ref([]);
	
	onLoad((e)=>{
		refreshSelfVoteList();
	})
	
	
	const refreshSelfVoteList = async ()=>{
		const devicetype = SystemUtils.getDeviceType();
		let res = await user_vo.GetUserAllVoteInfosByToken(uni.Dal.userinfo.token , devicetype);
		
		votelist.value = res.data || [];
		console.log("===refreshSelfVoteList.data=====" , votelist.value);
	}
	
	const clickdetai = (vid) => {
		uni.redirectTo({
			url : "/pages/vote/voteui" + "?vid=" + vid,
		})
	}
	
	
</script>



<style lang="scss" scoped>

	.vote-cell{
		width: 100vw;
		//margin-left: 2vw;
		margin-top: 18rpx;
		background-color: #DDDDDD;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12rpx;
		padding-bottom: 18rpx;
	}
	
	.votetitle-cell{
		width: 100%;
		margin-top: 8rpx;
		//background-color: #DDDDDD;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 12rpx 0rpx;
	}
	
	
	.votefor2{
		width: 96vw;
		margin-top: 8rpx;
		display: flex;
		align-items: center;
		justify-content: space-around;
		
		.votecell{
			width: 40vw;
			height: 100%;
			padding: 12rpx 12rpx;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 18rpx;
			box-sizing: border-box;
			border: 1rpx solid black;
			background-color: #f0f4f8;
			
			.votecelltextview{
				width: 100%;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 18rpx;
				box-sizing: border-box;
			}
		}
		.activevotecell{
			border: 3rpx solid red;
		}
	}
	
	.voteforsingle{
		width: 95vw;
		margin-top: 18rpx;
		margin-bottom: 18rpx;
		display: flex;
		align-items: center;
		justify-content: space-around;
		background-color: #f0f4f8;
		
		.votecell-single{
			width: 92%;
			padding: 18rpx;
			//height: 168rpx;
			margin-top: 12rpx;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: space-around;
			border: 1rpx solid black;
			gap: 8rpx;
			
			.votecelltextview{
				width: 100%;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 18rpx;
				box-sizing: border-box;
			}
		}
		.activevotecell2{
			border: 3rpx solid red;
		}
	}
	
	.vs{
		width: 8vw;
		height: 8vw;
		background-color: blue;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: bold;
	}
</style>
