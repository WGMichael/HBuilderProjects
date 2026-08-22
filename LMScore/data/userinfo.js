	
import SystemUtils from '@/common/SystemUtils.js';
import StoreKey from '@/common/StoreKey.js';

class userinfo {
	constructor() {
		
	}

	init(){
		this.loginVid = "0";
		
		this.id = null;
		this.groupid = '0';
		this.token = "";
		
		this.openid = "";	
		this.nickname = '';		
		this.exp = 0;			
		this.icon = '';		 
		 
		 
	}
	
	
	//尝试用token去登录,会抛出两种事件， Evt_TokenLogin_Fail / Evt_Login_Success
	async AuthenticTokenStatus(){
		uni.showLoading({
			title: "自动登录中",
			icon:'none'
		})
		
		const token = uni.getStorageSync(StoreKey.KEY_TOKEN);
		console.log("==token===" , token)
		if(!token){
			uni.Events.emit(uni.EventNames.Evt_TokenLogin_Fail);
		}else{
			const devicetype = SystemUtils.getDeviceType();
			const lm_userinfo = uniCloud.importObject("UserInfo");
			const res = await lm_userinfo.RequestLoginByToken(token, devicetype);
			console.log("==AuthenticTokenStatus=00==" , res)
			if(res.data.length > 0){
				this.openid = res.data[0].openid;	
				this.nickname = res.data[0].name;	
				this.exp = res.data[0].exp;	
				this.icon = res.data[0].logo;	
				this.id = res.data[0]._id;
				
				// token 处理
				this.token = res.data[0].token;
				console.log("==token==77777==" , res.data[0].token)
				uni.setStorageSync(StoreKey.KEY_TOKEN , res.data[0].token);
				uni.Events.emit(uni.EventNames.Evt_Login_Success);
			}else{
				uni.Events.emit(uni.EventNames.Evt_TokenLogin_Fail);
			}
		}
		uni.hideLoading();
	}
	
	//尝试用token去登录,会抛出两种事件， Evt_TokenLogin_Fail / Evt_Login_Success
	async LoginByAccountAndPWD(name , pwd){
		uni.showLoading({
			title: "登录中",
			icon:'none'
		})
		const devicetype = SystemUtils.getDeviceType();
		const lm_userinfo = uniCloud.importObject("UserInfo");
		const res = await lm_userinfo.RequestLoginByAccountAndPwd(name, pwd, devicetype);
		console.log("==LoginByAccountAndPWD===" , res)
		if(res.data.length > 0){
			this.openid = res.data[0].openid;
			this.nickname = res.data[0].name;
			this.exp = res.data[0].exp;
			this.icon = res.data[0].logo;
			this.id = res.data[0]._id;
			
			// token 处理
			this.token = res.data[0].token;
			console.log("==token==77777==" , res.data[0].token)
			uni.setStorageSync(StoreKey.KEY_TOKEN , res.data[0].token);
			uni.Events.emit(uni.EventNames.Evt_Login_Success);
		}else{
			uni.Events.emit(uni.EventNames.Evt_TokenLogin_Fail);
		}
		uni.hideLoading();
	}
	
	async setLoginInfoByWX(openid , name , logourl){
		uni.showLoading({
			title: "登录中",
			icon:'none'
		})
		const devicetype = SystemUtils.getDeviceType();
		const lm_userinfo = uniCloud.importObject("UserInfo");
		const res = await lm_userinfo.RequestLoginByWX(openid , name , logourl, devicetype);
		console.log("==setLoginInfoByWX===" , res)
		if(res.data.length > 0){
			this.openid = res.data[0].openid;
			this.nickname = res.data[0].name;
			this.exp = res.data[0].exp;
			this.icon = res.data[0].logo;
			this.id = res.data[0]._id;
			
			// token 处理
			this.token = res.data[0].token;
			console.log("==token==77777==" , res.data[0].token)
			uni.setStorageSync(StoreKey.KEY_TOKEN , res.data[0].token);
			uni.Events.emit(uni.EventNames.Evt_Login_Success);
		}else{
			this.clearStorage();
			uni.Events.emit(uni.EventNames.Evt_TokenLogin_Fail);
		}
		uni.hideLoading();
	}
	
	async refreshUserExp(isforce = false){
		const lm_userinfo = uniCloud.importObject("UserInfo");
		const devicetype = SystemUtils.getDeviceType();
		const exp = await lm_userinfo.getUserExpByToken(this.token , devicetype , isforce);
		if(exp.result == 10001){
			this.clearStorage();
			uni.reLaunch({
				url : "/pages/index/index"
			})
		}else{
			this.setExp(exp);
		}
	}
	
	getInfo(){
		return this;
	}
	getStoreInfo(){
		return store.userInfo;
	}
	getId(){
		return this.id;
	}
	
	setExp(exp){
		this.exp = exp;
		uni.Events.emit(uni.EventNames.Evt_UserInfo_Update);
	}
	
	getExp(){
		return this.exp;
	}
	
	clearStorage(){
		this.loginVid = "0";
		this.id = null;
		this.groupid = '0';
		this.token = "";
		this.openid = "";	
		this.nickname = '';		
		this.exp = 0;			
		this.icon = '';
		
		uni.setStorageSync(StoreKey.KEY_TOKEN , "");
	}
	
	
	
}


export default userinfo;