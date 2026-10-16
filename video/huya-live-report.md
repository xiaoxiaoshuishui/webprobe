# 虎牙直播 Web 端 — 软件测试报告

> 由 **WebProbe 浏览器端动态软件测试平台 v1.0.0** 自动生成

| 项目 | 值 |
| --- | --- |
| 运行 ID | `run-20261016-155046-huya-live` |
| 被测目标 | 虎牙直播 Web 端（remote） |
| 入口地址 | https://www.huya.com/ |
| 目标目录 | `D:\qq\File\FileRecv\ds_work\code\targets\huya-live` |
| 浏览器 | chrome 155.0.8059.40 · direct |
| 开始时间 | 2026-10-16T07:50:46.967Z |
| 结束时间 | 2026-10-16T07:56:10.170Z |
| 耗时 | 5分23秒 |
| 随机种子 | `20261016`（相同种子可复现本次执行序列） |

## 一、执行概况

| 指标 | 数量 |
| --- | --- |
| 访问页面 | 7 |
| 执行动作 | 88 |
| 网络请求 | 4000 |
| 失败请求 | 104 |
| 控制台消息 | 157 |
| 新标签页 | 1 个已审计 / 29 个按 URL 策略跳过 |
| **发现缺陷** | **25** |
| 其中：第一方（被测站点自身） | 16 |
| 其中：第三方（内嵌的广告/统计/支付等） | 9 |

### 缺陷严重级分布

| 严重级 | 数量 |
| --- | --- |
| 🟨 中 (medium) | 3 |
| 🟦 低 (low) | 22 |

### 缺陷类型分布

| 类型 | 数量 |
| --- | --- |
| 安全配置问题 (`security`) | 1 |
| 资源加载失败 (`resource-error`) | 6 |
| DOM 异常 (`dom-anomaly`) | 10 |
| 控制台 error 输出 (`console-error`) | 4 |
| 性能劣化 (`performance`) | 1 |
| 控制台 warn 输出 (`console-warning`) | 3 |

## 二、缺陷清单

| # | 严重级 | 类型 | 标题 | 归属 | 次数 | 位置 |
| --- | --- | --- | --- | --- | --- | --- |
| F-0001 | 🟨 中 | 安全配置问题 | 混合内容（HTTPS 页面加载 HTTP 资源） | 第一方 | 3 | https://www.huya.com/g/100032 |
| F-0002 | 🟨 中 | 资源加载失败 | 元素 src 为空导致指向页面自身的无效请求 | 第一方 | 2 | https://www.huya.com/ |
| F-0003 | 🟨 中 | DOM 异常 | 关键容器内容为空：ul#wrap-recomGame | 第一方 | 1 | https://www.huya.com/ |
| F-0004 | 🟦 低 | 资源加载失败 | 资源加载失败：ql.njmapp.com:5284/ | 第三方 | 30 | https://www.huya.com/ |
| F-0005 | 🟦 低 | 资源加载失败 | 资源加载失败：localhost.weixin.qq.com:14019/wx_game_base/api/business | 第三方 | 18 | https://www.huya.com/ |
| F-0006 | 🟦 低 | 控制台 error 输出 | console.error：Access to XMLHttpRequest at 'https://ql.njmapp.com:5283/' from origin 'https://www.huya.com' has been blocked… | 第三方 | 8 | https://www.huya.com/g/100032 |
| F-0007 | 🟦 低 | 性能劣化 | 主线程长任务 281ms | 第一方 | 6 | https://www.huya.com/ |
| F-0008 | 🟦 低 | 资源加载失败 | 资源加载失败：ql.njmapp.com:5283/ | 第三方 | 5 | https://www.huya.com/ |
| F-0009 | 🟦 低 | DOM 异常 | 重复的元素 id：#live-0 | 第一方 | 5 | https://www.huya.com/ |
| F-0010 | 🟦 低 | 资源加载失败 | 资源加载失败：hm.baidu.com/hm.js | 第三方 | 2 | https://www.huya.com/ |
| F-0011 | 🟦 低 | 控制台 error 输出 | console.error：Access to XMLHttpRequest at 'https://ql.njmapp.com:5283/' from origin 'https://www.huya.com' has been blocked… | 第三方 | 2 | https://www.huya.com/ |
| F-0012 | 🟦 低 | 控制台 warn 输出 | console.warn：The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. … | 第一方 | 2 | https://www.huya.com/m |
| F-0013 | 🟦 低 | 控制台 warn 输出 | console.warn：TTP 只能在直播间使用 | 第一方 | 1 | https://www.huya.com/ |
| F-0014 | 🟦 低 | 资源加载失败 | 资源加载失败：hm.baidu.com/hm.js | 第三方 | 1 | https://www.huya.com/ |
| F-0015 | 🟦 低 | 控制台 error 输出 | console.error：Error: timeout | 第三方 | 1 | https://www.huya.com/ |
| F-0016 | 🟦 低 | DOM 异常 | 可交互元素缺少可访问名称（4 个元素） | 第一方 | 1 | https://www.huya.com/ |
| F-0017 | 🟦 低 | DOM 异常 | 可交互元素缺少可访问名称（6 个元素） | 第一方 | 1 | https://www.huya.com/g/100032 |
| F-0018 | 🟦 低 | 控制台 warn 输出 | console.warn：TTP 只能在直播间使用 | 第一方 | 1 | https://www.huya.com/g/100032 |
| F-0019 | 🟦 低 | 控制台 error 输出 | console.error：Error: timeout | 第三方 | 1 | https://www.huya.com/g/100032 |
| F-0020 | 🟦 低 | DOM 异常 | 可交互元素缺少可访问名称（8 个元素） | 第一方 | 1 | https://www.huya.com/l |
| F-0021 | 🟦 低 | DOM 异常 | 可交互元素缺少可访问名称（1 个元素） | 第一方 | 1 | https://www.huya.com/g |
| F-0022 | 🟦 低 | DOM 异常 | 可交互元素缺少可访问名称（1 个元素） | 第一方 | 1 | https://www.huya.com/m |
| F-0023 | 🟦 低 | DOM 异常 | 可交互元素缺少可访问名称（1 个元素） | 第一方 | 1 | https://www.huya.com/g_ol |
| F-0024 | 🟦 低 | DOM 异常 | 可交互元素缺少可访问名称（1 个元素） | 第一方 | 1 | https://www.huya.com/g_pc |
| F-0025 | 🟦 低 | DOM 异常 | 可交互元素缺少可访问名称（1 个元素） | 第一方 | 1 | https://www.huya.com/g_yl |

