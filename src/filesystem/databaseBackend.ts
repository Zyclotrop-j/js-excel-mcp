import Database from 'better-sqlite3';
import type { IDatabaseBackend } from './IDatabaseBackend.js';

export class DatabaseBackend implements IDatabaseBackend {
    private db: InstanceType<typeof Database>;

    constructor(dbPath: string) {
        this.db = new Database(dbPath);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                name TEXT PRIMARY KEY,
                data BLOB NOT NULL,
                ttl TEXT NOT NULL DEFAULT '9999-12-31T23:59:59.999Z'
            );
            CREATE TABLE IF NOT EXISTS kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                ttl TEXT NOT NULL DEFAULT '9999-12-31T23:59:59.999Z'
            );
            CREATE TABLE IF NOT EXISTS exports (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                ttl TEXT NOT NULL,
                data BLOB NOT NULL
            );
        `);
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_files_ttl ON files (ttl);
            CREATE INDEX IF NOT EXISTS idx_kv_ttl ON kv (ttl);
            CREATE INDEX IF NOT EXISTS idx_exports_ttl ON exports (ttl);
        `);
    }

    async selectAllKV(): Promise<{ key: string; value: string; ttl: string }[]> {
        return this.db.prepare('SELECT key, value, ttl FROM kv').all() as { key: string; value: string; ttl: string }[];
    }

    async selectAllFiles(): Promise<{ name: string; data: Buffer; ttl: string }[]> {
        return this.db.prepare('SELECT name, data, ttl FROM files').all() as { name: string; data: Buffer; ttl: string }[];
    }

    async selectAllExports(): Promise<{ key: string; name: string; ttl: string; data: Buffer }[]> {
        return this.db.prepare('SELECT key, name, ttl, data FROM exports').all() as { key: string; name: string; ttl: string; data: Buffer }[];
    }

    async deleteAllKV(): Promise<void> {
        this.db.prepare('DELETE FROM kv').run();
    }

    async deleteAllFiles(): Promise<void> {
        this.db.prepare('DELETE FROM files').run();
    }

    async deleteAllExports(): Promise<void> {
        this.db.prepare('DELETE FROM exports').run();
    }

    async insertKV(key: string, value: string, ttl: string): Promise<void> {
        this.db.prepare('INSERT INTO kv (key, value, ttl) VALUES (?, ?, ?)').run(key, value, ttl);
    }

    async insertFile(name: string, data: Uint8Array, ttl: string): Promise<void> {
        this.db.prepare('INSERT INTO files (name, data, ttl) VALUES (?, ?, ?)').run(name, Buffer.from(data), ttl);
    }

    async insertOrReplaceExport(key: string, name: string, ttl: string, data: Uint8Array): Promise<void> {
        this.db.prepare('INSERT OR REPLACE INTO exports (key, name, ttl, data) VALUES (?, ?, ?, ?)').run(key, name, ttl, Buffer.from(data));
    }

    async insertExport(key: string, name: string, ttl: string, data: Uint8Array): Promise<void> {
        this.db.prepare('INSERT INTO exports (key, name, ttl, data) VALUES (?, ?, ?, ?)').run(key, name, ttl, Buffer.from(data));
    }

    async insertOrReplaceKV(key: string, value: string, ttl: string): Promise<void> {
        this.db.prepare('INSERT OR REPLACE INTO kv (key, value, ttl) VALUES (?, ?, ?)').run(key, value, ttl);
    }

    async insertOrReplaceFile(name: string, data: Uint8Array, ttl: string): Promise<void> {
        this.db.prepare('INSERT OR REPLACE INTO files (name, data, ttl) VALUES (?, ?, ?)').run(name, Buffer.from(data), ttl);
    }

    async selectFileTTL(name: string): Promise<{ ttl: string } | undefined> {
        return this.db.prepare('SELECT ttl FROM files WHERE name = ?').get(name) as { ttl: string } | undefined;
    }

    async selectKVTTL(key: string): Promise<{ ttl: string } | undefined> {
        return this.db.prepare('SELECT ttl FROM kv WHERE key = ?').get(key) as { ttl: string } | undefined;
    }

    async selectKVValue(key: string): Promise<{ value: string } | undefined> {
        return this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    }

    async transaction<T>(fn: () => T): Promise<T> {
        this.db.exec('BEGIN');
        try {
            const result = fn();
            if (result instanceof Promise) {
                await result;
            }
            this.db.exec('COMMIT');
            return result as T;
        } catch (e) {
            try {
                this.db.exec('ROLLBACK');
            } catch { /* rollback may fail if connection is broken */ }
            throw e;
        }
    }

    async close(): Promise<void> {
        try {
            this.db.close();
        } catch {
            // already closed
        }
    }
}