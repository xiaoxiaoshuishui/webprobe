# clean-site — Clean Docs 站点（WebProbe 无缺陷对照组）

一个**纯静态**、**没有任何已知缺陷**的小型文档/营销站点，用来证明 WebProbe
**不会误报**。没有构建步骤、没有 npm 依赖、没有任何外部网络引用。

- 入口：`/index.html`
- 页面数：5（`index.html`、`guide.html`、`getting-started.html`、`faq.html`、`contact.html`）
- 清单：`target.json`
- 语言：简体中文（`zh-CN`，时区 `Asia/Shanghai`）

```bash
# 任意静态服务器都可以（平台自带服务器会按 target.json 直接 serve 本目录）
python -m http.server 8080 --directory code/samples/clean-site
```

---

## 1. "零缺陷"承诺与实现方式

| 缺陷类型 | 本站点的做法 | 验证点 |
|----------|--------------|--------|
| `js-exception` | 所有 DOM 访问先判空；`form.elements.namedItem` 结果全部做空值保护；没有解引用 `null` 的路径 | 反复点击/输入不产生 `pageerror` |
| `unhandled-rejection` | 唯一的异步链路 `loadStatus()` 在末尾一定有 `.catch()`；`navigator.clipboard.writeText()` 的 Promise 也带 `onRejected` 处理 | 点击 `#btn-refresh-status`、`[data-copy]` 不产生 `unhandledrejection` |
| `console-error` / `console-warning` | `assets/site.js` 完全不调用 `console.*` | 控制台在任何交互后保持为空 |
| `http-error` | 唯一的网络请求是 `fetch('/api/status.json')`，该路径**真实存在**（文件 `api/status.json`），静态服务器直接返回 **200**，不依赖任何重写/别名规则 | 网络面板无 4xx/5xx |
| `resource-error` | 每个发布文件都真实存在：`/assets/site.css`、`/assets/site.js`、`/assets/favicon.svg`、`/api/status.json`、`/data/status.json`；未引用任何缺失资源 | 无 `requestfailed` |
| `assertion` | `target.json` 里 4 条断言的选择器**全部存在** | 断言全部通过 |
| `dom-anomaly` | 页面文案全部是最终文本，没有 `{{...}}` 模板变量，也没有 `undefined` 字面量 | DOM 文本扫描干净 |
| `unresponsive` | 唯一的耗时逻辑是 200ms 有界的 `requestAnimationFrame` 进度条；不存在 `while` 阻塞循环 | 点击 `#btn-run-demo` 后主线程始终可响应 |
| `security` | 无 CSP 违规（未设 CSP，也不加载被拦截的脚本）；不打日志、不暴露 token；无外部域名、无混合内容 | 控制台与请求均干净 |

> 说明：`/api/status.json` 是**真实存在的静态文件**（`api/status.json`），
> 不是服务端别名；另有一份内容相同的 `data/status.json` 供对照。
> 两个 URL 都返回 HTTP 200，都不会 404。

---

## 2. 页面与交互点

| 页面 | 说明 | 可交互控件 |
|------|------|-----------|
| `index.html` | 首页：主视觉 + 服务状态面板 + 入口卡片 | `#btn-refresh-status`（健康检查 fetch） |
| `guide.html` | 使用指南：目录、配置表、Tab 切换、复制按钮 | `[data-tab]` ×2、`[data-copy="#sample-config"]`、`#btn-run-demo` |
| `getting-started.html` | 快速开始：4 步清单 + 示例命令 | `[data-copy="#quickstart-cmd"]`、`#btn-run-demo` |
| `faq.html` | 常见问题：6 条 `<details>` 折叠项 + 排查表 | 原生 `<details>` 折叠 |
| `contact.html` | 联系我们：带校验的表单 | `#btn-submit-contact`、`#btn-reset-contact`、`[data-copy="#support-signature"]` |

### 表单校验规则（`contact.html`）

