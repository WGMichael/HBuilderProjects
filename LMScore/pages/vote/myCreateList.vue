<template>
	<view>
		<CustomNavbar :title="$t('mycreate')"></CustomNavbar>
		<view class="vote-cell" v-for="(vote , i) in votelist" :key="vote._id">
			<view class="votetitle-cell" v-for="(titlecell , j) in vote.title" :key="j">
				<view style="width: 100%; padding: 12rpx 0rpx; display: flex; flex-direction: row; align-items: center; justify-content: space-between; background-color: floralwhite;">
					<text style="font-size: 16px; margin-left: 18rpx;">{{$t("title") + "：" + vote.title[j]}}</text>
					<text style="color: blue; font-size: 13px; margin-top: 8rpx; margin-right: 28rpx;">{{$t('detail_votestatus') + "：" + Dal.systemsetting.getvoteStatus(vote.status[j])}}</text>
				</view>
				
				<view v-if="!vote.issingle[j]" class="votefor2">
					<view class="votecell">
						<view class="votecelltextview" >
							<text style="font-size: 16px;">{{vote.subtitles[j][0]}}</text>
							<text>{{$t('rate') + "：" + vote.rates[j][0]}}</text>
							<text style="font-size: 12px;">{{vote.cur_expins[j][0] + " / " + vote.user_vote_times[j][0] + $t('detail_times')}}</text>
						</view>
					</view>
					<view class="vs">VS</view>
					<view class="votecell">
						<view class="votecelltextview">
							<text>{{vote.subtitles[j][1]}}</text>
							<text>{{$t('rate') + "：" + vote.rates[j][1]}}</text>
							<text style="font-size: 11px;">{{vote.cur_expins[j][1] + " / " + vote.user_vote_times[j][1] + $t('detail_times')}}</text>
						</view>
					</view>
				</view> 
				<view v-else class="voteforsingle">
					<view class="votecell-single">
						<view class="votecelltextview">
							<text style="font-size: 16px;">{{vote.subtitles[j][0]}}</text>
							<text style="margin-left: 1rpx;">{{$t('rate') + "：" + vote.rates[j][0]}}</text>
							<text style="font-size: 11px;">{{vote.cur_expins[j][0] + " / " + vote.user_vote_times[j][0] + $t('detail_times')}}</text>
						</view>
					</view>
				</view>
				
				<text style="font-size: 16px; margin-top: 18rpx;">{{$t('votesetting_all') + "：" + vote.allexp_gap[j]}}</text>
				
			</view>
			<button type="primary" size="mini" style="width: 30vw;" @click="clickdetai(vote._id)">{{$t('detail')}}</button>
		</view>
	</view>
</template>

<script setup>
	import CustomNavbar from '@/pages/common/CustomNavbar.vue';
	import { ref , getCurrentInstance } from 'vue';
	import {onLoad, onHide , onUnload} from "@dcloudio/uni-app"
	import SystemUtils from '@/common/SystemUtils.js';
	
	
	const { proxy } = getCurrentInstance();
	const create_vo = uniCloud.importObject("createVoInfo");
	
	const votelist = ref([]);
	
	const player_voteinfos = ref([]);
	
	onLoad((e)=>{
		refreshCurrentVoteList();
	})
	
	
	const refreshCurrentVoteList = async ()=>{
		const devicetype = SystemUtils.getDeviceType();
		let res = await create_vo.GetUserCreateVoteInfosByUid(uni.Dal.userinfo.token , devicetype);
		
		votelist.value = res.data || [];
		console.log("===votelist.data=====" , votelist.value);
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
