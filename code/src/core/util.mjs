/**
 * Small shared helpers: console output, a seeded RNG (so a fuzz run is
 * reproducible from its seed), path/fs utilities and misc formatting.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ paths */

export const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));   // code/src/core
export const CODE_DIR = path.resolve(SRC_DIR, '..', '..');              // code
export const ROOT_DIR = path.resolve(CODE_DIR, '..');                   // repo root
export const RUNS_DIR = path.join(ROOT_DIR, 'runs');
export const UI_DIR = path.join(CODE_DIR, 'ui');

export function resolveFrom(base, p) {
  return path.isAbsolute(p) ? p : path.resolve(base, p);
}

/* -------------------------------------------------------------------- log */

const COLORS = {
  reset: '\u001b[0m', dim: '\u001b[2m', bold: '\u001b[1m',
  red: '\u001b[31m', green: '\u001b[32m', yellow: '\u001b[33m',
  blue: '\u001b[34m', magenta: '\u001b[35m', cyan: '\u001b[36m',
  grey: '\u001b[90m',
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function paint(color, s) {
  return useColor ? `${COLORS[color] ?? ''}${s}${COLORS.reset}` : s;
}

const LEVEL_COLOR = { info: 'cyan', ok: 'green', warn: 'yellow', error: 'red', step: 'magenta', debug: 'grey' };

export function createLogger({ verbose = false, quiet = false } = {}) {
  const t0 = Date.now();
  const emit = (level, msg) => {
    if (quiet && level !== 'error') return;
    if (level === 'debug' && !verbose) return;
    const t = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
    const tag = level.toUpperCase().padEnd(5);
    process.stdout.write(`${paint('grey', t + 's')} ${paint(LEVEL_COLOR[level] ?? 'reset', tag)} ${msg}\n`);
  };
  return {
    info: (m) => emit('info', m),
    ok: (m) => emit('ok', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m),
    step: (m) => emit('step', m),
    debug: (m) => emit('debug', m),
    raw: (m) => process.stdout.write(m + '\n'),
    paint,
  };
}

/* -------------------------------------------------------------------- rng */

/** mulberry32 — tiny deterministic PRNG so runs are reproducible by seed. */
export function createRng(seed = Date.now()) {
  let a = (Number(seed) || 1) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    /** float in [0,1) */
    next,
    /** int in [min,max] */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
    /** Fisher-Yates copy */
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    bool: (p = 0.5) => next() < p,
  };
}

/* --------------------------------------------------------------------- fs */

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJson(file, data, pretty = true) {
  await ensureDir(path.dirname(file));
  await fsp.writeFile(file, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8');
}

export async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

export function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

/* ---------------------------------------------------------------- format */

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return `${m}分${rest}秒`;
}

export function truncate(s, n = 160) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

export function timestampSlug(d = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function safeFileName(s) {
  return String(s).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
}

/** Turn a URL into a short readable label for logs. */
export function urlLabel(u) {
  try {
    const url = new URL(u);
    return `${url.host}${url.pathname}${url.search ? '?' + url.searchParams.toString().slice(0, 40) : ''}`;
  } catch {
    return String(u);
  }
}

/** Does `url` match any of the glob-ish patterns (`*` = any chars, `**` = same, here)? */
export function matchAny(patterns, url) {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => globToRegExp(p).test(url));
}

const globCache = new Map();
export function globToRegExp(glob) {
  if (globCache.has(glob)) return globCache.get(glob);
  const escaped = String(glob)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^]*')
    .replace(/\u0000/g, '[^]*')
    .replace(/\?/g, '.');
  const re = new RegExp(`^${escaped}$`);
  globCache.set(glob, re);
  return re;
}

/* ------------------------------------------------------------------ misc */

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Run an async fn with a hard timeout; resolves `fallback` when it overruns. */
export async function withTimeout(promise, ms, fallback = undefined) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Deep-merge plain objects; arrays are replaced, not concatenated. */
export function deepMerge(base, override) {
  if (Array.isArray(override)) return override.slice();
  if (override === null || typeof override !== 'object') {
    return override === undefined ? base : override;
  }
  const out = { ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}) };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out;
}
