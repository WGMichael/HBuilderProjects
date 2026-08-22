// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129

const db = uniCloud.database();
const dbCmd = db.command;
const self_obj = uniCloud.importObject('UserInfo');
const sys_obj = uniCloud.importObject('sysSetting');
const uservoteinfo_obj = uniCloud.importObject('uservoteInfo');
const createvote_obj = uniCloud.importObject('createVoInfo');

module.exports = {
	_before: function () { // 通用预处理器

	},
	
	async GetVoteInfo(vid){
		let res = await db.collection("lm-createvoinfo").doc(vid).get();
		return res;
	},
	async GetCurrentVoteInfos(){
		let res = await db.collection("lm-createvoinfo").where({
			status: {
			      $in: [1]
			}
		}).get();
		return res;
	},
	async GetUserCreateVoteInfosByUid(token, devicetype){
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res;
		}
		const uid = res_token.uid;
		
		let res = await db.collection("lm-createvoinfo").where({
			creatorid: uid
		}).get();
		return res;
	},
	
	async createNowVO(token, devicetype,createtime,groupid,issys_voes,issingles, titles,istotalresults,min_votes,max_votes,subtitleses,rateses,setlocktimes,exp_saves){
		let infocount = titles.length;
		if(issys_voes.length == infocount && issingles.length == infocount && istotalresults.length == infocount && min_votes.length == infocount && max_votes.length == infocount && 
			subtitleses.length == infocount && rateses.length == infocount && setlocktimes.length == infocount && exp_saves.length == infocount){
		}else{
			return {
				errCode: 2,
				errMsg: '数据不完善，请检查你的设置',
				data : []
			}
		}
		
		// 参数校验，如无参数则不需要
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res;
		}
		
		const uid = res_token.uid;
		const cost_str = await sys_obj.get("vocreatecost");
		const create_cost = Number(cost_str) || 0;
		let selfcurexp = await self_obj.getUserExp(uid);
		
		let allneedcoust = create_cost;
		for(let i = 0 ; i < infocount ; i++){
			if(issys_voes[i] == "0"){
				allneedcoust += Number(exp_saves[i]);
			}
		}
		if (selfcurexp < allneedcoust) {
			return {
				errCode: 1,
				errMsg: '金额不足，无法创建',
				data : []
			}
		}
		// 业务逻辑
		let create_vos = [];
		let status = [];
		let endtimes = []
		let cur_expins = [];	//当前已投值，初始肯定是0
		for(let i = 0 ; i < issingles.length ; i++){
			const cellissingle = issingles[i]
			status.push(1);
			endtimes.push("0");
			let cellsubtitlescount = cellissingle? 1: 2;
			let cellcurexpins = [];
			for (let j = 0 ; j < cellsubtitlescount ; j++){
				cellcurexpins.push(0);
			}
			cur_expins.push(cellcurexpins);
		}
		create_vo = {
			status : status,
			issystem : issys_voes,
			issingle : issingles,
			title: titles,
			groupid : groupid,
			creatorid : uid,
			istotalresult : istotalresults,
			createtime : Date.now().toString(),
			create_cost : create_cost,
			min_vote : min_votes,
			max_vote : max_votes,
			subtitles : subtitleses,
			rates : rateses,
			allexp_gap : exp_saves,
			user_vote_times : cur_expins,
			cur_expins : cur_expins,
			lock_expins : cur_expins,
			setlocktime :setlocktimes,
			endtime : endtimes
		}
		
		const transaction = await db.startTransaction();
		let res = null;
		try{
			res = await transaction.collection("lm-createvoinfo").add(create_vo);
			console.log("===res==212====" , res);
			if(!res.id){
				const err = new Error("创建失败")
				err.errCode = 21
				throw err;
			}
			
			let addexprecorddatas = [];
			let vo_id = res.id;
			let all_savecount = 0;
			let is_allsysvo = true;
			for(let j = 0 ; j < titles.length ; j++){
				if(!issys_voes[j]){
					all_savecount += exp_saves[j];
					is_allsysvo = false;
				}
			}
			console.log("===res==is_allsysvo====" , is_allsysvo);
			if(!is_allsysvo){
				all_savecount += create_cost;
				let res2 = await transaction.collection("lm-expchangerecord").add({
					userid : uid,
					groupid : groupid,
					type : 1,
					exp_change : -1*all_savecount,
					exp_before : selfcurexp,
					exp_after : selfcurexp - all_savecount,
					vo_id : vo_id,
					vo_title : titles[0],
					vo_target_index : -1,
					vo_target_title : "",
					createtime : Date.now()
				});
				console.log("===res==2222====" , res2);
				if(!res2.id ){
					const err = new Error("创建失败2")
					err.errCode = 21
					throw err;
				}
				
				selfcurexp = selfcurexp - all_savecount;
				// let res3 = await transaction.collection("lm-expchangerecord").add({
				// 	userid : uid,
				// 	groupid : groupid,
				// 	type : 2,
				// 	exp_change : -1*create_cost ,
				// 	exp_before : selfcurexp,
				// 	exp_after : selfcurexp - create_cost,
				// 	vo_id : vo_id,
				// 	vo_title : titles[0],
				// 	vo_target_index : -1,
				// 	vo_target_title : "",
				// 	createtime : Date.now()
				// });
				// console.log("===res==33333====" , res3);
				// if(!res3.id ){
				// 	const err = new Error("创建失败3")
				// 	err.errCode = 21
				// 	throw err;
				// }
				// selfcurexp = selfcurexp - create_cost;
			}else{
				//系统的要如何处理 ？？？
			}
			if (!is_allsysvo){
				let res4 = await transaction.collection("lm-userinfo").doc(uid).update({exp: selfcurexp});
				console.log("===res==4444====" , res4);
				if(!res4.updated){
					const err = new Error("创建失败 4")
					err.errCode = 21
					throw err;
				}
			}
			
			await transaction.commit();
		}catch (e) {
			try { await transaction.rollback() } 
			catch (e1) {
				return {errCode:22 , errMsg:"创建失败 。。" , err :e1};
			}
		}
		
		await self_obj.updateUserExp_cache(uid, selfcurexp);
		res.selfcurexp = selfcurexp;
		return res;
	},
	
	//Vo_StatusType  statustype
	async UpdateVoteStatus(vid , statustype){
		   let res = await db.collection("lm-createvoinfo").doc(vid).update({status : statustype});
		   
		   return res;
	},
	
	async UpdateVoteInfoWithUserVote(vid , titleindex , subtitleindex ,votecount){
		let res = await db.collection("lm-createvoinfo").doc(vid).update({
		   $inc: {
			   [`cur_expins.${titleindex}.${subtitleindex}`]: votecount,
			   [`user_vote_times.${titleindex}.${subtitleindex}`]: 1,
		   }
		});
		return res;
	},
	
	
	async CancleVote(token , devicetype ,vid , titleindex){
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res_token;
		}
		const uid = res_token.uid;
		
		const res_uservotelist = await db.collection("lm-uservoteinfo").where({voteid: vid , votetitleindex: titleindex}).get();
			
		let expchangeobj = {};
		let addexprecords = [];
		const transaction = await db.startTransaction();
		try{
			const res_findvoteinfo = await transaction.collection('lm-createvoinfo').doc(vid).get();
			console.log("===res_findvoteinfo====" , res_findvoteinfo);
			if(!res_findvoteinfo.data || res_findvoteinfo.data.status[titleindex] != 1){
				const err = new Error("cancle Fail , isnot a open vote")
				err.errCode = 41
				throw err;
			}
			if(res_findvoteinfo.data.creatorid != uid){
				const err = new Error("cancle Fail , 非你所建")
				err.errCode = 41
				throw err;
			}
			
			let modifystatus = [];
			let modifyendtime = [];
			let backexpTo_createrid = res_findvoteinfo.data.creatorid;
			const create_cost = res_findvoteinfo.data.create_cost;
			for(let i = 0 ; i < res_findvoteinfo.data.title.length;  i++){
				if(res_findvoteinfo.data.status[i] != 3 && !res_findvoteinfo.data.issystem[i] && i != titleindex){
					backexpTo_createrid = 0;
				}
				if(i == titleindex){
					modifystatus.push(3);
					modifyendtime.push(Date.now());
				}else{
					modifystatus.push(res_findvoteinfo.data.status[i]);
					modifyendtime.push(res_findvoteinfo.data.endtime[i]);
				}
			}
			
			console.log("===backexpTo_createrid====" , backexpTo_createrid);
			const res_result = await transaction.collection('lm-createvoinfo').doc(vid).update({
			    status: modifystatus,
				endtime: modifyendtime
			});
			  
			if(!res_result.updated){
				const err = new Error("cancle Fail , No due vote2")
				err.errCode = 41
				throw err;
			}
			console.log("===uservoteinfo==handle==" + res_uservotelist.data.length);
			
			if(res_uservotelist.data && res_uservotelist.data.length > 0){
				for(let i = 0 ; i < res_uservotelist.data.length ; i++) {
					const uservotecell = res_uservotelist.data[i];
					await transaction.collection("lm-uservoteinfo").doc(uservotecell._id).update({votestatus:3, votecountvalid:0});
				}
				
				for(let i = 0 ; i < res_uservotelist.data.length ; i ++){
				   let vcell = res_uservotelist.data[i];
				   addexprecords.push({
						userid : vcell.userid,
						groupid : vcell.groupid,
						type : 9,
						exp_change : vcell.votecount,
						exp_before : 0,
						exp_after : 0,
						vo_id : vid,
						vo_title : vcell.votetitle,
						vo_title_index : titleindex,
						vo_target_index : vcell.vote_targetindex,
						vo_target_title : vcell.vote_target_title,
						createtime : Date.now()
				   });
				}
			}
			
			if(backexpTo_createrid){
				addexprecords.push({
					userid : backexpTo_createrid,
					groupid : res_findvoteinfo.data.groupid,
					type : 8,
					exp_change : create_cost,
					exp_before : 0,
					exp_after : 0,
					vo_id : vid,
					vo_title_index : titleindex,
					vo_title : res_findvoteinfo.data.title[titleindex],
					vo_target_index : 0,
					vo_target_title : "0",
					createtime : Date.now()
				});
			}
			if(!res_findvoteinfo.data.issystem[titleindex]){
				addexprecords.push({
					userid : backexpTo_createrid,
					groupid : "0",
					type : 10,
					exp_change : res_findvoteinfo.data.allexp_gap[titleindex],
					exp_before : 0,
					exp_after : 0,
					vo_id : vid,
					vo_title_index : titleindex,
					vo_title : res_findvoteinfo.data.title[titleindex],
					vo_target_index : 0,
					vo_target_title : "0",
					createtime : Date.now()
				});
			}
			
			
			for(let i = 0 ; i < addexprecords.length ; i++){
				const addcell = addexprecords[i];
				if(expchangeobj[""+addcell.userid]){
					expchangeobj[""+addcell.userid] += addcell.exp_change;
				} 
				else {
					expchangeobj[""+addcell.userid] = addcell.exp_change;
				}
			}
			
			console.log("===78778=expchangeobj=asdad==" , expchangeobj);
			for (const [uidStr, deltaAny] of Object.entries(expchangeobj)) {
				const uid = uidStr;
				const delta = Number(deltaAny);
				let res_userexp = await transaction.collection("lm-userinfo").doc(uid).update({
					 $inc: {
						 exp : delta
					 }
				});
				console.log("===78778=res_userexp=asdad==" , res_userexp);
				// 如果希望 uid 必须存在，不存在就报错回滚：
				if (res_userexp.affectedRows === 0) {
					const err = new Error("cancle 失败 , 用户还反失败");
					err.errCode = 41;
					throw err;
				}
			}
			await transaction.commit();
		}catch (e) {
			try { 
				await transaction.rollback();
				return {errCode:42 , result : 42, errMsg: "cancle Fail 。。", err :e};
			} 
			catch (e1) {
				return {errCode:42 , result : 42, errMsg:"cancle Fail 。..。" , err :e1};
			}
		}
		
		let allids = [];
		for (const [uidStr, deltaAny] of Object.entries(expchangeobj)) {
			allids.push(uidStr);
			self_obj.clearUserExp(uidStr);
		}
		console.log("===uidStr==" , allids);
		const uidexplist = await db.collection("lm-userinfo").where({_id: dbCmd.in(allids)}).field({ exp: true}).get();
		console.log("===uidexplist==" , uidexplist);
		if(addexprecords.length > 0){
			if(uidexplist.data && uidexplist.data.length > 0){
				for(let i = 0  ; i < addexprecords.length ; i++){
					let exp_after = 0;
					let exp_before = 0;
					for(let j = 0  ; j < uidexplist.data.length ; j++){
						if(uidexplist.data[j]._id == addexprecords[i].userid){
							exp_after = uidexplist.data[j].exp;
							if(expchangeobj[""+addexprecords[i].userid]){
								exp_before = exp_after - expchangeobj[""+addexprecords[i].userid];
							}
							break;
						}
					}
					addexprecords[i].exp_after = exp_after;
					addexprecords[i].exp_before = exp_before;
				}
			}
			console.log("===addexprecords==" , addexprecords);
			await db.collection("lm-expchangerecord").add(addexprecords);
		}
		
		console.log("===cancle Succeed==adf==");
		return {errCode:0 , result : 0,  errMsg: "cancle Succeed 。。"};
	},
	async OpenVote(token , devicetype , vid , titleindex){
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res_token;
		}
		const uid = res_token.uid;
		
		const res_uservotelist = await db.collection("lm-uservoteinfo").where({voteid: vid , votetitleindex: titleindex}).get();
			
		const transaction = await db.startTransaction();
		try{
			const res_findvoteinfo = await transaction.collection('lm-createvoinfo').doc(vid).get();
			console.log("===res_findvoteinfo====" , res_findvoteinfo);
			if(!res_findvoteinfo.data || res_findvoteinfo.data.status[titleindex] != 2){
				const err = new Error("cancle Fail , isnot a closed vote")
				err.errCode = 42
				throw err;
			}
			if(res_findvoteinfo.data.creatorid != uid){
				const err = new Error("cancle Fail , 非你所建")
				err.errCode = 42
				throw err;
			}
			
			let modifystatus = [];
			let modifyendtime = [];
			for(let i = 0 ; i < res_findvoteinfo.data.title.length;  i++){
				if(i == titleindex){
					modifystatus.push(1);
					modifyendtime.push(0);
				}else{
					modifystatus.push(res_findvoteinfo.data.status[i]);
					modifyendtime.push(res_findvoteinfo.data.endtime[i]);
				}
			}
			
			const res_result = await transaction.collection('lm-createvoinfo').doc(vid).update({
			    status: modifystatus,
				setlocktime: modifyendtime
			});
			
			if(res_uservotelist.data && res_uservotelist.data.length > 0){
				for(let i = 0 ; i < res_uservotelist.data.length ; i++) {
					const uservotecell = res_uservotelist.data[i];
					await transaction.collection("lm-uservoteinfo").doc(uservotecell._id).update({votestatus:1 ,votecountvalid: 0});
				}
			}
			await transaction.commit();
		}catch (e) {
			console.log("===catch====" , e);
			try { 
				await transaction.rollback();
				return {errCode:42 , result : 42, errMsg: "Lock Fail 。。", err :e};
			} 
			catch (e1) {
				return {errCode:42 , result : 42, errMsg:"Lock Fail 。。" , err :e1};
			}
		}
		return {errCode:0 , result : 0,  errMsg: "Open Succeed 。。"};
	},
	async LockVote(token , devicetype ,vid , titleindex){
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res_token;
		}
		const uid = res_token.uid;
		
		const res_uservotelist = await db.collection("lm-uservoteinfo").where({voteid: vid , votetitleindex: titleindex}).get();
			
		const transaction = await db.startTransaction();
		try{
			const res_findvoteinfo = await transaction.collection('lm-createvoinfo').doc(vid).get();
			console.log("===res_findvoteinfo====" , res_findvoteinfo);
			if(!res_findvoteinfo.data || res_findvoteinfo.data.status[titleindex] != 1){
				const err = new Error("cancle Fail , isnot a open vote")
				err.errCode = 42
				throw err;
			}
			if(res_findvoteinfo.data.creatorid != uid){
				const err = new Error("cancle Fail , 非你所建")
				err.errCode = 42
				throw err;
			}
			
			let modifystatus = [];
			let modifyendtime = [];
			for(let i = 0 ; i < res_findvoteinfo.data.title.length;  i++){
				if(i == titleindex){
					modifystatus.push(2);
					modifyendtime.push(Date.now());
				}else{
					modifystatus.push(res_findvoteinfo.data.status[i]);
					modifyendtime.push(res_findvoteinfo.data.endtime[i]);
				}
			}
			
			const res_result = await transaction.collection('lm-createvoinfo').doc(vid).update({
			    status: modifystatus,
				setlocktime: modifyendtime
			});
			
			let tagetvoteList_0 = [];
			let tagetvoteList_1 = [];
			if(res_uservotelist.data && res_uservotelist.data.length > 0){
				for(let i = 0 ; i < res_uservotelist.data.length ; i++) {
				 	const uservotecell = res_uservotelist.data[i];
					if(uservotecell.vote_targetindex == 0){
						tagetvoteList_0.push(uservotecell);
					}else{
						tagetvoteList_1.push(uservotecell);
					}
				}
				
				tagetvoteList_0.sort((a, b) => {
				  if (a.ispriority !== b.ispriority) {
					return b.ispriority?1:0 - a.ispriority?1:0;
				  }
				  return a.createtime - b.createtime;
				});
				tagetvoteList_1.sort((a, b) => {
				  if (a.ispriority !== b.ispriority) {
					return b.ispriority?1:0 - a.ispriority?1:0;
				  }
				  return a.createtime - b.createtime;
				});
				
				const gapcount = res_findvoteinfo.data.allexp_gap[titleindex];
				const ratev_0 = res_findvoteinfo.data.rates[titleindex][0];
				const ratev_1 = res_findvoteinfo.data.issingle[titleindex]? 1 : res_findvoteinfo.data.rates[titleindex][1];
				
				const sumBet = (list) => list.reduce((s, o) => s + (Number(o.votecount) || 0), 0);
				const total0 = sumBet(tagetvoteList_0);
			    const total1 = sumBet(tagetvoteList_1);
				
				const payout0 = total0 * ratev_0;
				const payout1 = total1 * ratev_1;
				
				// 先默认全部有效
				for (const o of tagetvoteList_0) o.votecountvalid = Number(o.votecount) || 0;
				for (const o of tagetvoteList_1) o.votecountvalid = Number(o.votecount) || 0;
				const diff = payout0 - payout1;
				  
				if (Math.abs(diff) > gapcount) {
				     // 需要削减“赔付更多”的那一侧
				     const largeList = diff > 0 ? tagetvoteList_0 : tagetvoteList_1;
				     const largeOdd  = diff > 0 ? ratev_0  : ratev_1;
				     const smallPayout = diff > 0 ? payout1 : payout0;
				     // 目标：largePayout <= smallPayout + gapcount
				     const targetLargePayout = smallPayout + gapcount;
				     const largePayout = diff > 0 ? payout0 : payout1;
				     // 需要减少的赔付额
				     let needReducePayout = largePayout - targetLargePayout;
				     // 换算成需要减少的“投注额”（因为 payout = bet * odd）
				     let needReduceBet = needReducePayout / largeOdd;
					 // 从尾部开始扣（优先保留排在前面的）
					 for (let i = largeList.length - 1; i >= 0 && needReduceBet > 0; i--) {
						 const o = largeList[i];
						 const bet = Number(o.votecount) || 0;
					 
						 if (bet <= 0) {
						   o.votecountvalid = 0;
						   continue;
						 }
					 
						 const cut = Math.min(bet, needReduceBet);
						 o.votecountvalid = Math.trunc(bet - cut);
					 
						 needReduceBet -= cut;
					 }
				}
			}
			
			if(tagetvoteList_0.length > 0){
				 for(let i = 0 ; i < tagetvoteList_0.length ; i++) {
					const uservotecell = tagetvoteList_0[i];
					await transaction.collection("lm-uservoteinfo").doc(uservotecell._id).update({votestatus:2 ,votecountvalid: uservotecell.votecountvalid });
				}
			}
			if(tagetvoteList_1.length > 0){
				 for(let i = 0 ; i < tagetvoteList_1.length ; i++) {
					const uservotecell = tagetvoteList_0[i];
					await transaction.collection("lm-uservoteinfo").doc(uservotecell._id).update({votestatus:2 ,votecountvalid: uservotecell.votecountvalid });
				}
			}
			
			await transaction.commit();
		}catch (e) {
			console.log("===catch====" , e);
			try { 
				await transaction.rollback();
				return {errCode:42 , result : 42, errMsg: "Lock Fail 。。", err :e};
			} 
			catch (e1) {
				return {errCode:42 , result : 42, errMsg:"Lock Fail 。。" , err :e1};
			}
		}
		return {errCode:0 , result : 0,  errMsg: "Lock Succeed 。。"};
	},
	
	async ResultVote(token , devicetype ,vid , titleindex , results){
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res_token;
		}
		const uid = res_token.uid;
		
		const res_uservotelist = await db.collection("lm-uservoteinfo").where({voteid: vid , votetitleindex: titleindex}).get();
			
		let expchangeobj = {};
		let addexprecords = [];
		const transaction = await db.startTransaction();
		try{
			const res_findvoteinfo = await transaction.collection('lm-createvoinfo').doc(vid).get();
			console.log("===res_findvoteinfo====" , res_findvoteinfo);
			if(!res_findvoteinfo.data || res_findvoteinfo.data.status[titleindex] != 2){
				const err = new Error("Result Fail , isnot a close vote")
				err.errCode = 46
				throw err;
			}
			if(res_findvoteinfo.data.creatorid != uid){
				const err = new Error("Result Fail , 非你所建")
				err.errCode = 46
				throw err;
			}
			
			let modifystatus = [];
			let modifyendtime = [];
			const create_cost = res_findvoteinfo.data.create_cost;
			for(let i = 0 ; i < res_findvoteinfo.data.title.length;  i++){
				if(i == titleindex){
					modifystatus.push(4);
					modifyendtime.push(Date.now());
				}else{
					modifystatus.push(res_findvoteinfo.data.status[i]);
					modifyendtime.push(res_findvoteinfo.data.endtime[i]);
				}
			}
			const res_result = await transaction.collection('lm-createvoinfo').doc(vid).update({
			    status: modifystatus,
				endtime: modifyendtime
			});
			if(!res_result.updated){
				const err = new Error("Result Fail , No due vote2")
				err.errCode = 46
				throw err;
			}
			
			console.log("===uservoteinfo==handle==" + res_uservotelist.data.length);
			
			let userwindobj = {};
			if(res_uservotelist.data && res_uservotelist.data.length > 0){
				for(let i = 0 ; i < res_uservotelist.data.length ; i ++){
				   let vcell = res_uservotelist.data[i];
				   let iswin = false;
				   if(results.length > vcell.vote_targetindex && results[vcell.vote_targetindex] == 1){ 
					   iswin = true;
				   }
				   if(vcell.votecountvalid < vcell.votecount){
					   let sendback = vcell.votecount - vcell.votecountvalid;
					   addexprecords.push({
							userid : vcell.userid,
							groupid : vcell.groupid,
							type : 5,
							exp_change : sendback,
							exp_before : 0,
							exp_after : 0,
							vo_id : vid,
							vo_title : vcell.votetitle,
							vo_title_index : titleindex,
							vo_target_index : vcell.vote_targetindex,
							vo_target_title : vcell.vote_target_title,
							createtime : Date.now()
					   });
				   }
				   
				   if(!userwindobj[""+vcell.userid]){
					   userwindobj[""+vcell.userid] = 0;
				   }
				   let windcount = 0;
				   if(iswin){
					   windcount = Number((vcell.votecountvalid * vcell.voterate).toFixed(2));
					   userwindobj[""+vcell.userid] += windcount;
					   addexprecords.push({
							userid : vcell.userid,
							groupid : vcell.groupid,
							type : 4,
							exp_change : windcount + vcell.votecountvalid,
							exp_before : 0,
							exp_after : 0,
							vo_id : vid,
							vo_title : vcell.votetitle,
							vo_title_index : titleindex,
							vo_target_index : vcell.vote_targetindex,
							vo_target_title : vcell.vote_target_title,
							createtime : Date.now()
					   });
				   }else{
					   userwindobj[""+vcell.userid] -= vcell.votecountvalid;
				   }
				   await transaction.collection("lm-uservoteinfo").doc(uservotecell._id).update({votestatus:4 , awardcount: windcount + vcell.votecountvalid});
				}
			}
			
			//creator result
			let hostwin = 0;
			for (const [uidStr, wincount66] of Object.entries(userwindobj)) {
				const uid = uidStr;
				const wincount = Number(wincount66);
				hostwin -= wincount;
			}
			if(!res_findvoteinfo.data.issystem[titleindex]){
				addexprecords.push({
					userid : res_findvoteinfo.data.creatorid,
					groupid : res_findvoteinfo.data.groupid,
					type : 7,
					exp_change : res_findvoteinfo.data.allexp_gap[titleindex] + hostwin,
					exp_before : 0,
					exp_after : 0,
					vo_id : vid,
					vo_title_index : titleindex,
					vo_title : res_findvoteinfo.data.title[titleindex],
					vo_target_index : 0,
					vo_target_title : "0",
					createtime : Date.now()
				});
			}
			
			for(let i = 0 ; i < addexprecords.length ; i++){
				const addcell = addexprecords[i];
				if(expchangeobj[""+addcell.userid]){
					expchangeobj[""+addcell.userid] += addcell.exp_change;
				} 
				else {
					expchangeobj[""+addcell.userid] = addcell.exp_change;
				}
			}
			
			console.log("===78778=expchangeobj=asdad==" , expchangeobj);
			for (const [uidStr, deltaAny] of Object.entries(expchangeobj)) {
				const uid = uidStr;
				const delta = Number(deltaAny);
				let res_userexp = await transaction.collection("lm-userinfo").doc(uid).update({
					 $inc: {
						 exp : delta
					 }
				});
				console.log("===78778=res_userexp=asdad==" , res_userexp);
				// 如果希望 uid 必须存在，不存在就报错回滚：
				if (res_userexp.affectedRows === 0) {
					const err = new Error("cancle 失败 , 用户还反失败");
					err.errCode = 46;
					throw err;
				}
			}
			await transaction.commit();
		}catch (e) {
			try { 
				await transaction.rollback();
				return {errCode:46 , result : 46, errMsg: "cancle Fail 。。", err :e};
			} 
			catch (e1) {
				return {errCode:46 , result : 46, errMsg:"cancle Fail 。..。" , err :e1};
			}
		}
		
		let allids = [];
		for (const [uidStr, deltaAny] of Object.entries(expchangeobj)) {
			allids.push(uidStr);
			self_obj.clearUserExp(uidStr);
		}
		console.log("===uidStr==" , allids);
		const uidexplist = await db.collection("lm-userinfo").where({_id: dbCmd.in(allids)}).field({ exp: true}).get();
		console.log("===uidexplist==" , uidexplist);
		if(addexprecords.length > 0){
			if(uidexplist.data && uidexplist.data.length > 0){
				for(let i = 0  ; i < addexprecords.length ; i++){
					let exp_after = 0;
					let exp_before = 0;
					for(let j = 0  ; j < uidexplist.data.length ; j++){
						if(uidexplist.data[j]._id == addexprecords[i].userid){
							exp_after = uidexplist.data[j].exp;
							if(expchangeobj[""+addexprecords[i].userid]){
								exp_before = exp_after - expchangeobj[""+addexprecords[i].userid];
							}
							break;
						}
					}
					addexprecords[i].exp_after = exp_after;
					addexprecords[i].exp_before = exp_before;
				}
			}
			await db.collection("lm-expchangerecord").add(addexprecords);
		}
		
		console.log("===cancle Succeed==adf==");
		return {errCode:0 , result : 0,  errMsg: "cancle Succeed 。。"};
	},
	
	
	async Test_ClearAllData(){
		let res = await db.collection("lm-createvoinfo").remove();
		return res;
	},
}
