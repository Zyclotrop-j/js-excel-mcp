/**
 * Pending-login nonce store — cross-isolate aware.
 *
 * Lets the auth tools (signup / signin / recover — T-41/T-42/T-43) hand a
 * freshly-created better-auth session to the auth server's `/sign-in` route
 * (T-22), so the OAuth authorization-code flow can complete without the LLM
 * having to manually thread credentials through query params.
 *
 * ## Backend selection
 *
 * - **Cloudflare Workers** (`BACKEND=cloudflare`): entries are written to the
 *   `KEY_VALUE_STORE` KV binding so they survive across isolate boundaries.
 *   Each isolate has its own module graph, so a module-level `Map` would be
 *   invisible to requests landing on a different isolate.
 * - **Local Node** (default): a module-level `Map` is sufficient because both
 *   Express apps share one process and one module graph (confirmed by T-01).
 *
 * Contract `[C-PL]` (STUDY_FIRST §7) — extended by T-11 with
 * {@link peekMostRecentPendingLogin} and {@link sweep}.
 *
 * No persistence beyond the KV TTL. A process restart drops all pending
 * logins; the LLM just retries the auth tool. No better-auth import —
 * the store is auth-framework-agnostic.
 */

import { randomUUID } from 'node:crypto';
import { getWorkerEnv } from '../util/workerEnv';

export interface PendingLogin {
    /** Opaque, uuid v4 (crypto.randomUUID()). */
    nonce: string;
    /** better-auth user id. */
    userId: string;
    /** Epoch ms, NOW + 5 min. */
    expiresAt: number;
    /** Set by the auth tool after signInEmail succeeds. */
    sessionId?: string;
    /** Set-Cookie headers from the signInEmail response (if captured). */
    cookieHeaders?: string[];
}

/** TTL: 5 minutes from creation. */
const TTL_MS = 5 * 60 * 1000;

/** KV TTL in seconds (Cloudflare KV `expirationTtl` is in seconds). */
const TTL_SECONDS = 300;

const KV_PREFIX = 'pending-login:';

// In-memory fallback (local Node mode). Visible from both Express apps in
// one process. Not needed on Workers — KV is used instead.
const store = new Map<string, PendingLogin>();

function isKvAvailable(): boolean {
    return process.env.BACKEND?.toLowerCase() === 'cloudflare'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        && !!(getWorkerEnv() as any)?.KEY_VALUE_STORE;
}

function isExpired(entry: PendingLogin, now: number): boolean {
    return entry.expiresAt <= now;
}

/**
 * Create a pending-login entry with a fresh uuid nonce and a 5-minute TTL.
 * For in-memory mode, the entry is stored in the Map immediately so callers
 * that only call consume/peek (without savePendingLogin) still work.
 * For KV mode, the caller must call savePendingLogin after mutating
 * cookieHeaders/sessionId.
 */
export async function createPendingLogin(userId: string): Promise<PendingLogin> {
    if (!isKvAvailable()) {
        sweepSync();
    }
    const entry: PendingLogin = {
        nonce: randomUUID(),
        userId,
        expiresAt: Date.now() + TTL_MS,
    };
    if (!isKvAvailable()) {
        store.set(entry.nonce, entry);
    }
    return entry;
}

/**
 * Write a mutated PendingLogin to the store. For KV mode this is the
 * actual write (after the caller has set cookieHeaders/sessionId).
 * For in-memory mode this is a no-op re-set (the reference is already
 * in the Map from createPendingLogin).
 */
export async function savePendingLogin(pending: PendingLogin): Promise<void> {
    if (isKvAvailable()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kv = (getWorkerEnv() as any).KEY_VALUE_STORE;
        await kv.put(KV_PREFIX + pending.nonce, JSON.stringify(pending), {
            expirationTtl: TTL_SECONDS,
        });
    } else {
        store.set(pending.nonce, pending);
    }
}

