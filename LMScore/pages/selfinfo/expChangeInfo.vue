<template>
	<view>
		<CustomNavbar :title="$t('uservote_title')"></CustomNavbar>
		<view class="record-cell" v-for="(record , i) in recordlist" :key="record._id">
			<view style="width: 100%; height: 68rpx; display: flex; align-items: center; justify-content: space-between;">
				<view style="font-size: 18px; margin-left: 28rpx;">{{Dal.systemsetting.getexprecord_type_Des(record.type)}}</view>
				<view style="font-size: 16px; margin-right: 28rpx;">{{$t("exp_record_change") + "：" + record.exp_change}}</view>
			</view>
			<view style="width: 100%; height: 38rpx; display: flex; align-items: center; justify-content: space-between;">
				<text style="font-size: 15px; margin-left: 28rpx;">{{$t("vote_title") + "：" + record.vo_title}}</text>
				<text style="font-size: 16px; margin-right: 28rpx;">{{$t("uservote_votetarget") + "：" + record.vo_target_title}}</text>
			</view>
			<view style="width: 100%; height: 38rpx; display: flex; align-items: center; justify-content: space-between;">
				<text style="font-size: 15px; margin-left: 28rpx;">{{$t("exp_record_before_after") + "：" + record.exp_before + " / " + record.exp_after}}</text>
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
	const ExpChangeRecord_vo = uniCloud.importObject("ExpChangeRecord");
	
	const recordlist = ref([]);
	
	
	onLoad((e)=>{
		refreshSelfRecordList();
	})
	
	
	const refreshSelfRecordList = async ()=>{
		const devicetype = SystemUtils.getDeviceType();
		let res = await ExpChangeRecord_vo.GetUserExpRecords(uni.Dal.userinfo.token , devicetype);
		
		recordlist.value = res.data || [];
		console.log("===refreshSelfRecordList.data=====" , recordlist.value);
	}
	
	
</script>



<style lang="scss" scoped>

	.record-cell{
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
	
	
	
</style>
