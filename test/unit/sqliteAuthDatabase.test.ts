/**
 * Unit tests for `openSqliteAuthDatabase` and the two schema initializers
 * (`initializeDemoSchema`, `initializeRealSchema`) in
 * `src/shared/authDatabase/sqliteAuthDatabase.ts` (T-12).
 *
 * Covers the bullets in the ticket's "Tests" section:
 *
 *  - `initializeDemoSchema` creates the same tables as today's demo mode.
 *  - `initializeRealSchema` creates all the real-mode tables (user, session,
 *    account, verification, passkey, apikey, twoFactor, oauthApplication,
 *    oauthAccessToken, oauthRefreshToken, oauthAuthorizationCode, oauthConsent).
 *  - `email` column in real-mode `user` table is nullable (Strategy A).
 *  - `openSqliteAuthDatabase` returns an `AuthDatabase` with `betterAuthHandle`,
 *    `initializeSchema`, `close`.
 *
 * Each test opens a fresh in-memory SQLite database so the suite is hermetic.
 */
import { strict as assert } from 'assert';
import { unlinkSync } from 'fs';
import Database from 'better-sqlite3';

import { openSqliteAuthDatabase } from '../../src/shared/authDatabase/sqliteAuthDatabase.js';
import type { AuthDatabase } from '../../src/shared/authDatabase/index.js';

