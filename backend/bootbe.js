const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const log = fs.openSync(__dirname + '/be_boot.log', 'w');
const child = spawn('node', ['src/app.js'], {
  cwd: __dirname,
  stdio: ['ignore', log, log],
  windowsHide: true
});
let alive = true;
child.on('exit', (c) => { alive = false; console.log('exit', c); });
const ts = Date.now();
function poll(tries) {
  if (!alive) { console.log('child died'); return; }
  const req = http.get('http://localhost:4001/api/public/branding', (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      console.log('READY', res.statusCode, 'len', d.length, 'ms', Date.now() - ts);
      fs.writeFileSync(__dirname + '/be_up.txt', String(process.pid) + '\n' + String(child.pid));
      child.unref();
      process.exit(0);
    });
  });
  req.on('error', () => { /* not up yet */ });
  req.setTimeout(1500, () => { try { req.destroy(); } catch (e) {} });
  if (tries <= 0) { console.log('timeout'); return; }
  setTimeout(() => poll(tries - 1), 1200);
}
poll(14);
