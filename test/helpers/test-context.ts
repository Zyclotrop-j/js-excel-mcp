import { Context } from '../../src/filesystem/context.js';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { run } from '../../src/util/requestContext.js';

export interface TestContext extends Context {
    readonly userId: string;
    cleanup(): Promise<void>;
}

/**
 * Creates an isolated test context backed by a temp SQLite database.
 * Call cleanup() in a finally block to remove the temp DB.
 */
export async function createTestContext(userId?: string): Promise<TestContext> {
    const id = userId ?? `test-${randomUUID()}`;

    const ctx = await run(async () => await Context.getContext(id));

    return Object.assign(ctx, {
        userId: id,
        async cleanup() {
            // Clear all KV state for this user
            const file = await ctx.getCurrentFile();
            if (file) {
                try { await ctx.delete(file); } catch { /* ignore */ }
            }
            await ctx.virtualFileSystem.release();

            const dbPath = `data/${id}.db`;
            try {
                if (existsSync(dbPath)) unlinkSync(dbPath);
            } catch {
                // ignore — might already be closed
            }
        }
    });
}