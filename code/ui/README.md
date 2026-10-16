# WebProbe 控制台（code/ui）

零依赖静态前端：三个文件，纯 HTML + CSS + 原生 JS，**没有构建步骤、没有 CDN、没有框架、没有 `import`**。

```
code/ui/
├── index.html   SPA 外壳（唯一入口）
├── styles.css   深色主题（CSS 自定义属性）
├── app.js       全部逻辑（单个 IIFE，普通 <script src>，非 module）
└── README.md    本文件
```

## 如何被服务

同项目的 Node HTTP 服务器（不在本目录，另行实现）承担两件事：

1. 把本目录作为站点根目录静态托管 —— `GET /` 返回 `index.html`，`/styles.css`、`/app.js` 按同名返回；
2. 在同一个源下暴露 JSON API（下表）。

因此前端只用**同源相对路径**请求接口，不存在跨域，也不需要配置 base URL：直接用浏览器打开
`http://127.0.0.1:<port>/` 即可。因为使用了 `fetch` 与 `Blob`，请通过该 HTTP 服务器访问，
不要用 `file://` 直接打开本地文件。

## 前端消费的 API

| 方法 + 路径 | 用途 |
| --- | --- |
| `GET /api/health` | 启动时探活，把 platform/version 显示在顶栏 |
| `GET /api/targets` | 填充顶栏的目标下拉框 |
| `GET /api/runs` | 填充运行历史下拉框、概览统计；运行中每 2s 轮询直到新运行出现 `finishedAt` |
| `GET /api/runs/:runId` | 加载所选运行的完整 RunReport（驱动整页渲染） |
| `POST /api/run` | 提交 `{"targetId":"..."}` 启动新测试，随后进入轮询 |
| `GET /api/runs/:runId/artifacts/<relpath>` | 证据文件；由 `evidence.screenshots` / `domSnapshot` / `consoleLog` / `har` / `video` 的相对路径按段 URL 编码拼接而成 |

## 前端行为要点

- **空状态**：`/api/runs` 返回空数组或 404 时显示「还没有测试记录，点击「开始测试」」，不算错误。
- **容错**：任何 `fetch` 失败都只写 `console.error` + 顶部内联错误横幅，已渲染的报告不会被清空。
- **安全**：被测站点产出的标题 / 消息 / 堆栈 / URL 全部经 `textContent` 或 `esc()` 转义后才进入 DOM；
  覆盖率链接仅在 `http(s)://` 开头时才渲染为链接。
- **可达性**：Escape 关闭详情抽屉与图片灯箱，图标按钮带 `aria-label`，表头 `aria-sort`，行可按 Enter/空格打开详情。
- **响应式**：≤900px 时栅格降为单列，详情抽屉变为全宽。
