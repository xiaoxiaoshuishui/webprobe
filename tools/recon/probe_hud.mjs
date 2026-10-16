// Why is the on-page overlay not appearing? Test both ways of installing an
// init script against a real browser and report exactly what happens.
import { createRequire } from 'node:module';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { hudInitScript } from '../../code/src/core/hud.mjs';

const require = createRequire(import.meta.url);
const PW = 'C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(PW);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const src = hudInitScript.toString();
console.log('hudInitScript source length:', src.length);
console.log('source starts with:', JSON.stringify(src.slice(0, 60)));

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// --- variant A: pass the function object (what the engine does today) --------
try {
  await ctx.addInitScript(hudInitScript);
  console.log('A: addInitScript(function) accepted');
} catch (e) {
  console.log('A: addInitScript(function) THREW:', e.message.split('\n')[0]);
}

// --- variant B: pass explicit source -----------------------------------------
try {
  await ctx.addInitScript({ content: `;(${src})();` });
  console.log('B: addInitScript({content}) accepted');
} catch (e) {
  console.log('B: addInitScript({content}) THREW:', e.message.split('\n')[0]);
}

const probe = async (label, url) => {
  const page = await ctx.newPage();
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
  const state = await page.evaluate(() => ({
    hasHud: typeof window.__webprobeHud,
    rootPresent: !!document.getElementById('__webprobe_hud'),
    stylePresent: !!document.getElementById('__webprobe_hud_style'),
    htmlChildren: document.documentElement.children.length,
  }));
  console.log(`  ${label.padEnd(28)} ${JSON.stringify(state)}`);

  // Try to actually show the overlay and prove it paints.
  const shown = await page.evaluate(() => {
    if (!window.__webprobeHud) return 'no api';
    try {
      window.__webprobeHud.setHeader({ target: 'probe target' });
      window.__webprobeHud.setAction('点击 #btn-buy-now');
      window.__webprobeHud.setStats({ pages: 2, pagesMax: 10, actions: 7, requests: 42, failed: 3, findings: 2 });
      window.__webprobeHud.pushFinding({ severity: 'high', kindLabel: '未捕获 JS 异常', title: 'TypeError: Cannot read properties of null', occurrences: 3 });
      window.__webprobeHud.pushFinding({ severity: 'medium', kindLabel: 'DOM 异常', title: '关键容器内容为空', occurrences: 1 });
      return 'ok';
    } catch (e) { return 'threw: ' + e.message; }
  });
  const box = await page.evaluate(() => {
    const r = document.getElementById('__webprobe_hud');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    const cs = getComputedStyle(r);
    return { w: Math.round(b.width), h: Math.round(b.height), display: cs.display, opacity: cs.opacity, bg: cs.backgroundColor };
  });
  console.log(`  ${''.padEnd(28)} show=${shown} box=${JSON.stringify(box)}`);
  return page;
};

console.log('\n-- about:blank (initial document) --');
const pBlank = await probe('about:blank');
await pBlank.screenshot({ path: path.resolve('tools/frames/probe-blank.png') });

console.log('\n-- after a real navigation --');
const pNav = await probe('data: URL navigation', 'data:text/html,<html><head><title>t</title></head><body><h1>Hello probe</h1><button id=b>Buy</button></body></html>');
await pNav.screenshot({ path: path.resolve('tools/frames/probe-nav.png') });
writeFileSync('tools/frames/probe-result.txt', 'see console\n');

console.log('\n-- findings feed --');
const feed = await pNav.evaluate(() => {
  const api = window.__webprobeHud;
  if (!api) return { error: 'no api' };
  const out = {};
  const rows = () => document.querySelectorAll('#__webprobe_hud .wp-row').length;

  // Call each method exactly the way the engine does, surfacing any error
  // instead of swallowing it the way hudCall's in-page wrapper does.
  const attempt = (name, arg) => {
    try { api[name](arg); out[name] = 'ok'; } catch (e) { out[name] = 'THREW: ' + e.message; }
  };
  attempt('setFindings', [
    { severity: 'high', kindLabel: '未捕获 JS 异常', title: 'TypeError: x', occurrences: 2, selector: '#b' },
    { severity: 'low', kindLabel: '性能劣化', title: '长任务 280ms', occurrences: 1 },
  ]);
  out.rowsAfterSetFindings = rows();
  out.feedText = (document.querySelector('#__webprobe_hud .wp-findings') || {}).textContent?.slice(0, 60);

  attempt('pushFinding', { severity: 'critical', kindLabel: '渲染进程崩溃', title: 'frozen', occurrences: 1 });
  out.rowsAfterPush = rows();

  attempt('setStats', { pages: 3, pagesMax: 10, actions: 44, requests: 900, failed: 12, findings: 3 });
  out.statsText = (document.querySelector('#__webprobe_hud .wp-stats') || {}).textContent?.slice(0, 70);

  attempt('setAction', '点击 #b');
  out.actionText = (document.querySelector('#__webprobe_hud .wp-action') || {}).textContent?.slice(0, 40);
  return out;
});
console.log(' ', JSON.stringify(feed, null, 2));
await pNav.screenshot({ path: path.resolve('tools/frames/probe-feed.png') });

console.log('\n-- card rendering --');
const cardState = await pNav.evaluate(() => {
  if (!window.__webprobeHud) return 'no api';
  window.__webprobeHud.showCard('<h1 style="color:#fff">CARD TEST</h1>');
  const c = document.getElementById('__webprobe_card');
  if (!c) return 'card element missing';
  const cs = getComputedStyle(c);
  const b = c.getBoundingClientRect();
  return { display: cs.display, position: cs.position, w: Math.round(b.width), h: Math.round(b.height), text: c.textContent.slice(0, 40) };
});
console.log('  card:', JSON.stringify(cardState));
await pNav.screenshot({ path: path.resolve('tools/frames/probe-card.png') });

await browser.close();
console.log('\nDONE');
