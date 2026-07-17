import { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import type { IDatabaseBackend } from './IDatabaseBackend.js';

/**
 * Cloudflare Workers environment bindings
 */
export interface CloudflareWorkerEnv {
    KV: KVNamespace;
    MY_BUCKET: R2Bucket;
    MY_EXPORTS: R2Bucket;
}

/**
 * Cloudflare backend implementation using KV and R2.
 * 
 * Storage mapping:
 * - KV table → Cloudflare KV with keys prefixed by `{dbPath}:kv:`
 * - Files table → R2 bucket MY_BUCKET with keys prefixed by `{dbPath}:files:`
 * - Exports table → R2 bucket MY_EXPORTS with keys prefixed by `{dbPath}:exports:`
 * 
 * TTL is stored as metadata on each object.
 */
export class CloudflareBackend implements IDatabaseBackend {
    private env: CloudflareWorkerEnv;
    private dbPath: string;

    constructor(env: CloudflareWorkerEnv, dbPath: string) {
        this.env = env;
        this.dbPath = dbPath;
    }

    private kvKey(key: string): string {
        return `${this.dbPath}:kv:${key}`;
    }

    private fileKey(name: string): string {
        return `${this.dbPath}:files:${name}`;
    }

    private exportKey(key: string): string {
        return `${this.dbPath}:exports:${key}`;
    }

    async selectAllKV(): Promise<Array<{ key: string; value: string; ttl: string }>> {
        const prefix = `${this.dbPath}:kv:`;
        const result: Array<{ key: string; value: string; ttl: string }> = [];
        
        let cursor: string | undefined;
        do {
            const list = await this.env.KV.list({ prefix, cursor });
            const entries = await Promise.all(
                list.keys.map(async (key) => {
                    const [value, metadata] = await Promise.all([
                        this.env.KV.get(key.name),
                        this.env.KV.getWithMetadata<{ ttl: string }>(key.name)
                    ]);
                    if (value !== null && metadata.metadata?.ttl) {
                        const actualKey = key.name.substring(prefix.length);
                        return { key: actualKey, value, ttl: metadata.metadata.ttl };
                    }
                    return null;
                })
            );
            result.push(...entries.filter((e): e is NonNullable<typeof e> => e !== null));
            cursor = list.list_complete ? undefined : list.cursor;
        } while (cursor);
        
        return result;
    }

    async selectAllFiles(): Promise<Array<{ name: string; data: Buffer; ttl: string }>> {
        const prefix = `${this.dbPath}:files:`;
        const result: Array<{ name: string; data: Buffer; ttl: string }> = [];
        
        let cursor: string | undefined;
        do {
            const list = await this.env.MY_BUCKET.list({ prefix, cursor });
            const entries = await Promise.all(
                list.objects.map(async (obj) => {
                    if (!obj.customMetadata?.ttl) return null;
                    const data = await this.env.MY_BUCKET.get(obj.key);
                    if (data) {
                        const actualName = obj.key.substring(prefix.length);
                        const arrayBuffer = await data.arrayBuffer();
                        return { name: actualName, data: Buffer.from(arrayBuffer), ttl: obj.customMetadata.ttl };
                    }
                    return null;
                })
            );
            result.push(...entries.filter((e): e is NonNullable<typeof e> => e !== null));
            cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);
        
        return result;
    }

    async selectAllExports(): Promise<Array<{ key: string; name: string; ttl: string; data: Buffer }>> {
        const prefix = `${this.dbPath}:exports:`;
        const result: Array<{ key: string; name: string; ttl: string; data: Buffer }> = [];
        
        let cursor: string | undefined;
        do {
            const list = await this.env.MY_EXPORTS.list({ prefix, cursor });
            const entries = await Promise.all(
                list.objects.map(async (obj) => {
                    if (!obj.customMetadata?.ttl || !obj.customMetadata?.name) return null;
                    const data = await this.env.MY_EXPORTS.get(obj.key);
                    if (data) {
                        const actualKey = obj.key.substring(prefix.length);
                        const arrayBuffer = await data.arrayBuffer();
                        return { 
                            key: actualKey, 
                            name: obj.customMetadata.name, 
                            ttl: obj.customMetadata.ttl,
                            data: Buffer.from(arrayBuffer) 
                        };
                    }
                    return null;
                })
            );
            result.push(...entries.filter((e): e is NonNullable<typeof e> => e !== null));
            cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);
        
        return result;
    }

    async deleteAllKV(): Promise<void> {
        const prefix = `${this.dbPath}:kv:`;
        let cursor: string | undefined;
        do {
            const list = await this.env.KV.list({ prefix, cursor });
            await Promise.all(list.keys.map(k => this.env.KV.delete(k.name)));
            cursor = list.list_complete ? undefined : list.cursor;
        } while (cursor);
    }

    async deleteAllFiles(): Promise<void> {
        const prefix = `${this.dbPath}:files:`;
        let cursor: string | undefined;
        do {
            const list = await this.env.MY_BUCKET.list({ prefix, cursor });
            await Promise.all(list.objects.map(obj => this.env.MY_BUCKET.delete(obj.key)));
            cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);
    }

    async deleteAllExports(): Promise<void> {
        const prefix = `${this.dbPath}:exports:`;
        let cursor: string | undefined;
        do {
            const list = await this.env.MY_EXPORTS.list({ prefix, cursor });
            await Promise.all(list.objects.map(obj => this.env.MY_EXPORTS.delete(obj.key)));
            cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);
    }

    async insertKV(key: string, value: string, ttl: string): Promise<void> {
        await this.env.KV.put(this.kvKey(key), value, { metadata: { ttl } });
    }

    async insertFile(name: string, data: Uint8Array, ttl: string): Promise<void> {
        await this.env.MY_BUCKET.put(this.fileKey(name), data, {
            customMetadata: { ttl }
        });
    }

    async insertExport(key: string, name: string, ttl: string, data: Uint8Array): Promise<void> {
        await this.env.MY_EXPORTS.put(this.exportKey(key), data, {
            customMetadata: { ttl, name }
        });
    }

    async insertOrReplaceKV(key: string, value: string, ttl: string): Promise<void> {
        await this.env.KV.put(this.kvKey(key), value, { metadata: { ttl } });
    }

    async insertOrReplaceFile(name: string, data: Uint8Array, ttl: string): Promise<void> {
        await this.env.MY_BUCKET.put(this.fileKey(name), data, {
            customMetadata: { ttl }
        });
    }

    async selectFileTTL(name: string): Promise<{ ttl: string } | undefined> {
        const obj = await this.env.MY_BUCKET.head(this.fileKey(name));
        if (obj && obj.customMetadata?.ttl) {
            return { ttl: obj.customMetadata.ttl };
        }
        return undefined;
    }

    async selectKVTTL(key: string): Promise<{ ttl: string } | undefined> {
        const metadata = await this.env.KV.getWithMetadata<{ ttl: string }>(this.kvKey(key));
        if (metadata.value !== null && metadata.metadata?.ttl) {
            return { ttl: metadata.metadata.ttl };
        }
        return undefined;
    }

    async selectKVValue(key: string): Promise<{ value: string } | undefined> {
        const value = await this.env.KV.get(this.kvKey(key));
        if (value !== null) {
            return { value };
        }
        return undefined;
    }

    async transaction<T>(fn: () => T): Promise<T> {
        // Cloudflare KV and R2 don't support transactions
        // We just execute the function directly
        // Note: This means operations are not atomic
        return fn();
    }

    async close(): Promise<void> {
        // No-op for Cloudflare backend
        // Resources are managed by the Cloudflare runtime
    }
}
