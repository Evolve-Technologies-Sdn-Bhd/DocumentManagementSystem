const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND_DIR = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\backend';
const FRONTEND_DIR = 'c:\\Users\\USER\\Desktop\\DocumentManagementSystem\\frontend';
const MYSQL_DATA = path.join(BACKEND_DIR, 'mysql-local-data');
const MYSQL_TMP = path.join(BACKEND_DIR, 'mysql-local-tmp');

const summary = {};
summary.startTime = new Date().toISOString();

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(path.join(BACKEND_DIR, '_orchestrator.log'), line + '\n');
}

function tailFile(file, lines = 10) {
    try {
        if (!fs.existsSync(file)) return ['(file does not exist)'];
        const content = fs.readFileSync(file, 'utf8');
        const arr = content.split(/\r?\n/).filter(l => l.length > 0 || true);
        return arr.slice(-lines);
    } catch (e) {
        return [`(error reading: ${e.message})`];
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkPort(port) {
    return new Promise((resolve) => {
        const netstat = spawn('netstat', ['-ano']);
        let out = '';
        netstat.stdout.on('data', d => out += d.toString());
        netstat.on('close', () => {
            const lines = out.split(/\r?\n/);
            const matches = lines.filter(l => l.includes(`:${port}`) && (l.includes('LISTENING') || l.includes('LISTEN')));
            resolve(matches);
        });
    });
}

async function step1_cleanPids() {
    log('Step 1: Clean stale PID files');
    const files = fs.readdirSync(MYSQL_DATA).filter(f => f.endsWith('.pid'));
    summary.pidFilesDeleted = [];
    for (const f of files) {
        const full = path.join(MYSQL_DATA, f);
        try { fs.unlinkSync(full); summary.pidFilesDeleted.push(f); log(`  Deleted ${f}`); }
        catch (e) { log(`  Failed to delete ${f}: ${e.message}`); }
    }
    if (files.length === 0) log('  No PID files found');
}

async function step2_copyAriaLog() {
    log('Step 2: Copy aria_log');
    const src = 'C:\\xampp\\mysql\\data\\aria_log.00000001';
    const dst = path.join(MYSQL_DATA, 'aria_log.00000001');
    summary.ariaLog = { sourceExists: fs.existsSync(src), destExistsBefore: fs.existsSync(dst), copied: false };
    if (!fs.existsSync(MYSQL_TMP)) {
        fs.mkdirSync(MYSQL_TMP, { recursive: true });
        log('  Created mysql-local-tmp dir');
    }
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
        try {
            fs.copyFileSync(src, dst);
            summary.ariaLog.copied = true;
            summary.ariaLog.destExistsAfter = true;
            log('  aria_log.00000001 copied');
        } catch (e) {
            log(`  Copy error: ${e.message}`);
            summary.ariaLog.destExistsAfter = fs.existsSync(dst);
        }
    } else {
        summary.ariaLog.destExistsAfter = fs.existsSync(dst);
        log(`  Source exists: ${summary.ariaLog.sourceExists}, Dest already exists: ${summary.ariaLog.destExistsBefore}`);
    }
}

async function step3_startMysql() {
    log('Step 3: Start MySQL');
    const errPath = path.join(BACKEND_DIR, '_mysqld_final.err');
    const errFd = fs.openSync(errPath, 'w');
    
    const mysqld = spawn('C:\\xampp\\mysql\\bin\\mysqld.exe', [
        `--datadir=${MYSQL_DATA}`,
        `--tmpdir=${MYSQL_TMP}`,
        '--port=3306',
        '--bind-address=127.0.0.1'
    ], {
        stdio: ['ignore', 'ignore', errFd],
        detached: true
    });
    summary.mysql = { pid: mysqld.pid };
    log(`  MySQL spawned, PID=${mysqld.pid}`);
    mysqld.unref();
    
    log('  Waiting 10 seconds for MySQL to start...');
    await sleep(10000);
    
    const portMatches = await checkPort(3306);
    summary.mysql.port3306 = portMatches;
    log(`  Port 3306 check: ${portMatches.length > 0 ? 'LISTENING' : 'NOT LISTENING'}`);
    portMatches.forEach(m => log(`    ${m.trim()}`));
    
    summary.mysql.logTail = tailFile(errPath, 10);
}

async function step4_startBackend() {
    log('Step 4: Start backend');
    const outPath = path.join(BACKEND_DIR, '_backend_final.out');
    const errPath = path.join(BACKEND_DIR, '_backend_final.err');
    const outFd = fs.openSync(outPath, 'w');
    const errFd = fs.openSync(errPath, 'w');
    
    const backend = spawn('node', ['src/index.js'], {
        cwd: BACKEND_DIR,
        stdio: ['ignore', outFd, errFd],
        env: process.env,
        detached: true
    });
    summary.backend = { pid: backend.pid };
    log(`  Backend spawned, PID=${backend.pid}`);
    backend.unref();
    
    log('  Waiting 12 seconds for backend to start...');
    await sleep(12000);
    
    const portMatches = await checkPort(4001);
    summary.backend.port4001 = portMatches;
    log(`  Port 4001 check: ${portMatches.length > 0 ? 'LISTENING' : 'NOT LISTENING'}`);
    portMatches.forEach(m => log(`    ${m.trim()}`));
    
    summary.backend.outTail = tailFile(outPath, 10);
    summary.backend.errTail = tailFile(errPath, 10);
}

async function step5_startFrontend() {
    log('Step 5: Start frontend');
    const outPath = path.join(FRONTEND_DIR, '_vite_final.out');
    const errPath = path.join(FRONTEND_DIR, '_vite_final.err');
    const outFd = fs.openSync(outPath, 'w');
    const errFd = fs.openSync(errPath, 'w');
    
    const frontend = spawn('npx.cmd', ['vite', '--port', '5173', '--host', '127.0.0.1'], {
        cwd: FRONTEND_DIR,
        stdio: ['ignore', outFd, errFd],
        env: process.env,
        detached: true
    });
    summary.frontend = { pid: frontend.pid };
    log(`  Frontend spawned, PID=${frontend.pid}`);
    frontend.unref();
    
    log('  Waiting 15 seconds for frontend to start...');
    await sleep(15000);
    
    const portMatches = await checkPort(5173);
    summary.frontend.port5173 = portMatches;
    log(`  Port 5173 check: ${portMatches.length > 0 ? 'LISTENING' : 'NOT LISTENING'}`);
    portMatches.forEach(m => log(`    ${m.trim()}`));
    
    summary.frontend.outTail = tailFile(outPath, 10);
    summary.frontend.errTail = tailFile(errPath, 10);
}

async function main() {
    try {
        await step1_cleanPids();
        await step2_copyAriaLog();
        await step3_startMysql();
        await step4_startBackend();
        await step5_startFrontend();
        
        summary.endTime = new Date().toISOString();
        const summaryPath = path.join(BACKEND_DIR, '_final_summary.json');
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        log(`Summary written to ${summaryPath}`);
        
        const reportPath = path.join(BACKEND_DIR, '_final_report.txt');
        const lines = [];
        lines.push('========== FINAL SUMMARY ==========');
        lines.push(`Started: ${summary.startTime}`);
        lines.push(`Ended:   ${summary.endTime}`);
        lines.push('');
        lines.push('--- Step 1: PID Files ---');
        lines.push(`Deleted: ${summary.pidFilesDeleted.length > 0 ? summary.pidFilesDeleted.join(', ') : 'none (no stale files)'}`);
        lines.push('');
        lines.push('--- Step 2: Aria Log ---');
        lines.push(`Source exists: ${summary.ariaLog.sourceExists}`);
        lines.push(`Dest exists before: ${summary.ariaLog.destExistsBefore}`);
        lines.push(`Copied: ${summary.ariaLog.copied}`);
        lines.push(`Dest exists after: ${summary.ariaLog.destExistsAfter}`);
        lines.push('');
        lines.push('--- Process IDs ---');
        lines.push(`MySQL PID:    ${summary.mysql.pid}`);
        lines.push(`Backend PID:  ${summary.backend.pid}`);
        lines.push(`Frontend PID: ${summary.frontend.pid}`);
        lines.push('');
        lines.push('--- Port Verification ---');
        lines.push(`Port 3306 (MySQL):    ${summary.mysql.port3306.length > 0 ? 'LISTENING ✅' : 'NOT LISTENING ❌'}`);
        summary.mysql.port3306.forEach(m => lines.push(`  ${m.trim()}`));
        lines.push(`Port 4001 (Backend):  ${summary.backend.port4001.length > 0 ? 'LISTENING ✅' : 'NOT LISTENING ❌'}`);
        summary.backend.port4001.forEach(m => lines.push(`  ${m.trim()}`));
        lines.push(`Port 5173 (Frontend): ${summary.frontend.port5173.length > 0 ? 'LISTENING ✅' : 'NOT LISTENING ❌'}`);
        summary.frontend.port5173.forEach(m => lines.push(`  ${m.trim()}`));
        lines.push('');
        lines.push('--- MySQL stderr (last 10 lines) ---');
        lines.push('File: _mysqld_final.err');
        summary.mysql.logTail.forEach(l => lines.push(`  ${l}`));
        lines.push('');
        lines.push('--- Backend stdout (last 10 lines) ---');
        lines.push('File: _backend_final.out');
        summary.backend.outTail.forEach(l => lines.push(`  ${l}`));
        lines.push('');
        lines.push('--- Backend stderr (last 10 lines) ---');
        lines.push('File: _backend_final.err');
        summary.backend.errTail.forEach(l => lines.push(`  ${l}`));
        lines.push('');
        lines.push('--- Frontend stdout (last 10 lines) ---');
        lines.push('File: _vite_final.out');
        summary.frontend.outTail.forEach(l => lines.push(`  ${l}`));
        lines.push('');
        lines.push('--- Frontend stderr (last 10 lines) ---');
        lines.push('File: _vite_final.err');
        summary.frontend.errTail.forEach(l => lines.push(`  ${l}`));
        lines.push('');
        lines.push('========== END SUMMARY ==========');
        
        fs.writeFileSync(reportPath, lines.join('\n'));
        log(`Report written to ${reportPath}`);
        process.exit(0);
    } catch (e) {
        log(`FATAL ERROR: ${e.message}\n${e.stack}`);
        try {
            fs.writeFileSync(path.join(BACKEND_DIR, '_final_summary.json'), JSON.stringify({ error: e.message, stack: e.stack, summary }, null, 2));
        } catch {}
        process.exit(1);
    }
}

main();
