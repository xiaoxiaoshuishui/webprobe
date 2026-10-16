/**
 * Target loading.
 *
 * The platform's *input* is "the directory the software under test lives in".
 * That directory is described by a `target.json` manifest, which tells WebProbe
 * whether it is a local web app to be served from disk or a remote site to be
 * driven over the network, plus the budgets, assertions and fuzzing policy for
 * the run.
 *
 *   loadTarget('code/targets/huya-live')  // directory holding target.json
 *   loadTarget('https://example.com/')    // ad-hoc remote target
 *   loadTarget('huya-live')               // id resolved against code/targets
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { CODE_DIR, deepMerge, exists, readJson } from './util.mjs';
import { startStaticServer } from './static-server.mjs';

export const TARGET_SEARCH_ROOTS = [
  path.join(CODE_DIR, 'targets'),
  path.join(CODE_DIR, 'samples'),
];

/** Defaults every manifest is merged onto. */
export const DEFAULT_TARGET = Object.freeze({
  id: null,
  name: null,
  description: '',
  kind: 'local',            // 'local' | 'remote'
  dir: '.',
  url: null,
  entry: '/index.html',
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  userAgent: null,
  colorScheme: 'light',
  ignoreHTTPSErrors: true,
  /**
   * Additional domains to treat as belonging to the software under test (its
   * own CDN, for example). Anything outside these plus the entry origin is
   * classified third-party.
   */
  firstPartyDomains: [],
  budget: {
    maxPages: 20,
    maxActionsPerPage: 80,
    maxDurationMs: 6 * 60 * 1000,
    navigationTimeoutMs: 30_000,
    actionTimeoutMs: 4_000,
  },
  explore: {
    allowCrossOrigin: false,
    urlPatterns: ['**/*'],
    denyUrlPatterns: [],
    clickNavLinks: true,
    maxDepth: 3,
  },
  fuzz: {
    enabled: true,
    rounds: 60,
    seed: 20261016,
    aggressive: false,
    dom: {
      click: true, type: true, select: true, scroll: true,
      hover: true, submit: true, keyboard: true, dragDrop: false,
    },
    /** Explicit selectors to always exercise, in addition to discovery. */
    selectors: [],
    /** Payloads used when fuzzing text inputs. */
    payloads: null,
    /** JS globals to poke when hunting for API-level crashes. */
    api: { enabled: true, calls: [] },
  },
  assertions: [],
  watch: {
    console: true,
    pageerror: true,
    requestfailed: true,
    httpErrorStatus: 400,
    ignorePatterns: [],
    /** Console messages matching these are dropped (framework noise). */
    ignoreConsolePatterns: [],
    /**
     * How to treat defects originating from embedded third parties (ad SDKs,
     * analytics, payment widgets):
     *   'tag'    — report them, one severity level lower, tagged `third-party`
     *   'ignore' — do not report them at all
     *   'all'    — report them at full severity, indistinguishable from the
     *              site's own defects
     */
    thirdParty: 'tag',
  },
  auth: {
    type: 'none',              // 'none' | 'storageState'
    storageState: null,
    cookies: [],
  },
  serve: {
    port: 0,
    host: '127.0.0.1',
    headers: {},
    spa: false,
  },
});

async function readManifest(dir) {
  for (const name of ['target.json', 'webprobe.target.json']) {
    const p = path.join(dir, name);
    if (exists(p)) {
      const raw = await readJson(p);
      return { manifest: raw, manifestPath: p };
    }
  }
  return null;
}

