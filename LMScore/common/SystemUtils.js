const SystemUtils =  {
	getDeviceType() {
	  const ua = navigator.userAgent.toLowerCase();
	  const isMobile = /iphone|ipad|ipod|android|mobile/.test(ua);
	  return isMobile ? 'mobile' : 'pc';
	}
	
	
	
	
	
	
};

export default SystemUtils;
	

