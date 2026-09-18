const initialState = () => ({
  screen: "home",
  history: [],
  loggedIn: false,
  activityStatus: "进行中",
  selectedAddress: 1,
  cart: { 1: 1, 2: 0, 3: 0 },
  products: [
    { id: 1, name: "高山红心猕猴桃", price: 36, unit: "箱", stock: 50, sold: 26, limit: 3, icon: "🥝", stopped: false },
    { id: 2, name: "现摘甜玉米", price: 22, unit: "份", stock: 30, sold: 15, limit: 4, icon: "🌽", stopped: false },
    { id: 3, name: "农家散养鸡蛋", price: 28, unit: "盒", stock: 0, sold: 0, limit: 0, icon: "🥚", stopped: true },
  ],
  addresses: [
    { id: 1, name: "陈小雨", phone: "138****2468", address: "南山区科技园科苑路 88 号 3 栋 1205", isDefault: true },
    { id: 2, name: "陈妈妈", phone: "136****0912", address: "福田区香蜜湖街道景田北小区 16 栋 702", isDefault: false },
    { id: 3, name: "王老师", phone: "159****6301", address: "罗湖区翠竹街道文锦中路 112 号", isDefault: false },
  ],
  orders: [
    { id: "JL092801", status: "有效", recipient: "陈妈妈", items: "红心猕猴桃 × 1", total: 36, time: "今天 10:24" },
    { id: "JL092756", status: "已取消", recipient: "陈小雨", items: "甜玉米 × 2", total: 44, time: "昨天 18:06" },
  ],
  showModal: null,
});

let state = initialState();

const screens = {
  home: ["首页", "浏览公开活动或发起一次新的接龙。", "群接龙"],
  login: ["登录", "在需要提交或管理时完成登录，之后返回原任务。", "登录"],
  create: ["创建活动", "填写活动信息、截止时间并维护商品集合。", "创建接龙"],
  product: ["编辑商品", "配置商品价格、单位、总库存和可选的每人限购。", "商品信息"],
  preview: ["发布预览", "以参与者视角核对内容并提交发布审核。", "发布预览"],
  activity: ["活动详情", "游客可浏览非敏感内容，登录后提交接龙。", "周末水果接龙"],
  address: ["收货信息", "从多条完整收货信息中选择本单收货人。", "选择收货信息"],
  confirm: ["确认接龙", "核对商品、累计限购、收货快照与预计金额。", "确认接龙"],
  orders: ["我的接龙", "同一活动下可以管理多张独立接龙单。", "我的接龙"],
  leader: ["活动管理", "团长查看统计、管理商品并处理截止与清单。", "活动管理"],
};

const app = document.querySelector("#app");
const stageTitle = document.querySelector("#stageTitle");
const stageDescription = document.querySelector("#stageDescription");
const miniTitle = document.querySelector("#miniTitle");
const backButton = document.querySelector("#backButton");
const toast = document.querySelector("#toast");

const money = (value) => `¥${Number(value).toFixed(2)}`;
const selectedItems = () => state.products.filter((product) => state.cart[product.id] > 0);
const cartCount = () => selectedItems().reduce((sum, product) => sum + state.cart[product.id], 0);
const cartTotal = () => selectedItems().reduce((sum, product) => sum + product.price * state.cart[product.id], 0);
const currentAddress = () => state.addresses.find((address) => address.id === state.selectedAddress) || state.addresses[0];

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function navigate(screen, push = true) {
  if (!screens[screen]) return;
  if (push && state.screen !== screen) state.history.push(state.screen);
  state.screen = screen;
  state.showModal = null;
  render();
}

function bottomNav(active) {
  return `
    <nav class="bottom-nav">
      <button data-action="navigate" data-screen="home" class="${active === "home" ? "active" : ""}"><i>⌂</i>首页</button>
      <button data-action="navigate" data-screen="orders" class="${active === "orders" ? "active" : ""}"><i>▤</i>我的接龙</button>
      <button data-action="navigate" data-screen="leader" class="${active === "leader" ? "active" : ""}"><i>◎</i>我发起的</button>
    </nav>`;
}

