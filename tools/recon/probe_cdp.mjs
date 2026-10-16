// Probe: launch system Chrome WITHOUT pipes (stdio:'ignore') and attach over CDP.
// This is the sandbox-compatible launch path the platform will use as a fallback.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const PW = 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(PW);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const profile = path.join(os.tmpdir(), 'dsh-pw-probe-profile');

const child = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  'about:blank',
], { stdio: 'ignore' });

console.log('spawned pid', child.pid);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let version = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) { version = await r.json(); break; }
  } catch { /* not up yet */ }
}

if (!version) {
  console.log('FAIL: devtools endpoint never came up');
  child.kill();
  process.exit(1);
}
console.log('devtools OK:', version.Browser);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const ctx = browser.contexts()[0] || (await browser.newContext());
const page = await ctx.newPage();
await page.setContent('<h1 id=t>CDP attach works</h1>');
console.log('textContent =', await page.textContent('#t'));

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
try {
  const resp = await page.goto('https://www.huya.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('huya status =', resp && resp.status(), 'title =', await page.title());
} catch (e) {
  console.log('huya navigation failed:', e.message.split('\n')[0]);
}
console.log('captured events:', errors.length);
for (const e of errors.slice(0, 6)) console.log('   ', e.slice(0, 160));

const shot = path.join(os.tmpdir(), 'dsh-probe.png');
await page.screenshot({ path: shot, fullPage: false });
console.log('screenshot written to', shot);

await browser.close();
child.kill();
console.log('DONE');