## 三、缺陷详情

### F-0001 · 🟨 混合内容（HTTPS 页面加载 HTTP 资源）

- **类型**：安全配置问题 `security`
- **严重级**：中 `medium`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/g/100032
- **出现次数**：3
- **首次发现**：2026-10-16T07:51:09.270Z
- **签名**：`cc79d8ac5d52`
- **来源**：signal, console

**现象**

```text
混合内容：页面 www.huya.com 通过 HTTPS 加载了不安全的 HTTP 资源（来自 live-cover.msstatic.com）。例如：http://live-cover.msstatic.com/huyalive/1334368570-1334368570-5731069368960286720-2668860596-10057-A-0-1-imgplus/202610…。浏览器会拦截或降级这些请求，可能造成图片/样式/脚本在部分网络环境下静默失效。
```

**复现步骤**

1. 打开 https://www.huya.com/g/100032
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：混合内容：页面 www.huya.com 通过 HTTPS 加载了不安全的 HTTP 资源（来自 live-cover.msstatic.com）。例如：http://live-cover.msstatic.com/huyalive/1334368570-1334368570-5731069368960286720-…

**证据**

- 截图：`findings/cc79d8ac5d52/screenshot.png`
- DOM 快照：`findings/cc79d8ac5d52/dom.html`
- 控制台日志：`findings/cc79d8ac5d52/console.log`
- 网络记录：`findings/cc79d8ac5d52/network.json`
- 复现脚本：`findings/cc79d8ac5d52/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "console",
  "location": {
    "url": "https://www.huya.com/g/100032",
    "line": 0,
    "column": 0,
    "lineNumber": 0,
    "columnNumber": 0
  },
  "subtype": "mixed-content",
  "pageHost": "www.huya.com",
  "insecureHost": "live-cover.msstatic.com",
  "party": "first-party"
}
```

---

### F-0002 · 🟨 元素 src 为空导致指向页面自身的无效请求

- **类型**：资源加载失败 `resource-error`
- **严重级**：中 `medium`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/
- **出现次数**：2
- **首次发现**：2026-10-16T07:51:00.364Z
- **签名**：`6d84393d1a9b`
- **来源**：signal, inpage

**现象**

```text
<img> 元素加载失败：该元素的 src 为空，浏览器将当前页面地址当作资源地址，发起了一次指向页面自身的无效请求。
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：<img> 元素加载失败：该元素的 src 为空，浏览器将当前页面地址当作资源地址，发起了一次指向页面自身的无效请求。

**证据**

- 截图：`findings/6d84393d1a9b/screenshot.png`
- DOM 快照：`findings/6d84393d1a9b/dom.html`
- 控制台日志：`findings/6d84393d1a9b/console.log`
- 网络记录：`findings/6d84393d1a9b/network.json`
- 复现脚本：`findings/6d84393d1a9b/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "inpage",
  "resourceUrl": "https://www.huya.com/",
  "subtype": "empty-src",
  "party": "first-party"
}
```

---

### F-0003 · 🟨 关键容器内容为空：ul#wrap-recomGame

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：中 `medium`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:00.397Z
- **签名**：`4caffc007b19`
- **来源**：dom-audit, empty-container

**现象**

```text
容器 ul#wrap-recomGame（尺寸 685×320）已渲染但既无文本也无媒体元素，疑似列表/播放器渲染失败。
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：容器 ul#wrap-recomGame（尺寸 685×320）已渲染但既无文本也无媒体元素，疑似列表/播放器渲染失败。

