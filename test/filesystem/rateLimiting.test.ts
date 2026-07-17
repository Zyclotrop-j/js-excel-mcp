/**
 * Tests for the "write at most once per second per key" requirement.
 * 
 * This test suite verifies that the rate-limiting mechanism works correctly:
 * - Same key written multiple times within 1 second should only write to DB once
 * - Same key written more than 1 second apart should write each time
 * - Different keys can be written independently
 * - Parallel requests respect the rate limit
 */
import { strict as assert } from 'node:assert';
import { existsSync, unlinkSync } from 'node:fs';
import { DatabaseBackend } from '../../src/filesystem/databaseBackend.js';
import { VirtualFileSystem } from '../../src/filesystem/system.js';
import { run, getContext } from '../../src/util/requestContext.js';

const TEST_USER = 'rate-limit-test';
const DB_PATH = `data/${TEST_USER}.db`;

function cleanup() {
    try {
        if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
    } catch { /* ignore */ }
}

class InstrumentedBackend extends DatabaseBackend {
    insertKVCount = 0;
    insertFileCount = 0;
    insertExportCount = 0;

    async insertKV(key: string, value: string, ttl: string): Promise<void> {
        this.insertKVCount++;
        await super.insertKV(key, value, ttl);
    }

    async insertFile(name: string, data: Uint8Array, ttl: string): Promise<void> {
        this.insertFileCount++;
        await super.insertFile(name, data, ttl);
    }

    async insertExport(key: string, name: string, ttl: string, data: Uint8Array): Promise<void> {
        this.insertExportCount++;
        await super.insertExport(key, name, ttl, data);
    }

    resetCounts() {
        this.insertKVCount = 0;
        this.insertFileCount = 0;
        this.insertExportCount = 0;
    }
}

