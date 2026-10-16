# code/tools/ — 项目自带的开发与测试工具

| 工具 | 用途 | 命令 |
| --- | --- | --- |
| `test_ui_api.mjs` | **看板 API 端到端测试**：不需要浏览器，直接启动看板服务器并逐个断言全部 6 类接口、静态资源、证据文件与路径穿越防护 | `pnpm run test:ui` |
| `report_summary.mjs` | 把某次运行的 `report.json` 浓缩成一份人类可读的摘要（按缺陷分组、带归属与覆盖率） | `node code/tools/report_summary.mjs runs/<runId>/report.json` |
| `report_kinds.mjs` | 按缺陷类型给出紧凑的计数、严重级与归属分布，适合写报告时取数 | `node code/tools/report_kinds.mjs runs/<runId>/report.json` |

`test_ui_api.mjs` 是回归测试里不可省的一环：它曾经抓到
`server.mjs` 中 `fsp.createReadStream is not a function` 这个会让看板**完全无法加载任何文件**
的缺陷——而那个缺陷只有人工打开看板时才会暴露（详见 `prompt/06-verification.md`）。
