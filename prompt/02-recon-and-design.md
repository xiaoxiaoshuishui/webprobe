# 02 · 环境侦察与架构设计

## 2.1 侦察：先确认"能做什么"，再决定"怎么做"

在写任何平台代码之前，先做了一轮能力探测。这一步救回了后面大量的返工。

| 探测项 | 命令/方式 | 结果 |
| --- | --- | --- |
| Node 版本 | `node -v` | `v24.21.0` ✔ |
| 浏览器内核 | 查标准安装路径 | Chrome `155.0.8059.40`、Edge `155.4283.45` 均已安装 ✔ |
| Playwright 自带浏览器 | 查 `ms-playwright` 缓存 | **不存在**（`false`） |
| 现成的 Playwright 包 | 全盘搜索 | 在 `~/.cache/codex-runtimes/.../playwright` 找到 **1.62.1** ✔ |
| 网络（PowerShell） | `Invoke-WebRequest` | **失败**（基础连接被关闭） ✘ |
| 网络（curl.exe） | `curl.exe` | **失败**（`000`） ✘ |
| 网络（Node `fetch`） | `node -e "fetch(...)"` | **成功，HTTP 200** ✔ |
| 虎牙可达性 | Node fetch | **HTTP 200，113,087 字节** ✔ |
| npm registry | Node fetch | 200（`registry.npmmirror.com` 亦可） ✔ |
| ffmpeg | 全盘搜索 | **不存在** ✘ |

**结论**：只有 Node 这个运行时能上网。后续所有下载都必须用 Node 完成
（这也解释了为什么后来 pnpm 的生命周期脚本会失败，见 04 节）。

## 2.2 关键发现：这个沙箱里启动不了 Chromium

这是本次开发中最重要的一个发现，直接决定了调试方式。

**第一次尝试**——标准 Playwright 启动：

```
FAIL chrome-executablePath: browserType.launch: spawn EPERM
FAIL chrome-channel:        browserType.launch: spawn EPERM
FAIL edge-channel:          browserType.launch: spawn EPERM
```

初判是"管道被禁"。于是设计了**第二种免管道启动方案**（这个方案后来保留成了平台的功能）：

- 用 `child_process.spawn(exe, args, { stdio: ['ignore', fd, fd] })` 自己拉起 Chrome，
  `--remote-debugging-port=<port>`，**输出重定向到文件而不是管道**；
- 轮询 `http://127.0.0.1:<port>/json/version` 等 DevTools 端点就绪；
- 再用 `chromium.connectOverCDP()` 附着上去（纯 WebSocket，不产生管道）。

**结果仍然失败**，但这次拿到了真正的报错：

```
[ERROR:crashpad_client_win.cc:430] OpenProcess: 拒绝访问。 (0x5)
[FATAL:mojo\public\cpp\platform\platform_channel.cc:187] Check failed: . : 拒绝访问。 (0x5)
```

**根因**：Chromium 是多进程架构，进程间通信（Mojo IPC）在 Windows 上**必须使用命名管道**。
沙箱禁止创建命名管道，所以无论用哪种启动方式都起不来。这是操作系统的硬性边界，
**不是权限配置错误，也无法通过"换个写法"绕过**。

**处理方式**：
1. 平台代码照常写，全部按"能启动浏览器"来设计；
2. 把免管道 CDP 方案**保留为正式功能**（`--strategy auto|direct|cdp`），
   因为它在加固后的 CI 容器里确实有用；
3. 在 `webprobe doctor` 里加入明确的诊断输出，把上面这段机制直接告诉用户；
4. 真正需要跑浏览器时，向用户申请**一次性放宽权限**运行；
5. 在 `readme.md` 里如实记录这个限制。

## 2.3 技术选型

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 浏览器驱动 | `playwright-core` + 系统 Chrome/Edge | 免去 150MB 浏览器下载；`playwright-core` 不触发 postinstall，安装更干净；同时支持用户自行 `npx playwright install chromium` |
| 依赖数量 | 仅 1 个必需依赖 | 平台自身零框架、零构建步骤，避免"测试工具本身需要一堆依赖才能跑" |
| 前端看板 | 原生 HTML/CSS/JS | 同上；离线可用，`file://` 除外（需由服务器托管） |
| 录像 | CDP `Page.startScreencast` + ffmpeg | 不依赖 Playwright 自带的 ffmpeg（它随浏览器一起下载）；且**帧自带时间戳**，能按真实速度回放而不是猜测帧率 |
| 报告格式 | JSON + Markdown + 独立 HTML | JSON 给 CI，Markdown 给 issue，HTML 给人工review（离线可看） |
| 去重 | 按"信号签名"哈希 | 同一缺陷在多个页面/多次出现必须合并，否则报告会被同一个 bug 淹没 |

## 2.4 架构

```
输入：待测软件所在目录（含 target.json）
        │
        ▼
  ┌───────────────┐   local: 自带静态服务器托管该目录
  │  target.mjs   │   remote: 直接以 URL 为目标
  └───────┬───────┘
          ▼
  ┌───────────────┐   direct（Playwright 直启）/ cdp（免管道 + connectOverCDP）
  │  browser.mjs  │
  └───────┬───────┘
          ▼
  ┌───────────────────────────────────────────────┐
  │              engine.mjs（动态执行）             │
  │  爬取页面 → 声明式流程 → 元素发现 → 模糊测试      │
  └───┬───────────────────────────────────────┬───┘
      │                                       │
      ▼                                       ▼
┌────────────┐  4 类信号来源            ┌──────────────┐
│ monitor.mjs│ ─ Playwright 页面事件     │ fuzzer.mjs   │
│  （感官）   │ ─ CDP 域事件              │ 元素发现+动作 │
│            │ ─ 注入页面的 error/        │ 计划生成      │
│            │   unhandledrejection 监听 │              │
│            │ ─ 主动探测（主线程存活）    └──────────────┘
└─────┬──────┘
      ▼
┌────────────────┐  信号 → 缺陷 + DOM 审计 + 断言
│ detectors.mjs  │  （判断，与采集分离）
└─────┬──────────┘
      ▼
┌────────────────┐  证据采集：截图/DOM/日志/网络/复现脚本/录像
│  engine 取证    │
└─────┬──────────┘
      ▼
┌────────────────┐  report.json / report.md / report.html / bugs.json
│ reporter.mjs   │
└─────┬──────────┘
      ▼
┌────────────────┐  本地看板（/api/runs 等 JSON API + 静态 UI）
│  server.mjs    │
└────────────────┘
```

**核心设计原则：把"采集"和"判断"分开。**
`monitor.mjs` 只负责忠实地记录发生了什么（原始信号），`detectors.mjs` 才决定它算不算缺陷、
算哪一类、多严重。好处是新增一条检测规则永远不需要碰浏览器管道代码——
这一点在调试阶段被反复验证（见 04 节，绝大部分修复只改 `detectors.mjs`）。
