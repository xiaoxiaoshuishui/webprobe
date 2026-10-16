# WebProbe · 浏览器端动态软件测试平台

> 针对**虎牙直播 Web 端**（`https://www.huya.com`）实现的软件测试平台。
> 输入是**待测软件所在的目录**，功能是**动态执行该软件并在崩溃/错误发生时捕获**，
> 输出是**在待测软件中找到的 bug**。

<p>
  <img alt="platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520.11-green">
  <img alt="deps" src="https://img.shields.io/badge/runtime%20deps-1-brightgreen">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-lightgrey">
</p>

---

## 目录

- [这是什么](#这是什么)
- [实测结果：虎牙直播](#实测结果虎牙直播)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [它是怎么工作的](#它是怎么工作的)
- [它能发现哪些缺陷](#它能发现哪些缺陷)
- [报告与看板](#报告与看板)
- [被测目标的清单格式](#被测目标的清单格式)
- [如何测试你自己的软件](#如何测试你自己的软件)
- [自检：能力验证与误报控制](#自检能力验证与误报控制)
- [已知限制](#已知限制)
- [使用须知](#使用须知)

---

## 这是什么

**WebProbe 是一个面向浏览器端软件的动态测试平台。** 它不做静态代码扫描——
它真的把软件跑起来：启动一个真实 Chromium，像用户一样导航、点击、输入、提交、滚动、悬停，
并在每一步都监听浏览器的四大类异常信号，最后把观察到的缺陷整理成带证据、可复现的报告。

它被设计成能同时应付两种完全不同的被测对象：

| 被测对象 | 由清单中的 `kind` 决定 | 平台做的事 |
| --- | --- | --- |
| **本地 Web 应用**（一堆 HTML/CSS/JS） | `local` | 启一个极简静态服务器托管那个目录，再用浏览器访问它 |
| **线上网站**（生产环境） | `remote` | 直接用浏览器访问，受清单中的 URL 白名单/黑名单与时间预算约束 |

本仓库随附的旗舰目标就是**虎牙直播 Web 端**，另外还有两个用于验证平台自身的内置样例。

### 与需求文档的对应关系

| 需求 | 落地 |
| --- | --- |
| 输入 = **待测软件所在的目录** | `code/targets/<id>/target.json` 描述一个目标；`--target` 接受**目录**、目标 id 或 URL |
| 功能 = **动态执行**该软件 | 真实 Chromium + 爬取 + 声明式流程 + DOM/JS 模糊测试 |
| 功能 = 在**崩溃错误发生时捕获** | 4 类信号源并行监听，见[它是怎么工作的](#它是怎么工作的) |
| 输出 = 找到的 **bug** | `report.json` / `report.md` / `report.html`，每个缺陷带截图、DOM 快照、控制台日志、网络记录、复现步骤与可执行复现脚本 |
| 开源到 GitHub | 本仓库（MIT）；`git remote add origin <你的仓库> && git push -u origin main` |
| 目录结构：`readme.md` / `code` / `video` / `prompt` | 见[项目结构](#项目结构) |

---

## 实测结果：虎牙直播

一次真实运行（`runs/run-20261016-155046-huya-live/`）：

```
时长 5分23秒 · 访问页面 7 · 执行动作 88 · 网络请求 4000（失败 104） · 新标签页 30（审计 1，按策略跳过 29）
发现缺陷 25 个（严重 0 · 高 0 · 中 3 · 低 22）
其中第一方（虎牙自身）16 个 · 第三方（内嵌广告/统计/微信小游戏 SDK）9 个
```

被访问页面：首页、`/l` 全部直播、`/g` 游戏分类、`/m` 手游站、`/g_ol`、`/g_pc`、`/g_yl`。

> 线上内容与第三方请求实时变化，**每次运行的缺陷集合不会完全一致**。
> 早期几轮运行还捕获到过一个高危缺陷：`/l` 页面抛出**未处理的 Promise 拒绝且原因为 `null`**
> （异步链路完全静默失败）。种子 `20261016` 保证的是**平台自身执行序列**的可复现。

### 找到的代表性缺陷

| 严重级 | 类型 | 说明 | 位置 |
| --- | --- | --- | --- |
| 🟨 中 | 混合内容 | HTTPS 页面加载了 `http://live-cover.msstatic.com/...` 的不安全图片，浏览器会拦截或降级 | `/g/100032` |
| 🟨 中 | 资源加载失败 | 存在 `<img src="">`，**空 src 被解析为当前页面地址**，导致对页面本身发起无效请求 | 首页 |
| 🟨 中 | DOM 异常 | 关键容器 `ul#wrap-recomGame`（685×320）已渲染却既无文本也无媒体元素，疑似推荐列表渲染失败 | 首页 |
| 🟦 低 | DOM 异常 | `id="live-0"` 在同一份文档中**重复出现 12 次**，会让 `label`/`aria` 关联与选择器行为不确定 | 首页 |
| 🟦 低 | 可访问性 | 顶部搜索按钮 `button.btn-search.clickstat`、左右广告位 `a.left-banner`/`a.right-banner` 等可交互元素没有可访问名称 | 多页 |
| 🟦 低 | 性能 | 多次 250–400ms 的主线程长任务 | 多页 |
| 🟦 低 | 第三方 | 内嵌 SDK（`ql.njmapp.com`、`localhost.weixin.qq.com`、`hm.baidu.com`）的请求大量失败——**已按第三方降级并打标签**，不与被测站点自身缺陷混为一谈 | 多页 |

> 完整报告：[`video/huya-live-report.html`](video/huya-live-report.html)（离线可直接打开）
> · [Markdown 版](video/huya-live-report.md)
> · 运行录像：[`video/huya-live-test-run.mp4`](video/huya-live-test-run.mp4)（说明见 [`video/README.md`](video/README.md)）
> · 控制台完整输出：[`video/huya-live-console.log`](video/huya-live-console.log)

---

## 快速开始

### 环境要求

- **Node.js ≥ 20.11**
- 一个 Chromium 内核浏览器（三者之一即可）：
  - 系统已安装的 **Chrome / Edge**（推荐，无需额外下载），或
  - `npx playwright install chromium`
- （可选）**ffmpeg** —— 用于把运行过程合成 mp4 录像。缺失时平台会保留 JPEG 帧序列并如实说明。

### 安装

```bash
git clone <你的仓库地址>
cd webprobe
pnpm install          # 或 npm install
node code/src/cli.mjs doctor     # 环境自检
```

如果 `doctor` 提示缺少 ffmpeg：

```bash
node code/scripts/fetch-ffmpeg.mjs
```

### 运行

```bash
# 测试虎牙直播 Web 端（本仓库的旗舰目标）
node code/src/cli.mjs run --target code/targets/huya-live

# 测试内置的"故意有 bug"样例
node code/src/cli.mjs run --target code/samples/buggy-shop

# 测试任意一个网址
node code/src/cli.mjs run --target https://example.com --max-pages 5

# 只看被动信号，不主动点击（对生产系统更保守）
node code/src/cli.mjs run --target code/targets/huya-live --no-fuzz

# 打开可视化看板
node code/src/cli.mjs ui            # → http://127.0.0.1:7788/
```

### 全部命令

```
webprobe run --target <目录|目标id|URL> [选项]   动态执行被测软件并捕获崩溃/错误
webprobe targets                                 列出所有可用目标
webprobe ui [--port 7788]                        启动可视化看板
webprobe report [runId] [--open]                 查看历史报告
webprobe video <帧目录> <输出.mp4>                从帧序列合成录像
webprobe doctor                                  检查运行环境是否满足要求
webprobe selftest                                用内置样例验证检测器与误报
webprobe kinds                                   列出全部缺陷类型
```

`run` 的常用选项：

| 选项 | 说明 |
| --- | --- |
| `--seed, -s <n>` | 随机种子；**相同种子可复现同一执行序列** |
| `--headed` | 显示浏览器窗口（观察调试用） |
| `--strategy auto\|direct\|cdp` | `direct` = Playwright 直启（默认优先）；`cdp` = 平台自行拉起浏览器后经 DevTools 协议附着（在禁止管道创建的环境中必需） |
| `--max-pages, -n <n>` | 最多访问页面数 |
| `--max-actions, -m <n>` | 每页最多执行动作数 |
| `--duration, -d <秒>` | 整轮时间预算 |
| `--no-record` | 不录制运行视频 |
| `--no-hud` | 不在被测页面里叠加状态面板与缺陷信息（录像将只剩下页面本身） |
| `--intro <秒>` / `--outro <秒>` | 开场信息卡 / 结尾结果卡的停留时长（默认 5 / 13 秒，0 = 不显示） |
| `--no-fuzz` | 只做被动观察 + DOM 审计，不主动模糊测试 |
| `--json` | 把最终 RunReport 打到 stdout（便于 CI 解析） |

**退出码**：`0` = 未发现高危及严重缺陷；`1` = 发现高/严重缺陷（可用于 CI 门禁）；
`2` = 参数或环境错误。

---

## 项目结构

```
.
├── readme.md                  ← 你正在读的文件（如何用这个平台）
├── LICENSE
├── package.json
├── code/                      ← 软件测试平台的代码
│   ├── src/
│   │   ├── cli.mjs                 命令行入口
│   │   ├── core/
│   │   │   ├── schema.mjs          数据契约：缺陷类型、严重级、签名去重、归属判定
│   │   │   ├── util.mjs            日志 / 可复现随机数 / glob / 深合并
│   │   │   ├── paths.mjs           路径常量
│   │   │   ├── target.mjs          目标清单加载（目录 / 目标 id / URL）
│   │   │   ├── static-server.mjs   托管本地待测目录的极简静态服务器
│   │   │   ├── browser.mjs         浏览器发现 + 两种启动策略
│   │   │   ├── monitor.mjs         信号采集（平台的"感官"）
│   │   │   ├── detectors.mjs       判断层：信号→缺陷、DOM 审计、断言
│   │   │   ├── fuzzer.mjs          元素发现 + 动作计划生成
│   │   │   ├── engine.mjs          动态执行编排 + 证据采集
│   │   │   ├── recorder.mjs        CDP 屏幕录制 → mp4（帧率节流 + 真实时长）
│   │   │   ├── hud.mjs            把平台结论画进被测页面（面板/高亮/信息卡）
│   │   │   ├── reporter.mjs        JSON / Markdown / HTML 报告
│   │   │   └── server.mjs          本地看板服务器（JSON API + 静态 UI）
│   │   └── ...
│   ├── ui/                    ← 零依赖看板（原生 HTML/CSS/JS）
│   ├── tools/                 ← 项目自带的开发/回归工具
│   │   ├── test_ui_api.mjs         看板 API 端到端测试（不需要浏览器）
│   │   ├── report_summary.mjs      把某次报告浓缩成人类可读摘要
│   │   └── report_kinds.mjs        按类型统计某次报告
│   ├── targets/
│   │   └── huya-live/         ← 虎牙直播 Web 端目标定义
│   ├── samples/
│   │   ├── buggy-shop/        ← 故意含 9 类缺陷的自检样例
│   │   └── clean-site/        ← 完全无缺陷的误报对照组
│   └── scripts/
│       └── fetch-ffmpeg.mjs
├── tools/
│   └── recon/                 ← 需求读取与环境侦察期的一次性调查脚本（保留作依据）
├── video/                     ← 成功运行平台对软件进行测试的录像
│   ├── huya-live-test-run.mp4    运行录像（含页内状态面板与结果卡）
│   ├── huya-live-report.html     离线可打开的测试报告
│   ├── huya-live-report.md
│   └── huya-live-console.log     完整控制台输出
├── prompt/                    ← 与大模型交互产生并调试本平台的完整过程
│   ├── 01-requirements.md
│   ├── 02-recon-and-design.md
│   ├── 03-build-log.md
│   ├── 04-debug-log.md        ← 每一次真实失败、根因与修复
│   ├── 05-subagent-prompts.md
│   └── 06-verification.md
└── runs/                      ← 每次运行的报告与证据（git 忽略）
```

---

## 它是怎么工作的

```
输入：待测软件所在目录（含 target.json）
   │
   ▼  local → 自带静态服务器托管该目录    remote → 直接以 URL 为目标
   │
   ▼  浏览器启动（direct 直启 / cdp 免管道附着）
   │
   ▼  动态执行：爬取页面 → 声明式流程 → 元素发现 → 模糊测试
   │
   ├───────────────► 4 类信号源并行监听
   │                 ① Playwright 页面事件：pageerror / console / requestfailed / response / crash / dialog
   │                 ② CDP 域事件：Runtime.exceptionThrown / Log.entryAdded / Inspector.targetCrashed
   │                 ③ 注入页面的监听器：window 'error'、'unhandledrejection'、PerformanceObserver(longtask、资源错误)
   │                 ④ 主动探测：主线程存活探针（求值往返是否超时）
   │
   ▼  判断层：信号 → 缺陷；DOM 审计；断言执行；**按签名去重**；**第一方/第三方归属判定**
   │
   ▼  取证：截图、DOM 快照、控制台日志、网络记录、复现步骤、可执行复现脚本、运行录像
   │
   ▼  输出：report.json / report.md / report.html / bugs.json  +  本地看板
```

### 三个关键设计决定

**1. 采集与判断分离。**
`monitor.mjs` 只负责忠实记录"发生了什么"，`detectors.mjs` 才判断"这算不算缺陷、算哪一类"。
好处是新增一条检测规则永远不需要碰浏览器管道代码——在调试阶段被反复验证。

**2. 主动探测补齐"静默缺陷"。**
很多前端缺陷**不会触发任何事件**：模板变量直接渲染成 `{{userName}}`、
列表容器渲染成空的、图片静默 404、页面横向溢出、`id` 重复。
这类问题靠监听事件永远发现不了，必须主动去检查活的 DOM——所以平台在每次导航后
都会跑一遍页面内 DOM 审计。

**3. 归属判定（第一方 / 第三方）。**
一个页面会内嵌大量第三方组件（广告、统计、微信小游戏 SDK）。它们的失败**不是被测站点的缺陷**，
但会在控制台里刷出成百上千条错误。平台用注册域判定归属：

- 目标可在清单里用 `firstPartyDomains` **声明自己的其他域名**（例如虎牙的 CDN 是 `msstatic.com`）；
- `watch.thirdParty` 策略：`tag`（默认，上报但降一级并打标签）/ `ignore`（不上报）/ `all`（全量不降级）。

这一条把虎牙首轮实测的 100 条噪声压到了 26 条，并且让**真正属于虎牙的缺陷浮到了列表顶部**。

---

## 它能发现哪些缺陷

| 类型 | 默认严重级 | 说明 |
| --- | --- | --- |
| `page-crash` | 严重 | 渲染进程崩溃，标签页完全不可用 |
| `unresponsive` | 严重 | 主线程被同步阻塞 ≥1s，界面冻结（由 `longtask` 观测器上报） |
| `js-exception` | 高 | 未捕获的 JS 异常 |
| `unhandled-rejection` | 高 | 未处理的 Promise 拒绝（静默失败） |
| `http-error` | 高 | 接口或资源返回 4xx/5xx |
| `console-error` | 中 | 页面主动 `console.error` |
| `resource-error` | 中 | 资源加载失败；含**空 `src` 导致指向页面自身的无效请求** |
| `assertion` | 中 | 目标清单中声明的断言未通过 |
| `dom-anomaly` | 中 | 模板变量泄漏、图片破损、关键容器为空、横向溢出、白屏、重复 `id`、可交互元素缺少可访问名称 |
| `security` | 中 | CSP 拦截、混合内容、敏感凭据泄露到控制台 |
| `performance` | 低 | 250ms–1s 的主线程长任务 |
| `console-warning` | 低 | 页面主动 `console.warn` |

---

## 报告与看板

每次运行都会在 `runs/<runId>/` 下产出：

| 文件 | 用途 |
| --- | --- |
| `report.json` | 机器可读的完整 RunReport（看板与 CI 的数据源） |
| `report.md` | 可直接贴进 issue / 交作业的审查稿 |
| `report.html` | **离线可直接打开**的独立报告，带截图缩略图与时间线 |
| `bugs.json` | 只含缺陷列表，便于 CI 消费 |
| `artifacts/` | 每个缺陷一个目录：截图、DOM 快照、控制台日志、网络记录、复现脚本、页面上下文 |
| `artifacts/video/*.mp4` | 该次运行的屏幕录像（按真实耗时回放，不是猜测帧率） |

**复现脚本**值得一提：每个缺陷都会生成一份**可以直接运行的**
Playwright 最小复现脚本（`artifacts/findings/<签名>/repro.spec.mjs`），
把"打开哪个页面 → 点了哪些元素 → 输入了什么"重放一遍，并打印浏览器在这期间报的错。

### 录像：结论直接画在页面里

平台自己的结论（当前动作、实时缺陷清单、缺陷所在的元素）会被**绘制进被测页面**，
所以 `video/` 里的录像不需要对照终端就能看懂：

- **状态面板**：已运行时长、当前动作、页面/动作/请求/缺陷计数器、按严重级配色的缺陷流；
- **元素高亮**：用红色虚线框把出问题的元素圈出来并标注缺陷标题；
- **开场信息卡**（5 秒）：被测目标、预算、随机种子、浏览器；
- **结尾结果卡**（13 秒）：缺陷总数、严重级分布、第一方/第三方归属、Top 10 缺陷清单。

叠加层挂在 `document.documentElement` 上（不是 `<body>`），并带 `data-webprobe` 标记，
因此**平台的"白屏检测"、目标断言、DOM 审计与模糊测试都不会把它当成被测软件的一部分**
——这一点由零缺陷对照组 `clean-site` 在开启叠加层时仍然 0 检出所验证。

看板（`webprobe ui`）在此之上提供：运行历史、当前运行进度轮询、
严重级与类型分布图、可排序可筛选的缺陷表、缺陷详情抽屉（截图灯箱 / 堆栈 / 复现步骤 / 证据链接）、
覆盖范围与执行时间线、以及"下载 JSON / 复制 Markdown 摘要"。

---

## 被测目标的清单格式

一个目标就是一个目录，里面放一份 `target.json`：

```jsonc
{
  "id": "huya-live",
  "name": "虎牙直播 Web 端",
  "kind": "remote",                       // "local" | "remote"
  "url": "https://www.huya.com/",         // remote 必填
  "entry": "/",                           // local 时的入口路径

  "viewport": { "width": 1440, "height": 900 },
  "locale": "zh-CN",
  "firstPartyDomains": ["huya.com", "msstatic.com"],   // 声明自己的其他域名

  "budget": {
    "maxPages": 10,
    "maxActionsPerPage": 35,
    "maxDurationMs": 300000,
    "navigationTimeoutMs": 30000,
    "actionTimeoutMs": 4000
  },

  "explore": {
    "allowCrossOrigin": false,
    "maxDepth": 2,
    "urlPatterns": ["https://www.huya.com/", "https://www.huya.com/g**"],  // 白名单
    "denyUrlPatterns": ["**/login**", "**/pay**", "**/search**"]           // 黑名单
  },

  "fuzz": {
    "enabled": true,
    "rounds": 40,
    "seed": 20261016,                     // 可复现
    "aggressive": false,
    "allowDestructive": false,            // 不点"退出/删除/支付"类控件
    "dom": { "click": true, "type": true, "select": true, "scroll": true,
             "hover": true, "submit": true, "keyboard": true },
    "selectors": ["#hy-nav-category", ".game-live-item"],  // 必定要试的元素
    "payloads": ["英雄联盟", "", "   ", "🙂", "\"'<script>alert(1)</script>"]
  },

  // 声明式用户流程：比随机点击更能走到真实业务路径
  "flows": [
    { "id": "search-suggest", "name": "搜索框：输入关键词并操作联想下拉",
      "urlPattern": "https://www.huya.com/",
      "steps": [
        { "action": "type", "selector": "#search-bar-input", "value": "英雄联盟" },
        { "action": "wait", "value": 900 },
        { "action": "keyboard", "selector": "#search-bar-input", "value": "ArrowDown" }
      ] }
  ],

  // 把"什么叫做对"编码进来；不满足即报缺陷
  "assertions": [
    { "id": "live-list-rendered", "kind": "selector", "selector": ".game-live-item",
      "urlPattern": "https://www.huya.com/", "severity": "high",
      "title": "首页推荐直播间列表未渲染出卡片" }
  ],

  "watch": {
    "thirdParty": "tag",                   // "tag" | "ignore" | "all"
    "ignoreConsolePatterns": ["ResizeObserver loop"]
  }
}
```

`urlPattern` 的语义：`*` 不跨 `/`，`**` 跨层级，**两端自动加锚点**
（这一条是踩过坑才定下来的，见 `prompt/04-debug-log.md` 的 D-07）。

支持的断言 `kind`：`selector`、`not-selector`、`visible`、`text`、`url`、
`response`、`function`（在页面里求值一个表达式）。

---

## 如何测试你自己的软件

**测一个本地 Web 应用：**

```bash
mkdir -p my-target && cd my-target
# 把你的 HTML/CSS/JS 放在这里
cat > target.json <<'JSON'
{ "id": "my-app", "name": "我的应用", "kind": "local", "dir": ".", "entry": "/index.html" }
JSON
node ../code/src/cli.mjs run --target .
```

**测一个线上网站：**

```bash
node code/src/cli.mjs run --target https://your-site.example --duration 120 --max-pages 8
```

对生产系统，建议至少做三件事：
1. 用 `explore.urlPatterns` 白名单把范围收窄，并用 `denyUrlPatterns` 排除登录/支付/注销；
2. 保持 `allowDestructive: false`；
3. 先跑 `--no-fuzz` 看被动信号，确认无误再开启主动交互。

---

## 自检：能力验证与误报控制

```bash
node code/src/cli.mjs selftest
```

自检是**双向断言**——两个内置样例，一个证明"能发现"，一个证明"不乱报"：

| 样例 | 期望 | 最近一次结果 |
| --- | --- | --- |
| `buggy-shop`（故意植入 9 类缺陷） | **必须**检出全部类型 | ✅ 检出 10 类：`unresponsive`、`http-error`、`dom-anomaly`、`assertion`、`js-exception`、`unhandled-rejection`、`resource-error`、`security`、`console-error`、`console-warning`（16 个缺陷 / 74 个动作） |
| `clean-site`（完全无缺陷） | **必须一个都不报** | ✅ 0 个缺陷（170 个动作、63 个请求、5 个页面） |

第二条比第一条更重要。**一个测试平台最大的风险不是漏报，而是误报**——
漏报只是少发现，误报会让使用者彻底不再相信报告。
它同时也是**页内叠加面板的回归测试**：如果面板的样式或文字污染了任何一条检测规则，
`clean-site` 立刻就不再是 0 检出。
本项目里几乎每一条检测规则都能追溯到一次真实的误报或漏报，完整记录见
[`prompt/04-debug-log.md`](prompt/04-debug-log.md)。

---

## 已知限制

### 1. Chromium 需要 Windows 命名管道

Chromium 是多进程架构，进程间通信（Mojo IPC）在 Windows 上**必须使用命名管道**。
如果运行环境禁止创建管道，浏览器**无法启动**，`webprobe doctor` 会明确报出：

```
✘ 浏览器能否真正启动    browserType.launch: spawn EPERM
    原因：Chromium 多进程通信依赖 Windows 命名管道，当前环境禁止创建管道。
    请在普通终端/桌面环境运行，或让容器允许命名管道（Docker 加 --ipc=host）。
```

这是操作系统的硬性边界，不是权限配置错误，也无法通过改写代码绕过。
**普通终端、桌面环境、以及加了 `--ipc=host` 的 Docker 容器都能正常使用。**
平台为此额外提供了 `--strategy cdp`：自行拉起浏览器并把输出重定向到文件（而非管道），
再经 DevTools 协议附着——这在某些禁止管道 stdio 的加固环境中有效
（但对"完全禁止命名管道"的环境同样无效）。

### 2. 其他

- **时间预算导向**：虎牙这类重页面，5 分钟只能覆盖 7 个页面左右。要提高覆盖率就调大 `maxDurationMs`。
- **不做视频流解码验证**：直播间播放器会持续拉流，目标的 URL 白名单刻意排除了直播间页面，
  以免把预算耗在流媒体上。若要测播放器，请自行放开白名单并调大预算。
- **断言需要人工编写**：`assertions` 是"什么叫做对"的声明，平台无法自动推断业务正确性。
- **录像目前依赖 ffmpeg**：缺失时会保留 JPEG 帧序列，可用 `webprobe video` 事后合成。
- **不绕过风控**：平台不实现验证码识别、不做反爬对抗。

---

## 使用须知

对线上系统（包括本仓库随附的虎牙目标）使用本平台前，请确认：

- 你**有权**对该系统进行自动化测试（自己的系统、已获授权、或课程作业明确允许的情形）；
- 遵守目标站点的**服务条款**与 `robots.txt`；
- 保持克制：本仓库的虎牙目标刻意采用低并发、只读浏览、`allowDestructive: false`、
  时间预算上限 5 分钟、URL 白名单收窄到分类页，**不触碰登录/支付/注销/举报**；
- 平台默认使用标准桌面浏览器 UA。这是自动化测试工具的常见做法
  （避免站点对 `HeadlessChrome` 返回降级内容），但**不构成伪装成人工流量的许可**——
  请自行判断是否适合你的场景。

请仅在你被允许测试的系统上使用本工具。

---

## 许可

[MIT](LICENSE)
