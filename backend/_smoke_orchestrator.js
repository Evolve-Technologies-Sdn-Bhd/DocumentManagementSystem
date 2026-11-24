const http = require('http');
const https = require('https');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const STATUS_FILE = path.join(BACKEND_DIR, '_smoke_cal.json');
const BACKEND_LOG_OUT = path.join(BACKEND_DIR, '_smoke_backend.out');
const BACKEND_LOG_ERR = path.join(BACKEND_DIR, '_smoke_backend.err');
const FRONTEND_LOG_OUT = path.join(BACKEND_DIR, '_smoke_frontend.out');
const FRONTEND_LOG_ERR = path.join(BACKEND_DIR, '_smoke_frontend.err');

const status = {
  mysql: { up: false, note: '' },
  backend: { up: false, pid: null, note: '' },
  frontend: { up: false, pid: null, note: '' },
  calendarSmoke: {
    pass: false,
    httpStatus: null,
    bodySnippet: '',
    errors: [],
    note: ''
  },
  updatedAt: null
};

function log(msg) {
  const t = new Date().toISOString().substr(11, 12);
  console.log(`[${t}] ${msg}`);
}

function writeStatus() {
  status.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8');
  log(`Status written to ${STATUS_FILE}`);
}

function httpRequest(options, postData = null, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const lib = options.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
    req.setTimeout(timeoutMs);
    if (postData) req.write(postData);
    req.end();
  });
}

async function checkPort(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const net = require('net');
    const sock = new net.Socket();
    let done = false;
    sock.setTimeout(timeoutMs);
    sock.on('connect', () => { done = true; sock.destroy(); resolve(true); });
    sock.on('timeout', () => { if (!done) { done = true; sock.destroy(); resolve(false); } });
    sock.on('error', () => { if (!done) { done = true; resolve(false); } });
    sock.on('close', () => { if (!done) { done = true; resolve(false); } });
    sock.connect(port, host);
  });
}