/** Enumerate every target the platform knows about (for the CLI and the UI). */
export async function listTargets() {
  const found = [];
  for (const root of TARGET_SEARCH_ROOTS) {
    let entries = [];
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const dir = path.join(root, e.name);
      const hit = await readManifest(dir);
      if (!hit) continue;
      const t = normalizeTarget(hit.manifest, dir, hit.manifestPath);
      found.push({
        id: t.id,
        name: t.name,
        kind: t.kind,
        dir,
        manifestPath: hit.manifestPath,
        // Local targets have no URL until their static server starts; show the
        // entry path so the CLI and dashboard still say something useful.
        url: t.kind === 'local' ? `local:${t.entry}` : t.url,
        description: t.description,
      });
    }
  }
  return found.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeTarget(manifest, dir, manifestPath) {
  const t = deepMerge(DEFAULT_TARGET, manifest);
  t.dir = path.resolve(dir, String(manifest.dir ?? '.'));
  t.manifestPath = manifestPath;
  t.id = t.id || path.basename(dir);
  t.name = t.name || t.id;
  t.sourceDir = dir;

  if (t.kind === 'local') {
    const entry = t.entry || '/index.html';
    t.entry = entry.startsWith('/') ? entry : '/' + entry;
    t.url = t.url || null;   // filled in once the static server knows its port
  } else {
    if (!t.url) throw new Error(`target '${t.id}': kind=remote requires a "url"`);
    t.entry = new URL(t.url).pathname || '/';
  }
  return t;
}

/**
 * Load the target named by `spec` (a directory, a target id, or a bare URL).
 * Returns a *bound* target: local targets come with `staticServer` already
 * listening, and `baseUrl` set.
 */
export async function loadTarget(spec, { logger } = {}) {
  const log = logger ?? { info() {}, warn() {} };

  // 1. A bare URL → ad-hoc remote target, no manifest needed.
  if (/^https?:\/\//i.test(spec)) {
    const url = new URL(spec);
    const t = normalizeTarget({
      id: `ad-hoc-${url.hostname.replace(/[^a-z0-9]+/gi, '-')}`,
      name: `Ad-hoc ${url.host}`,
      kind: 'remote',
      url: spec,
    }, process.cwd(), null);
    t.baseUrl = spec;
    log.info(`即席远程目标：${spec}`);
    return t;
  }

  // 2. A directory holding a manifest.
  const asDir = path.resolve(process.cwd(), spec);
  let hit = exists(asDir) && (await fsp.stat(asDir)).isDirectory()
    ? await readManifest(asDir)
    : null;
  let baseDir = asDir;

  // 3. A target id under the search roots.
  if (!hit) {
    for (const root of TARGET_SEARCH_ROOTS) {
      const dir = path.join(root, spec);
      if (!exists(dir)) continue;
      hit = await readManifest(dir);
      if (hit) { baseDir = dir; break; }
    }
  }

  if (!hit) {
    const available = await listTargets();
    const names = available.map((t) => t.id).join(', ') || '(none)';
    throw new Error(
      `找不到目标 "${spec}"。\n` +
      `请传入：一个包含 target.json 的目录、一个目标 id、或一个 http(s) URL。\n` +
      `当前可用目标：${names}`,
    );
  }

  const target = normalizeTarget(hit.manifest, baseDir, hit.manifestPath);
  log.info(`目标 ${target.id} (${target.kind}) — ${target.manifestPath}`);

  if (target.kind === 'local') {
    if (!exists(target.dir)) {
      throw new Error(`target '${target.id}': 目录不存在 ${target.dir}`);
    }
    const server = await startStaticServer(target.dir, {
      host: target.serve.host,
      port: target.serve.port,
      spa: target.serve.spa,
      headers: target.serve.headers,
      logger: log,
    });
    target.staticServer = server;
    target.baseUrl = `http://${server.host}:${server.port}`;
    target.url = target.baseUrl + target.entry;
    log.info(`静态服务器已启动：${target.baseUrl}  (根目录 ${target.dir})`);
  } else {
    target.baseUrl = new URL(target.url).origin;
  }

  target.entryUrl = target.kind === 'remote' ? target.url : target.baseUrl + target.entry;
  return target;
}

/** Release resources a bound target holds (currently: the static server). */
export async function closeTarget(target) {
  if (target?.staticServer) {
    await target.staticServer.close();
    target.staticServer = null;
  }
}
