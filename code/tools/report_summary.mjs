// Summarise a WebProbe run report: what was found, and how noisy is it?
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const r = JSON.parse(readFileSync(file, 'utf8'));

console.log(`run   ${r.runId}`);
console.log(`target ${r.target.name} (${r.target.url})`);
console.log(`dur   ${Math.round(r.durationMs / 1000)}s  pages=${r.stats.pagesVisited} actions=${r.stats.actionsExecuted} req=${r.stats.requests} findings=${r.findings.length}`);
console.log('byKind', JSON.stringify(r.stats.byKind));
console.log('bySeverity', JSON.stringify(r.stats.bySeverity));
console.log('popups', JSON.stringify(r.popups));
console.log('video', r.video, r.videoNote || '');

console.log('\n--- findings (grouped) ---');
for (const f of r.findings) {
  console.log(`\n[${f.id}] ${f.severity.toUpperCase()} ${f.kind} x${f.occurrences}`);
  console.log(`  title: ${f.title}`);
  console.log(`  url  : ${f.url}`);
  if (f.context?.resourceUrl) console.log(`  res  : ${f.context.resourceUrl}`);
  if (f.context?.errorText) console.log(`  err  : ${f.context.errorText}`);
  console.log(`  msg  : ${String(f.message).replace(/\s+/g, ' ').slice(0, 200)}`);
}

console.log('\n--- coverage ---');
console.log('visited   ', r.coverage.visited.join('\n            '));
console.log('discovered', (r.coverage.discovered || []).slice(0, 25).join('\n            '));
console.log('skipped reasons', JSON.stringify(
  (r.coverage.skipped || []).reduce((a, s) => { a[s.reason] = (a[s.reason] || 0) + 1; return a; }, {}),
));
console.log('assertions:', (r.coverage.assertions || []).map((a) => `${a.id}@${a.url}=${a.ok ? 'ok' : 'FAIL'}`).join('\n            '));
