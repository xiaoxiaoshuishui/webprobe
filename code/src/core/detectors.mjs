/**
 * Detectors: judgement.
 *
 * Three independent sources of defects feed the same deduplicating `FindingBook`:
 *
 *   1. Signal detectors  — raw browser signals (exceptions, failures, crashes…)
 *   2. DOM audit         — active inspection of the live document for the
 *                          "silent" defects no event reports: leaked template
 *                          variables, broken images, frozen containers, overflow
 *   3. Assertions        — user-declared expectations from target.json
 *
 * Every finding keeps the action that produced it, so it can be replayed.
 */

import { FINDING_KINDS, applyPartyPolicy, hostOf, makeFinding, normalizeSignal } from './schema.mjs';

/* ------------------------------------------------------------- signal → bug */

/** Map a raw signal type to a finding kind. */
const SIGNAL_KIND = {
  'js-exception': 'js-exception',
  'unhandled-rejection': 'unhandled-rejection',
  'console-error': 'console-error',
  'console-warning': 'console-warning',
  'http-error': 'http-error',
  'resource-error': 'resource-error',
  'page-crash': 'page-crash',
  'unresponsive': 'unresponsive',
  security: 'security',
  'long-task': 'performance',
};

/**
 * Long tasks are reported through two channels with different meanings:
 *   ≥ 1s  — the main thread was synchronously blocked for a second or more.
 *           That is the "frozen UI" defect users complain about, so it is
 *           classified as `unresponsive` (critical), not as a performance nit.
 *   250ms–1s — noticeable jank; reported as a low-severity performance issue.
 *   < 250ms  — ignored; normal for a content-heavy page.
 */
const JANK_MS = 250;
const FREEZE_MS = 1000;

export function signalToFinding(signal, target) {
  if (signal.type === 'assertion-failed') return assertionSignalToFinding(signal, target);

  if (signal.type === 'long-task') {
    const d = Math.round(signal.duration || 0);
    if (d < JANK_MS) return null;
    if (d >= FREEZE_MS) {
      const f = makeFinding({
        kind: 'unresponsive',
        severity: 'critical',
        title: `主线程被同步阻塞 ${d}ms（界面冻结）`,
        message: `页面主线程被一次耗时 ${d}ms 的同步任务独占（阈值 ${FREEZE_MS}ms）。阻塞期间浏览器无法处理点击、输入与滚动，用户看到的是界面卡死。`,
        url: signal.url,
        stack: [],
        step: signal.step,
        context: { source: 'longtask-observer', durationMs: d },
        tags: ['signal', 'inpage', 'longtask'],
        target: target?.id ?? null,
        dedupeKey: `freeze|${hostOf(signal.url || '')}`,
      });
      f.occurrences = signal.count || 1;
      return applyPartyPolicy(f, target);
    }
    const f = makeFinding({
      kind: 'performance',
      severity: 'low',
      title: `主线程长任务 ${d}ms`,
      message: `检测到一次耗时 ${d}ms 的长任务，会造成可感知的卡顿（阈值 ${JANK_MS}ms）。`,
      url: signal.url,
      stack: [],
      step: signal.step,
      context: { source: 'longtask-observer', durationMs: d },
      tags: ['signal', 'inpage', 'longtask'],
      target: target?.id ?? null,
      dedupeKey: `jank|${hostOf(signal.url || '')}|${d >= 500 ? 'severe' : 'minor'}`,
    });
    f.occurrences = signal.count || 1;
    return applyPartyPolicy(f, target);
  }

  const kind = SIGNAL_KIND[signal.type];
  if (!kind) return null;
  if (!FINDING_KINDS[kind]) return null;

  const meta = FINDING_KINDS[kind];
  const message = signal.message || meta.label;
  const title = buildTitle(kind, signal);

  /**
   * Network-layer defects repeat once per affected resource. A page that fails
   * seventeen requests to the same ad host has one problem, not seventeen, so
   * those two kinds dedupe on (host, failure mode) while the report still keeps
   * the concrete URL and status of each victim.
   */
  let dedupeKey = null;
  if (kind === 'http-error' || kind === 'resource-error') {
    const host = hostOf(signal.resourceUrl || signal.url || '');
    dedupeKey = `${signal.subtype || ''}|${host}|${signal.status ? `HTTP ${signal.status}` : signal.errorText || 'failure'}`;
  } else if (kind === 'security') {
    dedupeKey = `${signal.subtype || 'security'}|${hostOf(signal.url || '')}|${signal.insecureHost || ''}`;
  }

  const finding = makeFinding({
    kind,
    title,
    message,
    url: signal.url || signal.resourceUrl || '',
    stack: signal.stack?.length ? signal.stack : [],
    step: signal.step,
    evidence: {},
    context: {
      source: signal.source || 'unknown',
      ...(signal.status ? { status: signal.status } : {}),
      ...(signal.resourceType ? { resourceType: signal.resourceType } : {}),
      ...(signal.resourceUrl ? { resourceUrl: signal.resourceUrl } : {}),
      ...(signal.errorText ? { errorText: signal.errorText } : {}),
      ...(signal.name ? { errorName: signal.name } : {}),
      ...(signal.latencyMs ? { latencyMs: signal.latencyMs } : {}),
      ...(signal.duration ? { durationMs: signal.duration } : {}),
      ...(signal.location ? { location: signal.location } : {}),
      ...(signal.subtype ? { subtype: signal.subtype } : {}),
      ...(signal.secret ? { secretKind: signal.secret.label } : {}),
      ...(signal.pageHost ? { pageHost: signal.pageHost } : {}),
      ...(signal.insecureHost ? { insecureHost: signal.insecureHost } : {}),
    },
    tags: ['signal', signal.source || 'unknown'],
    target: target?.id ?? null,
    extraKey: signal.step?.selector || '',
    dedupeKey,
  });
  finding.occurrences = signal.count || 1;
  return applyPartyPolicy(finding, target);
}

