const fs = require('fs');
const path = require('path');
const outFile = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend\\_nodedebug.txt';
const lines = [];
lines.push('Node version: ' + process.version);
lines.push('Platform: ' + process.platform);
lines.push('Arch: ' + process.arch);
lines.push('CWD: ' + process.cwd());
lines.push('PID: ' + process.pid);
lines.push('argv: ' + JSON.stringify(process.argv));
try {
    fs.writeFileSync(outFile, lines.join('\n') + '\n');
    lines.push('WROTE FILE: ' + outFile);
    // Also write a tiny marker file in data dir
    const ariaSrc = 'C:\\xampp\\mysql\\data\\aria_log.00000001';
    const ariaDst = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend\\mysql-local-data\\aria_log.00000001';
    lines.push('aria src exists: ' + fs.existsSync(ariaSrc));
    lines.push('aria dst exists before: ' + fs.existsSync(ariaDst));
    if (fs.existsSync(ariaSrc) && !fs.existsSync(ariaDst)) {
        fs.copyFileSync(ariaSrc, ariaDst);
        lines.push('ARIA COPIED');
    }
    lines.push('aria dst exists after: ' + fs.existsSync(ariaDst));
    fs.writeFileSync(outFile, lines.join('\n') + '\n');
} catch (e) {
    lines.push('ERROR: ' + e.message);
    lines.push('STACK: ' + e.stack);
    try { fs.writeFileSync(outFile, lines.join('\n') + '\n'); } catch {}
}