function eventCard() {
  return `
    <article class="card event-card" data-action="navigate" data-screen="activity">
      <div class="event-thumb">水果<br/>拼箱</div>
      <div>
        <h4>周末产地水果接龙</h4>
        <div class="meta">公开活动 · 明天 20:00 截止</div>
        <div style="margin-top:7px"><span class="tag">进行中</span></div>
      </div>
      <span class="chevron">›</span>
    </article>`;
}

function renderHome() {
  return `
    <div class="page">
      <section class="hero">
        <p class="hero-kicker">熟人群里的轻量接龙</p>
        <h2>发起简单，<br/>统计清楚。</h2>
        <p>不收款、不发货，只帮你把商品、数量和收货信息整理好。</p>
        <div class="hero-actions">
          <button class="primary-button" data-action="protected" data-target="create">＋ 发起接龙</button>
          <button class="ghost-button" data-action="navigate" data-screen="activity">查看示例</button>
        </div>
      </section>
      <section class="page-pad">
        <div class="section-head"><h3>公开活动</h3><button data-action="toast" data-message="已按发布时间显示全部公开活动">查看全部</button></div>
        ${eventCard()}
        <article class="card event-card">
          <div class="event-thumb">办公<br/>用品</div>
          <div><h4>九月办公用品补充</h4><div class="meta">公开活动 · 3 天后截止</div><div style="margin-top:7px"><span class="tag">进行中</span></div></div>
          <span class="chevron">›</span>
        </article>
        <div class="notice green">分享入口只用于进入活动，收货信息与订单明细仍按身份和角色保护。</div>
      </section>
      ${bottomNav("home")}
    </div>`;
}

function renderLogin() {
  return `
    <div class="page">
      <section class="login-hero">
        <div class="login-logo">接</div>
        <h2>登录后继续</h2>
        <p>你仍可在未登录时浏览活动。提交接龙、查看历史或管理活动需要登录。</p>
      </section>
      <section class="login-actions">
        <button class="primary-button wide" data-action="login">微信授权登录</button>
        <div class="login-divider">或者</div>
        <div class="card" style="margin:0">
          <div class="field"><label>用户名</label><input value="chenxiaoyu" aria-label="用户名" /></div>
          <div class="field"><label>密码</label><input type="password" value="12345678" aria-label="密码" /></div>
        </div>
        <button class="ghost-button wide" data-action="login">账号密码登录</button>
        <button class="text-link" data-action="toast" data-message="注册入口已记录，首版不关联手机号">注册一个账号</button>
      </section>
      <div class="form-tip">登录账号不使用收货电话。账号绑定微信后，可通过微信身份验证重设密码。</div>
    </div>`;
}

function renderCreate() {
  return `
    <div class="page">
      <section class="form-card">
        <div class="field"><label>活动名称</label><input value="周末产地水果接龙" /></div>
        <div class="field"><label>活动说明</label><textarea>果园周五现摘，周日下午统一到货。请按实际需要填写，费用线下结算。</textarea></div>
        <div class="field-row">
          <div class="field"><label>截止日期</label><input value="09 月 14 日" /></div>
          <div class="field"><label>截止时间</label><input value="20:00" /></div>
        </div>
      </section>
      <section class="page-pad">
        <div class="section-head"><h3>接龙商品</h3><button data-action="navigate" data-screen="product">＋ 添加</button></div>
        <div class="card table-list" style="padding:0">
          <div class="table-row"><div><strong>高山红心猕猴桃</strong><small>¥36 / 箱 · 总库存 50 · 限购 3</small></div><button class="mini-button" data-action="navigate" data-screen="product">编辑</button></div>
          <div class="table-row"><div><strong>现摘甜玉米</strong><small>¥22 / 份 · 总库存 30 · 限购 4</small></div><button class="mini-button" data-action="navigate" data-screen="product">编辑</button></div>
        </div>
        <div class="notice">提交后进入审核中，审核通过才会进入公开活动并允许分享。首版不支持规格、支付、配送或成团门槛。</div>
      </section>
      <div class="sticky-actions"><div class="button-row"><button class="ghost-button" data-action="toast" data-message="草稿已保存">保存草稿</button><button class="primary-button" data-action="navigate" data-screen="preview">下一步：预览</button></div></div>
    </div>`;
}

