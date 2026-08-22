import App from './App'
import uviewPlus from '@/uni_modules/uview-plus'

// #ifndef VUE3
import Vue from 'vue'
import './uni.promisify.adaptor'

Vue.config.productionTip = false
App.mpType = 'app'
const app = new Vue({
  ...App
})
app.$mount()
// #endif

// #ifdef VUE3
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import LangMgr from '@/data/lang/LangMgr.js'
import Dal from '@/data/dal.js'
import Events from '@/utils/Events.js'
import {EventNames} from '@/utils/EventNames.js'

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  app.use(uviewPlus)
  
  app.config.globalProperties.$t = (key) => LangMgr.get(key);
  app.config.globalProperties.LangMgr = LangMgr;
  app.config.globalProperties.Dal = Dal;
  app.config.globalProperties.Events = Events;
  app.config.globalProperties.EventNames = EventNames;
  uni.$t = (key) => LangMgr.get(key);
  uni.LangMgr = LangMgr;
  uni.Dal = Dal;
  uni.Events = Events;
  uni.EventNames = EventNames;
  
  
  LangMgr.init();
  Dal.init();
  
  return {
    app
  }
}
// #endif