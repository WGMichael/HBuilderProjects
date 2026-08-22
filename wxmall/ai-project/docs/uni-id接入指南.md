# uni-id-pages 接入指南（支付宝云）

本项目为 **CLI / Vite 工程**，服务空间为 **支付宝云**（uniCloud-alipay）。
接入采用**分域策略**：

- **认证域**（登录 / 注册 / 找回密码 / 改密）：使用官方 **uni-id-pages 全家桶**自带页面与云对象 `uni-id-co`，开箱即用。
- **业务域**（商品 / 订单 / 地址）：继续走本项目 `db` 数据层，约定不变。
- **`store/user.ts`** 作为两者的桥：以 uni-id 的 `uni_id_token` 为登录态之源，`silentLogin()` 改调 uni-id 微信登录。

登录方式落地情况（四种全部在代码/配置层做好，用开关控制）：

| 登录方式 | 现在能否联调 | 前置条件 |
|---|---|---|
| 账号（用户名）+ 密码 | ✅ 能 | 服务空间已开通即可 |
| 微信登录 | ⏸ 待联调 | 需小程序 **appid + appsecret**（暂缺） |
| 手机号 + 短信验证码 | ⏸ 待联调 | 需开通 **uni-sms** 短信服务（实名+付费） |
| 邮箱 + 密码 | ⏸ 待联调 | 需配置 **SMTP** 邮件服务 |

---

## 阶段 0 · 环境准备（你在 HBuilderX 操作）

> 命令行环境无法一键导入插件市场依赖，也无法上传云函数，故此步在 HBuilderX 完成。

### 0.1 用 HBuilderX 打开本工程
- HBuilderX → 文件 → 打开目录 → 选 `wxmall` 根目录（CLI 工程 HBuilderX 也能直接打开）。

### 0.2 一键导入 uni-id-pages
- 浏览器打开插件市场：<https://ext.dcloud.net.cn/plugin?name=uni-id-pages>
- 点「**使用 HBuilderX 导入插件**」→ 选择本项目 `wxmall` 导入。
- HBuilderX 会自动带入全部依赖 `uni_modules`，预期在 `src/uni_modules/` 下生成：
  - `uni-id-pages`（登录/注册页面 + store + 云对象 uni-id-co）
  - `uni-id-common`（token/权限公共模块）
  - `uni-config-center`（配置中心）
  - `uni-captcha`（图形验证码）
  - UI 依赖：`uni-scss`、`uni-icons`、`uni-forms`、`uni-easyinput`、`uni-popup` 等

### 0.3 确认支付宝云目录
- 导入后应生成云端目录。若名为 `uniCloud-aliyun`，需改名为 **`uniCloud-alipay`**（支付宝云约定）。
- 右键 `uniCloud-alipay` 目录 → **关联云服务空间** → 选你已开通的**支付宝云**服务空间。

### 0.4 上传云端资源
- 右键 `uniCloud-alipay/cloudfunctions/uni-id-co` → **上传部署**。
- 右键 `uniCloud-alipay/cloudfunctions/common/uni-config-center` → **上传公共模块**（含 uni-id 配置）。
- 右键 `uniCloud-alipay/database` 下的 schema（`uni-id-users.schema.json` 等）→ **上传 DB Schema**。

### 0.5 告知我目录结构
完成后把 `src/uni_modules/` 与 `uniCloud-alipay/` 的目录树发我（或让我读取），我据此进行阶段 1~3 的代码配置。

---

## 阶段 1 · 云端配置（我来做）
- 编辑 `uni-config-center/uniCloud/cloudfunctions/common/uni-config-center/uni-id/config.json`：
  - `passwordSecret`、`tokenSecret`、`tokenExpiresIn`
  - 开启 `username-password` 登录
  - `mp-weixin.oauth.weixin` 填 appid + appsecret（**先占位**，拿到后替换）
  - 短信 / 邮箱开关先关闭并留占位

## 阶段 2 · 前端集成（我来做）
- `src/pages.json`：引入 uni-id-pages 登录页路由、配置 easycom 使 uni-ui 组件可用。
- 首页 / "我的" 入口：未登录跳转 uni-id-pages 登录页。

## 阶段 3 · store 桥接 + 数据层对齐（我来做）
- 改 `src/store/user.ts`：登录态读 `uni_id_token`，`silentLogin()` 调 uni-id 微信登录，`logout()` 调 uni-id-co 登出。
- `IDataSource` 增加 `getUserInfo()`；cloud 实现校验 token，mock 实现给假数据，双端签名一致。

## 阶段 4 · 验证
- H5 或微信开发者工具跑通：账号密码 **注册 → 登录 → 查看登录态 → 退出**。
- 微信 / 短信 / 邮箱凭证到位后逐一联调。

---

## 支付宝云注意事项
- 目录名固定为 `uniCloud-alipay`。
- 支付宝云为较新 provider，个别边缘能力（定时触发、少数 API）与阿里云可能有差异；登录/注册主流程支持。若联调撞到不支持的能力，再针对性处理。
