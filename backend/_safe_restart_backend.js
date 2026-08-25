const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 4001;
const BACKEND_DIR = __dirname;
const LOG_FILE = path.join(BACKEND_DIR, '_backend_stdout.log');

console.log('\n[Safe Restart Backend Port ' + PORT + ']');
console.log('Backend dir:', BACKEND_DIR);

// 1) Find PID listening on :4001 (TCP LISTENING) on Windows via netstat -ano
let pid = null;
try {
  const out = execSync('netstat -ano').toString('utf8');
  const lines = out.split(/\r?\n/);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const proto = parts[0];
    const local = parts[1];
    const state = parts[3] || '';
    const pidStr = parts[parts.length - 1];
    // TCP protocol, local ends with :<PORT>, state=LISTENING
    if (/^TCP$/i.test(proto) && local.endsWith(':' + PORT) && /LISTENING/i.test(state)) {
      if (/^\d+$/.test(pidStr)) { pid = Number(pidStr); break; }
    }
  }
} catch (e) {
  console.log('  netstat error (no old process?):', e.message);
}

if (pid) {
  console.log('  Found old backend PID=' + pid + ' listening on :' + PORT + '. Killing it...');
  try {
    execSync('taskkill /F /PID ' + pid + ' /T');
    console.log('  Kill OK');
  } catch (e) {
    console.log('  taskkill warning:', e.message);
  }
  console.log('  Waiting 3s for port release...');
  const t0 = Date.now(); while(Date.now()-t0 < 3000){}
} else {
  console.log('  No old process found on :' + PORT + ' — no kill needed.');
}

// 2) Ensure _tmp dir exists for uploads/docx-pdf-v2
const tmp = path.join(BACKEND_DIR, 'uploads', '_tmp', 'docx-pdf-v2');
try{ if(!fs.existsSync(tmp)) fs.mkdirSync(tmp, {recursive:true}); }catch(e){}

// 3) Truncate log
try { fs.writeFileSync(LOG_FILE, '==== RESTART ' + new Date().toISOString() + ' ====\n'); } catch(e){}

// 4) Spawn detached backend node
console.log('  Spawning detached node process (stdout/stderr -> _backend_stdout.log)...');
const logFd = fs.openSync(LOG_FILE, 'a');
const child = spawn('node', ['src/index.js'], {
  cwd: BACKEND_DIR,
  stdio: ['ignore', logFd, logFd, 'ipc'],
  detached: true,
  env: Object.assign({}, process.env, {
    PORT: String(PORT),
    FORCE_COLOR: '0'
  })
});
child.unref();
fs.closeSync(logFd);
console.log('  SPAWNED child PID=' + child.pid);
console.log('  Waiting 8s for backend boot + DB connect...');
const t0 = Date.now(); while(Date.now()-t0 < 8000){}

// 5) Probe HTTP health
try {
  const http = require('http');
  http.get({hostname:'localhost', port:PORT, path:'/api/notifications', timeout:5000}, res => {
    console.log('\n  ✅ HEALTH PROBE OK: HTTP ' + res.statusCode + ' (expected 401 for auth endpoint = alive)');
    console.log('  Backend restarted successfully. NEW CODE active!');
    process.exit(res.statusCode === 401 || res.statusCode === 200 ? 0 : 1);
  }).on('error', e => {
    console.log('  ❌ Health probe FAIL:', e.message, '(see _backend_stdout.log for boot log)');
    // Print last 30 lines of log
    try {
      const log = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).slice(-30).join('\n');
      console.log('\n--- Last 30 lines of _backend_stdout.log ---\n' + log);
    } catch(_){}
    process.exit(1);
  }).on('timeout', () => { console.log('  ❌ Health probe TIMEOUT'); process.exit(1); });
} catch(e) {
  console.log('  Health probe error:', e.message);
  process.exit(1);
}
