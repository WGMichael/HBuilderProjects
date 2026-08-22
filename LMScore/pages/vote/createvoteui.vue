<template>
	<view class="layout">
		<CustomNavbar :title="$t('create_vote')"></CustomNavbar>
		
		<view style="width: 100%; display: flex; align-items: center; margin-top: 38rpx;">
			<text style="margin-left: 38rpx; font-size: 18px; color: black;">{{$t('exp') + "：" + selfExp}}</text>
			<text style="margin-left: 38rpx; font-size: 13px;">{{"（ "+$t('votecreate_need') + "：" + Dal.systemsetting.getCreatevoteneed() + " ）"}}</text>
		</view>
		
		<view style="margin-top: 28rpx; width: 100vw; display: flex; flex-direction: column; align-items: center;" v-for="(vocell , i) in voteData" :key="i">
			<view style="width: 95vw;display: flex; flex-direction: column; align-items: center; margin-top: 0rpx;">
				<view style="width: 100%; height: 68rpx; display: flex; align-items: center; justify-content: space-between; background-color: darkgray;">
					<text style="color: blue; font-weight: bold; font-size: 20px; margin-left: 8rpx;">{{$t('create_vote') + " " + (i+1)}}</text>
					<view>
						<button size="mini" style="margin-top: 8rpx; margin-right: 28rpx;" type="warn" @click="(e)=>{clickDel_vo(i)}">{{"删除标题 " + (i+1)}}</button>
					</view>
				</view>
				<view class="title-input">
					<up-input fontSize="24" color="#FF2222" placeholderStyle="color:#FF8888" customStyle="border: 2px #BBBBBB solid;" :placeholder="$t('input_vote_title')" v-model="vocell.title" clearable ></up-input>
				</view>
			</view>
			
			
			<view style="width: 95vw; height: 68rpx; display: flex; align-items: flex-start; align-items: center; margin-top: 2px; background-color: #f0f4f8;">
				<text style="margin-left: 12rpx;">{{$t('is_sys')+ ": "}}</text>
				<switch style="margin-left: 38rpx; transform: scale(0.78);" size="mini"  @change="(e)=>{onSwitchIsSysResult(e,i)}" :checked="vocell.issys" />
			</view>
			<view style="width: 95vw; height: 68rpx; display: flex; align-items: flex-start; align-items: center; margin-top: 1px; background-color: #f0f4f8;">
				<text style="margin-left: 12rpx;">{{$t('is_totalresult')+ ": "}}</text>
				<switch style="margin-left: 38rpx; transform: scale(0.78);" size="mini"  @change="(e)=>{onSwitchIsTotalResult(e,i)}" :checked="vocell.istotalresult" />
			</view>
			<view style="width: 95vw; height: 68rpx; display: flex; align-items: flex-start; align-items: center; margin-top: 1px; background-color: #f0f4f8;">
				<text style="margin-left: 12rpx;">{{$t('is_single')+ ": "}}</text>
				<switch style="margin-left: 38rpx; transform: scale(0.78);" size="mini"  @change="(e)=>{onSwitchIsSingle(e,i)}" :checked="vocell.issingle" />
			</view>
		
		
			<view style="width: 95vw;display: flex; flex-direction: column; align-items: center; margin-top: 8rpx; background-color: #f0f4f8;;">
				<view class="votefor2" v-if="!vocell.issingle"> 
					<view class="votecell">
						<up-input v-model="vocell.subtitles[0]" :placeholder="$t('input_result')" clearable customStyle="border: 1px #BBBBBB solid;" />
						<view class="rate speech-bubble">
							<text>{{$t('rate')}}</text>
							<up-input type="number" v-model="vocell.rates[0]" :placeholder="$t('input_rate')" clearable @change="(e)=>{OnInputRate0(e,i)}" />
						</view>
					</view>
					<view class="vs">VS</view>
					<view class="votecell">
						<up-input v-model="vocell.subtitles[1]" :placeholder="$t('input_result')" clearable customStyle="border: 1px #BBBBBB solid;"  />
						<view class="rate speech-bubble">
							<text>{{$t('rate')}}</text>
							<up-input type="number" v-model="vocell.rates[1]" :placeholder="$t('input_rate') " clearable />
						</view>
					</view>
				</view>
				<view v-else class="voteforsingle">
					<view class="votecell-single">
						<view class="input">
							<up-input v-model="vocell.subtitles[0]" :placeholder="$t('input_result')" clearable customStyle="border: 1px #BBBBBB solid;" />
						</view>
						
						<text style="margin-left: 12rpx;">{{$t('rate') + ":"}}</text>
						<view class="rate">
							<up-input class="rateinput" v-model="vocell.rates[0]" :placeholder="$t('input_rate')" clearable customStyle="border: 1px #BBBBBB solid; margin-left:12rpx"/>
						</view>
					</view>
				</view> 
			</view>
			
			<view class="vote-setting">
				<view class="setting-cell">
					<text>{{$t('votesetting_all') + "："}}</text>
					<view>
						<up-input type="number" v-model="vocell.all_count" placeholder="0" clearable customStyle="border: 1px #BBBBBB solid; margin-left:12rpx"/>
					</view>
				</view>
				
				<view class="setting-cell-interval"></view>
				
				<view class="setting-cell">
					<text>{{$t('votesetting_min') + "："}}</text>
					<view>
						<up-input type="number" v-model="vocell.min_vote" placeholder="1" clearable customStyle="border: 1px #BBBBBB solid; margin-left:12rpx"/>
					</view>
				</view>
				<view class="setting-cell-interval"></view>
				
				<view class="setting-cell">
					<text>{{$t('votesetting_max') + "："}}</text>
					<view>
						<up-input type="number" v-model="vocell.max_vote" placeholder="30" clearable customStyle="border: 1px #BBBBBB solid; margin-left:12rpx"/>
					</view>
				</view>
				<view class="setting-cell-interval"></view>
				
				<view class="setting-cell">
					<text>{{$t('votesetting_timeend') + "："}}</text>
					<!-- <input v-model="vocell.max_vote" :placeholder="30"/> -->
					<!-- <picker mode="time" @change="timeChange" :value="time">
						<view class="picker-display">{{$t('votesetting_timeend') + "："+ time }}</view>
					</picker> -->
					<uni-datetime-picker returnType="timestamp" :start="vocell.starttime" :end="vocell.endtime" v-model="vocell.setlocktime" />
				</view>
			</view>
		</view>
		
		<button type="primary" class="uni-button" style="margin-top: 15rpx;" @click="addMore_vo">增加标题</button>
		<button type="primary" class="uni-button submitbtn" @click="submit">确定创建</button>
	</view>