async function pollCondition(conditionFn, maxMs, intervalMs = 500, label = 'poll') {
  const start = Date.now();
  let lastResult = false;
  while (Date.now() - start < maxMs) {
    lastResult = await conditionFn();
    if (lastResult) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return lastResult;
}

function killProcessesByPort(port) {
  return new Promise((resolve) => {
    if (os.platform() !== 'win32') {
      exec(`fuser -k ${port}/tcp 2>/dev/null || true`, (err, stdout, stderr) => {
        log(`killPort ${port}: ${stdout.trim() || stderr.trim() || 'ok'}`);
        resolve();
      });
      return;
    }
    const psFile = path.join(BACKEND_DIR, `_kill_port_${port}.ps1`);
    fs.writeFileSync(psFile, `
$pids = netstat -ano | Select-String ':${port}' | ForEach-Object {
  if ($_ -match 'LISTENING\\s+(\\d+)') { $matches[1] }
} | Select-Object -Unique
if ($pids) {
  foreach ($p in $pids) { Write-Output "Killing PID $p"; Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
} else {
  Write-Output 'No LISTENING processes on port ${port}'
}
`, 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, (err, stdout, stderr) => {
      log(`killPort ${port}: ${stdout.trim() || stderr.trim() || 'ok'}`);
      try { fs.unlinkSync(psFile); } catch (_) { /* ignore */ }
      resolve();
    });
  });
}

function spawnDetached(cmd, args, cwd, outFile, errFile, envExt = {}, useShell = false) {
  const out = fs.openSync(outFile, 'a');
  const err = fs.openSync(errFile, 'a');
  const env = Object.assign({}, process.env, envExt);
  const opts = {
    cwd,
    detached: true,
    stdio: ['ignore', out, err],
    env,
    windowsHide: true,
    shell: useShell
  };
  let runCmd = cmd;
  let runArgs = args;
  if (os.platform() === 'win32' && !useShell && (cmd.endsWith('.cmd') || cmd.endsWith('.bat') || cmd === 'npx' || cmd === 'npm')) {
    opts.shell = true;
  }
  const child = spawn(runCmd, runArgs, opts);
  child.unref();
  log(`Spawned ${runCmd} ${runArgs.join(' ')} (pid=${child.pid}, cwd=${cwd}, shell=${opts.shell})`);
  return child.pid;
}

async function main() {
  log('=== Smoke Orchestrator Starting ===');
  writeStatus();

  // ---- 1. MYSQL check ----
  log('--- Checking MySQL port 3306 ---');
  const mysqlUp = await checkPort('127.0.0.1', 3306, 1500);
  status.mysql.up = mysqlUp;
  status.mysql.note = mysqlUp ? 'Port 3306 LISTENING' : 'Port 3306 NOT reachable';
  log(`MySQL UP? ${mysqlUp}`);
  writeStatus();

  // ---- 2. KILL port 4001 listeners ----
  log('--- Killing Node on :4001 ---');
  await killProcessesByPort(4001);
  await new Promise((r) => setTimeout(r, 1500));

  // ---- 3. START backend detached + poll /api/public/branding ----
  log('--- Starting Backend (node src/index.js) detached ---');
  try {
    const bePid = spawnDetached(
      'node',
      ['src/index.js'],
      BACKEND_DIR,
      BACKEND_LOG_OUT,
      BACKEND_LOG_ERR,
      { PORT: '4001', HOST: '127.0.0.1' }
    );
    status.backend.pid = bePid;
    log(`Backend started with PID ${bePid}. Polling branding endpoint up to 30s...`);

    const brandingOk = await pollCondition(async () => {
      const r = await httpRequest({
        hostname: '127.0.0.1', port: 4001, path: '/api/public/branding', method: 'GET'
      }, null, 3000);
      return r.status > 0 && r.status < 500;
    }, 30000, 800, 'branding');

    status.backend.up = brandingOk;
    status.backend.note = brandingOk ? 'Branding endpoint < 500 OK' : 'Branding endpoint timeout or 5xx';
    log(`Backend UP? ${brandingOk}`);
  } catch (e) {
    status.backend.note = `Exception: ${e.message}`;
    log(`Backend start exception: ${e.message}`);
  }
  writeStatus();

  // ---- 5. START frontend Vite :5173 detached, poll / ----
  log('--- Starting Frontend Vite if needed ---');
  const frontendAlreadyUp = await checkPort('127.0.0.1', 5173, 1500);
  if (frontendAlreadyUp) {
    status.frontend.up = true;
    status.frontend.note = 'Already listening on 5173';
    log('Frontend already UP');
  } else {
    log('Frontend not up, starting npx vite detached...');
    try {
      // npx vite
      const fePid = spawnDetached(
        'npx',
        ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
        FRONTEND_DIR,
        FRONTEND_LOG_OUT,
        FRONTEND_LOG_ERR,
        { HOST: '127.0.0.1', PORT: '5173' }
      );
      status.frontend.pid = fePid;
      log(`Frontend started PID ${fePid}. Polling GET / up to 45s...`);

      const feOk = await pollCondition(async () => {
        const r = await httpRequest({
          hostname: '127.0.0.1', port: 5173, path: '/', method: 'GET'
        }, null, 3000);
        return r.status > 0 && r.status < 500;
      }, 45000, 1200, 'vite-root');
      status.frontend.up = feOk;
      status.frontend.note = feOk ? 'Vite / returned < 500' : 'Vite / did not respond in time';
      log(`Frontend UP? ${feOk}`);
    } catch (e) {
      status.frontend.note = `Exception: ${e.message}`;
      log(`Frontend exception: ${e.message}`);
    }
  }
  writeStatus();

  // ---- 4. SMOKE TEST: login + GET calendar ----
  log('--- Calendar Smoke Test ---');
  let smokePass = false;
  let smokeHttpStatus = null;
  let smokeBodySnippet = '';
  const smokeErrors = [];

  try {
    if (!status.backend.up) {
      throw new Error('Backend not UP - skipping calendar smoke');
    }
    // Login
    log('POST /api/auth/login ...');
    const loginPayload = JSON.stringify({ email: 'admin@company.com', password: 'Admin@123' });
    const loginRes = await httpRequest({
      hostname: '127.0.0.1', port: 4001, path: '/api/auth/login', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginPayload)
      }
    }, loginPayload, 10000);

    log(`Login HTTP: ${loginRes.status}`);
    if (loginRes.status !== 200 && loginRes.status !== 201) {
      throw new Error(`Login failed HTTP ${loginRes.status}: ${loginRes.body.slice(0, 300)}`);
    }

    let token = null;
    try {
      const parsed = JSON.parse(loginRes.body);
      token = parsed.token || parsed.jwt || parsed.accessToken || (parsed.data && (parsed.data.token || parsed.data.jwt));
    } catch (_) { /* ignore */ }

    // fallback: search regex
    if (!token) {
      const m = loginRes.body.match(/"token"\s*:\s*"([^"]+)"/);
      if (m) token = m[1];
    }
    if (!token) {
      throw new Error(`Could not extract JWT token. Body: ${loginRes.body.slice(0, 400)}`);
    }
    log(`Got JWT token (length=${token.length})`);

    // GET /api/calendar?from=2026-09-01&to=2026-09-30
    const calPath = '/api/calendar?from=2026-09-01&to=2026-09-30';
    log(`GET ${calPath} ...`);
    const calRes = await httpRequest({
      hostname: '127.0.0.1', port: 4001, path: calPath, method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    }, null, 15000);

    smokeHttpStatus = calRes.status;
    const bodyStr = calRes.body || '';
    smokeBodySnippet = bodyStr.slice(0, 600);

    log(`Calendar HTTP: ${calRes.status}`);
    console.log('--- Body snippet (600 chars) ---');
    console.log(smokeBodySnippet);
    console.log('--- End snippet ---');

    // Validate
    let ok = true;
    if (calRes.status < 200 || calRes.status >= 400) {
      smokeErrors.push(`HTTP status ${calRes.status} not in 2xx/3xx range`);
      ok = false;
    }
    if (bodyStr.includes('not: DateTime')) {
      smokeErrors.push('Body contains forbidden string "not: DateTime"');
      ok = false;
    }
    if (bodyStr.includes('Invalid prisma.documentShareLink')) {
      smokeErrors.push('Body contains forbidden string "Invalid prisma.documentShareLink"');
      ok = false;
    }
    smokePass = ok;
    status.calendarSmoke.note = smokePass ? 'No forbidden patterns, status in OK range' : smokeErrors.join('; ');
  } catch (e) {
    smokeErrors.push(`Exception: ${e.message}`);
    status.calendarSmoke.note = e.message;
    log(`Calendar smoke exception: ${e.message}`);
  }

  status.calendarSmoke.pass = smokePass;
  status.calendarSmoke.httpStatus = smokeHttpStatus;
  status.calendarSmoke.bodySnippet = smokeBodySnippet;
  status.calendarSmoke.errors = smokeErrors;
  writeStatus();

  // ---- Final report ----
  log('========== FINAL STATUS REPORT ==========');
  log(`MYSQL UP?         ${status.mysql.up ? 'YES' : 'NO'}    (${status.mysql.note})`);
  log(`BACKEND UP?       ${status.backend.up ? 'YES' : 'NO'}    (PID ${status.backend.pid || 'n/a'}; ${status.backend.note})`);
  log(`FRONTEND UP?      ${status.frontend.up ? 'YES' : 'NO'}    (PID ${status.frontend.pid || 'n/a'}; ${status.frontend.note})`);
  log(`CALENDAR SMOKE?   ${status.calendarSmoke.pass ? 'PASS' : 'FAIL'}   (HTTP ${status.calendarSmoke.httpStatus}; ${status.calendarSmoke.note})`);
  if (!status.calendarSmoke.pass && status.calendarSmoke.bodySnippet) {
    log('--- FAIL body snippet ---');
    log(status.calendarSmoke.bodySnippet);
    log('-------------------------');
  }
  log('=========================================');
  log(`Result file: ${STATUS_FILE}`);
  process.exit(0);
}

main().catch((e) => {
  log(`Fatal: ${e.stack}`);
  process.exit(1);
});
