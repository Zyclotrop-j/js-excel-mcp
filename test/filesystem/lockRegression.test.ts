/**
 * Regression tests for the "MCP calls time out after a while" bug.
 *
 * Root cause (see src/filesystem/writeCoordinator.ts + system.ts):
 *   1. The per-userid lock was a single promise that could let two same-userid
 *      requests run a `flush()` concurrently. Both did `DELETE FROM kv` then
 *      re-`INSERT`ed the same key set -> `UNIQUE constraint failed` (the error
 *      in the reported stack trace).
 *   2. `release()` ran `flush()` *before* `releaseLock()`. When `flush()` threw,
 *      the lock promise was never resolved, so every later `acquireLock(userid)`
 *      hung forever -> permanent -32001 timeouts.
 *
 * These tests guard both: no UNIQUE error / deadlock under concurrent releases,
 * and the lock is always released even if flush throws.
 */
import test from 'baretest';
import { strict as assert } from 'node:assert';
import { existsSync, unlinkSync } from 'node:fs';
import { DatabaseBackend } from '../../src/filesystem/databaseBackend.js';
import { VirtualFileSystem } from '../../src/filesystem/system.js';
import { WriteCoordinator } from '../../src/filesystem/writeCoordinator.js';

function deleteDb(userid: string) {
    const dbPath = `data/${userid}.db`;
    try {
        if (existsSync(dbPath)) unlinkSync(dbPath);
    } catch { /* ignore */ }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms)),
    ]);
}

/**
 * DatabaseBackend that counts/times inserts and can be told to throw on insert.
 * Each instance gets its own connection (release() closes it), so callers must
 * create a fresh instance per VirtualFileSystem. `recorder` lets multiple
 * instances share a single timing log for assertions.
 */
class InstrumentedBackend extends DatabaseBackend {
    insertKVCount = 0;
    throwOnInsert = false;
    private recorder?: (key: string) => void;

    constructor(dbPath: string, recorder?: (key: string) => void) {
        super(dbPath);
        this.recorder = recorder;
    }

    async insertOrReplaceKV(key: string, value: string, ttl: string): Promise<void> {
        this.insertKVCount++;
        this.recorder?.(key);
        if (this.throwOnInsert) throw new Error('SqliteError: UNIQUE constraint failed: kv.key');
        await super.insertOrReplaceKV(key, value, ttl);
    }
}

export default function (test: any) {
    const USER = 'lock-regression-user';

    test('lock regression: WriteCoordinator serializes same-userid acquires (FIFO, no lost wakeup)', async () => {
        deleteDb(USER);

        // First acquire holds the lock.
        await WriteCoordinator.acquireLock(USER);
        let secondResolved = false;
        const second = WriteCoordinator.acquireLock(USER).then(() => { secondResolved = true; });

        // A tiny yield: the second acquirer must still be waiting.
        await new Promise(r => setTimeout(r, 30));
        assert.equal(secondResolved, false, 'second acquire must not resolve while first holds lock');

        // Release -> hands the lock to the waiter.
        WriteCoordinator.releaseLock(USER);
        await withTimeout(second, 1000, 'second acquire should resolve after release');
        assert.equal(secondResolved, true, 'second acquire must resolve after release');

        // Clean up the lock fully.
        WriteCoordinator.releaseLock(USER);
        deleteDb(USER);
    });

    test('lock regression: concurrent release() for same userid does not throw UNIQUE or deadlock', async () => {
        deleteDb(USER);
        const N = 6;

        // Fire N concurrent requests for the SAME userid, each writing the SAME
        // key (the exact condition that produced the UNIQUE collision before the
        // mutex fix). They must serialize, complete, and leave the lock released.
        const results = await Promise.allSettled(
            Array.from({ length: N }, (_, i) =>
                (async () => {
                    const vfs = await VirtualFileSystem.acquire(USER, false);
                    await vfs.remember('sharedKey', `value-${i}`);
                    await vfs.release();
                    return i;
                })()
            )
        );

        for (const r of results) {
            assert.equal(r.status, 'fulfilled', `concurrent release should not throw or hang (${r.status})`);
        }

        // The lock must be free: a follow-up request for the same user resolves fast.
        const followup = await withTimeout(
            (async () => {
                const vfs = await VirtualFileSystem.acquire(USER, false);
                const value = await vfs.recall('sharedKey');
                await vfs.release();
                return value;
            })(),
            3000,
            'follow-up acquire should not hang (lock leaked?)'
        );
        assert.ok(typeof followup === 'string' && followup.startsWith('value-'), 'final state should be intact');

        deleteDb(USER);
    });

    test('lock regression: release() releases the lock even when flush() throws (no permanent timeout)', async () => {
        deleteDb(USER);
        const vfs = await VirtualFileSystem.acquire(USER, false);
        const instrumented = new InstrumentedBackend(`data/${USER}.db`);
        (vfs as any).backend = instrumented;
        instrumented.throwOnInsert = true;

        // release() must propagate the flush error (so callers can react), but the
        // lock MUST still be released in its `finally` block.
        let threw = false;
        try {
            await vfs.remember('sharedKey', 'value1');
            await vfs.release();
        } catch (e) {
            threw = true;
            assert.match((e as Error).message, /UNIQUE constraint failed/, 'flush error should propagate');
        }
        assert.equal(threw, true, 'flush error should propagate out of release()');

        // The lock is released -> a brand new request for the same user works.
        const followup = await withTimeout(
            (async () => {
                const vfs2 = await VirtualFileSystem.acquire(USER, false);
                const instrumented2 = new InstrumentedBackend(`data/${USER}.db`);
                (vfs2 as any).backend = instrumented2;
                instrumented2.throwOnInsert = false;
                await vfs2.remember('sharedKey', 'recovered');
                await vfs2.release();
                return true;
            })(),
            3000,
            'request after a failed flush should not hang (lock leaked?)'
        );
        assert.equal(followup, true, 'user should recover after a flush failure');

        deleteDb(USER);
    });

    test('lock regression: 1s write throttle per key+user still holds across overlapping releases', async () => {
        deleteDb(USER);
        // Shared recorder so both (separate) backend instances log their inserts.
        const sharedKeyInsertTimes: number[] = [];
        const recorder = (key: string) => { if (key === 'sharedKey') sharedKeyInsertTimes.push(Date.now()); };

        const doRelease = async (value: string) => {
            const vfs = await VirtualFileSystem.acquire(USER, false);
            (vfs as any).backend = new InstrumentedBackend(`data/${USER}.db`, recorder);
            await vfs.remember('sharedKey', value);
            await vfs.release();
        };

        // Two same-userid releases writing the same key, fired "concurrently".
        // With the mutex they serialize; the rate limiter must still throttle the
        // second insert of `sharedKey` to >= ~1s after the first.
        await Promise.all([doRelease('a'), doRelease('b')]);

        assert.ok(sharedKeyInsertTimes.length >= 2, 'sharedKey should be written by both releases');
        const [t1, t2] = sharedKeyInsertTimes;
        const gap = t2 - t1;
        assert.ok(gap >= 900, `same key+user writes should be throttled to ~1s apart (got ${gap}ms)`);

        deleteDb(USER);
    });
}
