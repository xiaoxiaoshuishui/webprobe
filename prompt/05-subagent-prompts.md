# 05 · 委派给子代理的完整提示词

为了不把整个上下文消耗在样板代码上，有两块**自包含、接口已冻结**的工作被并行委派。
下面是发给子代理的**提示词原文**（未删改）。

之所以能安全并行：两者的接口在委派之前就已经确定并写进提示词——
`target.json` 的字段定义、以及看板要消费的 6 个 JSON 接口的路径与响应结构。
因此不需要来回对齐，也不会产生集成冲突。

---

## 5.1 委派一：自检样例（能力验证 + 误报对照组）

> **任务**：在 `code/samples/` 下创建**自检夹具 Web 应用**。
> 这些是故意带有缺陷的本地 Web 应用，用来验证平台各检测器是否有效。
> 必须是**纯静态文件**（HTML/CSS/JS，无构建步骤、无外部 CDN、无网络），
> 以便内置的极简静态服务器可以直接托管。
>
> ### 1. `code/samples/buggy-shop/` —— 小型"商城"应用，多页面
> 文件：`index.html`、`product.html`、`cart.html`、`assets/app.css`、`assets/app.js`、
> `assets/analytics.js`，外加 `target.json` 与 `README.md`。
> 必须包含以下缺陷，且每个都能被普通的用户交互触发（这样自动化爬虫/模糊器才能命中）：
>
> 1. **js-exception** —— 在 `index.html` 点击 `#btn-buy-now` 抛出未捕获的 `TypeError`
>    （例如读取 `null` 的属性），**不能**包 try/catch，必须能到达 `window.onerror`。
> 2. **unhandled-rejection** —— 在 `product.html` 点击 `#btn-add-cart`
>    启动一条没有 `.catch` 的 promise 链，产生 `unhandledrejection` 事件。
> 3. **console-error** —— 在 `cart.html` 点击 `#btn-checkout` 调用
>    `console.error('订单提交失败: ...')`，并在某个分支调用 `console.warn(...)`。
> 4. **http-error** —— `assets/app.js` 在加载时发起 `fetch('/api/orders')`
>    和 `XMLHttpRequest` 到 `/api/stock`；这些端点不存在，静态服务器会返回 **404**。
>    必须让 404 被**观测为网络响应**，而不是被吞掉。
> 5. **resource-error** —— 一个 `<img src="/assets/missing-banner.png">`
>    以及缺失的样式表或字体（都会 404）。
> 6. **dom-anomaly / 模板泄漏** —— 在某处把字面量文本 `{{userName}}` 和 `undefined`
>    渲染到可见元素里（例如一个徽标）；并让 `#hero-banner` 在 `index.html` 中**缺失**，
>    以便声明的选择器断言失败。
> 7. **unresponsive（有界）** —— `cart.html` 上的 `#btn-compute` 运行一个
>    **约 2.5 秒的阻塞忙循环**（`while (Date.now() - t0 < 2500)`），
>    让主线程真正停顿，但**必须自行终止**。绝不能写真正的死循环。
> 8. **security** —— 最好用一个 `<meta>` CSP 拦截页面内的某个内联脚本；
>    若离线难以保持可用，则改为把伪造凭据打到控制台
>    （如 `console.warn('token=', 'eyJhbGciOi...')`），让敏感信息规则能触发。
>
> 每个缺陷都要在源码里留清晰的注释（如 `<!-- BUG #1 js-exception: ... -->`），
> 并在 `README.md` 中用表格列出：缺陷编号 → 类型 → 触发方式。
>
> ### 2. `code/samples/clean-site/` —— **完全无缺陷**的小站点（4–5 页）
> 目的：证明平台**不会产生误报**。没有控制台错误、没有异常、没有 404、
> 没有缺失资源、没有模板泄漏，所有循环都可终止。含自己的 `target.json` 与 `README.md`。
> 保持简单（一个带导航、表单校验正确、以及对随站点一起发布的真实 JSON 文件发起
> 健康 `fetch` 的文档/营销站点）。
>
> ### `target.json` 清单格式（必须严格遵守——平台会解析它）
> ```json
> {
>   "id": "buggy-shop",
>   "name": "Buggy Shop 演示商城",
>   "kind": "local",
>   "dir": ".",
>   "entry": "/index.html",
>   "viewport": { "width": 1440, "height": 900 },
>   "locale": "zh-CN",
>   "timezoneId": "Asia/Shanghai",
>   "budget": { "maxPages": 12, "maxActionsPerPage": 60, "maxDurationMs": 240000, "actionTimeoutMs": 4000 },
>   "explore": { "allowCrossOrigin": false, "urlPatterns": ["**/*"], "denyUrlPatterns": [] },
>   "fuzz": {
>     "enabled": true, "rounds": 40, "seed": 20261016,
>     "dom": { "click": true, "type": true, "select": true, "scroll": true, "hover": true, "submit": true, "keyboard": true },
>     "selectors": ["#btn-buy-now", "#btn-add-cart", "#btn-checkout", "#btn-compute"]
>   },
>   "assertions": [
>     { "id": "hero-visible", "kind": "selector", "selector": "#hero-banner", "urlPattern": "**/index.html", "severity": "high", "title": "首页主视觉 #hero-banner 缺失" }
>   ],
>   "watch": { "console": true, "pageerror": true, "requestfailed": true, "httpErrorStatus": 400, "ignorePatterns": [] },
>   "auth": { "type": "none" }
> }
> ```
>
> ### 要求
> - 所有内部链接必须是**相对路径或根绝对路径**，且除上面列出的故意缺失资源外都必须能解析。
> - 不引用任何外部网络资源（不要有 `https://` 资源地址）。
> - 写完后**自查**：用读取工具重新读每个文件，确认缺陷标记存在、且引用的路径都存在。
>
> 汇报：创建的文件清单，以及"每个植入缺陷 → 文件 + 选择器/触发方式"的对照表。

