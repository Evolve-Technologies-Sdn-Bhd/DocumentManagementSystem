const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const STATUS_FILE = path.join(BACKEND_DIR, '_smoke_cal.json');

function log(msg) {
  const t = new Date().toISOString().substr(11, 12);
  console.log(`[${t}] ${msg}`);
}

function httpReq(options, postData = null, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
    req.setTimeout(timeoutMs);
    if (postData) req.write(postData);
    req.end();
  });
}

function checkPort(host, port, timeoutMs = 800) {
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

async function poll(fn, maxMs, intervalMs = 600, label = 'poll') {
  const start = Date.now();
  let last = false;
  while (Date.now() - start < maxMs) {
    last = await fn();
    if (last) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

function procAlive(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve(false);
    exec(`powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"`, (err, stdout) => {
      resolve(!err && String(stdout).trim() === String(pid));
    });
  });
}

async function smokeTestLoginCalendar() {
  const result = {
    pass: false,
    httpStatus: null,
    bodySnippet: '',
    errors: [],
    note: ''
  };
  try {
    const loginPayload = JSON.stringify({ email: 'admin@company.com', password: 'Admin@123' });
    log('POST /api/auth/login ...');
    const loginRes = await httpReq({
      hostname: '127.0.0.1', port: 4001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginPayload) }
    }, loginPayload, 12000);

    log(`Login HTTP: ${loginRes.status}`);
    if (loginRes.status < 200 || loginRes.status >= 400) {
      result.errors.push(`Login HTTP ${loginRes.status}`);
      result.note = `Login failed: ${loginRes.body.slice(0, 300)}`;
      return result;
    }

    let token = null;
    try {
      const p = JSON.parse(loginRes.body);
      token = p.token || p.jwt || p.accessToken || (p.data && (p.data.token || p.data.jwt));
    } catch (_) { }
    if (!token) {
      const m = loginRes.body.match(/"token"\s*:\s*"([^"]+)"/);
      if (m) token = m[1];
    }
    if (!token) {
      result.errors.push('No JWT extracted');
      result.note = `No token in login body: ${loginRes.body.slice(0, 400)}`;
      return result;
    }
    log(`Got JWT length=${token.length}`);

    const calPath = '/api/calendar?from=2026-09-01&to=2026-09-30';
    log(`GET ${calPath} ...`);
    const cal = await httpReq({
      hostname: '127.0.0.1', port: 4001, path: calPath, method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    }, null, 18000);

    result.httpStatus = cal.status;
    result.bodySnippet = (cal.body || '').slice(0, 600);

    console.log('\n--- Calendar Body Snippet 600 chars ---');
    console.log(result.bodySnippet);
    console.log('---------------------------------------\n');

    let ok = true;
    if (cal.status < 200 || cal.status >= 400) {
      result.errors.push(`HTTP ${cal.status} not 2xx/3xx`);
      ok = false;
    }
    if ((cal.body || '').includes('not: DateTime')) {
      result.errors.push('Contains "not: DateTime"');
      ok = false;
    }
    if ((cal.body || '').includes('Invalid prisma.documentShareLink')) {
      result.errors.push('Contains "Invalid prisma.documentShareLink"');
      ok = false;
    }
    result.pass = ok;
    result.note = result.errors.length === 0 ? 'OK: no forbidden patterns' : result.errors.join('; ');
    return result;
  } catch (e) {
    result.errors.push(`Exception: ${e.message}`);
    result.note = e.message;
    return result;
  }
}

async function main() {
  log('=== Final Smoke + Frontend Poll ===');

  const interim = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  const bePid = interim.backend && interim.backend.pid;
  const fePid = interim.frontend && interim.frontend.pid;

  // 1. MySQL check
  log('--- Checking MySQL ---');
  const mysqlUp = await checkPort('127.0.0.1', 3306, 1500);
  log(`MySQL UP? ${mysqlUp} (port 3306)`);
  interim.mysql.up = mysqlUp;
  interim.mysql.note = mysqlUp ? 'Port 3306 LISTENING' : 'Port 3306 NOT reachable';

  // 2. Backend check alive + branding
  log('--- Checking Backend ---');
  const beAlive = bePid ? await procAlive(bePid) : false;
  let beBrandingOk = false;
  try {
    const r = await httpReq({ hostname: '127.0.0.1', port: 4001, path: '/api/public/branding', method: 'GET' }, null, 3000);
    beBrandingOk = r.status > 0 && r.status < 500;
  } catch (_) {}
  interim.backend.up = beAlive && beBrandingOk;
  interim.backend.note = `PID ${bePid} alive=${beAlive}, branding<500=${beBrandingOk}`;
  log(`Backend PID ${bePid}: alive=${beAlive}, branding=${beBrandingOk} → up=${interim.backend.up}`);

  // 3. Frontend poll up to 45s
  log('--- Polling Frontend Vite (max 45s) ---');
  let feUp = interim.frontend && interim.frontend.up === true;
  if (!feUp) {
    feUp = await poll(async () => {
      try {
        const r = await httpReq({ hostname: '127.0.0.1', port: 5173, path: '/', method: 'GET' }, null, 3000);
        return r.status > 0 && r.status < 500;
      } catch (_) { return false; }
    }, 45000, 1200, 'vite');
  }
  interim.frontend.up = feUp;
  const feAlive = fePid ? await procAlive(fePid) : false;
  interim.frontend.note = `PID ${fePid || 'n/a'} alive=${feAlive}, GET/<500=${feUp}`;
  log(`Frontend PID ${fePid || 'n/a'}: alive=${feAlive}, rootOK=${feUp} → up=${feUp}`);

  // 4. Smoke test login + calendar
  log('--- Running Login + Calendar smoke ---');
  const smoke = await smokeTestLoginCalendar();
  interim.calendarSmoke = smoke;
  log(`Calendar smoke PASS? ${smoke.pass} HTTP=${smoke.httpStatus}`);

  // 5. Write final status
  interim.finalizedAt = new Date().toISOString();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(interim, null, 2), 'utf8');
  log(`Final status written to ${STATUS_FILE}`);

  // 6. Report
  log('\n################################################');
  log('#              FINAL STATUS REPORT             #');
  log('################################################');
  log(`MYSQL UP?         ${interim.mysql.up ? '✅ YES' : '❌ NO'}    - ${interim.mysql.note}`);
  log(`BACKEND UP?       ${interim.backend.up ? '✅ YES' : '❌ NO'}    - ${interim.backend.note}`);
  log(`FRONTEND UP?      ${interim.frontend.up ? '✅ YES' : '❌ NO'}    - ${interim.frontend.note}`);
  log(`CALENDAR SMOKE?   ${interim.calendarSmoke.pass ? '✅ PASS' : '❌ FAIL'}  - HTTP=${interim.calendarSmoke.httpStatus} - ${interim.calendarSmoke.note}`);
  if (!interim.calendarSmoke.pass && interim.calendarSmoke.bodySnippet) {
    log('\n--- FAIL snippet (600 chars) ---');
    log(interim.calendarSmoke.bodySnippet);
    log('--------------------------------');
  }
  log('################################################');
  log(`Result file: ${STATUS_FILE}`);
}

main().catch((e) => {
  console.error('Fatal', e.stack);
  process.exit(1);
});
