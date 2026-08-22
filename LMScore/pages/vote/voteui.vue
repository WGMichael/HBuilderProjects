<template>
	<view class="layout">
		<CustomNavbar :title="$t('vote_vote')"></CustomNavbar>
		
		<view class="info">
			<image :src="m_data.icon" mode="aspectFit"></image>
			<view class="name">{{m_data.name}}</view>
			<view style="display: flex; align-items: center;">
				<view class="exp">{{$t("exp") + "：" + m_data.exp}}</view>
				<up-icon style="margin-left: 68rpx;" name="reload" color="#2979ff" size="25" @click="reloadUserInfo"></up-icon>
			</view>
		</view>
		
		<view class="vote-cell" v-for="(votecell , i) in vote.title" :key="i" >
			<view style="width: 100%; padding: 18rpx 0rpx; display: flex; flex-direction: column; background-color: floralwhite;">
				<text style="font-weight: bold; font-size: 17px; margin-left: 18rpx; ">{{$t("title") + "：" + vote.title[i]}}</text>
				<view v-show="isselfcreate" style="width: 100%; display: flex; align-items: flex-end; justify-content: flex-start; gap: 28rpx; margin-top: 18rpx; margin-left: 28rpx;">
					<view class="" v-if="vote.status[i] == 1">
						<up-button class="btn-mgrvote-style" type="success" size="small" @click="clickVoteMgr_close(i)">{{$t('detail_close')}}</up-button>
					</view>
					<view class="" v-if="vote.status[i] == 1">
						<up-button class="btn-mgrvote-style" type="error" size="small" @click="clickVoteMgr_cancle(i)">{{$t('detail_cancle')}}</up-button>
					</view>
					<view class="" v-if="vote.status[i] == 2">
						<up-button class="btn-mgrvote-style" type="warning" size="small" @click="clickVoteMgr_result(i)">{{$t('detail_result')}}</up-button>
					</view>
					<view class="" v-if="vote.status[i] == 2">
						<up-button class="btn-mgrvote-style" type="primary" size="small" style="" @click="clickVoteMgr_open(i)">{{$t('detail_open')}}</up-button>
					</view>
				</view>
			</view>
			<view style="width: 100%; height: 68rpx; display: flex; align-items: center; justify-content: space-around; background-color: slategrey;">
				<text style="color: blue; font-size: 15px; margin-left: 18rpx;">{{$t('detail_votestatus') + "：" + Dal.systemsetting.getvoteStatus(vote.status[i])}}</text>
				<text style="color: blue; font-size: 15px; margin-left: 58rpx;">{{$t('vote_rang') + "：" + vote.min_vote[i] + " - " + vote.max_vote[i]}}</text>
			</view>
			<view v-if="!vote.issingle[i]" class="votefor2">
				<view class="votecell" :class="{activevotecell: select_voteindex == i && select_votesubindex == 0}">
					<view class="votecelltextview" @click="clickVote(i , 0)">
						<text style="font-size: 16px;">{{vote.subtitles[i][0]}}</text>
						<text>{{$t('rate') + "：" + vote.rates[i][0]}}</text>
						<text>{{$t('vote_selfvotecount') + "：" + selfvotecount[i][0]}}</text>
						<text style="font-size: 12px;">{{vote.cur_expins[i][0] + " / " + vote.user_vote_times[i][0] + $t('detail_times')}}</text>
					</view>
					<view style="width: 80%; display: flex; align-items: center; justify-content: center;">
						<button type="primary" size="mini" style="" @click="clickVoteInfoDetail(i,0)">{{$t('vote_detail')}}</button>
					</view>
				</view>
				<view class="vs">VS</view>
				<view class="votecell" :class="{activevotecell: select_voteindex == i && select_votesubindex == 1}">
					<view class="votecelltextview" @click="clickVote(i , 1)">
						<text>{{vote.subtitles[i][1]}}</text>
						<text>{{$t('rate') + "：" + vote.rates[i][1]}}</text>
						<text>{{$t('vote_selfvotecount') + "：" + selfvotecount[i][1]}}</text>
						<text style="font-size: 11px;">{{vote.cur_expins[i][1] + " / " + vote.user_vote_times[i][1] + $t('detail_times')}}</text>
					</view>
					<view style="width: 80%; display: flex; align-items: center; justify-content: center;">
						<button type="primary" size="mini" style="" @click="clickVoteInfoDetail(i,1)">{{$t('vote_detail')}}</button>
					</view>
				</view>
			</view> 
			<view v-else class="voteforsingle">
				<view class="votecell-single" :class="{activevotecell2: select_voteindex == i && select_votesubindex == 0}">
					<view class="votecelltextview" @click="clickVote(i , 0)">
						<text style="font-size: 16px;">{{vote.subtitles[i][0]}}</text>
						<text style="margin-left: 1rpx;">{{$t('rate') + "：" + vote.rates[i][0]}}</text>
						<text>{{$t('vote_selfvotecount') + "：" + selfvotecount[i][0]}}</text>
						<text style="font-size: 11px;">{{vote.cur_expins[i][0] + " / " + vote.user_vote_times[i][0] + $t('detail_times')}}</text>
					</view>
					<view style="width: 80%; display: flex; align-items: center; justify-content: center;">
						<button type="primary" size="mini" style="" @click="clickVoteInfoDetail(i,0)">{{$t('vote_detail')}}</button>
					</view>
				</view>
			</view>
		</view>
		
		<view style="width: 80%; display: flex; align-items: center; justify-content: center; margin-top: 128rpx;">
			<button type="primary" size="" style="" @click="clickRefreshVoteDetail">{{$t('detail_refresh')}}</button>
		</view>
		
		<uni-popup ref="popup" type="bottom" @change="PopUpStatusChange">
			<view class="popup">
				<view style="width: 90vw; height: 58rpx; display: flex; align-items: center; justify-content: space-between;" @click="ClosePopup">
					<view style="font-size: 14px; font-weight: bold;">{{$t('vote_expleft') + "：" + m_data.exp}}</view>
					<view style="font-size: 22px; margin-right: 12rpx; padding: 8rpx;">X</view>
				</view>
				<view style="width: 100vw; height: 1rpx; background-color: greenyellow; margin: 8rpx 0;"></view>
				
				<view style="width: 80vw; height: 88rpx; border: 1px solid grey; display: flex; align-items: center; justify-content: center;">
					<!-- <input type="number" style="text-align: center;" v-model="input_exp" :placeholder="$t('vote_input_count')"/> -->
					<up-input type="number" v-model="input_exp" placeholder="输入或选择数量" clearable customStyle="margin:0rpx 24rpx"/>
				</view>
				<view style="width: 90vw; display: flex; gap: 18rpx; justify-content: space-around; flex-wrap: wrap; margin-top: 18rpx;">
					<view class="selectcount-btn" :class="{ active: votecount_select == index }" v-for="(btncell, index) in votecount_btns" @click="ClickVoteCoutBtn(btncell ,index)">
						{{btncell}}
					</view>	
				</view>	
				<view v-if="select_voteindex >= 0" style="font-size: 13px; color: red; margin: 12rpx;">{{$t('vote_input_range') + "：" + vote.min_vote[select_voteindex] + " - " + vote.max_vote[select_voteindex]}}</view>
				<button type="primary" style="width: 60vw; margin: 28rpx 0rpx;" @click="ClickComfirm">{{$t('vote_comfirm')}}</button>
			</view>
		</uni-popup>
		
		<uni-popup ref="popupvotelist" type="bottom" @change="PopUpStatusChange2">
			<view class="popup-votelist">
				<view style="width: 90vw; height: 88rpx; display: flex; align-items: center; justify-content: space-between; " @click="ClosePopup2">
					<view style="font-size: 14px;">{{popupvotelisttitle}}</view>
					<view style="font-size: 22px; margin-right: 12rpx; padding: 8rpx;">X</view>
				</view>
				<view style="width: 100%; display: flex; gap: 1rpx; flex-direction: column;">
					<view class="voteinfo-cell" v-for="(votecell, index) in voteinfolist" @click="ClickVoteCoutBtn(btncell ,index)">
						<view style="font-size: 16px; margin-left: 68rpx;">{{votecell.username}}</view>
						<view style="font-size: 16px; margin-right: 68rpx;">{{votecell.votecountvalid + " / " + votecell.votecount}}</view>
					</view>	
				</view>	
			</view>
		</uni-popup>
	</view>
