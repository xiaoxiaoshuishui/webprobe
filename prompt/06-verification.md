# 06 · 最终验证

本文记录交付版本的验证证据。所有数字都可在 `runs/` 目录下的报告中复核。

## 6.1 环境

| 项目 | 值 |
| --- | --- |
| Node.js | v24.21.0 |
| 浏览器内核 | 系统 Google Chrome `155.0.8059.40`（免下载） |
| 启动方式 | `direct`（Playwright 直启） |
| ffmpeg | `ffmpeg 6.1.1-essentials_build`（由 `code/scripts/fetch-ffmpeg.mjs` 取得） |
| 平台依赖 | 仅 `playwright-core`（+ 可选 `ffmpeg-static`） |

## 6.2 自检：能力验证 + 误报控制

```
$ node code/src/cli.mjs selftest
```

| 样例 | 期望 | 结果 | 明细 |
| --- | --- | --- | --- |
| `buggy-shop`（植入 9 类缺陷） | 必须全部检出 | ✅ 通过 | 检出 16 个缺陷 / **10 类** / 74 个动作 |
| `clean-site`（无缺陷对照组） | 必须零检出 | ✅ 通过 | **0 个缺陷** / 170 个动作 / 63 个请求 / 5 个页面 |

`buggy-shop` 实际检出的类型：
`unresponsive`、`http-error`、`dom-anomaly`、`assertion`、`js-exception`、
`unhandled-rejection`、`resource-error`、`security`、`console-error`、`console-warning`。

```
自检全部通过：检测能力与误报控制均符合预期。
```

**这一条最重要的价值在于 `clean-site` 的 0 检出。** 开发过程中，
平台最早的一批真实缺陷（每个页面都误报"主线程卡死"、关闭的 `<details>` 里的链接
被误报"缺少可访问名称"、首页断言在所有页面误报）**全部是这个对照组抓出来的**，
详见 `04-debug-log.md` 的 D-06 / D-07 / D-14。

## 6.3 虎牙直播 Web 端实测

```
$ node code/src/cli.mjs run --target code/targets/huya-live
```

**运行概况**

| 指标 | 值 |
| --- | --- |
| 时长 | 5 分 23 秒（触发 300 秒时间预算上限，正常收尾） |
| 访问页面 | 7（首页、`/l`、`/g`、`/m`、`/g_ol`、`/g_pc`、`/g_yl`） |
| 执行动作 | 88 |
| 网络请求 | 4000（失败 104） |
| 新标签页 | 30（审计 1 个，按 URL 策略跳过 29 个） |
| **发现缺陷** | **25**（严重 0 · 高 0 · 中 3 · 低 22） |
| 第一方 / 第三方 | 16 / 9 |
| 录像 | `artifacts/video/…mp4`，5.0 MB，2252 帧，时长 5 分 14 秒 |

> 线上站点内容实时变化，各轮运行的缺陷集合不完全一致。早期几轮还捕获到过一个
> **高危**缺陷：`/l` 页面抛出未处理的 Promise 拒绝且原因为 `null`。

**按类型**

| 类型 | 数量 | 归属 |
| --- | --- | --- |
| 安全配置问题（混合内容） | 1（中） | 第一方 |
| 资源加载失败 | 6（中/低） | 第一方 + 第三方 |
| DOM 异常 | 10（中/低） | 第一方 |
| 控制台 error | 4（低） | 第三方 |
| 控制台 warn | 3（低） | 第一方 |
| 性能劣化（长任务） | 1（低） | 第一方 |

**断言结果**：首页 6 条断言全部通过（含 `live-list-rendered`：首页确实渲染出了
`.game-live-item` 卡片）；其余 6 个页面各 2 条通用断言
（`page-not-blank`、`no-error-page`）也全部通过。**没有误报的断言失败。**

**URL 策略生效情况**：跳过了 15 个链接，原因分布为
`popup:denied` 5、`cross-origin` 5、`not-matched` 2、`popup:cross-origin` 2、`popup:not-matched` 1。
即：直播间页面、第三方商城域名、登录/支付类路径都被策略挡在了时间预算之外。

## 6.4 录像内容的可断言验证

第一版录像只拍到了"浏览器在逛网页"，看不到任何测试结论（使用者反馈，见
`04-debug-log.md` 的 D-19）。修复后，验证方式不再靠肉眼抽查，而是**让平台把
叠加层的真实状态写进报告**：

