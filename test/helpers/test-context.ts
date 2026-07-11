import { Context } from '../../src/filesystem/context.js';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';

export interface TestContext extends Context {
    readonly userId: string;
    cleanup(): Promise<void>;
}

/**
 * Creates an isolated test context backed by a temp SQLite database.
 * Call cleanup() in a finally block to remove the temp DB.
 */
export function createTestContext(userId?: string): TestContext {
    const id = userId ?? `test-${randomUUID()}`;
    const context = Context.getContext(id);

    return Object.assign(context, {
        userId: id,
        async cleanup() {
            // Clear all KV state for this user
            const file = await context.getCurrentFile();
            if (file) {
                try { await context.delete(file); } catch { /* ignore */ }
            }
            Context.contextCache.delete(id);

            const dbPath = `data/${id}.db`;
            try {
                if (existsSync(dbPath)) unlinkSync(dbPath);
            } catch {
                // ignore — might already be closed
            }
        }
    });
}
