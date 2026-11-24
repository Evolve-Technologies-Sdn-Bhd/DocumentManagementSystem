const fs = require('fs');
const path = require('path');

const src = 'C:\\xampp\\mysql\\data\\aria_log.00000001';
const dst = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend\\mysql-local-data\\aria_log.00000001';
const tmpDir = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend\\mysql-local-tmp';

console.log('Source exists:', fs.existsSync(src));
console.log('Dest exists before:', fs.existsSync(dst));

if (fs.existsSync(src) && !fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log('COPIED aria_log');
} else if (fs.existsSync(dst)) {
    console.log('aria_log already exists at dest');
}

if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
    console.log('CREATED tmp dir');
} else {
    console.log('tmp dir exists');
}

console.log('Dest exists after:', fs.existsSync(dst));
