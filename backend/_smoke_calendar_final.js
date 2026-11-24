const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.resolve(__dirname);
const STATUS_FILE = path.join(BACKEND_DIR, '_smoke_cal.json');

function log(m) { const t = new Date().toISOString().substr(11,12); console.log('[' + t + '] ' + m); }

function req(opts, postData, to) {
  to = to || 15000;
  return new Promise(function (resv) {
    const r = http.request(opts, function (res) {
      let d = ''; res.setEncoding('utf8');
      res.on('data', function (c) { d += c; });
      res.on('end', function () { resv({ status: res.statusCode, body: d }); });
    });
    r.on('error', function (e) { resv({ status: 0, body: '', error: e.message }); });
    r.on('timeout', function () { r.destroy(); resv({ status: 0, body: '', error: 'timeout' }); });
    r.setTimeout(to);
    if (postData) r.write(postData);
    r.end();
  });
}

function checkPort(h, p, to) {
  return new Promise(function (resv) {
    const net = require('net'); const s = new net.Socket(); let done = false;
    s.setTimeout(to || 1000);
    s.on('connect', function () { done = true; s.destroy(); resv(true); });
    s.on('timeout', function () { if (!done) { done = true; s.destroy(); resv(false); } });
    s.on('error', function () { if (!done) { done = true; resv(false); } });
    s.on('close', function () { if (!done) { done = true; resv(false); } });
    s.connect(p, h);
  });
}

