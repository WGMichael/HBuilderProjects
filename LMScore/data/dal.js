
import systemsetting from '@/data/systemsetting.js'	
import userinfo from '@/data/userinfo.js'	
	
class DalMgr {
	  constructor() {
		  this.systemsetting = null;
	  }

	init(){
		
		this.systemsetting = new systemsetting();
		this.systemsetting.init();
		
		this.userinfo = new userinfo();
		this.userinfo.init();
		
		
	}
 

}

// 单例模式，确保全局唯一
const dalMgr = new DalMgr();
export default dalMgr;

