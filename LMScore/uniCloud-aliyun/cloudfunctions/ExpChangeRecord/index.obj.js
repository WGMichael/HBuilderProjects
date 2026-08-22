// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129

const db = uniCloud.database();
const self_obj = uniCloud.importObject('UserInfo');

module.exports = {
	_before: function () { // 通用预处理器

	},
	
	async GetUserExpRecords(token, devicetype){
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype)
		if(res_token.errCode != 0){
			return res;
		}
		const uid = res_token.uid;
		
		let res = await db.collection("lm-expchangerecord").where({userid:uid}).get();
		return res;
	},
	
	//uid, vid, titleindex, subtitleindex , titlename , subtitlename, num , username , selfcurexp
	async AddByUserVoteRecord(uid, vid, titleindex, subtitleindex , titlename , subtitlename, num ,username , exp_before){
		const expchagerecord = {
			userid : uid,
			groupid : 0,
			type : 3,
			exp_change : num ,
			exp_before : exp_before,
			exp_after : exp_before - num,
			vo_id : vid,
			vo_title_index : titleindex,
			vo_title : titlename,
			vo_target_index: subtitleindex,
			vo_target_title: subtitlename,
			createtime : Date.now().toString()
		};
		let res3 = await db.collection("lm-expchangerecord").add(expchagerecord);
		if(res3.id){
			await self_obj.IncreaseUserExp(uid, -1*num);
		}
		
		return res3;
	},
	
	async GetAddByUserVoteRecordObj(uid, vid, titleindex, subtitleindex , titlename , subtitlename, num ,username , exp_before){
		return {
			userid : uid,
			groupid : 0,
			type : 3,
			exp_change : num ,
			exp_before : exp_before,
			exp_after : exp_before - num,
			vo_id : vid,
			vo_title_index : titleindex,
			vo_title : titlename,
			vo_target_index: subtitleindex,
			vo_target_title: subtitlename,
			createtime : Date.now().toString()
		};
	},
	
	async Test_ClearAllData(){
		let res = await db.collection("lm-expchangerecord").remove();
		return res;
	},
	
	
}
