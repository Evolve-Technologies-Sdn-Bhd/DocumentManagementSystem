const http = require('http');
const endpoints = [
  { port: 4001, path: '/api/public/login-page-settings', desc: 'direct backend' },
  { port: 5173, path: '/api/public/login-page-settings', desc: 'via vite proxy' },
  { port: 4001, path: '/api/public/branding', desc: 'branding direct' },
  { port: 5173, path: '/api/public/branding', desc: 'branding via proxy' }
];
function runTest(ep) {
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port: ep.port, path: ep.path, timeout: 6000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const preview = data.length > 300 ? (data.substring(0, 300) + '...') : data;
        console.log(`[${ep.desc}] ${ep.path}: Status=${res.statusCode} | Body=${data.length}b`);
        if (res.statusCode !== 200) console.log(`  Body preview: ${preview}`);
        resolve();
      });
    });
    req.on('error', e => { console.error(`[${ep.desc}] ${ep.path}: ERROR - ${e.message}`); resolve(); });
    req.on('timeout', () => { req.destroy(); console.error(`[${ep.desc}] ${ep.path}: TIMEOUT`); resolve(); });
  });
}
(async () => { for (const ep of endpoints) await runTest(ep); })();
