/**
 * A tiny static web server used to *execute* local targets.
 *
 * WebProbe's input is a directory, so local software under test is served from
 * that directory on a loopback port and then driven in a real browser. The
 * server is deliberately strict and honest: it answers real 404/405 for
 * anything missing, which is exactly the class of defect the platform wants to
 * observe on the client.
 */

import http from 'node:http';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
};

export function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** Reject any path that escapes `root` (path traversal guard). */
function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, '');
  const abs = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

export async function startStaticServer(root, opts = {}) {
  const {
    host = '127.0.0.1',
    port = 0,
    spa = false,
    headers = {},
    logger,
  } = opts;
  const absRoot = path.resolve(root);

  const server = http.createServer(async (req, res) => {
    const common = {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      ...headers,
    };
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { ...common, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method Not Allowed', method: req.method }));
        return;
      }

      let target = safeJoin(absRoot, req.url || '/');
      if (!target) {
        res.writeHead(403, { ...common, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('403 Forbidden');
        return;
      }

      let stat = await fsp.stat(target).catch(() => null);
      if (stat?.isDirectory()) {
        target = path.join(target, 'index.html');
        stat = await fsp.stat(target).catch(() => null);
      }
      if (!stat?.isFile() && spa) {
        target = path.join(absRoot, 'index.html');
        stat = await fsp.stat(target).catch(() => null);
      }
      if (!stat?.isFile()) {
        res.writeHead(404, { ...common, 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>404</title>
<h1>404 Not Found</h1><p>${(req.url || '').replace(/[<>&]/g, '')}</p>`);
        return;
      }

      res.writeHead(200, {
        ...common,
        'Content-Type': mimeFor(target),
        'Content-Length': stat.size,
      });
      if (req.method === 'HEAD') { res.end(); return; }
      createReadStream(target).pipe(res);
    } catch (err) {
      logger?.debug?.(`static server error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('500 Internal Server Error');
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
    root: absRoot,
    url: `http://${host}:${addr.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Synchronous existence probe used by the target loader. */
export function fileExistsSync(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