</template>

<script setup>
	import CustomNavbar from '@/pages/common/CustomNavbar.vue';
	import { ref , getCurrentInstance } from 'vue';
	import {onLoad , onUnload, onHide} from "@dcloudio/uni-app"
	import SystemUtils from '@/common/SystemUtils.js';
	
	
	const { proxy } = getCurrentInstance();
	const uo_createvo = uniCloud.importObject("createVoInfo");
	const uo_uservo = uniCloud.importObject("uservoteInfo");
	const popup = ref(null);
	const popupvotelist = ref(null);
	
	const vote = ref({});
	const isselfcreate = ref(false);
	const selfvotecount = ref([]);
	
	const m_data = ref({
		name:"",
		icon:"",
		exp:0
	})
	
	const select_voteindex = ref(-1);
	const select_votesubindex = ref(-1);
	const input_exp = ref("");
	const votecount_select = ref(-1);
	const votecount_btns = ref([10,30,50,80,100,200]);
	
	const voteinfolist = ref([]);
	let voteinfolist_titleindex = 0;
	let voteinfolist_subtitleindex = 0;
	const popupvotelisttitle = ref("");
	
	let voteid = 0;
	
	onLoad((e)=>{
		console.log("==onLoad=voteui===" ,e)
		if(e.vid){
			setVoteInfo(e.vid);
		}
		refreshPlayerData();
		uni.Events.on(uni.EventNames.Evt_UserInfo_Update , refreshPlayerData);
	})
	onUnload((e)=>{
		uni.Events.off(uni.EventNames.Evt_UserInfo_Update , refreshPlayerData);
	})
	onHide((e)=>{
		uni.Events.off(uni.EventNames.Evt_UserInfo_Update , refreshPlayerData);
	})
	
	const refreshPlayerData = ()=>{
		if(uni.Dal.userinfo.getInfo()){
			m_data.value.exp = uni.Dal.userinfo.getInfo().exp;
			m_data.value.name = uni.Dal.userinfo.getInfo().nickname;
			m_data.value.icon = uni.Dal.userinfo.getInfo().icon;
		}else{
			uni.navigateTo({
				url : "/pages/luoma/login/login"
			})
		}
	}
	const clickRefreshVoteDetail = ()=>{
		refreshVoteInfo();
	}
	//根据id， 去取同一时间starttime创建的记录。
	const setVoteInfo = (voteidV) => {
		voteid = voteidV;
		refreshVoteInfo();
	}

	const refreshVoteInfo = async () => {
		let res = await uo_createvo.GetVoteInfo(voteid);
		console.log("==refreshVoteInfo====" ,res)
		if(res.data.length > 0){
			vote.value = res.data[0];
			initSelf_voteinfos();
			isselfcreate.value = vote.value.creatorid == uni.Dal.userinfo.id;
			refreshUserVoteInfos();
		}
	}
	//同步投票数据，有多少个投票数据，多少个子标题，对应的投票数据
	const initSelf_voteinfos = (obj) => {
		obj = obj? obj : vote.value;
		selfvotecount.value = [];
		console.log("==initSelf_voteinfos====" ,obj)
		if(obj.title){
			for(let i = 0 ; i < obj.title.length ; i++)
			{
				let voteinfo = [];
				let selfvoteinfo = [];
				const subtitlecount = obj.issingle[i]? 1 : 2;
				for(let j = 0 ; j < subtitlecount ; j++)
				{
					voteinfo.push({all:obj.cur_expins[i][j] || 0, person:obj.user_vote_times[i][j] || 0});
					selfvoteinfo.push(0);
				}
				selfvotecount.value.push(selfvoteinfo);
			}
		}
	}
	
	//刷新用户投票数据，更新数据，并更新显示
	const refreshUserVoteInfos = async () => {
		const res1 = await uo_uservo.GetUserVoteInfoByUID(voteid , uni.Dal.userinfo.id);
		console.log("===refreshUserVoteInfos===df===" , res1)
		initSelf_voteinfos();
		if(res1.data.length > 0){
			const uservoteinfos = res1.data;
			for(let i = 0 ; i < uservoteinfos.length ; i++){
				const uservotecell = uservoteinfos[i];
				if(!selfvotecount.value[uservotecell.votetitleindex]){
					selfvotecount.value[uservotecell.votetitleindex] = [];
				}
				if(!selfvotecount.value[uservotecell.votetitleindex][uservotecell.vote_targetindex]){
					selfvotecount.value[uservotecell.votetitleindex][uservotecell.vote_targetindex] = 0;
				}
				selfvotecount.value[uservotecell.votetitleindex][uservotecell.vote_targetindex] += uservotecell.votecount
			}
		}
		console.log("===refreshUserVoteInfos======" , res1)
	}
	
	const refreshVoteListInfos = async () => {
		console.log("===voteid====" , voteid)
		console.log("===uni.Dal.userinfo.id====" , uni.Dal.userinfo.id)
		console.log("===voteinfolist_titleindex====" , voteinfolist_titleindex)
		console.log("===voteinfolist_subtitleindex====" , voteinfolist_subtitleindex)
		const res1 = await uo_uservo.GetUserVoteInfoByTitleAndSubTitleindex(voteid , voteinfolist_titleindex, voteinfolist_subtitleindex);
		console.log("===refreshVoteListInfos===df===" , res1)
		if(res1.data.length > 0){
			voteinfolist.value = res1.data;
		}
	}
	
	const reloadUserInfo = ()=>{
		uni.Dal.userinfo.refreshUserExp(true);
	}
	const PopUpStatusChange = (e) => {
		if(!e.show){
			select_voteindex.value = -1;
			select_votesubindex.value = -1;
			votecount_select.value = -1;
			input_exp.value = "";
		}
	}
	const PopUpStatusChange2 = (e) => {
		if(!e.show){
			voteinfolist_titleindex = 0;
			voteinfolist_subtitleindex = 0;
		}
	}
	
	const ClosePopup = (index , index1) => {
		popup.value.close();
		votecount_select.value = -1;
	}
	const ClosePopup2 = (index , index1) => {
		popupvotelist.value.close();
	}
	const clickVote = (index , index1) => {
		select_voteindex.value = index;
		select_votesubindex.value = index1;
		popup.value.open();
	}
	const clickVoteInfoDetail = (index , index1) => {
		voteinfolist_titleindex = index;
		voteinfolist_subtitleindex = index1;
		voteinfolist.value = [];
		const Title = vote.value.title[voteinfolist_titleindex] || "";
		const subtitle = vote.value.subtitles[voteinfolist_titleindex] ? vote.value.subtitles[voteinfolist_titleindex][voteinfolist_subtitleindex] : "";
		popupvotelisttitle.value = Title + " :  " + subtitle;
		popupvotelist.value.open();
		refreshVoteListInfos();
	}
	
	const ClickVoteCoutBtn = (count , index) => {
		votecount_select.value = index;
		input_exp.value = count;
	}
	const ClickComfirm = () => {
		  HandleVoteComfirm() 
	}
	const clickVoteInfoMgr =()=>{
		
	}
	const clickVoteMgr_close =(index)=>{
		const Title = vote.value.title[voteinfolist_titleindex] || "";
		uni.showModal({
		  title:Title,
		  content: "确认锁定掉该标题？",
		  success: (res) => {
		  	if(res.confirm){
		  		Todo_LockVote(voteid, index)
		  	}
		  }
		})
	}
	const Todo_LockVote = async (voteid, index)=>{
		const devicetype = SystemUtils.getDeviceType();
		const res = await uo_createvo.LockVote(uni.Dal.userinfo.token , devicetype, voteid, index);
		if(res.result == 0){
			vote.value.status[index] = 2;
			uni.showToast({
				title: "操作成功" ,
				icon:'none'
			})
		}else{
			uni.showToast({
				title: "操作失败，请重试",
				icon:'none'
			})
		}
	}
	const clickVoteMgr_cancle =(index)=>{
		const Title = vote.value.title[voteinfolist_titleindex] || "";
		uni.showModal({
		  title:Title,
		  content: "确认取消掉该标题？",
		  success: (res) => {
		  	if(res.confirm){
		  		Todo_CancleVote(voteid, index);
		  	}
		  }
		})
	}
	const Todo_CancleVote = async (voteid, index)=>{
		const devicetype = SystemUtils.getDeviceType();
		const res = await uo_createvo.CancleVote(uni.Dal.userinfo.token , devicetype, voteid, index);
		if(res.result == 0){
			vote.value.status[index] = 3;
			uni.showToast({
				title: "操作成功" ,
				icon:'none'
			})
			uni.Dal.userinfo.refreshUserExp(true);
		}else{
			uni.showToast({
				title: "操作失败，请重试",
				icon:'none'
			})
		}
	}
	
	
	const clickVoteMgr_result =(index)=>{
		const Title = vote.value.title[voteinfolist_titleindex] || "";
		uni.showModal({
		  title:Title,
		  content: "确认结算该标题？" + Title,
		  success: (res) => {
		  	if(res.confirm){
		  		//uo_createvo.ResultVote(voteid, index ,results)
		  	}
		  }
		})
	}
	const clickVoteMgr_open =(index )=>{
		const Title = vote.value.title[voteinfolist_titleindex] || "";
		uni.showModal({
		  title:Title,
		  content: "确认解锁该标题？" + Title,
		  success: (res) => {
		  	if(res.confirm){
		  		Todo_OpenVote(voteid, index)
		  	}
		  }
		})
	}
	const Todo_OpenVote = async (voteid, index)=>{
		const devicetype = SystemUtils.getDeviceType();
		const res = await uo_createvo.OpenVote(uni.Dal.userinfo.token , devicetype, voteid, index);
		if(res.result == 0){
			vote.value.status[index] = 1;
			uni.showToast({
				title: "操作成功" ,
				icon:'none'
			})
		}else{
			uni.showToast({
				title: "操作失败，请重试",
				icon:'none'
			})
		}
	}
	   
	const HandleVoteComfirm = async () => {
		let num = Number(input_exp.value);
		let tips = "";
		console.log("===input_exp.value===" , input_exp.value)
		if (!num) {
			tips = proxy.$t('vote_input_count');
		}
	
		const pre_exp = selfvotecount.value[select_voteindex.value][select_votesubindex.value];
		const add_allexp = pre_exp + num;
		const min_vote = Number(vote.value.min_vote[select_voteindex.value]);
		const max_vote = Number(vote.value.max_vote[select_voteindex.value]);
		
		if(uni.Dal.userinfo.getInfo().id == vote.value.creatorid && !vote.value.issystem[select_voteindex.value]){
			tips = proxy.$t('vote_exp_error3');
		}else{
			if (add_allexp >= min_vote && add_allexp <= max_vote) {
			} else {
			  tips = proxy.$t('vote_exp_error2');
			}
		}
		
		if(tips != ""){
			uni.showToast({
				title: tips ,
				icon:'none'
			})
		}else{
			const devicetype = SystemUtils.getDeviceType();
			let res = await uo_uservo.UserVote(uni.Dal.userinfo.token, devicetype, vote.value._id ,select_voteindex.value, select_votesubindex.value, vote.value.title[select_voteindex.value], 
						vote.value.subtitles[select_voteindex.value][select_votesubindex.value], num , uni.Dal.userinfo.nickname);
			
			console.log("====UserVote===res====" , res)
			if(res.id && res.id.length > 0){
				if(res.userleftexp != null){
					uni.Dal.userinfo.setExp(res.userleftexp);
					m_data.value.exp = res.userleftexp;
				}
				
				ClosePopup();
				refreshVoteInfo();
				uni.showToast({
					title: proxy.$t('vote_exp_success'),
					icon:'none'
				})
			}else{
				uni.showToast({
					title: res.errMsg ,
					icon:'none'
				})
			}
		}
	}
	
