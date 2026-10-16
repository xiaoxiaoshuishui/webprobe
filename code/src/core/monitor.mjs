/**
 * Signal collection.
 *
 * A `SignalCollector` is the platform's sensory system. It attaches to a page
 * and records every observable anomaly as a raw *signal*, tagged with the
 * action that was being performed at the time. Turning signals into deduplicated
 * bugs is the detectors' job — keeping collection and judgement apart means a new
 * detector never requires touching the browser plumbing.
 *
 * Sources tapped:
 *   · Playwright page events  — pageerror, console, requestfailed, response, crash, dialog, popup
 *   · CDP domains             — Runtime.exceptionThrown, Log.entryAdded, Inspector.targetCrashed
 *   · Injected init script    — window 'error', 'unhandledrejection', PerformanceObserver longtask
 *   · Active probes           — main-thread responsiveness heartbeat
 */

import { normalizeSignal } from './schema.mjs';
import { sleep, truncate, withTimeout } from './util.mjs';

const LIMITS = {
  console: 2000,
  network: 4000,
  signals: 5000,
};

/** Ring-buffer push that keeps memory bounded on long runs. */
function push(buf, item, cap) {
  buf.push(item);
  if (buf.length > cap) buf.splice(0, buf.length - cap);
}

export class SignalCollector {
  constructor({ target, logger }) {
    this.target = target;
    this.logger = logger;
    this.signals = [];
    this.consoleLog = [];
    this.networkLog = [];
    this.failedRequests = [];
    this.crashed = false;
    this.unresponsive = false;
    this.dedupe = new Set();
    this.step = null;
    this.pageUrl = '';
    this._seq = 0;
  }

  /** Set the action currently being executed; signals inherit it as `repro`. */
  setStep(step) {
    this.step = step;
  }

  /**
   * Record a signal.
   * @param {string} type   internal signal type
   * @param {object} data   payload
   */
  add(type, data = {}) {
    const key = `${type}|${normalizeSignal(data.message || data.url || '')}`;
    if (this.dedupe.has(key)) {
      const prev = this.signals.find((s) => s.key === key);
      if (prev) prev.count = (prev.count || 1) + 1;
      return prev;
    }
    this.dedupe.add(key);
    const signal = {
      seq: ++this._seq,
      key,
      type,
      at: new Date().toISOString(),
      url: data.url || this.pageUrl,
      step: this.step ? { ...this.step } : null,
      count: 1,
      ...data,
    };
    push(this.signals, signal, LIMITS.signals);
    return signal;
  }

  /** All raw signals, in observation order. */
  all() {
    return this.signals;
  }

  /* -------------------------------------------------------------- network */

  addRequest(entry) {
    push(this.networkLog, entry, LIMITS.network);
  }

  addFailedRequest(entry) {
    push(this.failedRequests, entry, LIMITS.network);
  }

  stats() {
    return {
      signals: this.signals.length,
      consoleMessages: this.consoleLog.length,
      requests: this.networkLog.length,
      failedRequests: this.failedRequests.length,
    };
  }
}

/* ------------------------------------------------------------ console noise */

/** Console noise that is never a defect of the software under test. */
const DEFAULT_CONSOLE_IGNORE = [
  /Download the React DevTools/i,
  /\[vue-devtools\]/i,
  /\[HMR\]/i,
  /vite/i,
  /webpack-dev-server/i,
  /DevTools failed to load source map/i,
  /Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/i,
];

const SECRET_PATTERNS = [
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/, label: 'JWT' },
  { re: /\b(?:api[_-]?key|access[_-]?token|secret|passwd|password|pwd)\s*[=:]\s*["']?[A-Za-z0-9._~-]{12,}/i, label: 'credential' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key' },
  { re: /\b(?:sk|pk)-[A-Za-z0-9]{20,}\b/, label: 'API token' },
];

function looksSensitive(text) {
  return SECRET_PATTERNS.find((p) => p.re.test(text))?.label || null;
}

/**
 * Work out which URL a console message is really about.
 *
 * Chromium's CORS and CSP messages name the offending resource in their text or
 * in the attached stack, even though the console event itself belongs to the
 * page. Without this the platform blames the site under test for a blocked
 * request made by a third-party SDK.
 */
function extractResourceUrl(text, stack = '') {
  const patterns = [
    /Access to (?:XMLHttpRequest|fetch) at '([^']+)'/i,
    /Refused to (?:load|connect to|execute|apply|run) [^']*'([^']+)'/i,
    /requested an insecure (?:element|resource) '([^']+)'/i,
    /The page at '([^']+)'/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  // Fall back to the first absolute URL mentioned in the stack trace.
  const m = String(stack).match(/https?:\/\/[^\s)'"]+/);
  return m ? m[0] : '';
}

