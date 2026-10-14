<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
// uni-id-pages 初始化（clientDB 错误绑定、token 刷新监听等），js 模块无类型声明
// @ts-ignore
import initUniIdPages from "@/uni_modules/uni-id-pages/init.js";
// @ts-ignore
import { setupRequest } from "@/common/grouporder/request.js";
onLaunch(() => {
  initUniIdPages();
  // 把云对象调用层的「会话失效」钩子接到登录页（D-033）
  setupRequest();
  console.log("App Launch");
});
onShow(() => {
  console.log("App Show");
});
onHide(() => {
  console.log("App Hide");
});
</script>
<style>
/* 原生主按钮统一为主题绿（H5 默认蓝、微信默认微信绿），色值同 uni.scss 的 $go-primary */
button[type="primary"],
uni-button[type="primary"] {
  background-color: #168a55;
  color: #ffffff;
}
button[type="primary"][disabled],
uni-button[type="primary"][disabled] {
  background-color: #168a55;
  color: #ffffff;
  opacity: 0.5;
}

/* uni-id-pages（uni_modules 内，不直接改插件文件）的蓝色在这里覆盖为主题色。
 * 插件样式带 scoped 属性选择器或行内样式，只能用 !important 压过。 */
.link,
.agreement {
  color: #0f6b41 !important; /* 协议、忘记密码等文字链接，原 #04498c */
}
.uni-easyinput__content.is-focused {
  border-color: #168a55 !important; /* 输入框聚焦描边，原为组件默认 #2979ff 行内样式 */
}
.uni-easyinput__content.is-focused .content-clear-icon {
  color: #168a55 !important;
}
</style>
