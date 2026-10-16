/*!
 * WebProbe 控制台前端 — 零依赖（无框架 / 无构建步骤 / 无 CDN / 无 import）。
 * 数据来自同源 JSON API（见 README.md）；被测站点产出的字符串一律经 textContent 或 esc() 才进 DOM。
 */
(function () {
  'use strict';
  /* ====================================================== 常量 */
  // 严重级优先级，与 code/src/core/schema.mjs 的 SEVERITY_ORDER 一致。
  const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
  const SEVERITY_LABEL = { critical: '严重', high: '高', medium: '中', low: '低', info: '提示' };
  // kind 的中文兜底标签；后端给了 finding.kindLabel 时优先用后端的。
  const KIND_LABEL = {
    'page-crash': '渲染进程崩溃', 'unresponsive': '主线程卡死', 'js-exception': '未捕获 JS 异常',
    'unhandled-rejection': '未处理的 Promise 拒绝', 'http-error': '接口 HTTP 错误', 'console-error': '控制台 error 输出',
    'resource-error': '资源加载失败', 'assertion': '断言不通过', 'dom-anomaly': 'DOM 异常',
    'security': '安全配置问题', 'performance': '性能劣化', 'console-warning': '控制台 warn 输出',
  };
  // 环形图配色（与严重级配色区分）。
  const KIND_COLORS = ['#4c8bf5', '#e8593a', '#e0a020', '#8b6cf0', '#3fb98a', '#d2649a',
    '#5b7c99', '#c9a227', '#6f9bd1', '#a35f4a', '#7a8ba0', '#4aa3a3'];
  const SORT_DEFAULT_DIR = { severity: 'asc', kind: 'asc', occurrences: 'desc', firstSeenAt: 'desc' };
  const POLL_INTERVAL_MS = 2000;           // 运行中每 2s 轮询 /api/runs
  const POLL_TIMEOUT_MS = 20 * 60 * 1000;  // 轮询上限，超过则停止并提示
  // API 路径集中定义，与 Node 服务器暴露的路由一一对应。
  const API = {
    health: '/api/health',
    targets: '/api/targets',
    runs: '/api/runs',
    startRun: '/api/run',
    report: (runId) => `/api/runs/${encodeURIComponent(runId)}`,
    // 证据路径相对该 run 的 artifact 目录，逐段 URL 编码后拼接。
    artifact: (runId, relPath) => `/api/runs/${encodeURIComponent(runId)}/artifacts/` +
      String(relPath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/'),
  };
  /* ================================================== 通用小工具 */
  /** HTML 转义：不可信字符串进入 innerHTML 模板前必须经过这里。 */
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  /** 建元素小助手：h('div', 'cls', '文本')。 */
  function h(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  /** 依次 append 到 parent，自动跳过 null/undefined。 */
  function add(parent, ...nodes) {
    nodes.forEach((n) => { if (n) parent.appendChild(n); });
    return parent;
  }
  const p2 = (n) => String(n).padStart(2, '0');
  const sevRank = (s) => (SEVERITY_ORDER.indexOf(s) === -1 ? SEVERITY_ORDER.length : SEVERITY_ORDER.indexOf(s));
  const sevLabel = (s) => SEVERITY_LABEL[s] || s || '未知';
  const kindLabel = (f) => (f && (f.kindLabel || KIND_LABEL[f.kind] || f.kind)) || '未知类型';
  const isHttpUrl = (u) => /^https?:\/\//i.test(String(u || ''));
  const fmtClock = (iso) => { const s = fmtDateTime(iso); return s === '—' ? s : s.slice(11); };
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
      `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  }
  /** 240000 -> "3分20秒"；1500 -> "1.5秒"；3900000 -> "1小时5分0秒" */
  function fmtDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const total = Math.round(ms / 1000);
    if (total < 60) return `${(ms / 1000).toFixed(1)}秒`;
    const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
    return hh > 0 ? `${hh}小时${mm}分${ss}秒` : `${mm}分${ss}秒`;
  }
  function formatValue(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
    return String(v);
  }
  /** 生成 <dl class="kv"> 键值表。 */
  function kvList(pairs) {
    const dl = h('dl', 'kv');
    pairs.forEach(([k, v]) => add(dl, h('dt', null, k), h('dd', null, formatValue(v))));
    return dl;
  }
  /** 新标签页链接。 */
  function newTabLink(href, text) {
    const a = h('a', null, text);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', `${text}（新标签页）`);
    return a;
  }
  /* =================================================== DOM 缓存 */
  const dom = {};
  ['brandMeta', 'targetSelect', 'startBtn', 'emptyStartBtn', 'runStatus', 'runSelect', 'errorBanner',
    'emptyState', 'dashboard', 'summaryCards', 'severityChart', 'kindDonut', 'kindLegend', 'timeInfo',
    'downloadJsonBtn', 'copyMdBtn', 'mdFallback', 'filterText', 'filterSeverity', 'filterKind',
    'resetFiltersBtn', 'findingsBody', 'findingsCount', 'noFindings', 'coverageSection', 'coverageStats',
    'coverageVisited', 'coverageDiscovered', 'coverageSkipped', 'timelineList', 'detailPanel', 'detailTitle',
    'detailBody', 'detailClose', 'drawerBackdrop', 'lightbox', 'lightboxImg', 'lightboxCaption',
    'lightboxClose', 'toast'].forEach((id) => { dom[id] = document.getElementById(id); });
  /* ======================================================== 状态 */
  const state = {
    report: null, runs: [], targets: [],
    sort: { key: 'severity', dir: 'asc' },
    filters: { text: '', severity: '', kind: '' },
    pollTimer: null, toastTimer: null, focusBeforeDrawer: null,
  };
  /* =================================================== API 封装 */
  async function api(path, options) {
    let res;
    try {
      res = await fetch(path, options);
    } catch (err) {
      console.error('[WebProbe] 请求失败：', path, err);
      const e = new Error(`无法连接服务（${path}）`);
      e.status = 0;
      throw e;
    }
    if (!res.ok) {
      console.error('[WebProbe] HTTP 错误：', res.status, path);
      const e = new Error(`HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}（${path}）`);
      e.status = res.status;
      throw e;
    }
    return res.json();
  }
  /* =================================================== 提示条 */
  function showError(message) {
    dom.errorBanner.textContent = String(message); // textContent：消息可能含被测站点内容
    dom.errorBanner.hidden = false;
  }
  function clearError() { dom.errorBanner.hidden = true; dom.errorBanner.textContent = ''; }
  function toast(message) {
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 2600);
  }
  function setRunning(on, runId) {
    dom.runStatus.hidden = !on;
    dom.startBtn.disabled = on;
    if (on) dom.brandMeta.textContent = `运行中：${runId} · 每 ${POLL_INTERVAL_MS / 1000}s 刷新状态`;
  }
  function showEmptyState() { dom.emptyState.hidden = false; dom.dashboard.hidden = true; }
  function showDashboard() { dom.emptyState.hidden = true; dom.dashboard.hidden = false; }
  /* ===================================================== 启动 */
  async function init() {
    bindEvents();
    updateSortIndicators();
    await checkHealth();
    await loadTargets();
    await loadRuns();
  }
  async function checkHealth() {
    try {
      const info = await api(API.health);
      dom.brandMeta.textContent = `${info.platform || 'WebProbe'} v${info.version || '?'} · 服务正常`;
    } catch (err) {
      dom.brandMeta.textContent = '服务未就绪';
      showError('无法连接 API 服务，请确认 Node 服务器已在本机启动。');
      console.error('[WebProbe] health 检查失败', err);
    }
  }
  async function loadTargets() {
    try {
      const list = await api(API.targets);
      state.targets = Array.isArray(list) ? list : [];
      dom.targetSelect.textContent = '';
      if (!state.targets.length) { add(dom.targetSelect, new Option('（未配置测试目标）', '')); return; }
      state.targets.forEach((t) => add(dom.targetSelect,
        new Option(`${t.name || t.id}${t.kind ? ' · ' + t.kind : ''}`, t.id)));
    } catch (err) {
      dom.targetSelect.textContent = '';
      add(dom.targetSelect, new Option('（目标加载失败）', ''));
      showError(`加载测试目标失败：${err.message}`);
    }
  }
  /** 运行历史；空数组或 404 都按“友好的空状态”处理，不算错误。 */
  async function loadRuns(options) {
    const opts = options || {};
    let runs = [];
    try {
      const list = await api(API.runs);
      runs = Array.isArray(list) ? list : [];
    } catch (err) {
      if (err.status === 404) console.warn('[WebProbe] /api/runs 返回 404，按空列表处理');
      else showError(`加载运行历史失败：${err.message}`);
    }
    state.runs = runs;
    dom.runSelect.textContent = '';
    if (!runs.length) {
      add(dom.runSelect, new Option('（暂无运行记录）', ''));
      dom.runSelect.disabled = true;
      showEmptyState();
      return null;
    }
    dom.runSelect.disabled = false;
    runs.forEach((r) => add(dom.runSelect, new Option(runOptionLabel(r), r.runId)));
    const known = new Set(runs.map((r) => r.runId));
    const wanted = [opts.selectRunId, dom.runSelect.value].find((id) => id && known.has(id)) || runs[0].runId;
    dom.runSelect.value = wanted;
    showDashboard();
    if (opts.load !== false) await loadReport(wanted);
    return wanted;
  }
  function runOptionLabel(r) {
    const findings = (r.stats && r.stats.findings) || 0;
    return `${fmtDateTime(r.startedAt)} · ${r.targetName || r.targetId || '未知目标'} · ` +
      `${findings} 个问题${r.finishedAt ? '' : ' · 运行中'}`;
  }
  async function loadReport(runId) {
    if (!runId) return;
    try {
      const report = await api(API.report(runId));
      state.report = report;
      clearError();
      showDashboard();
      renderAll(report);
    } catch (err) {
      // 保留上一个已渲染的报告：页面不会被清空。
      showError(`加载运行报告失败：${err.message}`);
      console.error('[WebProbe] loadReport 失败', err);
    }
  }
  /* ============================================= 开始测试 / 轮询 */
  async function startRun() {
    const targetId = dom.targetSelect.value;
    if (!targetId) { showError('请先选择一个测试目标。'); return; }
    clearError();
    dom.startBtn.disabled = true;
    try {
      const res = await api(API.startRun, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId }),
      });
      if (!res || res.ok !== true || !res.runId) throw new Error('服务端未确认启动测试');
      setRunning(true, res.runId);
      toast(`已启动测试：${res.runId}`);
      pollForRun(res.runId);
    } catch (err) {
      console.error('[WebProbe] 启动测试失败', err);
      showError(`启动测试失败：${err.message}`);
      dom.startBtn.disabled = false;
    }
  }
  /** 每 2s 检查运行历史，直到目标 run 出现 finishedAt。 */
  function pollForRun(runId) {
    stopPolling();
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const tick = async () => {
      if (Date.now() > deadline) {
        stopPolling();
        setRunning(false);
        showError(`运行 ${runId} 超过 ${Math.round(POLL_TIMEOUT_MS / 60000)} 分钟仍未结束，已停止轮询。`);
        return;
      }
      let runs;
      try {
        runs = await api(API.runs);
      } catch (err) {
        console.warn('[WebProbe] 轮询失败，将在下一轮重试', err);
        return;
      }
      if (!Array.isArray(runs)) return;
      const hit = runs.find((r) => r.runId === runId);
      if (hit && hit.finishedAt) {
        stopPolling();
        setRunning(false);
        clearError();
        await loadRuns({ selectRunId: runId });
        toast(`运行 ${runId} 已完成`);
      }
    };
    state.pollTimer = setInterval(tick, POLL_INTERVAL_MS);
    tick(); // 立即检查一次（可能极短时间内已完成）
  }
  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }
  /* ================================================ 渲染总入口 */
  function renderAll(report) {
    const stats = report.stats || {};
    renderSummaryCards(report, stats);
    renderSeverityChart(stats.bySeverity || {});
    renderKindDonut(stats.byKind || {});
    renderTimeInfo(report);
    rebuildFilterOptions();
    renderTable();
    renderCoverage(report);
    closeDetail();
  }
  /* ================================================== 概览卡片 */
  function renderSummaryCards(report, stats) {
    const bySev = stats.bySeverity || {};
    const total = stats.findings === undefined ? (report.findings || []).length : stats.findings;
    const cards = [{ label: '问题总数', value: total, cls: 'card-total',
      sub: `严重 ${bySev.critical || 0} · 高 ${bySev.high || 0}` }];
    SEVERITY_ORDER.forEach((s) => cards.push({ label: sevLabel(s), value: bySev[s] || 0, cls: `card-${s}` }));
    cards.push({ label: '访问页面数', value: stats.pagesVisited || 0, sub: `页面访问 ${stats.pageVisits || 0} 次` });
    cards.push({ label: '执行动作数', value: stats.actionsExecuted || 0 });
    cards.push({ label: '网络请求', value: stats.requests || 0, sub: `失败 ${stats.failedRequests || 0}` });
    cards.push({ label: '控制台消息', value: stats.consoleMessages || 0 });
    dom.summaryCards.textContent = '';
    cards.forEach((c) => {
      const card = h('div', `stat-card ${c.cls || ''}`.trim());
      add(card, h('span', 'stat-label', c.label), h('strong', 'stat-value', String(c.value)));
      if (c.sub) add(card, h('span', 'stat-sub', c.sub));
      add(dom.summaryCards, card);
    });
  }
  /* ======================================== 图表（手写，无库） */
  /** (a) 严重级横向条形图：CSS 宽度百分比。 */
  function renderSeverityChart(bySeverity) {
    const rows = SEVERITY_ORDER.map((s) => [s, Number(bySeverity[s]) || 0]);
    Object.keys(bySeverity).forEach((s) => {
      if (!SEVERITY_ORDER.includes(s)) rows.push([s, Number(bySeverity[s]) || 0]);
    });
    const max = Math.max(1, ...rows.map(([, n]) => n));
    dom.severityChart.textContent = '';
    rows.forEach(([sev, n]) => {
      const fill = h('span', `bar-fill bar-${/^[a-z-]+$/.test(sev) ? sev : 'info'}`);
      fill.style.width = `${(n / max) * 100}%`;
      const row = h('div', 'bar-row');
      add(row, h('span', 'bar-label', sevLabel(sev)), add(h('span', 'bar-track'), fill),
        h('span', 'bar-value', String(n)));
      add(dom.severityChart, row);
    });
  }
  /** (b) 类型环形图：内联 SVG + stroke-dasharray 拼弧段。 */
  function renderKindDonut(byKind) {
    const entries = Object.keys(byKind).map((k) => [k, Number(byKind[k]) || 0])
      .filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, n]) => sum + n, 0);
    const R = 54, C = 2 * Math.PI * R;
    let offset = 0;
    const segments = entries.map(([kind, n], i) => {
      const len = (n / total) * C;
      const pct = Math.round((n / total) * 100);
      const seg = `<circle class="donut-seg" cx="70" cy="70" r="${R}" stroke="${esc(KIND_COLORS[i % KIND_COLORS.length])}" ` +
        `stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" ` +
        `stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 70 70)">` +
        `<title>${esc(`${kindLabel({ kind })}：${n}（${pct}%）`)}</title></circle>`;
      offset += len;
      return seg;
    }).join('');
    dom.kindDonut.innerHTML = `<circle class="donut-track" cx="70" cy="70" r="${R}"></circle>${segments}` +
      `<text class="donut-total" x="70" y="68" text-anchor="middle">${esc(total)}</text>` +
      `<text class="donut-caption" x="70" y="84" text-anchor="middle">${esc(total ? '问题数' : '无数据')}</text>`;
    dom.kindLegend.textContent = '';
    if (!entries.length) { add(dom.kindLegend, h('li', 'muted', '（无类型数据）')); return; }
    entries.forEach(([kind, n], i) => {
      const dot = h('span', 'legend-dot');
      dot.style.background = KIND_COLORS[i % KIND_COLORS.length];
      add(dom.kindLegend, add(h('li'), dot, h('span', null, kindLabel({ kind })),
        h('span', 'legend-val', `${n} · ${Math.round((n / total) * 100)}%`)));
    });
  }
  /** (c) 时间信息：开始 → 结束 + 中文时长。 */
  function renderTimeInfo(report) {
    const t = report.target || {};
    const rows = [
      ['运行 ID', report.runId || '—'],
      ['测试目标', `${t.name || t.id || '—'}${t.kind ? `（${t.kind}）` : ''}`],
      ['目标地址', t.url || '—'],
      ['浏览器', report.browser ? `${report.browser.name || ''} ${report.browser.version || ''}`.trim() +
        (report.browser.headless ? '（无头）' : '') : '—'],
      ['开始时间', fmtDateTime(report.startedAt)],
      ['结束时间', report.finishedAt ? fmtDateTime(report.finishedAt) : '运行中…'],
      ['耗时', fmtDuration(report.durationMs)],
      ['随机种子', report.config ? formatValue(report.config.seed) : '—'],
    ];
    dom.timeInfo.textContent = '';
    const dl = h('dl');
    rows.forEach(([k, v]) => {
      const dd = h('dd');
      if (k === '耗时') dd.className = 'duration';
      if (k === '目标地址' && isHttpUrl(v)) add(dd, newTabLink(v, v));
      else dd.textContent = v;
      add(dl, h('dt', null, k), dd);
    });
    add(dom.timeInfo, dl);
  }
  /* ================================================ 筛选与表格 */
  function fillSelect(select, pairs, keep) {
    select.textContent = '';
    pairs.forEach(([value, label]) => add(select, new Option(label, value)));
    select.value = pairs.some(([value]) => value === keep) ? keep : '';
  }
  function rebuildFilterOptions() {
    const findings = (state.report && state.report.findings) || [];
    const sevPairs = [['', '全部严重级']];
    SEVERITY_ORDER.forEach((s) => {
      const n = findings.filter((f) => f.severity === s).length;
      if (n > 0 || state.filters.severity === s) sevPairs.push([s, `${sevLabel(s)}（${n}）`]);
    });
    fillSelect(dom.filterSeverity, sevPairs, state.filters.severity);
    const kinds = [];
    findings.forEach((f) => { if (f.kind && !kinds.includes(f.kind)) kinds.push(f.kind); });
    const kindPairs = [['', '全部类型']];
    kinds.forEach((k) => kindPairs.push([k,
      `${kindLabel({ kind: k })}（${findings.filter((f) => f.kind === k).length}）`]));
    fillSelect(dom.filterKind, kindPairs, state.filters.kind);
  }
  function compareFindings(a, b, key) {
    switch (key) {
      case 'severity': return sevRank(a.severity) - sevRank(b.severity);
      case 'kind': return String(kindLabel(a)).localeCompare(String(kindLabel(b)), 'zh-Hans-CN');
      case 'occurrences': return (Number(a.occurrences) || 0) - (Number(b.occurrences) || 0);
      case 'firstSeenAt': return (Date.parse(a.firstSeenAt) || 0) - (Date.parse(b.firstSeenAt) || 0);
      default: return 0;
    }
  }
  /** 文本 + 严重级 + 类型三个筛选条件叠加生效。 */
  function visibleFindings() {
    const findings = (state.report && state.report.findings) || [];
    const needle = state.filters.text.trim().toLowerCase();
    let list = findings.slice();
    if (state.filters.severity) list = list.filter((f) => f.severity === state.filters.severity);
    if (state.filters.kind) list = list.filter((f) => f.kind === state.filters.kind);
    if (needle) {
      list = list.filter((f) => [f.title, f.message, f.url]
        .some((v) => String(v === null || v === undefined ? '' : v).toLowerCase().includes(needle)));
    }
    const sign = state.sort.dir === 'desc' ? -1 : 1;
    return list.sort((a, b) => sign * compareFindings(a, b, state.sort.key));
  }
  function sevBadge(severity) {
    const s = SEVERITY_ORDER.includes(severity) ? severity : 'info';
    return h('span', `badge badge-${s}`, sevLabel(s));
  }
  function findingRow(f) {
    const tr = h('tr');
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', `查看问题详情：${f.title || f.id || ''}`);
    const open = () => openDetail(f);
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    const title = h('td', 'cell-title', f.title || '(无标题)');
    title.title = f.title || '';
    const url = h('td', 'cell-url', f.url || '—');
    url.title = f.url || '';
    const time = h('td', 'nowrap', fmtDateTime(f.firstSeenAt));
    time.title = f.firstSeenAt || '';
    add(tr, add(h('td'), sevBadge(f.severity)), h('td', null, kindLabel(f)), title, url,
      h('td', 'num', f.occurrences === undefined ? 1 : f.occurrences), time);
    return tr;
  }
  function renderTable() {
    const rows = visibleFindings();
    const total = ((state.report && state.report.findings) || []).length;
    dom.findingsBody.textContent = '';
    rows.forEach((f) => add(dom.findingsBody, findingRow(f)));
    dom.findingsCount.textContent = rows.length === total ? String(total) : `${rows.length} / ${total}`;
    dom.noFindings.hidden = rows.length > 0;
  }
  function toggleSort(key) {
    if (!key) return;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else state.sort = { key, dir: SORT_DEFAULT_DIR[key] || 'asc' };
    updateSortIndicators();
    renderTable();
  }
  function updateSortIndicators() {
    document.querySelectorAll('th[data-sort]').forEach((th) => {
      const active = th.dataset.sort === state.sort.key;
      th.setAttribute('aria-sort', active ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      th.classList.toggle('sorted', active);
      const arrow = th.querySelector('.arrow');
      if (arrow) arrow.textContent = active ? (state.sort.dir === 'asc' ? '▲' : '▼') : '';
    });
  }
  /* =========================================== 覆盖率与时间线 */
  /** 覆盖率 URL 列表：用 esc() 拼模板，避免被测站点注入 HTML/属性。 */
  function renderLinkList(container, items) {
    container.innerHTML = items.length ? items.map((raw) => {
      const text = String(raw === null || raw === undefined ? '' : raw);
      return isHttpUrl(text)
        ? `<li><a href="${esc(text)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a></li>`
        : `<li>${esc(text) || '—'}</li>`;
    }).join('') : '<li class="muted">（无）</li>';
  }
  function renderCoverage(report) {
    const cov = report.coverage || {};
    const visited = Array.isArray(cov.visited) ? cov.visited : [];
    const discovered = Array.isArray(cov.discovered) ? cov.discovered : [];
    const skipped = Array.isArray(cov.skipped) ? cov.skipped : [];
    const timeline = Array.isArray(report.timeline) ? report.timeline : [];
    renderLinkList(dom.coverageVisited, visited);
    renderLinkList(dom.coverageDiscovered, discovered);
    renderLinkList(dom.coverageSkipped, skipped);
    dom.coverageStats.textContent = '';
    [['已访问', visited.length], ['新发现', discovered.length], ['已跳过', skipped.length],
      ['时间线事件', timeline.length]].forEach(([label, value]) => {
      add(dom.coverageStats, add(h('div', 'stat-card'), h('span', 'stat-label', label),
        h('strong', 'stat-value', String(value))));
    });
    // 时间线可能很长：只渲染前 500 条，容器可滚动。
    dom.timelineList.innerHTML = timeline.length ? timeline.slice(0, 500).map((ev) => {
      const e = ev || {};
      return `<li class="tl-item"><span class="chip chip-type">${esc(e.type || 'event')}</span>` +
        `<time>${esc(fmtClock(e.t))}</time><span class="tl-msg">${esc(e.message || '')}</span></li>`;
    }).join('') : '<li class="muted">（无时间线记录）</li>';
  }
  /* ================================================== 详情抽屉 */
  function section(title) {
    return add(h('section', 'detail-section'), h('h3', null, title));
  }
  function evidenceSection(finding) {
    const ev = finding.evidence || {};
    const runId = (state.report && state.report.runId) || '';
    const shots = Array.isArray(ev.screenshots) ? ev.screenshots : [];
    const links = [['DOM 快照', ev.domSnapshot], ['控制台日志', ev.consoleLog], ['网络 HAR', ev.har]]
      .filter(([, p]) => p);
    if (!shots.length && !links.length && !ev.video) return null;
    const sec = section('证据');
    if (shots.length) {
      const thumbs = h('div', 'thumbs');
      shots.forEach((rel, i) => {
        const url = API.artifact(runId, rel);
        const btn = h('button', 'thumb');
        btn.type = 'button';
        btn.setAttribute('aria-label', `放大查看截图 ${rel}`);
        const img = h('img');
        img.src = url; img.loading = 'lazy'; img.alt = `证据截图 ${i + 1}：${rel}`;
        img.addEventListener('error', () => { // 图片缺失时退化为新标签页打开
          btn.classList.add('is-broken');
          btn.textContent = `打开 ${rel}`;
          btn.onclick = () => window.open(url, '_blank', 'noopener');
        });
        add(btn, img);
        btn.addEventListener('click', () => {
          if (!btn.classList.contains('is-broken')) openLightbox(url, rel);
        });
        add(thumbs, btn);
      });
      add(sec, thumbs);
    }
    const row = h('div', 'evidence-links');
    links.forEach(([label, rel]) => add(row, newTabLink(API.artifact(runId, rel), `${label} 打开`)));
    if (ev.video) add(row, newTabLink(API.artifact(runId, ev.video), '查看录像'));
    if (row.childNodes.length) add(sec, row);
    return sec;
  }
  function renderDetail(finding) {
    const runId = (state.report && state.report.runId) || '';
    const body = dom.detailBody;
    body.textContent = '';
    dom.detailTitle.textContent = `${finding.id || '问题'} · ${kindLabel(finding)}`;
    // 徽章行：严重级 + 类型 + 次数 + 已知/新 + 目标 + 标签
    const head = h('div', 'detail-head');
    add(head, sevBadge(finding.severity));
    [kindLabel(finding), `出现 ${finding.occurrences === undefined ? 1 : finding.occurrences} 次`,
      finding.known ? '已知问题' : '新问题', finding.target || runId]
      .concat((Array.isArray(finding.tags) ? finding.tags : []).map((tag) => `#${tag}`))
      .filter(Boolean).forEach((text) => add(head, h('span', 'chip', text)));
    add(body, head);
    // 标题 / 消息
    const titleSec = section('标题 / 消息');
    add(titleSec, h('p', 'msg', finding.title || '(无标题)'));
    if (finding.message) add(titleSec, h('p', 'msg', finding.message));
    add(body, titleSec);
    // URL / 时间 / 签名
    add(body, add(section('URL / 时间'), kvList([['URL', finding.url], ['签名', finding.signature],
      ['首次出现', fmtDateTime(finding.firstSeenAt)], ['最近出现', fmtDateTime(finding.lastSeenAt)]])));
    // 堆栈
    if (Array.isArray(finding.stack) && finding.stack.length) {
      add(body, add(section('堆栈'), h('pre', 'stack', finding.stack.join('\n'))));
    }
    // 复现步骤 + 最后一步信息
    const repro = finding.repro || {};
    const steps = Array.isArray(repro.steps) ? repro.steps : [];
    if (steps.length) {
      const sec = section('复现步骤');
      const ol = h('ol', 'steps');
      steps.forEach((s) => add(ol, h('li', null, s)));
      add(sec, ol);
      if (finding.step) {
        add(sec, h('p', 'hint', `最后一步：action=${formatValue(finding.step.action)} ` +
          `selector=${formatValue(finding.step.selector)} value=${formatValue(finding.step.value)}`));
      }
      add(body, sec);
    }
    // 复现脚本 + 复制按钮
    if (repro.script) {
      const btn = h('button', 'btn btn-ghost', '复制脚本');
      btn.type = 'button';
      btn.addEventListener('click', () => copyText(repro.script, '复现脚本'));
      add(body, add(section('复现脚本'), add(h('div', 'script-box'), h('pre', null, repro.script), btn)));
    }
    // 上下文
    const ctxKeys = Object.keys(finding.context || {});
    if (ctxKeys.length) {
      add(body, add(section('上下文'), kvList(ctxKeys.map((k) => [k, finding.context[k]]))));
    }
    // 证据
    const ev = evidenceSection(finding);
    add(body, ev || add(section('证据'), h('p', 'hint', '本次问题没有采集到证据文件。')));
  }
  function openDetail(finding) {
    state.focusBeforeDrawer = document.activeElement;
    renderDetail(finding);
    dom.detailPanel.hidden = false;
    dom.drawerBackdrop.hidden = false;
    dom.detailClose.focus();
  }
  function closeDetail() {
    if (dom.detailPanel.hidden) return;
    dom.detailPanel.hidden = true;
    dom.drawerBackdrop.hidden = true;
    dom.detailBody.textContent = '';
    if (state.focusBeforeDrawer && typeof state.focusBeforeDrawer.focus === 'function') {
      state.focusBeforeDrawer.focus();
    }
    state.focusBeforeDrawer = null;
  }
  /* ======================================================= 灯箱 */
  function openLightbox(src, caption) {
    dom.lightboxImg.src = src;
    dom.lightboxImg.alt = caption || '证据截图';
    dom.lightboxCaption.textContent = caption || '';
    dom.lightbox.hidden = false;
    dom.lightboxClose.focus();
  }
  function closeLightbox() {
    dom.lightbox.hidden = true;
    dom.lightboxImg.removeAttribute('src');
    dom.lightboxImg.alt = '';
    dom.lightboxCaption.textContent = '';
  }
  /* ================================================== 复制/导出 */
  async function copyViaClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('[WebProbe] clipboard API 不可用，尝试回退方案', err);
      }
    }
    return false;
  }
  /** 回退方案：临时 textarea + document.execCommand('copy')。 */
  function copyWithTextarea(text) {
    const ta = h('textarea', 'offscreen');
    ta.setAttribute('readonly', 'readonly');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { console.warn('[WebProbe] execCommand 复制失败', err); }
    document.body.removeChild(ta);
    return ok;
  }
  async function copyText(text, label) {
    if (await copyViaClipboard(text)) { toast(`${label}已复制`); return true; }
    if (copyWithTextarea(text)) { toast(`${label}已复制（回退方案）`); return true; }
    toast('复制失败，请手动选择文本');
    return false;
  }
  function buildMarkdown(report) {
    const findings = report.findings || [];
    const stats = report.stats || {};
    const bySev = stats.bySeverity || {};
    const cell = (v) => String(v === null || v === undefined ? '' : v)
      .replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 160);
    const lines = [
      '# WebProbe 测试报告摘要', '',
      `- 运行 ID：${report.runId || '—'}`,
      `- 目标：${(report.target && (report.target.name || report.target.id)) || '—'}` +
        `${report.target && report.target.url ? `（${report.target.url}）` : ''}`,
      `- 时间：${fmtDateTime(report.startedAt)} → ${report.finishedAt ? fmtDateTime(report.finishedAt) : '运行中'}`,
      `- 耗时：${fmtDuration(report.durationMs)}`,
      `- 统计：问题 ${stats.findings || findings.length} 个（严重 ${bySev.critical || 0} / 高 ${bySev.high || 0} / ` +
        `中 ${bySev.medium || 0} / 低 ${bySev.low || 0}），页面 ${stats.pagesVisited || 0}，` +
        `动作 ${stats.actionsExecuted || 0}，请求 ${stats.requests || 0}（失败 ${stats.failedRequests || 0}）`,
      '', '| 严重级 | 类型 | 标题 | 次数 | URL |', '| --- | --- | --- | --- | --- |',
    ];
    const sorted = findings.slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
    sorted.forEach((f) => lines.push(`| ${cell(sevLabel(f.severity))} | ${cell(kindLabel(f))} | ` +
      `${cell(f.title)} | ${cell(f.occurrences)} | ${cell(f.url)} |`));
    if (!sorted.length) lines.push('| — | — | （本次运行没有发现任何问题） | 0 | — |');
    return lines.join('\n');
  }
  async function copyMarkdown() {
    if (!state.report) { toast('暂无可导出的报告'); return; }
    const md = buildMarkdown(state.report);
    if (await copyViaClipboard(md)) {
      dom.mdFallback.hidden = true;
      toast('Markdown 摘要已复制到剪贴板');
      return;
    }
    // 剪贴板不可用：把摘要显示在 textarea 中供手动复制。
    dom.mdFallback.hidden = false;
    dom.mdFallback.value = md;
    dom.mdFallback.focus();
    dom.mdFallback.select();
    toast('剪贴板不可用，请在下方文本框中手动复制');
  }
  function downloadJson() {
    if (!state.report) { toast('暂无可导出的报告'); return; }
    try {
      const blob = new Blob([JSON.stringify(state.report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a');
      a.href = url;
      a.download = `${state.report.runId || 'run-report'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('JSON 报告已开始下载');
    } catch (err) {
      console.error('[WebProbe] 导出 JSON 失败', err);
      showError(`导出 JSON 失败：${err.message}`);
    }
  }
  /* ==================================================== 事件绑定 */
  function bindEvents() {
    dom.startBtn.addEventListener('click', startRun);
    dom.emptyStartBtn.addEventListener('click', startRun);
    dom.downloadJsonBtn.addEventListener('click', downloadJson);
    dom.copyMdBtn.addEventListener('click', copyMarkdown);
    dom.detailClose.addEventListener('click', closeDetail);
    dom.drawerBackdrop.addEventListener('click', closeDetail);
    dom.lightboxClose.addEventListener('click', closeLightbox);
    dom.lightbox.addEventListener('click', (e) => { if (e.target === dom.lightbox) closeLightbox(); });
    dom.runSelect.addEventListener('change', () => loadReport(dom.runSelect.value));
    dom.filterText.addEventListener('input', () => { state.filters.text = dom.filterText.value; renderTable(); });
    dom.filterSeverity.addEventListener('change', () => {
      state.filters.severity = dom.filterSeverity.value; renderTable();
    });
    dom.filterKind.addEventListener('change', () => { state.filters.kind = dom.filterKind.value; renderTable(); });
    dom.resetFiltersBtn.addEventListener('click', () => {
      state.filters = { text: '', severity: '', kind: '' };
      dom.filterText.value = '';
      rebuildFilterOptions();
      renderTable();
    });
    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.tabIndex = 0;
      th.setAttribute('role', 'button');
      const go = () => toggleSort(th.dataset.sort);
      th.addEventListener('click', go);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    // Escape 关闭灯箱 / 抽屉（灯箱优先）。
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!dom.lightbox.hidden) closeLightbox();
      else if (!dom.detailPanel.hidden) closeDetail();
    });
    window.addEventListener('beforeunload', stopPolling);
  }
  /* ======================================================= 启动 */
  init().catch((err) => {
    console.error('[WebProbe] 初始化失败', err);
    showError(`界面初始化失败：${err.message}`);
  });
})();
