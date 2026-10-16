// Will the "point github.com at a reachable IP" workaround actually work?
// TCP reachability is not enough: TLS SNI to github.com could still be reset.
// This opens a real TLS connection to each candidate IP with SNI=github.com and
// reports the HTTP status, which is what git would see.
import https from 'node:https';

const CANDIDATES = [
  '20.205.243.166', // what DNS currently returns (known blocked)
  '140.82.112.3',
  '140.82.113.3',
  '140.82.114.3',
  '140.82.116.3',
  '140.82.121.3',
];

const tryIp = (ip) => new Promise((resolve) => {
  const req = https.request({
    host: ip,
    port: 443,
    method: 'GET',
    path: '/',
    servername: 'github.com',      // SNI: pretend we are talking to github.com
    headers: { Host: 'github.com', 'User-Agent': 'webprobe-diagnostic' },
    timeout: 15000,
    rejectUnauthorized: true,      // demand a valid cert for github.com
  }, (res) => {
    res.resume();
    resolve({ ip, ok: true, status: res.statusCode, tls: '证书校验通过' });
  });
  req.on('timeout', () => { req.destroy(); resolve({ ip, ok: false, error: 'timeout' }); });
  req.on('error', (e) => resolve({ ip, ok: false, error: `${e.code || ''} ${e.message}`.trim() }));
  req.end();
});

console.log('目标：https://github.com/  (SNI = github.com，校验证书)\n');
for (const ip of CANDIDATES) {
  const r = await tryIp(ip);
  if (r.ok) {
    console.log(`  ✔ ${ip.padEnd(16)} HTTP ${r.status}  ${r.tls}   <-- 可用`);
  } else {
    console.log(`  ✘ ${ip.padEnd(16)} ${r.error}`);
  }
}
