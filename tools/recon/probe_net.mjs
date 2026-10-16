// Network reachability probe from Node (the only runtime that has network here).
const targets = [
  ['registry.npmmirror.com', 'https://registry.npmmirror.com/-/ping'],
  ['registry.npmjs.org', 'https://registry.npmjs.org/-/ping'],
  ['cdn.npmmirror.com', 'https://cdn.npmmirror.com/binaries/playwright/'],
  ['playwright CDN', 'https://playwright.azureedge.net/'],
  ['huya.com', 'https://www.huya.com/'],
  ['huya static', 'https://huyaimg.msstatic.com/'],
];

const one = async (name, url) => {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20000);
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    clearTimeout(t);
    const body = await r.text();
    console.log(`${name.padEnd(22)} HTTP ${r.status}  bytes=${body.length}`);
  } catch (e) {
    console.log(`${name.padEnd(22)} FAIL ${e.message}`);
  }
};

await Promise.all(targets.map(([n, u]) => one(n, u)));
