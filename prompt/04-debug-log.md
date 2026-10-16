# 04 · 调试记录

这是本文档最有价值的部分。下面每一条都是**真实发生过的失败**，包含现象、根因、修复。
平台里几乎每一条检测规则，都对应这里的一次误报或漏报。

标注含义：
- `[自检发现]` —— 被 `webprobe selftest` 的误报对照组（`clean-site`）抓出来
- `[实测发现]` —— 在虎牙直播实测中暴露
- `[环境发现]` —— 在环境侦察中暴露

---

## D-01 `[环境发现]` pnpm 生命周期脚本 `spawn EPERM`

**现象**：`pnpm install` 成功，但 `ffmpeg-static` 的 postinstall 被跳过；
手动 `node install.js` 报 `MODULE_NOT_FOUND`；`pnpm rebuild` 报：
```
Error: spawn EPERM
  at runPackageLifecycle (pnpm.mjs)
```

**根因**：`install.js` 依赖 `env-paths`、`progress` 等包，pnpm 的隔离式 `node_modules`
没有把它们提升到 `ffmpeg-static` 旁边，所以 require 失败。改用 `pnpm rebuild` 时，
pnpm **用管道 spawn 子进程**来跑生命周期脚本，而沙箱禁止管道 → EPERM。

**修复**：不再依赖包管理器的生命周期，写了 `code/scripts/fetch-ffmpeg.mjs`：
用 Node `fetch` 直接从镜像下载 `ffmpeg-win32-x64.gz`、gunzip、落盘。
它**同时也是项目的正式资产**——因为 pnpm ≥ 10 / npm `--ignore-scripts` 默认都会跳过
postinstall，用户遇到同样问题的概率很高。

**收获**：把"环境限制"变成了"对用户有价值的功能"。

---

## D-02 `[环境发现]` 浏览器根本起不来（详见 02 节）

`spawn EPERM` → 自研免管道 CDP 启动 → 仍然失败 → 定位到 Chromium Mojo IPC 依赖命名管道。

**修复**：把 CDP 方案保留为正式功能、`doctor` 给出明确诊断、需要真跑浏览器时申请提权。
**没有**做的事：没有为了"让命令跑起来"去改写成静态分析糊弄过去——那会让整个平台失去意义。

---

## D-03 正则字面量里的斜杠导致语法错误

**现象**：
```
SyntaxError: Invalid regular expression flags
const DANGEROUS_URL = /(logout|...|/pay|支付|/admin|...)/i;
                              ^
```

**根因**：正则字面量中 `/pay`、`/admin` 的 `/` 被解析为字面量结束符。

**修复**：转义为 `\/pay`、`\/admin`。
**暴露的流程问题**：改动后没有立刻跑 `node --check`，直到整轮测试才炸出来。
之后固定为"每次编辑后先语法检查全部源文件"。

---

## D-04 重构时删掉了 `SIGNAL_KIND` 定义，留下引用

**现象**：自检一开始就异常终止：
```
引擎异常：ReferenceError: SIGNAL_KIND is not defined
    at signalToFinding (detectors.mjs:70)
```
整轮只访问了 1 个页面、0 个动作、0 个缺陷——**完全静默地什么都没做**。

**根因**：为了加入"长任务分级上报"，重写了 `signalToFinding` 的开头，
把包含 `const SIGNAL_KIND = {...}` 的整段替换掉了，却漏掉了下面仍在使用的引用。

**修复**：补回定义。
**更有价值的收获**：这次失败**没有让自检直接报错退出**，而是产出了"0 缺陷、
1 个页面"的报告，看起来像是"页面很干净"。于是加了一条原则——
**引擎级异常必须写进报告**（`stats.aborted` / `stats.abortReason` / `timeline` 里的 `error` 事件），
否则"什么都没测"和"测了没发现问题"在报告上长得一样。

---

## D-05 弹窗处理器把自己的主页面关掉了（连续两版都没修对）

