import { randomUUID } from 'node:crypto';
import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const FOUR_WEEKS_MS = 4 * 7 * 24 * 60 * 60 * 1000;
const DB_DIR = 'data';
const LAST_ACCESS_KEY = '__db_lastAccess__';

export class VirtualFileSystem {
    backend: InstanceType<typeof Database>;
    dbPath: string;

    constructor(userid: string, systemCollection: boolean) {
        if(!systemCollection && !/[a-zA-Z0-9]/.test(userid[0])) {
            throw new Error(`All collections must start with a-z. Requested collection was ${userid}`);
        }
        this.dbPath = join(DB_DIR, `${userid}.db`);
        this.backend = new Database(this.dbPath);
        this.backend.exec(`
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
        this.backend.exec(`
            CREATE INDEX IF NOT EXISTS idx_files_ttl ON files (ttl);
            CREATE INDEX IF NOT EXISTS idx_kv_ttl ON kv (ttl);
            CREATE INDEX IF NOT EXISTS idx_exports_ttl ON exports (ttl);
        `);
        process.once('exit', () => this.backend.close());
    }

    private _ttl(): string {
        return new Date(Date.now() + TWO_WEEKS_MS).toISOString();
    }

    private _markAccess(): void {
        this.backend.prepare('INSERT OR REPLACE INTO kv (key, value, ttl) VALUES (?, ?, ?)').run(LAST_ACCESS_KEY, new Date().toISOString(), this._ttl());
    }

    async remember(key: string, value: string): Promise<void> {
        this._markAccess();
        this.backend.prepare('INSERT OR REPLACE INTO kv (key, value, ttl) VALUES (?, ?, ?)').run(key, value, this._ttl());
    }

    async recall(key: string): Promise<string | null> {
        this._markAccess();
        const row = this.backend.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
        if (row) {
            this.backend.prepare('UPDATE kv SET ttl = ? WHERE key = ?').run(this._ttl(), key);
        }
        return row?.value ?? null;
    }

    async erase(key: string): Promise<void> {
        this._markAccess();
        this.backend.prepare('DELETE FROM kv WHERE key = ?').run(key);
    }

    async eraseMatching(pattern: string): Promise<void> {
        this._markAccess();
        this.backend.prepare('DELETE FROM kv WHERE key LIKE ?').run(pattern);
    }

    async save(name: string, buffer: Uint8Array): Promise<void> {
        this._markAccess();
        this.backend.prepare('INSERT OR REPLACE INTO files (name, data, ttl) VALUES (?, ?, ?)').run(name, Buffer.from(buffer), this._ttl());
    }

    async load(name: string): Promise<Uint8Array> {
        this._markAccess();
        const row = this.backend.prepare('SELECT data FROM files WHERE name = ?').get(name) as { data: Buffer } | undefined;
        if (!row) {
            throw new Error(`File not found: ${name}`);
        }
        this.backend.prepare('UPDATE files SET ttl = ? WHERE name = ?').run(this._ttl(), name);
        return new Uint8Array(row.data);
    }

    async delete(name: string): Promise<void> {
        this._markAccess();
        this.backend.prepare('DELETE FROM files WHERE name = ?').run(name);
    }

    withTransaction<T>(fn: () => T): T {
        return this.backend.transaction(fn)();
    }

    async list(): Promise<string[]> {
        this._markAccess();
        return this.backend.prepare('SELECT name FROM files').all().map((row) => (row as { name: string }).name);
    }

    async purgeExpired(): Promise<number> {
        const now = new Date().toISOString();
        let total = 0;
        for (const table of ['files', 'kv', 'exports']) {
            total += this.backend.prepare(`DELETE FROM ${table} WHERE ttl < ?`).run(now).changes;
        }
        return total;
    }

    async exportFile(name: string, data: Uint8Array): Promise<{key: string, ttl: string}> {
        this._markAccess();
        const key = randomUUID();
        const ttl = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        this.backend.prepare('INSERT INTO exports (name, key, ttl, data) VALUES (?, ?, ?, ?)').run(name, key, ttl, Buffer.from(data));
        return {key, ttl};
    }

    async importFile(name: string, key: string): Promise<{ data: Uint8Array; expiresAt: Date }> {
        this._markAccess();
        const row = this.backend.prepare('SELECT data, ttl FROM exports WHERE name = ? AND key = ?').get(name, key) as { data: Buffer; ttl: string } | undefined;
        if (!row) {
            throw new Error(`Export not found: ${name} with key ${key}`);
        }
        if (row.ttl < new Date().toISOString()) {
            this.backend.prepare('DELETE FROM exports WHERE name = ? AND key = ?').run(name, key);
            throw new Error(`Export expired: ${name} with key ${key}`);
        }
        return { data: new Uint8Array(row.data), expiresAt: new Date(row.ttl) };
    }
}

function cleanupProcess() {
    setInterval(() => {
        for (const entry of readdirSync(DB_DIR)) {
            if (!entry.endsWith('.db')) continue;

            const isSystem = !/[a-zA-Z0-9]/.test(entry[0]) || entry === '_auth.db';
            const fullPath = join(DB_DIR, entry);

            try {
                const db = new Database(fullPath);

                if (!isSystem) {
                    const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(LAST_ACCESS_KEY) as { value: string } | undefined;
                    if (row && row.value < new Date(Date.now() - FOUR_WEEKS_MS).toISOString()) {
                        db.close();
                        unlinkSync(fullPath);
                        continue;
                    }
                }

                const now = new Date().toISOString();
                for (const table of ['files', 'kv', 'exports']) {
                    try { db.prepare(`DELETE FROM ${table} WHERE ttl < ?`).run(now); } catch { }
                }
                db.close();
            } catch { }
        }
    }, 60 * 60 * 1000)?.unref();
}
cleanupProcess();
