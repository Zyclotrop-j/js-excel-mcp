/**
 * BUG-1: hydrate() not called on acquire() — standalone tool calls start with empty state.
 *
 * Root cause: VirtualFileSystem.acquire() creates a new VFS but never calls hydrate(),
 * so in-memory maps (memoryKV, memoryFiles, memoryExports) are empty.
 * Context.getContext() DOES call hydrate(), but only within a request context (AsyncLocalStorage).
 * When tool handlers call Context.getContext() during register(), if the async context from
 * createTestContext has already completed, the data written in one "request" is invisible to the next.
 *
 * This test simulates the cross-request scenario: write data, then simulate a fresh request
 * that should see the persisted data via hydrate().
 */
import { strict as assert } from 'node:assert';
import { VirtualFileSystem } from '../../src/filesystem/system.js';
import { existsSync, unlinkSync } from 'node:fs';
import { run } from '../../src/util/requestContext.js';
import { Context } from '../../src/filesystem/context.js';

const TEST_USER = 'bug1-hydrate-test';
const DB_PATH = `data/${TEST_USER}.db`;

function cleanup() {
    try {
        if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
    } catch { /* ignore */ }
}

export default function (test: any) {

test('BUG-1: acquire() now calls hydrate() automatically, restoring persisted state', async () => {
    cleanup();

    const vfs1 = await VirtualFileSystem.acquire(TEST_USER, false);

    await vfs1.remember('currentFile', 'test.xlsx');
    await vfs1.save('test.xlsx', new Uint8Array([1, 2, 3]));
    await vfs1.flush();
    await vfs1.release();

    const vfs2 = await VirtualFileSystem.acquire(TEST_USER, false);

    assert.equal(vfs2.memoryFiles.size, 1, 'memoryFiles should be restored by acquire() via hydrate()');
    assert.equal(vfs2.memoryKV.size, 2, 'memoryKV should be restored by acquire() via hydrate()');

    await vfs2.release();
    cleanup();
});

test('BUG-1: acquire() + hydrate() restores persisted state', async () => {
    cleanup();

    const vfs1 = await VirtualFileSystem.acquire(TEST_USER, false);
    await vfs1.hydrate();

    await vfs1.remember('currentFile', 'persisted.xlsx');
    await vfs1.save('persisted.xlsx', new Uint8Array([10, 20, 30]));
    await vfs1.flush();
    await vfs1.release();

    const vfs2 = await VirtualFileSystem.acquire(TEST_USER, false);
    await vfs2.hydrate();

    assert.equal(vfs2.memoryFiles.size, 1, 'memoryFiles should have 1 entry after hydrate()');
    assert.ok(vfs2.memoryFiles.has('persisted.xlsx'), 'persisted.xlsx should be in memoryFiles');

    const kvValue = await vfs2.recall('currentFile');
    assert.equal(kvValue, 'persisted.xlsx', 'currentFile KV should be restored after hydrate()');

    await vfs2.release();
    cleanup();
});

test('BUG-1: cross-request Context preserves sticky state via hydrate', async () => {
    cleanup();

    await run(async () => {
        const ctx1 = await Context.getContext(TEST_USER);
        await ctx1.setCurrentFile('sticky.xlsx');
        await ctx1.set('sticky.xlsx', new Uint8Array([1, 2, 3]));
        await ctx1.virtualFileSystem.release();
    });

    await run(async () => {
        const ctx2 = await Context.getContext(TEST_USER);
        const currentFile = await ctx2.getCurrentFile();
        assert.equal(currentFile, 'sticky.xlsx', 'currentFile should persist across requests via hydrate()');

        const files = await ctx2.list();
        assert.ok(files.includes('sticky.xlsx'), 'sticky.xlsx should be visible in new request context');

        await ctx2.virtualFileSystem.release();
    });

    cleanup();
});

test('BUG-1: WriteCoordinator pendingWrites do not bridge separate requests', async () => {
    cleanup();

    await run(async () => {
        const ctx1 = await Context.getContext(TEST_USER);
        await ctx1.setCurrentFile('bridge-test.xlsx');
        await ctx1.virtualFileSystem.flush();
        await ctx1.virtualFileSystem.release();
    });

    await run(async () => {
        const ctx2 = await Context.getContext(TEST_USER);
        const file = await ctx2.getCurrentFile();
        assert.equal(file, 'bridge-test.xlsx', 'KV state should survive across separate request contexts');
        await ctx2.virtualFileSystem.release();
    });

    cleanup();
});

}