**现象**：每个页面的第一个动作之后，所有动作都报：
```
click #btn-add-cart => locator.click: Target page, context or browser has been closed
```
`actionErrors` 累计 80 条，`actionsExecuted` 只有 1。

**根因（第 1 版）**：为了让真实用户旅程（虎牙的搜索表单和多个导航链接都是
`target="_blank"`）不被丢掉，实现了弹窗审计：监听新标签页 → 挂监控 → 审计 → 关闭。
用的是 `browser.context.on('page', handler)`。
**但 `context.on('page')` 对自己 `context.newPage()` 创建的页面同样会触发。**
于是爬虫每次新建主页面，处理器都把它当成弹窗，审计一顿后**关掉**。

第 1 版修复：在 `openPage()` 里把 `currentPage = page` 提到 `newPage()` 之后立刻赋值，
让 `popup === currentPage` 的判断生效。

**仍然失败（第 2 版）**：`context.on('page')` 事件在 `newPage()` promise 解决之前
就可能派发，赋值时机依然存在竞态。于是加了第二道判断 `popup.opener()` 必须非空。

**最终修复（第 3 版）**：放弃 `context.on('page')`，改用
**`page.on('popup', handler)`** —— 这是 Playwright 专门为弹窗设计的事件，
**语义上就只会在"某个页面打开了新标签页"时触发**，天然排除自己创建的页面，无竞态。

**教训**：一个语义上就错误的 API 选择，靠加判断条件补不回来。应该换 API，不是加 guard。

---

## D-06 `[自检发现]` 每一个页面都被误报"主线程卡死"（最严重的一次误报）

**现象**：`clean-site`（已知无缺陷的对照组）5 个页面全部报：
```
● CRITICAL 页面主线程无响应（UI 冻结）
```
而且 buggy-shop 也一样，两个样例结果无法区分。

**根因**：主动探针的实现是"让页面跑一次 `requestAnimationFrame` 回调，看多久回来"。
**但 headless Chromium 在没有观察者时不做合成，`requestAnimationFrame` 根本不回调。**
于是一个完全健康的页面也永远等不到回调 → 判定为冻结。

**修复**：改用**求值往返本身**作为存活证据——Playwright 只有在渲染器主线程真正执行完
函数之后才能解析 `evaluate`，所以"这个调用超时了"就是"主线程被阻塞了"，
这在 headless 下同样成立。同时把 `requestAnimationFrame` 方案在代码注释里
明确标注为**不可用及原因**，防止以后有人"优化"回去。

**连带修复**：真正的"主线程冻结"改由页面内 `PerformanceObserver` 的 `longtask` 上报，
并按时长分级：
- `≥ 1000ms` → `unresponsive`（critical，用户看到的是界面卡死）
- `250–1000ms` → `performance`（low，可感知卡顿）
- `< 250ms` → 忽略

**教训**：误报对照组（`clean-site`）的价值在这里体现得淋漓尽致。
如果没有它，平台会带着"每个页面都卡死"这个致命误报到交付。

---

## D-07 断言 `urlPattern` 未加锚点，首页断言在所有页面上误报

**现象**：`live-list-rendered`（本应只在首页生效）在 `/g`、`/660101` 上也报失败：
```
[HIGH] 断言不通过：live-list-rendered   url: https://www.huya.com/g
```

**根因**：`new RegExp('https://www.huya.com/')` **没有锚点**，
而正则匹配是**子串匹配**——`https://www.huya.com/g` 同样命中。

**修复**：新增 `urlPatternMatches()` 并统一使用，做两件事：转义正则元字符 + 两端加 `^...$`；
同时把 glob 语义写清楚（`*` 不跨 `/`，`**` 跨）。加了单元验证：

```
https://www.huya.com/      https://www.huya.com/       true
https://www.huya.com/      https://www.huya.com/m      false   ← 修复前是 true
https://www.huya.com/      https://www.huya.com/g/1    false   ← 修复前是 true
```

