#!/usr/bin/env node
/**
 * Fetch the ffmpeg binary used to assemble test-run recordings.
 *
 * `ffmpeg-static` normally downloads this in its postinstall script, but many
 * package managers (pnpm >= 10, npm with --ignore-scripts) skip lifecycle
 * scripts. This script performs the same download explicitly and is safe to
 * re-run: it exits immediately when the binary is already present.
 *
 *   node code/scripts/fetch-ffmpeg.mjs [--force]
 *
 * Honours the same environment variables as ffmpeg-static:
 *   FFMPEG_BINARIES_URL   override the download base url
 *   FFMPEG_BINARY_RELEASE override the release tag (default b6.1.1)
 */

import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_DIR = path.resolve(HERE, '..', '..', 'node_modules', 'ffmpeg-static');

const RELEASE = process.env.FFMPEG_BINARY_RELEASE || 'b6.1.1';
const MIRRORS = [
  process.env.FFMPEG_BINARIES_URL,
  'https://cdn.npmmirror.com/binaries/ffmpeg-static',
  'https://github.com/eugeneware/ffmpeg-static/releases/download',
  'https://registry.npmmirror.com/-/binary/ffmpeg-static',
].filter(Boolean);

const isWin = process.platform === 'win32';
const BIN_NAME = isWin ? 'ffmpeg.exe' : 'ffmpeg';
const target = path.join(PKG_DIR, BIN_NAME);

const log = (...a) => console.log('[fetch-ffmpeg]', ...a);

async function download(url) {
  log('downloading', url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  let seen = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (c) => {
    seen += c.length;
    if (total && process.stdout.isTTY) {
      const pct = ((seen / total) * 100).toFixed(0);
      process.stdout.write(`\r[fetch-ffmpeg] ${pct}% (${(seen / 1e6).toFixed(1)} MB)`);
    }
  });
  await pipeline(body, createWriteStream(target + '.gz'));
  if (process.stdout.isTTY) process.stdout.write('\n');
  return target + '.gz';
}

const force = process.argv.includes('--force');

try {
  await fs.access(target);
  if (!force) {
    const st = await fs.stat(target);
    log(`already present: ${target} (${(st.size / 1e6).toFixed(1)} MB)`);
    process.exit(0);
  }
} catch { /* not present — download it */ }

await fs.mkdir(PKG_DIR, { recursive: true });

let lastErr;
for (const base of MIRRORS) {
  const url = `${base.replace(/\/$/, '')}/${RELEASE}/ffmpeg-${process.platform}-${os.arch()}.gz`;
  try {
    const gz = await download(url);
    log('extracting…');
    await fs.rm(target, { force: true });
    // Small enough to hold in memory once: ~80 MB compressed.
    const raw = await fs.readFile(gz);
    await fs.writeFile(target, gunzipSync(raw));
    await fs.rm(gz, { force: true });
    if (!isWin) await fs.chmod(target, 0o755);
    const st = await fs.stat(target);
    log(`done: ${target} (${(st.size / 1e6).toFixed(1)} MB)`);
    process.exit(0);
  } catch (e) {
    lastErr = e;
    log(`failed via ${base}: ${e.message}`);
  }
}

console.error('[fetch-ffmpeg] could not download ffmpeg:', lastErr?.message);
console.error('[fetch-ffmpeg] recordings will fall back to PNG frame sequences.');
process.exit(1);
