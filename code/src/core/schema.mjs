/**
 * WebProbe — data contracts.
 *
 * Everything the platform produces is described here: finding kinds, severity
 * levels, the Finding record and the RunReport envelope. The reporter, the
 * dashboard and the JSON API all speak this schema, so it is the single source
 * of truth for the platform's output.
 */

import { createHash } from 'node:crypto';

export const PLATFORM = Object.freeze({
  name: 'WebProbe',
  displayName: 'WebProbe 浏览器端动态软件测试平台',
  version: '1.0.0',
  schemaVersion: '1.0',
});

/* ------------------------------------------------------------------ kinds */

/**
 * Every class of defect the platform can observe, with the default severity it
 * is reported at and a human-facing Chinese label.
 */
export const FINDING_KINDS = Object.freeze({
  'page-crash': {
    severity: 'critical',
    label: '渲染进程崩溃',
    description: '浏览器渲染进程/标签页崩溃或被内核强制终止，页面完全不可用。',
  },
  'unresponsive': {
    severity: 'critical',
    label: '主线程卡死',
    description: '页面主线程长时间无响应（脚本阻塞或死循环），用户输入被冻结。',
  },
  'js-exception': {
    severity: 'high',
    label: '未捕获 JS 异常',
    description: 'window.onerror / pageerror：脚本抛出未被业务代码捕获的异常。',
  },
  'unhandled-rejection': {
    severity: 'high',
    label: '未处理的 Promise 拒绝',
    description: '异步链路抛出错误且没有任何 catch 处理，会造成静默失败。',
  },
  'http-error': {
    severity: 'high',
    label: '接口 HTTP 错误',
    description: '静态资源或 XHR/fetch 接口返回 4xx/5xx 状态码。',
  },
  'console-error': {
    severity: 'medium',
    label: '控制台 error 输出',
    description: '页面主动调用 console.error，通常代表业务内部已察觉的故障。',
  },
  'resource-error': {
    severity: 'medium',
    label: '资源加载失败',
    description: '图片/脚本/样式/字体等静态资源加载失败（网络层失败或被拦截）。',
  },
  'assertion': {
    severity: 'medium',
    label: '断言不通过',
    description: '目标自带的断言规则（选择器、文本、接口契约）未满足。',
  },
  'dom-anomaly': {
    severity: 'medium',
    label: 'DOM 异常',
    description: '页面结构异常：关键元素缺失、内容溢出、占位图/白屏、文案透出模板变量。',
  },
  'security': {
    severity: 'medium',
    label: '安全配置问题',
    description: 'CSP 违规、混合内容、敏感信息泄露到控制台、不安全的跨域配置。',
  },
  'performance': {
    severity: 'low',
    label: '性能劣化',
    description: '长任务、超大资源、慢请求等影响体验的问题。',
  },
  'console-warning': {
    severity: 'low',
    label: '控制台 warn 输出',
    description: '框架或业务代码的警告，常是潜在的未来故障。',
  },
});

export const SEVERITY_ORDER = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
});

export const SEVERITY_LABEL = Object.freeze({
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
  info: '提示',
});

/* --------------------------------------------------------------- signatures */

/**
 * Normalise a raw signal so that the same defect observed many times collapses
 * into one finding: volatile parts (ids, timestamps, urls with tokens, numbers)
 * are masked before hashing.
 */
export function normalizeSignal(text) {
  return String(text ?? '')
    .replace(/https?:\/\/[^\s)"']+/g, (u) => {
      try {
        const url = new URL(u);
        return `${url.origin}${url.pathname}`;
      } catch {
        return u;
      }
    })
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?\b/g, '<time>')
    .replace(/\b\d{10,13}\b/g, '<ts>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export function signatureOf(kind, message, extra = '') {
  const basis = [kind, normalizeSignal(message), normalizeSignal(extra)].join('|');
  return createHash('sha1').update(basis).digest('hex').slice(0, 12);
}

/* ------------------------------------------------------------ page ownership */

/** Two-label public suffixes that must not be split into eTLD + label. */
const MULTI_PART_TLDS = new Set([
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.hk', 'com.tw', 'com.au', 'co.jp', 'co.kr', 'com.sg', 'com.br',
]);

/**
 * Best-effort "who owns this host" — the registrable domain. Deliberately not a
 * full Public Suffix List: the platform only needs to tell the site under test
 * apart from the ad networks and analytics vendors it embeds.
 */
