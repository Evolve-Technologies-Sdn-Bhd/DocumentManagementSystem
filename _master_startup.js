const fs = require('fs');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const http = require('http');

const ROOT = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem';
const BACKEND_DIR = path.join(ROOT, 'backend');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const MYSQL_DATA = path.join(BACKEND_DIR, 'mysql-local-data');
const MYSQL_TMP = path.join(BACKEND_DIR, 'mysql-local-tmp');
const MYSQLD_EXE = 'C:\\xampp\\mysql\\bin\\mysqld.exe';
const ARIA_SRC = 'C:\\xampp\\mysql\\data\\aria_log.00000001';
const ARIA_DST = path.join(MYSQL_DATA, 'aria_log.00000001');

const MYSQL_ERR = path.join(BACKEND_DIR, '_mysqld_master.err');
const BE_OUT = path.join(BACKEND_DIR, '_backend_master.out');
const BE_ERR = path.join(BACKEND_DIR, '_backend_master.err');
const FE_OUT = path.join(FRONTEND_DIR, '_vite_master.out');
const FE_ERR = path.join(FRONTEND_DIR, '_vite_master.err');
const LOG_FILE = path.join(ROOT, '_master_startup.log');

const final = {
  MYSQL: 'down', MYSQL_PID: null,
  BACKEND: 'down', BACKEND_PID: null,
  CALENDAR: { status: null, body: null, prismaError: null, httpStatus: null },
  FRONTEND: 'down', FRONTEND_PID: null,
  steps: {}
};

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function checkPortListening(port) {
  return new Promise((resolve) => {
    try {
      const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 5000 });
      const lines = out.split(/\r?\n/);
      const matches = lines.filter(l => l.includes(`:${port} `) && (l.includes('LISTENING') || l.includes('LISTEN')));
      resolve(matches.length > 0 ? matches : null);
    } catch (e) {
      resolve(null);
    }
  });
}

function findPidOnPort(port) {
  return new Promise((resolve) => {
    try {
      const out = execSync('netstat -ano', { encoding: 'utf8', timeout: 5000 });
      const lines = out.split(/\r?\n/);
      const pids = new Set();
      for (const l of lines) {
        if (l.includes(`:${port} `) && (l.includes('LISTENING') || l.includes('LISTEN'))) {
          const m = l.match(/\s+(\d+)\s*$/);
          if (m) pids.add(parseInt(m[1]));
        }
      }
      resolve([...pids]);
    } catch { resolve([]); }
  });
}

function killProcessByName(names) {
  return new Promise((resolve) => {
    let killed = [];
    for (const name of names) {
      try {
        const out = execSync(`tasklist /FI "IMAGENAME eq ${name}" /NH`, { encoding: 'utf8', timeout: 5000 });
        for (const line of out.split(/\r?\n/)) {
          const m = line.match(/^(\S+)\s+(\d+)/);
          if (m && m[1].toLowerCase().startsWith(name.toLowerCase().replace('.exe',''))) {
            const pid = parseInt(m[2]);
            try { execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 }); killed.push({name, pid}); } catch {}
          }
        }
      } catch {}
    }
    resolve(killed);
  });
}

function killProcessByPids(pids) {
  for (const pid of pids) {
    try { execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 }); } catch {}
  }
}

function httpRequest(url, options = {}, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const reqOptions = {
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: timeoutMs
    };
    let body = options.body;
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      body = JSON.stringify(body);
      reqOptions.headers['Content-Type'] = 'application/json';
      reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', c => data += c.toString());
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', (e) => resolve({ error: e.message, status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout', status: 0, body: '' }); });
    if (body) req.write(body);
    req.end();
  });
}

async function pollUntil(conditionFn, maxSeconds, intervalMs = 2000, label = 'poll') {
  const start = Date.now();
  let lastResult = null;
  while (Date.now() - start < maxSeconds * 1000) {
    try {
      lastResult = await conditionFn();
      if (lastResult) { return { ok: true, result: lastResult, elapsed: (Date.now()-start)/1000 }; }
    } catch (e) { lastResult = e.message; }
    await sleep(intervalMs);
  }
  return { ok: false, result: lastResult, elapsed: (Date.now()-start)/1000 };
}

