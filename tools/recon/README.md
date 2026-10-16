# tools/recon/ — 需求读取与环境侦察期的调查脚本

这些不是平台的运行时代码，而是**开发过程中用来搞清楚"环境和目标长什么样"的一次性脚本**。
保留它们是为了让 `prompt/01-requirements.md` 和 `prompt/02-recon-and-design.md`
里描述的每一步都有可复核的依据。

| 脚本 | 作用 | 当时得到了什么 |
| --- | --- | --- |
| `pdf2txt.py` | 零依赖 PDF 文本抽取器（解析对象图 + `/Contents` + `/ToUnicode` CMap，并按文本矩阵 y 坐标还原行） | 从 `软件安全小项目.pdf` 中抽出三页需求原文 |
| `probe_net.mjs` | 用 Node `fetch` 探测各主机可达性 | **只有 Node 这个运行时能上网**：`registry.npmmirror.com`、`huya.com` 均 200，而 PowerShell / curl 全部失败 |
| `probe_browser.mjs` | 用**免管道**方式（`stdio: ['ignore', fd, fd]`）尝试拉起 Chrome / Edge，并输出到日志文件 | 定位到 `mojo\public\cpp\platform\platform_channel.cc:187 Check failed: 拒绝访问` —— **Chromium 的进程间通信依赖命名管道，被禁则无法启动** |
| `probe_cdp.mjs` | 免管道拉起浏览器后，用 `connectOverCDP()` 附着并试访问虎牙、抓控制台事件 | 验证了 CDP 附着链路本身可用（该方案后被保留为平台的 `--strategy cdp`） |
| `probe_huya.mjs` | 抓取虎牙首页 HTML，统计脚本/iframe/图片数量，列出元素 id 与地标 class | 得到导航、搜索框、直播间列表等真实结构 |
| `probe_huya_selectors.mjs` | 逐个校验打算使用的选择器是否真的存在于 HTML 中 | 全部命中后才写 `code/targets/huya-live/target.json`（**不靠猜选择器**） |

运行方式（Python 用仓库自带运行时即可）：

```bash
node tools/recon/probe_net.mjs
node tools/recon/probe_huya_selectors.mjs
python tools/recon/pdf2txt.py <某个.pdf>
```
