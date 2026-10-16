#!/usr/bin/env node
/**
 * WebProbe command line interface.
 *
 *   webprobe run --target <目录|目标id|URL> [选项]   动态测试一个目标
 *   webprobe targets                                 列出可用目标
 *   webprobe ui [--port 7788]                        启动结果看板
 *   webprobe report [runId]                          查看/导出某次报告
 *   webprobe video <帧目录> <输出.mp4>                合成录像
 *   webprobe doctor                                  自检运行环境
 *   webprobe selftest                                用内置样例验证检测能力
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { PLATFORM, FINDING_KINDS } from './core/schema.mjs';
import { closeTarget, listTargets, loadTarget } from './core/target.mjs';
import { runTarget } from './core/engine.mjs';
import { collectKnownSignatures, listRuns, readRunReport } from './core/reporter.mjs';
import { startUiServer } from './core/server.mjs';
import { resolveBrowser } from './core/browser.mjs';
import { assembleFromFrames, resolveFfmpeg } from './core/recorder.mjs';
import { PROJECT_ROOT, createLogger, exists } from './core/paths.mjs';
import { RUNS_DIR, formatDuration } from './core/util.mjs';

/* ------------------------------------------------------------ arg parsing */

const ALIAS = {
  t: 'target', s: 'seed', o: 'output', p: 'port', h: 'help', v: 'verbose', j: 'json',
  d: 'duration', n: 'max-pages', m: 'max-actions',
};

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=');
      if (inline !== undefined) { out.flags[k] = inline; continue; }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) { out.flags[k] = next; i++; }
      else out.flags[k] = true;
    } else if (a.startsWith('-') && a.length > 1) {
      const k = ALIAS[a.slice(1)] || a.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) { out.flags[k] = next; i++; }
      else out.flags[k] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

const HELP = `
${PLATFORM.displayName}  v${PLATFORM.version}

用法：
  webprobe run --target <目录|目标id|URL> [选项]   动态执行被测软件并捕获崩溃/错误
  webprobe targets                                 列出所有可用目标
  webprobe ui [--port 7788]                        启动可视化看板
  webprobe report [runId] [--open]                 查看历史报告
  webprobe video <帧目录> <输出.mp4>                从帧序列合成录像
  webprobe doctor                                  检查运行环境是否满足要求
  webprobe selftest                               用内置样例验证检测器与误报

run 选项：
  --target, -t <spec>     待测软件所在目录 / 目标 id / http(s) URL（必填）
  --seed, -s <n>          随机种子，相同种子可复现执行序列（默认取 target.json）
  --headed                显示浏览器窗口便于观察（默认无头）
  --strategy <auto|direct|cdp>
                          auto=优先直连启动，失败则改用免管道 CDP 方式（默认 auto）
  --max-pages, -n <n>     最多访问页面数
  --max-actions, -m <n>   每页最多执行动作数
  --duration, -d <秒>     整轮测试时间预算
  --output, -o <dir>      报告输出目录（默认 runs/）
  --no-record             不录制运行视频
  --no-fuzz               只做被动观察与 DOM 审计，不主动模糊测试
  --json                  把最终 RunReport 打印到 stdout（便于 CI 解析）
  --verbose, -v           输出调试日志
  --quiet                 只输出错误

示例：
  webprobe run -t code/targets/huya-live --duration 300
  webprobe run -t code/samples/buggy-shop --headed
  webprobe run -t https://example.com --max-pages 5
`;

/* -------------------------------------------------------------- commands */

async function cmdRun(argv) {
  const { flags } = parseArgs(argv);
  const spec = flags.target || flags.t;
  const logger = createLogger({ verbose: !!flags.verbose, quiet: !!flags.quiet });
  if (!spec) {
    logger.error('缺少 --target。使用 webprobe run --target <目录|目标id|URL>');
    process.exitCode = 2;
    return;
  }

  const bound = await loadTarget(spec, { logger });
  const known = await collectKnownSignatures().catch(() => new Set());

  const report = await runTarget(bound, {
    logger,
    seed: flags.seed ? Number(flags.seed) : (bound.fuzz?.seed ?? 20261016),
    headless: !flags.headed,
    record: !flags['no-record'],
    strategy: flags.strategy || 'auto',
    outputDir: flags.output ? path.resolve(flags.output) : RUNS_DIR,
    maxPages: flags['max-pages'] ? Number(flags['max-pages']) : bound.budget.maxPages,
    maxActions: flags['max-actions'] ? Number(flags['max-actions']) : bound.budget.maxActionsPerPage,
    maxDurationMs: flags.duration ? Number(flags.duration) * 1000 : bound.budget.maxDurationMs,
    fuzz: flags['no-fuzz'] ? false : undefined,
    knownSignatures: known,
  }).finally(() => closeTarget(bound));

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }

  // Exit code is useful in CI: 0 = no high-severity defect, 1 = defects found.
  const bad = report.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
  process.exitCode = bad > 0 ? 1 : 0;
}

