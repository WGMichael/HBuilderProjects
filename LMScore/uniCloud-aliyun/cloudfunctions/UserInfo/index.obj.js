// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129

'use strict';
const db = uniCloud.database();
const crypto = require('crypto');
//const memCache = require('../common/memCache.js')
const self_obj = uniCloud.importObject('UserInfo');

// const path = require('path')
// const memCache = require(path.join(__dirname, 'common/memCache.js'))
function requireCommon(relPath) {
  // relPath 例子：'configCache' 或 'configCache/index.js'
  try {
    // 本地：sysSetting -> ../common
    return require('../' + relPath);
  } catch (e1) {
    try {
      return require('./' + relPath);
    } catch (e2) {
		  // 抛一个更好读的错误，方便定位
	  const err = new Error(
		`Cannot load common module: ${relPath}\n` +
		`Tried: ../${relPath} and ./${relPath}\n` +
		`e1: ${e1.message}\n` +
		`e2: ${e2.message}`
	  );
	  err.cause = e2;
	  throw err;
    }
  }
}
const memCache = requireCommon('/memCache.js');

function genToken() {
  // 32字节随机数 -> 64位hex字符串
  return crypto.randomBytes(32).toString('hex');
}

function getCacheExpKey(uid) {
  return `user:exp:${uid}`;
}
function getCacheTokenKey(token , devicetype) {
  return `author:token:${token}devic:${devicetype}`;
}
module.exports = {
	_before: function () { // 通用预处理器
		
	},
	
	async CheckTokenIsValiable(token , devicetype){
		const cached = memCache.get(getCacheTokenKey(token, devicetype));
		if(cached) return {errCode:0, result:0 ,errMsg : "" , uid :cached};
		
		var res = await db.collection("lm-usersessions").where({token , deviceType : devicetype}).get();
		const user = res.data && res.data[0];
		if (!user || Number(user.expireAt) < Date.now()) return {errCode:10001, result:10001 ,errMsg : "token过期"};
		memCache.set(getCacheTokenKey(token, devicetype), user.uid, 36000);
		return {errCode:0, result:0 ,errMsg : "" ,  uid :user.uid};
	},
	
	async getUserExpByToken(token,devicetype, isforce=false) {
	    // 1) 内存缓存命中
		let uid = 0;
		const res_token = await self_obj.CheckTokenIsValiable(token,devicetype);
		if(res_token.errCode != 0){
			return res_token
		}else{
			uid = res_token.uid;
		}
		console.log("====getUserExpByToken==isforce==" , isforce)
		const cached = memCache.get(getCacheExpKey(uid));
		if (cached && !isforce) return cached;
		// 2) DB 回源
	    const res = await db.collection("lm-userinfo").doc(uid).field({ exp: true}).get();
		console.log("====getUserExpByToken==res==" , res)
	    const user = res.data && res.data[0];
	    if (!user) return {errCode:10001, result:10001 ,errMsg : "token过期"};
	    // 3) 写入内存缓存（比如 60 秒：短一点更安全）
	    memCache.set(getCacheExpKey(uid), user.exp , 60*10);
	
	    return user.exp;
	},
	async getUserExp(uid) {
	    // 1) 内存缓存命中
	    const cached = memCache.get(getCacheExpKey(uid));
	    if (cached) return cached;
	    // 2) DB 回源
	    const res = await db.collection("lm-userinfo").doc(uid).field({ exp: true}).get();
	    const user = res.data && res.data[0];
	    if (!user) return {errCode:10001, result:10001 ,errMsg : "token过期"};
	    // 3) 写入内存缓存（比如 60 秒：短一点更安全）
	    memCache.set(getCacheExpKey(uid), user.exp , 60*10);
	
	    return user.exp;
	},
	async updateUserExp_cache(uid , expcount) {
		memCache.set(getCacheExpKey(uid), expcount , 60*10);
		return expcount;
	},
	
	clearUserExp(uid) {
		console.log("====clearUserExp==uid==" , uid)
		memCache.del(getCacheExpKey(uid));
	},
	
	async GetUserInfo(uid){
		var res_info = await db.collection("lm-userinfo").doc(uid).get();
		return res_info;
	},
	//expcount 可以是负数
	async IncreaseUserExp(uid , expcount){
		var res_info = null;
		if(expcount < 0){
			res_info = await db.collection("lm-userinfo").where({ _id: uid, points: exp.gte(-1*expcount) }).update({
				$inc: {
					exp: expcount
				}
			});
		}else{
			res_info = await db.collection("lm-userinfo").where({ _id: uid}).update({
				$inc: {
					exp: expcount
				}
			});
		}
		
		if(res_info.updated){
			memCache.del(getCacheExpKey(uid));
		}
		
		return res_info;
	},
	
	async UpdateUserExp(uid , expcount){
		var res_info = await db.collection("lm-userinfo").doc(uid).update({
			exp : expcount
		});
		if(res_info.updated){
			memCache.set(getCacheExpKey(uid), expcount , 60*10);
		}
		return res_info;
	},
	
	async RequestLoginByToken(token , devicetype) {
		const res_token = await self_obj.CheckTokenIsValiable(token , devicetype);
		if(res_token.result != 0){
			return res_token;
		}
		
		const ttlMs = 7 * 24 * 3600 * 1000; // 7天
		const expireAt = Date.now() + ttlMs;
		const res_update = await db.collection('lm-usersessions').where({token:token}).update({
		  expireAt,
		});
		
		const uid = res_token.uid;
		var res_info = await db.collection("lm-userinfo").doc(uid).get();
		if(res_info.data.length > 0){
			memCache.set(getCacheTokenKey(token, devicetype), user.uid, 36000);
			//可以成功用token登录 ，反回用户数据
			res_info.data[0].token = token;
			res_info.data[0].tokenExpired = expireAt;
			return res_info;
		}
		return {errCode:0, result:10001 ,errMsg : "token过期" , data:[]}
	},
	
	async RequestLoginByWX(openid, nickname, logourl , devicetype) {
	    let res = await	db.collection("lm-userinfo").where({openid: openid}).get();
		if(!res.data || res.data.length == 0){
			res = await db.collection("lm-userinfo").add({
				openid: openid,
				name: nickname,
				logo: logourl,
				exp : 0,
				pwd : "",
				createtime : Date.now()
			});
			res = await db.collection("lm-userinfo").doc(res.id).get()
		}
		if(res.data.length != 1){
			return {errCode:1 ,errMsg : "数据异常" , data:[]};
		}
		
		// 3) 生成“你系统的业务 token”（JWT）
		const token = genToken();
		const now = Date.now();
		const ttlMs = 7 * 24 * 3600 * 1000; // 7天
		const expireAt = now + ttlMs;
		var res_1 = await db.collection("lm-usersessions").where({uid: res.data[0]._id , deviceType : devicetype}).get();
		if(res_1.data.length > 0){
			await db.collection('lm-usersessions').doc(res_1.data[0]._id).update({
			  token,
			  expireAt,
			});
		}else{
			await db.collection('lm-usersessions').add({
			  token,
			  uid : res.data[0]._id,
			  openid,
			  expireAt,
			  deviceType : devicetype
			});
		}
		
		res.data[0].token = token;
		res.data[0].tokenExpired = expireAt;
		// 返回结果
		return res
	},
	
	
	async RequestLoginByAccountAndPwd(account, pwd , devicetype) {
	    let res = await	db.collection("lm-userinfo").where({name: account , pwd:pwd}).get();
		if(res.data.length > 0){
			if (res.data.length > 1) {
			    // 需要删除的记录
			    const deleteList = res.data.slice(1);
			    // 批量删除
				await Promise.all(
					deleteList.map(item =>
					  db.collection("lm-userinfo").where({name: account , pwd:pwd}).remove()
					)
				);
				res.data = res.data.slice(0,1);
			}
		}
		if(res.data.length != 1){
			return {errCode:1 ,errMsg : "登录失败，检查输入" , data:[]};
		}
		
		// 3) 生成“你系统的业务 token”（JWT）
		const token = genToken();
		const now = Date.now();
		const ttlMs = 7 * 24 * 3600 * 1000; // 7天
		const expireAt = now + ttlMs;
		var res_1 = await db.collection("lm-usersessions").where({uid: res.data[0]._id , deviceType : devicetype}).get();
		if(res_1.data.length > 0){
			if (res_1.data.length > 1) {
			    // 需要删除的记录
			    const deleteList = res_1.data.slice(1);
			    // 批量删除
				await Promise.all(
					deleteList.map(item => db.collection("lm-usersessions").doc(item._id).remove() )
				);
				res_1.data = res_1.data.slice(0,1);
			}
			
			await db.collection('lm-usersessions').doc(res_1.data[0]._id).update({
			  token,
			  expireAt,
			});
		}else{
			await db.collection('lm-usersessions').add({
			  token,
			  uid : res.data[0]._id,
			  openid : "",
			  expireAt,
			  deviceType : devicetype
			});
		}
		
		res.data[0].token = token;
		res.data[0].tokenExpired = expireAt;
		// 返回结果
		return res;
	},
}