function buildTitle(kind, signal) {
  const m = signal.message || '';
  switch (kind) {
    case 'page-crash':
      return '渲染进程崩溃';
    case 'unresponsive':
      return '页面主线程无响应（UI 冻结）';
    case 'js-exception':
      return `未捕获异常：${firstLine(m)}`;
    case 'unhandled-rejection':
      return `未处理的 Promise 拒绝：${firstLine(m)}`;
    case 'http-error':
      return `接口/资源返回 HTTP ${signal.status ?? '?'}：${shortUrl(signal.resourceUrl || m)}`;
    case 'resource-error':
      return signal.subtype === 'empty-src'
        ? `元素 src 为空导致指向页面自身的无效请求`
        : `资源加载失败：${shortUrl(signal.resourceUrl || m)}`;
    case 'console-error':
      return `console.error：${firstLine(m)}`;
    case 'console-warning':
      return `console.warn：${firstLine(m)}`;
    case 'security':
      return signal.subtype === 'csp-violation'
        ? 'CSP 内容安全策略拦截'
        : signal.subtype === 'mixed-content'
          ? '混合内容（HTTPS 页面加载 HTTP 资源）'
          : signal.subtype === 'secret-in-console'
            ? '敏感信息泄露到控制台'
            : `安全问题：${firstLine(m)}`;
    case 'performance':
      return `主线程长任务：${signal.duration ? Math.round(signal.duration) + 'ms' : firstLine(m)}`;
    default:
      return firstLine(m) || FINDING_KINDS[kind]?.label || kind;
  }
}

function firstLine(s) {
  const t = String(s || '').split('\n')[0].trim();
  return t.length > 110 ? t.slice(0, 109) + '…' : t;
}

function shortUrl(u) {
  try {
    const url = new URL(u);
    return `${url.host}${url.pathname}`.slice(0, 90);
  } catch {
    return String(u).slice(0, 90);
  }
}

/* ------------------------------------------------------------- finding book */

/**
 * Deduplicating store of findings. Identical defects observed many times (or on
 * many pages) collapse into one entry that remembers how often and where.
 */
export class FindingBook {
  constructor({ target, knownSignatures = new Set() } = {}) {
    this.target = target;
    this.map = new Map();
    this.order = [];
    this.knownSignatures = knownSignatures;
    this.suppressed = 0;
  }

