# buggy-shop — Buggy Shop 演示商城（WebProbe 自检夹具）

一个**纯静态**、故意植入缺陷的多页面小商城，用来验证 WebProbe 各类检测器能否
真的抓到 bug。没有构建步骤、没有 npm 依赖、没有任何外部网络引用
（不存在 `https://` 资源），只需一个最简静态文件服务器 serve 本目录即可。

- 入口：`/index.html`
- 页面数：3（`index.html`、`product.html`、`cart.html`）
- 清单：`target.json`
- 语言：简体中文（`zh-CN`，时区 `Asia/Shanghai`）

```bash
# 任意静态服务器都可以，例如（仅示例，平台自带服务器即可直接用 target.json）
python -m http.server 8080 --directory code/samples/buggy-shop
```

---

## 1. 缺陷总表（bug id → 类型 → 触发方式）

| # | 类型 (finding kind) | 文件 | 选择器 / 触发方式 | 预期可观测信号 |
|---|---------------------|------|-------------------|----------------|
| 1 | `js-exception` | `assets/app.js`（`renderOrderConfirm` / `onBuyNow`），触发点 `index.html` | 点击 **`#btn-buy-now`** | `window.onerror` / `pageerror`：`TypeError: Cannot read properties of null (reading 'delivery')`，调用链无任何 `try/catch` |
| 2 | `unhandled-rejection` | `assets/app.js`（`addToCartRequest` / `onAddToCart`），触发点 `product.html` | 点击 **`#btn-add-cart`** | `unhandledrejection`：`ADD_TO_CART_FAILED: 库存服务不可用（sku=SKU-K87-BLK, qty=1）`，链上没有 `.catch()` |
| 3 | `console-error` (+`console-warning`) | `assets/app.js`（`onSubmitOrder`），触发点 `cart.html` | 点击 **`#btn-checkout`** | `console.error('订单提交失败: 订单网关超时 …')`，同一分支还有一条 `console.warn('订单提交失败: 正在降级为离线草稿模式…')` |
| 4 | `http-error` ×2 | `assets/app.js`（`apiFetchOrders` / `apiXhrStock`），触发点 `cart.html` | 点击 **`#btn-checkout`**（同一处理函数内先打日志再发请求） | `GET /api/orders` → **404**（`fetch`，`res.ok === false`）；`GET /api/stock` → **404**（`XMLHttpRequest`，`xhr.status === 404`）。两者都把状态码写回 `#api-status`，**不吞掉**失败状态 |
| 5a | `resource-error` | `assets/app.css` `@font-face` | 页面加载即触发（三页共用样式表） | `GET /assets/fonts/legacy-shop.woff2` → **404** |
| 5b | `resource-error` | `assets/app.css` `@import` | 页面加载即触发 | `GET /assets/print-theme.css` → **404** |
| 5c | `resource-error` | `index.html` | `<img id="banner-img" src="/assets/missing-banner.png">` | `GET /assets/missing-banner.png` → **404** |
| 5d | `resource-error` | `product.html` | `<link rel="stylesheet" href="/assets/theme-dark.css">` | `GET /assets/theme-dark.css` → **404** |
| 5e | `resource-error` | `product.html` | `<img id="product-thumb" src="/assets/products/k87.png">` | `GET /assets/products/k87.png` → **404** |
| 5f | `resource-error` | `cart.html` | `<img id="coupon-icon" src="/assets/icons/coupon.svg">` | `GET /assets/icons/coupon.svg` → **404** |
| 6a | `dom-anomaly`（模板变量透出） | `index.html` | 可见徽章 **`#user-badge`** 文案 `欢迎回来，{{userName}}，您的等级：undefined` | DOM 中出现字面量 `{{userName}}` 与 `undefined` |
| 6b | `dom-anomaly`（模板变量透出） | `product.html` | 可见徽章 **`#sku-badge`** 文案 `SKU：{{product.sku}} ｜ 库存：undefined` | 同上（跨页面聚合验证） |
| 6c | `assertion`（选择器缺失） | `index.html` | 断言 `hero-visible`：`#hero-banner` | 元素**根本不存在**（不是隐藏），断言必然失败 |
| 7 | `unresponsive`（有界） | `assets/app.js`（`blockingBusyLoop`），触发点 `cart.html` | 点击 **`#btn-compute`** | 主线程真实阻塞约 **2500 ms**（`while (Date.now() - t0 < 2500)`），随后**必然自行结束**并写回 `#compute-result`；不存在任何无限循环 |
| 8a | `security`（CSP 违规） | `index.html` | `<meta http-equiv="Content-Security-Policy">` + 文件末尾的内联 `<script>` | `securitypolicyviolation` 事件 + 控制台 `Refused to execute inline script …`；`window.__legacyTracker` 始终为 `undefined` |
| 8b | `security`（敏感信息泄露到控制台） | `assets/app.js`（`onSubmitOrder`），触发点 `cart.html` | 点击 **`#btn-checkout`** | `console.warn('token=', 'eyJhbGciOi…')` 与 `console.warn('DEBUG apiKey=sk_live_…')` |

> 说明：**BUG #6 拆成 6a/6b/6c**（两个模板透出点 + 一条选择器断言），
> **BUG #5 拆成 5a–5f**（同一 kind、多个不同的失败资源载体），
> **BUG #8 拆成 8a/8b**（CSP 违规 + 控制台敏感信息）。
> 源码里每个缺陷附近都有 `<!-- BUG #n … -->` 或 `// BUG #n …` 注释。

---