async function step0_killAll() {
  log('=== STEP 0: Kill mysqld/node processes ===');
  const killed1 = await killProcessByName(['mysqld.exe', 'mysqld', 'node.exe', 'node']);
  log(`  Killed by name: ${JSON.stringify(killed1)}`);
  const port4001Pids = await findPidOnPort(4001);
  const port3306Pids = await findPidOnPort(3306);
  const port5173Pids = await findPidOnPort(5173);
  const allPorts = [...new Set([...port4001Pids, ...port3306Pids, ...port5173Pids])];
  if (allPorts.length > 0) {
    log(`  Killing port PIDs 4001=${port4001Pids} 3306=${port3306Pids} 5173=${port5173Pids}`);
    killProcessByPids(allPorts);
  }
  const stalePids = fs.existsSync(MYSQL_DATA) ? fs.readdirSync(MYSQL_DATA).filter(f => f.endsWith('.pid')) : [];
  for (const f of stalePids) {
    try { fs.unlinkSync(path.join(MYSQL_DATA, f)); log(`  Deleted stale PID file: ${f}`); } catch {}
  }
  await sleep(3000);
  final.steps.kill = { killed1, portPidsKilled: allPorts };
}

async function step1_prepareMysql() {
  log('=== STEP 1: Prepare MySQL dirs ===');
  if (!fs.existsSync(MYSQL_TMP)) {
    fs.mkdirSync(MYSQL_TMP, { recursive: true });
    log(`  Created tmpdir: ${MYSQL_TMP}`);
  } else {
    log(`  tmpdir exists: ${MYSQL_TMP}`);
  }
  if (!fs.existsSync(MYSQL_DATA)) {
    log(`  ERROR: datadir MISSING: ${MYSQL_DATA}`);
    return false;
  }
  if (fs.existsSync(ARIA_SRC) && !fs.existsSync(ARIA_DST)) {
    try { fs.copyFileSync(ARIA_SRC, ARIA_DST); log(`  Copied aria_log.00000001`); }
    catch (e) { log(`  Copy aria error: ${e.message}`); }
  } else {
    log(`  aria_log: srcExists=${fs.existsSync(ARIA_SRC)} dstExists=${fs.existsSync(ARIA_DST)}`);
  }
  final.steps.mysqlPrep = { tmpdir: MYSQL_TMP, datadir: MYSQL_DATA };
  return true;
}

async function step2_startMysql() {
  log('=== STEP 2: Start MariaDB on port 3306 ===');
  for (const f of [MYSQL_ERR]) try { fs.unlinkSync(f); } catch {}
  const errFd = fs.openSync(MYSQL_ERR, 'w');
  const mysqld = spawn(MYSQLD_EXE, [
    `--datadir=${MYSQL_DATA}`,
    `--tmpdir=${MYSQL_TMP}`,
    '--port=3306',
    '--bind-address=127.0.0.1'
  ], { stdio: ['ignore', 'ignore', errFd], detached: true, windowsHide: false });
  final.MYSQL_PID = mysqld.pid;
  mysqld.unref();
  log(`  MySQL spawned PID=${mysqld.pid}, waiting for port 3306...`);
  const poll = await pollUntil(async () => {
    return await checkPortListening(3306);
  }, 60, 3000, 'port3306');
  log(`  Port 3306 result: ok=${poll.ok} elapsed=${poll.elapsed.toFixed(1)}s`);
  if (poll.ok) {
    final.MYSQL = 'up';
    final.steps.mysqlStart = { ok: true, pid: mysqld.pid, elapsed: poll.elapsed };
  } else {
    log(`  MySQL stderr tail:`);
    try {
      const content = fs.readFileSync(MYSQL_ERR, 'utf8');
      content.split(/\r?\n/).slice(-15).forEach(l => log(`    ERR: ${l}`));
    } catch {}
    final.steps.mysqlStart = { ok: false, pid: mysqld.pid, elapsed: poll.elapsed };
  }
  return poll.ok;
}