  /** @returns the stored finding (new or merged). */
  add(finding) {
    if (!finding) return null;
    const key = finding.signature;
    const existing = this.map.get(key);
    if (existing) {
      existing.occurrences += finding.occurrences || 1;
      existing.lastSeenAt = new Date().toISOString();
      if (!existing.stack?.length && finding.stack?.length) existing.stack = finding.stack;
      if (!existing.url && finding.url) existing.url = finding.url;
      if (!existing.step && finding.step) existing.step = finding.step;
      if (!existing.repro.steps.length && finding.repro.steps.length) existing.repro = finding.repro;
      // Grouped findings keep a short list of the concrete victims, so a
      // collapsed report is still actionable ("which seventeen requests?").
      const newUrl = finding.context?.resourceUrl;
      if (newUrl && newUrl !== existing.context?.resourceUrl) {
        const related = existing.context.relatedUrls || [];
        if (related.length < 12 && !related.includes(newUrl)) {
          existing.context.relatedUrls = [...related, newUrl];
        }
      }
      // Keep the first evidence set but merge new artifact paths.
      for (const [k, v] of Object.entries(finding.evidence || {})) {
        if (k === 'screenshots') {
          existing.evidence.screenshots = [...new Set([...(existing.evidence.screenshots || []), ...(v || [])])].slice(0, 6);
        } else if (!existing.evidence[k]) {
          existing.evidence[k] = v;
        }
      }
      // Corroborating signals from several sources raise confidence.
      for (const t of finding.tags || []) {
        if (!existing.tags.includes(t)) existing.tags.push(t);
      }
      return existing;
    }
    finding.known = this.knownSignatures.has(key);
    finding.id = null; // assigned at report time
    this.map.set(key, finding);
    this.order.push(key);
    return finding;
  }

  get size() {
    return this.map.size;
  }

  all() {
    return this.order.map((k) => this.map.get(k));
  }

  /** Assign stable, human-friendly ids ordered by severity then discovery. */
  finalize() {
    const sevRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const sorted = this.all().sort((a, b) => {
      const s = (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9);
      if (s !== 0) return s;
      return b.occurrences - a.occurrences;
    });
    sorted.forEach((f, i) => {
      f.id = `F-${String(i + 1).padStart(4, '0')}`;
    });
    return sorted;
  }

  bySeverity() {
    const out = {};
    for (const f of this.all()) out[f.severity] = (out[f.severity] || 0) + 1;
    return out;
  }

  byKind() {
    const out = {};
    for (const f of this.all()) out[f.kind] = (out[f.kind] || 0) + 1;
    return out;
  }
}

/* ----------------------------------------------------------------- DOM audit */

/**
 * The in-page audit. Runs as one evaluate() call and returns raw anomalies;
 * `domAnomaliesToFindings` turns them into findings.
 *
 * Only defects that are objectively wrong are reported — a missing template
 * value or an image the server refused is a defect, whereas "the design looks
 * odd" is not something a tool should claim.
 */
