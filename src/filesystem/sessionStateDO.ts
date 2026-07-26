import { DurableObject } from "cloudflare:workers";

/**
 * Per-user Durable Object for session state (sticky keys like currentFile,
 * currentSheet, currentCell, etc.).
 *
 * Replaces the eventually-consistent Cloudflare KV path with a strongly-
 * consistent DO storage backend so that writes on isolate A are immediately
 * visible to isolate B.
 *
 * RPC methods — called via the DO stub from VirtualFileSystem on Cloudflare.
 * On local Node the VFS uses the existing in-memory Map (no DO).
 */
export class SessionStateDO extends DurableObject {
    /** Read a single key. Returns undefined when missing or expired. */
    async get(key: string): Promise<{ value: string; ttl: string } | undefined> {
        return await this.ctx.storage.get<{ value: string; ttl: string }>(key);
    }

    /** Write a single key with its TTL. */
    async set(key: string, value: string, ttl: string): Promise<void> {
        await this.ctx.storage.put(key, { value, ttl });
    }

    /** Delete a single key. */
    async delete(key: string): Promise<void> {
        await this.ctx.storage.delete(key);
    }

    /** Return every stored entry. */
    async list(): Promise<Array<{ key: string; value: string; ttl: string }>> {
        const map = await this.ctx.storage.list<{ value: string; ttl: string }>();
        const result: Array<{ key: string; value: string; ttl: string }> = [];
        for (const [key, entry] of map) {
            result.push({ key, value: entry.value, ttl: entry.ttl });
        }
        return result;
    }

    /** Return key names that match a prefix. */
    async listByPrefix(prefix: string): Promise<string[]> {
        const map = await this.ctx.storage.list({ prefix });
        return [...map.keys()];
    }

    /** Delete every key that matches a prefix. */
    async deleteByPrefix(prefix: string): Promise<void> {
        const map = await this.ctx.storage.list({ prefix });
        const keys = [...map.keys()];
        if (keys.length > 0) {
            await this.ctx.storage.delete(keys);
        }
    }
}