```json
"hud": {
  "enabled": true,
  "errors": [],
  "stateAtEnd": {
    "rootPresent": true,
    "feedRows": 9,
    "feedText": "低控制台 warn 输出console.warn：TTP 只能在直播间使用低性能劣化主线程长任务 281ms×6中资源加载失败元素 src 为空导致指向页面自身…",
    "statsText": "页面 7/10动作 89请求 4000（失败 107）缺陷 24",
    "actionText": "▶ [20/35] 悬停 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(1)（下载）",
    "cardPresent": false
  }
}
```

`feedRows: 9` 与 `errors: []` 就是"面板确实在工作、且没有静默失败"的证据。
配合抽帧核对：开场卡位于 0–5 秒、状态面板贯穿全程、结果卡位于最后 13 秒
（三条结论都由 `tools/recon/probe_hud.mjs` 与抽帧脚本独立验证过）。

## 6.5 看板 API 端到端测试

看板本身不需要浏览器，因此用 Node 直接对 HTTP 接口做了端到端验证
（`tools/test_ui_api.mjs`，启动服务器 → 打全部接口 → 断言）：

```
  OK   GET /api/health — WebProbe 1.0.0
  OK   GET /api/targets  (lists all three targets) — buggy-shop, clean-site, huya-live
  OK   GET /api/runs  (run index, newest first) — 3 runs, newest=run-…-huya-live
  OK   GET /api/runs/:runId  (full report with findings) — 26 findings, 7 pages
  OK   artifact fetch works for a real screenshot — findings/…/screenshot.png (344607 bytes)
  OK   artifact path traversal is refused — HTTP 404
  OK   GET /api/runs/:runId/report.html — 122 kb
  OK   static UI is served at / — index.html + styles.css + app.js
  OK   unknown run returns 404 (not a crash) — HTTP 404
  OK   POST /api/run rejects a missing targetId — HTTP 400

  dashboard API: 10 passed, 0 failed
```

**这个测试抓到了一个真实缺陷**：`server.mjs` 里写了 `fsp.createReadStream(...)`，
但 `node:fs/promises` **没有** `createReadStream`——导致看板的截图、报告页和静态 UI
**全部无法加载**（服务器日志刷 `fsp.createReadStream is not a function`）。
已改为从 `node:fs` 导入 `createReadStream`。若没有这个测试，
这个缺陷只有在人工打开看板时才会暴露。

## 6.6 其他检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 全部源文件语法 | `node --check` × 19 个 `.mjs` | 0 失败 |
| 源码无字面控制字符 | 全量扫描（排除故意的零宽连接符） | 0 处（见 D-23） |
| 目标清单可解析 | `webprobe targets` | 3 个目标（`buggy-shop`、`clean-site`、`huya-live`） |
| 归属判定逻辑 | 内联单元验证 | `huya.com`/`msstatic.com` → 第一方；`ql.njmapp.com`/`hm.baidu.com`/`qq.com` → 第三方 ✔ |
| URL 模式锚定 | 内联单元验证 | `https://www.huya.com/` 不再匹配 `/m`、`/g/1` ✔ |
| 叠加面板 API | `tools/recon/probe_hud.mjs` | `setFindings`/`pushFinding`/`setStats`/`setAction`/`showCard` 全部可用；面板 472×158；卡片铺满 1280×800 ✔ |
| 录像可播放 | `ffmpeg -i` | H.264 / yuv420p / 1280×800 / 时长 5:14 / 5.0 MB ✔ |
| 录像结构 | 0.5fps 抽帧 | 开场卡 0–5s、状态面板全程、结果卡末 13s ✔ |
| 叠加面板不污染检测 | `webprobe selftest`（面板开启） | `clean-site` 仍然 0 检出 ✔ |
| 静态服务器路径穿越 | 内联验证 | `/../../../etc/passwd` → 404 ✔ |

## 6.7 交付物清单

| 需求 | 交付 | 状态 |
| --- | --- | --- |
| `readme.md` 介绍如何使用平台 | `readme.md`（含快速开始、清单格式、限制、使用须知） | ✅ |
| `code*` 平台代码 | `code/src/`（16 个模块）、`code/ui/`（看板）、`code/targets/huya-live/`、`code/samples/`（2 个自检样例）、`code/scripts/`、`code/tools/` | ✅ |
| `video*` 运行录像 | `video/huya-live-test-run.mp4`（含页内状态面板与结果卡）+ 报告 + 控制台日志 | ✅ |
| `prompt*` 交互与调试过程 | `prompt/01`–`06`（含 23 条真实失败的根因与修复） | ✅ |
| 开源到 GitHub | git 仓库已初始化并提交；`LICENSE`（MIT）、`.gitignore` | ✅（推送需用户自己的凭据） |
