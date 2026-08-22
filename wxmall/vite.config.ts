import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// uni-app + Vite 配置
// @ 别名由 uni 插件自动指向 src；如需自定义可在此扩展
export default defineConfig({
  plugins: [uni()]
})
