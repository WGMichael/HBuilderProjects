// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129

const db = uniCloud.database();

const self_obj = uniCloud.importObject('UserInfo');
const createvote_obj = uniCloud.importObject('createVoInfo');
const uservoteinfo_obj = uniCloud.importObject('uservoteInfo');
const user_obj = uniCloud.importObject('UserInfo');
const expChangeRecord_obj = uniCloud.importObject('ExpChangeRecord');

module.exports = {
	_before: function () { // 通用预处理器

	},
	
	async GetUserVoteInfo(vid){
		let res = await db.collection("lm-uservoteinfo").where({voteid: vid}).get();
		return res;
	},
	async GetUserVoteInfoAtTitleindex(vid , tindex){
		let res = await db.collection("lm-uservoteinfo").where({voteid: vid , votetitleindex: tindex}).get();
		return res;
	},
	async GetUserVoteInfoByUID(vid , uid){
		let res = await db.collection("lm-uservoteinfo").where({voteid: vid , userid: uid}).get();
		return res;
	},
	async GetUserAllVoteInfosByToken(token , devicetype){
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res_token;
		}
		const uid = res_token.uid;
		
		let res = await db.collection("lm-uservoteinfo").where({userid: uid}).get();
		return res;
	},
	//仅用于查看投票信息
	async GetUserVoteInfoByTitleAndSubTitleindex(vid , titleindex , subtitleindex){
		let res = await db.collection("lm-uservoteinfo").where({voteid: vid , votetitleindex:titleindex, vote_targetindex: subtitleindex }).
			field({username:true, votecount:true, votecountvalid:true}).get();
		return res;
	},
	async GetUserVotePosInfoByUID(vid , uid , votetitleindex , votesubtitleindex){
		let res = await db.collection("lm-uservoteinfo").where({voteid: vid , userid: uid , votetitleindex:votetitleindex , vote_target:votesubtitleindex}).get();
		return res;
	},
	
	async CancleVote(vid , titleindex){
		const transaction = await db.startTransaction();
		try{
			let res = await transaction.collection("lm-uservoteinfo").where({voteid: vid , votetitleindex: tindex}).get();
			//let res = await uservoteinfo_obj.GetUserVoteInfoAtTitleindex(vid , titleindex);
			if(res.data && res.data.length > 0){
				let addexprecords = [];
				let expchangeobj = {};
				for(let i = 0 ; i < res.data.length ; i ++){
				   let vcell = res.data[i];
				   addexprecords.push({
						userid : vcell.userid,
						groupid : vcell.groupid,
						type : 9,
						exp_change : vcell.votecount,
						exp_before : 0,
						exp_after : 0,
						vo_id : vid,
						vo_title : vcell.votetitle,
						vo_target_index : vcell.vote_targetindex,
						vo_target_title : vcell.vote_target_title,
						createtime : Date.now()
				   });
				   if(expchangeobj[vcell.userid]) expchangeobj[""+vcell.userid] += vcell.votecount;
				   else expchangeobj[vcell.userid] = vcell.votecount;
				}
				console.log("===expchangeobj====" , expchangeobj);
				if(addexprecords.length > 0){
					let res_addexprecords = await transaction.collection("lm-expchangerecord").add(addexprecords);
					if(!res_addexprecords.ids || res_addexprecords.ids.length == 0){
						const err = new Error("cancle 失败")
						err.errCode = 41
						throw err;
					}
				}
				
				for (const [uidStr, deltaAny] of expchangeobj) {
					const uid = Number(uidStr);
					const delta = Number(deltaAny);
					if (!Number.isFinite(uid) || !Number.isFinite(delta) || delta === 0) continue;
					let res_userexp = await transaction.collection("lm-userinfo").doc(uid).update({
						 $inc: {
							 exp : delta
						 }
					});
					// 如果希望 uid 必须存在，不存在就报错回滚：
					if (res.affectedRows === 0) {
						const err = new Error("cancle 失败 , 用户还反失败");
						err.errCode = 41;
						throw err;
					}
				}
			}
			
		}catch (e) {
			try { await transaction.rollback() } 
			catch (e1) {
				return {errCode:22 , errMsg:"创建失败 。。" , err :e1};
			}
		}
		
	   
		
	   //创建者
		let res2 = await obj_user.getUserExp(vinfo.creatorid , vinfo.groupid);
		if(res2.errCode == 0 && res2.data.length > 0){
			let user_exp = res2.data[0].exp;
			const createfee = vinfo.create_cost;
			const allexp = vinfo.allexp_vote;
			const allfee = Number(createfee) + Number(allexp);
			addexprecords.push({
				type : 6,
				userid : vinfo.creatorid,
				groupid : vinfo.groupid,
				exp_change : "" + allfee,
				exp_before : "" + user_exp,
				exp_after  : "" + (Number(user_exp) + allfee),			   
				vo_id : vinfo._id,
				vo_title : vinfo.votetitle,		   
				vo_target_index : -1,
				vo_target_title : "",
				exp_back: ""+allfee,
				exp_result: ""
			})
			if(addexprecords.length > 0){
			   let res_12 = await db.collection("lm-exprecord").add(addexprecords);
			   if(res_12.errCode != 0){
				   return {errCode : 5 , errMsg : "积分纪录变更失败"};
			   }else{
				   await db.collection("lm-uservote-record").where({voteid: vinfo._id}).update({isrightvote : 100});
				   let res6 = await obj_user.updateUserExp(vinfo.creatorid , vinfo.groupid , ""+ (Number(user_exp) + allfee));
				   if(res6.errCode == 0){
					   return {errCode : 0 , newexp: (Number(user_exp) + allfee) , userid : vinfo.creatorid, groupid : vinfo.groupid}		   
				   }
			   }
			}
	   }
	   
	   return {errCode : 1 , errMsg : "数据处理异常"}	
	},
	
	async ResultVote(vid , titleindex , results){
	   let res1 = await uservoteinfo_obj.GetUserVoteInfos(vid);
	   if(res1.data.length > 0){
		   let creatorresultcount = 0;
		   const addexprecords = [];
		   
		   for(let i = 0 ; i < res1.data.length ; i ++){
			   let vcell = res1.data[i];
			   const votecount = vcell.votecount;
			   const voterate = vcell.voterate;
			   let awardcount = 0;		//计算除成本外，可得总数，可正也可能是负
			   
			   //中的
			   if(results.length > Number(vcell.vote_target) && results[Number(vcell.vote_target)] == "1"){
				   awardcount = Number(votecount) * Number(voterate);
				   creatorresultcount -= awardcount;
			   }else{
				   creatorresultcount += votecount;
			   }
			   
			   let res_record = await db.collection("lm-uservoteinfo").doc(vcell._id).update({
				   awardcount : awardcount,
				   votestatus : "4"
			   });
			   
			   //===========90-90-90-
			   if(res_record.errCode == 0){
				   // ----- 2
				   let uservote_info = await user_obj.getGroupUserInfo(vcell.userid , vinfo.groupid);
				   let user_exp = 0;
				   let new_user_exp = 0;
				   if( uservote_infodata.length > 0){
					   user_exp = uservote_infodata[0].exp;
					   new_user_exp = Number(user_exp) + awardcount + Number(votecount);
					   
						let res_11 = await obj_user.updateUserExp(vcell.userid , vinfo.groupid , new_user_exp);
						if(res_11.errCode != 0){
							return {errCode : 5 , errMsg : "数据处理异常"};
						}
					   // ---- 3
					   addexprecords.push({
							type : 5,
							userid : vcell.userid,
							groupid : vinfo.groupid,
							exp_change : "" + votecount,
							exp_before : "" + (Number(user_exp)),
							exp_after  : "" + (Number(user_exp) + Number(votecount)),
							vo_id : vcell.voteid,
							vo_title : vcell.votetitle,
							vo_target_index : vcell.vote_target,
							vo_target_title : vcell.vote_target_title,
					   });
					   addexprecords.push({
							type : 4,
							userid : vcell.userid,
							groupid : vinfo.groupid,
							exp_change : "" + awardcount,
							exp_before : "" + (Number(user_exp) + Number(votecount)),
							exp_after  : "" + new_user_exp,			   
							vo_id : vcell.voteid,
							vo_title : vcell.votetitle,		   
							vo_target_index : vcell.vote_target,
							vo_target_title : vcell.vote_target_title,
					   });
				   }else{
					   return {errCode : 5 , errMsg : "不存在的投票纪录"};
				   }
			   }
		   }
		   if(addexprecords.length > 0){
			   let res_12 = await db.collection("lm-exprecord").add(addexprecords);
			   if(res_12.errCode != 0){
				   return {errCode : 5 , errMsg : "积分纪录变更失败"};
			   }
		   }
		   
		   
		   // ---- 4 创建者相关
		   let backexp = Number(vinfo.allexp_vote) + creatorresultcount;
		   let res4 = await db.collection("lm-record").doc(vid).update({status : 2 , results : results});
		   let res_exp1 = await obj_user.getUserExp(vinfo.creatorid , vinfo.groupid);
		   if(res_exp1.errCode ==0 && res_exp1.data.length > 0){
			   const user_exp1 = res_exp1.data[0].exp;
			   let res5 = await db.collection("lm-exprecord").add({
					type : 9,
					userid : vinfo.creatorid,
					groupid : vinfo.groupid,
					exp_change : "" + backexp,
					exp_before : "" + user_exp1,
					exp_after  : "" + (Number(user_exp1) + backexp),			   
					vo_id : vinfo._id,
					vo_title : vinfo.votetitle,		   
					vo_target_index : -1,
					vo_target_title : "",
					exp_back: vinfo.allexp_vote,
					exp_result: ""+creatorresultcount
			   })
			   let res6 = await obj_user.updateUserExp(vinfo.creatorid , vinfo.groupid , ""+(Number(user_exp1) + backexp));
			   if(res4.errCode == 0 && res5.errCode == 0 && res6.errCode == 0){
					return {errCode : 0 , errMsg : "处理成功，抵押已返还" , newexp: ""+(Number(user_exp1) + backexp)};
			  } 
		   }
		   
		}else{
			return {errCode : 2 , errMsg : "投票不存在"};
		}
	},
	
	// vote.value._id ,select_voteindex.value , select_votesubindex.value,selectvote.title[select_voteindex],
	//					selectvote.subtitles[select_votesubindex.value], num , username
	// 入库需另行加的参数 ispriority   votecountvalid voterate awardcount votestatus
	// 1-是否是开启状态 => 自己创建的(系统除外)，自己不能vote 是否超出可接受额度   2-用户是否有足够的exp   3-找出之前投入过的纪录，分析是否超出个人限度
	// 4-创建exprecord记录,扣除用户exp  record中的cur_expins数据更新
	async UserVote(token , devicetype , vid, titleindex, subtitleindex , titlename , subtitlename, num , username){
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res_token;
		}
		const uid = res_token.uid;
		const selfcurexp = await self_obj.getUserExp(uid);
		
		if(selfcurexp < num){
			return {errCode : 30 , errMsg : "超出你的开销能力" , ids:[]};
		}
		
		const voteinfo = await createvote_obj.GetVoteInfo(vid);
		if(voteinfo.data.length > 0){
			if(voteinfo.data[0].status[titleindex] != 1){
				return {errCode : 31 , errMsg : "不开放,无投票" , ids:[]};
			}
			if(voteinfo.data[0].creatorid == uid && !voteinfo.data[0].issystem[titleindex]){
				return {errCode : 31 , errMsg : "不能投自己" , ids:[]};
			}
		}else{
			return {errCode : 31 , errMsg : "不开放,无投票 2" , ids:[]};
		}
		
		const selfvoteinfos = await uservoteinfo_obj.GetUserVotePosInfoByUID(vid , uid , titleindex , subtitleindex);
		const selfvotecount = 0;
		if(selfvoteinfos.data.length > 0){
			for(let i = 0 ; i < selfvoteinfos.data.length; i++){
				selfvotecount += selfvoteinfos.data[i].votecount;
			}
		}
		if(num < voteinfo.data[0].min_vote || num > voteinfo.data[0].max_vote){
			return {errCode : 32 , errMsg : "单次不在范围内" , ids:[]};
		}
		if(selfvotecount + num  > voteinfo.data[0].max_vote){
			return {errCode : 32 , errMsg : "总值不在范围内" , ids:[]};
		}
		
		const transaction = await db.startTransaction();
		let afterexp = 0;
		let res_adduservote = null;
		try {
			let errorcode = 0;
			let errormsg = "";
			res_adduservote = await transaction.collection("lm-uservoteinfo").add({
					userid : uid,
					username : username,
					groupid : "0",
					voteid : vid,
					votetitleindex : titleindex,
					vote_targetindex : subtitleindex,
					votetitle : titlename,
					vote_target_title : subtitlename,
					ispriority : false,
					votecount : num,
					votecountvalid : 0,
					voterate : voteinfo.data[0].rates[titleindex][subtitleindex],
					awardcount : 0,
					votestatus : 1,
					createtime: Date.now(),
					endtime: 0,
			});
			console.log("===res_adduservote==111====" , res_adduservote);
			if(!res_adduservote.id || res_adduservote.id.length == 0){
				const err = new Error("超时，投不进")
				err.errCode = 35
				throw err;
			}
			
			const addexprecord_obj =  {
					userid : uid,
					groupid : "0",
					type : 3,
					exp_change : -1*num ,
					exp_before : selfcurexp,
					exp_after : selfcurexp - num,
					vo_id : vid,
					vo_title_index : titleindex,
					vo_title : titlename,
					vo_target_index: subtitleindex,
					vo_target_title: subtitlename,
					createtime : Date.now()
				};
			let res_addexprecord = await transaction.collection("lm-expchangerecord").add(addexprecord_obj);
			console.log("===res_addexprecord==111====" , res_addexprecord);
			if(!res_addexprecord.id || res_addexprecord.id.length == 0){
				const err = new Error("超时，投不进2")
				err.errCode = 35
				throw err;
			}
			
			afterexp = selfcurexp - num;
			var selfexp_update = await transaction.collection("lm-userinfo").doc(uid).update({
				exp: afterexp
			});
			console.log("===selfexp_update==111====" , selfexp_update);
			if(!selfexp_update.updated){
				const err = new Error("超时，投不进3")
				err.errCode = 35
				throw err;
			}
			
			const vo_info = voteinfo.data[0];
			let expins = [];
			let vote_times = [];
			for(let vi = 0 ; vi < vo_info.title.length; vi++){
				let titleexpins = [];
				let titlevote_times = [];
				for(let vj = 0 ; vj < vo_info.cur_expins[vi].length; vj++){
					if(vi == titleindex && vj == subtitleindex){
						titleexpins.push(vo_info.cur_expins[vi][vj] + num);
						titlevote_times.push(vo_info.user_vote_times[vi][vj] + 1);
					}else{
						titleexpins.push(vo_info.cur_expins[vi][vj]);
						titlevote_times.push(vo_info.user_vote_times[vi][vj]);
					}
				}
				expins.push(titleexpins);
				vote_times.push(titlevote_times);
			}
			console.log("===expins==111====" , expins);
			console.log("===vote_times==111====" , vote_times);
			var res_updatevoteinfo = await transaction.collection("lm-createvoinfo").doc(vid).update({
				cur_expins : expins,
				user_vote_times : vote_times
			});
			console.log("===res_updatevoteinfo==111====" , res_updatevoteinfo);
			if(!res_updatevoteinfo.updated){
				const err = new Error("超时，投不进4")
				err.errCode = 35
				throw err;
			}
		   //affectedDocs :  1 ,updated :  1
			await transaction.commit();
		}catch (e) {
			try { await transaction.rollback() }
			catch (e1) {
				return {errCode:35 , errMsg:"超时，投不进  。。" , err :e1};
			}
		}
		await self_obj.updateUserExp_cache(uid, afterexp);
		res_adduservote.userleftexp = afterexp;
		return res_adduservote;
	},
	
	
	async Test_ClearAllData(){
		let res = await db.collection("lm-uservoteinfo").remove();
		return res;
	},
	
}