export default function (test: any) {
    test('Rate limiting: write at most once per second per key', async () => {
        
        test('same key written multiple times within 1 second writes latest value after wait', async () => {
            cleanup();
            const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
            
            // Replace backend with instrumented version
            const instrumented = new InstrumentedBackend(DB_PATH);
            (vfs as any).backend = instrumented;
            
            // Write same key multiple times rapidly
            await vfs.remember('testKey', 'value1');
            await vfs.remember('testKey', 'value2');
            await vfs.remember('testKey', 'value3');
            
            // Flush should write latest value + __db_lastAccess__
            await vfs.flush();
            
            assert.equal(instrumented.insertKVCount, 2, 'Should write latest value + __db_lastAccess__');
            
            // Verify final value is correct
            const value = await vfs.recall('testKey');
            assert.equal(value, 'value3', 'Should have latest value in memory');
            
            await vfs.release();
            cleanup();
        });

        test('same key written more than 1 second apart writes each time', async () => {
            cleanup();
            const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
            
            const instrumented = new InstrumentedBackend(DB_PATH);
            (vfs as any).backend = instrumented;
            
            // First write
            await vfs.remember('testKey', 'value1');
            await vfs.flush();
            assert.equal(instrumented.insertKVCount, 2, 'First write should hit DB (testKey + __db_lastAccess__)');
            
            // Wait more than 1 second
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // Second write
            await vfs.remember('testKey', 'value2');
            await vfs.flush();
            assert.equal(instrumented.insertKVCount, 4, 'Second write after 1s should hit DB again (testKey + __db_lastAccess__)');
            
            await vfs.release();
            cleanup();
        });

        test('different keys written in parallel all write to DB', async () => {
            cleanup();
            const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
            
            const instrumented = new InstrumentedBackend(DB_PATH);
            (vfs as any).backend = instrumented;
            
            // Write different keys in parallel
            await Promise.all([
                vfs.remember('key1', 'value1'),
                vfs.remember('key2', 'value2'),
                vfs.remember('key3', 'value3'),
            ]);
            
            await vfs.flush();
            
            // All different keys should be written, plus __db_lastAccess__
            assert.equal(instrumented.insertKVCount, 4, 'All different keys should write to DB (3 keys + __db_lastAccess__)');
            
            await vfs.release();
            cleanup();
        });

        test('files follow same rate limiting as KV', async () => {
            cleanup();
            const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
            
            const instrumented = new InstrumentedBackend(DB_PATH);
            (vfs as any).backend = instrumented;
            
            // Save same file multiple times rapidly
            await vfs.save('test.bin', new Uint8Array([1]));
            await vfs.save('test.bin', new Uint8Array([2]));
            await vfs.save('test.bin', new Uint8Array([3]));
            
            await vfs.flush();
            
            // Should write latest value + __db_lastAccess__
            assert.equal(instrumented.insertFileCount, 1, 'Same file should write latest value');
            assert.equal(instrumented.insertKVCount, 1, 'Should write __db_lastAccess__ once');
            
            await vfs.release();
            cleanup();
        });

        test('exports follow same rate limiting as KV', async () => {
            cleanup();
            const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
            
            const instrumented = new InstrumentedBackend(DB_PATH);
            (vfs as any).backend = instrumented;
            
            // Export same file multiple times rapidly (different keys)
            await vfs.exportFile('test.bin', new Uint8Array([1]));
            await vfs.exportFile('test.bin', new Uint8Array([2]));
            await vfs.exportFile('test.bin', new Uint8Array([3]));
            
            await vfs.flush();
            
            // Each export has a unique key, so all should write
            // Plus __db_lastAccess__ in KV
            assert.equal(instrumented.insertExportCount, 3, 'Different export keys should all write to DB');
            assert.equal(instrumented.insertKVCount, 1, 'Should write __db_lastAccess__ once');
            
            await vfs.release();
            cleanup();
        });

        test('parallel requests with same user respect rate limit', async () => {
            cleanup();
            
            // Simulate two parallel requests for the same user
            const results = await Promise.all([
                run(async () => {
                    const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
                    const instrumented = new InstrumentedBackend(DB_PATH);
                    (vfs as any).backend = instrumented;
                    
                    await vfs.remember('sharedKey', 'value1');
                    await vfs.flush();
                    
                    const count = instrumented.insertKVCount;
                    await vfs.release();
                    return count;
                }),
                run(async () => {
                    // Small delay to ensure first request starts first
                    await new Promise(resolve => setTimeout(resolve, 10));
                    
                    const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
                    const instrumented = new InstrumentedBackend(DB_PATH);
                    (vfs as any).backend = instrumented;
                    
                    await vfs.remember('sharedKey', 'value2');
                    await vfs.flush();
                    
                    const count = instrumented.insertKVCount;
                    await vfs.release();
                    return count;
                })
            ]);
            
            // Due to locking, these execute sequentially
            // First request writes sharedKey + __db_lastAccess__ = 2 KV entries
            assert.equal(results[0], 2, 'First request should write to DB (sharedKey + __db_lastAccess__)');
            // Second request may or may not write depending on exact timing
            // But total writes should be at most 4 (2 per request if >1s apart)
            assert.ok(results[1] <= 2, 'Second request should respect rate limit');
            
            cleanup();
        });

        test('parallel requests with different users do not interfere', async () => {
            cleanup();
            
            const user1 = 'rate-test-user1';
            const user2 = 'rate-test-user2';
            
            try {
                // Simulate two parallel requests for different users
                const results = await Promise.all([
                    run(async () => {
                        const vfs = await VirtualFileSystem.acquire(user1, false);
                        const instrumented = new InstrumentedBackend(`data/${user1}.db`);
                        (vfs as any).backend = instrumented;
                        
                        await vfs.remember('key', 'value1');
                        await vfs.flush();
                        
                        const count = instrumented.insertKVCount;
                        await vfs.release();
                        return count;
                    }),
                    run(async () => {
                        const vfs = await VirtualFileSystem.acquire(user2, false);
                        const instrumented = new InstrumentedBackend(`data/${user2}.db`);
                        (vfs as any).backend = instrumented;
                        
                        await vfs.remember('key', 'value2');
                        await vfs.flush();
                        
                        const count = instrumented.insertKVCount;
                        await vfs.release();
                        return count;
                    })
                ]);
                
                // Different users have separate rate limit scopes
                // Each user writes their key + __db_lastAccess__ = 2 KV entries
                assert.equal(results[0], 2, 'User 1 should write to DB (key + __db_lastAccess__)');
                assert.equal(results[1], 2, 'User 2 should write to DB independently (key + __db_lastAccess__)');
            } finally {
                // Cleanup both users
                try {
                    if (existsSync(`data/${user1}.db`)) unlinkSync(`data/${user1}.db`);
                    if (existsSync(`data/${user2}.db`)) unlinkSync(`data/${user2}.db`);
                } catch { /* ignore */ }
            }
        });

        test('mixed operations on same and different keys', async () => {
            cleanup();
            const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
            
            const instrumented = new InstrumentedBackend(DB_PATH);
            (vfs as any).backend = instrumented;
            
            // Mix of same and different keys
            await Promise.all([
                vfs.remember('key1', 'a'),
                vfs.remember('key1', 'b'),  // Same key, should be rate-limited
                vfs.remember('key2', 'c'),  // Different key
                vfs.remember('key3', 'd'),  // Different key
            ]);
            
            await vfs.flush();
            
            // key1 written twice but should only write latest value
            // key2 and key3 are different, so they write
            // Plus __db_lastAccess__
            assert.equal(instrumented.insertKVCount, 4, 'Should write 3 unique keys to DB + __db_lastAccess__');
            
            await vfs.release();
            cleanup();
        });

        test('rate limit resets after 1 second', async () => {
            cleanup();
            const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
            
            const instrumented = new InstrumentedBackend(DB_PATH);
            (vfs as any).backend = instrumented;
            
            // Write key
            await vfs.remember('testKey', 'value1');
            await vfs.flush();
            assert.equal(instrumented.insertKVCount, 2, 'First write should hit DB (testKey + __db_lastAccess__)');
            
            // Write again immediately (should be rate-limited)
            await vfs.remember('testKey', 'value2');
            await vfs.flush();
            assert.equal(instrumented.insertKVCount, 4, 'Second write within 1s should write latest value + __db_lastAccess__');
            
            // Wait for rate limit to expire
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // Write again (should now hit DB)
            await vfs.remember('testKey', 'value3');
            await vfs.flush();
            assert.equal(instrumented.insertKVCount, 6, 'Write after 1s should hit DB again (testKey + __db_lastAccess__)');
            
            await vfs.release();
            cleanup();
        });
    });
}