</template>

<script setup>
	import { ref } from 'vue';
	import {onLoad , onUnload} from "@dcloudio/uni-app"
	import CustomNavbar from '@/pages/common/CustomNavbar.vue';
	import { getCurrentInstance } from 'vue';
	import SystemUtils from '@/common/SystemUtils.js';
	import systemsetting from '../../data/systemsetting';
	
	const uo_vo = uniCloud.importObject("createVoInfo");
	const userinfo = uniCloud.importObject("UserInfo");
	
	const { proxy } = getCurrentInstance();
	
	const voteData = ref([]);
	const selfExp = ref(0);
	const MaxSubtitle = 10;
	
	onLoad((e)=>{
		selfExp.value = uni.Dal.userinfo.exp;
		addMore_vo();
	})
	onUnload((e)=>{
	})
	
	const addMore_vo = ()=>{
		let ratecell = uni.Dal.systemsetting.getCreateTotalRate()/2;
		ratecell = Number(ratecell.toFixed(2));
		voteData.value.push({
			title : "",
			issys : false,
			issingle : false,
			istotalresult : true,
			subtitles : ["",""],
			rates : [ratecell,ratecell],
			all_count : 0,
			selfexpleftforcreate : 0,
			min_vote : 1,
			max_vote : 20,
			setlocktime : "",
			starttime : Date.now(),
			endtime : Date.now() + 500000000
		})
	}
	const clickDel_vo = (i)=>{
		voteData.value.splice(i,1);
	}
	
	const onSwitchIsSysResult = (e, i)=>{
		 let vo_cell = voteData.value[i];
		 console.log("=onSwitchIsSysResult====" , vo_cell.issys);
		 vo_cell.issys = e.detail.value ? true : false;
	}
	const onSwitchIsSingle = (e, i)=>{
		 let vo_cell = voteData.value[i];
		 console.log("=onSwitchIsSingle====" , vo_cell.issingle);
		 vo_cell.issingle = e.detail.value ? true : false;
	}
	const onSwitchIsTotalResult = (e, i)=>{
		let vo_cell = voteData.value[i];
		vo_cell.istotalresult = e.detail.value ? true : false;
	} 
	
	const OnInputRate0 = (e,i)=>{
		let vo_cell = voteData.value[i];
		console.log("===vo_cell===", vo_cell.rates[1])
		vo_cell.rates[1] = (uni.Dal.systemsetting.getCreateTotalRate() - Number(e)).toFixed(2);
	}
	
	const submit = async (e)=>{
		let allcost = 0
		console.log("===res.voteData.value===", voteData.value)
		
		
		for(let i = 0 ; i < voteData.value.length ; i ++){
			let vo_cell = voteData.value[i];
			if(vo_cell.title.length == 0 || vo_cell.subtitles[0].length == 0 || vo_cell.rates[0].length == 0 || Number(vo_cell.all_count) == 0 || vo_cell.all_count == ""){
				uni.showToast({
					title: uni.$t('votecreate_err_1') + " " + (i+1),
					icon:'none'
				})
				return;
			}
			if(Number(vo_cell.max_vote) < Number(vo_cell.min_vote)){
				uni.showToast({
					title: this.$t('votecreate_err_2') + " " + (i+1),
					icon:'none'
				})
				return;
			}
			
			if(!vo_cell.issys){
				allcost += (Number(vo_cell.all_count) + proxy.Dal.systemsetting.getCreatevoteneed());
			}
		} 
		console.log("===allcost===", allcost)
		if(allcost > uni.Dal.userinfo.exp){
			uni.showToast({
				title: proxy.$t('votecreate_err_3'),
				icon:'none'
			})
			return;
		} 
		
		let titles=[], issys_voes=[], issingles=[], istotalresults=[], min_votes=[], max_votes=[], subtitleses=[], rateses=[],  setlocktimes=[], allcountes=[];
		for(let i =0; i < voteData.value.length; i++ ){
			let vo_cell = voteData.value[i];
			console.log("===res.vo_cell===", vo_cell);
			titles.push(vo_cell.title);
			issys_voes.push(vo_cell.issys);
			issingles.push(vo_cell.issingle)
			istotalresults.push(vo_cell.istotalresult);
			min_votes.push(Number(vo_cell.min_vote));
			max_votes.push(Number(vo_cell.max_vote));
			setlocktimes.push(vo_cell.setlocktime);
			allcountes.push(Number(vo_cell.all_count));
			
			let sub_subtitles = [];
			let sub_rates = [];
			for(let j = 0 ; j < vo_cell.subtitles.length ; j++)
			{
				sub_subtitles.push(vo_cell.subtitles[j]);
				sub_rates.push(Number(vo_cell.rates[j]));
			}
			subtitleses.push(sub_subtitles);
			rateses.push(sub_rates);
		}
		
		const createtime = Date.now();
		const groupid = uni.Dal.userinfo.getInfo().groupid;
		console.log("===res.issys_voes===", issys_voes)
		console.log("===res.titles===", titles)
		console.log("===istotalresults===", istotalresults)
		console.log("===res.min_votes.===", min_votes)
		console.log("===res.max_votes===", max_votes)
		console.log("===subtitleses===", subtitleses)
		console.log("===rateses===", rateses)
		console.log("===res.setlocktimes===", setlocktimes)
		console.log("===allcountes===", allcountes)
		
		const devicetype = SystemUtils.getDeviceType();
		let res = await uo_vo.createNowVO(uni.Dal.userinfo.token , devicetype, createtime, groupid, issys_voes,issingles, titles, istotalresults, min_votes, max_votes, 
				subtitleses, rateses, setlocktimes, allcountes);
		console.log("===res.123123===", res)
		if(res.id){
			if(res.selfcurexp){
				selfExp.value = res.selfcurexp;
				uni.Dal.userinfo.setExp(res.selfcurexp);
			}
			
			uni.showModal({
			  content: proxy.$t('votecreate_result_0'),
			  showCancel: false,
			  success: (resmodal) => {
			  	if(resmodal.confirm){
			  		uni.redirectTo({
			  			url : "/pages/vote/voteui?vid="+res.id
			  		})
			  	}
			  }
			})
		}else{
			uni.showToast({
				title: proxy.$t('votecreate_fail_0') ,
				icon:'none'
			})
		}
	}
