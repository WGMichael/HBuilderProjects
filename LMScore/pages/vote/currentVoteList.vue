<template>
	<view>
		<CustomNavbar :title="$t('current_votes')"></CustomNavbar>
		<view class="vote-cell" v-for="(vote , i) in votelist" :key="vote._id">
			<view class="votetitle-cell" v-for="(titlecell , j) in vote.title" :key="j">
				<view style="width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8rpx;">
					<text style="color: blue; font-weight: bold; font-size: 16px; margin-top: 8rpx;">{{$t('detail_votestatus') + "：" + Dal.systemsetting.getvoteStatus(vote.status[j])}}</text>
					<text style="font-size: 15px; margin-left: 18rpx;">{{$t("vote_title") + "：" + vote.title[j]}}</text>
				</view>
			</view>
			<button type="primary" size="mini" style="width: 30vw;" @click="clickdetai(vote._id)">{{$t('detail')}}</button>
		</view>
	</view>
</template>

<script setup>
	import CustomNavbar from '@/pages/common/CustomNavbar.vue';
	import { ref , getCurrentInstance } from 'vue';
	import {onLoad, onHide , onUnload} from "@dcloudio/uni-app"
	
	const { proxy } = getCurrentInstance();
	const create_vo = uniCloud.importObject("createVoInfo");
	
	const votelist = ref([]);
	
	
	onLoad((e)=>{
		refreshCurrentVoteList();
	})
	
	
	const refreshCurrentVoteList = async ()=>{
		let res = await create_vo.GetCurrentVoteInfos();
		
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
		width: 96vw;
		margin-left: 2vw;
		margin-top: 18rpx;
		background-color: lightgrey;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12rpx;
		padding-bottom: 18rpx;
	}
	
	.votetitle-cell{
		width: 100%;
		margin-top: 8rpx;
		background-color: lightgrey;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 12rpx 0rpx;
	}
</style>
