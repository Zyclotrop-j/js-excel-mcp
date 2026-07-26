/**
 * Unit tests for the pending-login nonce store (`src/shared/pendingLogin.ts`,
 * T-11). The store now uses an async API (Cloudflare KV + in-memory Map
 * fallback) so every store call is awaited. Covers the six bullets in the
 * ticket's "Tests" section:
 *
 *  - createPendingLogin shape (uuid nonce, expiresAt ≈ now+5min, no sessionId)
 *  - peekPendingLogin is non-destructive
 *  - consumePendingLogin is one-shot
 *  - post-expiry: peek and consume return null
 *  - peekMostRecentPendingLogin: largest expiresAt among sessionId entries
 *  - sweep() removes expired entries and returns the count
 *  - savePendingLogin writes mutations to the store
 *
 * The store is a module-level `Map` singleton shared across tests, so each
 * test creates entries with unique userIds and cleans up via `consume` in a
 * `finally` block. For the expiry / sweep tests, `Date.now` is monkey-patched
 * and restored in a `finally` block (per the ticket's "fake clock" option).
 */
import { strict as assert } from 'assert';
import {
    createPendingLogin,
    savePendingLogin,
    consumePendingLogin,
    peekPendingLogin,
    peekMostRecentPendingLogin,
    sweep,
} from '../../src/shared/pendingLogin.js';

