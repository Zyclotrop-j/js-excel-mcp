import { LRUCache } from 'lru-cache';

export type KVEntry = { value: string; ttl: string };
export type FileEntry = { data: Uint8Array; ttl: string };
export type ExportEntry = { name: string; key: string; ttl: string; data: Uint8Array };
export type PendingWrite = { kv: Map<string, KVEntry>; files: Map<string, FileEntry>; exports: Map<string, ExportEntry> };

const WRITE_COOLDOWN_MS = 1000;

export class WriteCoordinator {
    // Per-userid FIFO queue of release callbacks. The entry at index 0 holds the
    // lock; everyone else awaits their ticket before proceeding. This serializes
    // VFS access for a single userid and avoids the lost-wakeup bug of the old
    // single-promise design (where two waiters could both pass the gate and run
    // concurrently, racing on the same DB file).
    private static lockQueues = new Map<string, Array<() => void>>();
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
        const queue = WriteCoordinator.lockQueues.get(userid) ?? [];
        let release!: () => void;
        const ticket = new Promise<void>(r => { release = r; });
        queue.push(release);
        WriteCoordinator.lockQueues.set(userid, queue);
        if (queue.length === 1) {
            return; // front of the queue — proceed immediately
        }
        await ticket;
    }

    static releaseLock(userid: string): void {
        const queue = WriteCoordinator.lockQueues.get(userid);
        if (!queue || queue.length === 0) return;
        queue.shift(); // remove ourselves (we are always at the front)
        if (queue.length > 0) {
            queue[0](); // hand the lock to the next waiter
        } else {
            WriteCoordinator.lockQueues.delete(userid);
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
