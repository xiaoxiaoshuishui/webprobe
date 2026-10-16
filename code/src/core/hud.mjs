/**
 * The on-page heads-up display.
 *
 * `Page.startScreencast` only captures what the page paints, so a recording made
 * from it shows pages loading and elements being clicked — but nothing about
 * *what the platform concluded*. Everything the operator cares about (which
 * action is running, which defects have been found, how severe they are, which
 * element is at fault) lived in the terminal, invisible in the video.
 *
 * So the platform draws its own overlay inside the page under test:
 *
 *   · a status panel — target, elapsed time, current action, live counters
 *   · a findings feed — newest first, colour-coded by severity, with a flash on
 *     each new entry
 *   · an element highlight — a dashed box drawn over the element a finding is
 *     attributed to, so the video shows *where* the defect is
 *   · intro / outro cards — full-screen summaries before and after the run
 *
 * The overlay is appended to `document.documentElement` rather than `<body>`.
 * That is deliberate: it keeps the platform's own text out of
 * `document.body.innerText`, so the "blank page" heuristic and the target's own
 * `page-not-blank` assertion still measure the *site*, not the tool. It also
 * carries `data-webprobe` and `pointer-events: none`, so the DOM audit never
 * mistakes it for part of the software under test and the fuzzer cannot click it.
 */

export const HUD_ATTR = 'data-webprobe';
export const HUD_ROOT_ID = '__webprobe_hud';

/**
 * Install the overlay. Passed to `context.addInitScript`, so Playwright
 * serialises it — it must be completely self-contained.
 */