</script>



<style lang="scss" scoped>
	.layout{
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	
	.info{
		width: 100vw;
		margin-top: 30rpx;
		display: flex;
		align-items: center;
		gap: 20rxp;
		
		image{
			width: 120rpx;
			height: 120rpx;
		}
		.name{
			margin-left: 10rpx;
		}
		.exp{
			color: green;
			margin-left: 50rpx;
		}
	}
	
	.vote-cell{
		width: 96vw;
		margin-top: 18rpx;
		
		display: flex;
		flex-direction: column;
		gap: 3rpx;
		
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

	.popup{
		width: 100vw;
		background-color: white;
		padding: 20rpx 20rpx;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 28rpx;
	}
	.popup-votelist{
		width: 100vw;
		min-height: 268px;
		background-color: white;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8rpx;
	}
	
	.selectcount-btn{
		width: 25vw; 
		height: 50rpx; 
		display: flex; 
		align-items: center; 
		justify-content: center; 
		border: 1rpx solid black;
		background-color: white;
		color: black;
	} 
	.active {
	   border-color: blue;
	   background-color: #e0f0ff;
	   color: red;
	}
	.voteinfo-cell{
		width: 100%;
		height: 68rpx;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background-color: #e0f0ff;
	}
	
	.btn-mgrvote-style{
		 width: 188rpx;
		 height: 68rpx;
		 font-size: 16px;
		//height: 48rpx;
	}
</style>