**证据**

- 截图：`findings/4caffc007b19/screenshot.png`
- DOM 快照：`findings/4caffc007b19/dom.html`
- 控制台日志：`findings/4caffc007b19/console.log`
- 网络记录：`findings/4caffc007b19/network.json`
- 复现脚本：`findings/4caffc007b19/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "dom-audit",
  "subtype": "empty-container",
  "selector": "ul#wrap-recomGame",
  "detail": "685×320",
  "snippet": "",
  "party": "first-party"
}
```

---

### F-0004 · 🟦 资源加载失败：ql.njmapp.com:5284/

- **类型**：资源加载失败 `resource-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/
- **出现次数**：30
- **首次发现**：2026-10-16T07:51:00.364Z
- **签名**：`7387392f17a3`
- **来源**：signal, requestfailed, third-party

**现象**

```text
net::ERR_CONNECTION_REFUSED — xhr https://ql.njmapp.com:5284/
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：net::ERR_CONNECTION_REFUSED — xhr https://ql.njmapp.com:5284/

**证据**

- 截图：`findings/7387392f17a3/screenshot.png`
- DOM 快照：`findings/7387392f17a3/dom.html`
- 控制台日志：`findings/7387392f17a3/console.log`
- 网络记录：`findings/7387392f17a3/network.json`
- 复现脚本：`findings/7387392f17a3/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "requestfailed",
  "resourceType": "xhr",
  "resourceUrl": "https://ql.njmapp.com:5284/",
  "errorText": "net::ERR_CONNECTION_REFUSED",
  "party": "third-party"
}
```

---

### F-0005 · 🟦 资源加载失败：localhost.weixin.qq.com:14019/wx_game_base/api/business

- **类型**：资源加载失败 `resource-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/
- **出现次数**：18
- **首次发现**：2026-10-16T07:51:00.365Z
- **签名**：`117a3af621cd`
- **来源**：signal, requestfailed, third-party

**现象**

```text
net::ERR_CONNECTION_REFUSED — xhr https://localhost.weixin.qq.com:14019/wx_game_base/api/business
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：net::ERR_CONNECTION_REFUSED — xhr https://localhost.weixin.qq.com:14019/wx_game_base/api/business

**证据**

- 截图：`findings/117a3af621cd/screenshot.png`
- DOM 快照：`findings/117a3af621cd/dom.html`
- 控制台日志：`findings/117a3af621cd/console.log`
- 网络记录：`findings/117a3af621cd/network.json`
- 复现脚本：`findings/117a3af621cd/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "requestfailed",
  "resourceType": "xhr",
  "resourceUrl": "https://localhost.weixin.qq.com:14019/wx_game_base/api/business",
  "errorText": "net::ERR_CONNECTION_REFUSED",
  "party": "third-party"
}
```

---

### F-0006 · 🟦 console.error：Access to XMLHttpRequest at 'https://ql.njmapp.com:5283/' from origin 'https://www.huya.com' has been blocked…

- **类型**：控制台 error 输出 `console-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/g/100032
- **出现次数**：8
- **首次发现**：2026-10-16T07:51:09.271Z
- **签名**：`0cdabaf4a75d`
- **来源**：signal, console, third-party

**现象**

```text
Access to XMLHttpRequest at 'https://ql.njmapp.com:5283/' from origin 'https://www.huya.com' has been blocked by CORS policy: Permission was denied for this request to access the `loopback` address space.
```

**复现步骤**

1. 打开 https://www.huya.com/g/100032
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：Access to XMLHttpRequest at 'https://ql.njmapp.com:5283/' from origin 'https://www.huya.com' has been blocked by CORS policy: Permission was denied for this re…

**证据**

- 截图：`findings/0cdabaf4a75d/screenshot.png`
- DOM 快照：`findings/0cdabaf4a75d/dom.html`
- 控制台日志：`findings/0cdabaf4a75d/console.log`
- 网络记录：`findings/0cdabaf4a75d/network.json`
- 复现脚本：`findings/0cdabaf4a75d/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "console",
  "resourceUrl": "https://ql.njmapp.com:5283/",
  "location": {
    "url": "https://www.huya.com/g/100032",
    "line": 0,
    "column": 0,
    "lineNumber": 0,
    "columnNumber": 0
  },
  "party": "third-party"
}
```

---

### F-0007 · 🟦 主线程长任务 281ms

- **类型**：性能劣化 `performance`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/
- **出现次数**：6
- **首次发现**：2026-10-16T07:51:00.363Z
- **签名**：`44f9a05a7a09`
- **来源**：signal, inpage, longtask

**现象**

```text
检测到一次耗时 281ms 的长任务，会造成可感知的卡顿（阈值 250ms）。
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：检测到一次耗时 281ms 的长任务，会造成可感知的卡顿（阈值 250ms）。

**证据**

- 截图：`findings/44f9a05a7a09/screenshot.png`
- DOM 快照：`findings/44f9a05a7a09/dom.html`
- 控制台日志：`findings/44f9a05a7a09/console.log`
- 网络记录：`findings/44f9a05a7a09/network.json`
- 复现脚本：`findings/44f9a05a7a09/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "longtask-observer",
  "durationMs": 281,
  "party": "first-party"
}
```

