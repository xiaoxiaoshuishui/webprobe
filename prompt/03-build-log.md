# 03 · 编码阶段

按依赖顺序实现，每一步都保持"可独立说明"。

## 3.1 地基层

| 文件 | 作用 | 关键设计 |
| --- | --- | --- |
| `code/src/core/schema.mjs` | 数据契约 | 12 种缺陷类型 + 5 个严重级 + 信号归一化 + **归属判定**（第一方/第三方）。整个平台的输出、看板、报告都遵循它 |
| `code/src/core/util.mjs` | 工具 | 分级日志、**可复现随机数**（mulberry32，同种子→同执行序列）、glob 匹配、深合并 |
| `code/src/core/paths.mjs` | 路径常量 | 让 CLI/引擎/服务器/报告器对仓库根、`runs/`、UI 目录的认知一致 |

`schema.mjs` 里的 `normalizeSignal()` 是去重的基础：把 URL 收敛为 `origin+pathname`、
把 UUID/时间戳/长十六进制/纯数字替换为占位符，**这样"同一个 bug 的第 2 次出现"
才会和第一次落到同一个签名上**。

## 3.2 输入层

- `static-server.mjs`：托管本地待测目录。刻意**如实返回 404/405**，
  因为"资源缺失"正是平台要观测的缺陷类型之一，服务器不能替被测软件遮掩。
  含路径穿越防护（`safeJoin`）。
- `target.mjs`：解析 `target.json` 清单。支持三种输入写法——**目录**、**目标 id**、
  **裸 URL**，对应需求中的"输入是目录"同时兼顾随手测一个网址的便利。

## 3.3 执行层

- `browser.mjs`：浏览器发现（Playwright 自带 → 系统 Chrome → Edge → Chromium）
  + 两种启动策略。`buildLaunchError()` 会把 EPERM 翻译成**可操作的诊断**而不是抛一句英文堆栈。
- `monitor.mjs`：**平台最重要的一块**。四类信号来源同时挂着，见 02 节架构图。
  另有主动探测（主线程存活探针）。
- `recorder.mjs`：CDP `Page.startScreencast` 抓 JPEG 帧 + 每帧时间戳，
  用 ffmpeg 的 concat demuxer 按**真实耗时**设定每帧 `duration`，所以回放速度与实测速度一致。

## 3.4 判断层

- `detectors.mjs`：信号→缺陷映射 + **DOM 审计** + **断言执行**。
  DOM 审计在页面内一次 `evaluate` 完成，专抓"不会触发任何事件"的静默缺陷：
  模板变量泄漏（`{{userName}}`）、图片破损、关键容器为空、横向溢出、白屏、重复 id、
  可交互元素缺少可访问名称。
- `fuzzer.mjs`：元素发现（生成稳定唯一的 CSS 选择器）+ 动作计划生成。
  动作排序刻意"先便宜后昂贵、先安全后危险"，这样一旦页面提前崩掉，已经拿到的信号仍有价值。

## 3.5 输出层

- `reporter.mjs`：`report.json`（机器读）、`report.md`（贴 issue）、
  `report.html`（离线可看，内嵌样式、截图缩略图、时间线）、`bugs.json`（CI 用）。
- `server.mjs`：本地看板服务器，6 个 JSON 接口 + 静态 UI，含 artifact 路径穿越防护。
- `cli.mjs`：`run` / `targets` / `ui` / `report` / `video` / `doctor` / `selftest`。

## 3.6 并行委派

为了不把上下文全部消耗在样板代码上，把两块**自包含、接口明确**的工作并行委派给子代理
（提示词原文见 `05-subagent-prompts.md`）：

1. **自检样例**（`code/samples/`）：一个"故意有 9 类 bug 的商城"作为能力验证，
   加一个"完全无 bug 的文档站"作为**误报对照组**。
2. **结果看板 UI**（`code/ui/`）：零依赖静态 SPA，消费 `server.mjs` 定义的 JSON 契约。

之所以可以安全并行：两者的接口在委派**之前**就已经冻结
（`target.json` 的字段定义、6 个 API 的路径与响应结构），
所以不需要来回对齐。

## 3.7 自检（selftest）的设计

`webprobe selftest` 不只是"跑一遍样例"，而是一套**双向断言**：

- `buggy-shop`：必须检出全部 10 类缺陷（漏报检查）；
- `clean-site`：**必须一个缺陷都不报**（误报检查）。

第二条比第一条更重要。事实也证明了这一点——平台最早的一批真实缺陷，
全部是 `clean-site` 抓出来的（见 04 节）。

## 3.8 平台自身也遵守它检测的规范

编写过程中，平台代码本身被同一套标准约束：中文日志可读、无静默 `catch {}`（都带注释说明
为什么可以忽略）、不吞掉被测页面的错误、所有用户可见文本走转义
（`escapeHtml` / `esc()`），因为**缺陷标题和堆栈来自被测网站，是不可信输入**。
