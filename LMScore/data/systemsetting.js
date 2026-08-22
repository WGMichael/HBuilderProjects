
import Enum from '@/common/Enum.js';
	
class systemsetting {
	
	constructor() {
		
		var info = null;
	}
	

	init(){
		
	}
	
	async getSysSetting(){
		console.log("==getSysSetting==1111=")
		const setobj = uniCloud.importObject("sysSetting");
		const res = await setobj.getSysSetting()
		console.log("==getSysSetting==7987=" , res)
		if(res.data.length > 0){
			this.info = res.data[0];
		}
	}
	
	getCreatevoteneed(){
		if(this.info && this.info.vocreatecost){
			return Number(this.info.vocreatecost);
		}
		return 3;
	}
	getCreateTotalRate(){
		if(this.info && this.info.createallrate){
			return Number(this.info.createallrate);
		}
		return 1.7;
	}
	
	getWXAP_ID(){
		if(this.info && this.info.wxopenid){
			return this.info.wxopenid;
		}
		return "";
	}
	
	getvoteStatus(status){
		if(status == Enum.Vo_StatusType.Open){
			return '开放中';
		}else if(status == Enum.Vo_StatusType.Lock){
			return '已锁定'; 
		}else if(status == Enum.Vo_StatusType.Dispose){
			return '流盘'; 
		}else if(status == Enum.Vo_StatusType.Finish){
			return '已结束'; 
		}else{
			return '开放中..';
		}
	}
	getuservote_isrightvote_Des(type){
		if(type == 0){
			return uni.$t('uservote_lost');
		}else if(type == 1){
			return uni.$t('uservote_win');
		}else if(type == -1){
			return uni.$t('uservote_none');
		}else if(type == 100){
			return uni.$t('detail_cancle');
		}
	}
	
	
	getexprecord_type_Des(type){
		return uni.$t('exp_record_type_' + type);
	}
}


export default systemsetting;