---

### F-0008 · 🟦 资源加载失败：ql.njmapp.com:5283/

- **类型**：资源加载失败 `resource-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/
- **出现次数**：5
- **首次发现**：2026-10-16T07:51:00.364Z
- **签名**：`b37afc065f83`
- **来源**：signal, requestfailed, third-party

**现象**

```text
net::ERR_FAILED — xhr https://ql.njmapp.com:5283/
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：net::ERR_FAILED — xhr https://ql.njmapp.com:5283/

**证据**

- 截图：`findings/b37afc065f83/screenshot.png`
- DOM 快照：`findings/b37afc065f83/dom.html`
- 控制台日志：`findings/b37afc065f83/console.log`
- 网络记录：`findings/b37afc065f83/network.json`
- 复现脚本：`findings/b37afc065f83/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "requestfailed",
  "resourceType": "xhr",
  "resourceUrl": "https://ql.njmapp.com:5283/",
  "errorText": "net::ERR_FAILED",
  "party": "third-party"
}
```

---

### F-0009 · 🟦 重复的元素 id：#live-0

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/
- **出现次数**：5
- **首次发现**：2026-10-16T07:51:00.397Z
- **签名**：`d4c5d6abe531`
- **来源**：dom-audit, duplicate-id

**现象**

```text
id #live-0 在文档中出现 12 次，会导致 label/aria 关联和选择器行为不确定。
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：id #live-0 在文档中出现 12 次，会导致 label/aria 关联和选择器行为不确定。

**证据**

- 截图：`findings/d4c5d6abe531/screenshot.png`
- DOM 快照：`findings/d4c5d6abe531/dom.html`
- 控制台日志：`findings/d4c5d6abe531/console.log`
- 网络记录：`findings/d4c5d6abe531/network.json`
- 复现脚本：`findings/d4c5d6abe531/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "dom-audit",
  "subtype": "duplicate-id",
  "selector": "#live-0",
  "detail": "出现 12 次",
  "snippet": "",
  "party": "first-party"
}
```

---

### F-0010 · 🟦 资源加载失败：hm.baidu.com/hm.js

- **类型**：资源加载失败 `resource-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/
- **出现次数**：2
- **首次发现**：2026-10-16T07:51:00.364Z
- **签名**：`7b093463f79c`
- **来源**：signal, requestfailed, third-party

**现象**

```text
net::ERR_NAME_NOT_RESOLVED — script https://hm.baidu.com/hm.js?51700b6c722f5bb4cf39906a596ea41f
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：net::ERR_NAME_NOT_RESOLVED — script https://hm.baidu.com/hm.js?51700b6c722f5bb4cf39906a596ea41f

**证据**

- 截图：`findings/7b093463f79c/screenshot.png`
- DOM 快照：`findings/7b093463f79c/dom.html`
- 控制台日志：`findings/7b093463f79c/console.log`
- 网络记录：`findings/7b093463f79c/network.json`
- 复现脚本：`findings/7b093463f79c/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "requestfailed",
  "resourceType": "script",
  "resourceUrl": "https://hm.baidu.com/hm.js?51700b6c722f5bb4cf39906a596ea41f",
  "errorText": "net::ERR_NAME_NOT_RESOLVED",
  "party": "third-party"
}
```

---

### F-0011 · 🟦 console.error：Access to XMLHttpRequest at 'https://ql.njmapp.com:5283/' from origin 'https://www.huya.com' has been blocked…

- **类型**：控制台 error 输出 `console-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/
- **出现次数**：2
- **首次发现**：2026-10-16T07:51:00.364Z
- **签名**：`3b0962266ad7`
- **来源**：signal, console, third-party

**现象**

