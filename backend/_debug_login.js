const http = require('http');

const payload = JSON.stringify({ email: 'admin@company.com', password: 'Admin@123' });
const opts = {
  hostname: '127.0.0.1', port: 4001, path: '/api/auth/login', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
};
const req = http.request(opts, function (res) {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', function (c) { data += c; });
  res.on('end', function () {
    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
    console.log('\n--- FULL BODY ---');
    console.log(data);
    console.log('--- END BODY ---\n');
    try {
      const p = JSON.parse(data);
      console.log('ROOT KEYS:', Object.keys(p));
      if (p.data) {
        console.log('DATA KEYS:', Object.keys(p.data));
        if (typeof p.data === 'object') {
          console.log('DATA CONTENT:', JSON.stringify(p.data, null, 2).slice(0, 1500));
        }
      }
      const guesses = [
        ['root.token', p.token],
        ['root.jwt', p.jwt],
        ['root.accessToken', p.accessToken],
        ['root.access_token', p.access_token],
        ['root.authToken', p.authToken],
        ['root.Authorization', p.Authorization],
        ['root.data.token', p.data && p.data.token],
        ['root.data.jwt', p.data && p.data.jwt],
        ['root.data.accessToken', p.data && p.data.accessToken],
        ['root.data.access_token', p.data && p.data.access_token],
        ['root.result.token', p.result && p.result.token],
        ['root.user.token', p.user && p.user.token],
        ['root.data.user.token', p.data && p.data.user && p.data.user.token],
      ];
      console.log('\n--- GUESSES ---');
      guesses.forEach(function (g) {
        const v = g[1];
        if (v) console.log(g[0], '=', (typeof v === 'string' ? v.slice(0, 30) + '... (len=' + v.length + ')' : typeof v));
      });
      console.log('\nRegEx scan for JWT-like patterns:');
      const re = /"(token|jwt|accessToken|access_token)"\s*:\s*"([^"]{20,})"/g;
      let m;
      while ((m = re.exec(data)) !== null) {
        console.log('FOUND key=' + m[1] + ' value_prefix=' + m[2].slice(0, 20) + '...(len=' + m[2].length + ')');
      }
    } catch (e) {
      console.log('JSON parse error:', e.message);
    }
  });
});
req.on('error', function (e) { console.error('HTTP ERROR', e.message); });
req.setTimeout(15000, function () { req.destroy(); console.error('TIMEOUT'); });
req.write(payload);
req.end();
