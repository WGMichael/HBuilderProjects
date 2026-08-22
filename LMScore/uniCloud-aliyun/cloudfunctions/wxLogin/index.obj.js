// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129

'use strict';
const db = uniCloud.database();

const APPID = 'wx12ab386d5286e0bb';
const SECRET = 'dbed3841e4de2a2807d1fcf10c6a9202'; // 建议放到云端环境变量，不要硬编码

module.exports = {
	_before: function () { // 通用预处理器

	},
	
	
	async loginByCode({ code }) {
	    if (!code) return { errCode: 1, errMsg: 'code不能为空' };
	
	    // 1) 用 code 换 网页授权 access_token + openid
	    // 接口形如：https://api.weixin.qq.com/sns/oauth2/access_token?appid=...&secret=...&code=...&grant_type=authorization_code
	    const tokenRes = await uniCloud.httpclient.request(
	      'https://api.weixin.qq.com/sns/oauth2/access_token',
	      {
	        method: 'GET',
	        data: {
	          appid: APPID,
	          secret: SECRET,
	          code,
	          grant_type: 'authorization_code'
	        },
	        dataType: 'json'
	      }
	    );
	
	    const tokenData = tokenRes.data;
	    if (!tokenData || tokenData.errcode) {
	      return { errCode: 2, errMsg: '换取access_token失败', detail: tokenData };
	    }
	
	    const { access_token, openid, unionid } = tokenData;
	
	    // 2) 若 scope=snsapi_userinfo，拉取用户信息
	    // 接口形如：https://api.weixin.qq.com/sns/userinfo?access_token=...&openid=...&lang=zh_CN
	    const userRes = await uniCloud.httpclient.request(
	      'https://api.weixin.qq.com/sns/userinfo',
	      {
	        method: 'GET',
	        data: {
	          access_token,
	          openid,
	          lang: 'zh_CN'
	        },
	        dataType: 'json'
	      }
	    );
	
	    const userInfo = userRes.data;
	    if (!userInfo || userInfo.errcode) {
	      return { errCode: 3, errMsg: '拉取用户信息失败', detail: userInfo, openid, unionid };
	    }
	
	    // 3) 你自己的登录体系（示例：用 openid 作为外部身份标识入库）
	    // 建议：生成你自己的 token（可用 uni-id / 自己签 JWT）
	    // 这里只演示返回用户信息
	    return {
	      errCode: 0,
	      openid,
	      unionid: unionid || userInfo.unionid,
	      nickname: userInfo.nickname,
	      headimgurl: userInfo.headimgurl,
	      sex: userInfo.sex,
	      province: userInfo.province,
	      city: userInfo.city
	    };
	  }
}