async function cmdTargets(argv) {
  const { flags } = parseArgs(argv);
  const logger = createLogger({ verbose: !!flags.verbose });
  const targets = await listTargets();
  if (flags.json) {
    process.stdout.write(JSON.stringify(targets, null, 2) + '\n');
    return;
  }
  if (!targets.length) {
    logger.warn('没有找到任何目标。请在 code/targets/<id>/target.json 或 code/samples/<id>/target.json 中定义。');
    return;
  }
  logger.raw('');
  logger.raw(`  ${logger.paint('bold', '可用目标')}`);
  logger.raw('');
  for (const t of targets) {
    logger.raw(`  ${logger.paint('cyan', t.id.padEnd(16))} ${t.name}`);
    logger.raw(`  ${' '.repeat(16)} ${logger.paint('grey', `${t.kind} · ${t.url}`)}`);
    logger.raw(`  ${' '.repeat(16)} ${logger.paint('grey', t.dir)}`);
    logger.raw('');
  }
}

async function cmdUi(argv) {
  const { flags } = parseArgs(argv);
  const logger = createLogger({ verbose: !!flags.verbose });
  const port = flags.port ? Number(flags.port) : 7788;
  const server = await startUiServer({ port, logger });
  logger.raw('');
  logger.raw(`  ${logger.paint('bold', `${PLATFORM.name} 测试看板`)}  ${logger.paint('green', server.url)}`);
  logger.raw(`  ${logger.paint('grey', '按 Ctrl+C 停止')}`);
  logger.raw('');
  const shutdown = async () => {
    logger.info('正在关闭看板…');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function cmdReport(argv) {
  const { _: positional, flags } = parseArgs(argv);
  const logger = createLogger({ verbose: !!flags.verbose });
  const runs = await listRuns();
  if (!runs.length) {
    logger.warn('还没有任何运行记录。先执行 webprobe run --target <目标>。');
    return;
  }
  const wanted = positional[0];
  if (!wanted) {
    logger.raw('');
    logger.raw(`  ${logger.paint('bold', '历史运行记录')}`);
    logger.raw('');
    logger.raw(`  ${'运行 ID'.padEnd(40)} ${'目标'.padEnd(18)} ${'缺陷'.padStart(4)}  ${'耗时'.padStart(8)}`);
    logger.raw(`  ${'─'.repeat(78)}`);
    for (const r of runs.slice(0, 40)) {
      const n = r.stats?.findings ?? 0;
      const colored = n > 0 ? logger.paint('yellow', String(n).padStart(4)) : logger.paint('green', String(n).padStart(4));
      logger.raw(`  ${r.runId.padEnd(40)} ${String(r.targetId).padEnd(18)} ${colored}  ${formatDuration(r.durationMs).padStart(8)}`);
    }
    logger.raw('');
    logger.raw(`  ${logger.paint('grey', '查看详情：webprobe report <运行 ID> --open')}`);
    logger.raw('');
    return;
  }

  const report = await readRunReport(wanted);
  if (!report) {
    logger.error(`找不到运行记录 ${wanted}`);
    process.exitCode = 2;
    return;
  }
  const dir = path.join(RUNS_DIR, wanted);
  logger.raw('');
  logger.raw(`  ${logger.paint('bold', `${report.target.name} · ${report.runId}`)}`);
  logger.raw(`  耗时 ${formatDuration(report.durationMs)} · 访问 ${report.stats.pagesVisited} 页 · 动作 ${report.stats.actionsExecuted} · 缺陷 ${report.findings.length}`);
  logger.raw('');
  for (const f of report.findings) {
    logger.raw(`  ${logger.paint(sevColor(f.severity), `[${f.severity.toUpperCase().padEnd(8)}]`)} ${f.id}  ${f.title}`);
  }
  logger.raw('');
  logger.raw(`  报告：${path.join(dir, 'report.html')}`);
  if (report.video) logger.raw(`  录像：${path.join(dir, report.video)}`);
  logger.raw('');

  if (flags.open) openPath(path.join(dir, 'report.html'));
}

async function cmdVideo(argv) {
  const { _: positional } = parseArgs(argv);
  const logger = createLogger();
  const [framesDir, out] = positional;
  if (!framesDir || !out) {
    logger.error('用法：webprobe video <帧目录> <输出.mp4>');
    process.exitCode = 2;
    return;
  }
  await assembleFromFrames(path.resolve(framesDir), path.resolve(out), { logger });
}

async function cmdDoctor(argv) {
  const { flags } = parseArgs(argv);
  const logger = createLogger({ verbose: !!flags.verbose });
  const checks = [];

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    name: 'Node.js 版本',
    ok: nodeMajor >= 20,
    detail: `v${process.versions.node}${nodeMajor >= 20 ? '' : '（需要 >= 20.11）'}`,
  });

  let api = null;
  try {
    ({ api } = await import('./core/browser.mjs').then((m) => ({ api: m.loadPlaywright().api })));
    checks.push({ name: 'playwright-core 可用', ok: true, detail: '已安装' });
  } catch (err) {
    checks.push({ name: 'playwright-core 可用', ok: false, detail: err.message.split('\n')[0] });
  }

  try {
    const resolved = resolveBrowser({});
    checks.push({ name: '可用浏览器内核', ok: true, detail: resolved.label });
  } catch (err) {
    checks.push({ name: '可用浏览器内核', ok: false, detail: err.message.split('\n')[0] });
  }

  const ffmpeg = resolveFfmpeg();
  checks.push({
    name: 'ffmpeg（录像合成）',
    ok: !!ffmpeg,
    detail: ffmpeg || '未找到 — 运行 node code/scripts/fetch-ffmpeg.mjs',
  });

  try {
    const targets = await listTargets();
    checks.push({ name: '目标清单', ok: true, detail: `${targets.length} 个目标` });
  } catch (err) {
    checks.push({ name: '目标清单', ok: false, detail: err.message });
  }

  try {
    await fsp.mkdir(RUNS_DIR, { recursive: true });
    const probe = path.join(RUNS_DIR, '.write-test');
    await fsp.writeFile(probe, 'ok');
    await fsp.rm(probe, { force: true });
    checks.push({ name: 'runs/ 目录可写', ok: true, detail: RUNS_DIR });
  } catch (err) {
    checks.push({ name: 'runs/ 目录可写', ok: false, detail: err.message.split('\n')[0] });
  }

  // The decisive check: a browser really has to be able to start here.
  if (api) {
    try {
      const browser = await api.chromium.launch({
        headless: true,
        executablePath: resolveBrowser({}).executablePath || undefined,
        timeout: 30_000,
      });
      const page = await browser.newPage();
      await page.setContent('<h1 id=t>ok</h1>');
      const text = await page.textContent('#t');
      await browser.close();
      checks.push({ name: '浏览器能否真正启动', ok: text === 'ok', detail: '启动成功并可执行脚本' });
    } catch (err) {
      const msg = err.message.split('\n')[0];
      const eperm = /EPERM|EACCES|拒绝访问|access is denied/i.test(err.message);
      checks.push({
        name: '浏览器能否真正启动',
        ok: false,
        detail: eperm
          ? `${msg}\n      原因：Chromium 多进程通信依赖 Windows 命名管道，当前环境禁止创建管道。\n      请在普通终端/桌面环境运行，或让容器允许命名管道（Docker 加 --ipc=host）。`
          : msg,
      });
    }
  }

  logger.raw('');
  logger.raw(`  ${logger.paint('bold', `${PLATFORM.name} 环境自检`)}`);
  logger.raw('');
  let fatal = 0;
  for (const c of checks) {
    const mark = c.ok ? logger.paint('green', '✔') : logger.paint('red', '✘');
    logger.raw(`  ${mark} ${c.name.padEnd(22)} ${c.detail}`);
    if (!c.ok) fatal++;
  }
  logger.raw('');
  logger.raw(fatal === 0
    ? `  ${logger.paint('green', '环境就绪，可以开始测试。')}`
    : `  ${logger.paint('yellow', `${fatal} 项检查未通过，请先修复后再运行测试。`)}`);
  logger.raw('');
  process.exitCode = fatal === 0 ? 0 : 1;
}