## 2. 页面 ↔ 触发点 速查

| 页面 | 可达缺陷 | 主要控件 |
|------|----------|----------|
| `index.html` | #1、#5b、#5c、#6a、#6c、#8a | `#btn-buy-now`、`#user-badge`、`#order-confirm`、`#page-boot` |
| `product.html` | #2、#5a、#5b、#5d、#5e、#6b | `#btn-add-cart`、`#qty`（`select`）、`#cart-hint`、`#sku-badge` |
| `cart.html` | #3、#4、#5a、#5b、#5f、#7、#8b | `#btn-checkout`、`#btn-compute`、`#qty-label`、`#line-total`、`#cart-total`、`#api-status`、`#compute-result` |

### 抓取/模糊测试要点

- 所有缺陷都**由普通用户交互可达**：三次点击（`#btn-buy-now` → `#btn-add-cart` → `#btn-checkout`）
  覆盖 #1–#4 与 #8b，一次 `#btn-compute` 覆盖 #7，其余在页面加载时自动出现。
- 刻意**不做**页面加载时自动请求接口：`/api/orders` 与 `/api/stock` 只在点击
  `#btn-checkout` 时触发，这样"某个动作导致接口 404"的归因是干净的。
- `#btn-compute` 只阻塞 **2.5s**（`actionTimeoutMs` 为 4000ms）：
  只要检测器的无响应阈值 ≤ 2.5s 就能命中，同时不会把标签页拖死。
- 导航互链完全闭合，`urlPatterns: ["**/*"]` 下三次爬取即可覆盖全部 3 个页面。

---

## 3. 目录结构

```
code/samples/buggy-shop/
├── target.json              # WebProbe 目标清单（见下）
├── README.md                # 本文件
├── index.html               # 首页：BUG #1 / #5c / #6a / #6c / #8a
├── product.html             # 商品详情：BUG #2 / #5d / #5e / #6b
├── cart.html                # 购物车：BUG #3 / #4 / #5f / #7 / #8b
└── assets/
    ├── app.css              # 共用样式；BUG #5a（字体）、#5b（@import）
    ├── app.js               # 主脚本；BUG #1 #2 #3 #4 #7 #8b
    └── analytics.js         # 埋点脚本：无缺陷（对照组，证明干净脚本不会被误报）
```

**故意不存在的路径**（静态服务器会返回 404，这是夹具的一部分，请勿补齐）：

- `/api/orders`、`/api/stock`（接口）
- `/assets/missing-banner.png`、`/assets/products/k87.png`、`/assets/icons/coupon.svg`（图片）
- `/assets/theme-dark.css`、`/assets/print-theme.css`（样式表）
- `/assets/fonts/legacy-shop.woff2`（字体）
- `/favicon.ico`（浏览器自动请求）

---

## 4. `target.json` 关键字段

| 字段 | 值 | 说明 |
|------|----|------|
| `kind` | `local` | 纯静态目录，平台用自带静态服务器 serve |
| `dir` | `.` | 相对清单文件所在目录 |
| `entry` | `/index.html` | 爬取起点 |
| `viewport` | `1440×900` | 桌面视口，保证横幅/图片真的被请求 |
| `fuzz.selectors` | `#btn-buy-now`、`#btn-add-cart`、`#btn-checkout`、`#btn-compute` | 4 个必点控件；即使启发式打分漏了它们，也会被强制交互 |
| `watch.pageerror` | `true` | 抓 BUG #1 |
| `watch.httpErrorStatus` | `400` | ≥400 记为 `http-error`，抓 BUG #4 / #5 |
| `watch.requestfailed` | `true` | 抓网络层失败的资源（BUG #5） |
| `assertions[0]` | `#hero-banner` on `**/index.html` | 抓 BUG #6c（必然失败） |
| `assertions[1]` | `#product-thumb` on `**/product.html` | 该选择器**存在**，用来确认断言不会无故失败 |
| `assertions[2]` | 文本 `{{userName}}` in `#user-badge` | 抓 BUG #6a 的模板透出 |
| `auth` | `{ "type": "none" }` | 无需登录 |

断言 `assertions[1]`、`assertions[3]`（`#btn-checkout` 选择器）**应当通过**：
它们和 `hero-visible` 一起构成"断言引擎既不能漏报也不能误报"的自检对。

---

## 5. 安全说明

本目录中的缺陷是**有意为之**，且被限制在夹具范围内：

- 假 JWT / 假 `sk_live_` 密钥是**写死的无效字符串**，不对应任何真实凭据。
- CSP 只作用于 `index.html`，目的是制造一条真实的
  `securitypolicyviolation`，不影响其他页面。
- 阻塞循环**有界**（2.5s 后自行退出），不存在 `while (true)` / `for (;;)`。
- 无外部网络请求；`connect-src 'self'` 下所有请求都指向本地静态服务器。

---

## 6. 开发期辅助文件（不属于夹具，可安全删除）

仓库里另有 `code/samples/_verify_refs.ps1` 与 `code/samples/_verify/`：
它们只是夹具作者的**离线自检脚本**（静态检查引用路径是否存在、脚本语法能否解析、
CSP 摘要是否对得上、断言选择器是否存在）。它们：

- 不会被静态服务器当成目标站点的一部分（以 `_` 开头，不属于任何 `target.json` 的目录）；
- 不需要也能运行夹具，删除后夹具行为不变；
- 不参与平台自身的构建或测试入口。

运行方式（可选，无第三方依赖）：

```bash
node code/samples/_verify/verify.mjs
```