---

## D-08 `[实测发现]` 同一个 404 被报成三条不同缺陷

**现象**：一个缺失的图片同时出现在三个类型下：
```
MEDIUM 接口/资源返回 HTTP 404：.../missing-banner.png      (http-error)
MEDIUM 资源加载失败：<img> .../missing-banner.png          (resource-error)
MEDIUM 图片加载失败：missing-banner.png                    (dom-anomaly)
```

**根因**：三层的观察各自成立——网络层看到了 404、资源层看到了加载失败、
DOM 层看到了 `naturalWidth === 0`——但它们描述的是**同一个缺陷**。

**修复**：DOM 审计发现的 `broken-image`，如果其 URL 已经出现在本次采集的
`failedRequests` 或 4xx/5xx 响应里，就不再单独上报（在 `auditPage` 里用
`networkFailed` 集合过滤）。保留层次更丰富的那一条。

---

## D-09 `[实测发现]` 浏览器自己的资源失败回显被当成独立缺陷（两条代码路径各有一处）

**现象**：同一个失败在报告里成对出现：
```
MEDIUM 资源加载失败：net::ERR_CONNECTION_REFUSED — xhr https://ql.njmapp.com:5284/
MEDIUM console.error：Failed to load resource: net::ERR_CONNECTION_REFUSED
```

**根因**：Chromium 会把每一个失败的子资源**同时**写进控制台（`Failed to load resource: ...`）。
平台已经从 `response`/`requestfailed` 精确记录了 URL、状态码、资源类型，
控制台这条只是**浏览器的转述**。

**修复**：新增 `isResourceLoadEcho()` 过滤。
**但第一版只修了 Playwright 的 `console` 事件路径，漏了 CDP `Log.entryAdded` 路径**——
报告里仍然成对出现。第二次才补上。这说明"同一语义的信号有多条采集通道"时，
过滤规则必须**在所有通道上都应用**。

---

## D-10 消息前缀被拼了两次

**现象**：
```
未处理的 Promise 拒绝：未处理的 Promise 拒绝：null
资源加载失败：资源加载失败：<link> http://.../theme-dark.css
```

**根因**：信号层（monitor）和标题层（detector 的 `buildTitle`）**都在加前缀**。

**修复**：确立规矩——**前缀只由 `buildTitle` 负责，信号层只提供原始事实**。
逐一清理了 `unhandled-rejection`、`resource-error`、`requestfailed` 三处。

---

## D-11 `[实测发现]` 混合内容被重复上报，且 36 次出现变成 36 条缺陷

**现象**：虎牙的 `wan.huya.com` 页面上，同一类问题产生了大量条目：
```
LOW    console.warn：Mixed Content: The page at 'https://wan.huya.com/...' was loaded over HTTPS...
MEDIUM 安全问题：Mixed Content: The page at 'https://wan.huya.com/...' was loaded over HTTPS...
```
（成对出现，且每个不安全资源各一条，单页最多 36 条）

**根因**（两个独立问题）：
1. 同一条控制台文本**同时**产生了 `console-warning` 和 `security` 两条信号 → 重复计数；
2. 签名基于完整消息文本，而消息里包含了**具体是哪个图片**不安全，
   于是一张图一条缺陷——但"页面以 HTTPS 加载了 HTTP 资源"**是一个缺陷，不是 36 个**。

**修复**：
1. 新增 `isSecurityWorthy()`；属于安全问题的行**只**产生安全信号，不再产生 warning 信号；
2. 新增 `summarizeMixedContent()`，把消息收敛为
   `混合内容：页面 <pageHost> 通过 HTTPS 加载了不安全的 HTTP 资源（来自 <insecureHost>）`，
   并保留一个具体例子；
