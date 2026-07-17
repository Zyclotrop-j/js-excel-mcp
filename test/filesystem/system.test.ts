/**
 * Unit tests for VirtualFileSystem.
 */
import { strict as assert } from 'node:assert';
import { VirtualFileSystem } from '../../src/filesystem/system.js';
import { existsSync, unlinkSync } from 'node:fs';

const TEST_USER = 'vfs-unit-test';
const DB_PATH = `data/${TEST_USER}.db`;

const EXTRA_DBS = ['_auth'];

function cleanup() {
    for (const name of [TEST_USER, ...EXTRA_DBS]) {
        try {
            const p = `data/${name}.db`;
            if (existsSync(p)) unlinkSync(p);
        } catch { /* ignore */ }
    }
}

async function closeAndCleanup(vfs: VirtualFileSystem) {
    await vfs.close();
    cleanup();
}

export default function (test: any) {
    test('constructor creates database file', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        assert.ok(existsSync(DB_PATH), 'Database file should exist');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('constructor validates userId first character', async () => {
        await assert.rejects(
            async () => await VirtualFileSystem.acquire('123invalid', false),
            /All collections must start with a-z/,
            'Should reject userId starting with number'
        );
    });

    test('save and load round-trip', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        
        await vfs.save('test.bin', data);
        const loaded = await vfs.load('test.bin');
        
        assert.deepEqual(loaded, data, 'Loaded data should match saved data');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('save overwrites existing file', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await vfs.save('test.bin', new Uint8Array([1, 2, 3]));
        await vfs.save('test.bin', new Uint8Array([4, 5, 6]));
        const loaded = await vfs.load('test.bin');
        
        assert.deepEqual(loaded, new Uint8Array([4, 5, 6]), 'Should overwrite existing file');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('load throws on missing file', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await assert.rejects(
            async () => await vfs.load('nonexistent.bin'),
            /File not found/,
            'Should throw when loading missing file'
        );
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('delete removes file', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await vfs.save('test.bin', new Uint8Array([1, 2, 3]));
        await vfs.delete('test.bin');
        
        await assert.rejects(
            async () => await vfs.load('test.bin'),
            /File not found/,
            'File should be deleted'
        );
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('list returns all files', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await vfs.save('file1.bin', new Uint8Array([1]));
        await vfs.save('file2.bin', new Uint8Array([2]));
        await vfs.save('file3.bin', new Uint8Array([3]));
        
        const files = await vfs.list();
        assert.deepEqual(files.sort(), ['file1.bin', 'file2.bin', 'file3.bin']);
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('remember and recall round-trip', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await vfs.remember('key1', 'value1');
        const value = await vfs.recall('key1');
        
        assert.equal(value, 'value1');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('recall returns null for missing key', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        const value = await vfs.recall('nonexistent');
        assert.equal(value, null);
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('remember overwrites existing value', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await vfs.remember('key1', 'value1');
        await vfs.remember('key1', 'value2');
        const value = await vfs.recall('key1');
        
        assert.equal(value, 'value2');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('erase removes key', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await vfs.remember('key1', 'value1');
        await vfs.erase('key1');
        const value = await vfs.recall('key1');
        
        assert.equal(value, null);
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('erasePrefix removes keys matching prefix', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await vfs.remember('currentSheet-file1', 'sheet1');
        await vfs.remember('currentSheet-file2', 'sheet2');
        await vfs.remember('otherKey', 'other');
        
        await vfs.erasePrefix('currentSheet-');
        
        const sheet1 = await vfs.recall('currentSheet-file1');
        const sheet2 = await vfs.recall('currentSheet-file2');
        const other = await vfs.recall('otherKey');
        
        assert.equal(sheet1, null);
        assert.equal(sheet2, null);
        assert.equal(other, 'other');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('withTransaction commits on success', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await vfs.withTransaction(() => {
            vfs.remember('key1', 'value1');
            vfs.remember('key2', 'value2');
        });
        
        const value1 = await vfs.recall('key1');
        const value2 = await vfs.recall('key2');
        
        assert.equal(value1, 'value1');
        assert.equal(value2, 'value2');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('exportFile creates export with TTL', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        const data = new Uint8Array([10, 20, 30]);
        
        const { key, ttl } = await vfs.exportFile('export.bin', data);
        
        assert.ok(key.length > 0, 'Key should be generated');
        assert.ok(ttl, 'TTL should be set');
        assert.ok(new Date(ttl) > new Date(), 'TTL should be in the future');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('importFile retrieves exported file', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        const data = new Uint8Array([10, 20, 30]);
        
        const { key } = await vfs.exportFile('export.bin', data);
        const result = await vfs.importFile('export.bin', key);
        
        assert.deepEqual(result.data, data, 'Imported data should match exported data');
        assert.ok(result.expiresAt instanceof Date, 'Should have expiresAt date');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('importFile throws on missing export', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        
        await assert.rejects(
            async () => await vfs.importFile('nonexistent.bin', 'fake-key'),
            /Export not found/,
            'Should throw when export not found'
        );
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('importFile throws on wrong key', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        const data = new Uint8Array([10, 20, 30]);
        
        await vfs.exportFile('export.bin', data);
        
        await assert.rejects(
            async () => await vfs.importFile('export.bin', 'wrong-key'),
            /Export not found/,
            'Should throw when key is wrong'
        );
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('systemCollection allows numeric first char', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire('_shared', true);
        assert.ok(vfs, 'System collection should be created');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('purgeExpired removes expired rows from all tables', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        const pastTtl = new Date(Date.now() - 60_000).toISOString();
        await vfs.backend.insertOrReplaceFile('file.bin', new Uint8Array([1]), pastTtl);
        await vfs.backend.insertOrReplaceKV('somekey', 'x', pastTtl);
        await vfs.backend.insertExport('export.bin', 'k', pastTtl, new Uint8Array([1]));
        await vfs.hydrate();
        const purged = await vfs.purgeExpired();
        assert.equal(purged, 3, 'Should purge one row from each table');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('purgeExpired keeps non-expired rows', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        const futureTtl = new Date(Date.now() + 60_000).toISOString();
        await vfs.backend.insertExport('test.bin', 'k', futureTtl, new Uint8Array([1, 2, 3]));
        await vfs.hydrate();
        const purged = await vfs.purgeExpired();
        assert.equal(purged, 0, 'Should not purge non-expired rows');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('load renews file TTL', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        await vfs.save('test.bin', new Uint8Array([1]));
        await vfs.flush();
        const rowAfterSave = await vfs.backend.selectFileTTL('test.bin');
        const ttlAfterSave = new Date(rowAfterSave!.ttl).getTime();
        await new Promise(r => setTimeout(r, 10));
        await vfs.load('test.bin');
        await vfs.flush();
        const rowAfterLoad = await vfs.backend.selectFileTTL('test.bin');
        const ttlAfterLoad = new Date(rowAfterLoad!.ttl).getTime();
        assert.ok(ttlAfterLoad >= ttlAfterSave, 'Load should not decrease TTL');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('recall renews kv TTL', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        await vfs.remember('key1', 'value1');
        await vfs.flush();
        const rowAfterSave = await vfs.backend.selectKVTTL('key1');
        const ttlAfterSave = new Date(rowAfterSave!.ttl).getTime();
        await new Promise(r => setTimeout(r, 10));
        await vfs.recall('key1');
        await vfs.flush();
        const rowAfterRecall = await vfs.backend.selectKVTTL('key1');
        const ttlAfterRecall = new Date(rowAfterRecall!.ttl).getTime();
        assert.ok(ttlAfterRecall >= ttlAfterSave, 'Recall should not decrease TTL');
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('importFile throws on expired export', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        const key = 'test-key';
        const pastTtl = new Date(Date.now() - 60_000).toISOString();
        await vfs.backend.insertExport(key, 'test.bin', pastTtl, new Uint8Array([1, 2, 3]));
        await vfs.hydrate();
        await assert.rejects(
            async () => await vfs.importFile('test.bin', key),
            /Export expired/,
            'Should throw when export is expired'
        );
        await vfs.release();
        await closeAndCleanup(vfs);
    });

    test('every operation updates lastAccess', async () => {
        cleanup();
        const vfs = await VirtualFileSystem.acquire(TEST_USER, false);
        await vfs.remember('init', 'seed');
        await vfs.flush();
        const oldRow = await vfs.backend.selectKVValue('__db_lastAccess__');
        await new Promise(r => setTimeout(r, 10));
        await vfs.remember('k', 'v');
        await vfs.flush();
        const newRow = await vfs.backend.selectKVValue('__db_lastAccess__');
        assert.ok(new Date(newRow!.value) > new Date(oldRow!.value), 'lastAccess should advance after an operation');
        await vfs.release();
        await closeAndCleanup(vfs);
    });
}
