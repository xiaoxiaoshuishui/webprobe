// Compact per-kind breakdown of a run report (used to write the README).
import { readFileSync } from 'node:fs';

const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const t = {};
for (const f of r.findings) {
  t[f.kindLabel] = t[f.kindLabel] || { n: 0, sev: new Set(), ex: null, party: new Set() };
  const e = t[f.kindLabel];
  e.n++;
  e.sev.add(f.severity);
  e.party.add(f.party);
  if (!e.ex) e.ex = f.title;
}
for (const [k, v] of Object.entries(t)) {
  console.log(`${k}  x${v.n}  [${[...v.sev].join('/')}]  [${[...v.party].join('/')}]  ${v.ex.slice(0, 66)}`);
}
console.log(`\nfirst-party ${r.stats.firstPartyFindings}  third-party ${r.stats.thirdPartyFindings}`);
console.log(`visited ${r.coverage.visited.length}  skipped ${r.coverage.skipped.length}`);
console.log(`skip reasons ${JSON.stringify(r.coverage.skipped.reduce((a, s) => { a[s.reason] = (a[s.reason] || 0) + 1; return a; }, {}))}`);
console.log(`assertions ${r.coverage.assertions.map((a) => `${a.id}:${a.ok ? 'ok' : 'FAIL'}`).join(', ')}`);
console.log(`visited urls:\n  ${r.coverage.visited.join('\n  ')}`);