async function main() {
  log('===== Final Calendar Smoke Test =====');

  // 1. Read existing status
  let st;
  try {
    const raw = fs.readFileSync(STATUS_FILE);
    try { st = JSON.parse(raw.toString('utf8')); } catch (_) {
      try { st = JSON.parse(raw.toString('utf16le')); } catch (e) {
        log('Cannot parse status JSON, build fresh');
        st = { mysql: { up: false, note: '' }, backend: { up: false, pid: null, note: '' }, frontend: { up: false, pid: null, note: '' }, calendarSmoke: { pass: false, httpStatus: null, bodySnippet: '', errors: [], note: '' } };
      }
    }
  } catch (_) {
    st = { mysql: { up: false, note: '' }, backend: { up: false, pid: null, note: '' }, frontend: { up: false, pid: null, note: '' }, calendarSmoke: { pass: false, httpStatus: null, bodySnippet: '', errors: [], note: '' } };
  }

  // 2. Re-verify MYSQL, BACKEND, FRONTEND port status
  log('[1/4] MySQL :3306');
  const myUp = await checkPort('127.0.0.1', 3306, 1500);
  st.mysql.up = myUp; st.mysql.note = myUp ? 'Port 3306 LISTENING' : 'Port 3306 NOT reachable';
  log('    MYSQL UP? ' + myUp);

  log('[2/4] Backend :4001');
  let beUp = false;
  try {
    const r = await req({ hostname: '127.0.0.1', port: 4001, path: '/api/public/branding', method: 'GET' }, null, 3000);
    beUp = r.status > 0 && r.status < 500;
  } catch (_) { }
  st.backend.up = beUp; st.backend.note = beUp ? 'Branding < 500 OK' : 'Branding NOT OK';
  log('    BACKEND UP? ' + beUp);

  log('[3/4] Frontend :5173');
  let feUp = false;
  try {
    const r = await req({ hostname: '127.0.0.1', port: 5173, path: '/', method: 'GET' }, null, 3000);
    feUp = r.status > 0 && r.status < 500;
  } catch (_) { }
  st.frontend.up = feUp; st.frontend.note = feUp ? 'GET / < 500 OK' : 'GET / NOT OK';
  log('    FRONTEND UP? ' + feUp);

  // 3. Login + Calendar
  log('[4/4] Login + Calendar');
  const smoke = { pass: false, httpStatus: null, bodySnippet: '', errors: [], note: '' };
  try {
    const pay = JSON.stringify({ email: 'admin@company.com', password: 'Admin@123' });
    log('    POST /api/auth/login');
    const lr = await req({
      hostname: '127.0.0.1', port: 4001, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(pay) }
    }, pay, 12000);
    log('    Login HTTP ' + lr.status);
    if (lr.status < 200 || lr.status >= 400) {
      smoke.errors.push('Login HTTP ' + lr.status);
      smoke.note = 'Login fail: ' + (lr.body || '').slice(0, 300);
    } else {
      let tok = null;
      try {
        const p = JSON.parse(lr.body);
        tok = p.token || p.jwt || p.accessToken || p.authToken ||
              (p.data && (p.data.token || p.data.jwt || p.data.accessToken || p.data.authToken)) ||
              (p.result && (p.result.token || p.result.accessToken)) ||
              (p.user && (p.user.token || p.user.accessToken));
      } catch (_) { }
      if (!tok) {
        const m1 = lr.body.match(/"accessToken"\s*:\s*"([^"]+)"/);
        const m2 = lr.body.match(/"token"\s*:\s*"([^"]+)"/);
        const m3 = lr.body.match(/"jwt"\s*:\s*"([^"]+)"/);
        tok = (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]);
      }
      if (!tok) {
        smoke.errors.push('No JWT extracted');
        smoke.note = (lr.body || '').slice(0, 400);
      } else {
        log('    Got accessToken len=' + tok.length);
        const cp = '/api/calendar?from=2026-09-01&to=2026-09-30';
        log('    GET ' + cp);
        const cr = await req({
          hostname: '127.0.0.1', port: 4001, path: cp, method: 'GET',
          headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' }
        }, null, 20000);
        smoke.httpStatus = cr.status;
        const body = cr.body || '';
        smoke.bodySnippet = body.slice(0, 600);
        console.log('\n===== Calendar HTTP ' + cr.status + ' Snippet 600 chars =====');
        console.log(smoke.bodySnippet);
        console.log('=========================================================\n');
        let ok = true;
        if (cr.status < 200 || cr.status >= 400) { smoke.errors.push('HTTP ' + cr.status + ' not in 2xx/3xx'); ok = false; }
        if (body.indexOf('not: DateTime') >= 0) { smoke.errors.push('Contains "not: DateTime"'); ok = false; }
        if (body.indexOf('Invalid prisma.documentShareLink') >= 0) { smoke.errors.push('Contains "Invalid prisma.documentShareLink"'); ok = false; }
        smoke.pass = ok;
        smoke.note = smoke.errors.length === 0 ? 'OK - no forbidden patterns, HTTP in range' : smoke.errors.join('; ');
      }
    }
  } catch (e) {
    smoke.errors.push('Exception: ' + e.message);
    smoke.note = e.message;
    log('    Exception ' + e.message);
  }
  st.calendarSmoke = smoke;
  log('    CALENDAR SMOKE PASS? ' + smoke.pass);

  st.finalizedAt = new Date().toISOString();
  fs.writeFileSync(STATUS_FILE, JSON.stringify(st, null, 2), { encoding: 'utf8' });
  log('Saved ' + STATUS_FILE);

  console.log('\n');
  console.log('████████████████████████████████████████████████');
  console.log('█           FINAL  STATUS  REPORT              █');
  console.log('████████████████████████████████████████████████');
  console.log('MYSQL UP?         ' + (st.mysql.up ? '✅ YA' : '❌ TIDAK') + '    - ' + st.mysql.note);
  console.log('BACKEND UP?       ' + (st.backend.up ? '✅ YA' : '❌ TIDAK') + '    - ' + st.backend.note);
  console.log('FRONTEND UP?      ' + (st.frontend.up ? '✅ YA' : '❌ TIDAK') + '    - ' + st.frontend.note);
  console.log('CALENDAR SMOKE?   ' + (st.calendarSmoke.pass ? '✅ LULUS' : '❌ GAGAL') + '  - HTTP=' + st.calendarSmoke.httpStatus + ' - ' + st.calendarSmoke.note);
  if (!st.calendarSmoke.pass && st.calendarSmoke.bodySnippet) {
    console.log('\n--- GAGAL snippet (600 chars) ---');
    console.log(st.calendarSmoke.bodySnippet);
    console.log('----------------------------------');
  }
  console.log('████████████████████████████████████████████████');
  console.log('Fail JSON: ' + STATUS_FILE);
  process.exit(st.calendarSmoke.pass ? 0 : 1);
}

main().catch(function (e) { console.error('FATAL', e.stack); process.exit(2); });
