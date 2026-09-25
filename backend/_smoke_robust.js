const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const STATUS_FILE = path.join(BACKEND_DIR, '_smoke_cal.json');
const FE_OUT = path.join(BACKEND_DIR, '_smoke_frontend.out');
const FE_ERR = path.join(BACKEND_DIR, '_smoke_frontend.err');

const status = {
  mysql: { up: false, note: '' },
  backend: { up: false, pid: null, note: '' },
  frontend: { up: false, pid: null, note: '' },
  calendarSmoke: {
    pass: false, httpStatus: null, bodySnippet: '', errors: [], note: ''
  },
  finalizedAt: null
};

function log(msg) {
  const t = new Date().toISOString().substr(11, 12);
  console.log('[' + t + '] ' + msg);
}
function saveStatus() {
  status.finalizedAt = new Date().toISOString();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), { encoding: 'utf8' });
  log('Saved ' + STATUS_FILE);
}

function httpReq(options, postData, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  return new Promise(function (resolve) {
    const req = http.request(options, function (res) {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { data += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: data }); });
    });
    req.on('error', function (e) { resolve({ status: 0, body: '', error: e.message }); });
    req.on('timeout', function () { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
    req.setTimeout(timeoutMs);
    if (postData) req.write(postData);
    req.end();
  });
}

function checkPort(host, port, timeoutMs) {
  return new Promise(function (resolve) {
    const net = require('net');
    const sock = new net.Socket();
    let done = false;
    sock.setTimeout(timeoutMs || 1000);
    sock.on('connect', function () { done = true; sock.destroy(); resolve(true); });
    sock.on('timeout', function () { if (!done) { done = true; sock.destroy(); resolve(false); } });
    sock.on('error', function () { if (!done) { done = true; resolve(false); } });
    sock.on('close', function () { if (!done) { done = true; resolve(false); } });
    sock.connect(port, host);
  });
}

async function poll(fn, maxMs, intervalMs, label) {
  intervalMs = intervalMs || 700;
  const start = Date.now();
  let last = false;
  while (Date.now() - start < maxMs) {
    last = await fn();
    if (last) return true;
    await new Promise(function (r) { setTimeout(r, intervalMs); });
  }
  return last;
}

function procAlive(pid) {
  return new Promise(function (resolve) {
    if (!pid) return resolve(false);
    exec('powershell -NoProfile -Command "$p=Get-Process -Id ' + pid + ' -ErrorAction SilentlyContinue; if($p){Write-Output OK}else{Write-Output NO}"',
      function (err, stdout) {
        resolve(!err && String(stdout).trim() === 'OK');
      });
  });
}

function startFrontendDetached() {
  return new Promise(function (resolve) {
    try {
      if (fs.existsSync(FE_OUT)) { try { fs.unlinkSync(FE_OUT); } catch (_) {} }
      if (fs.existsSync(FE_ERR)) { try { fs.unlinkSync(FE_ERR); } catch (_) {} }
      const out = fs.openSync(FE_OUT, 'a');
      const err = fs.openSync(FE_ERR, 'a');
      const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
        cwd: FRONTEND_DIR,
        detached: true,
        stdio: ['ignore', out, err],
        env: Object.assign({}, process.env, { HOST: '127.0.0.1', PORT: '5173' }),
        windowsHide: true,
        shell: true
      });
      child.unref();
      log('Frontend spawned PID=' + child.pid);
      resolve(child.pid);
    } catch (e) {
      log('Frontend spawn error: ' + e.message);
      resolve(null);
    }
  });
}

async function findBackendPid() {
  return new Promise(function (resolve) {
    exec('powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -notmatch \'nvm|npm\' } | Select-Object -ExpandProperty Id"',
      function (err, stdout) {
        if (err) return resolve(null);
        const ids = String(stdout).trim().split(/\s+/).filter(Boolean).map(function (x) { return parseInt(x, 10); }).filter(Boolean);
        if (ids.length === 0) return resolve(null);
        resolve(ids[ids.length - 1]);
      });
  });
}

async function doSmokeTest() {
  const res = { pass: false, httpStatus: null, bodySnippet: '', errors: [], note: '' };
  try {
    const payload = JSON.stringify({ email: 'admin@company.com', password: 'Admin@123' });
    log('POST /api/auth/login');
    const login = await httpReq({
      hostname: '127.0.0.1', port: 4001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, payload, 12000);
    log('Login HTTP ' + login.status);
    if (login.status < 200 || login.status >= 400) {
      res.errors.push('Login HTTP ' + login.status);
      res.note = 'Login bad: ' + (login.body || '').slice(0, 300);
      return res;
    }
    let token = null;
    try {
      const p = JSON.parse(login.body);
      token = p.token || p.jwt || p.accessToken || (p.data && (p.data.token || p.data.jwt));
    } catch (_) { }
    if (!token) {
      const m = login.body.match(/"token"\s*:\s*"([^"]+)"/);
      if (m) token = m[1];
    }
    if (!token) { res.errors.push('No JWT'); res.note = (login.body || '').slice(0, 400); return res; }
    log('JWT length=' + token.length);

    const cal = await httpReq({
      hostname: '127.0.0.1', port: 4001,
      path: '/api/calendar?from=2026-09-01&to=2026-09-30', method: 'GET',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
    }, null, 18000);
    res.httpStatus = cal.status;
    res.bodySnippet = (cal.body || '').slice(0, 600);
    console.log('\n--- Calendar Snippet 600 chars ---');
    console.log(res.bodySnippet);
    console.log('----------------------------------\n');

    let ok = true;
    if (cal.status < 200 || cal.status >= 400) { res.errors.push('HTTP ' + cal.status); ok = false; }
    if ((cal.body || '').indexOf('not: DateTime') >= 0) { res.errors.push('Contains "not: DateTime"'); ok = false; }
    if ((cal.body || '').indexOf('Invalid prisma.documentShareLink') >= 0) { res.errors.push('Contains "Invalid prisma.documentShareLink"'); ok = false; }
    res.pass = ok;
    res.note = res.errors.length ? res.errors.join('; ') : 'OK - no forbidden patterns';
    return res;
  } catch (e) {
    res.errors.push('Exception: ' + e.message);
    res.note = e.message;
    return res;
  }
}