```text
Access to XMLHttpRequest at 'https://ql.njmapp.com:5283/' from origin 'https://www.huya.com' has been blocked by CORS policy: Permission was denied for this request to access the `loopback` address space.
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：Access to XMLHttpRequest at 'https://ql.njmapp.com:5283/' from origin 'https://www.huya.com' has been blocked by CORS policy: Permission was denied for this re…

**证据**

- 截图：`findings/3b0962266ad7/screenshot.png`
- DOM 快照：`findings/3b0962266ad7/dom.html`
- 控制台日志：`findings/3b0962266ad7/console.log`
- 网络记录：`findings/3b0962266ad7/network.json`
- 复现脚本：`findings/3b0962266ad7/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "console",
  "resourceUrl": "https://ql.njmapp.com:5283/",
  "location": {
    "url": "https://www.huya.com/",
    "line": 0,
    "column": 0,
    "lineNumber": 0,
    "columnNumber": 0
  },
  "party": "third-party"
}
```

---

### F-0012 · 🟦 console.warn：The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. …

- **类型**：控制台 warn 输出 `console-warning`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/m
- **出现次数**：2
- **首次发现**：2026-10-16T07:51:51.263Z
- **签名**：`5c04bae3d5ef`
- **来源**：signal, console

**现象**

```text
The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://developer.chrome.com/blog/autoplay/#web_audio
```

**复现步骤**

1. 打开 https://www.huya.com/m
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture on the page. https://developer.chrome.com/blog/autoplay/#web_au…

**证据**

- 截图：`findings/5c04bae3d5ef/screenshot.png`
- DOM 快照：`findings/5c04bae3d5ef/dom.html`
- 控制台日志：`findings/5c04bae3d5ef/console.log`
- 网络记录：`findings/5c04bae3d5ef/network.json`
- 复现脚本：`findings/5c04bae3d5ef/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/m",
  "title": "赛事直播_电竞赛事直播_游戏赛事直播 - 虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 369,
    "load": 661
  },
  "source": "console",
  "location": {
    "url": "https://a.msstatic.com/huya/h5player/room/homePlayer/202609221711/vplayer.js",
    "line": 2,
    "column": 0,
    "lineNumber": 2,
    "columnNumber": 0
  },
  "party": "first-party"
}
```

---

### F-0013 · 🟦 console.warn：TTP 只能在直播间使用

- **类型**：控制台 warn 输出 `console-warning`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:00.362Z
- **签名**：`a7ef8dd58511`
- **来源**：signal, console

**现象**

```text
TTP 只能在直播间使用
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：TTP 只能在直播间使用

**证据**

- 截图：`findings/a7ef8dd58511/screenshot.png`
- DOM 快照：`findings/a7ef8dd58511/dom.html`
- 控制台日志：`findings/a7ef8dd58511/console.log`
- 网络记录：`findings/a7ef8dd58511/network.json`
- 复现脚本：`findings/a7ef8dd58511/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "console",
  "location": {
    "url": "https://a.msstatic.com/huya/main3/common/headerfunction_9d8ec734.js",
    "line": 1,
    "column": 416442,
    "lineNumber": 1,
    "columnNumber": 416442
  },
  "party": "first-party"
}
```

---

### F-0014 · 🟦 资源加载失败：hm.baidu.com/hm.js

- **类型**：资源加载失败 `resource-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:00.364Z
- **签名**：`4a7fa83900a2`
- **来源**：signal, inpage, third-party

**现象**

```text
<script> 元素加载失败 https://hm.baidu.com/hm.js?51700b6c722f5bb4cf39906a596ea41f
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：<script> 元素加载失败 https://hm.baidu.com/hm.js?51700b6c722f5bb4cf39906a596ea41f

**证据**

- 截图：`findings/4a7fa83900a2/screenshot.png`
- DOM 快照：`findings/4a7fa83900a2/dom.html`
- 控制台日志：`findings/4a7fa83900a2/console.log`
- 网络记录：`findings/4a7fa83900a2/network.json`
- 复现脚本：`findings/4a7fa83900a2/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "inpage",
  "resourceUrl": "https://hm.baidu.com/hm.js?51700b6c722f5bb4cf39906a596ea41f",
  "subtype": "load-failure",
  "party": "third-party"
}
```

---

### F-0015 · 🟦 console.error：Error: timeout

- **类型**：控制台 error 输出 `console-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:00.365Z
- **签名**：`be93003bf53b`
- **来源**：signal, console, third-party

**现象**

```text
Error: timeout
    at https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html:1:9167
    at Generator.throw (<anonymous>)
    at a (https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html:1:7941)
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：Error: timeout
    at https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html:1:9167
    at Generator.throw (<anonymous>)
    a…

**证据**

- 截图：`findings/be93003bf53b/screenshot.png`
- DOM 快照：`findings/be93003bf53b/dom.html`
- 控制台日志：`findings/be93003bf53b/console.log`
- 网络记录：`findings/be93003bf53b/network.json`
- 复现脚本：`findings/be93003bf53b/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "console",
  "resourceUrl": "https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html:1:9167",
  "location": {
    "url": "https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html",
    "line": 0,
    "column": 1252,
    "lineNumber": 0,
    "columnNumber": 1252
  },
  "party": "third-party"
}
```

---

### F-0016 · 🟦 可交互元素缺少可访问名称（4 个元素）

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:00.397Z
- **签名**：`36d8c73ed194`
- **来源**：dom-audit, nameless-control

**现象**

```text
页面上有 4 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat | a.left-banner.clickstat | a.right-banner.clickstat | a.preview-pic-link.clickstat
```

**复现步骤**

1. 打开 https://www.huya.com/
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：页面上有 4 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat | a.left-banner.clickstat | a.right-banner.clickstat | a.preview-pic-link.cl…

**证据**

- 截图：`findings/36d8c73ed194/screenshot.png`
- DOM 快照：`findings/36d8c73ed194/dom.html`
- 控制台日志：`findings/36d8c73ed194/console.log`
- 网络记录：`findings/36d8c73ed194/network.json`
- 复现脚本：`findings/36d8c73ed194/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "dom-audit",
  "subtype": "nameless-control",
  "selector": "button.btn-search.clickstat, a.left-banner.clickstat, a.right-banner.clickstat",
  "detail": "4 个元素",
  "snippet": "button.btn-search.clickstat | a.left-banner.clickstat | a.right-banner.clickstat | a.preview-pic-link.clickstat",
  "party": "first-party"
}
```