/**
 * Chrome emits one mixed-content warning per insecure resource, so a page with
 * thirty HTTP images produces thirty near-identical console lines. Collapse
 * them to a per-(page host, insecure host) statement and keep one concrete
 * example, which is what the report actually needs in order to be readable.
 */
function summarizeMixedContent(text) {
  const page = text.match(/The page at '([^']+)'/i)?.[1];
  const insecure = text.match(/'((?:http:)[^']+)'/i)?.[1];
  const pageHost = page ? (() => { try { return new URL(page).host; } catch { return page; } })() : '';
  const insecureHost = insecure ? (() => { try { return new URL(insecure).host; } catch { return insecure; } })() : '';
  const display = insecure || text;
  return {
    pageHost,
    insecureHost,
    message: `混合内容：页面 ${pageHost || '(未知)'} 通过 HTTPS 加载了不安全的 HTTP 资源（来自 ${insecureHost || '(未知域名)'}）。例如：${truncate(display, 120)}。浏览器会拦截或降级这些请求，可能造成图片/样式/脚本在部分网络环境下静默失效。`,
  };
}

function isCspViolation(text) {
  return /Content Security Policy|CSP/i.test(text) && /refus|block|violat|拒绝|阻止/i.test(text);
}

function isMixedContent(text) {
  return /Mixed Content|混合内容/i.test(text);
}

/**
 * Is this console line a genuine security problem, or just Chrome narrating a
 * deprecation? `document.domain` mutation is deprecated but is not a
 * vulnerability, so it stays a console warning instead of becoming a security
 * finding that outranks real issues.
 */
function isSecurityWorthy(text) {
  if (/document\.domain/i.test(text)) return false;
  return isCspViolation(text) || isMixedContent(text);
}

/** Build a normalised `security` signal from a console/CDP line. */
function securitySignal(text, extra = {}) {
  if (isMixedContent(text)) {
    const s = summarizeMixedContent(text);
    return {
      message: s.message,
      stack: [],
      subtype: 'mixed-content',
      pageHost: s.pageHost,
      insecureHost: s.insecureHost,
      resourceUrl: extra.resourceUrl || '',
      ...extra,
    };
  }
  return {
    message: text,
    stack: [],
    subtype: isCspViolation(text) ? 'csp-violation' : 'security',
    ...extra,
  };
}

/**
 * Chromium echoes every failed subresource into the console as
 * "Failed to load resource: ...". That is the browser narrating what WebProbe
 * already records precisely — with the URL, the status code and the resource
 * type — via `response`/`requestfailed`. Reporting it as a separate console
 * error would triple-count one defect, so the echo is dropped here.
 */
function isResourceLoadEcho(text) {
  return /Failed to load resource:\s*(the server responded with a status of \d+|net::ERR_)/i.test(text);
}

/* -------------------------------------------------------------- attachment */

/**
 * Attach every listener to `page` and feed `collector`.
 * Returns a small handle with helpers used by the engine.
 */
