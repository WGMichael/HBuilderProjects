<template>
	<view class="layout">
		<CustomNavbar :title="$t('detail_detail')"></CustomNavbar>
		
		<view class="vote-cell" v-for="(vote , i) in votes" :key="vote._id">
			<view style="width: 100%; height: 78rpx; display: flex; align-items: center; justify-content: flex-start; background-color: floralwhite;">
				<text style="color: blue; font-weight: bold; font-size: 16px; margin-left: 18rpx;">{{$t('detail_votestatus') + "（" + Dal.systemsetting.getvoteStatus(vote.status) + "）"}}</text>
				<!-- 0-开放，1-锁定，2-结束，3-撤消 -->
				<button v-if="vote.status == 0" size="mini" style="width: 128rpx;" type="warn" @click="(e)=>{clickCancle(i)}">{{$t('detail_cancle')}}</button>
				<button v-if="vote.status == 0" size="mini" style="width: 128rpx; margin-left: -38rpx;" type="primary" @click="(e)=>{clickClose(i)}">{{$t('detail_close')}}</button>
				<button v-if="vote.status == 1" size="mini" style="width: 128rpx;" type="primary" @click="(e)=>{clickOpen(i)}">{{$t('detail_open')}}</button>
				<button v-if="vote.status == 1" size="mini" style="width: 128rpx; margin-left: -38rpx;" type="warn" @click="(e)=>{clickResult(i)}">{{$t('detail_result')}}</button>
			</view>
			
			<view class="content">
				<text style="font-weight: bold; font-size: 18px; margin-left: 18rpx; margin-top: 18rpx;">{{$t("vote_title") + "：" + vote.title}}</text>
				<view v-if="vote.istwoplayer == 1" class="votefor2">
					<view class="votecell">
						<text>{{vote.subtitles[0]}}</text>
						<text>{{$t('rate') + "：" + vote.rates[0]}}</text>
						<view class="btn-detail" @click="clickDetail(i , 0)">{{$t('vote_detail') + " > "}}</view>
						<text style="font-size: 11px;">{{player_voteinfos[i][0].all + " / " + player_voteinfos[i][0].person + $t('detail_times')}}</text>
					</view>
					<view class="vs">VS</view>
					<view class="votecell">
						<text>{{vote.subtitles[1]}}</text>
						<text>{{$t('rate') + "：" + vote.rates[1]}}</text>
						<view class="btn-detail" @click="clickDetail(i , 1)">{{$t('vote_detail') + " > "}}</view>
						<text style="font-size: 11px;">{{player_voteinfos[i][1].all + " / " + player_voteinfos[i][1].person + $t('detail_times')}}</text>
					</view>
					
				</view>
				<view v-else class="voteformul">
					<view class="votecell-mul" v-for="(sbcell,sti) in vote.subtitles" :key="sti">
						<text style="font-size: 16px;">{{$t('title') + "：" +  vote.subtitles[sti]}}</text>
						<text style="margin-left: 128rpx;">{{$t('rate') + "：" + vote.rates[sti]}}</text>
						<view class="btn-detail" @click="clickDetail(i , sti)">{{$t('vote_detail') + " > "}}</view>
						<text style="font-size: 11px;">{{player_voteinfos[i][sti].all + " / " + player_voteinfos[i][sti].person + $t('detail_times')}}</text>
					</view>
				</view>
			</view>
			
			<view class="vote-setting">
				<view class="setting-cell">
					<text>{{$t('votecreate_need') + "：" + vote.create_cost}}</text>
				</view>
				<view class="setting-cell-interval"></view>
				
				<view class="setting-cell">
					<text>{{$t('detail_allcount') + "：" + vote.allexp_vote}}</text>
				</view>
				<view class="setting-cell-interval"></view>
				
				<view class="setting-cell">
					<text>{{$t('detail_exprange') + "：" + vote.min_vote + " - " + vote.max_vote}}</text>
				</view>
				<view class="setting-cell-interval"></view>
				
			</view>
		</view>
		
		<uni-popup ref="popup" @change="PopUpStatusChange">
			<view v-if="selectedvoteindex >= 0" class="result">
				<view style="margin: 8rpx 0rpx; font-size: 18px;">{{$t('vote_reuslt_title')}}</view>
				<view v-if="selectedvote.istotalresult" style="width: 75vw; display: flex; flex-direction: column; align-items: flex-start;">
					<u-radio-group v-model="radiovalue1" @change="onCheckboxChange" placement="column">
						<view v-for="(sbcell,sti) in selectedvote.subtitles" class="resultcell" :key="sti">
							<u--radio :name="radioitems[sti].name"></u--radio>
							<view style="display: flex; flex-direction: column;">
								<text>{{$t('title') + "：" + selectedvote.subtitles[sti]}}</text>
								<view style="display: flex; align-items: center; gap: 38rpx;">
									<text>{{$t('rate') + "：" + selectedvote.rates[sti]}}</text>
									<text style="font-size: 11px;">{{player_voteinfos[selectedvoteindex][sti].all + $t('exp') + " / " + player_voteinfos[selectedvoteindex][sti].person + $t('detail_times')}}</text>
								</view>
							</view>
						</view>
					</u-radio-group>
				</view>
				<view v-else style="width: 75vw; display: flex; flex-direction: column; align-items: flex-start;">
					<view v-for="(sbcell,sti) in selectedvote.subtitles" class="resultcell2" :key="sti">
						<view style="display: flex; flex-direction: column;">
							<text>{{$t('title') + "：" + selectedvote.subtitles[sti]}}</text>
							<view style="display: flex; align-items: center; gap: 38rpx;">
								<text>{{$t('rate') + "：" + selectedvote.rates[sti]}}</text>
								<text style="font-size: 11px;">{{player_voteinfos[selectedvoteindex][sti].all + $t('exp') + " / " + player_voteinfos[selectedvoteindex][sti].person + $t('detail_times')}}</text>
							</view>
						</view>
						<view style="width: 25vw; height: 50rpx; margin-right: 8rpx; display: flex; align-items: center; justify-content: center; background-color: aliceblue;">
							<input style="text-align: center; margin: 0rpx 5rpx; font-size: 13px;" type="number"
								v-model="resultinputs[sti]" :placeholder="$t('vote_reuslt_input_score')" />
						</view>
					</view>
				</view>
				
				<button style="width: 50vw; margin-top: 18rpx;" type="primary" @click="ClickComfirmResult">{{$t('comfirm')}}</button>
			</view>
			
		</uni-popup>
	</view>
	
	
	
