const http = require('http');
const fs = require('fs');
const res = [];
const { execSync } = require('child_process');
try {
  const n = execSync('netstat -ano').toString();
  const l = n.split('\n').filter(x => x.includes(':4001'));
  res.push('NETSTAT:', ...l);
} catch (e) { res.push('netstat err: ' + e.message); }
const r = http.get('http://localhost:4001/api/public/branding', (resp) => {
  let d = '';
  resp.on('data', c => d += c);
  resp.on('end', () => { res.push('HTTP OK: ' + resp.statusCode + ' len=' + d.length); fs.writeFileSync(__dirname + '/fin.txt', res.join('\n')); process.exit(0); });
});
r.on('error', (e) => { res.push('HTTP ERR: ' + e.message); fs.writeFileSync(__dirname + '/fin.txt', res.join('\n')); process.exit(1); });
r.setTimeout(5000, () => { res.push('HTTP TIMEOUT'); fs.writeFileSync(__dirname + '/fin.txt', res.join('\n')); try { r.destroy(); } catch(e){} process.exit(2); });