---

### F-0017 · 🟦 可交互元素缺少可访问名称（6 个元素）

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/g/100032
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:09.238Z
- **签名**：`bfd87947f476`
- **来源**：dom-audit, nameless-control

**现象**

```text
页面上有 6 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat | a | a.j_bannerItem | a.j_bannerItem | a.j_bannerItem | a.j_bannerItem
```

**复现步骤**

1. 打开 https://www.huya.com/g/100032
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：页面上有 6 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat | a | a.j_bannerItem | a.j_bannerItem | a.j_bannerItem | a.j_bannerItem

**证据**

- 截图：`findings/bfd87947f476/screenshot.png`
- DOM 快照：`findings/bfd87947f476/dom.html`
- 控制台日志：`findings/bfd87947f476/console.log`
- 网络记录：`findings/bfd87947f476/network.json`
- 复现脚本：`findings/bfd87947f476/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "dom-audit",
  "subtype": "nameless-control",
  "selector": "button.btn-search.clickstat, a, a.j_bannerItem",
  "detail": "6 个元素",
  "snippet": "button.btn-search.clickstat | a | a.j_bannerItem | a.j_bannerItem | a.j_bannerItem | a.j_bannerItem",
  "party": "first-party"
}
```

---

### F-0018 · 🟦 console.warn：TTP 只能在直播间使用

- **类型**：控制台 warn 输出 `console-warning`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/g/100032
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:09.271Z
- **签名**：`18551b02ec90`
- **来源**：signal, console

**现象**

```text
TTP 只能在直播间使用
```

**复现步骤**

1. 打开 https://www.huya.com/g/100032
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：TTP 只能在直播间使用

**证据**

- 截图：`findings/18551b02ec90/screenshot.png`
- DOM 快照：`findings/18551b02ec90/dom.html`
- 控制台日志：`findings/18551b02ec90/console.log`
- 网络记录：`findings/18551b02ec90/network.json`
- 复现脚本：`findings/18551b02ec90/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "console",
  "location": {
    "url": "https://a.msstatic.com/huya/main3/common/headerfunction_9d8ec734.js",
    "line": 1,
    "column": 416442,
    "lineNumber": 1,
    "columnNumber": 416442
  },
  "party": "first-party"
}
```

---

### F-0019 · 🟦 console.error：Error: timeout

- **类型**：控制台 error 输出 `console-error`
- **严重级**：低 `low`
- **归属**：第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）
- **位置**：https://www.huya.com/g/100032
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:09.272Z
- **签名**：`7dead1205030`
- **来源**：signal, console, third-party

**现象**

```text
Error: timeout
    at https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html:1:9167
    at Generator.throw (<anonymous>)
    at a (https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html:1:7941)
```

**复现步骤**

1. 打开 https://www.huya.com/g/100032
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：Error: timeout
    at https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html:1:9167
    at Generator.throw (<anonymous>)
    a…

**证据**

- 截图：`findings/7dead1205030/screenshot.png`
- DOM 快照：`findings/7dead1205030/dom.html`
- 控制台日志：`findings/7dead1205030/console.log`
- 网络记录：`findings/7dead1205030/network.json`
- 复现脚本：`findings/7dead1205030/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g/100032",
  "title": "主机游戏直播_主机游戏直播攻略_主机游戏直播专区_虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 872,
    "load": 2474
  },
  "source": "console",
  "resourceUrl": "https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html:1:9167",
  "location": {
    "url": "https://game.weixin.qq.com/cgi-bin/minigame/static/pc-gamesdk-alpha/wxgamesdkframe.html",
    "line": 0,
    "column": 1252,
    "lineNumber": 0,
    "columnNumber": 1252
  },
  "party": "third-party"
}
```

---

### F-0020 · 🟦 可交互元素缺少可访问名称（8 个元素）

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/l
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:22.356Z
- **签名**：`63c9aa0fab85`
- **来源**：dom-audit, nameless-control

**现象**

```text
页面上有 8 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat | a.preview-pic-link.clickstat | a.item-link | a.item-link | a.item-link | a.item-link | a.item-link | a.item-link
```

**复现步骤**

1. 打开 https://www.huya.com/l
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：页面上有 8 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat | a.preview-pic-link.clickstat | a.item-link | a.item-link | a.item-link | a…

**证据**

- 截图：`findings/63c9aa0fab85/screenshot.png`
- DOM 快照：`findings/63c9aa0fab85/dom.html`
- 控制台日志：`findings/63c9aa0fab85/console.log`
- 网络记录：`findings/63c9aa0fab85/network.json`
- 复现脚本：`findings/63c9aa0fab85/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/g",
  "title": "虎牙直播-年轻人喜爱的弹幕式互动直播平台",
  "readyState": "interactive",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 285,
    "load": 0
  },
  "source": "dom-audit",
  "subtype": "nameless-control",
  "selector": "button.btn-search.clickstat, a.preview-pic-link.clickstat, a.item-link",
  "detail": "8 个元素",
  "snippet": "button.btn-search.clickstat | a.preview-pic-link.clickstat | a.item-link | a.item-link | a.item-link | a.item-link | a.item-link | a.item-link",
  "party": "first-party"
}
```

