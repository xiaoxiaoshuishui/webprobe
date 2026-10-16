// Debug why the system browser does not expose a DevTools endpoint under the sandbox.
// stdio goes to files (not pipes), so this stays inside the sandbox rules.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logDir = path.join(os.tmpdir(), 'dsh-browser-probe');
fs.mkdirSync(logDir, { recursive: true });

const BROWSERS = [
  ['chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'],
  ['edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
];

const VARIANTS = [
  ['headless-new', ['--headless=new']],
  ['headless-plain', ['--headless']],
];

for (const [bname, exe] of BROWSERS) {
  for (const [vname, flags] of VARIANTS) {
    const port = 9400 + Math.floor(Math.random() * 400);
    const tag = `${bname}-${vname}`;
    const profile = path.join(logDir, 'profile-' + tag);
    const outPath = path.join(logDir, tag + '.log');
    const fd = fs.openSync(outPath, 'w');
    let child;
    try {
      child = spawn(exe, [
        ...flags,
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        '--no-first-run', '--no-default-browser-check',
        '--disable-gpu', '--disable-dev-shm-usage',
        'about:blank',
      ], { stdio: ['ignore', fd, fd] });
    } catch (e) {
      console.log(`${tag.padEnd(22)} SPAWN FAIL ${e.message}`);
      fs.closeSync(fd);
      continue;
    }

    let up = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (child.exitCode !== null) break;
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.ok) { up = await r.json(); break; }
      } catch { /* keep waiting */ }
    }

    const alive = child.exitCode === null;
    console.log(`${tag.padEnd(22)} exitCode=${child.exitCode} alive=${alive} devtools=${up ? up.Browser : 'NO'}`);
    if (up) console.log('    wsEndpoint =', up.webSocketDebuggerUrl);

    if (!up) {
      let log = '';
      try { log = fs.readFileSync(outPath, 'utf8'); } catch {}
      const tail = log.split('\n').filter(Boolean).slice(-6).join(' | ');
      if (tail) console.log('    log:', tail.slice(0, 400));
    }

    try { child.kill(); } catch {}
    fs.closeSync(fd);
    if (up) { console.log('SUCCESS with', tag); process.exit(0); }
  }
}
console.log('no variant produced a devtools endpoint');
