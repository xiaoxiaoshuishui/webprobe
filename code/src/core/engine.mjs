/**
 * The engine: dynamic execution.
 *
 * This is where the platform's three contracts meet the real world.
 *
 *   input   → a target directory (bound by target.mjs)
 *   action  → drive the software in a real browser: navigate, click, type,
 *             submit, scroll, hover, keyboard-fuzz, and run the flows the
 *             target declares; probe responsiveness; audit the live DOM
 *   output  → a persisted run directory holding report.json / report.md /
 *             report.html, one evidence folder per bug, and a recording
 *
 * The engine treats a production website with the same code path as a local
 * sample app. The only difference is the manifest.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { launchBrowser, contextOptions } from './browser.mjs';
import { SignalCollector, attachMonitor, probeResponsiveness } from './monitor.mjs';
import {
  DOM_AUDIT_SCRIPT,
  FindingBook,
  domAnomaliesToFindings,
  runAssertions,
  signalToFinding,
  urlPatternMatches,
} from './detectors.mjs';
import { DISCOVER_SCRIPT, planActions } from './fuzzer.mjs';
import { Recorder } from './recorder.mjs';
import { hudInitScript, renderIntroCard, renderOutroCard } from './hud.mjs';
import { PLATFORM, SEVERITY_ORDER, makeRunReport } from './schema.mjs';
import { writeReportFiles } from './reporter.mjs';
import {
  RUNS_DIR,
  createLogger,
  createRng,
  ensureDir,
  formatDuration,
  globToRegExp,
  matchAny,
  safeFileName,
  sleep,
  timestampSlug,
  truncate,
  urlLabel,
  withTimeout,
  writeJson,
} from './util.mjs';

const NON_HTML = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|woff2?|ttf|otf|eot|mp4|webm|mp3|pdf|zip|gz|wasm)(\?|$)/i;
const DANGEROUS_URL = /(logout|signout|退出|注销|delete|remove|unsubscribe|\/pay|支付|\/admin|deleteaccount)/i;

/**
 * Run a full dynamic test of `target`.
 *
 * @param {object} target   bound target from loadTarget()
 * @param {object} options
 * @returns {Promise<object>} the RunReport
 */