3. `makeFinding` 增加 `dedupeKey` 参数，允许按"粗粒度语义"去重
   （安全类按 `subtype + pageHost + insecureHost`）；
4. 去重合并时把具体受害 URL 收进 `context.relatedUrls`（最多 12 条），
   **合并后依然可追踪到具体是哪些资源**。

**顺带修的误分类**：`document.domain mutation is ignored...` 被当作 MEDIUM 安全问题，
但它只是 Chrome 的弃用提示，不是漏洞 → 降级为 low 的控制台警告。

---

## D-12 `[实测发现]` 第三方组件的噪声淹没了被测站点自身的缺陷

**现象**：虎牙首轮实测 **100 条缺陷**，但按来源拆开看，绝大多数来自内嵌的第三方 SDK：

| 来源 | 数量 | 性质 |
| --- | --- | --- |
| `ql.njmapp.com:5283/5284` | 96 次 | 广告/推广 SDK，请求被浏览器因"访问 loopback 地址"而拦截 |
| `localhost.weixin.qq.com:14019` | 27 次 | 微信小游戏 SDK 探测本机端口 |
| `hm.baidu.com/hm.js` | 4 次 | 百度统计，域名解析失败 |

这些**不是虎牙前端团队的代码缺陷**。真正的第一方问题（混合内容、空容器、重复 id）
被埋在下面几乎看不见。

**修复**：引入**归属判定**（`partyOf` / `applyPartyPolicy`）：

- 用注册域（近似 eTLD+1，含 `com.cn`、`co.uk` 等多段后缀表）判断同源；
- 目标可在清单里用 `firstPartyDomains` **声明自己的其他域名**
  ——虎牙的静态资源在 `msstatic.com` 上，不声明就会被误判为第三方；
- 策略 `watch.thirdParty`：`tag`（默认，上报但降一级并打标签）/ `ignore`（不上报）/ `all`（全量）；
- 报告与看板都区分展示第一方 / 第三方，统计里给 `byParty`。

**效果**：虎牙实测从 100 条噪声降到 33 条，且**第一方问题浮到了列表顶部**。
`live-cover.msstatic.com` 的混合内容因为被声明为第一方，得以按 MEDIUM 正常上报。

---

## D-13 `[实测发现]` 播放器容器被误报"内容为空"

**现象**：
```
MEDIUM 关键容器内容为空：div#J_roomPlayerLayer
MEDIUM 关键容器内容为空：div#player-watermark
MEDIUM 关键容器内容为空：div#player-mouse-event-wrap
```

**根因**：空容器规则的 `KEY_RE` 里包含了 `player` 和 `video`，而**播放器图层、
水印层、鼠标事件层在没有开播时天然就是空的**。

**修复**：
- `KEY_RE` 收窄为**承诺"里面有一堆条目"的语义**（`app|root|main|content|container|list|feed|grid|results|items`）；
- 新增 `SKIP_RE` 排除 `player|video|water|overlay|mask|layer|ad|banner|modal|dialog|tooltip|popup|skeleton|loading|placeholder|toast|carousel|swiper|marquee|scroll`。

**教训**："容器为空"只有在该容器**名字承诺了内容**时才算缺陷。

---

## D-14 `[自检发现]` 关闭的 `<details>` 里的链接被误报"缺少可访问名称"

**现象**：`clean-site/faq.html` 报 `可交互元素缺少可访问名称（3 个元素）`。
但该页面所有链接都有文字。

**根因**：两个问题叠加：
1. `visible()` 用 `getBoundingClientRect()` 判断——**但当前 Chromium 中，
   `<details>` 内未展开的内容仍然会报告一个盒模型**，于是隐藏标记被当成可见；
2. 名称判定用 `el.innerText`，而**未渲染的元素 `innerText` 返回空字符串**，
   即便它明明有文字。

那 3 个元素正好是 3 个**关闭状态的 `<details>` 里各含的 1 个链接**。