function renderProduct() {
  return `
    <div class="page">
      <section class="page-pad">
        <div class="card" style="height:132px;display:grid;place-items:center;border-style:dashed;color:#7a857f">＋ 添加商品图片</div>
      </section>
      <section class="form-card">
        <div class="field"><label>商品名称</label><input value="高山红心猕猴桃" /></div>
        <div class="field-row">
          <div class="field"><label>单价（元）</label><input value="36.00" /></div>
          <div class="field"><label>单位</label><input value="箱" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>总库存</label><input value="50" /><small class="meta">填 0 表示库存不限</small></div>
          <div class="field"><label>每人限购</label><input value="3" /><small class="meta">填 0 表示不限购</small></div>
        </div>
        <div class="field"><label>商品说明</label><textarea>约 12 个装，单果 80—100g，以实际采摘为准。</textarea></div>
        <div class="field switch-line"><div><label style="margin:0;color:var(--ink)">立即上架</label><small class="meta">发布后参与者可选择</small></div><button class="switch on" data-action="toggle-switch" aria-label="立即上架"></button></div>
      </section>
      <div class="form-tip">商品产生成功订单后仍可改价，但须二次确认；不能删除。活动截止前可停售或恢复售卖。</div>
      <div class="sticky-actions"><button class="primary-button wide" data-action="save-product">保存商品</button></div>
    </div>`;
}

function renderPreview() {
  return `
    <div class="page">
      <div class="notice green">预览模式 · 这是参与者将看到的非敏感活动内容</div>
      <section class="activity-cover">
        <span class="tag">待发布</span>
        <h2>周末产地水果接龙</h2>
        <p>果园周五现摘，周日下午统一到货。费用在线下自行结算。</p>
      </section>
      <section class="page-pad">
        ${state.products.slice(0, 2).map((p) => `
          <article class="card product-card"><div class="product-thumb">${p.icon}</div><div class="product-info"><h4>${p.name}</h4><div class="meta">${p.stock === 0 ? "库存不限" : `总库存 ${p.stock}`} · ${p.limit === 0 ? "不限购" : `每人限购 ${p.limit} ${p.unit}`}</div><div class="product-bottom"><span class="price"><small>¥</small>${p.price}</span><span class="tag gray">预览</span></div></div></article>`).join("")}
        <div class="notice">本平台仅记录接龙信息，不收款、不发货，也不担保交易履约。</div>
      </section>
      <div class="sticky-actions"><div class="button-row"><button class="ghost-button" data-action="navigate" data-screen="create">返回修改</button><button class="primary-button" data-action="publish">提交发布审核</button></div></div>
    </div>`;
}

function renderActivity() {
  return `
    <div class="page">
      <section class="activity-cover"><span class="tag">进行中</span><h2>周末产地水果接龙</h2><p>果园周五现摘，周日下午统一到货。费用在线下自行结算。</p></section>
      <section class="activity-stats"><div><strong>41</strong><span>有效总份数</span></div><div><strong>明天</strong><span>截止日期</span></div><div><strong>20:00</strong><span>截止时间</span></div></section>
      <div class="notice">公开活动有效总份数和各商品已购买份数，不展示有效订单数或其他参与者的身份、收货信息和购买明细。</div>
      <section class="page-pad" style="padding-top:4px">
        <div class="section-head"><h3>选择商品</h3><button data-action="toast" data-message="已刷新库存">刷新库存</button></div>
        ${state.products.map((product) => {
          const quantity = state.cart[product.id] || 0;
          const disabled = product.stopped;
          return `<article class="card product-card">
            <div class="product-thumb">${product.icon}</div>
            <div class="product-info">
              <div class="product-title-line"><h4>${product.name}</h4>${disabled ? '<span class="tag gray">已停售</span>' : ""}</div>
              <div class="meta">已购买 ${product.sold} ${product.unit} · ${product.stock === 0 ? "库存不限" : `总库存 ${product.stock}`} · ${product.limit === 0 ? "不限购" : `每人限购 ${product.limit} ${product.unit}`}</div>
              <div class="product-bottom"><span class="price"><small>¥</small>${product.price}</span>
                <div class="stepper"><button data-action="quantity" data-id="${product.id}" data-delta="-1" ${quantity === 0 ? "disabled" : ""}>−</button><span>${quantity}</span><button class="plus" data-action="quantity" data-id="${product.id}" data-delta="1" ${disabled ? "disabled" : ""}>＋</button></div>
              </div>
            </div>
          </article>`;
        }).join("")}
      </section>
      <div class="sticky-actions"><div class="total-line"><span>已选 ${cartCount()} 件</span><strong>${money(cartTotal())}</strong></div><button class="primary-button wide" data-action="checkout">去确认接龙</button></div>
    </div>`;
}