</template>

<script setup>
	// import { ref } from 'vue';
	// import { getCurrentInstance } from 'vue';
	import CustomNavbar from '@/pages/luoma/common/CustomNavbar.vue';
	import { ref , getCurrentInstance } from 'vue';
	import {onLoad} from "@dcloudio/uni-app"
import { number } from '../../../uni_modules/uview-plus/libs/function/test';
	
	const { proxy } = getCurrentInstance();
	const uo_vo = uniCloud.importObject("vo-About");
	
	const votes = ref([]);
	const player_voteinfos = ref([]);
	
	const popup = ref(null);
	const selectedvote = ref({});
	const selectedvoteindex = ref(-1);
	const radioitems = ref([]);
	const radiovalue1 = ref('');
	const resultinputs = ref([]);
	
	let voteids = [];
	
	onLoad((e)=>{
		 console.log("===onLoad===",e); // {ids: '6863c18c09664cca986b4e42'}
		if(e.ids){
			console.log("===onLoad===",e.ids); 
			let voteids0 = e.ids.split("$");
			setVoteInfos(voteids0);
			console.log("===onLoad=voteids==",voteids);
		}else if(e.id){
			console.log("===onLoad===",e.id);
			setVoteInfo(e.id);
		}
	})
	
	//根据id， 去取同一时间starttime创建的记录。
	const setVoteInfo = (voteid) => {
		getRelateiveVotes(voteid);
	}
	const getRelateiveVotes = async (voteid) => {
		let vids = [];
		vids.push(voteid);
		let res = await uo_vo.GetVoteInfos(vids);
		if(res.errCode == 0 && res.data.length > 0){
			let starttime = res.data[0].starttime;
			let res1 = await uo_vo.GetCreateVoteInfosByStartTime(starttime);
			if(res1.errCode == 0){
				votes.value = res1.data;
				voteids = [];
				for(var i = 0 ; i < res1.data.length ; i++){
					voteids.push(res1.data[i]._id);
				}
				refreshUserVoteInfos();
			}
		}
	}

	const setVoteInfos = (voteids0) => {
		voteids = voteids0;
		refreshVoteInfos();
	}
	const refreshVoteInfos = async () => {
		let res = await uo_vo.GetVoteInfos(voteids);
		if(res.errCode == 0){
			votes.value = res.data;
			refreshUserVoteInfos();
		}
	}
	
	//同步投票数据，有多少个投票数据，多少个子标题，对应的投票数据
	const syncplayer_voteinfos = () => {
		player_voteinfos.value = [];
		for(let i = 0 ; i < votes.value.length ; i++)
		{
			let votecell = votes.value[i];
			let voteinfo = [];
			for(let j = 0 ; j < votecell.subtitles.length ; j++)
			{
				voteinfo.push({all:0, person:0});
			}
			player_voteinfos.value.push(voteinfo);
		}
	}
	
	//刷新用户投票数据，更新数据，并更新显示
	const refreshUserVoteInfos = async () => {
		syncplayer_voteinfos();
		let res1 = await uo_vo.GetUserVoteInfos(voteids);
		if(res1.errCode == 0){
			let uservoteinfos = res1.data;
			console.log("===player_voteinfos====" , player_voteinfos.value);
			for(let i = 0 ; i < uservoteinfos.length ; i++){
				let uservotecell = uservoteinfos[i];
				let vid = uservotecell.voteid;
				let index = voteids.indexOf(vid);
				let bindex = uservotecell.vote_target;
				player_voteinfos.value[index][bindex].person = player_voteinfos.value[index][bindex].person + 1;
				player_voteinfos.value[index][bindex].all = Number(player_voteinfos.value[index][bindex].all) + Number(uservotecell.votecount);
			}
		}
	}
	
	const clickCancle = (i) => {
		clickCancle0(i);
	}
	const clickClose = (i) => {
		clickClose0(i);
	}
	const clickOpen = (i) => {
		clickOpen0(i);
	}
	const clickResult = (i) => {
		selectedvote.value = votes.value[i];
		selectedvoteindex.value = i;
		radioitems.value = [];
		resultinputs.value = [];
		for(let i = 0 ; i < selectedvote.value.subtitles.length ; i ++){
			//后缀加多个index，避免subtitle重复的
			radioitems.value.push({name : selectedvote.value.subtitles[i]+""+i , disabled: false});
			resultinputs.value.push("");
		}
		radiovalue1.value = selectedvote.value.subtitles[0]+"0";
		popup.value.open();
	}
	
	const ClickComfirmResult = (e) => {
		let result = [];
		if(selectedvote.value.istotalresult){
			for(let i = 0 ; i < radioitems.value.length ; i++){
				console.log("==radioitems.value[i].value==" , radioitems.value[i])
				if(radioitems.value[i].name == radiovalue1.value){
					result.push(1);
				}else{
					result.push(0);
				}
			}
		}else{
			for(let i = 0 ; i < resultinputs.value.length ; i++){
				let numstr = resultinputs.value[i];
				result.push(Math.floor(numstr));
			}
		}
		clickResult0(result);
	}
	
	const onCheckboxChange = (e) => {
		console.log("==onCheckboxChange==" , e)
	}
	
   const clickCancle0 = async (i) => {
		let voteinfo = votes.value[i];
		let res = await uo_vo.CancleVote(voteinfo._id);
		if(res.errCode == 0){
			voteinfo.status = 3;
			uni.Events.emit(uni.EventNames.Evt_VoteStatus_Update , {vid:voteinfo._id , stautstype: 3})
			uni.Dal.userinfo.setExp(res.newexp);
			uni.showToast({
				title : uni.$t('detail_cancle_reuslt_0')
			})
		}else{
			uni.showToast({
				title : res.errMsg
			})
		}
   }
   const clickClose0 = async (i) => {
		let voteinfo = votes.value[i];
		let res = await uo_vo.UpdateVoteStatus(voteinfo._id , 1);
		if(res.errCode == 0){
			console.log("=========clickClose0=====00====")
			uni.Events.emit(uni.EventNames.Evt_VoteStatus_Update , {vid:voteinfo._id , stautstype: 1})
			voteinfo.status = 1;
		}
   }
   const clickOpen0 = async (i) => {
		let voteinfo = votes.value[i];
		let res = await uo_vo.UpdateVoteStatus(voteinfo._id , 0);
		if(res.errCode == 0){
			uni.Events.emit(uni.EventNames.Evt_VoteStatus_Update , {vid:voteinfo._id , stautstype: 0})
			voteinfo.status = 0;
		}
   }
   const clickResult0 = async (result) => {
	    let i = selectedvoteindex.value;
		let voteinfo = votes.value[i];
		let res = await uo_vo.ResultVote(voteinfo._id , result);
		console.log("===clickResult0==index==" , res);
		if(res.errCode == 0){
			voteinfo.status = 2;
			uni.Events.emit(uni.EventNames.Evt_VoteStatus_Update , {vid:voteinfo._id , stautstype: 2})
			uni.Dal.userinfo.setExp(res.newexp);
			
			uni.showModal({
			  content: proxy.$t('detail_reuslt_0'),
			  showCancel: false,
			  success: (res) => {
			  	if(res.confirm){
			  		popup.value.close();
			  	}
			  }
			})
		}else{
			
		}
   }
   
   const clickDetail = (index , index1) => {
	   console.log("===clickDetail==index==" + index + "=====index1====" + index1);
   }
   const PopUpStatusChange = (e) => {
   	if(!e.show){
   		// select_voteindex.value = -1;
   		// select_votesubindex.value = -1;
   		// input_exp.value = "";
   	}
   }
	