---

### F-0021 · 🟦 可交互元素缺少可访问名称（1 个元素）

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/g
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:33.155Z
- **签名**：`f6e6e4b5525f`
- **来源**：dom-audit, nameless-control

**现象**

```text
页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat
```

**复现步骤**

1. 打开 https://www.huya.com/g
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat

**证据**

- 截图：`findings/f6e6e4b5525f/screenshot.png`
- DOM 快照：`findings/f6e6e4b5525f/dom.html`
- 控制台日志：`findings/f6e6e4b5525f/console.log`
- 网络记录：`findings/f6e6e4b5525f/network.json`
- 复现脚本：`findings/f6e6e4b5525f/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/m",
  "title": "赛事直播_电竞赛事直播_游戏赛事直播 - 虎牙直播",
  "readyState": "interactive",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 730,
    "load": 0
  },
  "source": "dom-audit",
  "subtype": "nameless-control",
  "selector": "button.btn-search.clickstat",
  "detail": "1 个元素",
  "snippet": "button.btn-search.clickstat",
  "party": "first-party"
}
```

---

### F-0022 · 🟦 可交互元素缺少可访问名称（1 个元素）

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/m
- **出现次数**：1
- **首次发现**：2026-10-16T07:51:51.274Z
- **签名**：`c4852d82da05`
- **来源**：dom-audit, nameless-control

**现象**

```text
页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat
```

**复现步骤**

1. 打开 https://www.huya.com/m
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat

**证据**

- 截图：`findings/c4852d82da05/screenshot.png`
- DOM 快照：`findings/c4852d82da05/dom.html`
- 控制台日志：`findings/c4852d82da05/console.log`
- 网络记录：`findings/c4852d82da05/network.json`
- 复现脚本：`findings/c4852d82da05/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/m",
  "title": "赛事直播_电竞赛事直播_游戏赛事直播 - 虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 369,
    "load": 661
  },
  "source": "dom-audit",
  "subtype": "nameless-control",
  "selector": "button.btn-search.clickstat",
  "detail": "1 个元素",
  "snippet": "button.btn-search.clickstat",
  "party": "first-party"
}
```

---

### F-0023 · 🟦 可交互元素缺少可访问名称（1 个元素）

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/g_ol
- **出现次数**：1
- **首次发现**：2026-10-16T07:52:22.655Z
- **签名**：`723527950083`
- **来源**：dom-audit, nameless-control

**现象**

```text
页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat
```

**复现步骤**

1. 打开 https://www.huya.com/g_ol
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat

**证据**

- 截图：`findings/723527950083/screenshot.png`
- DOM 快照：`findings/723527950083/dom.html`
- 控制台日志：`findings/723527950083/console.log`
- 网络记录：`findings/723527950083/network.json`
- 复现脚本：`findings/723527950083/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/m",
  "title": "赛事直播_电竞赛事直播_游戏赛事直播 - 虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 450,
    "load": 1918
  },
  "source": "dom-audit",
  "subtype": "nameless-control",
  "selector": "button.btn-search.clickstat",
  "detail": "1 个元素",
  "snippet": "button.btn-search.clickstat",
  "party": "first-party"
}
```

---

### F-0024 · 🟦 可交互元素缺少可访问名称（1 个元素）

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/g_pc
- **出现次数**：1
- **首次发现**：2026-10-16T07:53:40.816Z
- **签名**：`77dda417c430`
- **来源**：dom-audit, nameless-control

**现象**

```text
页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat
```

**复现步骤**

1. 打开 https://www.huya.com/g_pc
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat

**证据**

- 截图：`findings/77dda417c430/screenshot.png`
- DOM 快照：`findings/77dda417c430/dom.html`
- 控制台日志：`findings/77dda417c430/console.log`
- 网络记录：`findings/77dda417c430/network.json`
- 复现脚本：`findings/77dda417c430/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/m",
  "title": "赛事直播_电竞赛事直播_游戏赛事直播 - 虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 416,
    "load": 890
  },
  "source": "dom-audit",
  "subtype": "nameless-control",
  "selector": "button.btn-search.clickstat",
  "detail": "1 个元素",
  "snippet": "button.btn-search.clickstat",
  "party": "first-party"
}
```

---

### F-0025 · 🟦 可交互元素缺少可访问名称（1 个元素）

- **类型**：DOM 异常 `dom-anomaly`
- **严重级**：低 `low`
- **归属**：第一方（被测站点自身）
- **位置**：https://www.huya.com/g_yl
- **出现次数**：1
- **首次发现**：2026-10-16T07:55:10.139Z
- **签名**：`77fb05773d4b`
- **来源**：dom-audit, nameless-control

