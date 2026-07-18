import { randomUUID } from 'node:crypto';
import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseBackend } from './databaseBackend.js';
import { CloudflareBackend } from './cloudflareBackend.js';
import { MemoryBackend } from './memoryBackend.js';
import { WriteCoordinator } from './writeCoordinator.js';
import type { IDatabaseBackend } from './IDatabaseBackend.js';
import type { KVEntry, FileEntry, ExportEntry } from './writeCoordinator.js';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const FOUR_WEEKS_MS = 4 * 7 * 24 * 60 * 60 * 1000;
const DB_DIR = 'data';
const LAST_ACCESS_KEY = '__db_lastAccess__';

export class VirtualFileSystem {
    private backend: IDatabaseBackend;
    dbPath: string;
    memoryKV: Map<string, KVEntry>;
    memoryFiles: Map<string, FileEntry>;
    memoryExports: Map<string, ExportEntry>;
    private userid: string;

    static async acquire(userid: string, systemCollection: boolean): Promise<VirtualFileSystem> {
        await WriteCoordinator.acquireLock(userid);
        const vfs = new VirtualFileSystem(userid, systemCollection);
        await vfs.hydrate();
        return vfs;
    }

    static selectBackend(dbPath: string): IDatabaseBackend {
        const backend = process.env.BACKEND?.toLowerCase();
        switch (backend) {
            case 'cloudflare': return new CloudflareBackend(globalThis as any, dbPath);
            case 'test': return new MemoryBackend(dbPath);
            default: return new DatabaseBackend(dbPath);
        }
    }

    private constructor(userid: string, systemCollection: boolean) {
        if(!systemCollection && !/[a-zA-Z]/.test(userid[0])) {
            throw new Error(`All collections must start with a-z. Requested collection was ${userid}`);
        }
        this.userid = userid;
        this.dbPath = join(DB_DIR, `${userid}.db`);
        this.backend = VirtualFileSystem.selectBackend(this.dbPath);

        this.memoryKV = new Map();
        this.memoryFiles = new Map();
        this.memoryExports = new Map();
    }

    async hydrate(): Promise<void> {
        this.memoryKV.clear();
        this.memoryFiles.clear();
        this.memoryExports.clear();

        const allKV = await this.backend.selectAllKV();
        for (const row of allKV) {
            this.memoryKV.set(row.key, { value: row.value, ttl: row.ttl });
        }

        const allFiles = await this.backend.selectAllFiles();
        for (const row of allFiles) {
            this.memoryFiles.set(row.name, { data: new Uint8Array(row.data), ttl: row.ttl });
        }

        const allExports = await this.backend.selectAllExports();
        for (const row of allExports) {
            this.memoryExports.set(row.key, { name: row.name, key: row.key, ttl: row.ttl, data: new Uint8Array(row.data) });
        }
    }

    private _updatePendingWrites(): void {
        WriteCoordinator.updatePendingWrites(this.userid, this.memoryKV, this.memoryFiles, this.memoryExports);
    }

    async flush(): Promise<void> {
        const queueKey = this.userid;
        let pending = WriteCoordinator.getPendingWrites(queueKey);

        if (!pending) {
            // No pending writes, just write current state
            pending = {
                kv: new Map(this.memoryKV),
                files: new Map(this.memoryFiles),
                exports: new Map(this.memoryExports)
            };
        }

        try {
            // Delete all existing data first (sequentially, before parallel inserts)
            await this.backend.deleteAllKV();
            await this.backend.deleteAllFiles();
            await this.backend.deleteAllExports();

            // Fire off all writes in parallel, each waiting for its own rate limit
            const writePromises: Promise<void>[] = [];

            // KV writes
            for (const [key, {value, ttl}] of pending.kv) {
                const writeKey = WriteCoordinator.formatKVKey(this.userid, key);
                writePromises.push((async () => {
                    await WriteCoordinator.waitForRateLimit(writeKey);
                    await this.backend.insertKV(key, value, ttl);
                    WriteCoordinator.recordWrite(writeKey);
                })());
            }

            // File writes
            for (const [name, {data, ttl}] of pending.files) {
                const writeKey = WriteCoordinator.formatFileKey(this.userid, name);
                writePromises.push((async () => {
                    await WriteCoordinator.waitForRateLimit(writeKey);
                    await this.backend.insertFile(name, data, ttl);
                    WriteCoordinator.recordWrite(writeKey);
                })());
            }

            // Export writes
            for (const [key, {name, ttl, data}] of pending.exports) {
                const writeKey = WriteCoordinator.formatExportKey(this.userid, key);
                writePromises.push((async () => {
                    await WriteCoordinator.waitForRateLimit(writeKey);
                    await this.backend.insertExport(key, name, ttl, data);
                    WriteCoordinator.recordWrite(writeKey);
                })());
            }

            // Wait for all writes to complete
            await Promise.all(writePromises);
        } finally {
            // Always clean up pending writes, even if something failed
            WriteCoordinator.clearPendingWrites(queueKey);
        }
    }

