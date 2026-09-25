const http = require('http');

function test(path, cb) {
  const req = http.get('http://127.0.0.1:4001' + path, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => cb(null, res.statusCode, body));
  });
  req.on('error', (e) => cb(e, null, null));
  req.setTimeout(10000, () => { req.destroy(new Error('timeout')); });
}

const fs = require('fs');
const out = [];
test('/api/public/branding', (err, status, body) => {
  out.push('branding: err=' + (err && err.message) + ' status=' + status + ' bodyLen=' + (body && body.length));
  if (body) out.push(body.slice(0, 1400));
  test('/api/public/login-page-settings', (err2, s2, b2) => {
    out.push('loginPage: err=' + (err2 && err2.message) + ' status=' + s2 + ' bodyLen=' + (b2 && b2.length));
    if (b2) out.push(b2.slice(0, 1800));
    out.push('=== done ===');
    fs.writeFileSync('c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend\\_api_tests.log', out.join('\n'));
    process.exit(0);
  });
});
