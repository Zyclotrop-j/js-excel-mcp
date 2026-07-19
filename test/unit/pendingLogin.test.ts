/**
 * Unit tests for the pending-login nonce store (`src/shared/pendingLogin.ts`,
 * T-11). Covers the six bullets in the ticket's "Tests" section:
 *
 *  - createPendingLogin shape (uuid nonce, expiresAt ≈ now+5min, no sessionId)
 *  - peekPendingLogin is non-destructive
 *  - consumePendingLogin is one-shot
 *  - post-expiry: peek and consume return null
 *  - peekMostRecentPendingLogin: largest expiresAt among sessionId entries
 *  - sweep() removes expired entries and returns the count
 *
 * The store is a module-level `Map` singleton shared across tests, so each
 * test creates entries with unique userIds and cleans up via `consume` in a
 * `finally` block. For the expiry / sweep tests, `Date.now` is monkey-patched
 * and restored in a `finally` block (per the ticket's "fake clock" option).
 */
import { strict as assert } from 'assert';
import {
    createPendingLogin,
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

    test('createPendingLogin: returns entry with uuid nonce, expiresAt ≈ now+5min, sessionId undefined', () => {
        const before = Date.now();
        const entry = createPendingLogin('user-create');
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
            consumePendingLogin(entry.nonce);
        }
    });

    test('peekPendingLogin: non-destructive, returns entry on repeated calls', () => {
        const entry = createPendingLogin('user-peek');
        try {
            const peeked1 = peekPendingLogin(entry.nonce);
            assert.ok(peeked1 !== null, 'first peek returns the entry');
            assert.equal(peeked1!.nonce, entry.nonce);
            const peeked2 = peekPendingLogin(entry.nonce);
            assert.ok(peeked2 !== null, 'second peek still returns the entry (non-destructive)');
            assert.equal(peeked2!.nonce, entry.nonce);
        } finally {
            consumePendingLogin(entry.nonce);
        }
    });

    test('consumePendingLogin: one-shot, returns entry then null on second call', () => {
        const entry = createPendingLogin('user-consume');
        const consumed1 = consumePendingLogin(entry.nonce);
        assert.ok(consumed1 !== null, 'first consume returns the entry');
        assert.equal(consumed1!.nonce, entry.nonce);
        const consumed2 = consumePendingLogin(entry.nonce);
        assert.equal(consumed2, null, 'second consume returns null (already consumed)');
    });

    test('peek and consume return null for an unknown nonce', () => {
        const unknown = '00000000-0000-4000-8000-000000000000';
        assert.equal(peekPendingLogin(unknown), null);
        assert.equal(consumePendingLogin(unknown), null);
    });

    test('after expiresAt, peek and consume return null', () => {
        const entry = createPendingLogin('user-expired');
        patchDateNow(TTL_MS + 1);
        try {
            assert.equal(peekPendingLogin(entry.nonce), null, 'peek returns null after expiry');
            assert.equal(
                consumePendingLogin(entry.nonce),
                null,
                'consume returns null after expiry (and removes the entry)'
            );
            assert.equal(
                peekPendingLogin(entry.nonce),
                null,
                'entry is gone from the store after expired consume'
            );
        } finally {
            restoreDateNow();
            consumePendingLogin(entry.nonce);
        }
    });

    test('peekMostRecentPendingLogin: returns entry with largest expiresAt among sessionId entries', () => {
        const base = ORIGINAL_DATE_NOW();
        try {
            // Entry without sessionId — should be skipped.
            Date.now = () => base;
            const noSession = createPendingLogin('user-no-session');
            // Entry A with sessionId.
            Date.now = () => base + 1000;
            const entryA = createPendingLogin('user-A');
            entryA.sessionId = 'session-A';
            // Entry B with sessionId, created later → larger expiresAt.
            Date.now = () => base + 5000;
            const entryB = createPendingLogin('user-B');
            entryB.sessionId = 'session-B';
            // Restore a time where all three are non-expired.
            Date.now = () => base + 10_000;

            const mostRecent = peekMostRecentPendingLogin();
            assert.ok(mostRecent !== null, 'should return an entry');
            assert.equal(mostRecent!.nonce, entryB.nonce, 'returns entry B (largest expiresAt)');
            assert.equal(mostRecent!.sessionId, 'session-B');

            consumePendingLogin(noSession.nonce);
            consumePendingLogin(entryA.nonce);
            consumePendingLogin(entryB.nonce);
        } finally {
            restoreDateNow();
        }
    });

    test('peekMostRecentPendingLogin: returns null when no entries have sessionId set', () => {
        const entry = createPendingLogin('user-no-session-only');
        try {
            assert.equal(peekMostRecentPendingLogin(), null);
        } finally {
            consumePendingLogin(entry.nonce);
        }
    });

    test('peekMostRecentPendingLogin: skips expired entries with sessionId', () => {
        const base = ORIGINAL_DATE_NOW();
        try {
            Date.now = () => base;
            const entry = createPendingLogin('user-expired-session');
            entry.sessionId = 'session-expired';
            Date.now = () => base + TTL_MS + 1;
            assert.equal(
                peekMostRecentPendingLogin(),
                null,
                'expired entry with sessionId is skipped'
            );
            consumePendingLogin(entry.nonce);
        } finally {
            restoreDateNow();
        }
    });

    test('sweep: removes expired entries and returns the count', () => {
        const base = ORIGINAL_DATE_NOW();
        let entry1: ReturnType<typeof createPendingLogin> | null = null;
        let entry2: ReturnType<typeof createPendingLogin> | null = null;
        try {
            Date.now = () => base;
            entry1 = createPendingLogin('user-sweep-1');
            entry2 = createPendingLogin('user-sweep-2');

            // Advance past both entries' expiry.
            Date.now = () => base + TTL_MS + 1;

            const removed = sweep();
            assert.ok(
                removed >= 2,
                `sweep removed at least the 2 entries we created (got ${removed})`
            );
            assert.equal(peekPendingLogin(entry1.nonce), null, 'entry1 is gone after sweep');
            assert.equal(peekPendingLogin(entry2.nonce), null, 'entry2 is gone after sweep');
            assert.equal(sweep(), 0, 'a second sweep finds nothing to remove');
        } finally {
            restoreDateNow();
            if (entry1) consumePendingLogin(entry1.nonce);
            if (entry2) consumePendingLogin(entry2.nonce);
        }
    });
}
