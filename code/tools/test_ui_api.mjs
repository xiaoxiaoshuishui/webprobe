// End-to-end check of the dashboard without a browser: start the server, hit
// every documented endpoint, and assert the static UI is served.
//
//   node code/tools/test_ui_api.mjs
import { startUiServer } from '../src/core/server.mjs';

const server = await startUiServer({ port: 0 });
const base = `http://127.0.0.1:${server.port}`;
let pass = 0;
let fail = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL ${name} — ${err.message}`);
    fail++;
  }
}

const get = async (p) => {
  const r = await fetch(base + p);
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

await check('GET /api/health', async () => {
  const { status, body } = await get('/api/health');
  if (status !== 200 || !body.ok) throw new Error(`status=${status}`);
  return `${body.platform} ${body.version}`;
});

await check('GET /api/targets  (lists all three targets)', async () => {
  const { status, body } = await get('/api/targets');
  if (status !== 200 || !Array.isArray(body)) throw new Error(`status=${status}`);
  if (body.length < 3) throw new Error(`only ${body.length} targets`);
  return body.map((t) => t.id).join(', ');
});

let firstRun = null;
await check('GET /api/runs  (run index, newest first)', async () => {
  const { status, body } = await get('/api/runs');
  if (status !== 200 || !Array.isArray(body)) throw new Error(`status=${status}`);
  if (!body.length) throw new Error('no runs found');
  firstRun = body[0];
  const sorted = body.every((r, i) => i === 0 || String(body[i - 1].startedAt) >= String(r.startedAt));
  if (!sorted) throw new Error('not sorted newest-first');
  return `${body.length} runs, newest=${body[0].runId}`;
});

await check('GET /api/runs/:runId  (full report with findings)', async () => {
  const { status, body } = await get(`/api/runs/${encodeURIComponent(firstRun.runId)}`);
  if (status !== 200) throw new Error(`status=${status}`);
  if (!Array.isArray(body.findings)) throw new Error('findings missing');
  if (body.findings.length !== body.stats.findings) throw new Error('stats.findings mismatch');
  return `${body.findings.length} findings, ${body.stats.pagesVisited} pages`;
});

await check('artifact fetch works for a real screenshot', async () => {
  const { body: report } = await get(`/api/runs/${encodeURIComponent(firstRun.runId)}`);
  const shot = report.findings.map((f) => f.evidence?.screenshots?.[0]).find(Boolean);
  if (!shot) throw new Error('no screenshot in any finding');
  const r = await fetch(`${base}/api/runs/${encodeURIComponent(firstRun.runId)}/artifacts/${shot.split('/').map(encodeURIComponent).join('/')}`);
  if (r.status !== 200) throw new Error(`status=${r.status} for ${shot}`);
  const bytes = (await r.arrayBuffer()).byteLength;
  if (bytes < 100) throw new Error('suspiciously small image');
  return `${shot} (${bytes} bytes)`;
});

await check('artifact path traversal is refused', async () => {
  const r = await fetch(`${base}/api/runs/${encodeURIComponent(firstRun.runId)}/artifacts/${encodeURIComponent('../../../etc/passwd')}`);
  if (r.status === 200) throw new Error('traversal NOT blocked');
  return `HTTP ${r.status}`;
});

await check('GET /api/runs/:runId/report.html', async () => {
  const r = await fetch(`${base}/api/runs/${encodeURIComponent(firstRun.runId)}/report.html`);
  const text = await r.text();
  if (r.status !== 200 || !text.includes('软件测试报告')) throw new Error(`status=${r.status}`);
  return `${text.length} bytes`;
});

await check('static UI is served at /', async () => {
  const r = await fetch(`${base}/`);
  const text = await r.text();
  if (r.status !== 200 || !text.includes('<html')) throw new Error(`status=${r.status}`);
  for (const asset of ['/styles.css', '/app.js']) {
    const a = await fetch(base + asset);
    if (a.status !== 200) throw new Error(`${asset} -> ${a.status}`);
  }
  return 'index.html + styles.css + app.js';
});

await check('unknown run returns 404 (not a crash)', async () => {
  const { status } = await get('/api/runs/does-not-exist');
  if (status !== 404) throw new Error(`status=${status}`);
  return 'HTTP 404';
});

await check('POST /api/run rejects a missing targetId', async () => {
  const r = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (r.status !== 400) throw new Error(`status=${r.status}`);
  return 'HTTP 400';
});

console.log(`\n  dashboard API: ${pass} passed, ${fail} failed`);
await server.close();
process.exit(fail === 0 ? 0 : 1);
