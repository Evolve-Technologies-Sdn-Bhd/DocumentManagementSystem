const fs = require('fs');
const path = require('path');
const out = {};
out.cwd = process.cwd();
out.argv = process.argv;
try {
  const { PrismaClient } = require(path.join('c:', 'Users', 'USER', 'Desktop', 'DocumentManagementSystem', 'backend', 'node_modules', '@prisma', 'client'));
  out.prisma_loaded = true;
} catch (e) {
  out.prisma_loaded = false;
  out.prisma_error = String(e.message || e);
}
const envPath = path.join('c:', 'Users', 'USER', 'Desktop', 'DocumentManagementSystem', 'backend', '.env');
if (fs.existsSync(envPath)) {
  const txt = fs.readFileSync(envPath, 'utf8');
  out.env_file_exists = true;
  out.database_url_line = (txt.split(/\r?\n/).find(l => l.startsWith('DATABASE_URL=')) || '').slice(0, 50) + '...';
  try {
    process.env.DATABASE_URL = txt.split(/\r?\n/).find(l => l.startsWith('DATABASE_URL=')).slice('DATABASE_URL='.length);
    out.database_url_parsed_ok = true;
  } catch (e) { out.database_url_parsed_ok = false; }
} else {
  out.env_file_exists = false;
}
const http = require('http');
const p = new Promise(resolve => {
  const req = http.get('http://127.0.0.1:4001/api/public/branding', { timeout: 2000 }, res => {
    res.resume();
    resolve({ code: res.statusCode, backend: true });
  });
  req.on('error', () => resolve({ code: 0, backend: false }));
  req.on('timeout', () => { req.destroy(); resolve({ code: -1, backend: false }); });
});
p.then(r => {
  out.ping_backend = r;
  const p2 = new Promise(resolve => {
    const req2 = http.get('http://127.0.0.1:5173/', { timeout: 2000 }, res2 => {
      res2.resume();
      resolve({ code: res2.statusCode, frontend: true });
    });
    req2.on('error', () => resolve({ code: 0, frontend: false }));
    req2.on('timeout', () => { req2.destroy(); resolve({ code: -1, frontend: false }); });
  });
  p2.then(r2 => {
    out.ping_frontend = r2;
    fs.writeFileSync(path.join('c:', 'Users', 'USER', 'Desktop', 'DocumentManagementSystem', 'backend', '_pingenv.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ ok: true, b: r.backend, f: r2.frontend }));
    process.exit(0);
  });
});