export async function runTarget(target, options = {}) {
  const {
    logger = createLogger(),
    seed = target.fuzz?.seed ?? 20261016,
    headless = true,
    record = true,
    strategy = 'auto',
    outputDir = RUNS_DIR,
    runId: forcedRunId = null,
    maxPages = target.budget.maxPages,
    maxActions = target.budget.maxActionsPerPage,
    maxDurationMs = target.budget.maxDurationMs,
    actionTimeoutMs = target.budget.actionTimeoutMs,
    navigationTimeoutMs = target.budget.navigationTimeoutMs,
    captureScreenshots = true,
    flows = true,
    keepVideo = true,
    fuzz: fuzzOverride,
    /**
     * Draw the platform's own status panel, findings feed and element
     * highlights into the page under test, so the screen recording is
     * self-explanatory. See hud.mjs for why it is appended outside <body>.
     */
    hud = true,
    introSeconds = 5,
    outroSeconds = 13,
    knownSignatures = new Set(),
    onProgress = null,
  } = options;

  // `--no-fuzz` turns the target into a passive observer: navigate and audit,
  // but never poke the UI. Useful against production systems.
  if (fuzzOverride === false) target = { ...target, fuzz: { ...(target.fuzz || {}), enabled: false } };

  const rng = createRng(seed);
  const runId = forcedRunId || `run-${timestampSlug()}-${target.id}`;
  const runDir = path.join(outputDir, runId);
  const artifactsDir = path.join(runDir, 'artifacts');
  await ensureDir(artifactsDir);

  const ctx = {
    runId, runDir, artifactsDir, target, logger, rng, options,
    collector: null,
    book: new FindingBook({ target, knownSignatures }),
    steps: [],
    stats: {
      pagesVisited: 0, pageVisits: 0, actionsExecuted: 0, requests: 0,
      failedRequests: 0, consoleMessages: 0, findings: 0, bySeverity: {}, byKind: {},
    },
    timeline: [],
    coverage: { visited: [], discovered: [], skipped: [] },
    actionErrors: [],
    capturedSignatures: new Set(),
    startedAt: Date.now(),
    deadline: Date.now() + maxDurationMs,
    aborted: false,
    abortReason: null,
    recorderResult: null,
    assertionResults: [],
    pageCrashes: 0,
  };

  // The first page needs a collector before it can be monitored; subsequent
  // pages get a fresh one whenever the previous renderer died.
  ctx.collector = new SignalCollector({ target, logger });

  const report = makeRunReport({
    target: {
      id: target.id,
      name: target.name,
      kind: target.kind,
      url: target.entryUrl,
      dir: target.sourceDir,
      manifestPath: target.manifestPath,
    },
    config: {
      seed, headless, record, strategy,
      maxPages, maxActionsPerPage: maxActions, maxDurationMs, actionTimeoutMs,
      fuzz: { rounds: target.fuzz?.rounds, enabled: target.fuzz?.enabled },
      viewport: target.viewport,
    },
    browser: null,
  });
  report.runId = runId;

  const timeline = (type, message, extra = {}) => {
    const entry = { t: new Date().toISOString(), type, message, ...extra };
    ctx.timeline.push(entry);
    if (ctx.timeline.length > 4000) ctx.timeline.splice(0, 1000);
    onProgress?.(entry);
    return entry;
  };

  logger.raw('');
  logger.raw(`  ${logger.paint('bold', `${PLATFORM.name} v${PLATFORM.version}`)}  ${logger.paint('grey', '浏览器端动态软件测试平台')}`);
  logger.raw(`  目标   ${target.name}  ${logger.paint('grey', `(${target.kind})`)}`);
  logger.raw(`  入口   ${target.entryUrl}`);
  logger.raw(`  Run    ${runId}`);
  logger.raw(`  种子   ${seed}`);
  logger.raw('');

  /* ------------------------------------------------------- browser setup */
  const browser = await launchBrowser(target, { headless, logger, strategy });
  report.browser = { ...browser.meta, headless };
  timeline('browser', `浏览器已启动：${browser.meta.label ?? browser.meta.executablePath ?? browser.meta.channel}`);

  // The overlay must be installed before any page is created so it survives
  // every navigation of the run.
  if (hud) {
    try {
      await browser.context.addInitScript(hudInitScript);
    } catch (err) {
      logger.debug(`HUD 注入失败：${err.message.split('\n')[0]}`);
    }
  }

  /** Push a state change into the page's overlay (never fatal). */
  const hudCall = async (method, payload) => {
    if (!hud) return;
    const page = currentPage;
    if (!page || page.isClosed()) return;
    try {
      // Errors are *reported*, not swallowed: a silently broken overlay would
      // look exactly like a working one until someone watched the recording.
      const problem = await page.evaluate(
        ({ m, p }) => {
          try {
            if (!window.__webprobeHud) return 'no overlay API on this document';
            if (typeof window.__webprobeHud[m] !== 'function') return `no such method: ${m}`;
            window.__webprobeHud[m](p);
            return '';
          } catch (e) {
            return `threw: ${(e && e.message) || e}`;
          }
        },
        { m: method, p: payload },
      );
      if (problem) {
        // A click that starts a navigation destroys the execution context before
        // the evaluate can return. That race is normal, not a defect.
        if (!/Execution context was destroyed/i.test(problem)) {
          hudErrors.push(`${method}: ${problem}`);
          logger.debug(`  HUD ${method} → ${problem}`);
        }
      }
    } catch (err) {
      if (!/Execution context was destroyed|Target page, context or browser has been closed/i.test(err.message)) {
        hudErrors.push(`${method}: ${err.message.split('\n')[0]}`);
        logger.debug(`  HUD ${method} evaluate failed：${err.message.split('\n')[0]}`);
      }
    }
  };

  const hudStats = () => ({
    pages: ctx.stats.pagesVisited,
    pagesMax: maxPages,
    actions: ctx.stats.actionsExecuted,
    requests: ctx.collector?.networkLog.length ?? 0,
    failed: ctx.collector?.failedRequests.length ?? 0,
    findings: ctx.book.size,
  });

  /** Compact form of a finding, as the overlay needs it. */
  const hudFinding = (f) => {
    let selector = f.step?.selector || f.context?.selector || '';
    if (selector.includes(',')) selector = selector.split(',')[0].trim();
    return {
      id: f.id,
      severity: f.severity,
      kindLabel: f.kindLabel,
      title: truncate(f.title, 96),
      occurrences: f.occurrences,
      selector,
    };
  };

  /**
   * Re-establish the whole overlay on the document that is loaded right now.
   *
   * The overlay is part of the page, so every navigation wipes it: counters,
   * elapsed time and — most importantly — the findings feed. Re-sending the
   * accumulated state after each navigation is what makes the recording show
   * the complete story instead of only what happened on the current page.
   */
  const syncHud = async ({ action, keepAction = false } = {}) => {
    if (!hud) return;
    const payload = {
      target: `${target.name} — ${target.entryUrl}`,
      elapsedMs: Date.now() - ctx.startedAt,
      findings: ctx.book.all().map(hudFinding),
      stats: hudStats(),
    };
    if (!keepAction) payload.action = action ?? `就绪：${urlLabel(currentPage?.url() || target.entryUrl)}`;
    await hudCall('applyState', payload);
  };

  /**
   * Single place a newly discovered defect is surfaced: the run timeline, the
   * terminal, and — crucially — the on-page overlay so it lands in the
   * recording. Also highlights the offending element when one is known.
   */
  const announce = (stored) => {
    if (!stored) return;
    timeline('finding', `发现 [${stored.severity}] ${stored.title}`, {
      kind: stored.kind,
      signature: stored.signature,
    });
    logger.raw(
      `  ${logger.paint(severityColor(stored.severity), `● ${stored.severity.toUpperCase().padEnd(8)}`)}` +
      `${truncate(stored.title, 110)}`,
    );
    // A CSS selector to box on screen: the action that triggered it, else the
    // element the DOM audit blamed.
    hudCall('pushFinding', hudFinding(stored));
  };

  let recorder = null;
  let currentPage = null;
  let monitor = null;
  /** Overlay failures, reported at the end so they cannot hide silently. */
  const hudErrors = [];

  const closePage = async () => {
    if (!currentPage) return;
    try { await monitor?.dispose(); } catch {}
    try { await currentPage.close(); } catch {}
    currentPage = null;
    monitor = null;
  };

  const openPage = async () => {
    await closePage();
    const page = await browser.newPage();
    // Claim ownership *before* anything can observe the event: Playwright also
    // emits `context.on('page')` for pages we create ourselves, so `currentPage`
    // must already point at this page when the popup handler looks at it.
    currentPage = page;
    page.setDefaultTimeout(actionTimeoutMs);
    page.setDefaultNavigationTimeout(navigationTimeoutMs);
    // Playwright's per-page `popup` event is the *only* reliable definition of a
    // popup: a context-level `page` event also fires for the tabs this crawler
    // opens itself, which previously caused the engine to close its own page.
    page.on('popup', popupHandler);
    const collector = ctx.collector;
    monitor = await attachMonitor(page, collector, { target, logger });
    // Dynamic-target cookies from the manifest.
    if (target.auth?.cookies?.length) {
      try { await browser.context.addCookies(target.auth.cookies); } catch (err) {
        logger.warn(`cookies 注入失败：${err.message.split('\n')[0]}`);
      }
    }
    return page;
  };

  /**
   * Passive DOM audit + declared assertions against whatever is loaded now.
   * Shared by the crawler and by popup tabs, so both get identical judgement.
   */
  const auditPage = async (page, collector, label = 'audit') => {
    const url = page.url();
    let anomalyCount = 0;
    try {
      const anomalies = await withTimeout(page.evaluate(DOM_AUDIT_SCRIPT), 10_000, []);
      anomalyCount = (anomalies || []).length;

      // A broken <img> is the DOM-level face of a network failure that
      // `response`/`requestfailed` already reported with the URL, status and
      // resource type. Collapsing the two keeps one defect from being filed
      // three times under three kinds.
      const networkFailed = new Set();
      for (const r of collector.failedRequests) networkFailed.add(r.url);
      for (const n of collector.networkLog) {
        if (n.phase === 'response' && n.status >= 400) networkFailed.add(n.url);
      }
      const relevant = (anomalies || []).filter(
        (a) => a.type !== 'broken-image' || !networkFailed.has(a.detail),
      );

      for (const f of domAnomaliesToFindings(relevant, {
        url, step: { action: label, url }, target,
      })) {
        const stored = ctx.book.add(f);
        if (stored && stored.occurrences === 1) announce(stored);
      }
      if (anomalyCount) logger.debug(`  DOM 审计：${anomalyCount} 项异常，${relevant.length} 项独立上报`);
    } catch (err) {
      logger.debug(`  DOM 审计失败：${err.message.split('\n')[0]}`);
    }
    try {
      const results = await runAssertions(page, target, collector, { url, step: { action: label, url } });
      ctx.assertionResults.push(...results.map((r) => ({ ...r, url })));
    } catch (err) {
      logger.debug(`  断言执行失败：${err.message.split('\n')[0]}`);
    }
    await drainSignals(collector);
    return anomalyCount;
  };

  /* --------------------------------------------------------- popup tabs */

  /**
   * A real user journey on Huya continues in a second tab: the header search
   * form and several navigation links are `target="_blank"`. Ignoring popups
   * would silently drop that coverage, so each popup gets its own monitored
   * collector and its own audit before being closed. The budget keeps a link
   * farm from turning one click into fifty tabs.
   */
  const popups = { seen: 0, audited: 0, skipped: 0, closed: 0, max: 8, urls: [] };
  const popupHandler = (popup) => {
    if (popup === currentPage || popup.__webprobeHandled) return;
    popup.__webprobeHandled = true;
    popups.seen++;
    (async () => {
      if (popups.audited >= popups.max) {
        popups.skipped++;
        try { await popup.close(); popups.closed++; } catch {}
        return;
      }
      const collector = new SignalCollector({ target, logger });
      try {
        popup.setDefaultTimeout(actionTimeoutMs);
        const mon = await attachMonitor(popup, collector, { target, logger });
        await popup.waitForLoadState('domcontentloaded', { timeout: navigationTimeoutMs }).catch(() => {});
        await withTimeout(popup.waitForLoadState('networkidle').catch(() => {}), 5000, null);
        const u = popup.url();
        collector.pageUrl = u;

        // The manifest's URL policy governs popups exactly as it governs the
        // crawler. Without this, one click on a live card dragged the run onto
        // stream player pages and third-party shop domains, burning the time
        // budget on pages the target explicitly excluded.
        const verdict = allowedUrl(u, 0, { forPopup: true });
        if (typeof verdict === 'string' && !verdict.startsWith('http')) {
          popups.skipped++;
          ctx.coverage.skipped.push({ url: u, reason: `popup:${verdict}`, from: currentPage?.url() || '' });
          logger.debug(`  跳过新标签页（${verdict}）：${u}`);
          return;
        }
        // Only a popup that is actually audited counts, so `audited` and
        // `skipped` stay a truthful partition of `seen`.
        popups.audited++;
        popups.urls.push(u);
        timeline('popup', `新标签页：${urlLabel(u)}`);
        logger.debug(`  新标签页：${u}`);
        await sleep(600);
        await auditPage(popup, collector, 'popup-audit');
        // Record the popup's failed requests against the run totals.
        ctx.stats.requests += collector.networkLog.length;
        ctx.stats.failedRequests += collector.failedRequests.length;
        ctx.stats.consoleMessages += collector.consoleLog.length;
        for (const f of ctx.book.all()) {
          if (!ctx.capturedSignatures.has(f.signature) && !popup.isClosed()) {
            await captureEvidence(popup, f);
          }
        }
        await mon.dispose().catch?.(() => {});
      } catch (err) {
        logger.debug(`  新标签页处理失败：${err.message.split('\n')[0]}`);
      } finally {
        try { await popup.close(); popups.closed++; } catch {}
      }
    })();
  };

  /* ---------------------------------------------- evidence + bookkeeping */

  /** Persist everything a human needs to believe and reproduce one bug. */
  const captureEvidence = async (page, finding, { force = false } = {}) => {
    const sig = finding.signature;
    if (!force && ctx.capturedSignatures.has(sig)) return finding;
    ctx.capturedSignatures.add(sig);

    const dir = path.join(artifactsDir, 'findings', finding.id ?? sig);
    await ensureDir(dir);
    const rel = (p) => path.relative(artifactsDir, p).split(path.sep).join('/');
    const evidence = { ...(finding.evidence || {}) };

    if (page && !page.isClosed()) {
      if (captureScreenshots) {
        try {
          const shot = path.join(dir, 'screenshot.png');
          await page.screenshot({ path: shot, timeout: 8000 });
          evidence.screenshots = [...(evidence.screenshots || []), rel(shot)];
        } catch (err) { logger.debug(`screenshot failed: ${err.message.split('\n')[0]}`); }
      }
      try {
        const dom = path.join(dir, 'dom.html');
        const html = await withTimeout(page.content(), 6000, null);
        if (html) {
          await fsp.writeFile(dom, html, 'utf8');
          evidence.domSnapshot = rel(dom);
        }
      } catch { /* page may be mid-navigation */ }
      try {
        const meta = path.join(dir, 'context.json');
        const info = await withTimeout(page.evaluate(() => ({
          href: location.href,
          title: document.title,
          readyState: document.readyState,
          viewport: `${innerWidth}x${innerHeight}`,
          scroll: `${Math.round(scrollX)},${Math.round(scrollY)}`,
          ua: navigator.userAgent,
          lang: navigator.language,
          online: navigator.onLine,
          perf: (() => {
            try {
              const n = performance.getEntriesByType('navigation')[0];
              return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null;
            } catch { return null; }
          })(),
        })), 5000, null);
        if (info) {
          await writeJson(meta, info);
          evidence.context = rel(meta);
          finding.context = { ...info, ...finding.context };
        }
      } catch { /* ignore */ }
    }

    // A slice of console output around the defect is often the real story.
    try {
      const logFile = path.join(dir, 'console.log');
      const lines = ctx.collector.consoleLog.slice(-120).map(
        (c) => `[${c.at}] ${String(c.type).toUpperCase().padEnd(7)} ${c.text}`,
      );
      await fsp.writeFile(logFile, lines.join('\n'), 'utf8');
      evidence.consoleLog = rel(logFile);
    } catch { /* ignore */ }

    try {
      const netFile = path.join(dir, 'network.json');
      await writeJson(netFile, ctx.collector.networkLog.filter((n) => n.phase === 'response').slice(-200));
      evidence.network = rel(netFile);
    } catch { /* ignore */ }

    // A ready-to-paste Playwright reproduction of the exact sequence.
    try {
      const script = path.join(dir, 'repro.spec.mjs');
      await fsp.writeFile(script, buildReproScript(target, finding, ctx.steps), 'utf8');
      evidence.reproScript = rel(script);
    } catch { /* ignore */ }

    finding.evidence = evidence;
    return finding;
  };

  /** Harvest new signals into findings. */
  const drainSignals = async (collector = ctx.collector) => {
    let fresh = 0;
    for (const signal of collector.all()) {
      if (signal.__harvested) continue;
      signal.__harvested = true;
      const finding = signalToFinding(signal, target);
      if (!finding) continue;
      const stored = ctx.book.add(finding);
      if (!stored) continue;
      fresh++;
      const isNew = stored.occurrences === (finding.occurrences || 1);
      if (isNew) announce(stored);
    }
    return fresh;
  };

  /* --------------------------------------------------------- action exec */

  const runAction = async (page, action) => {
    const timeout = Math.min(actionTimeoutMs, 6000);
    const loc = () => page.locator(action.selector).first();
    const step = {
      index: ctx.steps.length + 1,
      action: action.action,
      selector: action.selector,
      value: action.value ?? null,
      reason: action.reason || '',
      label: action.label || '',
      url: page.url(),
    };

    switch (action.action) {
      case 'click':
        await loc().click({ timeout, noWaitAfter: true });
        break;
      case 'type': {
        const l = loc();
        await l.click({ timeout, noWaitAfter: true }).catch(() => {});
        await l.fill(String(action.value ?? ''), { timeout });
        break;
      }
      case 'select':
        await loc().selectOption(String(action.value ?? ''), { timeout });
        break;
      case 'hover':
        await loc().hover({ timeout, force: true });
        break;
      case 'keyboard': {
        const l = loc();
        await l.focus({ timeout }).catch(() => {});
        await page.keyboard.press(String(action.value || 'Enter'));
        break;
      }
      case 'scroll': {
        const sel = action.selector === 'window' ? null : action.selector;
        await page.evaluate(({ sel, where }) => {
          const el = sel ? document.querySelector(sel) : null;
          const t = el || document.scrollingElement || document.documentElement;
          const top = where === 'top' ? 0 : where === 'middle' ? (t.scrollHeight - t.clientHeight) / 2 : t.scrollHeight;
          if (el) el.scrollTop = top; else window.scrollTo(0, top);
        }, { sel, where: action.value || 'bottom' });
        await sleep(rng.int(120, 420));
        break;
      }
      case 'submit': {
        await page.evaluate((sel) => {
          const form = document.querySelector(sel)?.closest?.('form') || document.querySelector(sel);
          if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
          else if (form && typeof form.submit === 'function') form.submit();
        }, action.selector);
        break;
      }
      case 'wait':
        await sleep(Number(action.value) || 500);
        break;
      case 'goto':
        await page.goto(action.value, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
        break;
      default:
        throw new Error(`unknown action ${action.action}`);
    }
    return step;
  };

  /* ------------------------------------------------------------- crawling */

  const queue = [{ url: target.entryUrl, depth: 0 }];
  const enqueued = new Set([normalizeUrl(target.entryUrl)]);
  const visited = new Set();

  /**
   * The single URL policy for the whole run.
   * @returns {string} either an allowed absolute href, or a short reason token
   *   explaining the refusal (`cross-origin`, `dangerous`, `not-matched`, …).
   */
  const allowedUrl = (raw, depth, { forPopup = false } = {}) => {
    let url;
    try { url = new URL(raw); } catch { return 'unparseable'; }
    if (!/^https?:$/.test(url.protocol)) return 'non-http';
    if (NON_HTML.test(url.pathname)) return 'non-html';
    if (DANGEROUS_URL.test(url.pathname) && !target.explore?.allowDangerous) return 'dangerous';
    const sameOrigin = url.origin === new URL(target.entryUrl).origin;
    if (!sameOrigin && !target.explore?.allowCrossOrigin) return 'cross-origin';
    const deny = target.explore?.denyUrlPatterns || [];
    if (deny.length && matchAny(deny, url.href)) return 'denied';
    const allow = target.explore?.urlPatterns || ['**/*'];
    if (allow.length && !allow.some((p) => globToRegExp(p).test(url.href))) return 'not-matched';
    // A popup is opened *by* an already-approved page, so it is not charged
    // against the crawl depth budget.
    if (!forPopup && depth > (target.explore?.maxDepth ?? 3)) return 'too-deep';
    return url.href;
  };

  /* ------------------------------------------------------------ main loop */

  try {
    // A fresh page per run keeps state clean and gives every run a recorder.
    let page = await openPage();
    if (record) {
      // The recording lives inside artifacts/ so that every piece of evidence a
      // finding points at is reachable through one uniform relative path.
      recorder = new Recorder({ dir: path.join(artifactsDir, 'video'), logger });
      ctx.recorder = recorder;
      await recorder.start(page);
    }

    // Title card: the recording opens by stating what is about to be tested, so
    // a viewer needs no other context.
    if (hud && introSeconds > 0) {
      try {
        await page.evaluate(
          (html) => {
            if (!window.__webprobeHud) throw new Error('overlay API unavailable on this document');
            window.__webprobeHud.showCard(html);
          },
          renderIntroCard({ target, config: report.config, browser: browser.meta }),
        );
        // Force one compositor frame immediately: on a still page the very first
        // paint of the card can otherwise be missed by the screencast.
        await page.screenshot({ type: 'jpeg', quality: 30 }).catch(() => {});
        await sleep(introSeconds * 1000);
        await page.evaluate(() => window.__webprobeHud && window.__webprobeHud.hideCard());
        timeline('intro', '开场信息卡已展示');
      } catch (err) {
        logger.warn(`开场卡显示失败：${err.message.split('\n')[0]}`);
      }
    }

    await syncHud({ action: '开始动态测试…' });
    timeline('start', '开始动态测试');

    while (queue.length > 0) {
      if (Date.now() > ctx.deadline) {
        ctx.aborted = true;
        ctx.abortReason = `达到时间预算上限 ${formatDuration(maxDurationMs)}`;
        timeline('budget', ctx.abortReason);
        logger.warn(ctx.abortReason);
        break;
      }
      if (ctx.stats.pagesVisited >= maxPages) {
        ctx.aborted = true;
        ctx.abortReason = `达到页面预算上限 ${maxPages} 页`;
        timeline('budget', ctx.abortReason);
        break;
      }

      const { url, depth } = queue.shift();
      const norm = normalizeUrl(url);
      if (visited.has(norm)) continue;
      visited.add(norm);

      // A crashed page cannot be reused.
      if (!page || page.isClosed() || ctx.collector?.crashed) {
        ctx.collector = new SignalCollector({ target, logger });
        page = await openPage();
      }
      ctx.collector.setStep({ action: 'goto', selector: null, value: url });

      logger.step(`[${ctx.stats.pagesVisited + 1}/${maxPages}] 打开 ${urlLabel(url)}`);
      timeline('goto', `打开 ${url}`, { depth });
      await hudCall('setAction', `打开页面 ${urlLabel(url)}（第 ${ctx.stats.pagesVisited + 1}/${maxPages} 页）`);
      await hudCall('clearHighlight');

      let navigated = false;
      try {
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs });
        navigated = true;
        timeline('loaded', `已加载 ${url}${res ? ` (HTTP ${res.status()})` : ''}`);
        // Let client-side rendering and lazy requests settle, but never block
        // the whole run on a chatty page.
        await withTimeout(
          page.waitForLoadState('networkidle').catch(() => {}),
          6000,
          null,
        );
        await sleep(rng.int(250, 700));
      } catch (err) {
        const msg = err.message.split('\n')[0];
        timeline('error', `打开失败：${msg}`);
        logger.warn(`  打开失败：${msg}`);
        ctx.book.add(signalToFinding({
          type: 'http-error', message: `页面导航失败：${msg}`, url, stack: [],
          source: 'navigation', step: { action: 'goto', url }, count: 1,
        }, target));
      }

      ctx.stats.pagesVisited++;
      ctx.stats.pageVisits++;
      ctx.coverage.visited.push(url);
      if (!navigated) continue;

      // The navigation replaced the document, and with it the overlay: restore
      // the header, counters and the accumulated findings feed before going on.
      await syncHud({ action: `已加载 ${urlLabel(page.url())} — 开始静态审计…` });

      // --- passive observations -------------------------------------------
      await drainSignals();

      // --- active probes --------------------------------------------------
      const resp = await probeResponsiveness(page, ctx.collector);
      if (!resp.ok) timeline('anomaly', `主线程无响应 ${resp.latencyMs}ms`);

      // --- DOM audit + declared assertions --------------------------------
      await auditPage(page, ctx.collector, 'audit');
      await hudCall('setAction', `静态审计完成 — 开始交互与模糊测试`);

      // --- declared flows (scripted user journeys) -------------------------
      if (flows && Array.isArray(target.flows)) {
        for (const flow of target.flows) {
          if (!urlPatternMatches(flow.urlPattern, page.url())) continue;
          logger.debug(`  执行流程 ${flow.id}`);
          timeline('flow', `执行流程 ${flow.name || flow.id}`);
          for (const stepDef of flow.steps || []) {
            if (Date.now() > ctx.deadline) break;
            const action = { ...stepDef, reason: `flow:${flow.id}` };
            await hudCall('setAction', `声明式流程「${flow.name || flow.id}」：${describeAction(action, 0, 0).replace(/^\[0\/0\] /, '')}`);
            try {
              const step = await runAction(page, action);
              ctx.steps.push(step);
              await sleep(rng.int(120, 400));
              await drainSignals();
            } catch (err) {
              ctx.actionErrors.push({ flow: flow.id, action, error: err.message.split('\n')[0] });
              logger.debug(`    流程步骤失败：${err.message.split('\n')[0]}`);
            }
          }
          try {
            const results = await runAssertions(page, target, ctx.collector, {
              url: page.url(), step: { action: `flow:${flow.id}`, url: page.url() },
            });
            ctx.assertionResults.push(...results.map((r) => ({ ...r, url: page.url(), flow: flow.id })));
            await drainSignals();
          } catch { /* ignore */ }
        }
      }

      // --- discover the UI, then fuzz it ----------------------------------
      let discovery = { elements: [], scrollers: [], summary: {} };
      try {
        discovery = await withTimeout(page.evaluate(DISCOVER_SCRIPT), 12_000, discovery);
      } catch (err) {
        logger.debug(`  元素发现失败：${err.message.split('\n')[0]}`);
      }

      // Harvest navigation targets for the crawler.
      for (const el of discovery.elements || []) {
        if (el.kind !== 'link' || !el.href) continue;
        if (el.target === '_blank') continue;
        const ok = allowedUrl(el.href, depth + 1);
        if (typeof ok === 'string' && !ok.startsWith('http')) {
          ctx.coverage.skipped.push({ url: el.href, reason: ok, from: page.url() });
          continue;
        }
        if (!ok) continue;
        const n = normalizeUrl(ok);
        if (visited.has(n) || enqueued.has(n)) continue;
        enqueued.add(n);
        queue.push({ url: ok, depth: depth + 1 });
        ctx.coverage.discovered.push(ok);
      }

      logger.debug(`  发现 ${discovery.summary?.total ?? 0} 个可交互元素，队列剩余 ${queue.length} 个页面`);

      if (target.fuzz?.enabled !== false && (discovery.elements || []).length > 0) {
        const actions = planActions(discovery, { target, rng, logger });
        const budget = Math.min(actions.length, maxActions);
        logger.info(`  模糊测试：执行 ${budget} 个动作`);
        timeline('fuzz', `对 ${page.url()} 执行 ${budget} 个动作`);

        for (let i = 0; i < budget; i++) {
          if (Date.now() > ctx.deadline) break;
          if (ctx.collector?.crashed) {
            logger.warn('  渲染进程崩溃，重新创建页面继续测试');
            ctx.pageCrashes++;
            ctx.collector = new SignalCollector({ target, logger });
            page = await openPage();
            break;
          }
          const action = actions[i];
          ctx.collector.setStep({
            index: ctx.steps.length + 1, action: action.action,
            selector: action.selector, value: action.value ?? null, url: page.url(),
          });
          await hudCall('setAction', describeAction(action, i + 1, budget));
          try {
            const step = await runAction(page, action);
            ctx.steps.push(step);
            ctx.stats.actionsExecuted++;
          } catch (err) {
            // A missing element is not a bug in the software under test; the UI
            // simply changed under us. Record it, do not report it.
            ctx.actionErrors.push({ action, error: err.message.split('\n')[0] });
            ctx.steps.push({
              index: ctx.steps.length + 1, action: action.action, selector: action.selector,
              value: action.value ?? null, reason: action.reason, failed: err.message.split('\n')[0],
              url: page.url(),
            });
          }
          await sleep(rng.int(60, 220));

          // Cheap responsiveness probe every so often.
          if (i % 12 === 11) await probeResponsiveness(page, ctx.collector, { timeoutMs: 2000 });
          const fresh = await drainSignals();
          if (fresh > 0) {
            // Capture evidence for anything just discovered while it is still on screen.
            for (const f of ctx.book.all()) {
              if (!ctx.capturedSignatures.has(f.signature)) await captureEvidence(page, f);
            }
          }
          // Re-send the whole overlay state periodically. A site's own
          // client-side routing (or any reload) replaces the document and with
          // it the overlay, so restoring state only after our own navigations
          // left the panel showing an empty feed for long stretches.
          if (i % 8 === 7) await syncHud({ keepAction: true });

          // A click may have navigated us somewhere new.
          const nowUrl = page.url();
          if (nowUrl !== url && !visited.has(normalizeUrl(nowUrl))) {
            const ok = allowedUrl(nowUrl, depth + 1);
            if (ok && !enqueued.has(normalizeUrl(ok))) {
              enqueued.add(normalizeUrl(ok));
              queue.push({ url: ok, depth: depth + 1 });
              ctx.coverage.discovered.push(ok);
              break;
            }
            break;
          }
        }

        if (ctx.steps.length > 400) ctx.steps.splice(0, ctx.steps.length - 400);
      }

      await drainSignals();

      // Anything still lacking evidence gets captured on the page it was seen.
      if (!page.isClosed()) {
        for (const f of ctx.book.all()) {
          if (!ctx.capturedSignatures.has(f.signature)) {
            await captureEvidence(page, f);
          }
        }
      }

      const elapsed = Date.now() - ctx.startedAt;
      await syncHud({ keepAction: true });
      const last = ctx.timeline[ctx.timeline.length - 1];
      if (last?.type !== 'finding') {
        logger.debug(`  页面完成，用时 ${formatDuration(elapsed)}，累计 ${ctx.book.size} 个问题`);
      }
    }

    if (queue.length === 0 && !ctx.aborted) {
      timeline('coverage', `队列已清空，共访问 ${ctx.stats.pagesVisited} 个页面`);
    }
  } catch (err) {
    ctx.abortReason = `引擎异常：${err.message}`;
    logger.error(`引擎异常：${err.stack || err.message}`);
    timeline('error', ctx.abortReason);
  } finally {
    /* ------------------------------------------------------- teardown */
    // Finalise *before* teardown so the closing card can show real finding ids
    // and the verdict the viewer needs — this is what makes the recording
    // self-contained rather than a silent tour of pages.
    const finalFindings = ctx.book.finalize();

    // Proof that the overlay really did its job, recorded in the report rather
    // than inferred from whether the recording "looks right".
    if (hud && currentPage && !currentPage.isClosed()) {
      try {
        ctx.hudState = await currentPage.evaluate(() => {
          const root = document.getElementById('__webprobe_hud');
          return {
            rootPresent: !!root,
            feedRows: root ? root.querySelectorAll('.wp-row').length : 0,
            feedText: root ? (root.querySelector('.wp-findings')?.textContent || '').slice(0, 120) : '',
            statsText: root ? (root.querySelector('.wp-stats')?.textContent || '').slice(0, 120) : '',
            actionText: root ? (root.querySelector('.wp-action')?.textContent || '').slice(0, 120) : '',
            cardPresent: !!document.getElementById('__webprobe_card'),
          };
        });
      } catch { /* page gone */ }
    }
    if (hud && outroSeconds > 0 && currentPage && !currentPage.isClosed()) {
      try {
        const summary = report;
        summary.stats = {
          ...summary.stats,
          pagesVisited: ctx.stats.pagesVisited,
          actionsExecuted: ctx.stats.actionsExecuted,
          requests: ctx.collector?.networkLog.length ?? 0,
          failedRequests: ctx.collector?.failedRequests.length ?? 0,
          findings: finalFindings.length,
          bySeverity: countBy(finalFindings, 'severity'),
          firstPartyFindings: finalFindings.filter((f) => f.party === 'first-party').length,
          thirdPartyFindings: finalFindings.filter((f) => f.party === 'third-party').length,
        };
        summary.durationMs = Date.now() - ctx.startedAt;
        summary.popups = {
          audited: popups.audited,
          skipped: popups.skipped,
        };
        await currentPage.evaluate(
          (html) => {
            if (!window.__webprobeHud) throw new Error('overlay API unavailable on this document');
            window.__webprobeHud.showCard(html);
          },
          renderOutroCard({
            report: summary,
            findings: finalFindings,
            runDir: path.relative(process.cwd(), runDir),
          }),
        );
        timeline('outro', `展示测试结果卡（${finalFindings.length} 个缺陷）`);
        await currentPage.screenshot({ type: 'jpeg', quality: 30 }).catch(() => {});
        await sleep(outroSeconds * 1000);
      } catch (err) {
        logger.warn(`收尾卡显示失败：${err.message.split('\n')[0]}`);
      }
    }
    await closePage();
    if (recorder) {
      ctx.recorderResult = await recorder.stop({ fileName: `${runId}.mp4` });
      if (ctx.recorderResult?.video) {
        timeline('video', `录像已生成 ${path.relative(process.cwd(), ctx.recorderResult.video)}`);
      }
    }
    try { await browser.close(); } catch {}
  }

  /* ---------------------------------------------------------- finalize */

  const findings = ctx.book.finalize();

  // Attach replay steps + a repro script to each finding that lacks one.
  for (const f of findings) {
    if (!f.repro?.steps?.length) {
      f.repro = buildRepro(target, f, ctx.steps);
    }
    if (f.evidence && Object.keys(f.evidence).length && !f.evidence.reproScript) {
      // captureEvidence already wrote one for captured findings; this covers the rest.
    }
    f.occurrences = Math.max(1, f.occurrences);
  }

  // Second evidence pass: give the high-severity findings a pointer to the run
  // recording. Paths here are relative to artifacts/, matching every other
  // evidence path, so the dashboard can serve them with one URL rule.
  if (ctx.recorderResult?.video) {
    const rel = path.relative(artifactsDir, ctx.recorderResult.video).split(path.sep).join('/');
    for (const f of findings) {
      if (f.severity === 'critical' || f.severity === 'high') {
        f.evidence = { ...(f.evidence || {}), video: rel };
      }
    }
  }

  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - ctx.startedAt;
  report.findings = findings;
  report.timeline = ctx.timeline;
  report.coverage = {
    ...ctx.coverage,
    visited: [...new Set(ctx.coverage.visited)],
    discovered: [...new Set(ctx.coverage.discovered)],
    skipped: dedupeSkipped(ctx.coverage.skipped),
    // Assertions are evaluated more than once per page (right after load, and
    // again after the scripted flows have changed the page state). The run log
    // keeps every evaluation, but the report should show one verdict per
    // (assertion, page), reflecting the final observed state.
    assertions: dedupeAssertions(ctx.assertionResults),
  };
  report.stats = {
    ...ctx.stats,
    pagesVisited: ctx.stats.pagesVisited,
    pageVisits: ctx.stats.pageVisits,
    actionsExecuted: ctx.stats.actionsExecuted,
    requests: ctx.collector?.networkLog.length ?? 0,
    failedRequests: ctx.collector?.failedRequests.length ?? 0,
    consoleMessages: ctx.collector?.consoleLog.length ?? 0,
    findings: findings.length,
    bySeverity: countBy(findings, 'severity'),
    byKind: countBy(findings, 'kind'),
    byParty: countBy(findings, 'party'),
    firstPartyFindings: findings.filter((f) => f.party === 'first-party').length,
    thirdPartyFindings: findings.filter((f) => f.party === 'third-party').length,
    knownFromPreviousRuns: findings.filter((f) => f.known).length,
    pageCrashes: ctx.pageCrashes,
    actionErrors: ctx.actionErrors.length,
    aborted: ctx.aborted,
    abortReason: ctx.abortReason,
  };
  report.video = ctx.recorderResult?.video
    ? path.relative(ctx.runDir, ctx.recorderResult.video).split(path.sep).join('/')
    : null;
  report.videoNote = ctx.recorderResult?.note ?? null;
  report.actionErrors = ctx.actionErrors.slice(-100);
  report.popups = {
    seen: popups.seen,
    audited: popups.audited,
    skipped: popups.skipped,
    urls: [...new Set(popups.urls)],
  };
  report.hud = {
    enabled: hud,
    errors: hudErrors.slice(-20),
    stateAtEnd: ctx.hudState ?? null,
  };

  await writeReportFiles(report, { runDir, artifactsDir, logger, target });

  logger.raw('');
  logger.raw(`  ${logger.paint('bold', '测试完成')}  用时 ${formatDuration(report.durationMs)}`);
  logger.raw(`  访问页面 ${report.stats.pagesVisited} · 执行动作 ${report.stats.actionsExecuted} · 网络请求 ${report.stats.requests}（失败 ${report.stats.failedRequests}）`);
  logger.raw(`  ${logger.paint(report.findings.length ? 'yellow' : 'green', `发现缺陷 ${report.findings.length} 个`)}  ${severitySummary(report.stats.bySeverity)}`);
  logger.raw(`  报告：${path.relative(process.cwd(), path.join(runDir, 'report.html'))}`);
  if (report.video) logger.raw(`  录像：${path.relative(process.cwd(), ctx.recorderResult.video)}`);
  logger.raw('');

  return report;
}

