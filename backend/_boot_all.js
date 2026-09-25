const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BACKEND_DIR = __dirname;
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const MYSQLD = 'C:\\xampp\\mysql\\bin\\mysqld.exe';
const MYSQL_DATA = path.join(BACKEND_DIR, 'mysql-local-data');
const MYSQL_TMP = path.join(BACKEND_DIR, 'mysql-local-tmp');
const LOG = path.join(BACKEND_DIR, '_boot.log');

if (!fs.existsSync(MYSQL_TMP)) fs.mkdirSync(MYSQL_TMP, { recursive: true });

const appendLog = (tag, msg) => {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${tag}] ${String(msg).replace(/\s+$/,'')}\n`;
  fs.appendFileSync(LOG, line);
  process.stdout.write(line);
};
fs.writeFileSync(LOG, '');

const doSpawn = (tag, cmd, args, opts) => {
  appendLog(tag, `SPAWN: ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...(opts || {})
  });
  child.stdout.on('data', d => appendLog(tag, d.toString()));
  child.stderr.on('data', d => appendLog(tag, d.toString()));
  child.on('error', e => appendLog(tag, 'ERROR: ' + e.message));
  child.on('exit', c => appendLog(tag, `EXIT code=${c}`));
  return child;
};

const ping = (url, timeout = 2500) => new Promise(resolve => {
  const req = http.get(url, { timeout }, res => {
    res.resume();
    resolve(res.statusCode);
  });
  req.on('error', () => resolve(0));
  req.on('timeout', () => { req.destroy(); resolve(0); });
});

(async () => {
  appendLog('BOOT', 'Starting orchestrator');

  // 1) MySQL
  const mysqld = doSpawn('MYSQL', MYSQLD, [
    `--datadir=${MYSQL_DATA}`,
    `--tmpdir=${MYSQL_TMP}`,
    '--port=3306',
    '--bind-address=127.0.0.1'
  ]);

  // 2) Wait until MySQL port up (max 30s)
  appendLog('BOOT', 'Waiting for MySQL :3306 via Prisma ping...');
  let mysqlOk = false;
  for (let i = 0; i < 30; i++) {
    const r = spawnSync('node', ['-e', `
      process.env.DATABASE_URL = require('fs').readFileSync(${JSON.stringify(path.join(BACKEND_DIR,'.env'))},'utf8').split(/\\r?\\n/).find(l=>l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length);
      const { PrismaClient } = require('@prisma/client');
      const p = new PrismaClient();
      p.$queryRawUnsafe('SELECT 1 AS ok').then(()=>{process.exit(0)}).catch(e=>{process.exit(1)});
    `], { cwd: BACKEND_DIR, timeout: 5000 });
    if (r.status === 0) { mysqlOk = true; appendLog('BOOT', 'MySQL OK'); break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!mysqlOk) appendLog('BOOT', 'WARN: MySQL not reachable after 30s (proceeding anyway)');

  // 3) Backend :4001
  const backend = doSpawn('BACKEND', 'node', ['src/index.js'], { cwd: BACKEND_DIR });

  let beOk = false;
  for (let i = 0; i < 30; i++) {
    const code = await ping('http://127.0.0.1:4001/api/public/branding');
    if (code && code < 500) { beOk = true; appendLog('BOOT', `Backend OK status=${code}`); break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!beOk) appendLog('BOOT', 'WARN: Backend :4001 not reachable after 30s');

  // 4) Frontend Vite :5173
  const frontend = doSpawn('FRONTEND', 'npx.cmd', ['vite', '--host', '127.0.0.1', '--port', '5173'], { cwd: FRONTEND_DIR });

  let feOk = false;
  for (let i = 0; i < 60; i++) {
    const code = await ping('http://127.0.0.1:5173/');
    if (code && code < 500) { feOk = true; appendLog('BOOT', `Frontend OK status=${code}`); break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!feOk) appendLog('BOOT', 'WARN: Frontend :5173 not reachable after 60s');

  appendLog('BOOT', 'ORCHESTRATOR DONE. PIDs mysqld=' + mysqld.pid + ' backend=' + backend.pid + ' frontend=' + frontend.pid);
  // Detach (exit orchestrator, children keep running because we didn't register listeners that would trigger on process exit)
})();
