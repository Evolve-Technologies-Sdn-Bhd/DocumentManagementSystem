const http = require('http');

const req = http.request({
  hostname: 'localhost', port: 4001,
  path: '/api/public/login-page-settings',
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost:5173',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'Content-Type',
    'Host': 'localhost:4001',
  },
  timeout: 10000
}, (res) => {
  let data = '';
  console.log('OPTIONS status', res.statusCode);
  console.log('OPTIONS headers:');
  for (const key of Object.keys(res.headers)) {
    if (key.toLowerCase().includes('access-control') || key.toLowerCase() === 'vary') {
      console.log('   ' + key + ': ' + res.headers[key]);
    }
  }
  res.on('data', (c) => data += c);
  res.on('end', () => {
    console.log('body length', data.length);
    afterOpt();
  });
});

req.on('error', (e) => { console.log('OPTIONS ERR:', e.message); process.exit(1); });
req.on('timeout', () => { req.destroy(new Error('timeout OPTIONS')); });
req.end();

function afterOpt() {
  const req2 = http.get('http://localhost:4001/api/public/login-page-settings', { headers: { 'Origin': 'http://localhost:5173', 'Accept':'application/json' } }, (res) => {
    let b='';
    console.log('\nGET status', res.statusCode);
    for (const key of Object.keys(res.headers)) {
      if (key.toLowerCase().includes('access-control') || key.toLowerCase()==='vary') console.log('   '+key+': '+res.headers[key]);
    }
    res.on('data',(c)=>b+=c);
    res.on('end', ()=>{
      console.log('body:', b.slice(0, 1200));
      require('fs').writeFileSync('c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend\\_cors_tests.log', 'done');
    });
  });
  req2.on('error', e => console.log('GET ERR:', e.message));
  req2.setTimeout(10000, () => req2.destroy(new Error('timeout GET')));
}