/* ------------------------------------------------------------------ helpers */

function severityColor(sev) {
  return { critical: 'red', high: 'red', medium: 'yellow', low: 'blue', info: 'grey' }[sev] ?? 'reset';
}

/** One-line description of an action, for the on-page status line. */
function describeAction(action, index, total) {
  const label = action.label ? `（${truncate(action.label, 26)}）` : '';
  const head = `[${index}/${total}]`;
  switch (action.action) {
    case 'click': return `${head} 点击 ${action.selector}${label}`;
    case 'type': return `${head} 在 ${action.selector} 输入 ${JSON.stringify(truncate(String(action.value ?? ''), 24))}`;
    case 'select': return `${head} 在 ${action.selector} 选择 ${action.value}`;
    case 'hover': return `${head} 悬停 ${action.selector}${label}`;
    case 'keyboard': return `${head} 在 ${action.selector} 按下 ${action.value}`;
    case 'scroll': return `${head} 滚动 ${action.selector} → ${action.value}`;
    case 'submit': return `${head} 提交表单 ${action.selector}`;
    case 'wait': return `${head} 等待 ${action.value}ms`;
    default: return `${head} ${action.action} ${action.selector || ''}`;
  }
}

function severitySummary(bySeverity = {}) {
  return ['critical', 'high', 'medium', 'low', 'info']
    .filter((s) => bySeverity[s])
    .map((s) => `${s}=${bySeverity[s]}`)
    .join(' ') || '(无)';
}

