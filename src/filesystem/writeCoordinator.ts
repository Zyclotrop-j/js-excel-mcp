import { LRUCache } from 'lru-cache';

export type KVEntry = { value: string; ttl: string };
export type FileEntry = { data: Uint8Array; ttl: string };
export type ExportEntry = { name: string; key: string; ttl: string; data: Uint8Array };
type LockEntry = { promise: Promise<void>; resolve: () => void };
export type PendingWrite = { kv: Map<string, KVEntry>; files: Map<string, FileEntry>; exports: Map<string, ExportEntry> };

const WRITE_COOLDOWN_MS = 1000;

export class WriteCoordinator {
    private static vfsLocks = new Map<string, LockEntry>();
    private static lastWriteTimestamps = new LRUCache<string, number>({ max: 10000, ttl: 2000 });
    private static pendingWrites = new LRUCache<string, PendingWrite>({ max: 1000, ttl: 10000 });

    static formatKVKey(userid: string, key: string): string {
        return `${userid}:kv:${key}`;
    }

    static formatFileKey(userid: string, name: string): string {
        return `${userid}:file:${name}`;
    }

    static formatExportKey(userid: string, key: string): string {
        return `${userid}:export:${key}`;
    }

    static async acquireLock(userid: string): Promise<void> {
        const existing = WriteCoordinator.vfsLocks.get(userid);
        if (existing) {
            await existing.promise;
        }
        
        let resolve: () => void;
        const promise = new Promise<void>(r => { resolve = r; });
        WriteCoordinator.vfsLocks.set(userid, { promise, resolve: resolve! });
    }

    static releaseLock(userid: string): void {
        const lock = WriteCoordinator.vfsLocks.get(userid);
        if (lock) {
            lock.resolve();
            WriteCoordinator.vfsLocks.delete(userid);
        }
    }

    static updatePendingWrites(userid: string, kv: Map<string, KVEntry>, files: Map<string, FileEntry>, exports: Map<string, ExportEntry>): void {
        WriteCoordinator.pendingWrites.set(userid, {
            kv: new Map(kv),
            files: new Map(files),
            exports: new Map(exports)
        });
    }

    static getPendingWrites(userid: string): PendingWrite | undefined {
        return WriteCoordinator.pendingWrites.get(userid);
    }

    static clearPendingWrites(userid: string): void {
        WriteCoordinator.pendingWrites.delete(userid);
    }

    static async waitForRateLimit(writeKey: string): Promise<void> {
        const lastWrite = WriteCoordinator.lastWriteTimestamps.get(writeKey);
        if (lastWrite !== undefined) {
            const elapsed = Date.now() - lastWrite;
            if (elapsed < WRITE_COOLDOWN_MS) {
                await new Promise(resolve => setTimeout(resolve, WRITE_COOLDOWN_MS - elapsed));
            }
        }
    }

    static recordWrite(writeKey: string): void {
        WriteCoordinator.lastWriteTimestamps.set(writeKey, Date.now());
    }
}
