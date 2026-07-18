import { Context } from '../../src/filesystem/context.js';
import { VirtualFileSystem } from '../../src/filesystem/system.js';
import { getContext } from '../../src/util/requestContext.js';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';

export interface TestContext extends Context {
    readonly userId: string;
    cleanup(): Promise<void>;
    authInfo: { extra: { userId: string } };
}

/**
 * Creates an isolated test context backed by a temp SQLite database.
 *
 * MUST be called from inside a `run(async () => { ... })` block; it reads the
 * caller's `AsyncLocalStorage` store.
 *
 * Synchronously reserves a slot in the store (`reqCtx.context`) pointing at a
 * real `Context` instance whose `virtualFileSystem` is hydrated asynchronously.
 * This is the crux of why the helper exists:
 *
 *   `handler.register()` calls `await Context.getContext(userId)` — and
 *   `Context.getContext`'s cache check is `if (reqCtx.context) return
 *   reqCtx.context`. Without a SYNCHRONOUS pre-population, register's call
 *   would proceed to `VirtualFileSystem.acquire` a SECOND time for the same
 *   userid while the first acquire (still inside this helper's IIFE) holds the
 *   `WriteCoordinator` lock for the entire run-block. The second acquire queues
 *   behind the first and is never released within the same run-block, so the
 *   test hangs forever in `setup`.
 *
 * Mechanism:
 *   - We synchronously materialise a `Context` via `Object.create(Context
 *     .prototype)` (its constructor is otherwise unreachable for a not-yet-
 *     hydrated VFS) and stash it in `reqCtx.context`.
 *   - The IIFE then calls `VirtualFileSystem.acquire(id, false)` DIRECTLY,
 *     bypassing the cached `Context.getContext` path (which would return our
 *     stub). It assigns the hydrated VFS onto the same synced object — so all
 *     tool callbacks that captured `context` during `register()` see the live
 *     VFS once they execute.
 *
 * The returned `Promise<TestContext>` resolves to the SAME synced object after
 * hydrate completes. The promise is augmented synchronously with `.authInfo`
 * and `.cleanup()` so handlers can read `this.context.authInfo?.extra?.userId`
 * before the promise resolves and callers can de-orphan the VFS regardless of
 * whether they `await testContext` first.
 *
 * Multi-user note: a single run-block has only one `reqCtx.context` slot, so
 * the FIRST `createTestContext` owns the cache; subsequent calls for different
 * userids still acquire their own VFS (and return their own synced object via
 * the resolved promise), but `Context.getContext(<otherUserid>)` called from
 * `register()` will keep returning the first cached Context. Tests that need
 * per-user isolation must put each `createTestContext` inside its own `run()`
 * block (see auth-flow.test.ts).
 */
export function createTestContext(userId?: string): Promise<TestContext> {
    const id = userId ?? `test-${randomUUID()}`;

    // Throws if called outside a `run()` block.
    const reqCtx = getContext();

    // Build the synced Context synchronously. Object.create(Context.prototype)
    // skips the (vfs, userid) constructor; we hand-fill the slots register()
    // and the tool callbacks actually look at. `virtualFileSystem` is patched
    // in once the IIFE's `VirtualFileSystem.acquire` returns.
    const syncedCtx = Object.create(Context.prototype) as unknown as TestContext;
    syncedCtx.userId = id;
    syncedCtx.authInfo = { extra: { userId: id } };
    (syncedCtx as any).virtualFileSystem = null;

    // Reserve the cache slot BEFORE returning so any synchronous
    // `handler.register()` call in the same run-block hits this cached
    // Context instead of re-entering `VirtualFileSystem.acquire`.
    if (!reqCtx.context) {
        reqCtx.context = syncedCtx;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promise: any = (async () => {
        // Bypass `Context.getContext`'s cache check (which would return our
        // patched syncedCtx without acquiring a real VFS) by calling
        // `VirtualFileSystem.acquire` directly.
        const vfs = await VirtualFileSystem.acquire(id, false);
        (syncedCtx as any).virtualFileSystem = vfs;

        // Mirror what `Context.getContext` would have written so future code
        // that reads `reqCtx.virtualFileSystem` / `reqCtx.release` (if any)
        // sees consistent state.
        reqCtx.virtualFileSystem = vfs;
        reqCtx.release = async () => { await vfs.release(); };

        syncedCtx.cleanup = async function (this: TestContext) {
            // Clear all KV state for this user
            const file = await this.getCurrentFile();
            if (file) {
                try { await this.delete(file); } catch { /* ignore */ }
            }
            // release: flush + WriteCoordinator.releaseLock(id) + backend.close()
            await this.virtualFileSystem.release();

            const dbPath = `data/${id}.db`;
            try {
                if (existsSync(dbPath)) unlinkSync(dbPath);
            } catch {
                // ignore — might already be closed
            }
        };

        return syncedCtx;
    })();

    /* eslint-disable @typescript-eslint/no-explicit-any */
    // Augment the Promise synchronously so handlers can read `.authInfo`
    // before the promise resolves (e.g. `handler.context = testContext;`).
    promise.authInfo = { extra: { userId: id } };

    // Forward `.cleanup()` so callers can do `await (await testContext).cleanup()`
    // AND also `(testContext as any).cleanup()` directly.
    promise.cleanup = async () => {
        await promise;
        await (syncedCtx as TestContext).cleanup();
    };

    return promise as Promise<TestContext>;
}