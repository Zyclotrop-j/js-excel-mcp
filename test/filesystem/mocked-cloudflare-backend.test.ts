/**
 * Smoke tests for CloudflareBackend using in-memory Map-based stubs that
 * mirror the @modelcontextprotocol/server worker-env convention
 * (KVNamespace.list/get/put/delete/getWithMetadata + R2Bucket.list/get/put/delete/head).
 */
import { strict as assert } from 'node:assert';
import { CloudflareBackend } from '../../src/filesystem/cloudflareBackend.js';
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';

type KVRecord = { value: string; metadata: { ttl: string } };
type R2Object = { key: string; customMetadata: Record<string, string> | undefined; body: Uint8Array };

function makeKVStub(): KVNamespace {
    const store = new Map<string, KVRecord>();
    const kv = {
        async list({ prefix, cursor }: { prefix?: string; cursor?: string } = {}): Promise<{
            keys: { name: string }[];
            list_complete: boolean;
            cursor?: string;
        }> {
            const matched = Array.from(store.keys()).filter(k => prefix === undefined || k.startsWith(prefix));
            const PAGE = 1000;
            return {
                keys: matched.map(name => ({ name })),
                list_complete: true,
                cursor: undefined
            };
        },
        async get(name: string): Promise<string | null> {
            return store.has(name) ? store.get(name)!.value : null;
        },
        async getWithMetadata<T>(name: string): Promise<{ value: string | null; metadata: T | null }> {
            const rec = store.get(name);
            return rec ? { value: rec.value, metadata: rec.metadata as unknown as T } : { value: null, metadata: null };
        },
        async put(name: string, value: string, opts?: { metadata?: Record<string, unknown> } & Record<string, unknown>): Promise<void> {
            store.set(name, { value, metadata: { ttl: String((opts?.metadata as { ttl?: string } | undefined)?.ttl ?? '') } });
        },
        async delete(name: string): Promise<void> {
            store.delete(name);
        }
    };
    return kv as unknown as KVNamespace;
}

function makeR2Stub(): R2Bucket {
    const store = new Map<string, R2Object>();
    const bucket = {
        async list({ prefix, cursor }: { prefix?: string; cursor?: string } = {}): Promise<{
            objects: { key: string; customMetadata: Record<string, string> | undefined }[];
            truncated: boolean;
            cursor?: string;
        }> {
            const matched = Array.from(store.entries())
                .filter(([k]) => prefix === undefined || k.startsWith(prefix))
                .map(([key, obj]) => ({ key, customMetadata: obj.customMetadata }));
            return { objects: matched, truncated: false, cursor: undefined };
        },
        async get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null> {
            const obj = store.get(key);
            if (!obj) return null;
            return {
                async arrayBuffer(): Promise<ArrayBuffer> {
                    return obj.body.buffer.slice(obj.body.byteOffset, obj.body.byteOffset + obj.body.byteLength) as ArrayBuffer;
                }
            };
        },
        async put(key: string, data: Uint8Array, opts?: { customMetadata?: Record<string, string> } & Record<string, unknown>): Promise<void> {
            const slice = new Uint8Array(data.byteLength);
            slice.set(data);
            store.set(key, { key, customMetadata: opts?.customMetadata, body: slice });
        },
        async delete(key: string): Promise<void> {
            store.delete(key);
        },
        async head(key: string): Promise<{ customMetadata: Record<string, string> | undefined } | null> {
            const obj = store.get(key);
            return obj ? { customMetadata: obj.customMetadata } : null;
        }
    };
    return bucket as unknown as R2Bucket;
}

function makeEnv() {
    return { KV: makeKVStub(), MY_BUCKET: makeR2Stub(), MY_EXPORTS: makeR2Stub() } as const;
}

export default function (test: any) {
    test('CloudflareBackend: transaction(fn) returns fn()\'s result (passthrough)', async () => {
        const env = makeEnv();
        const backend = new CloudflareBackend(env, 'test.db');
        const sentinel = { ok: true };
        const result = await backend.transaction(() => sentinel);
        assert.equal(result, sentinel);
        await backend.close();
    });

    test('CloudflareBackend: close() does not throw', async () => {
        const env = makeEnv();
        const backend = new CloudflareBackend(env, 'test.db');
        await backend.close();
        assert.ok(true);
    });

    test('CloudflareBackend: insertOrReplaceKV then selectAllKV returns the inserted row', async () => {
        const env = makeEnv();
        const backend = new CloudflareBackend(env, 'test.db');
        const ttl = new Date(Date.now() + 60000).toISOString();
        await backend.insertOrReplaceKV('key1', 'value1', ttl);
        const rows = await backend.selectAllKV();
        assert.equal(rows.length, 1);
        assert.equal(rows[0].key, 'key1');
        assert.equal(rows[0].value, 'value1');
        assert.equal(rows[0].ttl, ttl);
        await backend.close();
    });

    test('CloudflareBackend: insertOrReplaceKV overwrites a previous value', async () => {
        const env = makeEnv();
        const backend = new CloudflareBackend(env, 'test.db');
        const ttl1 = new Date(Date.now() + 60000).toISOString();
        const ttl2 = new Date(Date.now() + 120000).toISOString();
        await backend.insertOrReplaceKV('k', 'v1', ttl1);
        await backend.insertOrReplaceKV('k', 'v2', ttl2);
        const rows = await backend.selectAllKV();
        assert.equal(rows.length, 1);
        assert.equal(rows[0].value, 'v2');
        assert.equal(rows[0].ttl, ttl2);
        await backend.close();
    });
}