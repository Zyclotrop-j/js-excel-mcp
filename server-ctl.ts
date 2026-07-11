import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const WORKDIR = path.resolve(import.meta.dirname);
const PID_FILE = path.join(WORKDIR, '.server-pid');
const cmd = 'npx';
const args = ['tsx', 'src/index.ts'];

function start() {
    if (fs.existsSync(PID_FILE)) {
        const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
        try { process.kill(oldPid, 0); console.log(`already running (pid ${oldPid})`); return; }
        catch { fs.unlinkSync(PID_FILE); }
    }
    const child = spawn(cmd, args, { cwd: WORKDIR, detached: true, shell: true, stdio: 'ignore' });
    child.unref();
    fs.writeFileSync(PID_FILE, String(child.pid));
    console.log(`server starting (pid ${child.pid})`);
}

function stop() {
    if (!fs.existsSync(PID_FILE)) { console.log('not running'); return; }
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    try {
        process.kill(pid, 'SIGTERM');
        console.log(`sent SIGTERM to pid ${pid}`);
    } catch { console.log(`pid ${pid} not alive`); }
    try { fs.unlinkSync(PID_FILE); } catch { /* */ }
}

function restart() {
    stop();
    setTimeout(start, 1000);
}

const arg = process.argv[2];
if (arg === 'start') start();
else if (arg === 'stop') stop();
else if (arg === 'restart') restart();
else { start(); }