| 字段 | 规则 | 空/非法时的表现 |
|------|------|-----------------|
| `#field-name` | 必填，≤40 字符 | `#field-name-error` 显示红字提示，`aria-invalid="true"` |
| `#field-email` | 必填，需匹配 `xx@yy.zz` | `#field-email-error` 显示提示 |
| `#field-topic` | 必选一项 | `#field-topic-error` 显示提示 |
| `#field-message` | ≥10 字符 | `#field-message-error` 显示当前字符数 |

校验通过后：`#form-status` 变为绿色成功文案，`#form-summary` 渲染成功说明与
`mailto:` 草稿链接，**不发起任何网络请求**。`#btn-reset-contact` 清空表单与所有提示。

---

## 3. 目录结构

```
code/samples/clean-site/
├── target.json              # WebProbe 目标清单（全部断言应通过）
├── README.md                # 本文件
├── index.html               # 首页（#hero-banner、#status-badge）
├── guide.html               # 使用指南
├── getting-started.html     # 快速开始
├── faq.html                 # 常见问题
├── contact.html             # 联系我们（含校验表单）
├── assets/
│   ├── site.css             # 全部样式（系统字体，无外部字体）
│   ├── site.js              # 全部脚本（无 console.*、无未处理拒绝、无长任务）
│   └── favicon.svg          # 本地图标（不请求 /favicon.ico）
├── api/
│   └── status.json          # 健康检查接口返回体（真实静态文件，HTTP 200）
└── data/
    └── status.json          # 同一份数据的对照副本
```

**刻意没有引用**：`/favicon.ico` 也未引用（每页都用 `<link rel="icon" href="/assets/favicon.svg">`），
因此浏览器不会自动产生任何 404。

---

## 4. `target.json` 关键字段

| 字段 | 值 | 说明 |
|------|----|------|
| `kind` | `local` | 纯静态目录 |
| `entry` | `/index.html` | 爬取起点 |
| `fuzz.selectors` | `#btn-refresh-status`、`#btn-submit-contact`、`#btn-reset-contact`、`#btn-run-demo` | 强制交互这些控件也无法触发缺陷 |
| `assertions` | `#hero-banner`(×2)、`#status-badge`、`#btn-submit-contact` | **全部存在**，应当 100% 通过 |
| `watch` | 全开（`httpErrorStatus: 400`） | 即便把所有监听都打开，也应当产出 **0 条** finding |
| `auth` | `{ "type": "none" }` | 无需登录 |

### 期望结果（自检基线）

对 `clean-site` 运行 WebProbe，期望报告：`findings: 0`、`failedRequests: 0`、
`consoleMessages: 0`、`pagesVisited: 5`（+ 别名资源请求）。
若出现任何 finding，说明检测器存在**误报**，这正是本目录要暴露的问题。

---

## 5. 与 `buggy-shop` 的配合

| | `buggy-shop` | `clean-site` |
|---|---|---|
| 目的 | 证明检测器**抓得到**每一类缺陷 | 证明检测器**不误报** |
| 期望 findings | 覆盖 `js-exception` / `unhandled-rejection` / `console-error` / `http-error` / `resource-error` / `dom-anomaly` / `assertion` / `unresponsive` / `security` | 0 条 |
| 断言 | 至少 1 条必然失败（`#hero-banner`） | 全部通过 |
| 缺失资源 | 8 个刻意的 404 路径 | 0 个 |

两个目录共用同一套 `target.json` 格式，可直接作为回归基线成对运行。

---

## 6. 开发期辅助文件（不属于夹具，可安全删除）

`code/samples/_verify/verify.mjs` 是夹具作者的离线自检脚本（无第三方依赖）：
它静态检查脚本语法、CSP 摘要、选择器与引用路径是否自洽。它不在
`clean-site/` 目录内，不会被静态服务器当成站点内容，删除后夹具行为不变。

```bash
node code/samples/_verify/verify.mjs
```

