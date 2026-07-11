import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

export class VirtualFileSystem {
    backend: InstanceType<typeof Database>;

    constructor(userid: string, systemCollection: boolean) {
        if(!systemCollection && !/[a-zA-Z]/.test(userid[0])) {
            throw new Error(`All collections must start with a-z. Requested collection was ${userid}`);
        }
        this.backend = new Database(`data/${userid}.db`);
        this.backend.exec(`
            CREATE TABLE IF NOT EXISTS files (
                name TEXT PRIMARY KEY,
                data BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS exports (
                key TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                ttl TEXT NOT NULL,
                data BLOB NOT NULL
            );
        `);
        process.once('exit', () => this.backend.close());
    }

    async remember(key: string, value: string): Promise<void> {
        this.backend.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value);
    }

    async recall(key: string): Promise<string | null> {
        const row = this.backend.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
        return row?.value ?? null;
    }

    async erase(key: string): Promise<void> {
        this.backend.prepare('DELETE FROM kv WHERE key = ?').run(key);
    }

    async eraseMatching(pattern: string): Promise<void> {
        this.backend.prepare('DELETE FROM kv WHERE key LIKE ?').run(pattern);
    }

    async save(name: string, buffer: Uint8Array): Promise<void> {
        this.backend.prepare('INSERT OR REPLACE INTO files (name, data) VALUES (?, ?)').run(name, Buffer.from(buffer));
    }

    async load(name: string): Promise<Uint8Array> {
        const row = this.backend.prepare('SELECT data FROM files WHERE name = ?').get(name) as { data: Buffer } | undefined;
        if (!row) {
            throw new Error(`File not found: ${name}`);
        }
        return new Uint8Array(row.data);
    }

    async delete(name: string): Promise<void> {
        this.backend.prepare('DELETE FROM files WHERE name = ?').run(name);
    }

    withTransaction<T>(fn: () => T): T {
        return this.backend.transaction(fn)();
    }

    async list(): Promise<string[]> {
        return this.backend.prepare('SELECT name FROM files').all().map((row) => (row as { name: string }).name);
    }

    async exportFile(name: string, data: Uint8Array): Promise<{key: string, ttl: string}> {
        const key = randomUUID();
        const ttl = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        this.backend.prepare('INSERT INTO exports (name, key, ttl, data) VALUES (?, ?, ?, ?)').run(name, key, ttl, Buffer.from(data));
        return {key, ttl};
    }

    async importFile(name: string, key: string): Promise<{ data: Uint8Array; expiresAt: Date }> {
        const row = this.backend.prepare('SELECT data, ttl FROM exports WHERE name = ? AND key = ?').get(name, key) as { data: Buffer; ttl: string } | undefined;
        if (!row) {
            throw new Error(`Export not found: ${name} with key ${key}`);
        }
        return { data: new Uint8Array(row.data), expiresAt: new Date(row.ttl) };
    }
}
