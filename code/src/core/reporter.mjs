/**
 * Reporting: the platform's *output*.
 *
 * Every run leaves a self-describing directory:
 *
 *   runs/<runId>/
 *     report.json      machine-readable, the source of truth for the dashboard
 *     report.md        a review-ready summary (paste into an issue tracker)
 *     report.html      a standalone, offline-viewable report with screenshots
 *     bugs.json        just the findings, for CI consumption
 *     artifacts/       screenshots, DOM snapshots, console logs, repro scripts
 *     video/<runId>.mp4 the recording of the run
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { PLATFORM, SEVERITY_LABEL, SEVERITY_ORDER } from './schema.mjs';
import { RUNS_DIR, ensureDir, exists, formatDuration, readJson, writeJson } from './util.mjs';

const SEV_EMOJI = { critical: '🟥', high: '🟧', medium: '🟨', low: '🟦', info: '⬜' };

export async function writeReportFiles(report, { runDir, artifactsDir, logger, target }) {
  await ensureDir(runDir);

  await writeJson(path.join(runDir, 'report.json'), report);
  await writeJson(path.join(runDir, 'bugs.json'), {
    runId: report.runId,
    target: report.target,
    generatedAt: report.finishedAt,
    stats: report.stats,
    findings: report.findings,
  });

  await fsp.writeFile(path.join(runDir, 'report.md'), renderMarkdown(report), 'utf8');
  await fsp.writeFile(path.join(runDir, 'report.html'), renderHtml(report), 'utf8');

  logger?.debug?.(`报告已写入 ${runDir}`);
  return runDir;
}

/* ---------------------------------------------------------------- markdown */