function renderAddress() {
  return `
    <div class="page page-pad">
      <div class="notice green" style="margin:0 0 14px">每张接龙单选择一条收货信息，并保存当时的姓名、电话和地址快照。</div>
      ${state.addresses.map((address) => `
        <article class="card address-card ${state.selectedAddress === address.id ? "selected" : ""}" data-action="select-address" data-id="${address.id}">
          <span class="radio"></span><span class="edit-link" data-action="edit-address" data-id="${address.id}">编辑</span>
          <h4>${address.name}<span>${address.phone}</span>${address.isDefault ? '<b class="default">默认</b>' : ""}</h4><p>${address.address}</p>
        </article>`).join("")}
      <button class="ghost-button wide" data-action="add-address">＋ 新增收货信息</button>
      <div class="sticky-actions" style="margin:18px -16px -16px"><button class="primary-button wide" data-action="use-address">使用这条收货信息</button></div>
    </div>`;
}

function renderConfirm() {
  const address = currentAddress();
  const items = selectedItems();
  return `
    <div class="page page-pad">
      <article class="card address-card selected" data-action="navigate" data-screen="address"><span class="radio"></span><span class="edit-link">更换 ›</span><h4>${address.name}<span>${address.phone}</span></h4><p>${address.address}</p></article>
      <article class="card">
        <div class="section-head" style="margin:0 0 8px"><h3>接龙商品</h3><button data-action="navigate" data-screen="activity">修改</button></div>
        ${items.length ? items.map((product) => `<div class="summary-product"><div><strong>${product.name}</strong><small>${money(product.price)} / ${product.unit}</small></div><span>× ${state.cart[product.id]}</span></div>`).join("") : '<div class="empty" style="padding:20px">尚未选择商品</div>'}
      </article>
      <article class="card total-card">
        <div class="summary-line"><span>本次共计</span><span>${cartCount()} 件</span></div>
        <div class="summary-line"><span>预计金额</span><span>${money(cartTotal())}</span></div>
      </article>
      <article class="card"><div class="summary-line"><span>已有有效订单</span><span>1 张</span></div><div class="summary-line"><span>累计限购校验</span><span style="color:var(--green)">符合</span></div></article>
      <label class="check-line"><input type="checkbox" checked />我已确认商品与收货信息。本次接龙不代表已付款，平台不担保成交或履约。</label>
      <div class="sticky-actions" style="margin:0 -16px -16px"><div class="total-line"><span>预计金额</span><strong>${money(cartTotal())}</strong></div><button class="primary-button wide" data-action="submit-order">确认提交</button></div>
    </div>`;
}

function renderOrders() {
  return `
    <div class="page">
      <section class="page-pad">
        <div class="section-head" style="margin-top:4px"><h3>周末产地水果接龙</h3><span class="tag">进行中</span></div>
        <div class="notice green" style="margin:0 0 12px">同一活动可以有多张接龙单，每张订单可选择不同收货人。</div>
        ${state.orders.map((order) => `<article class="card order-card">
          <div class="order-head"><div><h4>接龙单 ${order.id}</h4><span class="meta">${order.time} · 收货人 ${order.recipient}</span></div><span class="tag ${order.status === "已取消" ? "gray" : ""}">${order.status}</span></div>
          <div class="order-items">${order.items}</div>
          <div class="order-foot"><span>预计金额 <strong>${money(order.total)}</strong></span>${order.status === "有效" ? '<span><button class="mini-button" data-action="toast" data-message="已进入单独修改流程">修改</button> <button class="mini-button" data-action="cancel-order" data-id="'+order.id+'">取消</button></span>' : '<span>原记录保留</span>'}</div>
        </article>`).join("")}
        <button class="primary-button wide" data-action="new-order">再下一单</button>
      </section>
      ${bottomNav("orders")}
    </div>`;
}

