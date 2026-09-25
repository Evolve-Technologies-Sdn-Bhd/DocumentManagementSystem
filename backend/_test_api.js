const http = require('http');
const endpoints = [
  { port: 4001, path: '/api/public/branding-file/settings/login' },
  { port: 4001, path: '/api/public/branding-file/settings/site' },
  { port: 4001, path: '/health' },
  { port: 5173, path: '/' }
];
endpoints.forEach(ep => {
  const req = http.get({ hostname: '127.0.0.1', port: ep.port, path: ep.path, timeout: 8000 }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log(`[${ep.port}${ep.path}] Status: ${res.statusCode} | BodyLen: ${data.length}`);
    });
  });
  req.on('error', e => console.error(`[${ep.port}${ep.path}] ERROR: ${e.message}`));
  req.on('timeout', () => { req.destroy(); console.error(`[${ep.port}${ep.path}] TIMEOUT`); });
});
