import { existsSync, readdirSync, unlinkSync, rmSync } from 'node:fs';

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