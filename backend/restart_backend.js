const { execSync, spawn } = require('child_process');
const fs = require('fs');

// Kill any process on port 4001
try {
  const netstat = execSync('netstat -ano').toString();
  const lines = netstat.split('\n').filter(l => l.includes(':4001') && l.includes('LISTENING'));
  const pids = new Set();
  for (const l of lines) {
    const m = l.match(/(\d+)\s*$/);
    if (m) pids.add(Number(m[1]));
  }
  console.log('Found backend PIDs:', [...pids]);
  for (const pid of pids) {
    try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'inherit' }); } catch (e) {}
  }
} catch (e) {
  console.log('Kill step warn:', e.message.slice(0,100));
}

// Wait
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);

// Start backend in detached mode
console.log('Starting backend server on port 4001...');
const log = fs.openSync(__dirname + '/backend_restart.log', 'w');
const child = spawn('node', ['src/app.js'], {
  cwd: __dirname,
  stdio: ['ignore', log, log],
  detached: true,
  windowsHide: true
});
child.unref();
console.log('Backend spawn PID:', child.pid);
fs.writeFileSync(__dirname + '/backend_new.pid', String(child.pid));

// Wait then test
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3500);
const http = require('http');
const req = http.get('http://localhost:4001/api/public/branding', (res) => {
  console.log('Smoke HTTP', res.statusCode);
  process.exit(0);
});
req.on('error', (e) => { console.log('Smoke err:', e.message); process.exit(1); });
req.setTimeout(4000, () => { console.log('Smoke timeout'); process.exit(2); });
