const { execSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

// Kill any process on port 4001 first
try {
  const netstat = execSync('netstat -ano').toString();
  const lines = netstat.split('\n').filter(l => l.includes(':4001') && l.includes('LISTENING'));
  const pids = new Set();
  for (const l of lines) {
    const m = l.match(/(\d+)\s*$/);
    if (m) pids.add(Number(m[1]));
  }
  for (const pid of pids) {
    try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' }); } catch (e) {}
  }
} catch (e) {}

// Wait
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);

// Start backend
console.log('Starting backend...');
const out = fs.openSync(__dirname + '/backend_run.log', 'w');
const child = spawn('node', ['src/app.js'], {
  cwd: __dirname,
  stdio: ['ignore', out, out],
  windowsHide: true
});
let settled = false;
let finalStatus = { http: null, code: null };

function done() {
  if (settled) return;
  settled = true;
  try {
    child.kill('SIGKILL');
  } catch (e) {}
  fs.writeFileSync(__dirname + '/backend_smoke.json', JSON.stringify(finalStatus, null, 2));
  process.exit(0);
}

child.on('error', (e) => { console.log('spawn err', e.message); });
child.on('exit', (code) => {
  finalStatus.code = code;
  console.log('backend exit code', code);
  setTimeout(done, 500);
});

// Poll HTTP every 1s up to 12s
let polls = 0;
const interval = setInterval(() => {
  polls++;
  const req = http.get('http://localhost:4001/api/public/branding', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      finalStatus.http = res.statusCode;
      finalStatus.bodyLen = data.length;
      console.log('HTTP OK', res.statusCode, 'len', data.length);
      clearInterval(interval);
      // Do NOT kill backend — leave running and detach!
      settled = true;
      child.unref();
      fs.writeFileSync(__dirname + '/backend_smoke.json', JSON.stringify(finalStatus, null, 2));
      process.exit(0);
    });
  });
  req.on('error', () => { /* ignore */ });
  req.setTimeout(1500, () => { try { req.destroy(); } catch (e) {} });
  if (polls >= 14) {
    clearInterval(interval);
    setTimeout(done, 200);
  }
}, 900);

setTimeout(() => { if (!settled) done(); }, 18000);
