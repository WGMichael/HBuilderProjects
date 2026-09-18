<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
// uni-id-pages 初始化（clientDB 错误绑定、token 刷新监听等），js 模块无类型声明
// @ts-ignore
import initUniIdPages from "@/uni_modules/uni-id-pages/init.js";
onLaunch(() => {
  initUniIdPages();
  console.log("App Launch");
});
onShow(() => {
  console.log("App Show");
});
onHide(() => {
  console.log("App Hide");
});
</script>
<style></style>