/**
 * One-shot: removes the entry and returns it, or returns `null` if not
 * found / expired. Used by `/sign-in` (T-22) when the nonce is supplied
 * via query param.
 */
export async function consumePendingLogin(nonce: string): Promise<PendingLogin | null> {
    if (isKvAvailable()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kv = (getWorkerEnv() as any).KEY_VALUE_STORE;
        const raw = await kv.get(KV_PREFIX + nonce);
        if (!raw) return null;
        await kv.delete(KV_PREFIX + nonce);
        const entry = JSON.parse(raw) as PendingLogin;
        if (isExpired(entry, Date.now())) return null;
        return entry;
    }
    const entry = store.get(nonce);
    if (!entry) return null;
    store.delete(nonce);
    if (isExpired(entry, Date.now())) return null;
    return entry;
}

/**
 * Non-destructive peek. Returns the entry or `null` if not found / expired.
 * Used by `/sign-in` (T-22) when polling for a pending session.
 */
export async function peekPendingLogin(nonce: string): Promise<PendingLogin | null> {
    if (isKvAvailable()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kv = (getWorkerEnv() as any).KEY_VALUE_STORE;
        const raw = await kv.get(KV_PREFIX + nonce);
        if (!raw) return null;
        const entry = JSON.parse(raw) as PendingLogin;
        if (isExpired(entry, Date.now())) return null;
        return entry;
    }
    const entry = store.get(nonce);
    if (!entry) return null;
    if (isExpired(entry, Date.now())) return null;
    return entry;
}

/**
 * Returns the most recent unexpired entry whose `sessionId` is set (i.e.
 * the signup tool has finished calling `signInEmail`), or `null` if none
 * qualify. Fallback mechanism when the nonce can't be threaded via query
 * string — see T-01's notes on `/sign-in` ↔ nonce handoff.
 *
 * "Most recent" = largest `expiresAt` (since `expiresAt = createdAt + TTL`,
 * a larger value means a later creation).
 */
export async function peekMostRecentPendingLogin(): Promise<PendingLogin | null> {
    const now = Date.now();
    if (isKvAvailable()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kv = (getWorkerEnv() as any).KEY_VALUE_STORE;
        const listed = await kv.list({ prefix: KV_PREFIX });
        let best: PendingLogin | null = null;
        for (const { name } of listed.keys) {
            const raw = await kv.get(name);
            if (!raw) continue;
            const entry = JSON.parse(raw) as PendingLogin;
            if (entry.sessionId === undefined) continue;
            if (isExpired(entry, now)) continue;
            if (best === null || entry.expiresAt > best.expiresAt) {
                best = entry;
            }
        }
        return best;
    }
    let best: PendingLogin | null = null;
    for (const entry of store.values()) {
        if (entry.sessionId === undefined) continue;
        if (isExpired(entry, now)) continue;
        if (best === null || entry.expiresAt > best.expiresAt) {
            best = entry;
        }
    }
    return best;
}

/**
 * Removes expired entries. Returns the count removed. Called by
 * {@link createPendingLogin} on each use (in-memory mode) so the Map
 * doesn't grow unboundedly; also safe to call directly.
 */
export async function sweep(): Promise<number> {
    if (isKvAvailable()) {
        return sweepKv();
    }
    return sweepSync();
}

function sweepSync(): number {
    const now = Date.now();
    let removed = 0;
    for (const [nonce, entry] of store) {
        if (isExpired(entry, now)) {
            store.delete(nonce);
            removed++;
        }
    }
    return removed;
}

async function sweepKv(): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kv = (getWorkerEnv() as any).KEY_VALUE_STORE;
    const listed = await kv.list({ prefix: KV_PREFIX });
    const now = Date.now();
    let removed = 0;
    for (const { name } of listed.keys) {
        const raw = await kv.get(name);
        if (!raw) continue;
        const entry = JSON.parse(raw) as PendingLogin;
        if (isExpired(entry, now)) {
            await kv.delete(name);
            removed++;
        }
    }
    return removed;
}