/**
 * The self-test is the project's own regression suite: it proves the detectors
 * fire on software that is known to be broken, and — just as importantly — that
 * they stay silent on software that is known to be correct.
 */
async function cmdSelftest(argv) {
  const { flags } = parseArgs(argv);
  const logger = createLogger({ verbose: !!flags.verbose });
  const samples = ['buggy-shop', 'clean-site'];
  const expectations = {
    'buggy-shop': {
      mustFind: ['js-exception', 'unhandled-rejection', 'console-error', 'http-error', 'resource-error', 'dom-anomaly', 'assertion'],
      mustNotFind: [],
    },
    'clean-site': {
      mustFind: [],
      mustNotFind: ['js-exception', 'unhandled-rejection', 'http-error', 'resource-error', 'page-crash', 'assertion'],
    },
  };

  const available = (await listTargets()).map((t) => t.id);
  const results = [];
  let failed = 0;

  for (const id of samples) {
    if (!available.includes(id)) {
      logger.warn(`跳过样例 ${id}：未找到（code/samples/${id}/target.json）`);
      continue;
    }
    logger.raw('');
    logger.raw(`  ${logger.paint('bold', `▶ 自检样例：${id}`)}`);
    const bound = await loadTarget(id, { logger });
    const report = await runTarget(bound, {
      logger,
      record: !!flags.record,
      outputDir: RUNS_DIR,
      runId: `selftest-${id}-${Date.now()}`,
    }).finally(() => closeTarget(bound));

    const kinds = new Set(report.findings.map((f) => f.kind));
    const exp = expectations[id] || { mustFind: [], mustNotFind: [] };
    const missing = exp.mustFind.filter((k) => !kinds.has(k));
    const unexpected = exp.mustNotFind.filter((k) => kinds.has(k));
    const ok = missing.length === 0 && unexpected.length === 0;

    if (!ok) failed++;
    results.push({ id, ok, found: [...kinds], missing, unexpected, runId: report.runId });

    logger.raw('');
    logger.raw(`  ${ok ? logger.paint('green', '✔ 通过') : logger.paint('red', '✘ 未通过')}  ${id}`);
    logger.raw(`    检出类型：${[...kinds].join(', ') || '(无)'}`);
    if (missing.length) logger.raw(`    ${logger.paint('red', `缺少预期检出：${missing.join(', ')}`)}`);
    if (unexpected.length) logger.raw(`    ${logger.paint('red', `出现不应有的误报：${unexpected.join(', ')}`)}`);
    logger.raw(`    报告：runs/${report.runId}/report.html`);
  }

  logger.raw('');
  logger.raw(failed === 0
    ? `  ${logger.paint('green', '自检全部通过：检测能力与误报控制均符合预期。')}`
    : `  ${logger.paint('red', `自检有 ${failed} 项未通过。`)}`);
  logger.raw('');

  if (flags.json) process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  process.exitCode = failed === 0 ? 0 : 1;
}

