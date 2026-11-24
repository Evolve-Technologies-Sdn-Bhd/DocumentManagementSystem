const fs = require('fs');

const src = 'C:\\xampp\\mysql\\data\\aria_log.00000001';
const dst = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend\\mysql-local-data\\aria_log.00000001';
const logFile = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend\\_copy_result.txt';

let log = '';
log += 'Source exists: ' + fs.existsSync(src) + '\n';
log += 'Dest exists before: ' + fs.existsSync(dst) + '\n';

try {
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
        log += 'COPIED aria_log\n';
    } else if (fs.existsSync(dst)) {
        log += 'aria_log already exists at dest\n';
    } else {
        log += 'Source not found!\n';
    }
} catch (e) {
    log += 'Copy error: ' + e.message + '\n';
}

log += 'Dest exists after: ' + fs.existsSync(dst) + '\n';
fs.writeFileSync(logFile, log);