export function registrableDomain(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (!h || /^\d+(\.\d+){3}$/.test(h) || h === 'localhost' || !h.includes('.')) return h;
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

/**
 * Classify an observation as first-party (the software under test, or a domain
 * its manifest claims) or third-party (an embedded vendor).
 *
 * This matters because a page's own defects and its ad SDK's defects demand
 * completely different reactions: one is a bug to fix, the other is usually
 * noise the site cannot control. Without this split, one broken tracking pixel
 * reliably drowns out the real findings.
 */
export function partyOf(url, { origin, firstPartyDomains = [] } = {}) {
  let host;
  try { host = new URL(url).hostname; } catch { return 'unknown'; }
  const domain = registrableDomain(host);
  const first = new Set();
  if (origin) {
    try { first.add(registrableDomain(new URL(origin).hostname)); } catch { /* ignore */ }
  }
  for (const d of firstPartyDomains) first.add(registrableDomain(d));
  first.delete('');
  return first.has(domain) ? 'first-party' : 'third-party';
}

/** Third-party findings are reported one step lower unless the target says otherwise. */
const PARTY_DOWNGRADE = { critical: 'high', high: 'medium', medium: 'low', low: 'info', info: 'info' };

/**
 * Apply the target's third-party policy to a finding.
 * @returns the (possibly mutated) finding, or null when it should be dropped.
 */
export function applyPartyPolicy(finding, target) {
  if (!finding) return null;
  // Prefer the URL of the thing that actually failed (a CDN asset, an XHR
  // endpoint); fall back to the page it happened on.
  const probeUrl = finding.context?.resourceUrl || finding.url || '';
  const origin = target?.entryUrl || target?.url || '';
  const party = partyOf(probeUrl, {
    origin,
    firstPartyDomains: target?.firstPartyDomains || [],
  });
  finding.party = party;
  finding.context = { ...(finding.context || {}), party };
  if (party !== 'third-party') return finding;

  finding.tags = [...new Set([...(finding.tags || []), 'third-party'])];
  const mode = target?.watch?.thirdParty ?? 'tag';
  if (mode === 'ignore') return null;
  if (mode === 'tag') finding.severity = PARTY_DOWNGRADE[finding.severity] ?? finding.severity;
  return finding;
}

/** Host of a URL, for grouping many victims under one defect. */
export function hostOf(url) {
  try { return new URL(url).host; } catch { return String(url || '').slice(0, 60); }
}

/* ------------------------------------------------------------------ records */

/** Shape reference for a single bug the platform reports. */
export function makeFinding({
  kind,
  title,
  message = '',
  severity,
  url = '',
  stack = [],
  step = null,
  evidence = {},
  context = {},
  tags = [],
  target = null,
  extraKey = '',
  /**
   * Optional override for the deduplication basis.
   *
   * Some defects are naturally "one bug, many victims": a page that loads
   * thirty HTTP images over HTTPS is one mixed-content defect, not thirty. For
   * those, callers pass a coarse key (typically the offending host plus the
   * failure mode) while keeping the full detail in `message` and `context`.
   */
  dedupeKey = null,
}) {
  const meta = FINDING_KINDS[kind] ?? {
    severity: 'info',
    label: kind,
    description: '',
  };
  return {
    id: null,
    signature: dedupeKey
      ? signatureOf(kind, dedupeKey)
      : signatureOf(kind, message || title, `${url}|${extraKey}`),
    kind,
    kindLabel: meta.label,
    severity: severity ?? meta.severity,
    title: title || meta.label,
    message,
    url,
    stack,
    occurrences: 1,
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    repro: { steps: [], script: '' },
    step,
    evidence,
    context,
    tags,
    /** Set when the same signature was already known from a previous run. */
    known: false,
    target,
  };
}

/** Shape reference for the whole run. */
export function makeRunReport({ target, config, browser }) {
  return {
    schemaVersion: PLATFORM.schemaVersion,
    platform: { ...PLATFORM },
    runId: null,
    target,
    browser,
    config,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: 0,
    stats: {
      pagesVisited: 0,
      pageVisits: 0,
      actionsExecuted: 0,
      requests: 0,
      failedRequests: 0,
      consoleMessages: 0,
      findings: 0,
      bySeverity: {},
      byKind: {},
    },
    coverage: { visited: [], discovered: [], skipped: [] },
    findings: [],
    timeline: [],
  };
}