function renderLeader() {
  return `
    <div class="page">
      <section class="leader-hero"><span class="tag ${state.activityStatus === "审核中" ? "orange" : ""}">${state.activityStatus}</span><h2>周末产地水果接龙</h2><p>${state.activityStatus === "审核中" ? "已提交审核 · 通过后可公开和分享" : "明天 20:00 截止 · 最近更新 10:36"}</p></section>
      <section class="leader-stats"><div class="stat-card"><span>有效订单数</span><strong>23</strong></div><div class="stat-card"><span>有效总份数</span><strong>41</strong></div><div class="stat-card"><span>预计金额</span><strong>¥1,286</strong></div></section>
      <section class="page-pad" style="padding-top:0">
        <div class="section-head"><h3>活动管理</h3></div>
        <div class="manage-grid">
          <button class="manage-button" data-action="toast" data-message="已打开参与者明细"><i>人</i>参与明细</button>
          <button class="manage-button" data-action="leader-products"><i>货</i>商品管理</button>
          <button class="manage-button" data-action="leader-action" data-kind="close"><i>止</i>提前截止</button>
          <button class="manage-button" data-action="leader-action" data-kind="cancel"><i>撤</i>取消活动</button>
          <button class="manage-button" data-action="toast" data-message="活动截止后可生成并下载 Excel"><i>表</i>接龙清单</button>
          <button class="manage-button" data-action="toast" data-message="${state.activityStatus === "审核中" ? "活动审核通过后才能分享" : "分享入口已准备"}"><i>享</i>${state.activityStatus === "审核中" ? "暂不可分享" : "继续分享"}</button>
        </div>
        <div class="section-head"><h3>商品汇总</h3><button data-action="toast" data-message="数据截至今天 10:36">数据说明</button></div>
        <div class="table-list">
          <div class="table-row"><div><strong>红心猕猴桃</strong><small>有效订单 15 张</small></div><strong>26 箱</strong></div>
          <div class="table-row"><div><strong>现摘甜玉米</strong><small>有效订单 9 张</small></div><strong>15 份</strong></div>
          <div class="table-row"><div><strong>农家散养鸡蛋</strong><small>已停售 · 历史记录保留</small></div><strong>0 盒</strong></div>
        </div>
      </section>
      ${bottomNav("leader")}
      ${renderModal()}
    </div>`;
}

function renderModal() {
  if (!state.showModal) return "";
  if (state.showModal === "products") {
    return `<div class="modal-backdrop"><section class="sheet"><div class="sheet-handle"></div><h3>商品管理</h3><p>已产生成功订单的商品仍可改价但不能删除。活动进行中可新增、停售或恢复商品；停售商品已有订单仍可减少、移除或取消。</p><div class="table-list">
      ${state.products.map((p) => `<div class="table-row"><div><strong>${p.name}</strong><small>${p.stopped ? "已停售" : "售卖中"} · ${money(p.price)}</small></div><button class="mini-button" data-action="toggle-product" data-id="${p.id}">${p.stopped ? "恢复" : "停售"}</button></div>`).join("")}</div><div class="button-row"><button class="ghost-button" data-action="close-modal">完成</button><button class="primary-button" data-action="navigate" data-screen="product">新增商品</button></div></section></div>`;
  }
  const cancel = state.showModal === "cancel";
  return `<div class="modal-backdrop"><section class="sheet"><div class="sheet-handle"></div><span class="tag ${cancel ? "red" : "orange"}">${cancel ? "不可恢复" : "状态确认"}</span><h3>${cancel ? "确认取消整个活动？" : "确认提前截止？"}</h3><p>${cancel ? "已有接龙记录将转为历史，只读保留且不进入有效履约清单。进行中活动需要填写取消原因。" : "截止后参与者不能新建、修改或取消接龙，团长可以查看并生成清单。"}</p>${cancel ? '<div class="field"><label>取消原因</label><input value="供货计划发生变化" /></div>' : ""}<div class="button-row"><button class="ghost-button" data-action="close-modal">返回</button><button class="${cancel ? "danger-button" : "primary-button"}" data-action="confirm-leader-action" data-kind="${state.showModal}">确认${cancel ? "取消" : "截止"}</button></div></section></div>`;
}

const renderers = { home: renderHome, login: renderLogin, create: renderCreate, product: renderProduct, preview: renderPreview, activity: renderActivity, address: renderAddress, confirm: renderConfirm, orders: renderOrders, leader: renderLeader };

