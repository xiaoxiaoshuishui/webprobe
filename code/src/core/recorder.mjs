/**
 * Screen recording.
 *
 * The project must ship a recording of the platform actually testing software,
 * so WebProbe records every run by default. It uses the DevTools
 * `Page.startScreencast` domain — the same mechanism Chrome's own DevTools
 * uses — which yields JPEG frames plus the timestamp each frame was produced
 * at. Those timestamps become per-frame durations, so the resulting video plays
 * back at the real speed of the test rather than at a guessed frame rate.
 *
 * Assembly needs ffmpeg. WebProbe looks for it in this order:
 *   1. the `FFMPEG_BIN` environment variable
 *   2. the `ffmpeg-static` package (installable via code/scripts/fetch-ffmpeg.mjs)
 *   3. `ffmpeg` on PATH
 * If none is available the frames are still written to disk, and the report
 * says so instead of pretending a video exists.
 */

import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { ensureDir, exists } from './util.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** Locate ffmpeg, returning null when the host has none. */
export function resolveFfmpeg() {
  if (process.env.FFMPEG_BIN && exists(process.env.FFMPEG_BIN)) return process.env.FFMPEG_BIN;
  try {
    const p = require('ffmpeg-static');
    if (p && exists(p)) return p;
  } catch { /* optional dependency not installed */ }
  return null;
}

export class Recorder {
  /**
   * @param {object} opts
   * @param {string} opts.dir        directory to write frames + video into
   * @param {number} [opts.quality]  JPEG quality 1..100
   * @param {number} [opts.maxWidth] downscale frames wider than this
   * @param {number} [opts.maxFrames] hard cap so a long run cannot fill the disk
   */
  constructor({ dir, quality = 62, maxWidth = 1280, maxFrames = 4000, logger } = {}) {
    this.dir = dir;
    this.framesDir = path.join(dir, 'frames');
    this.quality = quality;
    this.maxWidth = maxWidth;
    this.maxFrames = maxFrames;
    this.logger = logger;
    this.frames = [];
    this.running = false;
    this.error = null;
    this.startedAt = null;
    this._cdp = null;
    this._page = null;
  }

  async start(page) {
    if (this.running) return;
    this._page = page;
    this.startedAt = Date.now();
    await ensureDir(this.framesDir);
    try {
      this._cdp = await page.context().newCDPSession(page);
      this._cdp.on('Page.screencastFrame', (evt) => { this._onFrame(evt).catch(() => {}); });
      this._cdp.on('Page.screencastFrame', () => {}); // keep listener count stable
      await this._cdp.send('Page.enable');
      await this._cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: this.quality,
        maxWidth: this.maxWidth,
        maxHeight: Math.round(this.maxWidth * 0.75),
        everyNthFrame: 1,
      });
      this.running = true;
      this.logger?.debug?.(`recorder started → ${this.framesDir}`);
    } catch (err) {
      this.error = err.message;
      this.logger?.warn?.(`录像启动失败（将只保留截图）：${err.message.split('\n')[0]}`);
    }
  }

  async _onFrame(evt) {
    if (!this.running) return;
    try {
      if (this.frames.length < this.maxFrames) {
        const n = String(this.frames.length + 1).padStart(6, '0');
        const file = path.join(this.framesDir, `frame-${n}.jpg`);
        // Timestamps drive playback speed: remember when this frame appeared.
        this.frames.push({ file, t: Date.now() - this.startedAt });
        await fsp.writeFile(file, Buffer.from(evt.data, 'base64'));
      }
    } catch (err) {
      this.error = err.message;
    } finally {
      try {
        await this._cdp?.send('Page.screencastFrameAck', { sessionId: evt.sessionId });
      } catch { /* page may have navigated away */ }
    }
  }

  /** Pause capture (used around long, uninteresting waits). */
  async pause() {
    if (!this.running) return;
    try { await this._cdp.send('Page.stopScreencast'); } catch {}
  }

  /**
   * Stop capture and assemble the video.
   * @returns {{video?:string, frames:number, frameDir:string, note?:string}}
   */
  async stop({ fileName = 'run.mp4' } = {}) {
    if (this._cdp) {
      try { await this._cdp.send('Page.stopScreencast'); } catch {}
      try { await this._cdp.detach(); } catch {}
      this._cdp = null;
    }
    this.running = false;

    const result = { frames: this.frames.length, frameDir: this.framesDir };
    if (this.frames.length === 0) {
      result.note = '没有捕获到任何帧（页面可能在录像前就崩溃了）';
      return result;
    }

    const ffmpeg = resolveFfmpeg();
    if (!ffmpeg) {
      result.note = '未找到 ffmpeg，已保留 JPEG 帧序列；运行 node code/scripts/fetch-ffmpeg.mjs 后可用 `webprobe video` 重新合成。';
      return result;
    }

    try {
      const listFile = path.join(this.dir, 'frames.concat.txt');
      const lines = [];
      for (let i = 0; i < this.frames.length; i++) {
        const f = this.frames[i];
        const next = this.frames[i + 1];
        const dur = next ? Math.max(0.04, (next.t - f.t) / 1000) : 0.5;
        lines.push(`file '${f.file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
        lines.push(`duration ${dur.toFixed(3)}`);
      }
      // The concat demuxer needs the final entry repeated to honour its duration.
      lines.push(`file '${this.frames[this.frames.length - 1].file.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);
      await fsp.writeFile(listFile, lines.join('\n'), 'utf8');

      const out = path.join(this.dir, fileName);
      await execFileAsync(ffmpeg, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'concat', '-safe', '0', '-i', listFile,
        '-vsync', 'vfr',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        out,
      ], { maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 });

      result.video = out;
      result.bytes = (await fsp.stat(out)).size;
      // Frames are no longer needed once the mp4 exists.
      await fsp.rm(this.framesDir, { recursive: true, force: true }).catch(() => {});
      await fsp.rm(listFile, { force: true }).catch(() => {});
      this.logger?.info?.(`录像已生成：${out} (${(result.bytes / 1e6).toFixed(1)} MB, ${result.frames} 帧)`);
    } catch (err) {
      result.note = `ffmpeg 合成失败：${err.message.split('\n')[0]}；JPEG 帧序列已保留在 ${this.framesDir}`;
      this.logger?.warn?.(result.note);
    }
    return result;
  }
}

/**
 * Assemble a video from an existing frame directory (used by `webprobe video`
 * when a previous run could not find ffmpeg).
 */
export async function assembleFromFrames(framesDir, outFile, { logger } = {}) {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg) throw new Error('未找到 ffmpeg，请先运行 node code/scripts/fetch-ffmpeg.mjs');
  const names = (await fsp.readdir(framesDir)).filter((f) => /\.jpe?g$/i.test(f)).sort();
  if (!names.length) throw new Error(`${framesDir} 中没有帧文件`);
  const listFile = path.join(path.dirname(framesDir), 'frames.concat.txt');
  const lines = [];
  for (const n of names) {
    lines.push(`file '${path.join(framesDir, n).replace(/\\/g, '/')}'`);
    lines.push('duration 0.1');
  }
  lines.push(`file '${path.join(framesDir, names[names.length - 1]).replace(/\\/g, '/')}'`);
  await fsp.writeFile(listFile, lines.join('\n'), 'utf8');
  await execFileAsync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vsync', 'vfr', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile,
  ], { maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 });
  logger?.info?.(`已合成录像：${outFile}`);
  return outFile;
}
