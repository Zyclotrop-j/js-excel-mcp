import { Context } from '../../src/filesystem/context.js';
import { existsSync, readdirSync, unlinkSync, rmSync } from 'node:fs';

/**
 * Remove all test contexts from the cache and delete their DB files.
 */
export function cleanupAllContexts(): void {
    for (const [key] of Context.contextCache) {
        const dbPath = `data/${key}.db`;
        try {
            if (existsSync(dbPath)) unlinkSync(dbPath);
        } catch { /* ignore */ }
    }
    Context.contextCache.clear();
}

/**
 * Remove all test DB files matching a pattern.
 */
export function cleanupTestDbs(pattern: RegExp = /^test-/): void {
    try {
        const files = readdirSync('data');
        for (const file of files) {
            if (pattern.test(file)) {
                rmSync(`data/${file}`, { force: true });
            }
        }
    } catch { /* ignore */ }
}
