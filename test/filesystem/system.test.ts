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

export default function (test: any) {
    test('constructor creates database file', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        assert.ok(existsSync(DB_PATH), 'Database file should exist');
        cleanup();
    });

    test('constructor validates userId first character', async () => {
        assert.throws(
            () => new VirtualFileSystem('123invalid', false),
            /All collections must start with a-z/,
            'Should reject userId starting with number'
        );
    });

    test('save and load round-trip', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        
        await vfs.save('test.bin', data);
        const loaded = await vfs.load('test.bin');
        
        assert.deepEqual(loaded, data, 'Loaded data should match saved data');
        cleanup();
    });

    test('save overwrites existing file', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await vfs.save('test.bin', new Uint8Array([1, 2, 3]));
        await vfs.save('test.bin', new Uint8Array([4, 5, 6]));
        const loaded = await vfs.load('test.bin');
        
        assert.deepEqual(loaded, new Uint8Array([4, 5, 6]), 'Should overwrite existing file');
        cleanup();
    });

    test('load throws on missing file', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await assert.rejects(
            async () => await vfs.load('nonexistent.bin'),
            /File not found/,
            'Should throw when loading missing file'
        );
        cleanup();
    });

    test('delete removes file', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await vfs.save('test.bin', new Uint8Array([1, 2, 3]));
        await vfs.delete('test.bin');
        
        await assert.rejects(
            async () => await vfs.load('test.bin'),
            /File not found/,
            'File should be deleted'
        );
        cleanup();
    });

    test('list returns all files', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await vfs.save('file1.bin', new Uint8Array([1]));
        await vfs.save('file2.bin', new Uint8Array([2]));
        await vfs.save('file3.bin', new Uint8Array([3]));
        
        const files = await vfs.list();
        assert.deepEqual(files.sort(), ['file1.bin', 'file2.bin', 'file3.bin']);
        cleanup();
    });

    test('remember and recall round-trip', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await vfs.remember('key1', 'value1');
        const value = await vfs.recall('key1');
        
        assert.equal(value, 'value1');
        cleanup();
    });

    test('recall returns null for missing key', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        const value = await vfs.recall('nonexistent');
        assert.equal(value, null);
        cleanup();
    });

    test('remember overwrites existing value', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await vfs.remember('key1', 'value1');
        await vfs.remember('key1', 'value2');
        const value = await vfs.recall('key1');
        
        assert.equal(value, 'value2');
        cleanup();
    });

    test('erase removes key', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await vfs.remember('key1', 'value1');
        await vfs.erase('key1');
        const value = await vfs.recall('key1');
        
        assert.equal(value, null);
        cleanup();
    });

    test('eraseMatching removes keys matching pattern', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await vfs.remember('currentSheet-file1', 'sheet1');
        await vfs.remember('currentSheet-file2', 'sheet2');
        await vfs.remember('otherKey', 'other');
        
        await vfs.eraseMatching('currentSheet-%');
        
        const sheet1 = await vfs.recall('currentSheet-file1');
        const sheet2 = await vfs.recall('currentSheet-file2');
        const other = await vfs.recall('otherKey');
        
        assert.equal(sheet1, null);
        assert.equal(sheet2, null);
        assert.equal(other, 'other');
        cleanup();
    });

    test('withTransaction commits on success', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await vfs.withTransaction(async () => {
            await vfs.remember('key1', 'value1');
            await vfs.remember('key2', 'value2');
        });
        
        const value1 = await vfs.recall('key1');
        const value2 = await vfs.recall('key2');
        
        assert.equal(value1, 'value1');
        assert.equal(value2, 'value2');
        cleanup();
    });

    test('exportFile creates export with TTL', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        const data = new Uint8Array([10, 20, 30]);
        
        const { key, ttl } = await vfs.exportFile('export.bin', data);
        
        assert.ok(key.length > 0, 'Key should be generated');
        assert.ok(ttl, 'TTL should be set');
        assert.ok(new Date(ttl) > new Date(), 'TTL should be in the future');
        cleanup();
    });

    test('importFile retrieves exported file', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        const data = new Uint8Array([10, 20, 30]);
        
        const { key } = await vfs.exportFile('export.bin', data);
        const result = await vfs.importFile('export.bin', key);
        
        assert.deepEqual(result.data, data, 'Imported data should match exported data');
        assert.ok(result.expiresAt instanceof Date, 'Should have expiresAt date');
        cleanup();
    });

    test('importFile throws on missing export', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        
        await assert.rejects(
            async () => await vfs.importFile('nonexistent.bin', 'fake-key'),
            /Export not found/,
            'Should throw when export not found'
        );
        cleanup();
    });

    test('importFile throws on wrong key', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        const data = new Uint8Array([10, 20, 30]);
        
        await vfs.exportFile('export.bin', data);
        
        await assert.rejects(
            async () => await vfs.importFile('export.bin', 'wrong-key'),
            /Export not found/,
            'Should throw when key is wrong'
        );
        cleanup();
    });

    test('systemCollection allows numeric first char', async () => {
        cleanup();
        const vfs = new VirtualFileSystem('_shared', true);
        assert.ok(vfs, 'System collection should be created');
        cleanup();
    });

    test('purgeExpired removes expired rows from all tables', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        const pastTtl = new Date(Date.now() - 60_000).toISOString();
        vfs.backend.prepare('INSERT OR REPLACE INTO files (name, data, ttl) VALUES (?, ?, ?)').run('file.bin', Buffer.from([1]), pastTtl);
        vfs.backend.prepare('INSERT OR REPLACE INTO kv (key, value, ttl) VALUES (?, ?, ?)').run('somekey', 'x', pastTtl);
        vfs.backend.prepare('INSERT INTO exports (name, key, ttl, data) VALUES (?, ?, ?, ?)').run('export.bin', 'k', pastTtl, Buffer.from([1]));
        const purged = await vfs.purgeExpired();
        assert.equal(purged, 3, 'Should purge one row from each table');
        const remainingFiles = (vfs.backend.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }).count;
        const remainingKv = (vfs.backend.prepare('SELECT COUNT(*) as count FROM kv').get() as { count: number }).count;
        const remainingExports = (vfs.backend.prepare('SELECT COUNT(*) as count FROM exports').get() as { count: number }).count;
        assert.equal(remainingFiles, 0, 'No files should remain');
        assert.equal(remainingKv, 0, 'No kv entries should remain');
        assert.equal(remainingExports, 0, 'No exports should remain');
        cleanup();
    });

    test('purgeExpired keeps non-expired rows', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        const futureTtl = new Date(Date.now() + 60_000).toISOString();
        vfs.backend.prepare('INSERT INTO exports (name, key, ttl, data) VALUES (?, ?, ?, ?)').run('test.bin', 'k', futureTtl, Buffer.from([1, 2, 3]));
        const purged = await vfs.purgeExpired();
        assert.equal(purged, 0, 'Should not purge non-expired rows');
        cleanup();
    });

    test('load renews file TTL', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        await vfs.save('test.bin', new Uint8Array([1]));
        const rowAfterSave = vfs.backend.prepare('SELECT ttl FROM files WHERE name = ?').get('test.bin') as { ttl: string };
        const ttlAfterSave = new Date(rowAfterSave.ttl).getTime();
        await vfs.load('test.bin');
        const rowAfterLoad = vfs.backend.prepare('SELECT ttl FROM files WHERE name = ?').get('test.bin') as { ttl: string };
        const ttlAfterLoad = new Date(rowAfterLoad.ttl).getTime();
        assert.ok(ttlAfterLoad >= ttlAfterSave, 'Load should not decrease TTL');
        cleanup();
    });

    test('recall renews kv TTL', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        await vfs.remember('key1', 'value1');
        const rowAfterSave = vfs.backend.prepare('SELECT ttl FROM kv WHERE key = ?').get('key1') as { ttl: string };
        const ttlAfterSave = new Date(rowAfterSave.ttl).getTime();
        await vfs.recall('key1');
        const rowAfterRecall = vfs.backend.prepare('SELECT ttl FROM kv WHERE key = ?').get('key1') as { ttl: string };
        const ttlAfterRecall = new Date(rowAfterRecall.ttl).getTime();
        assert.ok(ttlAfterRecall >= ttlAfterSave, 'Recall should not decrease TTL');
        cleanup();
    });

    test('importFile throws on expired export', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        const key = 'test-key';
        const pastTtl = new Date(Date.now() - 60_000).toISOString();
        vfs.backend.prepare('INSERT INTO exports (name, key, ttl, data) VALUES (?, ?, ?, ?)').run('test.bin', key, pastTtl, Buffer.from([1, 2, 3]));
        await assert.rejects(
            async () => await vfs.importFile('test.bin', key),
            /Export expired/,
            'Should throw when export is expired'
        );
        const remaining = vfs.backend.prepare('SELECT COUNT(*) as count FROM exports').get() as { count: number };
        assert.equal(remaining.count, 0, 'Expired row should be cleaned up');
        cleanup();
    });

    test('every operation updates lastAccess', async () => {
        cleanup();
        const vfs = new VirtualFileSystem(TEST_USER, false);
        await vfs.remember('init', 'seed');
        const oldRow = vfs.backend.prepare("SELECT value FROM kv WHERE key = '__db_lastAccess__'").get() as { value: string };
        await new Promise(r => setTimeout(r, 10));
        await vfs.remember('k', 'v');
        const newRow = vfs.backend.prepare("SELECT value FROM kv WHERE key = '__db_lastAccess__'").get() as { value: string };
        assert.ok(new Date(newRow.value) > new Date(oldRow.value), 'lastAccess should advance after an operation');
        cleanup();
    });
}