</script>



<style lang="scss" scoped>

	.layout{
		display: flex;
		flex-direction: column;
		align-items: center;
		
	}
	
	.title-input{
		width: 100%;
		height: 98rpx;
		margin-top: 2rpx;
		background-color: #f0f4f8;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	
	.countview{
		width: 100%;
		height: 68rpx;
		display: flex;
		gap: 28rpx;
		.button{
			width: 45rpx; height: 45rpx; background-color: royalblue;
			display: flex;
			justify-content: center;
			align-items: center;
			color: white;
		}
	}
	
	.votefor2{
		width: 95vw;
	//	height: 200rpx;
		margin-top: 2rpx;
		display: flex;
		align-items: center;
		justify-content: space-around;
		background-color: #f0f4f8;
		
		.votecell{
			width: 43vw;
			height: 100%;
			margin-top: 12rpx;
			margin-bottom: 5rpx;
			display: flex;
			flex-direction: column;
			align-items: center;
			
			input{
				height: 40rpx;
				text-align: center;
				margin: 12rpx;
			}
			.rate{
				width: 100%;
				//border: 1px lightgrey solid;
				display: flex;
				align-items: center;
				margin-top: 12rpx;
				text{
					white-space: nowrap;
					margin-left: 18rpx;
					
				}
				input{
					padding-right: 38rpx;
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
	}
	
	
	.voteforsingle{
		width: 95vw;
		margin-top: 0rpx;
		padding: 12rpx 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-around;
		//background-color: #f0f4f8;
		
		.votecell-single{
			width: 100%;
			height: 100%;
			margin-top: 12rpx;
			margin-bottom: 5rpx;
			display: flex;
			//flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 18rpx;
			
			.input{
				width: 50%;
				height: 68rpx;
				display: flex;
				justify-content: center;
			}
			.rate{
				width: 25%;
				//border: 1px lightgrey solid;
				display: flex;
				align-items: center;
				//margin-top: 12rpx;
				
				.rateinput{
					//padding-right: 38rpx;
				}
			}
		}
	}
	
	.vote-setting{
		width: 95vw;
		margin-top: 8rpx;
		padding: 12rpx 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		background-color: #f0f4f8;
		
		.setting-cell{
			padding-left: 28rpx;
			width: 95vw;
			height: 88rpx;
			display: flex;
			align-items: center;
		}
		
		.setting-cell-interval{
			width: 95%;
			height: 1rpx;
			background-color: lightgrey;
		}
		
	}
	
	.picker-display{
		width: 80vw;
		height: 80rpx;
		background-color: $uni-bg-color-grey;
		display: flex;
		align-items: center;
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
	
	.submitbtn{
		width: 80vw;
		//height: 120rpx;
		margin-top: 128rpx;
	}
</style>