export function hudInitScript() {
  if (window.top !== window) return;
  if (window.__webprobeHud) return;

  const SEV_COLOR = {
    critical: '#ff4d4f', high: '#ff7a45', medium: '#ffc53d', low: '#69b1ff', info: '#8c8c8c',
  };
  const SEV_LABEL = { critical: '严重', high: '高', medium: '中', low: '低', info: '提示' };
  const ROOT_ID = '__webprobe_hud';
  const CARD_ID = '__webprobe_card';
  const HL_ID = '__webprobe_hl';
  const MAX_ROWS = 9;

  const el = (tag, css, text) => {
    const n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = String(text);
    return n;
  };

  function ensureRoot() {
    const host = document.documentElement || document.body;
    if (!host) return null;
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    if (!document.getElementById('__webprobe_hud_style')) {
      const style = el('style');
      style.id = '__webprobe_hud_style';
      style.textContent = `
        #${ROOT_ID} {
          position: fixed; left: 16px; bottom: 16px; width: 470px; max-height: 56vh;
          display: flex; flex-direction: column; overflow: hidden;
          background: rgba(11,14,20,.93); border: 1px solid #2b3346; border-radius: 10px;
          box-shadow: 0 10px 34px rgba(0,0,0,.58);
          font: 12px/1.55 "Cascadia Mono", Consolas, "Microsoft YaHei", monospace;
          color: #e6e9ef; z-index: 2147483646; pointer-events: none;
          backdrop-filter: blur(3px);
        }
        #${ROOT_ID} .wp-head {
          display: flex; align-items: center; gap: 8px; padding: 8px 12px;
          background: linear-gradient(90deg,#161c28,#11151d); border-bottom: 1px solid #2b3346;
        }
        #${ROOT_ID} .wp-logo { color: #4a9eff; font-weight: 700; letter-spacing: .04em; }
        #${ROOT_ID} .wp-target { color: #9aa3b2; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #${ROOT_ID} .wp-elapsed { color: #69b1ff; font-variant-numeric: tabular-nums; }
        #${ROOT_ID} .wp-action {
          padding: 6px 12px; border-bottom: 1px solid #232a38; color: #c9d3e3;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #${ROOT_ID} .wp-action b { color: #ffd666; font-weight: 600; }
        #${ROOT_ID} .wp-stats {
          display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 6px 12px;
          border-bottom: 1px solid #232a38; color: #9aa3b2; font-size: 11.5px;
        }
        #${ROOT_ID} .wp-stats b { color: #e6e9ef; font-weight: 600; }
        #${ROOT_ID} .wp-findings { overflow: hidden; padding: 4px 0; }
        #${ROOT_ID} .wp-empty { padding: 6px 12px; color: #6b7484; }
        #${ROOT_ID} .wp-row {
          display: flex; align-items: baseline; gap: 7px; padding: 3px 12px;
          border-left: 3px solid transparent; animation: wp-flash .9s ease-out;
        }
        #${ROOT_ID} .wp-row + .wp-row { border-top: 1px solid rgba(43,51,70,.45); }
        #${ROOT_ID} .wp-sev { flex: 0 0 auto; font-weight: 700; font-size: 10.5px; padding: 0 5px;
          border-radius: 3px; color: #0b0e14; }
        #${ROOT_ID} .wp-kind { flex: 0 0 auto; color: #8494ab; font-size: 11px; }
        #${ROOT_ID} .wp-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #${ROOT_ID} .wp-count { flex: 0 0 auto; color: #ffd666; font-size: 11px; }
        @keyframes wp-flash {
          0% { background: rgba(74,158,255,.34); }
          100% { background: transparent; }
        }
        #${HL_ID} {
          position: fixed; border: 2px dashed #ff4d4f; border-radius: 4px;
          box-shadow: 0 0 0 3px rgba(255,77,79,.22), 0 0 22px rgba(255,77,79,.4);
          z-index: 2147483645; pointer-events: none; transition: opacity .35s ease;
        }
        #${HL_ID} .wp-hl-label {
          position: absolute; left: -2px; top: -22px; max-width: 460px;
          background: #ff4d4f; color: #fff; font: 600 11px/1.6 "Cascadia Mono", Consolas, monospace;
          padding: 1px 7px; border-radius: 4px 4px 4px 0; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        #${CARD_ID} {
          position: fixed; inset: 0; z-index: 2147483647; display: flex;
          align-items: center; justify-content: center; padding: 5vh 6vw;
          background: radial-gradient(circle at 30% 20%, #17202f 0%, #0a0d13 70%);
          color: #e6e9ef; font: 14px/1.7 "Cascadia Mono", Consolas, "Microsoft YaHei", monospace;
          pointer-events: none; overflow: hidden;
        }
        #${CARD_ID} .wp-card { width: 100%; max-width: 1080px; }
        #${CARD_ID} .wp-card-live {
          position: absolute; right: 5vw; top: 4vh; color: #8494ab; font-size: 13px;
          display: flex; align-items: center; gap: 7px;
        }
        #${CARD_ID} .wp-card-live b {
          color: #52c41a; font-size: 15px; line-height: 1;
          animation: wp-blink 1.1s steps(2, start) infinite;
        }
        @keyframes wp-blink { 50% { opacity: .12; } }
        #${CARD_ID} .wp-card-brand {
          display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px;
        }
        #${CARD_ID} .wp-card-brand b { font-size: 30px; color: #4a9eff; letter-spacing: .02em; }
        #${CARD_ID} .wp-card-brand span { color: #8494ab; font-size: 14px; }
        #${CARD_ID} .wp-card-rule { height: 2px; background: linear-gradient(90deg,#4a9eff,#2b3346 70%); margin: 14px 0 22px; }
        #${CARD_ID} .wp-card-grid { display: grid; grid-template-columns: 132px 1fr; gap: 7px 20px; }
        #${CARD_ID} .wp-card-grid dt { color: #8494ab; }
        #${CARD_ID} .wp-card-grid dd { margin: 0; color: #e6e9ef; word-break: break-all; }
        #${CARD_ID} .wp-card-note { margin-top: 26px; color: #ffd666; font-size: 15px; }
        #${CARD_ID} .wp-card-h { font-size: 22px; color: #e6e9ef; margin: 0 0 18px; }
        #${CARD_ID} .wp-card-sev { display: flex; gap: 10px; flex-wrap: wrap; margin: 4px 0 22px; }
        #${CARD_ID} .wp-chip {
          padding: 6px 14px; border-radius: 999px; font-weight: 700; font-size: 14px;
          border: 1px solid rgba(255,255,255,.14);
        }
        #${CARD_ID} .wp-card-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        #${CARD_ID} .wp-card-table td { padding: 4px 8px 4px 0; vertical-align: top; }
        #${CARD_ID} .wp-card-table td:first-child { color: #8494ab; white-space: nowrap; }
        #${CARD_ID} .wp-card-table td.wp-sev-cell { white-space: nowrap; font-weight: 700; }
        #${CARD_ID} .wp-card-path { margin-top: 22px; color: #8494ab; font-size: 12.5px; word-break: break-all; }
      `;
      (document.head || host).appendChild(style);
    }

    root = el('div');
    root.id = ROOT_ID;
    root.setAttribute('data-webprobe', 'ignore');
    root.innerHTML = `
      <div class="wp-head">
        <span class="wp-logo">WebProbe</span>
        <span class="wp-target"></span>
        <span class="wp-elapsed">0.0s</span>
      </div>
      <div class="wp-action"></div>
      <div class="wp-stats"></div>
      <div class="wp-findings"><div class="wp-empty">正在执行静态审计与模糊测试…</div></div>
    `;
    // Appended to <html>, not <body>: the platform's own text must not leak into
    // document.body.innerText, which both the blank-page heuristic and the
    // target's own assertions rely on.
    host.appendChild(root);
    return root;
  }

  function setText(sel, text) {
    const root = ensureRoot();
    if (!root) return;
    const n = root.querySelector(sel);
    if (n) n.textContent = String(text);
  }

  function statsHtml(s) {
    const bits = [];
    const push = (label, value) => bits.push(`${label} <b>${value}</b>`);
    if (s.pages != null) push('页面', `${s.pages}${s.pagesMax ? '/' + s.pagesMax : ''}`);
    if (s.actions != null) push('动作', s.actions);
    if (s.requests != null) push('请求', s.failed ? `${s.requests}（失败 ${s.failed}）` : s.requests);
    if (s.findings != null) push('缺陷', s.findings);
    return bits.join('');
  }

  let startedAt = Date.now();
  let timer = null;

  window.__webprobeHud = {
    /**
     * Apply the whole overlay state in a single call.
     *
     * Setting the header, feed, counters and action line as separate round trips
     * leaves a visible window after each navigation in which the panel is on
     * screen but half-populated — which is exactly what a viewer sees, because
     * the recording captures that moment. One atomic update removes the window.
     */
    applyState(s) {
      const root = ensureRoot();
      if (!root || !s) return;
      if (s.target !== undefined) {
        const t = root.querySelector('.wp-target');
        if (t) t.textContent = s.target || '';
      }
      if (s.elapsedMs !== undefined) {
        startedAt = Date.now() - (s.elapsedMs || 0);
        if (timer) clearInterval(timer);
        const tick = () => {
          const n = root.querySelector('.wp-elapsed');
          if (n) n.textContent = ((Date.now() - startedAt) / 1000).toFixed(1) + 's';
        };
        tick();
        timer = setInterval(tick, 200);
      }
      if (s.stats) {
        const n = root.querySelector('.wp-stats');
        if (n) n.innerHTML = statsHtml(s.stats);
      }
      if (s.findings) this.setFindings(s.findings);
      if (s.action !== undefined) this.setAction(s.action);
    },
    setHeader(info) {
      const root = ensureRoot();
      if (!root) return;
      root.querySelector('.wp-target').textContent = info.target || '';
      // Baseline is the *run* start, not this document's creation time: the
      // overlay is rebuilt on every navigation, so a fresh Date.now() here would
      // make the elapsed counter restart at zero on each page.
      startedAt = Date.now() - (info.elapsedMs || 0);
      if (timer) clearInterval(timer);
      const tick = () => {
        const n = root.querySelector('.wp-elapsed');
        if (n) n.textContent = ((Date.now() - startedAt) / 1000).toFixed(1) + 's';
      };
      tick();
      timer = setInterval(tick, 200);
    },
    setAction(text) {
      const root = ensureRoot();
      if (!root) return;
      const n = root.querySelector('.wp-action');
      if (n) n.innerHTML = '';
      if (n) {
        const b = document.createElement('b');
        b.textContent = '▶ ';
        n.appendChild(b);
        n.appendChild(document.createTextNode(String(text || '')));
      }
    },
    setStats(s) {
      setText('.wp-stats', '');
      const root = ensureRoot();
      if (!root) return;
      const n = root.querySelector('.wp-stats');
      if (n) n.innerHTML = statsHtml(s);
    },
    pushFinding(f) {
      const root = ensureRoot();
      if (!root) return;
      const list = root.querySelector('.wp-findings');
      if (!list) return;
      const empty = list.querySelector('.wp-empty');
      if (empty) empty.remove();
      this._row(list, f, true);
    },
    /**
     * Replace the whole feed.
     *
     * The overlay lives *inside the page*, so every navigation destroys it and
     * the next document starts with an empty feed. Without this replay the
     * recording would only ever show the defects found on the current page —
     * which for a crawl is usually none. The engine re-sends the accumulated
     * list after each navigation so the overlay always tells the whole story.
     */
    setFindings(list) {
      const root = ensureRoot();
      if (!root) return;
      const box = root.querySelector('.wp-findings');
      if (!box) return;
      box.innerHTML = '';
      const rows = (list || []).slice(0, MAX_ROWS);
      if (!rows.length) {
        box.innerHTML = '<div class="wp-empty">正在执行静态审计与模糊测试…</div>';
        return;
      }
      for (const f of rows.slice().reverse()) this._row(box, f, false);
    },
    _row(list, f, flash) {
      const color = SEV_COLOR[f.severity] || SEV_COLOR.info;
      const row = el('div', `border-left-color:${color}`);
      row.className = 'wp-row';
      if (!flash) row.style.animation = 'none';
      const sev = el('span', `background:${color}`, SEV_LABEL[f.severity] || f.severity);
      sev.className = 'wp-sev';
      row.appendChild(sev);
      if (f.kindLabel) {
        const k = el('span', '', f.kindLabel);
        k.className = 'wp-kind';
        row.appendChild(k);
      }
      const title = el('span', '', f.title || '');
      title.className = 'wp-title';
      row.appendChild(title);
      if (f.occurrences > 1) {
        const c = el('span', '', `×${f.occurrences}`);
        c.className = 'wp-count';
        row.appendChild(c);
      }
      list.insertBefore(row, list.firstChild);
      while (list.children.length > MAX_ROWS) list.removeChild(list.lastChild);
      if (flash && f.selector) this.highlight(f.selector, f.title || '');
    },
    resetFindings() {
      const root = ensureRoot();
      if (!root) return;
      const list = root.querySelector('.wp-findings');
      if (list) list.innerHTML = '<div class="wp-empty">正在执行静态审计与模糊测试…</div>';
    },
    /** Draw a dashed box over the element a finding is attributed to. */
    highlight(selector, label) {
      try {
        ensureRoot();
        const host = document.documentElement || document.body;
        if (!host) return;
        let box = document.getElementById(HL_ID);
        if (!box) {
          box = el('div');
          box.id = HL_ID;
          box.setAttribute('data-webprobe', 'ignore');
          host.appendChild(box);
        }
        const target = document.querySelector(selector);
        if (!target) { box.style.display = 'none'; return; }
        const r = target.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) { box.style.display = 'none'; return; }
        box.style.display = 'block';
        box.style.left = Math.max(0, r.left - 4) + 'px';
        box.style.top = Math.max(0, r.top - 4) + 'px';
        box.style.width = Math.min(window.innerWidth - Math.max(0, r.left - 4), r.width + 8) + 'px';
        box.style.height = Math.min(window.innerHeight - Math.max(0, r.top - 4), r.height + 8) + 'px';
        box.innerHTML = '';
        const tag = el('span', '', String(label || '').slice(0, 70));
        tag.className = 'wp-hl-label';
        box.appendChild(tag);

        // Bring an off-screen target into shot, but only when needed and with
        // instant scrolling: an animated scroll would race with Playwright's
        // element-stability check before the next click.
        const outOfView = r.top < 0 || r.bottom > window.innerHeight;
        if (outOfView) {
          try { target.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* never break the page under test */ }
    },
    clearHighlight() {
      const box = document.getElementById(HL_ID);
      if (box) box.style.display = 'none';
    },
    /** Full-screen intro / outro summary. */
    showCard(html) {
      // ensureRoot() first: it is what installs the stylesheet, and an unstyled
      // card is invisible rather than merely ugly.
      ensureRoot();
      const host = document.documentElement || document.body;
      if (!host) return;
      let card = document.getElementById(CARD_ID);
      if (!card) {
        card = el('div');
        card.id = CARD_ID;
        card.setAttribute('data-webprobe', 'ignore');
        host.appendChild(card);
      }
      card.style.display = 'flex';
      // The blinking indicator is not decoration: a perfectly still page stops
      // producing compositor frames, and with them the CDP screencast frames.
      // Without continuous paint damage the closing summary card never made it
      // into the recording on an idle page. The animation keeps it repainting.
      card.innerHTML = '<div class="wp-card-live"><b>●</b> 运行录像中 · WebProbe</div>'
        + '<div class="wp-card">' + html + '</div>';
      const root = document.getElementById(ROOT_ID);
      if (root) root.style.display = 'none';
    },
    hideCard() {
      const card = document.getElementById(CARD_ID);
      if (card) card.remove();
      const root = document.getElementById(ROOT_ID);
      if (root) root.style.display = 'flex';
    },
    setVisible(on) {
      const root = ensureRoot();
      if (root) root.style.display = on ? 'flex' : 'none';
    },
  };
}

/* ------------------------------------------------------------ card content */

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const SEV_HEX = {
  critical: '#ff4d4f', high: '#ff7a45', medium: '#ffc53d', low: '#69b1ff', info: '#8c8c8c',
};
const SEV_TEXT = { critical: '严重', high: '高', medium: '中', low: '低', info: '提示' };

function duration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} 秒`;
  return `${Math.floor(s / 60)} 分 ${Math.round(s - Math.floor(s / 60) * 60)} 秒`;
}

/** The card shown for a few seconds before the run starts. */
export function renderIntroCard({ target, config, browser }) {
  const budget = target.budget ?? {};
  const rows = [
    ['被测目标', `${target.name}（${target.kind === 'local' ? '本地目录' : '线上站点'}）`],
    ['入口地址', target.entryUrl],
    ['目标目录', target.sourceDir],
    ['页面预算', `${budget.maxPages} 页 · 每页最多 ${budget.maxActionsPerPage} 个动作 · 时长上限 ${duration(budget.maxDurationMs ?? 0)}`],
    ['随机种子', `${config.seed}（相同种子可复现同一执行序列）`],
    ['浏览器', `${browser?.channel ?? 'chromium'} ${browser?.version ?? ''} · ${browser?.strategy ?? 'direct'} · 视口 ${target.viewport?.width}×${target.viewport?.height}`],
  ];
  return `
    <div class="wp-card-brand"><b>WebProbe</b><span>浏览器端动态软件测试平台 v1.0.0</span></div>
    <div class="wp-card-rule"></div>
    <dl class="wp-card-grid">
      ${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}
    </dl>
    <div class="wp-card-note">▶ 开始动态执行：导航 → 声明式流程 → DOM 审计 → DOM/JS 模糊测试，全程捕获崩溃与错误…</div>
  `;
}

/**
 * The card shown after the run. This is what makes the recording self-contained:
 * the viewer sees the verdict without needing the terminal or the report file.
 */
export function renderOutroCard({ report, findings, runDir }) {
  const stats = report.stats ?? {};
  const bySev = stats.bySeverity ?? {};
  const chips = ['critical', 'high', 'medium', 'low', 'info']
    .filter((s) => bySev[s])
    .map((s) => `<span class="wp-chip" style="background:${SEV_HEX[s]};color:#0b0e14">${SEV_TEXT[s]} ${bySev[s]}</span>`)
    .join('') || '<span class="wp-chip" style="background:#52c41a;color:#0b0e14">未发现缺陷</span>';

  const top = [...findings]
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return (rank[a.severity] - rank[b.severity]) || (b.occurrences - a.occurrences);
    })
    .slice(0, 10);

  return `
    <div class="wp-card-brand"><b>动态测试完成</b><span>WebProbe v1.0.0</span></div>
    <div class="wp-card-rule"></div>
    <h2 class="wp-card-h">共发现 <span style="color:#ffd666">${findings.length}</span> 个缺陷</h2>
    <div class="wp-card-sev">${chips}</div>
    <dl class="wp-card-grid">
      <dt>被测目标</dt><dd>${escapeHtml(report.target?.name ?? '')} — ${escapeHtml(report.target?.url ?? '')}</dd>
      <dt>执行规模</dt><dd>访问 ${stats.pagesVisited ?? 0} 页 · 执行 ${stats.actionsExecuted ?? 0} 个动作 · 网络请求 ${stats.requests ?? 0}（失败 ${stats.failedRequests ?? 0}） · 新标签页 ${report.popups?.audited ?? 0} 个已审计</dd>
      <dt>缺陷归属</dt><dd>第一方（被测站点自身） ${stats.firstPartyFindings ?? 0} 个 · 第三方（内嵌广告/统计等） ${stats.thirdPartyFindings ?? 0} 个</dd>
      <dt>总耗时</dt><dd>${duration(report.durationMs ?? 0)}</dd>
    </dl>
    <div class="wp-card-rule"></div>
    <table class="wp-card-table">
      ${top.map((f) => `<tr>
        <td class="wp-sev-cell" style="color:${SEV_HEX[f.severity]}">[${SEV_TEXT[f.severity]}]</td>
        <td style="color:#8494ab;white-space:nowrap">${escapeHtml(f.id ?? '')} ${escapeHtml(f.kindLabel ?? '')}</td>
        <td>${escapeHtml(String(f.title ?? '').slice(0, 88))}</td>
      </tr>`).join('')}
    </table>
    <div class="wp-card-path">完整报告（含截图、DOM 快照、控制台日志、网络记录与可执行复现脚本）：${escapeHtml(runDir)}</div>
  `;
}