async function main() {
  log('======== Smoke Final (robust) ========');
  saveStatus();

  // 1. MySQL
  log('--- [1/5] MySQL check :3306 ---');
  status.mysql.up = await checkPort('127.0.0.1', 3306, 1500);
  status.mysql.note = status.mysql.up ? 'Port 3306 LISTENING' : 'Port 3306 NOT reachable';
  log('MYSQL UP? ' + status.mysql.up);
  saveStatus();

  // 2. Backend
  log('--- [2/5] Backend check :4001 ---');
  const bePid = await findBackendPid();
  status.backend.pid = bePid;
  const beAlive = bePid ? await procAlive(bePid) : false;
  let beBranding = false;
  try {
    const r = await httpReq({ hostname: '127.0.0.1', port: 4001, path: '/api/public/branding', method: 'GET' }, null, 3000);
    beBranding = r.status > 0 && r.status < 500;
  } catch (_) { }
  status.backend.up = beAlive && beBranding;
  status.backend.note = 'PID ' + (bePid || 'n/a') + ' alive=' + beAlive + ', branding<500=' + beBranding;
  log('BACKEND PID=' + bePid + ' alive=' + beAlive + ' branding=' + beBranding + ' -> up=' + status.backend.up);
  saveStatus();

  // 3. Frontend
  log('--- [3/5] Frontend Vite :5173 ---');
  let feUp = false;
  try {
    const r = await httpReq({ hostname: '127.0.0.1', port: 5173, path: '/', method: 'GET' }, null, 2500);
    feUp = r.status > 0 && r.status < 500;
  } catch (_) { }
  if (feUp) {
    status.frontend.up = true;
    status.frontend.note = 'Already up on :5173';
    log('Frontend already UP');
  } else {
    log('Frontend not up. Launching detached...');
    const fePid = await startFrontendDetached();
    status.frontend.pid = fePid;
    log('Polling GET / up to 50s...');
    feUp = await poll(async function () {
      try {
        const r = await httpReq({ hostname: '127.0.0.1', port: 5173, path: '/', method: 'GET' }, null, 3000);
        return r.status > 0 && r.status < 500;
      } catch (_) { return false; }
    }, 50000, 1200, 'vite');
    const feAliveNow = fePid ? await procAlive(fePid) : false;
    status.frontend.up = feUp;
    status.frontend.note = 'PID ' + (fePid || 'n/a') + ' alive=' + feAliveNow + ', /<500=' + feUp;
    log('Frontend up=' + feUp + ' (PID alive=' + feAliveNow + ')');
  }
  saveStatus();

  // 4. Smoke
  log('--- [4/5] Smoke Login + Calendar ---');
  if (!status.backend.up) {
    log('SKIP smoke - backend not UP');
    status.calendarSmoke.pass = false;
    status.calendarSmoke.note = 'Skipped: backend not UP';
  } else {
    const sm = await doSmokeTest();
    status.calendarSmoke = sm;
    log('Smoke PASS=' + sm.pass + ' HTTP=' + sm.httpStatus);
  }
  saveStatus();

  // 5. Report
  log('================================================');
  log('#              FINAL STATUS REPORT             #');
  log('================================================');
  log('MYSQL UP?         ' + (status.mysql.up ? 'YES' : 'NO ') + '    - ' + status.mysql.note);
  log('BACKEND UP?       ' + (status.backend.up ? 'YES' : 'NO ') + '    - ' + status.backend.note);
  log('FRONTEND UP?      ' + (status.frontend.up ? 'YES' : 'NO ') + '    - ' + status.frontend.note);
  log('CALENDAR SMOKE?   ' + (status.calendarSmoke.pass ? 'PASS' : 'FAIL') + '  - HTTP=' + status.calendarSmoke.httpStatus + ' - ' + status.calendarSmoke.note);
  if (!status.calendarSmoke.pass && status.calendarSmoke.bodySnippet) {
    log('\n--- FAIL snippet ---');
    log(status.calendarSmoke.bodySnippet);
    log('--------------------');
  }
  log('================================================');
  log('Output JSON: ' + STATUS_FILE);
  saveStatus();
  process.exit(0);
}

main().catch(function (e) { console.error('Fatal', e.stack); process.exit(1); });