**现象**

```text
页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat
```

**复现步骤**

1. 打开 https://www.huya.com/g_yl
2. 将 window 滚动到 top
3. 悬停 #hy-nav-category
4. 将 li.g-gameCard-item:nth-of-type(37) > a.g-gameCard-link 滚动到 middle
5. 将 a.nav-item--UdfNzw8I7o4KWF3OPzCc:nth-of-type(5) 滚动到 bottom
6. 将 li.g-gameCard-item:nth-of-type(10) > a.g-gameCard-link 滚动到 middle
7. 悬停 body
8. 将 window 滚动到 bottom
9. 将 window 滚动到 middle
10. 将 window 滚动到 top
11. 点击 #hy-nav-category（分类）
12. 点击 #hy-nav-match（赛事）
13. 点击 #J_hyHdNavItemGame（#J_hyHdNavItemGame）
14. 点击 #J_hyHdNavItemShop（#J_hyHdNavItemShop）
15. 点击 .game-live-item（.game-live-item）
16. 点击 .hy-nav-link-onlineGame（.hy-nav-link-onlineGame）
17. 点击 a.hy-nav-link.hy-nav-link-shop（卖号）
18. 点击 button.btn-search.clickstat
19. 在 #search-bar-input 输入 "英雄联盟"
20. 提交表单 #search-bar-input
21. 将 window 滚动到 bottom
22. 将 window 滚动到 top
23. → 观察到：页面上有 1 个元素 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：button.btn-search.clickstat

**证据**

- 截图：`findings/77fb05773d4b/screenshot.png`
- DOM 快照：`findings/77fb05773d4b/dom.html`
- 控制台日志：`findings/77fb05773d4b/console.log`
- 网络记录：`findings/77fb05773d4b/network.json`
- 复现脚本：`findings/77fb05773d4b/repro.spec.mjs`

**上下文**

```json
{
  "href": "https://www.huya.com/m",
  "title": "赛事直播_电竞赛事直播_游戏赛事直播 - 虎牙直播",
  "readyState": "complete",
  "viewport": "1440x900",
  "scroll": "0,0",
  "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
  "lang": "zh-CN",
  "online": true,
  "perf": {
    "domContentLoaded": 433,
    "load": 706
  },
  "source": "dom-audit",
  "subtype": "nameless-control",
  "selector": "button.btn-search.clickstat",
  "detail": "1 个元素",
  "snippet": "button.btn-search.clickstat",
  "party": "first-party"
}
```

---

## 四、覆盖范围

- 已访问页面：7
- 已发现链接：7
- 跳过链接：15

<details><summary>已访问页面列表</summary>

- https://www.huya.com/
- https://www.huya.com/l
- https://www.huya.com/g
- https://www.huya.com/m
- https://www.huya.com/g_ol
- https://www.huya.com/g_pc
- https://www.huya.com/g_yl

</details>

### 断言结果

| 断言 | 类型 | 结果 | 详情 |
| --- | --- | --- | --- |
| page-not-blank | function | ✅ 通过 | 表达式求值 = true |
| search-input-present | selector | ✅ 通过 | 匹配 1 个元素 |
| header-nav-present | selector | ✅ 通过 | 匹配 1 个元素 |
| live-list-rendered | selector | ✅ 通过 | 匹配 65 个元素 |
| footer-present | selector | ✅ 通过 | 匹配 1 个元素 |
| no-error-page | not-selector | ✅ 通过 | 匹配 0 个元素（期望 0） |
| page-not-blank | function | ✅ 通过 | 表达式求值 = true |
| no-error-page | not-selector | ✅ 通过 | 匹配 0 个元素（期望 0） |
| page-not-blank | function | ✅ 通过 | 表达式求值 = true |
| no-error-page | not-selector | ✅ 通过 | 匹配 0 个元素（期望 0） |
| page-not-blank | function | ✅ 通过 | 表达式求值 = true |
| no-error-page | not-selector | ✅ 通过 | 匹配 0 个元素（期望 0） |
| page-not-blank | function | ✅ 通过 | 表达式求值 = true |
| no-error-page | not-selector | ✅ 通过 | 匹配 0 个元素（期望 0） |
| page-not-blank | function | ✅ 通过 | 表达式求值 = true |
| no-error-page | not-selector | ✅ 通过 | 匹配 0 个元素（期望 0） |
| page-not-blank | function | ✅ 通过 | 表达式求值 = true |
| no-error-page | not-selector | ✅ 通过 | 匹配 0 个元素（期望 0） |
| page-not-blank | function | ✅ 通过 | 表达式求值 = true |
| no-error-page | not-selector | ✅ 通过 | 匹配 0 个元素（期望 0） |

## 五、运行录像

- 录像文件：`artifacts/video/run-20261016-155046-huya-live.mp4`

---

_本报告由 WebProbe 浏览器端动态软件测试平台 自动生成。复现命令：_

```bash
node code/src/cli.mjs run --target "D:\qq\File\FileRecv\ds_work\code\targets\huya-live" --seed 20261016
```