export const DOM_AUDIT_SCRIPT = () => {
  const out = [];
  const MAX = 40;
  const push = (o) => { if (out.length < MAX) out.push(o); };

  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
    return true;
  };

  const describe = (el) => {
    if (!el || !el.tagName) return '';
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    else if (el.className && typeof el.className === 'string') {
      const c = el.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (c) s += `.${c}`;
    }
    return s.slice(0, 90);
  };

  /**
   * The platform draws its own overlay into the page (see hud.mjs) so that the
   * screen recording shows the findings. That overlay is not part of the
   * software under test, so every audit rule must ignore it — otherwise the
   * tool reports its own UI as a defect of the site.
   */
  const isOurs = (node) => {
    try {
      return !!(node && node.closest && node.closest('[data-webprobe]'));
    } catch (e) {
      return false;
    }
  };

  /**
   * Is this element actually painted? `getBoundingClientRect` is not enough:
   * content inside a closed <details> still reports a box in current Chromium
   * while never being rendered, so a plain rect test marks hidden markup as a
   * visible defect. `checkVisibility` is the purpose-built API and is used when
   * available.
   */
  const rendered = (el) => {
    if (typeof el.checkVisibility === 'function') {
      try {
        return el.checkVisibility({
          checkVisibilityCSS: true,
          contentVisibilityAuto: true,
          opacityProperty: true,
          visibilityProperty: true,
        });
      } catch { /* older signature */ }
    }
    return visible(el);
  };

  /* 1. leaked template / placeholder values in visible text ------------- */
  const TEMPLATE_RE = /\{\{[^{}]{1,60}\}\}|\$\{[^{}]{1,60}\}|%\([\w.]+\)s|<%=?[^%>]{1,60}%>/;
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  const seenNodes = new Set();
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || seenNodes.has(parent)) continue;
    if (isOurs(parent)) continue;
    const text = (node.nodeValue || '').trim();
    if (!text || text.length > 400) continue;
    if (!visible(parent)) continue;
    const tag = parent.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') continue;
    seenNodes.add(parent);

    const m = text.match(TEMPLATE_RE);
    if (m) {
      push({ type: 'template-leak', selector: describe(parent), detail: m[0].slice(0, 80), text: text.slice(0, 160) });
    }
  }

  /* 2. broken / refused images ------------------------------------------ */
  for (const img of Array.from(document.images || []).slice(0, 400)) {
    if (!img.getAttribute('src')) continue;
    if (img.getAttribute('data-webprobe-ignore') !== null) continue;
    if (isOurs(img)) continue;
    if (!img.complete) continue;
    if (img.naturalWidth === 0 && img.naturalHeight === 0) {
      push({
        type: 'broken-image',
        selector: describe(img),
        detail: img.currentSrc || img.src,
        text: img.alt || '',
      });
    }
  }

  /* 3. containers that should hold content but are empty ---------------- */
  // Only containers whose *name* promises a collection of items count. Player
  // surfaces, overlays, watermarks and ad slots are legitimately empty most of
  // the time, and flagging them produced pure noise on a live-streaming site.
  const KEY_RE = /(^|[-_ ])(app|root|main|content|container|list|feed|grid|results?|items?)([-_ ]|$)/i;
  const SKIP_RE = /(player|video|water|overlay|mask|\blayer\b|\bad\b|banner|modal|dialog|tooltip|popup|skeleton|loading|placeholder|toast|carousel|swiper|marquee|scroll)/i;
  for (const el of Array.from(document.querySelectorAll('div,section,main,ul,ol')).slice(0, 600)) {
    if (isOurs(el)) continue;
    const sig = `${el.id} ${typeof el.className === 'string' ? el.className : ''}`;
    if (!KEY_RE.test(sig) || SKIP_RE.test(sig)) continue;
    if (!rendered(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height < 120 || rect.width < 200) continue;
    const hasMedia = el.querySelector('img,video,canvas,svg,iframe');
    const text = (el.textContent || '').replace(/\s+/g, '');
    if (!hasMedia && text.length === 0) {
      push({ type: 'empty-container', selector: describe(el), detail: `${Math.round(rect.width)}×${Math.round(rect.height)}`, text: '' });
    }
  }

  /* 4. horizontal overflow (content wider than the viewport) ----------- */
  const docEl = document.documentElement;
  const overflow = docEl.scrollWidth - docEl.clientWidth;
  if (overflow > 12) {
    push({
      type: 'h-overflow',
      selector: 'html',
      detail: `${overflow}px`,
      text: `scrollWidth=${docEl.scrollWidth} clientWidth=${docEl.clientWidth}`,
    });
  }

  /* 5. blank screen ------------------------------------------------------ */
  // The overlay lives outside <body>, so body.innerText already measures only
  // the software under test. The visual test still has to skip our own nodes.
  const bodyText = (document.body?.innerText || '').replace(/\s+/g, '');
  const hasVisual = Array.from(document.querySelectorAll('img,video,canvas,svg,iframe')).some((n) => !isOurs(n));
  if (document.readyState === 'complete' && bodyText.length < 16 && !hasVisual) {
    push({ type: 'blank-screen', selector: 'body', detail: `可见文本 ${bodyText.length} 字`, text: bodyText.slice(0, 120) });
  }

  /* 6. duplicate ids (breaks label/aria wiring) ------------------------- */
  const idCount = new Map();
  for (const el of Array.from(document.querySelectorAll('[id]')).slice(0, 1500)) {
    // An empty id attribute is not a duplicate id; reporting `#` is meaningless.
    if (!el.id) continue;
    if (isOurs(el)) continue;
    idCount.set(el.id, (idCount.get(el.id) || 0) + 1);
  }
  const dupes = [...idCount.entries()].filter(([, n]) => n > 1).slice(0, 5);
  for (const [id, n] of dupes) {
    push({ type: 'duplicate-id', selector: `#${id}`, detail: `出现 ${n} 次`, text: '' });
  }

  /* 7. interactive elements with no accessible name ---------------------- */
  const nameless = [];
  for (const el of Array.from(document.querySelectorAll('button,[role="button"],a[href]')).slice(0, 600)) {
    if (!rendered(el)) continue;
    if (isOurs(el)) continue;
    const name = (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.innerText ||
      // textContent also covers text that is present but not painted, so a
      // merely hidden label never counts as a missing one.
      el.textContent ||
      (el.querySelector('img[alt]') && el.querySelector('img[alt]').getAttribute('alt')) ||
      ''
    ).trim();
    if (!name) nameless.push(describe(el));
    if (nameless.length >= 40) break;
  }
  if (nameless.length > 0) {
    push({
      type: 'nameless-control',
      selector: nameless.slice(0, 3).join(', '),
      detail: `${nameless.length} 个元素`,
      text: nameless.slice(0, 12).join(' | '),
    });
  }

  return out;
};

