<script setup>
	import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
	import StoreKey from '@/common/StoreKey.js';
	
	onLaunch(()=>{
		console.log('App Launch')
		
		const loginVid = getQueryParam('vid');
		uni.setStorageSync(StoreKey.KEY_VID , loginVid);
		
		getSysSetting();
	})
	onShow(()=>{
		console.log('App onShow')
	})
	onHide(()=>{
		console.log('App onHide')
	})

	const getQueryParam = (name)=> {
	  const q = location.search || ''; // 注意：微信会把 code 放在 redirect_uri 的 query 上
	  const m = q.match(new RegExp(`[?&]${name}=([^&]+)`));
	  return m ? decodeURIComponent(m[1]) : '';
	}
	
	const getSysSetting = async()=> {
		const userobj = uniCloud.importObject("UserInfo");
		await uni.Dal.systemsetting.getSysSetting();
		
		const code = getQueryParam('code');
		if (!code){
			uni.navigateTo({
				url : "/pages/index/index"
			})
		}
	}
	
</script>

<style lang="scss" scoped>
	@import "@/uni_modules/uview-plus/index.scss";
	
	/*每个页面公共css */
</style>