export async function attachMonitor(page, collector, { target, logger } = {}) {
  const ignoreConsole = [
    ...DEFAULT_CONSOLE_IGNORE,
    ...((target?.watch?.ignoreConsolePatterns || []).map((p) => new RegExp(p, 'i'))),
  ];
  const httpErrorStatus = target?.watch?.httpErrorStatus ?? 400;
  const shouldIgnore = (text) => ignoreConsole.some((re) => re.test(text));

  collector.pageUrl = page.url();

  /* ---- navigation ------------------------------------------------------ */
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) collector.pageUrl = frame.url();
  });

  /* ---- uncaught exceptions -------------------------------------------- */
  page.on('pageerror', (err) => {
    const message = err?.message || String(err);
    collector.add('js-exception', {
      message,
      stack: (err?.stack || '').split('\n').slice(0, 25),
      source: 'pageerror',
      name: err?.name || 'Error',
    });
  });

  /* ---- console --------------------------------------------------------- */
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const loc = msg.location?.() || {};
    const entry = {
      at: new Date().toISOString(),
      type,
      text,
      url: loc.url || collector.pageUrl,
      line: loc.lineNumber,
      column: loc.columnNumber,
      step: collector.step ? { ...collector.step } : null,
    };
    push(collector.consoleLog, entry, LIMITS.console);

    if (shouldIgnore(text)) return;
    if (isResourceLoadEcho(text)) return;

    if (type === 'error') {
      const secret = looksSensitive(text);
      if (isSecurityWorthy(text)) {
        // A security problem is reported once, as a security finding — emitting
        // a console.warn finding for the same line would double-count it.
        collector.add('security', securitySignal(text, { source: 'console', location: loc }));
      } else {
        // Console text often *is* the stack (Chromium inlines it for Error
        // objects), so search it for the URL that actually failed before
        // falling back to blaming the page.
        const resourceUrl = extractResourceUrl(text, text);
        collector.add('console-error', {
          message: text,
          stack: [],
          source: 'console',
          location: loc,
          ...(resourceUrl ? { resourceUrl } : {}),
          ...(secret ? { secret: { label: secret } } : {}),
        });
      }
    } else if (type === 'warning') {
      const secret = looksSensitive(text);
      if (secret) {
        collector.add('security', {
          message: `控制台疑似泄露敏感凭据（${secret}）：${truncate(text, 120)}`,
          stack: [],
          source: 'console',
          subtype: 'secret-in-console',
          location: loc,
        });
      }
      if (isSecurityWorthy(text)) {
        collector.add('security', securitySignal(text, { source: 'console', location: loc }));
        return;
      }
      collector.add('console-warning', { message: text, stack: [], source: 'console', location: loc });
    }
  });

  /* ---- network --------------------------------------------------------- */
  page.on('request', (req) => {
    collector.addRequest({
      at: new Date().toISOString(),
      phase: 'request',
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
      step: collector.step ? { ...collector.step } : null,
    });
  });

  page.on('response', async (res) => {
    const status = res.status();
    let size = 0;
    try {
      const len = res.headers()['content-length'];
      size = len ? Number(len) : 0;
    } catch { /* ignore */ }
    const entry = {
      at: new Date().toISOString(),
      phase: 'response',
      status,
      url: res.url(),
      resourceType: res.request().resourceType(),
      contentType: (() => { try { return res.headers()['content-type'] || ''; } catch { return ''; } })(),
      size,
      step: collector.step ? { ...collector.step } : null,
    };
    collector.addRequest(entry);

    if (status >= httpErrorStatus) {
      const kind = entry.resourceType === 'document' ? 'http-error' : 'http-error';
      collector.add(kind, {
        message: `HTTP ${status} ${res.statusText() || ''} — ${entry.resourceType} ${entry.url}`.trim(),
        stack: [],
        source: 'response',
        status,
        resourceType: entry.resourceType,
        resourceUrl: entry.url,
      });
    }
  });

  page.on('requestfailed', (req) => {
    const failure = req.failure();
    const errText = failure?.errorText || 'unknown failure';
    const entry = {
      at: new Date().toISOString(),
      phase: 'failed',
      url: req.url(),
      resourceType: req.resourceType(),
      errorText: errText,
      step: collector.step ? { ...collector.step } : null,
    };
    collector.addFailedRequest(entry);

    // A navigation aborted by our own automation is not a defect.
    if (/net::ERR_ABORTED/.test(errText)) return;
    if (collector.step?.action === 'goto' && /net::ERR_ABORTED/.test(errText)) return;

    collector.add('resource-error', {
      message: `${errText} — ${req.resourceType()} ${req.url()}`,
      stack: [],
      source: 'requestfailed',
      errorText: errText,
      resourceType: req.resourceType(),
      resourceUrl: req.url(),
    });
  });

  /* ---- renderer lifecycle --------------------------------------------- */
  page.on('crash', () => {
    collector.crashed = true;
    collector.add('page-crash', {
      message: '渲染进程崩溃（page crash）：标签页被浏览器内核强制终止。',
      stack: [],
      source: 'crash',
    });
  });

  page.on('dialog', async (dialog) => {
    collector.add('dom-anomaly', {
      message: `页面弹出原生对话框（${dialog.type()}）：${truncate(dialog.message(), 120)}`,
      stack: [],
      source: 'dialog',
      subtype: 'unexpected-dialog',
    });
    try { await dialog.dismiss(); } catch { /* page may be gone */ }
  });

  /* ---- CDP: browser-level log + fine-grained exceptions ---------------- */
  let cdp = null;
  try {
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Log.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    await cdp.send('Inspector.enable').catch(() => {});

    cdp.on('Log.entryAdded', ({ entry }) => {
      const text = entry.text || '';
      const src = entry.source || '';
      if (/deprecat|DevTools|Autofill/i.test(text)) return;
      if (shouldIgnore(text)) return;
      // `Log.entryAdded` reports the same network failures that `response` and
      // `requestfailed` already record with full detail.
      if (isResourceLoadEcho(text)) return;
      if (/document\.domain/i.test(text)) {
        collector.add('console-warning', { message: text, stack: [], source: `cdp:${src}` });
        return;
      }
      if (src === 'security' || isSecurityWorthy(text)) {
        collector.add('security', securitySignal(text, { source: `cdp:${src}`, resourceUrl: entry.url || '' }));
      } else if (entry.level === 'error') {
        const resourceUrl = extractResourceUrl(text, text);
        collector.add('console-error', {
          message: text,
          stack: [],
          source: `cdp:${src}`,
          ...(resourceUrl ? { resourceUrl } : {}),
        });
      }
    });

    cdp.on('Inspector.targetCrashed', () => {
      collector.crashed = true;
      collector.add('page-crash', {
        message: '渲染进程崩溃（Inspector.targetCrashed）。',
        stack: [],
        source: 'cdp',
      });
    });
  } catch (err) {
    logger?.debug?.(`CDP session unavailable: ${err.message}`);
  }

  /* ---- injected in-page collectors ------------------------------------ */
  const bindingName = '__webprobeReport';
  try {
    await page.exposeFunction(bindingName, (payload) => {
      handleInPageReport(payload, collector);
    }).catch(() => {});
  } catch { /* already exposed on this context */ }

  await page.addInitScript(() => {
    if (window.__webprobeInstalled) return;
    window.__webprobeInstalled = true;
    const send = (p) => {
      try { window.__webprobeReport && window.__webprobeReport(p); } catch { /* binding absent */ }
    };

    window.addEventListener('unhandledrejection', (e) => {
      const r = e.reason;
      send({
        kind: 'unhandledrejection',
        message: r && (r.stack || r.message) ? String(r.message || r) : String(r),
        stack: r && r.stack ? String(r.stack) : '',
        name: (r && r.name) || 'Error',
      });
    });

    window.addEventListener('error', (e) => {
      // Resource load errors surface here too (no `error` object).
      if (e.target && e.target !== window && (e.target.src || e.target.href)) {
        send({
          kind: 'resourceerror',
          message: `<${e.target.tagName.toLowerCase()}> 元素加载失败`,
          stack: '',
          url: e.target.src || e.target.href,
        });
        return;
      }
      send({
        kind: 'error',
        message: e.message || 'unknown error',
        stack: e.error && e.error.stack ? String(e.error.stack) : '',
        name: (e.error && e.error.name) || 'Error',
        source: `${e.filename || ''}:${e.lineno || 0}:${e.colno || 0}`,
      });
    }, true);

    // Long tasks ≈ main-thread stalls the user would feel.
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 250) {
            send({ kind: 'longtask', message: `长任务 ${Math.round(entry.duration)}ms`, duration: entry.duration });
          }
        }
      });
      po.observe({ entryTypes: ['longtask'] });
    } catch { /* unsupported */ }
  }).catch((err) => logger?.debug?.(`init script failed: ${err.message}`));

  return {
    /** Detach the CDP session (called when the page is closed). */
    async dispose() {
      try { await cdp?.detach(); } catch { /* already gone */ }
    },
  };
}