const DOM_ANOMALY_MAP = {
  'template-leak': { severity: 'high', title: (a) => `页面透出模板变量「${a.detail}」`, message: (a) => `元素 ${a.selector} 直接显示了未渲染的模板表达式 ${a.detail}，通常意味着数据绑定失败或渲染分支异常。文本片段：${a.text}` },
  'broken-image': { severity: 'medium', title: (a) => `图片加载失败：${String(a.detail).split('/').pop()}`, message: (a) => `元素 ${a.selector} 的图片未能加载（naturalWidth=0）。地址：${a.detail}` },
  'empty-container': { severity: 'medium', title: (a) => `关键容器内容为空：${a.selector}`, message: (a) => `容器 ${a.selector}（尺寸 ${a.detail}）已渲染但既无文本也无媒体元素，疑似列表/播放器渲染失败。` },
  'h-overflow': { severity: 'low', title: (a) => `页面出现横向溢出 ${a.detail}`, message: (a) => `文档宽度超过视口 ${a.detail}，会出现横向滚动条，${a.text}` },
  'blank-screen': { severity: 'critical', title: () => '页面白屏（无可见内容）', message: (a) => `文档加载完成后页面既无可见文本也无任何媒体元素。${a.detail}` },
  'duplicate-id': { severity: 'low', title: (a) => `重复的元素 id：${a.selector}`, message: (a) => `id ${a.selector} 在文档中${a.detail}，会导致 label/aria 关联和选择器行为不确定。` },
  'nameless-control': { severity: 'low', title: (a) => `可交互元素缺少可访问名称（${a.detail}）`, message: (a) => `页面上有 ${a.detail} 既无可见文本也无 aria-label / title，屏幕阅读器无法识别其用途。例如：${a.text}` },
};

export function domAnomaliesToFindings(anomalies, { url, step, target } = {}) {
  const out = [];
  for (const a of anomalies || []) {
    const spec = DOM_ANOMALY_MAP[a.type];
    if (!spec) continue;
    const finding = makeFinding({
      kind: 'dom-anomaly',
      severity: spec.severity,
      title: spec.title(a),
      message: spec.message(a),
      url,
      stack: [],
      step,
      context: {
        source: 'dom-audit', subtype: a.type, selector: a.selector, detail: a.detail, snippet: a.text,
        // For a broken image the offending URL is the party-relevant one.
        ...(a.type === 'broken-image' && a.detail ? { resourceUrl: a.detail } : {}),
      },
      tags: ['dom-audit', a.type],
      target: target?.id ?? null,
      extraKey: `${a.type}:${a.selector}`,
    });
    const kept = applyPartyPolicy(finding, target);
    if (kept) out.push(kept);
  }
  return out;
}