**子代理的交付摘要**（要点）：22 个文件；`buggy-shop` 植入 9 类缺陷
（其中 `resource-error` 有 6 个变体、`dom-anomaly` 3 个、`security` 2 个，
共 13 处标记）；`clean-site` 5 页零缺陷。
自查手段包括：用 `new Function` 解析每个 `.js` 与内联 `<script>`、
独立计算两个内联脚本的 SHA-256 验证 CSP 只拦截其中一个、
以及从 HTML/CSS/JS 中提取所有根绝对路径并与磁盘比对。

---

## 5.2 委派二：结果看板 UI

> **交付物**：在 `code/ui/` 下构建一个**零依赖静态看板**
> （纯 HTML + CSS + 原生 JS，无构建步骤、无 CDN、无框架）：
> `index.html`、`styles.css`、`app.js`、`README.md`。不要创建其他资源。
> 三个文件总计控制在约 1100 行以内。
>
> **它如何被托管**：一个 Node HTTP 服务器（另行编写，不要创建）
> 把 `code/ui/` 挂在 `/`，并暴露以下 JSON API：
>
> | 方法与路径 | 响应 |
> | --- | --- |
> | `GET /api/runs` | `[{ runId, targetId, targetName, startedAt, finishedAt, durationMs, stats }]`，最新在前 |
> | `GET /api/runs/:runId` | 完整 **RunReport** |
> | `GET /api/runs/:runId/artifacts/<relpath>` | 原始证据文件（png/html/txt/json/log/mp4） |
> | `GET /api/targets` | `[{ id, name, kind, dir, url }]` |
> | `POST /api/run` body `{"targetId":"..."}` | `{ ok: true, runId }` —— 启动新一轮测试 |
> | `GET /api/health` | `{ ok: true, platform, version }` |
>
> 注意证据 URL 规则：finding 的 `evidence.screenshots` / `domSnapshot` / `video`
> 等条目，都是**相对于该次运行的 artifacts 目录**的路径（例如 `findings/F-0001/shot-1.png`）。
> 拼成 `/api/runs/{runId}/artifacts/{该相对路径}`（逐段 URL 编码）。
>
> **RunReport / Finding 的结构**：（提示词中给出了完整字段定义，与
> `code/src/core/schema.mjs` 一致，此处从略）
>
> **要求实现的界面功能**（9 项，完整列表见原始提示词）：
> 1. 顶栏：目标选择器、`▶ 开始测试`（POST 后每 2 秒轮询直到新运行出现 `finishedAt`）、运行历史选择器；
> 2. 概览卡片：总数 + 各严重级 + 页面/动作/请求/控制台计数；
> 3. **手写图表**（内联 SVG 或 CSS 条，不许用图表库）：严重级分布、类型分布、耗时；
> 4. 缺陷表格：可点击排序、文本 + 严重级 + 类型筛选且可组合；
> 5. 缺陷详情面板：消息、堆栈、复现步骤、可复制的复现脚本、上下文、证据缩略图与灯箱；
> 6. 覆盖范围与时间线（默认折叠）；
> 7. 导出：下载 JSON、复制 Markdown 摘要；
> 8. **健壮性**：`/api/runs` 为空或 404 时给出友好空状态；fetch 失败绝不能白屏；
>    **所有插值必须转义**——缺陷标题和堆栈来自被测网站，是不可信输入；
> 9. 可访问性与观感：Escape 关闭、`aria-label`、可见焦点、900px 以下响应式、深色专业主题。
>
> 写完后**自查**：语法检查、确认 `app.js` 引用的每个 id 都在 `index.html` 里存在、
> 确认每个 API 路径与上表一致。

**子代理的交付摘要**（要点）：1116 行 / 4 个文件；43/43 个 id 全部对应；
并用一个临时的 Node DOM 桩跑通了 `app.js` 的 **44 项断言**（渲染、排序、
筛选组合、抽屉、灯箱、Escape、Markdown 导出、POST→轮询→刷新历史）。
自查中**发现并修复了一个真实 bug**：`.drawer` / `.lightbox` 上的
`display:flex` 会让 `hidden` 属性失效，已用 `[hidden]{display:none!important}` 修掉。