export default function (test: any) {
    const TTL_MS = 5 * 60 * 1000;
    const ORIGINAL_DATE_NOW = Date.now;

    function patchDateNow(offsetMs: number): void {
        Date.now = () => ORIGINAL_DATE_NOW() + offsetMs;
    }

    function restoreDateNow(): void {
        Date.now = ORIGINAL_DATE_NOW;
    }

    test('createPendingLogin: returns entry with uuid nonce, expiresAt ≈ now+5min, sessionId undefined', async () => {
        const before = Date.now();
        const entry = await createPendingLogin('user-create');
        const after = Date.now();
        try {
            assert.equal(typeof entry.nonce, 'string', 'nonce is a string');
            assert.match(
                entry.nonce,
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
                'nonce is a uuid v4'
            );
            assert.equal(entry.userId, 'user-create');
            assert.ok(entry.expiresAt >= before + TTL_MS, 'expiresAt >= now+5min');
            assert.ok(entry.expiresAt <= after + TTL_MS, 'expiresAt <= now+5min');
            assert.equal(entry.sessionId, undefined, 'sessionId starts undefined');
            assert.equal(entry.cookieHeaders, undefined, 'cookieHeaders starts undefined');
        } finally {
            await consumePendingLogin(entry.nonce);
        }
    });

    test('peekPendingLogin: non-destructive, returns entry on repeated calls', async () => {
        const entry = await createPendingLogin('user-peek');
        try {
            const peeked1 = await peekPendingLogin(entry.nonce);
            assert.ok(peeked1 !== null, 'first peek returns the entry');
            assert.equal(peeked1!.nonce, entry.nonce);
            const peeked2 = await peekPendingLogin(entry.nonce);
            assert.ok(peeked2 !== null, 'second peek still returns the entry (non-destructive)');
            assert.equal(peeked2!.nonce, entry.nonce);
        } finally {
            await consumePendingLogin(entry.nonce);
        }
    });

    test('consumePendingLogin: one-shot, returns entry then null on second call', async () => {
        const entry = await createPendingLogin('user-consume');
        const consumed1 = await consumePendingLogin(entry.nonce);
        assert.ok(consumed1 !== null, 'first consume returns the entry');
        assert.equal(consumed1!.nonce, entry.nonce);
        const consumed2 = await consumePendingLogin(entry.nonce);
        assert.equal(consumed2, null, 'second consume returns null (already consumed)');
    });

    test('peek and consume return null for an unknown nonce', async () => {
        const unknown = '00000000-0000-4000-8000-000000000000';
        assert.equal(await peekPendingLogin(unknown), null);
        assert.equal(await consumePendingLogin(unknown), null);
    });

    test('after expiresAt, peek and consume return null', async () => {
        const entry = await createPendingLogin('user-expired');
        patchDateNow(TTL_MS + 1);
        try {
            assert.equal(await peekPendingLogin(entry.nonce), null, 'peek returns null after expiry');
            assert.equal(
                await consumePendingLogin(entry.nonce),
                null,
                'consume returns null after expiry (and removes the entry)'
            );
            assert.equal(
                await peekPendingLogin(entry.nonce),
                null,
                'entry is gone from the store after expired consume'
            );
        } finally {
            restoreDateNow();
            await consumePendingLogin(entry.nonce);
        }
    });

    test('peekMostRecentPendingLogin: returns entry with largest expiresAt among sessionId entries', async () => {
        const base = ORIGINAL_DATE_NOW();
        try {
            Date.now = () => base;
            const noSession = await createPendingLogin('user-no-session');
            Date.now = () => base + 1000;
            const entryA = await createPendingLogin('user-A');
            entryA.sessionId = 'session-A';
            await savePendingLogin(entryA);
            Date.now = () => base + 5000;
            const entryB = await createPendingLogin('user-B');
            entryB.sessionId = 'session-B';
            await savePendingLogin(entryB);
            Date.now = () => base + 10_000;

            const mostRecent = await peekMostRecentPendingLogin();
            assert.ok(mostRecent !== null, 'should return an entry');
            assert.equal(mostRecent!.nonce, entryB.nonce, 'returns entry B (largest expiresAt)');
            assert.equal(mostRecent!.sessionId, 'session-B');

            await consumePendingLogin(noSession.nonce);
            await consumePendingLogin(entryA.nonce);
            await consumePendingLogin(entryB.nonce);
        } finally {
            restoreDateNow();
        }
    });

    test('peekMostRecentPendingLogin: returns null when no entries have sessionId set', async () => {
        const entry = await createPendingLogin('user-no-session-only');
        try {
            assert.equal(await peekMostRecentPendingLogin(), null);
        } finally {
            await consumePendingLogin(entry.nonce);
        }
    });

    test('peekMostRecentPendingLogin: skips expired entries with sessionId', async () => {
        const base = ORIGINAL_DATE_NOW();
        try {
            Date.now = () => base;
            const entry = await createPendingLogin('user-expired-session');
            entry.sessionId = 'session-expired';
            await savePendingLogin(entry);
            Date.now = () => base + TTL_MS + 1;
            assert.equal(
                await peekMostRecentPendingLogin(),
                null,
                'expired entry with sessionId is skipped'
            );
            await consumePendingLogin(entry.nonce);
        } finally {
            restoreDateNow();
        }
    });

    test('sweep: removes expired entries and returns the count', async () => {
        const base = ORIGINAL_DATE_NOW();
        let entry1: Awaited<ReturnType<typeof createPendingLogin>> | null = null;
        let entry2: Awaited<ReturnType<typeof createPendingLogin>> | null = null;
        try {
            Date.now = () => base;
            entry1 = await createPendingLogin('user-sweep-1');
            entry2 = await createPendingLogin('user-sweep-2');

            Date.now = () => base + TTL_MS + 1;

            const removed = await sweep();
            assert.ok(
                removed >= 2,
                `sweep removed at least the 2 entries we created (got ${removed})`
            );
            assert.equal(await peekPendingLogin(entry1.nonce), null, 'entry1 is gone after sweep');
            assert.equal(await peekPendingLogin(entry2.nonce), null, 'entry2 is gone after sweep');
            assert.equal(await sweep(), 0, 'a second sweep finds nothing to remove');
        } finally {
            restoreDateNow();
            if (entry1) await consumePendingLogin(entry1.nonce);
            if (entry2) await consumePendingLogin(entry2.nonce);
        }
    });

    test('savePendingLogin: writes mutations to the store', async () => {
        const entry = await createPendingLogin('user-save');
        try {
            entry.sessionId = 'test-session';
            await savePendingLogin(entry);
            const consumed = await consumePendingLogin(entry.nonce);
            assert.ok(consumed !== null, 'consume returns the entry after save');
            assert.equal(consumed!.sessionId, 'test-session', 'mutations were saved');
        } finally {
            await consumePendingLogin(entry.nonce);
        }
    });
}
