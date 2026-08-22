import { createSSRApp } from 'vue'
import App from './App.vue'

// Vue3 版 uni-app 入口
export function createApp() {
  const app = createSSRApp(App)
  return { app }
}