async function step3_startBackend() {
  log('=== STEP 3: Start backend on port 4001 ===');
  const prePids = await findPidOnPort(4001);
  if (prePids.length > 0) {
    log(`  Found old listeners on 4001: ${prePids}, killing...`);
    killProcessByPids(prePids);
    await sleep(2000);
  }
  for (const f of [BE_OUT, BE_ERR]) try { fs.unlinkSync(f); } catch {}
  const outFd = fs.openSync(BE_OUT, 'w');
  const errFd = fs.openSync(BE_ERR, 'w');
  const env = { ...process.env };
  const be = spawn('node', ['src/index.js'], {
    cwd: BACKEND_DIR, stdio: ['ignore', outFd, errFd],
    detached: true, env, windowsHide: false
  });
  final.BACKEND_PID = be.pid;
  be.unref();
  log(`  Backend spawned PID=${be.pid}, polling /api/public/branding...`);

  const poll = await pollUntil(async () => {
    const r = await httpRequest('http://127.0.0.1:4001/api/public/branding', {}, 5000);
    if (r.status && r.status < 500) return { status: r.status };
    return false;
  }, 30, 2000, 'branding');

  log(`  Branding poll: ok=${poll.ok} elapsed=${poll.elapsed.toFixed(1)}s result=${JSON.stringify(poll.result)}`);
  if (poll.ok) {
    final.BACKEND = 'up';
  } else {
    try {
      const out = fs.readFileSync(BE_OUT, 'utf8').split(/\r?\n/).slice(-15);
      const err = fs.readFileSync(BE_ERR, 'utf8').split(/\r?\n/).slice(-15);
      log(`  Backend stdout tail:`); out.forEach(l => log(`    OUT: ${l}`));
      log(`  Backend stderr tail:`); err.forEach(l => log(`    ERR: ${l}`));
    } catch {}
  }
  final.steps.backend = { ok: poll.ok, pid: be.pid, elapsed: poll.elapsed, branding: poll.result };
  return poll.ok;
}

async function step4_calendarSmoke() {
  log('=== STEP 4: Calendar API smoke test ===');
  if (final.BACKEND !== 'up') {
    log('  SKIP: backend not up');
    final.CALENDAR = { status: 'SKIP', prismaError: false };
    return false;
  }

  log('  Login POST /api/auth/login...');
  const loginRes = await httpRequest('http://127.0.0.1:4001/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@company.com', password: 'Admin@123' }
  }, 15000);
  log(`  Login: HTTP ${loginRes.status}`);
  if (loginRes.status !== 200 && loginRes.status !== 201) {
    log(`  Login FAILED. Body: ${loginRes.body.substring(0, 500)}`);
    final.CALENDAR = { httpStatus: loginRes.status, body: loginRes.body.substring(0, 400), prismaError: null, status: 'LOGIN_FAIL' };
    return false;
  }

  let token = null;
  try {
    const loginJson = JSON.parse(loginRes.body);
    token = loginJson.token || loginJson.jwt || loginJson.accessToken || (loginJson.data && (loginJson.data.token || loginJson.data.jwt || loginJson.data.accessToken));
    if (!token && loginJson.body && typeof loginJson.body === 'object') {
      token = loginJson.body.token || loginJson.body.jwt;
    }
  } catch (e) {
    log(`  Login JSON parse err: ${e.message}`);
  }
  log(`  Token obtained: ${!!token} (len=${token ? token.length : 0})`);

  const calUrl = 'http://127.0.0.1:4001/api/calendar?from=2026-09-01&to=2026-09-30';
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  log(`  GET /api/calendar (with ${token ? 'JWT' : 'no token'})...`);
  const calRes = await httpRequest(calUrl, { headers }, 20000);

  const bodyPreview = (calRes.body || '').substring(0, 400);
  const prismaMatch = (calRes.body || '').match(/not:\s*DateTime|P2023|Invalid\s*.*DateTime|DateTime.*expected/i);
  const hasPrismaErr = !!prismaMatch;

  log(`  Calendar: HTTP ${calRes.status}`);
  log(`  Prisma "not: DateTime" error: ${hasPrismaErr}${prismaMatch ? ` [${prismaMatch[0]}]` : ''}`);
  log(`  Body first 400 chars: ${bodyPreview}`);

  final.CALENDAR = {
    httpStatus: calRes.status,
    body: bodyPreview,
    prismaError: hasPrismaErr,
    status: calRes.status && calRes.status < 500 && !hasPrismaErr ? 'PASS' : 'FAIL'
  };
  return final.CALENDAR.status === 'PASS';
}