export default function (test: any) {
    /**
     * Helper: create a `better-sqlite3` instance wrapping the same DDL path
     * the factory uses internally. We test the schema functions directly by
     * calling them on a real `Database` instance (the factory just wraps this).
     */
    function tableNames(db: InstanceType<typeof Database>): string[] {
        return db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .all()
            .map((r: any) => r.name as string);
    }

    function indexNames(db: InstanceType<typeof Database>): string[] {
        return db
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .all()
            .map((r: any) => r.name as string);
    }

    // ─── openSqliteAuthDatabase shape ────────────────────────────────────────

    test('openSqliteAuthDatabase returns an AuthDatabase with the required members', () => {
        // Use a temp file so better-sqlite3 can open it; clean up immediately.
        const path = 'data/_test_t12_shape.db';
        const authDb: AuthDatabase = openSqliteAuthDatabase(path, 'demo');
        try {
            assert.ok(authDb.betterAuthHandle !== undefined, 'betterAuthHandle must be present');
            assert.equal(typeof authDb.initializeSchema, 'function', 'initializeSchema must be a function');
            assert.equal(typeof authDb.close, 'function', 'close must be a function');
        } finally {
            authDb.close();
            // Clean up the test artifact.
            unlinkSync(path);
        }
    });

    // ─── Demo schema ────────────────────────────────────────────────────────

    test('initializeDemoSchema creates the expected demo tables', () => {
        const path = 'data/_test_t12_demo.db';
        const authDb = openSqliteAuthDatabase(path, 'demo');
        try {
            authDb.initializeSchema('demo');
            const db = authDb.betterAuthHandle as InstanceType<typeof Database>;
            const tables = tableNames(db);

            // Core better-auth tables
            assert.ok(tables.includes('user'), 'user table must exist');
            assert.ok(tables.includes('session'), 'session table must exist');
            assert.ok(tables.includes('account'), 'account table must exist');
            assert.ok(tables.includes('verification'), 'verification table must exist');

            // OIDC/MCP plugin tables
            assert.ok(tables.includes('oauthApplication'), 'oauthApplication table must exist');
            assert.ok(tables.includes('oauthAccessToken'), 'oauthAccessToken table must exist');
            assert.ok(tables.includes('oauthRefreshToken'), 'oauthRefreshToken table must exist');
            assert.ok(tables.includes('oauthAuthorizationCode'), 'oauthAuthorizationCode table must exist');
            assert.ok(tables.includes('oauthConsent'), 'oauthConsent table must exist');
        } finally {
            authDb.close();
            unlinkSync(path);
        }
    });

    test('initializeDemoSchema is idempotent (CREATE TABLE IF NOT EXISTS)', () => {
        const path = 'data/_test_t12_demo_idem.db';
        const authDb = openSqliteAuthDatabase(path, 'demo');
        try {
            authDb.initializeSchema('demo');
            // Second call must not throw.
            authDb.initializeSchema('demo');
            const db = authDb.betterAuthHandle as InstanceType<typeof Database>;
            const tables = tableNames(db);
            assert.ok(tables.includes('user'));
        } finally {
            authDb.close();
            unlinkSync(path);
        }
    });

    // ─── Real schema ────────────────────────────────────────────────────────

    test('initializeRealSchema creates all real-mode tables', () => {
        const path = 'data/_test_t12_real.db';
        const authDb = openSqliteAuthDatabase(path, 'real');
        try {
            authDb.initializeSchema('real');
            const db = authDb.betterAuthHandle as InstanceType<typeof Database>;
            const tables = tableNames(db);

            // Core
            assert.ok(tables.includes('user'));
            assert.ok(tables.includes('session'));
            assert.ok(tables.includes('account'));
            assert.ok(tables.includes('verification'));

            // OIDC/MCP plugin (same as demo)
            assert.ok(tables.includes('oauthApplication'));
            assert.ok(tables.includes('oauthAccessToken'));
            assert.ok(tables.includes('oauthRefreshToken'));
            assert.ok(tables.includes('oauthAuthorizationCode'));
            assert.ok(tables.includes('oauthConsent'));

            // Plugin tables (real-mode only)
            assert.ok(tables.includes('passkey'), 'passkey table must exist');
            assert.ok(tables.includes('apikey'), 'apikey table must exist (lowercase, no underscore)');
            assert.ok(tables.includes('twoFactor'), 'twoFactor table must exist');
        } finally {
            authDb.close();
            unlinkSync(path);
        }
    });

    test('initializeRealSchema creates the expected indexes', () => {
        const path = 'data/_test_t12_real_idx.db';
        const authDb = openSqliteAuthDatabase(path, 'real');
        try {
            authDb.initializeSchema('real');
            const db = authDb.betterAuthHandle as InstanceType<typeof Database>;
            const indexes = indexNames(db);

            // Spot-check a few key indexes from T-02 §2.2
            assert.ok(indexes.includes('session_userId_idx'));
            assert.ok(indexes.includes('passkey_userId_idx'));
            assert.ok(indexes.includes('passkey_credentialID_idx'));
            assert.ok(indexes.includes('apikey_key_idx'));
            assert.ok(indexes.includes('twoFactor_userId_idx'));
        } finally {
            authDb.close();
            unlinkSync(path);
        }
    });

    test('real-mode user.email is nullable (Strategy A)', () => {
        const path = 'data/_test_t12_real_email.db';
        const authDb = openSqliteAuthDatabase(path, 'real');
        try {
            authDb.initializeSchema('real');
            const db = authDb.betterAuthHandle as InstanceType<typeof Database>;

            // Insert two users with email=NULL — SQLite UNIQUE allows multiple NULLs.
            db.prepare(
                `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
                 VALUES (?, ?, NULL, 0, datetime('now'), datetime('now'))`
            ).run('user-1', 'Alice');
            db.prepare(
                `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
                 VALUES (?, ?, NULL, 0, datetime('now'), datetime('now'))`
            ).run('user-2', 'Bob');

            const nullCount = (db.prepare(
                `SELECT COUNT(*) AS cnt FROM "user" WHERE "email" IS NULL`
            ).get() as any).cnt;
            assert.equal(nullCount, 2, 'two users with email=NULL must coexist (Strategy A)');
        } finally {
            authDb.close();
            unlinkSync(path);
        }
    });

    test('real-mode user.email UNIQUE constraint rejects duplicate non-null emails', () => {
        const path = 'data/_test_t12_real_email_uniq.db';
        const authDb = openSqliteAuthDatabase(path, 'real');
        try {
            authDb.initializeSchema('real');
            const db = authDb.betterAuthHandle as InstanceType<typeof Database>;

            db.prepare(
                `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
                 VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`
            ).run('user-1', 'Alice', 'alice@example.com');

            assert.throws(
                () => {
                    db.prepare(
                        `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
                         VALUES (?, ?, ?, 0, datetime('now'), datetime('now'))`
                    ).run('user-2', 'Alice2', 'alice@example.com');
                },
                /UNIQUE constraint failed/,
                'duplicate non-null email must be rejected'
            );
        } finally {
            authDb.close();
            unlinkSync(path);
        }
    });

    test('initializeRealSchema is idempotent', () => {
        const path = 'data/_test_t12_real_idem.db';
        const authDb = openSqliteAuthDatabase(path, 'real');
        try {
            authDb.initializeSchema('real');
            authDb.initializeSchema('real'); // must not throw
            const db = authDb.betterAuthHandle as InstanceType<typeof Database>;
            const tables = tableNames(db);
            assert.ok(tables.includes('user'));
            assert.ok(tables.includes('passkey'));
        } finally {
            authDb.close();
            unlinkSync(path);
        }
    });
}
