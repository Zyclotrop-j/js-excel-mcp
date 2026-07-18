import { existsSync, unlinkSync } from 'node:fs';
import { DatabaseBackend } from './src/filesystem/databaseBackend.js';
import { VirtualFileSystem } from './src/filesystem/system.js';
import { WriteCoordinator } from './src/filesystem/writeCoordinator.js';

const USER = 'rate-limit-test';
const DB = `data/${USER}.db`;

function cleanup() {
    (WriteCoordinator as any).pendingWrites.clear();
    (WriteCoordinator as any).lastWriteTimestamps.clear();
    try { if (existsSync(DB)) unlinkSync(DB); } catch (e) { console.log('unlink FAILED:', (e as Error).code); }
}

async function run(label: string, fn: () => Promise<void>) {
    cleanup();
    console.log(`--- ${label} ---`);
    await fn();
}

// test 1
await run('test1', async () => {
    const vfs = await VirtualFileSystem.acquire(USER, false);
    const b: any = new DatabaseBackend(DB); (vfs as any).backend = b;
    b.insertOrReplaceKV = async (k: string) => { console.log('  T1 insert', k); await DatabaseBackend.prototype.insertOrReplaceKV.call(b, k, 'x', '9999'); };
    await vfs.remember('testKey', 'value1');
    await vfs.remember('testKey', 'value2');
    await vfs.remember('testKey', 'value3');
    await vfs.flush();
    await vfs.release();
});

// test 2
await run('test2', async () => {
    const vfs = await VirtualFileSystem.acquire(USER, false);
    const b: any = new DatabaseBackend(DB); (vfs as any).backend = b;
    b.insertOrReplaceKV = async (k: string) => { console.log('  T2 insert', k); await DatabaseBackend.prototype.insertOrReplaceKV.call(b, k, 'x', '9999'); };
    await vfs.remember('testKey', 'value1');
    await vfs.flush();
    await new Promise(r => setTimeout(r, 1100));
    await vfs.remember('testKey', 'value2');
    await vfs.flush();
    await vfs.release();
});

// test 3
await run('test3', async () => {
    const vfs = await VirtualFileSystem.acquire(USER, false);
    const b: any = new DatabaseBackend(DB); (vfs as any).backend = b;
    let count = 0;
    b.insertOrReplaceKV = async (k: string) => { count++; await DatabaseBackend.prototype.insertOrReplaceKV.call(b, k, 'x', '9999'); };
    await Promise.all([vfs.remember('key1','v1'), vfs.remember('key2','v2'), vfs.remember('key3','v3')]);
    console.log('  T3 memoryKV keys:', [...vfs.memoryKV.keys()]);
    await vfs.flush();
    console.log('  T3 insertKVCount =', count, '(expected 4)');
    await vfs.release();
});
