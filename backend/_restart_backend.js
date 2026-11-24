const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BACKEND_DIR = __dirname;
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const MARKER_DONE = path.join(BACKEND_DIR, '_restart_marker.json');

const ping = (url, timeout = 2500) => new Promise(resolve => {
  const req = http.get(url, { timeout }, res => {
    res.resume();
    resolve({ code: res.statusCode, alive: true });
  });
  req.on('error', () => resolve({ code: 0, alive: false }));
  req.on('timeout', () => { req.destroy(); resolve({ code: 0, alive: false }); });
});

const run = (cmd, args = [], opts = {}) => {
  try {
    return { ok: true, out: execSync(cmd + ' ' + args.join(' '), { windowsHide: true, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, ...opts }) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + '\n' + (e.stderr || e.message) };
  }
};

(async () => {
  const report = {};
  report.started_at = new Date().toISOString();
  report.pid_before_self = process.pid;

  try {
    // --- Find processes ---
    const before = run('tasklist', ['/FI', '"IMAGENAME eq node.exe"', '/FO', 'CSV', '/NH']);
    report.node_before_raw = before.out;

    // Find which PIDs listen on :4001 (backend) and :5173 (vite frontend)
    const ns = run('netstat', ['-ano']);
    report.netstat_raw = ns.out;
    const backendLine = (ns.out || '').split(/\r?\n/).find(l => /:4001\s.*LISTENING/i.test(l));
    const frontendLine = (ns.out || '').split(/\r?\n/).find(l => /:5173\s.*LISTENING/i.test(l));
    report.backend_listen_line = backendLine || null;
    report.frontend_listen_line = frontendLine || null;
    const backendPid = backendLine ? (backendLine.match(/\s(\d+)\s*$/) || [])[1] : null;
    const frontendPid = frontendLine ? (frontendLine.match(/\s(\d+)\s*$/) || [])[1] : null;
    report.backend_pid = backendPid || null;
    report.frontend_pid = frontendPid || null;

    // Kill old backend (only :4001 listener) if any
    if (backendPid) {
      const k = run('taskkill', ['/PID', backendPid, '/F']);
      report.backend_kill = k.out;
    } else {
      report.backend_kill = 'no pid to kill';
    }
    // Also kill any other stray node listening on 4001? Already done via netstat pid.

    // Wait for port free
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const p = await ping('http://127.0.0.1:4001/api/public/branding');
      if (!p.alive) { report.backend_port_free_after = (i + 1) * 0.5 + 's'; break; }
    }

    // --- Spawn NEW backend ---
    const newBe = spawn('node.exe', ['src/index.js'], {
      cwd: BACKEND_DIR,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      detached: true
    });
    newBe.unref();
    report.new_backend_pid = newBe.pid;

    // Wait until new backend ready (max 30s)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const p = await ping('http://127.0.0.1:4001/api/public/branding');
      if (p.alive && p.code < 500) { report.new_backend_ready = { after: (i+1) + 's', code: p.code }; break; }
    }

    // Ping calendar endpoint specifically to confirm Prisma syntax fix applied
    // We need a JWT to hit /api/calendar, so instead hit /api/public/branding which is a reliable canary
    const finalPing = await ping('http://127.0.0.1:4001/api/public/branding');
    report.final_backend_ping = finalPing;

    // If frontend also died (shouldn't - we only killed backend PID, not all node), restart it
    const fePing = await ping('http://127.0.0.1:5173/');
    report.frontend_before_restart = fePing;
    if (!fePing.alive) {
      const newFe = spawn('npx.cmd', ['vite', '--host', '127.0.0.1', '--port', '5173'], {
        cwd: FRONTEND_DIR,
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
        detached: true
      });
      newFe.unref();
      report.new_frontend_pid = newFe.pid;
      for (let i = 0; i < 45; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const p2 = await ping('http://127.0.0.1:5173/');
        if (p2.alive && p2.code < 500) { report.new_frontend_ready = { after: (i+1) + 's', code: p2.code }; break; }
      }
    }

    report.success = true;
  } catch (e) {
    report.success = false;
    report.error = String(e && e.message || e);
    report.stack = e && e.stack;
  } finally {
    report.finished_at = new Date().toISOString();
    try { fs.writeFileSync(MARKER_DONE, JSON.stringify(report, null, 2)); } catch (_) {}
  }
})();