function render() {
  const [title, description, header] = screens[state.screen];
  stageTitle.textContent = title;
  stageDescription.textContent = description;
  miniTitle.textContent = header;
  backButton.classList.toggle("hidden", state.screen === "home");
  document.querySelectorAll("[data-screen]").forEach((button) => button.classList.toggle("active", button.dataset.screen === state.screen));
  app.innerHTML = renderers[state.screen]();
  app.scrollTop = 0;
  window.location.hash = state.screen;
}

function handleAction(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;

  if (action === "navigate") navigate(actionTarget.dataset.screen);
  if (action === "toast") showToast(actionTarget.dataset.message);
  if (action === "protected") state.loggedIn ? navigate(actionTarget.dataset.target) : navigate("login");
  if (action === "login") { state.loggedIn = true; showToast("登录成功，继续刚才的操作"); window.setTimeout(() => navigate(state.history.pop() || "activity", false), 500); }
  if (action === "save-product") { showToast("商品已保存"); window.setTimeout(() => navigate("create"), 450); }
  if (action === "publish") { state.activityStatus = "审核中"; showToast("已提交审核，通过后才能公开和分享"); window.setTimeout(() => navigate("leader"), 650); }
  if (action === "quantity") {
    const id = Number(actionTarget.dataset.id); const delta = Number(actionTarget.dataset.delta); const product = state.products.find((item) => item.id === id);
    const next = Math.max(0, (state.cart[id] || 0) + delta);
    if (product.limit > 0 && next > product.limit) return showToast(`每人最多可接 ${product.limit} ${product.unit}`);
    if (product.stock > 0 && next > product.stock) return showToast("库存刚刚发生变化，请调整数量");
    state.cart[id] = next; render();
  }
  if (action === "checkout") {
    if (!cartCount()) return showToast("请至少选择一件商品");
    state.loggedIn ? navigate("confirm") : navigate("login");
  }
  if (action === "select-address") { state.selectedAddress = Number(actionTarget.dataset.id); render(); }
  if (action === "edit-address") { event.stopPropagation(); showToast("已进入收货信息编辑"); }
  if (action === "add-address") showToast("已打开新增收货信息表单");
  if (action === "use-address") navigate("confirm");
  if (action === "submit-order") {
    if (!cartCount()) return showToast("商品选择为空，请返回活动重新选择");
    const order = { id: `JL${String(Date.now()).slice(-6)}`, status: "有效", recipient: currentAddress().name, items: selectedItems().map((p) => `${p.name} × ${state.cart[p.id]}`).join("、"), total: cartTotal(), time: "刚刚" };
    state.orders.unshift(order); showToast("接龙提交成功"); window.setTimeout(() => navigate("orders"), 650);
  }
  if (action === "new-order") { state.cart = { 1: 0, 2: 0, 3: 0 }; navigate("activity"); showToast("已创建新的下单意图"); }
  if (action === "cancel-order") { const order = state.orders.find((item) => item.id === actionTarget.dataset.id); if (order) order.status = "已取消"; render(); showToast("该接龙单已取消，原记录保留"); }
  if (action === "toggle-switch") actionTarget.classList.toggle("on");
  if (action === "leader-products") { state.showModal = "products"; render(); }
  if (action === "toggle-product") { const product = state.products.find((item) => item.id === Number(actionTarget.dataset.id)); product.stopped = !product.stopped; render(); showToast(product.stopped ? "商品已停售，已有记录保留" : "已按原规则恢复售卖"); }
  if (action === "leader-action") { state.showModal = actionTarget.dataset.kind; render(); }
  if (action === "close-modal") { state.showModal = null; render(); }
  if (action === "confirm-leader-action") { const isCancel = actionTarget.dataset.kind === "cancel"; state.showModal = null; render(); showToast(isCancel ? "活动已取消且不可恢复" : "活动已提前截止"); }
}

app.addEventListener("click", handleAction);
document.querySelector(".prototype-panel").addEventListener("click", (event) => {
  const button = event.target.closest("[data-screen]");
  if (button) navigate(button.dataset.screen);
});
backButton.addEventListener("click", () => navigate(state.history.pop() || "home", false));
document.querySelector("#resetButton").addEventListener("click", () => { state = initialState(); render(); showToast("演示数据已重置"); });

const initialScreen = window.location.hash.slice(1);
if (screens[initialScreen]) state.screen = initialScreen;
render();
