const http = require('http');
function req(method, path, data, headers){
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : null;
    const opts = {
      hostname:'localhost', port:4001, path, method,
      headers: Object.assign({
        'Accept':'application/json',
        'Content-Type':'application/json'
      }, headers||{})
    };
    if(postData) opts.headers['Content-Length'] = Buffer.byteLength(postData);
    console.log('>>> ' + method + ' ' + path);
    const r = http.request(opts, res => {
      let b=''; res.on('data', c=>b+=c); res.on('end', ()=>{
        console.log('<<< HTTP ' + res.statusCode + ' bodylen=' + b.length);
        let json = null; try{ if(b) json = JSON.parse(b);}catch(e){}
        resolve({status:res.statusCode, headers:res.headers, body:b, json});
      });
    });
    r.on('error', e => reject(e));
    if(postData) r.write(postData);
    r.end();
  });
}
(async () => {
  try {
    // 1) Login
    const login = await req('POST', '/api/auth/login', {email:'admin@company.com', password:'Admin@123'});
    const token = (login.json && (login.json.accessToken)) || (login.json && login.json.data && login.json.data.accessToken);
    if(!token){ console.log('Login FAIL (no token). body:', login.body.slice(0,2000)); process.exit(1); }
    const bearer = {'Authorization':'Bearer '+token};
    const u = (login.json && login.json.user) || (login.json && login.json.data && login.json.data.user);
    console.log('Login OK, user=', u && u.email);

    const VERSION_ID = 8;
    const payload = { fieldValues: {} };

    // Test PREVIEW-PDF endpoint (correct route name)
    console.log('\n=== Testing VERSION ID=' + VERSION_ID + ' /preview-pdf ===');
    const prev = await req('POST', '/api/smart-templates/versions/' + VERSION_ID + '/preview-pdf', payload, bearer);
    console.log('\n========== PREVIEW-PDF RESPONSE (VERSION='+VERSION_ID+') ==========');
    console.log('HTTP Status:', prev.status);
    if(prev.headers['content-type']) console.log('Content-Type:', prev.headers['content-type']);
    if(prev.json) {
      console.log('JSON top-level keys:', Object.keys(prev.json));
      const msg = prev.json.message || prev.json.error || '';
      if(msg) console.log('MESSAGE/ERROR = ' + JSON.stringify(msg));
      if(prev.json.success === true && !msg) console.log('success:true, tail=' + JSON.stringify(prev.json).slice(-2000));
      if(prev.json.data && prev.json.data.pdfUrl) console.log('SUCCESS: pdfUrl = ' + prev.json.data.pdfUrl);
      const combined = String(msg);
      console.log('\n--- CRITICAL VERIFICATION ---');
      const hasChromePrefix = combined.includes('(1) Chrome') || combined.includes('(1) Chrome/Edge');
      const onlyOldLibre = combined.includes('LibreOffice') && !hasChromePrefix && !combined.includes('(1) Chrome');
      const isSuccessful = (prev.status === 200 && (prev.json.success || (prev.json.data && prev.json.data.pdfUrl)));
      console.log('SUCCESS (status 200 + pdf data): ' + isSuccessful);
      console.log('Contains "(1) Chrome/Edge converter:" PREFIX (NEW CODE EXECUTED 100% PROOF): ' + hasChromePrefix);
      console.log('Old error only (LibreOffice no numbered prefix = OLD code proof): ' + onlyOldLibre);
    } else {
      console.log('RAW BODY first 3000:');
      console.log(prev.body.slice(0,3000));
    }
  } catch (e) {
    console.error('SCRIPT EXCEPTION:', e && e.stack ? e.stack : String(e));
  }
})();