**修复**：
1. 改用 `el.checkVisibility({ checkVisibilityCSS, contentVisibilityAuto, ... })`
   ——**这是专门为此设计的 API**，对关闭的 `<details>` 返回 false；
2. 名称判定加 `textContent` 兜底（有文字但未绘制的情况不再算缺失）；
3. **顺带提升可操作性**：把具体选择器写进消息
   （`例如：button.btn-search.clickstat | a.left-banner.clickstat | ...`），
   而不再只说"3 个元素"。

---

## D-15 `[实测发现]` 空 `id` 被报成重复 id

**现象**：`LOW 重复的元素 id：#`

**根因**：审计遍历 `[id]` 选择器时包含了 `id=""` 的元素，计数键为空字符串。

**修复**：跳过空 id，并加注释说明为什么。

---

## D-16 `[实测发现]` 弹窗绕过了 URL 策略，把测试拖到了直播间和第三方商城

**现象**：报告里出现 `/660101`（直播间）、`wan.huya.com`、`accshop.huya.com` 的缺陷；
时间预算被大量消耗在流媒体页面上。而清单里明确用 `urlPatterns` 白名单排除了它们。

**根因**：`allowedUrl()` 只作用于**爬虫**，**弹窗路径完全绕过了它**。
用户点一下直播间卡片弹出新标签页，平台就老老实实去审计了。

**修复**：把清单的 URL 策略**同样应用到弹窗**（`allowedUrl(u, 0, { forPopup: true })`），
被拒绝的弹窗记入 `coverage.skipped`（原因 `popup:not-matched` / `popup:cross-origin`），
并在报告里展示"已审计 1 个 / 按策略跳过 29 个"。

---

## D-17 弹窗计数自相矛盾

**现象**：`popups: { opened: 8, closed: 11 }` —— 关闭数大于打开数。

**根因**：`audited++` 发生在 URL 策略检查**之前**，导致同一个弹窗既算 audited 又算 skipped；
`closed` 还额外统计了"超出预算直接关掉"的那些。

**修复**：重构为 `{ seen, audited, skipped, closed }`，并且
**`audited++` 移到策略检查通过之后**，让 `audited + skipped === seen` 成为恒等式。

---

## D-18 `[实测发现]` 第三方 SDK 的控制台错误被算作被测站点的缺陷

**现象**：`MEDIUM console.error：Error: timeout at https://game.weixin.qq.com/...`
归属被判为第一方（因为控制台事件属于页面），于是没有走第三方降级。

**根因**：`console-error` 信号的 `url` 是**页面地址**，而真正出错的资源在消息/堆栈里。

**修复**：新增 `extractResourceUrl(text, stack)`，依次尝试
`Access to XMLHttpRequest/fetch at '...'`、`Refused to load/connect to '...'`、
`requested an insecure ... '...'`、`The page at '...'`，最后回退到堆栈里的第一个绝对 URL；
把它写进 `context.resourceUrl`。归属判定优先使用 `resourceUrl`，于是这类问题正确落到第三方。

---

## 调试投入分布

| 类别 | 条数 | 说明 |
| --- | --- | --- |
| 误报（把正常当缺陷） | 6 条（D-06、D-07、D-11、D-13、D-14、D-15） | 全部由自检对照组或实测发现 |
| 漏报/静默失败 | 2 条（D-04、D-05） | 最危险——报告看起来"很干净" |
| 重复上报 | 3 条（D-08、D-09、D-10） | 一个缺陷被算成多份 |
| 分类错误 | 3 条（D-12、D-16、D-18） | 归属/范围判断 |
| 环境与语法 | 3 条（D-01、D-02、D-03） | |

**最重要的一条结论**：一个测试平台最大的风险不是"漏掉 bug"，而是**误报**。
漏报只是少发现，误报会让使用者彻底不再相信报告。因此 `clean-site` 这个
"必须零检出"的对照组，是本项目里性价比最高的一块代码。
