import langData from '@/data/lang/lang-zh.json'	
	
class LangMgr {
  constructor() {
	this.langObj = null;
  }

	init(){
		console.log("====content==123123===")
		this.langObj = langData;//JSON.parse(langData);
	}


  // 获取指定语言文本
  get(key) {
	  //console.log("====content=====" , this.langObj)
    let content = this.langObj[key]
	
    return content || key;
  }

}

// 单例模式，确保全局唯一
const langMgr = new LangMgr();
export default langMgr;