export function renderMarkdown(report) {
  const f = report.findings || [];
  const lines = [];
  lines.push(`# ${report.target.name} — 软件测试报告`);
  lines.push('');
  lines.push(`> 由 **${PLATFORM.displayName} v${PLATFORM.version}** 自动生成`);
  lines.push('');
  lines.push('| 项目 | 值 |');
  lines.push('| --- | --- |');
  lines.push(`| 运行 ID | \`${report.runId}\` |`);
  lines.push(`| 被测目标 | ${report.target.name}（${report.target.kind}） |`);
  lines.push(`| 入口地址 | ${report.target.url} |`);
  lines.push(`| 目标目录 | \`${report.target.dir}\` |`);
  lines.push(`| 浏览器 | ${report.browser?.channel || 'chromium'} ${report.browser?.version || ''} · ${report.browser?.strategy || ''} |`);
  lines.push(`| 开始时间 | ${report.startedAt} |`);
  lines.push(`| 结束时间 | ${report.finishedAt} |`);
  lines.push(`| 耗时 | ${formatDuration(report.durationMs)} |`);
  lines.push(`| 随机种子 | \`${report.config?.seed}\`（相同种子可复现本次执行序列） |`);
  lines.push('');

  lines.push('## 一、执行概况');
  lines.push('');
  lines.push('| 指标 | 数量 |');
  lines.push('| --- | --- |');
  lines.push(`| 访问页面 | ${report.stats.pagesVisited} |`);
  lines.push(`| 执行动作 | ${report.stats.actionsExecuted} |`);
  lines.push(`| 网络请求 | ${report.stats.requests} |`);
  lines.push(`| 失败请求 | ${report.stats.failedRequests} |`);
  lines.push(`| 控制台消息 | ${report.stats.consoleMessages} |`);
  lines.push(`| 新标签页 | ${report.popups?.audited ?? 0} 个已审计 / ${report.popups?.skipped ?? 0} 个按 URL 策略跳过 |`);
  lines.push(`| **发现缺陷** | **${report.findings.length}** |`);
  if (report.stats.firstPartyFindings != null || report.stats.thirdPartyFindings != null) {
    lines.push(`| 其中：第一方（被测站点自身） | ${report.stats.firstPartyFindings ?? 0} |`);
    lines.push(`| 其中：第三方（内嵌的广告/统计/支付等） | ${report.stats.thirdPartyFindings ?? 0} |`);
  }
  lines.push('');

  if (report.findings.length) {
    lines.push('### 缺陷严重级分布');
    lines.push('');
    lines.push('| 严重级 | 数量 |');
    lines.push('| --- | --- |');
    for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
      if (report.stats.bySeverity?.[sev]) {
        lines.push(`| ${SEV_EMOJI[sev]} ${SEVERITY_LABEL[sev]} (${sev}) | ${report.stats.bySeverity[sev]} |`);
      }
    }
    lines.push('');
    lines.push('### 缺陷类型分布');
    lines.push('');
    lines.push('| 类型 | 数量 |');
    lines.push('| --- | --- |');
    for (const [kind, n] of Object.entries(report.stats.byKind || {})) {
      lines.push(`| ${report.findings.find((x) => x.kind === kind)?.kindLabel || kind} (\`${kind}\`) | ${n} |`);
    }
    lines.push('');
  }

  lines.push('## 二、缺陷清单');
  lines.push('');
  if (!f.length) {
    lines.push('本次动态测试**未发现缺陷**。');
    lines.push('');
  } else {
    lines.push('| # | 严重级 | 类型 | 标题 | 归属 | 次数 | 位置 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const x of f) {
      const party = x.party === 'third-party' ? '第三方' : x.party === 'first-party' ? '第一方' : '—';
      lines.push(`| ${x.id} | ${SEV_EMOJI[x.severity]} ${SEVERITY_LABEL[x.severity]} | ${x.kindLabel} | ${escapeMd(x.title)} | ${party} | ${x.occurrences} | ${escapeMd(shorten(x.url, 60))} |`);
    }
    lines.push('');

    lines.push('## 三、缺陷详情');
    lines.push('');
    for (const x of f) {
      lines.push(`### ${x.id} · ${SEV_EMOJI[x.severity]} ${x.title}`);
      lines.push('');
      lines.push(`- **类型**：${x.kindLabel} \`${x.kind}\``);
      lines.push(`- **严重级**：${SEVERITY_LABEL[x.severity]} \`${x.severity}\``);
      lines.push(`- **归属**：${x.party === 'third-party' ? '第三方（内嵌的广告/统计/支付等，通常不由被测站点直接控制）' : x.party === 'first-party' ? '第一方（被测站点自身）' : '未判定'}`);
      lines.push(`- **位置**：${x.url || '—'}`);
      lines.push(`- **出现次数**：${x.occurrences}`);
      lines.push(`- **首次发现**：${x.firstSeenAt}`);
      lines.push(`- **签名**：\`${x.signature}\`${x.known ? '（历史已知）' : ''}`);
      if (x.tags?.length) lines.push(`- **来源**：${x.tags.join(', ')}`);
      lines.push('');
      lines.push('**现象**');
      lines.push('');
      lines.push('```text');
      lines.push(String(x.message || '').slice(0, 2000));
      lines.push('```');
      lines.push('');
      if (x.stack?.length) {
        lines.push('**调用栈**');
        lines.push('');
        lines.push('```text');
        lines.push(x.stack.join('\n').slice(0, 3000));
        lines.push('```');
        lines.push('');
      }
      if (x.repro?.steps?.length) {
        lines.push('**复现步骤**');
        lines.push('');
        x.repro.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
        lines.push('');
      }
      const ev = x.evidence || {};
      const evLines = [];
      if (ev.screenshots?.length) evLines.push(`- 截图：${ev.screenshots.map((s) => `\`${s}\``).join('、')}`);
      if (ev.domSnapshot) evLines.push(`- DOM 快照：\`${ev.domSnapshot}\``);
      if (ev.consoleLog) evLines.push(`- 控制台日志：\`${ev.consoleLog}\``);
      if (ev.network) evLines.push(`- 网络记录：\`${ev.network}\``);
      if (ev.reproScript) evLines.push(`- 复现脚本：\`${ev.reproScript}\``);
      if (ev.video) evLines.push(`- 录像：\`${ev.video}\``);
      if (evLines.length) {
        lines.push('**证据**');
        lines.push('');
        lines.push(...evLines);
        lines.push('');
      }
      if (x.context && Object.keys(x.context).length) {
        lines.push('**上下文**');
        lines.push('');
        lines.push('```json');
        lines.push(JSON.stringify(x.context, null, 2).slice(0, 1500));
        lines.push('```');
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('## 四、覆盖范围');
  lines.push('');
  const cov = report.coverage || {};
  lines.push(`- 已访问页面：${(cov.visited || []).length}`);
  lines.push(`- 已发现链接：${(cov.discovered || []).length}`);
  lines.push(`- 跳过链接：${(cov.skipped || []).length}`);
  lines.push('');
  if (cov.visited?.length) {
    lines.push('<details><summary>已访问页面列表</summary>');
    lines.push('');
    for (const u of cov.visited.slice(0, 200)) lines.push(`- ${u}`);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }
  if (cov.assertions?.length) {
    lines.push('### 断言结果');
    lines.push('');
    lines.push('| 断言 | 类型 | 结果 | 详情 |');
    lines.push('| --- | --- | --- | --- |');
    for (const a of cov.assertions) {
      lines.push(`| ${a.id || '—'} | ${a.kind} | ${a.ok ? '✅ 通过' : '❌ 未通过'} | ${escapeMd(shorten(a.detail, 70))} |`);
    }
    lines.push('');
  }

  if (report.video || report.videoNote) {
    lines.push('## 五、运行录像');
    lines.push('');
    if (report.video) lines.push(`- 录像文件：\`${report.video}\``);
    if (report.videoNote) lines.push(`- 说明：${report.videoNote}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_本报告由 ${PLATFORM.displayName} 自动生成。复现命令：_`);
  lines.push('');
  lines.push('```bash');
  lines.push(`node code/src/cli.mjs run --target "${report.target.dir}" --seed ${report.config?.seed}`);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

/* -------------------------------------------------------------------- html */

export function renderHtml(report) {
  const f = report.findings || [];
  const sevBar = ['critical', 'high', 'medium', 'low', 'info']
    .filter((s) => report.stats.bySeverity?.[s])
    .map((s) => `<span class="pill ${s}">${SEVERITY_LABEL[s]} ${report.stats.bySeverity[s]}</span>`)
    .join('');

  const cards = f.map((x) => {
    const ev = x.evidence || {};
    // Evidence paths are relative to the run's artifacts/ directory; this HTML
    // lives one level up in the run directory.
    const art = (relPath) => `artifacts/${String(relPath).split('/').map(encodeURIComponent).join('/')}`;
    const shots = (ev.screenshots || []).map(
      (s) => `<a href="${art(s)}" target="_blank"><img src="${art(s)}" alt="截图" loading="lazy"></a>`,
    ).join('');
    const links = [
      ev.domSnapshot && `<a href="${art(ev.domSnapshot)}" target="_blank">DOM 快照</a>`,
      ev.consoleLog && `<a href="${art(ev.consoleLog)}" target="_blank">控制台日志</a>`,
      ev.network && `<a href="${art(ev.network)}" target="_blank">网络记录</a>`,
      ev.reproScript && `<a href="${art(ev.reproScript)}" target="_blank">复现脚本</a>`,
      ev.context && `<a href="${art(ev.context)}" target="_blank">页面上下文</a>`,
      ev.video && `<a href="${art(ev.video)}" target="_blank">运行录像</a>`,
    ].filter(Boolean).join(' · ');

    return `
    <article class="finding ${x.severity}" id="${x.id}">
      <header>
        <span class="badge ${x.severity}">${SEVERITY_LABEL[x.severity]}</span>
        <span class="id">${x.id}</span>
        <h3>${escapeHtml(x.title)}</h3>
        <span class="count">×${x.occurrences}</span>
      </header>
      <div class="meta">
        <span class="kind">${escapeHtml(x.kindLabel)} <code>${x.kind}</code></span>
        ${x.known ? '<span class="known">历史已知</span>' : ''}
        ${x.party === 'third-party' ? '<span class="known third">第三方组件</span>' : ''}
        ${x.url ? `<a class="url" href="${escapeHtml(x.url)}" target="_blank">${escapeHtml(shorten(x.url, 90))}</a>` : ''}
      </div>
      <pre class="msg">${escapeHtml(String(x.message || ''))}</pre>
      ${x.stack?.length ? `<details><summary>调用栈（${x.stack.length} 行）</summary><pre class="stack">${escapeHtml(x.stack.join('\n'))}</pre></details>` : ''}
      ${x.repro?.steps?.length ? `<details open><summary>复现步骤</summary><ol class="steps">${x.repro.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol></details>` : ''}
      ${shots ? `<div class="shots">${shots}</div>` : ''}
      ${links ? `<div class="links">${links}</div>` : ''}
      ${x.context && Object.keys(x.context).length ? `<details><summary>上下文</summary><pre class="ctx">${escapeHtml(JSON.stringify(x.context, null, 2))}</pre></details>` : ''}
      <footer>签名 <code>${x.signature}</code> · 首次发现 ${escapeHtml(x.firstSeenAt)}</footer>
    </article>`;
  }).join('\n');

  const timeline = (report.timeline || []).slice(0, 400).map(
    (t) => `<li><time>${escapeHtml(t.t.slice(11, 19))}</time><span class="ttype">${escapeHtml(t.type)}</span>${escapeHtml(t.message)}</li>`,
  ).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.target.name)} — 软件测试报告 · ${report.runId}</title>
<style>
  :root {
    --bg: #0f1115; --panel: #171a21; --panel2: #1d2129; --line: #2a2f3a;
    --fg: #e6e9ef; --dim: #9aa3b2; --accent: #4a9eff;
    --critical: #ff4d4f; --high: #ff7a45; --medium: #ffc53d; --low: #69b1ff; --info: #8c8c8c;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
    font: 14px/1.6 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 32px 20px 80px; }
  h1 { font-size: 26px; margin: 0 0 6px; }
  h2 { font-size: 18px; margin: 36px 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
  .sub { color: var(--dim); margin-bottom: 22px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
  .card .k { color: var(--dim); font-size: 12px; letter-spacing: .04em; }
  .card .v { font-size: 24px; font-weight: 600; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { background: var(--panel2); color: var(--dim); font-weight: 600; font-size: 12px; }
  tr:last-child td { border-bottom: none; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code, pre { font-family: "Cascadia Mono", Consolas, monospace; }
  code { background: #0b0d11; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
  pre { background: #0b0d11; border: 1px solid var(--line); border-radius: 8px; padding: 12px; overflow: auto; font-size: 12.5px; }
  .pill, .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pill.critical, .badge.critical { background: rgba(255,77,79,.16); color: var(--critical); }
  .pill.high, .badge.high { background: rgba(255,122,69,.16); color: var(--high); }
  .pill.medium, .badge.medium { background: rgba(255,197,61,.16); color: var(--medium); }
  .pill.low, .badge.low { background: rgba(105,177,255,.16); color: var(--low); }
  .pill.info, .badge.info { background: rgba(140,140,140,.16); color: var(--info); }
  .pills { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 4px; }
  .finding { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--line);
    border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; }
  .finding.critical { border-left-color: var(--critical); }
  .finding.high { border-left-color: var(--high); }
  .finding.medium { border-left-color: var(--medium); }
  .finding.low { border-left-color: var(--low); }
  .finding header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .finding h3 { margin: 0; font-size: 15.5px; flex: 1 1 320px; }
  .finding .id { color: var(--dim); font-family: monospace; font-size: 12px; }
  .finding .count { color: var(--dim); font-size: 12px; }
  .finding .meta { color: var(--dim); font-size: 12.5px; margin: 8px 0; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .finding .known { background: rgba(74,158,255,.14); color: var(--accent); padding: 1px 7px; border-radius: 999px; font-size: 11.5px; }
  .finding .known.third { background: rgba(140,140,140,.16); color: var(--dim); }
  .msg { white-space: pre-wrap; word-break: break-word; }
  details { margin: 8px 0; }
  summary { cursor: pointer; color: var(--dim); font-size: 12.5px; }
  ol.steps { margin: 6px 0 0; padding-left: 22px; }
  ol.steps li { margin: 2px 0; }
  .shots { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
  .shots img { max-width: 300px; border: 1px solid var(--line); border-radius: 8px; display: block; }
  .links { margin-top: 10px; font-size: 12.5px; }
  .finding footer { color: var(--dim); font-size: 11.5px; margin-top: 10px; }
  ul.timeline { list-style: none; padding: 0; max-height: 420px; overflow: auto; background: var(--panel);
    border: 1px solid var(--line); border-radius: 10px; }
  ul.timeline li { padding: 5px 12px; border-bottom: 1px solid #20242c; font-size: 12.5px; }
  ul.timeline time { color: var(--dim); font-family: monospace; margin-right: 8px; }
  ul.timeline .ttype { display: inline-block; min-width: 74px; color: var(--accent); font-size: 11.5px; }
  .empty { background: rgba(82,196,26,.1); border: 1px solid rgba(82,196,26,.3); color: #95de64;
    padding: 16px 18px; border-radius: 10px; }
  details.cover summary { font-size: 14px; color: var(--fg); }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(report.target.name)} — 软件测试报告</h1>
  <div class="sub">
    ${PLATFORM.displayName} v${PLATFORM.version} · 运行 <code>${escapeHtml(report.runId)}</code> ·
    ${escapeHtml(report.startedAt)} → ${escapeHtml(report.finishedAt || '')} · 耗时 ${formatDuration(report.durationMs)}
  </div>

  <div class="grid">
    <div class="card"><div class="k">发现缺陷</div><div class="v">${report.findings.length}</div></div>
    <div class="card"><div class="k">访问页面</div><div class="v">${report.stats.pagesVisited}</div></div>
    <div class="card"><div class="k">执行动作</div><div class="v">${report.stats.actionsExecuted}</div></div>
    <div class="card"><div class="k">网络请求</div><div class="v">${report.stats.requests}</div></div>
    <div class="card"><div class="k">失败请求</div><div class="v">${report.stats.failedRequests}</div></div>
    <div class="card"><div class="k">控制台消息</div><div class="v">${report.stats.consoleMessages}</div></div>
  </div>
  <div class="pills">${sevBar || '<span class="pill info">无缺陷</span>'}</div>

  <h2>被测目标</h2>
  <table>
    <tr><th style="width:180px">入口地址</th><td><a href="${escapeHtml(report.target.url)}" target="_blank">${escapeHtml(report.target.url)}</a></td></tr>
    <tr><th>目标目录</th><td><code>${escapeHtml(report.target.dir)}</code></td></tr>
    <tr><th>类型</th><td>${escapeHtml(report.target.kind)}</td></tr>
    <tr><th>浏览器</th><td>${escapeHtml(report.browser?.channel || 'chromium')} ${escapeHtml(report.browser?.version || '')} · 启动方式 ${escapeHtml(report.browser?.strategy || '')} · 视口 ${escapeHtml(String(report.config?.viewport?.width))}×${escapeHtml(String(report.config?.viewport?.height))}</td></tr>
    <tr><th>随机种子</th><td><code>${escapeHtml(String(report.config?.seed))}</code> — 使用相同种子可复现本次执行序列</td></tr>
    ${report.video ? `<tr><th>运行录像</th><td><a href="${escapeHtml(report.video)}" target="_blank">${escapeHtml(report.video)}</a></td></tr>` : ''}
    ${report.videoNote ? `<tr><th>录像说明</th><td>${escapeHtml(report.videoNote)}</td></tr>` : ''}
  </table>

  <h2>缺陷清单</h2>
  ${f.length ? `<table>
    <thead><tr><th style="width:56px">编号</th><th style="width:76px">严重级</th><th style="width:140px">类型</th><th>标题</th><th style="width:56px">次数</th></tr></thead>
    <tbody>
    ${f.map((x) => `<tr>
      <td><a href="#${x.id}">${x.id}</a></td>
      <td><span class="badge ${x.severity}">${SEVERITY_LABEL[x.severity]}</span></td>
      <td>${escapeHtml(x.kindLabel)}</td>
      <td><a href="#${x.id}">${escapeHtml(shorten(x.title, 110))}</a></td>
      <td>${x.occurrences}</td>
    </tr>`).join('')}
    </tbody></table>` : '<div class="empty">✅ 本次动态测试未发现缺陷。</div>'}

  <h2>缺陷详情</h2>
  ${cards || '<p style="color:var(--dim)">无。</p>'}

  <h2>覆盖范围</h2>
  <div class="grid">
    <div class="card"><div class="k">已访问页面</div><div class="v">${(report.coverage?.visited || []).length}</div></div>
    <div class="card"><div class="k">已发现链接</div><div class="v">${(report.coverage?.discovered || []).length}</div></div>
    <div class="card"><div class="k">跳过链接</div><div class="v">${(report.coverage?.skipped || []).length}</div></div>
  </div>
  ${(report.coverage?.assertions || []).length ? `
  <h3 style="font-size:15px;margin-top:22px">断言结果</h3>
  <table>
    <thead><tr><th>断言</th><th style="width:90px">类型</th><th style="width:100px">结果</th><th>详情</th></tr></thead>
    <tbody>${report.coverage.assertions.map((a) => `<tr>
      <td><code>${escapeHtml(a.id || '—')}</code></td><td>${escapeHtml(a.kind)}</td>
      <td>${a.ok ? '✅ 通过' : '❌ 未通过'}</td><td>${escapeHtml(shorten(a.detail, 90))}</td></tr>`).join('')}
    </tbody>
  </table>` : ''}

  <h2>执行时间线</h2>
  <details class="cover" open><summary>展开/收起（最近 ${(report.timeline || []).length} 条）</summary>
    <ul class="timeline">${timeline}</ul>
  </details>

  <h2>复现整轮测试</h2>
  <pre>node code/src/cli.mjs run --target "${escapeHtml(report.target.dir)}" --seed ${escapeHtml(String(report.config?.seed))}</pre>
</div>
</body>
</html>`;
}

/* --------------------------------------------------------------- run index */

/** All runs on disk, newest first — used by the dashboard and the CLI. */
export async function listRuns(root = RUNS_DIR) {
  let entries = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const runs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(root, e.name, 'report.json');
    if (!exists(file)) continue;
    try {
      const r = await readJson(file);
      runs.push({
        runId: r.runId ?? e.name,
        targetId: r.target?.id ?? '',
        targetName: r.target?.name ?? '',
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs: r.durationMs,
        stats: r.stats ?? {},
        video: r.video ?? null,
      });
    } catch { /* skip an unreadable run */ }
  }
  return runs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

export async function readRunReport(runId, root = RUNS_DIR) {
  const file = path.join(root, runId, 'report.json');
  if (!exists(file)) return null;
  return readJson(file);
}

/** Signatures seen in earlier runs, so the engine can flag regressions. */
export async function collectKnownSignatures(root = RUNS_DIR, { limit = 30 } = {}) {
  const runs = await listRuns(root);
  const set = new Set();
  for (const r of runs.slice(0, limit)) {
    try {
      const full = await readRunReport(r.runId, root);
      for (const f of full?.findings ?? []) set.add(f.signature);
    } catch { /* ignore */ }
  }
  return set;
}

/* ------------------------------------------------------------------ helpers */

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function escapeMd(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200);
}

function shorten(s, n) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export { SEVERITY_ORDER };
