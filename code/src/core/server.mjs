/**
 * The dashboard server: a local, read-mostly HTTP surface over the run store.
 *
 * It serves the static UI in `code/ui/` and a small JSON API. Starting a test
 * from the browser is supported, but only ever one at a time, and the child run
 * is kept in-process so its lifecycle is observable through /api/runs.
 *
 *   GET  /api/health                       liveness + version
 *   GET  /api/targets                      discoverable targets
 *   GET  /api/runs                         run index, newest first
 *   GET  /api/runs/:runId                  full RunReport
 *   GET  /api/runs/:runId/artifacts/<path> artifact bytes (path-traversal safe)
 *   GET  /api/runs/:runId/report.html      rendered report
 *   POST /api/run  {targetId}              start a run
 */

import http from 'node:http';
import fsp from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { mimeFor } from './static-server.mjs';
import { listTargets, loadTarget, closeTarget } from './target.mjs';
import { listRuns, readRunReport } from './reporter.mjs';
import { PLATFORM } from './schema.mjs';
import { RUNS_DIR, UI_DIR, createLogger, exists } from './util.mjs';

const MAX_BODY = 64 * 1024;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new Error('request body too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Resolve an artifact path, refusing anything that escapes the run directory. */
function safeArtifact(runId, relPath) {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) return null;
  const runDir = path.resolve(RUNS_DIR, runId);
  const runsRoot = path.resolve(RUNS_DIR);
  if (!runDir.startsWith(runsRoot + path.sep)) return null;
  const rel = decodeURIComponent(String(relPath || '')).replace(/^\/+/, '');
  const abs = path.resolve(runDir, 'artifacts', rel);
  if (!abs.startsWith(runDir + path.sep)) return null;
  return abs;
}

export async function startUiServer({ port = 7788, host = '127.0.0.1', logger } = {}) {
  const log = logger ?? createLogger();
  /** Only one run at a time; the UI observes it through the run index. */
  const state = { running: null, lastError: null, history: [] };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const p = url.pathname;

    try {
      /* ---------------------------------------------------------- API */
      if (p === '/api/health') {
        return json(res, 200, {
          ok: true,
          platform: PLATFORM.name,
          displayName: PLATFORM.displayName,
          version: PLATFORM.version,
          schemaVersion: PLATFORM.schemaVersion,
          running: state.running,
          lastError: state.lastError,
        });
      }

      if (p === '/api/targets' && req.method === 'GET') {
        const targets = await listTargets();
        return json(res, 200, targets.map((t) => ({
          id: t.id, name: t.name, kind: t.kind, dir: t.dir, url: t.url, description: t.description,
        })));
      }

      if (p === '/api/runs' && req.method === 'GET') {
        return json(res, 200, await listRuns());
      }

      const runMatch = p.match(/^\/api\/runs\/([^/]+)$/);
      if (runMatch && req.method === 'GET') {
        const report = await readRunReport(decodeURIComponent(runMatch[1]));
        if (!report) return json(res, 404, { error: 'run not found' });
        return json(res, 200, report);
      }

      const artMatch = p.match(/^\/api\/runs\/([^/]+)\/artifacts\/(.+)$/);
      if (artMatch) {
        const abs = safeArtifact(decodeURIComponent(artMatch[1]), artMatch[2]);
        if (!abs || !exists(abs)) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404 Not Found');
        }
        const stat = await fsp.stat(abs);
        res.writeHead(200, {
          'Content-Type': mimeFor(abs),
          'Content-Length': stat.size,
          'Cache-Control': 'no-store',
        });
        return createReadStream(abs).pipe(res);
      }

      const repMatch = p.match(/^\/api\/runs\/([^/]+)\/report\.html$/);
      if (repMatch) {
        const file = path.join(RUNS_DIR, decodeURIComponent(repMatch[1]), 'report.html');
        if (!exists(file)) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return createReadStream(file).pipe(res);
      }

      if (p === '/api/run' && req.method === 'POST') {
        if (state.running) {
          return json(res, 409, { ok: false, error: '已有一个测试正在运行', running: state.running });
        }
        const body = await readBody(req);
        const targetId = body.targetId;
        if (!targetId) return json(res, 400, { ok: false, error: 'missing targetId' });

        const runId = `run-${Date.now()}-${targetId}`;
        state.lastError = null;
        state.running = { runId, targetId, startedAt: new Date().toISOString() };
        log.info(`[ui] 收到测试请求：${targetId} → ${runId}`);

        // Fire and forget: the UI follows progress through /api/runs.
        (async () => {
          let bound = null;
          try {
            bound = await loadTarget(targetId, { logger: log });
            const { runTarget } = await import('./engine.mjs');
            const { collectKnownSignatures } = await import('./reporter.mjs');
            const known = await collectKnownSignatures().catch(() => new Set());
            await runTarget(bound, {
              logger: log,
              runId,
              record: true,
              knownSignatures: known,
              seed: bound.fuzz?.seed,
            });
            log.ok(`[ui] 测试完成：${runId}`);
          } catch (err) {
            state.lastError = err.message;
            log.error(`[ui] 测试失败：${err.message}`);
          } finally {
            if (bound) await closeTarget(bound).catch(() => {});
            state.running = null;
          }
        })();

        return json(res, 202, { ok: true, runId });
      }

      /* ---------------------------------------------------------- static */
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return json(res, 405, { error: 'method not allowed' });
      }

      const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
      const file = path.resolve(UI_DIR, rel);
      if (!file.startsWith(path.resolve(UI_DIR)) || !exists(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
      }
      const stat = await fsp.stat(file);
      res.writeHead(200, {
        'Content-Type': mimeFor(file),
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(file).pipe(res);
    } catch (err) {
      log.error(`[ui] ${err.message}`);
      if (!res.headersSent) return json(res, 500, { error: err.message });
      res.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const addr = server.address();
  return {
    host,
    port: addr.port,
    url: `http://${host}:${addr.port}/`,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
