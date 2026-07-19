/**
 * In-process pending-login nonce store.
 *
 * Lets the auth tools (signup / signin / recover — T-41/T-42/T-43) hand a
 * freshly-created better-auth session to the auth server's `/sign-in` route
 * (T-22), so the OAuth authorization-code flow can complete without the LLM
 * having to manually thread credentials through query params.
 *
 * See `tickets/real-auth/STUDY_FIRST.md` §5 "The two-process-same-process
 * trick": both Express apps (MCP on :3000, AS on :3001) share one Node
 * process and one module graph, so this module-level `Map` is visible from
 * both the auth-tool callback and the `/sign-in` route. Confirmed by the
 * T-01 spike (`tickets/real-auth/notes/T-01-notes.md` §4).
 *
 * Contract `[C-PL]` (STUDY_FIRST §7) — extended by T-11 with
 * {@link peekMostRecentPendingLogin} and {@link sweep}.
 *
 * No persistence. A process restart drops all pending logins; the LLM just
 * retries the auth tool. No better-auth import — the store is
 * auth-framework-agnostic.
 */

import { randomUUID } from 'node:crypto';

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

/**
 * Module-level singleton. Visible from both Express apps in this process.
 * No persistence — see file header.
 */
const store = new Map<string, PendingLogin>();

function isExpired(entry: PendingLogin, now: number): boolean {
    return entry.expiresAt <= now;
}

/**
 * Create a pending-login entry with a fresh uuid nonce and a 5-minute TTL.
 * Runs {@link sweep} first (cheap) so the Map doesn't grow unboundedly.
 *
 * The returned object is the **same reference** stored in the Map; the auth
 * tool mutates `sessionId` / `cookieHeaders` on it after `signInEmail`
 * succeeds. `/sign-in` (T-22) then reads those fields via `consume` or
 * `peek`.
 */
export function createPendingLogin(userId: string): PendingLogin {
    sweep();
    const entry: PendingLogin = {
        nonce: randomUUID(),
        userId,
        expiresAt: Date.now() + TTL_MS,
    };
    store.set(entry.nonce, entry);
    return entry;
}

/**
 * One-shot: removes the entry and returns it, or returns `null` if not
 * found / expired. Used by `/sign-in` (T-22) when the nonce is supplied
 * via query param.
 */
export function consumePendingLogin(nonce: string): PendingLogin | null {
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
export function peekPendingLogin(nonce: string): PendingLogin | null {
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
export function peekMostRecentPendingLogin(): PendingLogin | null {
    const now = Date.now();
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
 * {@link createPendingLogin} on each use so the Map doesn't grow
 * unboundedly; also safe to call directly.
 */
export function sweep(): number {
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
