/**
 * Browser resolution and launch.
 *
 * WebProbe needs a *real* browser engine: the defects it hunts (uncaught
 * exceptions, unhandled rejections, layout/template anomalies, main-thread
 * stalls, renderer crashes) only exist in a real JavaScript engine with a real
 * document. So this module finds one, and starts it in whichever way the host
 * environment permits.
 *
 * Two launch strategies, tried in order:
 *
 *   1. `direct`  — the standard Playwright launch. Playwright starts the
 *                  browser as a child process and talks to it over a pipe.
 *   2. `cdp`     — WebProbe starts the browser *itself* with
 *                  `--remote-debugging-port`, redirecting its output to a log
 *                  file instead of a pipe, then attaches over the DevTools
 *                  protocol. This is what makes the platform usable in
 *                  environments where creating a piped child process is
 *                  denied (hardened CI containers, some sandboxes).
 */

import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { exists, sleep } from './util.mjs';

const require = createRequire(import.meta.url);

/* --------------------------------------------------------------- discovery */

const WINDOWS_CANDIDATES = [
  ['chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'],
  ['chrome', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
  ['chrome', `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`],
  ['msedge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
  ['msedge', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
];

const POSIX_CANDIDATES = [
  ['chrome', '/usr/bin/google-chrome'],
  ['chrome', '/usr/bin/google-chrome-stable'],
  ['chrome', '/opt/google/chrome/chrome'],
  ['chromium', '/usr/bin/chromium'],
  ['chromium', '/usr/bin/chromium-browser'],
  ['msedge', '/usr/bin/microsoft-edge'],
  ['msedge', '/usr/bin/microsoft-edge-stable'],
  ['chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  ['msedge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  ['chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
];

/** Load playwright-core, failing with an actionable message if absent. */
export function loadPlaywright() {
  const candidates = [
    'playwright-core',
    'playwright',
  ];
  const errors = [];
  for (const name of candidates) {
    try {
      return { name, api: require(name) };
    } catch (err) {
      errors.push(`${name}: ${err.code || err.message}`);
    }
  }
  // Fall back to a Playwright that is installed globally on this machine.
  const guesses = [
    process.env.PLAYWRIGHT_MODULE,
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'node_modules', 'playwright-core'),
    '/usr/lib/node_modules/playwright-core',
    '/usr/local/lib/node_modules/playwright-core',
  ].filter((p) => p && exists(p));
  for (const g of guesses) {
    try {
      return { name: g, api: require(g) };
    } catch (err) {
      errors.push(`${g}: ${err.code || err.message}`);
    }
  }
  throw new Error(
    'playwright-core 未安装。请先运行：\n' +
    '  pnpm install            # 或 npm install\n' +
    `已尝试：${errors.join(' | ')}`,
  );
}

/**
 * Decide which browser binary to drive.
 * Returns { executablePath, channel, label, source }.
 */
export function resolveBrowser({ preferred, executablePath, channel } = {}) {
  const { api } = loadPlaywright();
  const chromium = api.chromium;

  if (executablePath) {
    return { executablePath, channel: null, label: path.basename(executablePath), source: 'explicit' };
  }

  // A browser that Playwright downloaded for itself is always the best match.
  try {
    const bundled = chromium.executablePath();
    if (bundled && exists(bundled)) {
      return { executablePath: bundled, channel: null, label: 'chromium (playwright)', source: 'playwright' };
    }
  } catch { /* not installed */ }

  const candidates = process.platform === 'win32' ? WINDOWS_CANDIDATES : POSIX_CANDIDATES;
  const wanted = preferred && preferred !== 'auto'
    ? candidates.filter(([name]) => name === preferred)
    : candidates;
  for (const [name, p] of (wanted.length ? wanted : candidates)) {
    if (exists(p)) return { executablePath: p, channel: name, label: `${name} (${p})`, source: 'system' };
  }

  // Last resort: let Playwright find a channel by name.
  for (const name of ['chrome', 'msedge', 'chromium']) {
    if (!preferred || preferred === 'auto' || preferred === name) {
      return { executablePath: null, channel: name, label: name, source: 'channel' };
    }
  }

  throw new Error(
    '找不到可用的浏览器。请安装 Chrome/Edge/Chromium，或运行：\n' +
    '  npx playwright install chromium',
  );
}

/* ----------------------------------------------------------------- launch */

const BASE_ARGS = [
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-hang-monitor',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-first-run',
  '--no-default-browser-check',
  '--password-store=basic',
  '--use-mock-keychain',
  '--mute-audio',
  '--hide-scrollbars',
];

function contextOptions(target, extra = {}) {
  return {
    viewport: target.viewport,
    locale: target.locale,
    timezoneId: target.timezoneId,
    colorScheme: target.colorScheme,
    ignoreHTTPSErrors: target.ignoreHTTPSErrors !== false,
    ...(target.userAgent ? { userAgent: target.userAgent } : {}),
    ...(target.auth?.type === 'storageState' && target.auth.storageState
      ? { storageState: target.auth.storageState }
      : {}),
    ...extra,
  };
}

/** Ask the DevTools HTTP endpoint for the browser version, with a deadline. */
async function waitForDevtools(port, { timeoutMs = 30_000, onExit } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (onExit?.exited) return { error: onExit.reason };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return { version: await res.json() };
    } catch { /* not listening yet */ }
    await sleep(300);
  }
  return { error: 'timeout waiting for the DevTools endpoint' };
}

async function freePort() {
  const net = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

/**
 * Launch a browser and return a handle:
 *   { browser, context, strategy, meta, close() }
 */
export async function launchBrowser(target, opts = {}) {
  const {
    headless = true,
    logger,
    strategy: wantedStrategy = 'auto',
    launchTimeoutMs = 45_000,
    recordVideo = false,
  } = opts;

  const { api } = loadPlaywright();
  const resolved = resolveBrowser(opts);
  const log = logger ?? { info() {}, debug() {}, warn() {} };
  log.debug(`browser resolved: ${resolved.label} (${resolved.source})`);

  const attempts = [];
  const strategies = wantedStrategy === 'auto' ? ['direct', 'cdp'] : [wantedStrategy];

  for (const strategy of strategies) {
    try {
      if (strategy === 'direct') {
        const browser = await api.chromium.launch({
          headless,
          executablePath: resolved.executablePath || undefined,
          channel: resolved.executablePath ? undefined : resolved.channel || undefined,
          args: BASE_ARGS,
          timeout: launchTimeoutMs,
        });
        const context = await browser.newContext(contextOptions(target));
        log.info(`浏览器已启动（direct）：${resolved.label}`);
        return wrap({ browser, context, strategy, resolved, api, recordVideo: false });
      }

      // ---- pipe-free CDP strategy -------------------------------------
      const exe = resolved.executablePath;
      if (!exe) throw new Error('CDP 启动方式需要一个明确的可执行文件路径');

      const port = await freePort();
      const profileDir = path.join(os.tmpdir(), `webprobe-profile-${process.pid}-${port}`);
      await fsp.mkdir(profileDir, { recursive: true });
      const outLog = path.join(profileDir, 'browser.log');
      const outFd = fs.openSync(outLog, 'a');

      const args = [
        headless ? '--headless=new' : '--start-maximized',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--disable-gpu',
        ...BASE_ARGS,
        'about:blank',
      ];
      log.debug(`cdp spawn: ${exe} ${args.join(' ')}`);
      // stdio is redirected to a FILE, never a pipe: that is the whole point of
      // this strategy. Piped stdio is what restricted environments refuse.
      const child = spawn(exe, args, { stdio: ['ignore', outFd, outFd], detached: false });

      let exited = false;
      let reason = '';
      child.on('exit', (code) => { exited = true; reason = `browser exited early (code ${code})`; });
      child.on('error', (err) => { exited = true; reason = `spawn failed: ${err.message}`; });

      const wait = await waitForDevtools(port, {
        timeoutMs: launchTimeoutMs,
        onExit: { get exited() { return exited; }, get reason() { return reason; } },
      });

      if (wait.error) {
        let tail = '';
        try { tail = (await fsp.readFile(outLog, 'utf8')).split('\n').filter(Boolean).slice(-4).join(' | '); } catch {}
        try { child.kill(); } catch {}
        try { fs.closeSync(outFd); } catch {}
        throw new Error(`CDP 启动失败：${wait.error}${tail ? `\n    浏览器日志：${tail.slice(0, 500)}` : ''}`);
      }

      const browser = await api.chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: launchTimeoutMs });
      const context = browser.contexts()[0] || (await browser.newContext(contextOptions(target)));
      log.info(`浏览器已启动（cdp）：${resolved.label} — ${wait.version.Browser}`);

      const handle = wrap({ browser, context, strategy, resolved, api, recordVideo: false });
      handle.meta.browserVersion = wait.version.Browser;
      handle.meta.devtoolsPort = port;
      handle.meta.logFile = outLog;
      const baseClose = handle.close;
      handle.close = async () => {
        await baseClose();
        try { child.kill(); } catch {}
        try { fs.closeSync(outFd); } catch {}
      };
      return handle;
    } catch (err) {
      attempts.push({ strategy, message: err.message });
      log.debug(`strategy ${strategy} failed: ${err.message.split('\n')[0]}`);
      if (wantedStrategy !== 'auto') break;
    }
  }

  throw new Error(buildLaunchError(attempts, resolved));
}

function wrap({ browser, context, strategy, resolved, api }) {
  return {
    browser,
    context,
    strategy,
    api,
    meta: {
      name: 'chromium',
      engine: 'chromium',
      channel: resolved.channel || 'chromium',
      executablePath: resolved.executablePath || null,
      source: resolved.source,
      strategy,
      version: safeVersion(browser),
      headless: true,
    },
    newPage: () => context.newPage(),
    close: async () => {
      try { await context.close(); } catch {}
      try { await browser.close(); } catch {}
    },
  };
}

function safeVersion(browser) {
  try { return browser.version(); } catch { return 'unknown'; }
}

/** Turn low-level launch failures into something a user can act on. */
function buildLaunchError(attempts, resolved) {
  const all = attempts.map((a) => `  · ${a.strategy}: ${a.message}`).join('\n');
  const eperm = attempts.some((a) => /EPERM|EACCES|access is denied|拒绝访问/i.test(a.message));
  const head = `无法启动浏览器（${resolved.label}）。已尝试的启动方式：\n${all}`;
  if (!eperm) {
    return `${head}\n\n建议：确认浏览器可执行文件路径，或运行 npx playwright install chromium。`;
  }
  return `${head}

诊断：启动被操作系统拒绝（EPERM / 拒绝访问）。Chromium 是多进程架构，进程之间
必须使用 Windows 命名管道（mojo IPC）通信；当运行环境禁止创建管道时，无论是
Playwright 直接启动还是 WebProbe 的免管道 CDP 方式都无法工作。

解决方式（任选其一）：
  1. 在普通终端/桌面环境运行本平台（不要放在禁止管道的沙箱里）；
  2. 用 --strategy cdp 并确保进程可以创建命名管道；
  3. 在 Docker/CI 中运行时加上 --ipc=host 并避免只读的 /dev/shm。`;
}

export { contextOptions };
