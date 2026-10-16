// Reconnaissance: fetch the Huya Live web homepage and describe its structure so
// the target manifest can use real selectors instead of guesses.
const res = await fetch('https://www.huya.com/', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  },
});
const html = await res.text();
console.log('status', res.status, 'bytes', html.length);

const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
console.log('title:', title);

const count = (re) => (html.match(re) || []).length;
console.log('\n--- signals ---');
console.log('script tags      :', count(/<script/gi));
console.log('external scripts :', count(/<script[^>]+src=/gi));
console.log('iframes          :', count(/<iframe/gi));
console.log('img tags         :', count(/<img/gi));
console.log('css links        :', count(/<link[^>]+rel=["']?stylesheet/gi));
console.log('inline handlers  :', count(/\son(click|load|error)=/gi));

const grab = (label, re, limit = 30) => {
  const set = new Set();
  for (const m of html.matchAll(re)) set.add(m[1]);
  console.log(`\n--- ${label} (${set.size}) ---`);
  console.log([...set].slice(0, limit).join('\n'));
};

grab('element ids', /\sid=["']([A-Za-z][\w-]*)["']/g, 70);
grab('input names/ids', /<input[^>]*?(?:id|name)=["']([\w-]+)["'][^>]*>/gi, 30);

// Classes that look like layout landmarks.
const cls = new Set();
for (const m of html.matchAll(/class=["']([^"']{3,120})["']/g)) {
  for (const c of m[1].split(/\s+/)) {
    if (/(nav|header|footer|search|live|list|room|player|banner|main|wrap|container|tab|menu|login|user)/i.test(c)) cls.add(c);
  }
}
console.log(`\n--- landmark-ish classes (${cls.size}) ---`);
console.log([...cls].slice(0, 80).join('\n'));

// Search form / input shape.
const form = html.match(/<form[\s\S]{0,600}?<\/form>/i);
console.log('\n--- first <form> ---');
console.log(form ? form[0].slice(0, 700) : '(none)');

const searchCtx = html.search(/search/i);
if (searchCtx > 0) {
  console.log('\n--- context around first "search" ---');
  console.log(html.slice(Math.max(0, searchCtx - 400), searchCtx + 400).replace(/\s+/g, ' '));
}

// Nav links we could crawl.
const links = new Set();
for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/g)) {
  const h = m[1];
  if (/^https?:\/\/(www\.)?huya\.com/i.test(h) || /^\/[^/]/.test(h)) links.add(h);
}
console.log(`\n--- huya-ish links (${links.size}) ---`);
console.log([...links].slice(0, 60).join('\n'));