function countBy(items, key) {
  const out = {};
  for (const i of items) out[i[key]] = (out[i[key]] || 0) + 1;
  return out;
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    // Trailing slash and default ports should not create distinct pages.
    let s = url.href;
    if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return String(u);
  }
}

function dedupeSkipped(skipped) {
  const seen = new Set();
  const out = [];
  for (const s of skipped) {
    const k = `${s.url}|${s.reason}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (out.length < 200) out.push(s);
  }
  return out;
}

/** One verdict per (assertion, page); the last evaluation wins. */
function dedupeAssertions(results) {
  const byKey = new Map();
  for (const r of results) {
    const key = `${r.assertion.id ?? r.assertion.kind}|${r.url}`;
    byKey.set(key, {
      id: r.assertion.id,
      kind: r.assertion.kind,
      ok: r.ok,
      detail: r.detail,
      url: r.url,
    });
  }
  return [...byKey.values()];
}

/** Human-readable reproduction steps, capped so reports stay readable. */
export function buildRepro(target, finding, steps) {
  const relevant = (steps || []).filter((s) => !s.failed).slice(-25);
  const out = [`打开 ${finding.url || target.entryUrl}`];
  for (const s of relevant) {
    switch (s.action) {
      case 'click':
        out.push(`点击 ${s.selector}${s.label ? `（${truncate(s.label, 30)}）` : ''}`);
        break;
      case 'type':
        out.push(`在 ${s.selector} 输入 ${JSON.stringify(truncate(String(s.value ?? ''), 40))}`);
        break;
      case 'select':
        out.push(`在 ${s.selector} 选择 ${s.value}`);
        break;
      case 'hover':
        out.push(`悬停 ${s.selector}`);
        break;
      case 'keyboard':
        out.push(`在 ${s.selector} 按下 ${s.value}`);
        break;
      case 'scroll':
        out.push(`将 ${s.selector} 滚动到 ${s.value}`);
        break;
      case 'submit':
        out.push(`提交表单 ${s.selector}`);
        break;
      case 'goto':
        out.push(`打开 ${s.value}`);
        break;
      default:
        break;
    }
  }
  out.push(`→ 观察到：${truncate(finding.message || finding.title, 160)}`);
  return { steps: out, script: finding.repro?.script || '' };
}

/** Generate a standalone Playwright script that replays one bug. */
function buildReproScript(target, finding, steps) {
  const relevant = (steps || []).filter((s) => !s.failed).slice(-25);
  const lines = [
    `// ${PLATFORM.name} 自动生成的最小复现脚本`,
    `// 缺陷：${finding.title}`,
    `// 类型：${finding.kind}  严重级：${finding.severity}  签名：${finding.signature}`,
    `// 运行：node --experimental-default-type=module repro.spec.mjs`,
    `import { chromium } from 'playwright-core';`,
    ``,
    `const browser = await chromium.launch({ headless: process.env.HEADFUL ? false : true });`,
    `const context = await browser.newContext(${JSON.stringify({
      viewport: target.viewport, locale: target.locale, timezoneId: target.timezoneId,
    })});`,
    `const page = await context.newPage();`,
    ``,
    `// 复现过程中浏览器报告的错误都会打印出来`,
    `page.on('pageerror', (e) => console.log('[pageerror]', e.message));`,
    `page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });`,
    `page.on('requestfailed', (r) => console.log('[requestfailed]', r.url(), r.failure()?.errorText));`,
    ``,
    `page.on('response', (r) => { if (r.status() >= 400) console.log('[http]', r.status(), r.url()); });`,
    ``,
    `await page.goto(${JSON.stringify(finding.url || target.entryUrl)}, { waitUntil: 'domcontentloaded' });`,
  ];
  for (const s of relevant) {
    switch (s.action) {
      case 'click':
        lines.push(`await page.locator(${JSON.stringify(s.selector)}).first().click({ timeout: 5000 }).catch(() => {});`);
        break;
      case 'type':
        lines.push(`await page.locator(${JSON.stringify(s.selector)}).first().fill(${JSON.stringify(String(s.value ?? ''))}).catch(() => {});`);
        break;
      case 'select':
        lines.push(`await page.locator(${JSON.stringify(s.selector)}).first().selectOption(${JSON.stringify(String(s.value ?? ''))}).catch(() => {});`);
        break;
      case 'hover':
        lines.push(`await page.locator(${JSON.stringify(s.selector)}).first().hover().catch(() => {});`);
        break;
      case 'keyboard':
        lines.push(`await page.locator(${JSON.stringify(s.selector)}).first().press(${JSON.stringify(String(s.value || 'Enter'))}).catch(() => {});`);
        break;
      case 'scroll':
        lines.push(`await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));`);
        break;
      case 'submit':
        lines.push(`await page.evaluate(() => document.querySelector(${JSON.stringify(s.selector)})?.closest('form')?.requestSubmit());`);
        break;
      case 'goto':
        lines.push(`await page.goto(${JSON.stringify(s.value)}, { waitUntil: 'domcontentloaded' }).catch(() => {});`);
        break;
      default:
        break;
    }
  }
  lines.push(
    ``,
    `await page.waitForTimeout(1500);`,
    `console.log(${JSON.stringify(`期望在此处观察到：${truncate(finding.message, 200)}`)});`,
    `await browser.close();`,
    ``,
  );
  return lines.join('\n');
}

export { SEVERITY_ORDER, safeFileName };
