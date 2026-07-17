/**
 * Implementation-agnostic tests for IDatabaseBackend interface.
 * 
 * These tests verify the contract defined in IDatabaseBackend.ts.
 * Any implementation of the interface should pass these tests.
 */
import { strict as assert } from 'node:assert';
import { existsSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IDatabaseBackend } from '../../src/filesystem/IDatabaseBackend.js';

type BackendFactory = (dbPath: string) => IDatabaseBackend;

function cleanup(dbPath: string) {
    try {
        if (existsSync(dbPath)) unlinkSync(dbPath);
    } catch { /* ignore */ }
}

export default function (test: any, name: string, factory: BackendFactory) {
    const p = (t: string) => `${name} — ${t}`;

    test(p('constructor creates database file and schema'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        
        // MemoryBackend is in-memory only — no file on disk
        if (name === 'DatabaseBackend') {
            assert.ok(existsSync(dbPath), 'Database file should exist');
        }
        
        const kv = await backend.selectAllKV();
        const files = await backend.selectAllFiles();
        const exports = await backend.selectAllExports();
        
        assert.ok(Array.isArray(kv), 'selectAllKV should return an array');
        assert.ok(Array.isArray(files), 'selectAllFiles should return an array');
        assert.ok(Array.isArray(exports), 'selectAllExports should return an array');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('insertKV and selectAllKV round-trip'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.insertKV('key1', 'value1', ttl);
        await backend.insertKV('key2', 'value2', ttl);
        
        const result = await backend.selectAllKV();
        
        assert.equal(result.length, 2, 'Should have 2 entries');
        assert.ok(result.some(r => r.key === 'key1' && r.value === 'value1'), 'Should contain key1');
        assert.ok(result.some(r => r.key === 'key2' && r.value === 'value2'), 'Should contain key2');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('insertFile and selectAllFiles round-trip'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        
        await backend.insertFile('file1.bin', data, ttl);
        
        const result = await backend.selectAllFiles();
        
        assert.equal(result.length, 1, 'Should have 1 file');
        assert.equal(result[0].name, 'file1.bin', 'Filename should match');
        assert.deepEqual(new Uint8Array(result[0].data), data, 'Data should match');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('insertExport and selectAllExports round-trip'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        const data = new Uint8Array([10, 20, 30]);
        
        await backend.insertExport('export-key', 'export.bin', ttl, data);
        
        const result = await backend.selectAllExports();
        
        assert.equal(result.length, 1, 'Should have 1 export');
        assert.equal(result[0].key, 'export-key', 'Key should match');
        assert.equal(result[0].name, 'export.bin', 'Name should match');
        assert.deepEqual(new Uint8Array(result[0].data), data, 'Data should match');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('deleteAllKV clears all KV entries'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.insertKV('key1', 'value1', ttl);
        await backend.insertKV('key2', 'value2', ttl);
        
        const beforeDelete = await backend.selectAllKV();
        assert.equal(beforeDelete.length, 2, 'Should have 2 entries before delete');
        
        await backend.deleteAllKV();
        
        const afterDelete = await backend.selectAllKV();
        assert.equal(afterDelete.length, 0, 'Should have 0 entries after delete');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('deleteAllFiles clears all file entries'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.insertFile('file1.bin', new Uint8Array([1]), ttl);
        await backend.insertFile('file2.bin', new Uint8Array([2]), ttl);
        
        const beforeDeleteFiles = await backend.selectAllFiles();
        assert.equal(beforeDeleteFiles.length, 2, 'Should have 2 files before delete');
        
        await backend.deleteAllFiles();
        
        const afterDeleteFiles = await backend.selectAllFiles();
        assert.equal(afterDeleteFiles.length, 0, 'Should have 0 files after delete');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('deleteAllExports clears all export entries'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.insertExport('key1', 'file1.bin', ttl, new Uint8Array([1]));
        await backend.insertExport('key2', 'file2.bin', ttl, new Uint8Array([2]));
        
        const beforeDeleteExports = await backend.selectAllExports();
        assert.equal(beforeDeleteExports.length, 2, 'Should have 2 exports before delete');
        
        await backend.deleteAllExports();
        
        const afterDeleteExports = await backend.selectAllExports();
        assert.equal(afterDeleteExports.length, 0, 'Should have 0 exports after delete');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('insertOrReplaceKV replaces existing entry'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl1 = new Date(Date.now() + 60000).toISOString();
        const ttl2 = new Date(Date.now() + 120000).toISOString();
        
        await backend.insertOrReplaceKV('key1', 'value1', ttl1);
        await backend.insertOrReplaceKV('key1', 'value2', ttl2);
        
        const result = await backend.selectAllKV();
        
        assert.equal(result.length, 1, 'Should have 1 entry after replace');
        assert.equal(result[0].value, 'value2', 'Value should be replaced');
        assert.equal(result[0].ttl, ttl2, 'TTL should be replaced');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('insertOrReplaceFile replaces existing entry'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.insertOrReplaceFile('file.bin', new Uint8Array([1, 2, 3]), ttl);
        await backend.insertOrReplaceFile('file.bin', new Uint8Array([4, 5, 6]), ttl);
        
        const result = await backend.selectAllFiles();
        
        assert.equal(result.length, 1, 'Should have 1 file after replace');
        assert.deepEqual(new Uint8Array(result[0].data), new Uint8Array([4, 5, 6]), 'Data should be replaced');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('selectFileTTL returns TTL for existing file'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.insertFile('file.bin', new Uint8Array([1]), ttl);
        
        const result = await backend.selectFileTTL('file.bin');
        
        assert.ok(result, 'Should return result for existing file');
        assert.equal(result!.ttl, ttl, 'TTL should match');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('selectFileTTL returns undefined for non-existent file'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        
        const result = await backend.selectFileTTL('nonexistent.bin');
        
        assert.equal(result, undefined, 'Should return undefined for non-existent file');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('selectKVTTL returns TTL for existing key'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.insertKV('key1', 'value1', ttl);
        
        const result = await backend.selectKVTTL('key1');
        
        assert.ok(result, 'Should return result for existing key');
        assert.equal(result!.ttl, ttl, 'TTL should match');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('selectKVTTL returns undefined for non-existent key'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        
        const result = await backend.selectKVTTL('nonexistent');
        
        assert.equal(result, undefined, 'Should return undefined for non-existent key');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('selectKVValue returns value for existing key'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.insertKV('key1', 'value1', ttl);
        
        const result = await backend.selectKVValue('key1');
        
        assert.ok(result, 'Should return result for existing key');
        assert.equal(result!.value, 'value1', 'Value should match');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('selectKVValue returns undefined for non-existent key'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        
        const result = await backend.selectKVValue('nonexistent');
        
        assert.equal(result, undefined, 'Should return undefined for non-existent key');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('transaction commits on success'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        await backend.transaction(async () => {
            await backend.insertKV('key1', 'value1', ttl);
            await backend.insertKV('key2', 'value2', ttl);
        });
        
        const result = await backend.selectAllKV();
        
        assert.equal(result.length, 2, 'Should have 2 entries after successful transaction');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('transaction rolls back on error'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        const ttl = new Date(Date.now() + 60000).toISOString();
        
        try {
            await backend.transaction(async () => {
                await backend.insertKV('key1', 'value1', ttl);
                throw new Error('Test error');
            });
        } catch (e) {
            // Expected
        }
        
        const result = await backend.selectAllKV();
        
        assert.equal(result.length, 0, 'Should have 0 entries after failed transaction');
        
        await backend.close();
        cleanup(dbPath);
    });

    test(p('close is idempotent'), async () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'db-backend-test-'));
        const dbPath = join(tempDir, 'test.db');
        cleanup(dbPath);
        
        const backend = factory(dbPath);
        
        // Should not throw
        await backend.close();
        await backend.close();
        await backend.close();
        
        cleanup(dbPath);
    });
}
