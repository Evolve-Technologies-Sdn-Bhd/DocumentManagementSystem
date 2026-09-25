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

// Also kill any stray node processes from prior attempts (PID 10288 dll)
try {
  const list = execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH').toString();
  const rows = list.trim().split('\n').filter(r => r.trim());
  for (const row of rows) {
    const m = row.match(/^"node.exe","(\d+)"/);
    if (m) {
      const pid = Number(m[1]);
      // Exclude current node (process.pid) + vite pid 6880
      if (pid !== process.pid && pid !== 6880 && pid !== 9184) {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'pipe' }); } catch (e) {}
      }
    }
  }
} catch (e) {}

Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);

// Start backend correctly: entry point src/index.js (has app.listen line 70)
console.log('Starting backend: node src/index.js (entry point with app.listen)');
const out = fs.openSync(__dirname + '/be_server_stdout.log', 'w');
const err = fs.openSync(__dirname + '/be_server_stderr.log', 'w');
const child = spawn('node', ['src/index.js'], {
  cwd: __dirname,
  stdio: ['ignore', out, err],
  windowsHide: true
});
let settled = false;

child.on('exit', (c) => {
  settled = true;
  fs.appendFileSync(__dirname + '/be_server_stdout.log', '\nPROCESS EXIT CODE: ' + c + '\n');
});

// Poll HTTP up to 15 times (15s)
let poll = 0;
const max = 15;
setInterval(() => {
  poll++;
  const req = http.get('http://localhost:4001/api/public/branding', (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      const msg = 'SUCCESS: HTTP ' + res.statusCode + ' len=' + d.length + ' after ' + (poll*1000) + 'ms PID=' + child.pid;
      console.log(msg);
      fs.writeFileSync(__dirname + '/be_server_result.txt', msg);
      child.unref();
      process.exit(0);
    });
  });
  req.on('error', () => { /* not up yet */ });
  req.setTimeout(900, () => { try { req.destroy(); } catch(e){} });
  if (poll >= max) {
    const msg = 'TIMEOUT polling ' + max + 's; backend alive=' + !settled + ' PID=' + child.pid;
    console.log(msg);
    fs.writeFileSync(__dirname + '/be_server_result.txt', msg);
    if (!settled) child.unref();
    process.exit(2);
  }
}, 1000);