/** Map an in-page report into a collector signal. */
function handleInPageReport(payload, collector) {
  if (!payload || typeof payload !== 'object') return;
  const stack = String(payload.stack || '').split('\n').filter(Boolean).slice(0, 25);
  switch (payload.kind) {
    case 'unhandledrejection':
      collector.add('unhandled-rejection', {
        // No prefix here: the finding title adds "未处理的 Promise 拒绝：" so
        // including it in the payload would print it twice.
        message: payload.message,
        stack,
        source: 'inpage',
        name: payload.name,
        resourceUrl: extractResourceUrl(payload.message || '', payload.stack || ''),
      });
      break;
    case 'error':
      collector.add('js-exception', {
        message: payload.message,
        stack,
        source: 'inpage',
        name: payload.name,
        location: payload.source,
        resourceUrl: extractResourceUrl(payload.message || '', payload.stack || ''),
      });
      break;
    case 'resourceerror': {
      // `<img src="">` resolves to the document URL, so the browser dutifully
      // re-requests the page itself. That is a genuine markup defect, and it
      // deserves a clearer explanation than "the resource failed to load".
      const target = String(payload.url || '');
      const page = String(collector.pageUrl || '');
      const sameDoc = target && page && target.replace(/#.*$/, '') === page.replace(/#.*$/, '');
      collector.add('resource-error', {
        message: sameDoc
          ? `${payload.message}：该元素的 src 为空，浏览器将当前页面地址当作资源地址，发起了一次指向页面自身的无效请求。`
          : `${payload.message}${target ? ` ${target}` : ''}`,
        stack: [],
        source: 'inpage',
        resourceUrl: target,
        subtype: sameDoc ? 'empty-src' : 'load-failure',
      });
      break;
    }
    case 'longtask':
      collector.add('long-task', {
        message: payload.message,
        stack: [],
        source: 'inpage',
        duration: payload.duration,
      });
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------- active probing */

/**
 * Active responsiveness probe.
 *
 * The proof of liveness is the round trip itself: Playwright can only resolve
 * `evaluate` once the renderer's main thread has actually run the function. If
 * the thread is blocked — a runaway loop, a synchronous handler, a stalled
 * layout — the call cannot complete, and that is a real, user-visible defect
 * (frozen UI) rather than a heuristic.
 *
 * Deliberately *not* used: `requestAnimationFrame`. Headless Chromium does not
 * composite frames when nothing is watching, so an rAF-based probe times out on
 * a perfectly healthy page and reports a phantom freeze. This was caught by the
 * project's own self-test against the bug-free sample, which is exactly what
 * that fixture is for.
 */
export async function probeResponsiveness(page, collector, { timeoutMs = 2500 } = {}) {
  const t0 = Date.now();
  const SENTINEL = Symbol('timeout');
  try {
    const result = await withTimeout(
      page.evaluate(() => 0).then(() => 'ok').catch((e) => (e?.message?.includes('closed') ? 'closed' : 'error')),
      timeoutMs,
      SENTINEL,
    );
    const latencyMs = Date.now() - t0;
    if (result === SENTINEL) {
      collector.unresponsive = true;
      collector.add('unresponsive', {
        message: `主线程无响应：发起一次脚本求值后 ${latencyMs}ms 内没有返回（阈值 ${timeoutMs}ms），UI 在该时段内无法响应用户输入。`,
        stack: [],
        source: 'probe',
        latencyMs,
      });
      // Give the page a chance to recover before the run continues.
      await sleep(500);
      return { ok: false, latencyMs };
    }
    if (result === 'closed') return { ok: false, latencyMs, closed: true };
    return { ok: true, latencyMs };
  } catch (err) {
    return { ok: true, latencyMs: Date.now() - t0, error: err.message };
  }
}

export { isCspViolation, isMixedContent, isSecurityWorthy, looksSensitive, DEFAULT_CONSOLE_IGNORE };
