import { randomUUID } from 'node:crypto';
import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path/posix';
import { WriteCoordinator } from './writeCoordinator';
import type { IDatabaseBackend } from './IDatabaseBackend';
import type { KVEntry, FileEntry, ExportEntry } from './writeCoordinator';
import { getWorkerEnv } from '../util/workerEnv';

/** RPC interface for SessionStateDO (Cloudflare only) */
interface SessionStateDOStub {
    get(key: string): Promise<{ value: string; ttl: string } | undefined>;
    set(key: string, value: string, ttl: string): Promise<void>;
    delete(key: string): Promise<void>;
    list(): Promise<Array<{ key: string; value: string; ttl: string }>>;
    listByPrefix(prefix: string): Promise<string[]>;
    deleteByPrefix(prefix: string): Promise<void>;
}

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
    private dirtyKVKeys = new Set<string>();
    private dirtyFileNames = new Set<string>();
    private dirtyExportKeys = new Set<string>();
    private deletedKVKeys = new Set<string>();
    private deletedFileNames = new Set<string>();
    private deletedExportKeys = new Set<string>();
    private userid: string;

    static async acquire(userid: string, systemCollection: boolean): Promise<VirtualFileSystem> {
        await WriteCoordinator.acquireLock(userid);
        try {
            const dbPath = join(DB_DIR, `${userid}.db`);
            const backend = await VirtualFileSystem.selectBackend(dbPath);
            const vfs = new VirtualFileSystem(userid, systemCollection, backend);
            await vfs.hydrate();
            return vfs;
        } catch (e) {
            WriteCoordinator.releaseLock(userid);
            throw e;
        }
    }

    static async selectBackend(dbPath: string): Promise<IDatabaseBackend> {
        const backend = process.env.BACKEND?.toLowerCase();
        switch (backend) {
            case 'cloudflare': {
                const { CloudflareBackend } = await import('./cloudflareBackend');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return new CloudflareBackend(getWorkerEnv() as any, dbPath);
            }
            case 'test': {
                const { MemoryBackend } = await import('./memoryBackend');
                return new MemoryBackend(dbPath);
            }
            default: {
                const { DatabaseBackend } = await import('./databaseBackend');
                return new DatabaseBackend(dbPath);
            }
        }
    }

    private constructor(userid: string, systemCollection: boolean, backend: IDatabaseBackend) {
        if(!systemCollection && !/[a-zA-Z]/.test(userid[0])) {
            throw new Error(`All collections must start with a-z. Requested collection was ${userid}`);
        }
        this.userid = userid;
        this.dbPath = join(DB_DIR, `${userid}.db`);
        this.backend = backend;

        this.memoryKV = new Map();
        this.memoryFiles = new Map();
        this.memoryExports = new Map();
    }

    private get isCloudflare(): boolean {
        return process.env.BACKEND?.toLowerCase() === 'cloudflare';
    }

    private _sessionDOStub: SessionStateDOStub | null = null;

    private async _getSessionDOStub(): Promise<SessionStateDOStub> {
        if (!this._sessionDOStub) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const env = getWorkerEnv() as any;
            const id = env.SESSION_STATE.idFromName(this.userid);
            this._sessionDOStub = env.SESSION_STATE.get(id);
        }
        return this._sessionDOStub!;
    }

    async hydrate(): Promise<void> {
        this.memoryKV.clear();
        this.memoryFiles.clear();
        this.memoryExports.clear();

        if (this.isCloudflare) {
            // Session-state lives in the per-user Durable Object on Cloudflare
            const stub = await this._getSessionDOStub();
            const entries = await stub.list();
            for (const entry of entries) {
                this.memoryKV.set(entry.key, { value: entry.value, ttl: entry.ttl });
            }
        } else {
            const allKV = await this.backend.selectAllKV();
            for (const row of allKV) {
                this.memoryKV.set(row.key, { value: row.value, ttl: row.ttl });
            }
        }

        // File data always comes from the VFS backend (R2/KV on CF, SQLite locally)
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

        try {
            // Fire off all writes in parallel, each waiting for its own rate limit
            const writePromises: Promise<void>[] = [];

            // KV: upsert dirty keys
            for (const key of this.dirtyKVKeys) {
                const entry = this.memoryKV.get(key);
                if (entry) {
                    const writeKey = WriteCoordinator.formatKVKey(this.userid, key);
                    writePromises.push((async () => {
                        await WriteCoordinator.waitForRateLimit(writeKey);
                        await this.backend.insertOrReplaceKV(key, entry.value, entry.ttl);
                        WriteCoordinator.recordWrite(writeKey);
                    })());
                }
            }

            // KV: delete removed keys
            for (const key of this.deletedKVKeys) {
                const writeKey = WriteCoordinator.formatKVKey(this.userid, key);
                writePromises.push((async () => {
                    await WriteCoordinator.waitForRateLimit(writeKey);
                    await this.backend.deleteKV(key);
                    WriteCoordinator.recordWrite(writeKey);
                })());
            }

            // Files: upsert dirty names
            for (const name of this.dirtyFileNames) {
                const entry = this.memoryFiles.get(name);
                if (entry) {
                    const writeKey = WriteCoordinator.formatFileKey(this.userid, name);
                    writePromises.push((async () => {
                        await WriteCoordinator.waitForRateLimit(writeKey);
                        await this.backend.insertOrReplaceFile(name, entry.data, entry.ttl);
                        WriteCoordinator.recordWrite(writeKey);
                    })());
                }
            }

            // Files: delete removed names
            for (const name of this.deletedFileNames) {
                const writeKey = WriteCoordinator.formatFileKey(this.userid, name);
                writePromises.push((async () => {
                    await WriteCoordinator.waitForRateLimit(writeKey);
                    await this.backend.deleteFile(name);
                    WriteCoordinator.recordWrite(writeKey);
                })());
            }

            // Exports: upsert dirty keys
            for (const key of this.dirtyExportKeys) {
                const entry = this.memoryExports.get(key);
                if (entry) {
                    const writeKey = WriteCoordinator.formatExportKey(this.userid, key);
                    writePromises.push((async () => {
                        await WriteCoordinator.waitForRateLimit(writeKey);
                        await this.backend.insertOrReplaceExport(key, entry.name, entry.ttl, entry.data);
                        WriteCoordinator.recordWrite(writeKey);
                    })());
                }
            }

            // Exports: delete removed keys
            for (const key of this.deletedExportKeys) {
                const writeKey = WriteCoordinator.formatExportKey(this.userid, key);
                writePromises.push((async () => {
                    await WriteCoordinator.waitForRateLimit(writeKey);
                    await this.backend.deleteExport(key);
                    WriteCoordinator.recordWrite(writeKey);
                })());
            }

            // Wait for all writes to complete
            await Promise.all(writePromises);
        } finally {
            // Always clean up, even if something failed
            this.dirtyKVKeys.clear();
            this.dirtyFileNames.clear();
            this.dirtyExportKeys.clear();
            this.deletedKVKeys.clear();
            this.deletedFileNames.clear();
            this.deletedExportKeys.clear();
            WriteCoordinator.clearPendingWrites(queueKey);
        }
    }

    /**
     * True when write operations have dirtied the in-memory maps since the last
     * `flush()`. Callers that want to persist intermediate state (e.g. after
     * each tool call in an SSE/batch request) can use this to avoid redundant
     * full DB syncs when nothing has changed.
     */
    hasPendingWrites(): boolean {
        return this.dirtyKVKeys.size > 0 || this.deletedKVKeys.size > 0 ||
               this.dirtyFileNames.size > 0 || this.deletedFileNames.size > 0 ||
               this.dirtyExportKeys.size > 0 || this.deletedExportKeys.size > 0;
    }

    private _ttl(): string {
        return new Date(Date.now() + TWO_WEEKS_MS).toISOString();
    }

    private _markAccess(): void {
        this.memoryKV.set(LAST_ACCESS_KEY, { value: new Date().toISOString(), ttl: this._ttl() });
    }

    async remember(key: string, value: string): Promise<void> {
        this._markAccess();
        const ttl = this._ttl();
        this.memoryKV.set(key, { value, ttl });

        if (this.isCloudflare) {
            const stub = await this._getSessionDOStub();
            const lastAccess = this.memoryKV.get(LAST_ACCESS_KEY)!;
            await Promise.all([
                stub.set(key, value, ttl),
                stub.set(LAST_ACCESS_KEY, lastAccess.value, lastAccess.ttl),
            ]);
        } else {
            this.dirtyKVKeys.add(key);
            this.deletedKVKeys.delete(key);
            this.dirtyKVKeys.add(LAST_ACCESS_KEY);
        }
        this._updatePendingWrites();
    }

    async recall(key: string): Promise<string | null> {
        this._markAccess();
        const entry = this.memoryKV.get(key);
        if (entry) {
            entry.ttl = this._ttl();
            return entry.value;
        }

        if (this.isCloudflare) {
            // Cache miss — fetch from the DO (strongly consistent)
            const stub = await this._getSessionDOStub();
            const doEntry = await stub.get(key);
            if (doEntry) {
                this.memoryKV.set(key, doEntry);
                return doEntry.value;
            }
        }

        return null;
    }

    async erase(key: string): Promise<void> {
        this._markAccess();
        this.memoryKV.delete(key);

        if (this.isCloudflare) {
            const stub = await this._getSessionDOStub();
            const lastAccess = this.memoryKV.get(LAST_ACCESS_KEY)!;
            await Promise.all([
                stub.delete(key),
                stub.set(LAST_ACCESS_KEY, lastAccess.value, lastAccess.ttl),
            ]);
        } else {
            this.deletedKVKeys.add(key);
            this.dirtyKVKeys.delete(key);
            this.dirtyKVKeys.add(LAST_ACCESS_KEY);
        }
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

        if (this.isCloudflare) {
            const stub = await this._getSessionDOStub();
            const ops: Promise<void>[] = [];
            for (const key of keysToDelete) {
                ops.push(stub.delete(key));
            }
            const lastAccess = this.memoryKV.get(LAST_ACCESS_KEY)!;
            ops.push(stub.set(LAST_ACCESS_KEY, lastAccess.value, lastAccess.ttl));
            await Promise.all(ops);
        } else {
            for (const key of keysToDelete) {
                this.deletedKVKeys.add(key);
                this.dirtyKVKeys.delete(key);
            }
            this.dirtyKVKeys.add(LAST_ACCESS_KEY);
        }
        this._updatePendingWrites();
    }

    async save(name: string, buffer: Uint8Array): Promise<void> {
        this._markAccess();
        this.memoryFiles.set(name, { data: buffer, ttl: this._ttl() });
        this.dirtyFileNames.add(name);
        this.deletedFileNames.delete(name);
        if (!this.isCloudflare) {
            this.dirtyKVKeys.add(LAST_ACCESS_KEY);
        }
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
        this.deletedFileNames.add(name);
        this.dirtyFileNames.delete(name);
        if (!this.isCloudflare) {
            this.dirtyKVKeys.add(LAST_ACCESS_KEY);
        }
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
        const expiredKVKeys: string[] = [];

        for (const [key, entry] of this.memoryKV) {
            if (entry.ttl < now) {
                this.memoryKV.delete(key);
                expiredKVKeys.push(key);
                if (!this.isCloudflare) {
                    this.deletedKVKeys.add(key);
                    this.dirtyKVKeys.delete(key);
                }
                total++;
            }
        }

        // Persist KV deletions to DO on Cloudflare
        if (this.isCloudflare && expiredKVKeys.length > 0) {
            const stub = await this._getSessionDOStub();
            await Promise.all(expiredKVKeys.map(k => stub.delete(k)));
        }

        for (const [name, entry] of this.memoryFiles) {
            if (entry.ttl < now) {
                this.memoryFiles.delete(name);
                this.deletedFileNames.add(name);
                this.dirtyFileNames.delete(name);
                total++;
            }
        }
        for (const [key, entry] of this.memoryExports) {
            if (entry.ttl < now) {
                this.memoryExports.delete(key);
                this.deletedExportKeys.add(key);
                this.dirtyExportKeys.delete(key);
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
        this.dirtyExportKeys.add(key);
        this.deletedExportKeys.delete(key);
        if (!this.isCloudflare) {
            this.dirtyKVKeys.add(LAST_ACCESS_KEY);
        }
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
            this.deletedExportKeys.add(key);
            this.dirtyExportKeys.delete(key);
            throw new Error(`Export expired: ${name} with key ${key}`);
        }
        return { data: entry.data, expiresAt: new Date(entry.ttl) };
    }

    async close(): Promise<void> {
        await this.backend.close();
    }

    async release(): Promise<void> {
        let flushError: unknown;
        try {
            // Only flush if there are writes that haven't been persisted yet
            // (e.g. by the per-tool-call flush in server.ts). If the last tool
            // call already flushed, this is a no-op and we skip a full DB sync.
            if (this.hasPendingWrites()) {
                await this.flush();
            }
        } catch (e) {
            // Keep the error so we can rethrow it after the lock is released.
            flushError = e;
        } finally {
            // Always release the per-userid lock, even if flush() throws.
            // Otherwise the unresolved promise leaves every subsequent request
            // for this user blocked forever (MCP -32001 timeouts).
            WriteCoordinator.releaseLock(this.userid);
            await this.backend.close();
        }
        if (flushError) throw flushError;
    }
}

function cleanupProcess() {
    setInterval(async () => {
        for (const entry of readdirSync(DB_DIR)) {
            if (!entry.endsWith('.db')) continue;

            const isSystem = !/[a-zA-Z0-9]/.test(entry[0]) || entry === '_auth.db';
            const fullPath = join(DB_DIR, entry);

            try {
                const { DatabaseBackend } = await import('./databaseBackend');
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
if (process.env.BACKEND?.toLowerCase() !== 'cloudflare') {
    cleanupProcess();
}