/* ---------------------------------------------------------------- assertions */

/**
 * Evaluate the target's declared assertions against the live page and the
 * recorded network log. Unmet assertions become findings — this is how a team
 * encodes "what correct means" for its own software.
 */
export async function runAssertions(page, target, collector, { url, step } = {}) {
  const results = [];
  const assertions = target?.assertions || [];
  for (const a of assertions) {
    if (!urlPatternMatches(a.urlPattern, url)) continue;
    let ok = true;
    let detail = '';
    try {
      switch (a.kind) {
        case 'selector': {
          const n = await page.locator(a.selector).count();
          ok = a.count != null ? n === a.count : n > 0;
          detail = `匹配 ${n} 个元素`;
          break;
        }
        case 'not-selector': {
          const n = await page.locator(a.selector).count();
          ok = n === 0;
          detail = `匹配 ${n} 个元素（期望 0）`;
          break;
        }
        case 'text': {
          const body = await page.evaluate(() => document.body?.innerText || '');
          ok = typeof a.contains === 'string' ? body.includes(a.contains) : new RegExp(a.pattern, 'i').test(body);
          detail = `页面文本长度 ${body.length}`;
          break;
        }
        case 'visible': {
          ok = await page.locator(a.selector).first().isVisible().catch(() => false);
          detail = '元素可见性检查';
          break;
        }
        case 'url': {
          ok = new RegExp(a.pattern).test(page.url());
          detail = page.url();
          break;
        }
        case 'response': {
          const hit = collector.networkLog.find(
            (n) => n.phase === 'response' && n.url.includes(a.contains) && (!a.status || n.status === a.status),
          );
          ok = !!hit;
          detail = hit ? `HTTP ${hit.status} ${hit.url}` : `未观察到 ${a.contains}`;
          break;
        }
        case 'function': {
          // Deliberately supported: a target may ship its own check expression.
          const value = await page.evaluate(a.expression);
          ok = !!value;
          detail = `表达式求值 = ${JSON.stringify(value)?.slice(0, 80)}`;
          break;
        }
        default:
          ok = true;
          detail = `未知断言类型 ${a.kind}，跳过`;
      }
    } catch (err) {
      ok = false;
      detail = `断言执行异常：${err.message.split('\n')[0]}`;
    }

    results.push({ assertion: a, ok, detail });
    if (!ok) {
      collector.add('assertion-failed', {
        message: `断言未通过 [${a.id || a.kind}]：${a.title || a.selector || a.contains || ''} — ${detail}`,
        stack: [],
        source: 'assertion',
        url,
        step,
        assertionId: a.id,
        severity: a.severity,
        detail,
      });
    }
  }
  return results;
}

/** Assertion failures are signals; this maps them to findings. */
export function assertionSignalToFinding(signal, target) {
  return applyPartyPolicy(makeFinding({
    kind: 'assertion',
    severity: signal.severity || 'medium',
    title: `断言不通过：${signal.assertionId || '未命名'}`,
    message: signal.message,
    url: signal.url,
    stack: [],
    step: signal.step,
    context: { source: 'assertion', assertionId: signal.assertionId, detail: signal.detail },
    tags: ['assertion'],
    target: target?.id ?? null,
    extraKey: signal.assertionId || '',
  }), target);
}

/**
 * Match an assertion/flow `urlPattern` against a page URL.
 *
 * The pattern is anchored: an unanchored `https://host/` silently also matches
 * `https://host/anything`, which made homepage-only assertions fire (and fail)
 * on every other page of the site. `*` stays within a path segment and `**`
 * spans segments, as in the manifest documentation.
 */
export function urlPatternMatches(pattern, url) {
  if (!pattern) return true;
  const body = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  try {
    return new RegExp(`^${body}$`).test(url);
  } catch {
    return false;
  }
}