    private _ttl(): string {
        return new Date(Date.now() + TWO_WEEKS_MS).toISOString();
    }

    private _markAccess(): void {
        this.memoryKV.set(LAST_ACCESS_KEY, { value: new Date().toISOString(), ttl: this._ttl() });
    }

    async remember(key: string, value: string): Promise<void> {
        this._markAccess();
        this.memoryKV.set(key, { value, ttl: this._ttl() });
        this._updatePendingWrites();
    }

    async recall(key: string): Promise<string | null> {
        this._markAccess();
        const entry = this.memoryKV.get(key);
        if (entry) {
            entry.ttl = this._ttl();
            return entry.value;
        }
        return null;
    }

    async erase(key: string): Promise<void> {
        this._markAccess();
        this.memoryKV.delete(key);
        this._updatePendingWrites();
    }

    async erasePrefix(prefix: string): Promise<void> {
        this._markAccess();
        const keysToDelete: string[] = [];
        for (const key of this.memoryKV.keys()) {
            if (key.startsWith(prefix)) {
                keysToDelete.push(key);
            }
        }
        for (const key of keysToDelete) {
            this.memoryKV.delete(key);
        }
        this._updatePendingWrites();
    }

    async save(name: string, buffer: Uint8Array): Promise<void> {
        this._markAccess();
        this.memoryFiles.set(name, { data: buffer, ttl: this._ttl() });
        this._updatePendingWrites();
    }

    async load(name: string): Promise<Uint8Array> {
        this._markAccess();
        const entry = this.memoryFiles.get(name);
        if (!entry) {
            throw new Error(`File not found: ${name}`);
        }
        entry.ttl = this._ttl();
        return entry.data;
    }

    async delete(name: string): Promise<void> {
        this._markAccess();
        this.memoryFiles.delete(name);
        this._updatePendingWrites();
    }

    withTransaction<T>(fn: () => T): T {
        return fn();
    }

    async list(): Promise<string[]> {
        this._markAccess();
        return [...this.memoryFiles.keys()];
    }

    async purgeExpired(): Promise<number> {
        const now = new Date().toISOString();
        let total = 0;

        for (const [key, entry] of this.memoryKV) {
            if (entry.ttl < now) {
                this.memoryKV.delete(key);
                total++;
            }
        }
        for (const [name, entry] of this.memoryFiles) {
            if (entry.ttl < now) {
                this.memoryFiles.delete(name);
                total++;
            }
        }
        for (const [key, entry] of this.memoryExports) {
            if (entry.ttl < now) {
                this.memoryExports.delete(key);
                total++;
            }
        }

        return total;
    }

    async exportFile(name: string, data: Uint8Array): Promise<{key: string, ttl: string}> {
        this._markAccess();
        const key = randomUUID();
        const ttl = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        this.memoryExports.set(key, { name, key, ttl, data });
        this._updatePendingWrites();
        return {key, ttl};
    }

    async importFile(name: string, key: string): Promise<{ data: Uint8Array; expiresAt: Date }> {
        this._markAccess();
        const entry = this.memoryExports.get(key);
        if (!entry || entry.name !== name) {
            throw new Error(`Export not found: ${name} with key ${key}`);
        }
        if (entry.ttl < new Date().toISOString()) {
            this.memoryExports.delete(key);
            throw new Error(`Export expired: ${name} with key ${key}`);
        }
        return { data: entry.data, expiresAt: new Date(entry.ttl) };
    }

    async close(): Promise<void> {
        await this.backend.close();
    }

    async release(): Promise<void> {
        await this.flush();
        WriteCoordinator.releaseLock(this.userid);
        await this.backend.close();
    }
}

function cleanupProcess() {
    setInterval(async () => {
        for (const entry of readdirSync(DB_DIR)) {
            if (!entry.endsWith('.db')) continue;

            const isSystem = !/[a-zA-Z0-9]/.test(entry[0]) || entry === '_auth.db';
            const fullPath = join(DB_DIR, entry);

            try {
                const backend = new DatabaseBackend(fullPath);

                if (!isSystem) {
                    const allKV = await backend.selectAllKV();
                    const lastAccessRow = allKV.find(row => row.key === LAST_ACCESS_KEY);
                    if (lastAccessRow && lastAccessRow.value < new Date(Date.now() - FOUR_WEEKS_MS).toISOString()) {
                        await backend.close();
                        unlinkSync(fullPath);
                        continue;
                    }
                }

                await backend.close();
            } catch { }
        }
    }, 60 * 60 * 1000)?.unref();
}
cleanupProcess();