function sevColor(sev) {
  return { critical: 'red', high: 'red', medium: 'yellow', low: 'blue', info: 'grey' }[sev] ?? 'reset';
}

function openPath(p) {
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    spawn(cmd, [p], { detached: true, stdio: 'ignore' }).unref();
  } catch { /* best effort */ }
}

/* ------------------------------------------------------------------- main */

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP);
    return;
  }

  switch (cmd) {
    case 'run': return cmdRun(rest);
    case 'targets': case 'list': return cmdTargets(rest);
    case 'ui': case 'serve': return cmdUi(rest);
    case 'report': case 'reports': return cmdReport(rest);
    case 'video': return cmdVideo(rest);
    case 'doctor': case 'check': return cmdDoctor(rest);
    case 'selftest': case 'test': return cmdSelftest(rest);
    case 'kinds': {
      for (const [k, v] of Object.entries(FINDING_KINDS)) {
        process.stdout.write(`${k.padEnd(22)} ${v.severity.padEnd(9)} ${v.label}\n`);
      }
      return;
    }
    default:
      process.stderr.write(`未知命令：${cmd}\n`);
      process.stdout.write(HELP);
      process.exitCode = 2;
  }
}

main().catch((err) => {
  process.stderr.write(`\n致命错误：${err?.stack || err}\n`);
  process.exitCode = 1;
});

export { parseArgs };