</script>

<style lang="scss" scoped>
	.layout{
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20rpx;
		
		.vote-cell{
			margin-top: 38rpx;
			
			.content{
				width: 95vw;
				margin-top: 12rpx;
				background-color: #f0f4f8;
				display: flex;
				flex-direction: column;
				
			}
			
		}
	}
	
	.votefor2{
		width: 95vw;
	//	height: 200rpx;
		margin-top: 18rpx;
		display: flex;
		align-items: center;
		justify-content: space-around;
		background-color: #f0f4f8;
		
		.votecell{
			width: 43vw;
			height: 100%;
			margin-top: 12rpx;
			margin-bottom: 18rpx;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 18rpx;
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
	}
	.voteformul{
		width: 95vw;
		margin-top: 18rpx;
		margin-bottom: 18rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-around;
		background-color: #f0f4f8;
		.votecell-mul{
			width: 92%;
			height: 68rpx;
			margin-top: 12rpx;
			display: flex;
			align-items: center;
			justify-content: space-around;
			border-bottom: 1px solid #e0e0e0;
		}
	}
	
	
	.btn-detail{
		display: flex;
		align-items: center;
		height: 36rpx;
		border-radius: 18rpx;
		border: 1px solid royalblue;
		padding: 1rpx 13rpx;
		font-size: 12px;
		color: royalblue;
	}
	
	.vote-setting{
		width: 95vw;
		margin-top: 3rpx;
		padding: 12rpx 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		background-color: #f0f4f8;
		
		.setting-cell{
			padding-left: 28rpx;
			width: 95vw;
			height: 98rpx;
			display: flex;
			align-items: center;
		}
		
		.setting-cell-interval{
			width: 95%;
			height: 1rpx;
			background-color: lightgrey;
		}
		
	}
	
	.speech-bubble {
	 // width: 40vw;
	  height: 80rpx;
	  background-color: #d9e1ec;
	  border-radius: 8rpx;
	  position: relative;
	//  color: #fff;
	  text-align: center;
	  line-height: 30rpx;
	  margin: 10rpx auto;
	}
	
	/* 上方小箭头 */
	.speech-bubble::before {
	  content: "";
	  position: absolute;
	  top: -35rpx;
	  left: 50%;
	  transform: translateX(-50%);
	  border-width: 10px;
	  border-style: solid;
	  border-color: transparent transparent #d9e1ec transparent;
	}
	
	.result{
		width: 80vw;
		border-radius: 8rpx;
		max-height: 50vh;
		background-color: white;
		padding: 20rpx 20rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 28rpx;
		
		.resultcell{
			display: flex;
			align-items: center;
			gap: 18rpx;
			margin-top: 18rpx;
		}
		
		.resultcell2{
			width: 100%;
			margin-top: 28rpx;
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 12rpx 8rpx;
			background-color: #eeeeee;
		}
	}
	
	
</style>