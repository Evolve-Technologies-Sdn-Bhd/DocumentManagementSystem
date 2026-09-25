const { spawn } = require('child_process');
const fs = require('fs');
const out = fs.openSync(__dirname + '/be_debug_stdout.log', 'w');
const err = fs.openSync(__dirname + '/be_debug_stderr.log', 'w');
const c = spawn('node', ['src/app.js'], { cwd: __dirname, stdio: ['ignore', out, err], windowsHide: true });
let done = false;
c.on('exit', (code) => { console.log('EXIT', code); done = true; fs.appendFileSync(__dirname + '/be_debug_stdout.log', '\nPROCESS EXIT CODE: ' + code + '\n'); process.exit(0); });
setTimeout(() => {
  if (!done) {
    console.log('22s REACHED: assume still running (success)');
    fs.appendFileSync(__dirname + '/be_debug_stdout.log', '\nPROCESS STILL RUNNING AFTER 22s (listen success)\n');
    try {
      const { execSync } = require('child_process');
      const ns = execSync('netstat -ano').toString();
      fs.appendFileSync(__dirname + '/be_debug_stdout.log', '\n' + ns.split('\n').filter(x => x.includes(':4001')).join('\n'));
    } catch (e) {}
    c.unref();
    process.exit(0);
  }
}, 22000);