async function step5_startFrontend() {
  log('=== STEP 5: Start frontend on port 5173 ===');
  const preCheck = await checkPortListening(5173);
  if (preCheck) {
    log(`  Port 5173 already LISTENING, skipping frontend start.`);
    final.FRONTEND = 'up';
    final.steps.frontend = { ok: true, alreadyUp: true };
    return true;
  }

  for (const f of [FE_OUT, FE_ERR]) try { fs.unlinkSync(f); } catch {}
  const outFd = fs.openSync(FE_OUT, 'w');
  const errFd = fs.openSync(FE_ERR, 'w');
  const fe = spawn('npx.cmd', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: FRONTEND_DIR, stdio: ['ignore', outFd, errFd],
    detached: true, env: process.env, windowsHide: false
  });
  final.FRONTEND_PID = fe.pid;
  fe.unref();
  log(`  Frontend spawned PID=${fe.pid}, polling / ...`);

  const poll = await pollUntil(async () => {
    const r = await httpRequest('http://127.0.0.1:5173/', {}, 5000);
    if (r.status && r.status < 500) return { status: r.status };
    return false;
  }, 60, 3000, 'frontend');

  log(`  Frontend poll: ok=${poll.ok} elapsed=${poll.elapsed.toFixed(1)}s`);
  if (poll.ok) {
    final.FRONTEND = 'up';
  } else {
    try {
      const out = fs.readFileSync(FE_OUT, 'utf8').split(/\r?\n/).slice(-10);
      const err = fs.readFileSync(FE_ERR, 'utf8').split(/\r?\n/).slice(-10);
      log(`  FE stdout:`); out.forEach(l => log(`    OUT: ${l}`));
      log(`  FE stderr:`); err.forEach(l => log(`    ERR: ${l}`));
    } catch {}
  }
  final.steps.frontend = { ok: poll.ok, pid: fe.pid, elapsed: poll.elapsed, alreadyUp: false };
  return poll.ok;
}

function emitFinalReport() {
  const lines = [];
  lines.push('');
  lines.push('====================================================');
  lines.push('              FINAL STATUS REPORT');
  lines.push('====================================================');
  lines.push(`MYSQL    = ${final.MYSQL.toUpperCase()}  PID=${final.MYSQL_PID}`);
  lines.push(`BACKEND  = ${final.BACKEND.toUpperCase()}  PID=${final.BACKEND_PID}`);
  if (final.CALENDAR.status) {
    lines.push(`CALENDAR SMOKE = ${final.CALENDAR.status}`);
    lines.push(`  HTTP Status   = ${final.CALENDAR.httpStatus}`);
    lines.push(`  Prisma DateTime Error = ${final.CALENDAR.prismaError}`);
    if (final.CALENDAR.body) {
      lines.push(`  Body (first 400):`);
      lines.push(`  ${final.CALENDAR.body.replace(/\r?\n/g, '\n  ')}`);
    }
  }
  lines.push(`FRONTEND = ${final.FRONTEND.toUpperCase()}  PID=${final.FRONTEND_PID}`);
  lines.push('====================================================');
  lines.push('Report file: ' + LOG_FILE);
  lines.push('');

  for (const l of lines) console.log(l);
  try { fs.appendFileSync(LOG_FILE, lines.join('\n')); } catch {}

  const reportPath = path.join(ROOT, '_final_status_report.txt');
  try { fs.writeFileSync(reportPath, lines.join('\n')); } catch {}

  return lines;
}

async function main() {
  try {
    for (const f of [LOG_FILE]) try { fs.unlinkSync(f); } catch {}
    log('======== MASTER STARTUP SCRIPT ========');
    log(`ROOT = ${ROOT}`);

    await step0_killAll();
    const prep = await step1_prepareMysql();
    if (!prep) log('WARN: MySQL prep issue, continuing anyway');
    await step2_startMysql();
    await step3_startBackend();
    await step4_calendarSmoke();
    await step5_startFrontend();
    emitFinalReport();
    log('DONE.');
    process.exit(0);
  } catch (e) {
    log(`FATAL ERROR: ${e.message}\n${e.stack}`);
    emitFinalReport();
    process.exit(1);
  }
}

main();
