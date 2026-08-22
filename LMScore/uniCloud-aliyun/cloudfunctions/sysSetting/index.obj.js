// 云对象教程: https://uniapp.dcloud.net.cn/uniCloud/cloud-obj
// jsdoc语法提示教程：https://ask.dcloud.net.cn/docs/#//ask.dcloud.net.cn/article/129

//const ConfigCache = require('../common/configCache/index.js')
// const path = require('path')
// const configCache = require(path.join(__dirname, 'common/configCache/index.js'))
function requireCommon(relPath) {
  // relPath 例子：'configCache' 或 'configCache/index.js'
  try {
    // 本地：sysSetting -> ../common
    return require('../' + relPath);
  } catch (e1) {
    try {
      // 云端打包后：入口在 function 根 -> ./common
      return require('./' + relPath);
    } catch (e2) {
		const err = new Error(
		  `Cannot load common module: ${relPath}\n` +
		  `Tried: ../common/${relPath} and ./common/${relPath}\n` +
		  `e1: ${e1.message}\n` +
		  `e2: ${e2.message}`
		);
		err.cause = e3;
		throw err;
    }
  }
}
const ConfigCache = requireCommon('setting.js'); // 自动找 index.js
//const ConfigCache = requireCommon('configCache/index.js'); // 自动找 index.js
const db = uniCloud.database();

module.exports = {
	_before: function () { // 通用预处理器
		ConfigCache.ensureLoaded(true);
	},


	// 给别的云对象调用（如果你不想 require 公共模块，也可以 callObject）
	async get(key, defaultValue = null) {
	// _before 已经 ensureLoaded 了，这里直接取
		const v1 = ConfigCache.getSync("wxopenid", "");
		if(v1 == "") {
			await ConfigCache.ensureLoaded(true);
		}
		const v2 = ConfigCache.getSync(key, defaultValue)
		return v2;
	},

	async getAll() {
		const all = await ConfigCache.ensureLoaded(false)
		return all;
	},

	// 管理员/发布后手动刷新
	async refresh() {
		const all = await ConfigCache.ensureLoaded(true)
		return { ok: true, keys: Object.keys(all).length }
	},

	async getSysSetting(){
		var res = await db.collection("lm-syssetting").get();
		return res;
	},
	
	
	async AddSysSetting(){
		var res = await db.collection("lm-syssetting").add({
			wxopenid : "wx12ab386d5286e0bb",
			vocreatecost : 8,
			createallrate : 1.7,
			reserve2 : "",
			reserve3 : ""
		});
		return res;
	},

}
