// Verify that the selectors intended for the Huya target actually exist in the
// served HTML, so the manifest does not depend on guesses.
const res = await fetch('https://www.huya.com/', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-CN,zh;q=0.9',
  },
});
const html = await res.text();

const probes = [
  '#search-bar-input', 'searchForm_id', 'btn-search', 'hsk',
  '#duya-header', '.duya-header-nav', '#hy-nav-category', '#hy-nav-match',
  '#J_hyHdNavItemGame', '#J_hyHdNavItemShop', '#J_duyaHeaderRight', '#J_duyaHdSearch',
  '.game-classify-list', '#js-main', '#index_player', '#j_live-list', '.j_live-list',
  '.game-live-item', '.mod-index-list', '.live-box', '#J_adBnM', '.ad-banner-close',
  '.banner-close', '.huya-footer', '#wrap-news', '.wrap-recGameLive', '.ssr-wrapper',
  '#root', '.duya-header-search-suggest', '.search-suggest-container', '.nav-expand-list',
  '.hy-nav-expand-game', '.hy-nav-expand-match', '.hy-nav-link-onlineGame',
];

for (const p of probes) {
  const token = p.replace(/^[.#]/, '');
  const n = (html.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  console.log(`${n > 0 ? 'OK  ' : 'MISS'} ${String(n).padStart(3)}  ${p}`);
}

// How many live items are server-rendered?
console.log('\ngame-live-item occurrences:', (html.match(/game-live-item/g) || []).length);
console.log('huya-footer present      :', /huya-footer/.test(html));

// Script/link hosts, to understand what third parties load.
const hosts = new Set();
for (const m of html.matchAll(/(?:src|href)=["'](https?:\/\/[^"']+)["']/g)) {
  try { hosts.add(new URL(m[1]).host); } catch {}
}
console.log('\nthird-party hosts:');
console.log([...hosts].join('\n'));

// Any obvious inline template leftovers on the server-rendered page?
const leaks = html.match(/\{\{[^{}]{1,60}\}\}|\$\{[^{}]{1,60}\}/g);
console.log('\nserver-rendered template leaks:', leaks ? leaks.slice(0, 10) : 'none');
