import type { IDatabaseBackend } from './IDatabaseBackend.js';

type KVEntry = { key: string; value: string; ttl: string };
type FileEntry = { name: string; data: Buffer; ttl: string };
type ExportEntry = { key: string; name: string; ttl: string; data: Buffer };

const DEFAULT_LATENCY_MS = 5;
const WRITE_COOLDOWN_MS = 1000;

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class MemoryBackend implements IDatabaseBackend {
    private kv = new Map<string, KVEntry>();
    private files = new Map<string, FileEntry>();
    private exports = new Map<string, ExportEntry>();
    private lastWriteTimestamps = new Map<string, number>();
    private closed = false;
    private writeCounts = new Map<string, number>();
    private latencyMs: { min: number; max: number };

    constructor(
        private dbPath: string,
        latency?: { min?: number; max?: number },
    ) {
        this.latencyMs = {
            min: latency?.min ?? DEFAULT_LATENCY_MS,
            max: latency?.max ?? DEFAULT_LATENCY_MS * 3,
        };
    }

    private async simulateLatency(): Promise<void> {
        const { min, max } = this.latencyMs;
        const ms = min + Math.random() * (max - min);
        await delay(ms);
    }

    private async waitForRateLimit(key: string): Promise<void> {
        const lastWrite = this.lastWriteTimestamps.get(key);
        if (lastWrite !== undefined) {
            const elapsed = Date.now() - lastWrite;
            if (elapsed < WRITE_COOLDOWN_MS) {
                await delay(WRITE_COOLDOWN_MS - elapsed);
            }
        }
    }

    private recordWrite(key: string): void {
        this.lastWriteTimestamps.set(key, Date.now());
        this.writeCounts.set(key, (this.writeCounts.get(key) ?? 0) + 1);
    }

    private assertOpen(): void {
        if (this.closed) throw new Error('Backend is closed');
    }

    async selectAllKV(): Promise<KVEntry[]> {
        this.assertOpen();
        await this.simulateLatency();
        return [...this.kv.values()];
    }

    async selectAllFiles(): Promise<FileEntry[]> {
        this.assertOpen();
        await this.simulateLatency();
        return [...this.files.values()];
    }

    async selectAllExports(): Promise<ExportEntry[]> {
        this.assertOpen();
        await this.simulateLatency();
        return [...this.exports.values()];
    }

    async deleteAllKV(): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        this.kv.clear();
    }

    async deleteAllFiles(): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        this.files.clear();
    }

    async deleteAllExports(): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        this.exports.clear();
    }

    async insertKV(key: string, value: string, ttl: string): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        const rateKey = `kv:${key}`;
        await this.waitForRateLimit(rateKey);
        this.kv.set(key, { key, value, ttl });
        this.recordWrite(rateKey);
    }

    async insertFile(name: string, data: Uint8Array, ttl: string): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        const rateKey = `file:${name}`;
        await this.waitForRateLimit(rateKey);
        this.files.set(name, { name, data: Buffer.from(data), ttl });
        this.recordWrite(rateKey);
    }

    async insertExport(key: string, name: string, ttl: string, data: Uint8Array): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        const rateKey = `export:${key}`;
        await this.waitForRateLimit(rateKey);
        this.exports.set(key, { key, name, ttl, data: Buffer.from(data) });
        this.recordWrite(rateKey);
    }

    async insertOrReplaceKV(key: string, value: string, ttl: string): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        const rateKey = `kv:${key}`;
        await this.waitForRateLimit(rateKey);
        this.kv.set(key, { key, value, ttl });
        this.recordWrite(rateKey);
    }

    async insertOrReplaceExport(key: string, name: string, ttl: string, data: Uint8Array): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        const rateKey = `export:${key}`;
        await this.waitForRateLimit(rateKey);
        this.exports.set(key, { key, name, ttl, data: Buffer.from(data) });
        this.recordWrite(rateKey);
    }

    async insertOrReplaceFile(name: string, data: Uint8Array, ttl: string): Promise<void> {
        this.assertOpen();
        await this.simulateLatency();
        const rateKey = `file:${name}`;
        await this.waitForRateLimit(rateKey);
        this.files.set(name, { name, data: Buffer.from(data), ttl });
        this.recordWrite(rateKey);
    }

    async selectFileTTL(name: string): Promise<{ ttl: string } | undefined> {
        this.assertOpen();
        await this.simulateLatency();
        const entry = this.files.get(name);
        return entry ? { ttl: entry.ttl } : undefined;
    }

    async selectKVTTL(key: string): Promise<{ ttl: string } | undefined> {
        this.assertOpen();
        await this.simulateLatency();
        const entry = this.kv.get(key);
        return entry ? { ttl: entry.ttl } : undefined;
    }

    async selectKVValue(key: string): Promise<{ value: string } | undefined> {
        this.assertOpen();
        await this.simulateLatency();
        const entry = this.kv.get(key);
        return entry ? { value: entry.value } : undefined;
    }

    async transaction<T>(fn: () => T): Promise<T> {
        this.assertOpen();
        await this.simulateLatency();
        const snapshot = {
            kv: new Map(this.kv),
            files: new Map(this.files),
            exports: new Map(this.exports),
        };
        try {
            const result = fn();
            if (result instanceof Promise) await result;
            return result as T;
        } catch (e) {
            this.kv = snapshot.kv;
            this.files = snapshot.files;
            this.exports = snapshot.exports;
            throw e;
        }
    }

    async close(): Promise<void> {
        this.closed = true;
    }

    getWriteCount(key: string): number {
        return this.writeCounts.get(key) ?? 0;
    }
}
