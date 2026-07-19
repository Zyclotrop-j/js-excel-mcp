/**
 * SQLite implementation of the `AuthDatabase` interface (T-12).
 *
 * Provides `openSqliteAuthDatabase(dbPath, mode)` — the default factory
 * referenced in `[C-DB]`. The `betterAuthHandle` is the raw `better-sqlite3`
 * instance, exactly what the current `auth.ts` passes to
 * `betterAuth({ database: db as any })`.
 *
 * Two schema initializers:
 * - `initializeDemoSchema(db)` — the existing demo DDL (moved verbatim from
 *   `auth.ts`). Byte-for-byte identical to the pre-T-12 version.
 * - `initializeRealSchema(db)` — the real-mode DDL (T-02 §2.2, pasted
 *   verbatim from the CLI-generated schema with hand-maintained adjustments
 *   for email-optional Strategy A).
 */

import Database from 'better-sqlite3';

import type { AuthDatabase } from './index.js';
import type { AuthMode } from '../authMode.js';

/**
 * Open a SQLite-backed `AuthDatabase` at the given path. The returned object
 * satisfies the `AuthDatabase` interface: `betterAuthHandle` is the raw
 * `better-sqlite3` instance (cast to `unknown` at the interface boundary),
 * `initializeSchema(mode)` runs the appropriate DDL, and `close()` tears down
 * the connection.
 */
export function openSqliteAuthDatabase(dbPath: string, mode: AuthMode): AuthDatabase {
    const db = new Database(dbPath);
    return {
        betterAuthHandle: db,
        initializeSchema(m: AuthMode) {
            if (m === 'demo') initializeDemoSchema(db);
            else initializeRealSchema(db);
        },
        close() {
            db.close();
        },
    };
}

/**
 * Demo-mode schema. Moved verbatim from `auth.ts` (pre-T-12). The two `db.exec`
 * calls below are byte-for-byte identical to the original; only the file
 * location changed.
 */
function initializeDemoSchema(db: InstanceType<typeof Database>): void {
    // Core better-auth tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS user (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            emailVerified INTEGER NOT NULL DEFAULT 0,
            image TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session (
            id TEXT PRIMARY KEY,
            token TEXT NOT NULL UNIQUE,
            expiresAt TEXT NOT NULL,
            ipAddress TEXT,
            userAgent TEXT,
            userId TEXT NOT NULL REFERENCES user(id),
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS account (
            id TEXT PRIMARY KEY,
            accountId TEXT NOT NULL,
            providerId TEXT NOT NULL,
            userId TEXT NOT NULL REFERENCES user(id),
            accessToken TEXT,
            refreshToken TEXT,
            idToken TEXT,
            accessTokenExpiresAt TEXT,
            refreshTokenExpiresAt TEXT,
            scope TEXT,
            password TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS verification (
            id TEXT PRIMARY KEY,
            identifier TEXT NOT NULL,
            value TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            createdAt TEXT,
            updatedAt TEXT
        );
    `);

    // OIDC/MCP plugin tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS oauthApplication (
            id TEXT PRIMARY KEY,
            name TEXT,
            icon TEXT,
            metadata TEXT,
            clientId TEXT NOT NULL UNIQUE,
            clientSecret TEXT,
            redirectUrls TEXT NOT NULL,
            type TEXT NOT NULL,
            disabled INTEGER NOT NULL DEFAULT 0,
            userId TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS oauthAccessToken (
            id TEXT PRIMARY KEY,
            accessToken TEXT NOT NULL UNIQUE,
            refreshToken TEXT UNIQUE,
            accessTokenExpiresAt TEXT NOT NULL,
            refreshTokenExpiresAt TEXT,
            clientId TEXT NOT NULL,
            userId TEXT,
            scopes TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS oauthRefreshToken (
            id TEXT PRIMARY KEY,
            refreshToken TEXT NOT NULL UNIQUE,
            accessTokenId TEXT NOT NULL,
            expiresAt TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS oauthAuthorizationCode (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            clientId TEXT NOT NULL,
            userId TEXT,
            scopes TEXT NOT NULL,
            redirectURI TEXT NOT NULL,
            codeChallenge TEXT,
            codeChallengeMethod TEXT,
            expiresAt TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS oauthConsent (
            id TEXT PRIMARY KEY,
            clientId TEXT NOT NULL,
            userId TEXT NOT NULL,
            scopes TEXT NOT NULL,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            consentGiven INTEGER NOT NULL DEFAULT 0
        );
    `);
}

/**
 * Real-mode schema. Generated once via `npx @better-auth/cli generate`
 * and hand-maintained thereafter. To regenerate from scratch:
 *   1. Delete data/_auth_real.db
 *   2. Start the server with MCP_AUTH_MODE=real
 *   3. The schema is re-created by this function.
 * When you change this DDL, delete data/_auth_real.db before restarting
 * (CREATE TABLE IF NOT EXISTS won't add columns to existing tables).
 *
 * Source: `tickets/real-auth/notes/T-02-notes.md` §2.2 (pasted verbatim).
 * Strategy A: `email TEXT UNIQUE` (nullable — passkey-only accounts).
 */
function initializeRealSchema(db: InstanceType<typeof Database>): void {
    db.exec(`
-- ─── Real-mode auth schema (T-12 paste verbatim) ───────────────────────
-- Generated by: npx @better-auth/cli generate (better-auth@1.6.23 +
-- @better-auth/passkey@1.6.23 + @better-auth/api-key@1.6.23 + twoFactor)
-- Hand-adjusted: email column is \`text unique\` (nullable — Strategy A).

CREATE TABLE IF NOT EXISTS "user" (
    "id"              TEXT    NOT NULL PRIMARY KEY,
    "name"            TEXT    NOT NULL,
    "email"           TEXT    UNIQUE,                     -- nullable; UNIQUE allows multiple NULLs
    "emailVerified"   INTEGER NOT NULL,                   -- boolean (0/1)
    "image"           TEXT,
    "createdAt"       DATE    NOT NULL,
    "updatedAt"       DATE    NOT NULL,
    "twoFactorEnabled" INTEGER                             -- added by twoFactor plugin; nullable boolean
);

CREATE TABLE IF NOT EXISTS "session" (
    "id"         TEXT    NOT NULL PRIMARY KEY,
    "expiresAt"  DATE    NOT NULL,
    "token"      TEXT    NOT NULL UNIQUE,
    "createdAt"  DATE    NOT NULL,
    "updatedAt"  DATE    NOT NULL,
    "ipAddress"  TEXT,
    "userAgent"  TEXT,
    "userId"     TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
    "id"                    TEXT    NOT NULL PRIMARY KEY,
    "accountId"             TEXT    NOT NULL,
    "providerId"            TEXT    NOT NULL,
    "userId"                TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "accessToken"           TEXT,
    "refreshToken"          TEXT,
    "idToken"               TEXT,
    "accessTokenExpiresAt"  DATE,
    "refreshTokenExpiresAt" DATE,
    "scope"                 TEXT,
    "password"              TEXT,
    "createdAt"             DATE    NOT NULL,
    "updatedAt"             DATE    NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "identifier"  TEXT    NOT NULL,
    "value"       TEXT    NOT NULL,
    "expiresAt"   DATE    NOT NULL,
    "createdAt"   DATE    NOT NULL,
    "updatedAt"   DATE    NOT NULL
);

-- MCP / OIDC plugin (already present in demo; identical in real)
CREATE TABLE IF NOT EXISTS "oauthApplication" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "name"         TEXT    NOT NULL,
    "icon"         TEXT,
    "metadata"     TEXT,
    "clientId"     TEXT    NOT NULL UNIQUE,
    "clientSecret" TEXT,
    "redirectUrls" TEXT    NOT NULL,
    "type"         TEXT    NOT NULL,
    "disabled"     INTEGER,
    "userId"       TEXT    REFERENCES "user" ("id") ON DELETE CASCADE,
    "createdAt"    DATE    NOT NULL,
    "updatedAt"    DATE    NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauthAccessToken" (
    "id"                    TEXT    NOT NULL PRIMARY KEY,
    "accessToken"           TEXT    NOT NULL UNIQUE,
    "refreshToken"          TEXT    NOT NULL UNIQUE,
    "accessTokenExpiresAt"  DATE    NOT NULL,
    "refreshTokenExpiresAt" DATE    NOT NULL,
    "clientId"              TEXT    NOT NULL REFERENCES "oauthApplication" ("clientId") ON DELETE CASCADE,
    "userId"                TEXT    REFERENCES "user" ("id") ON DELETE CASCADE,
    "scopes"                TEXT    NOT NULL,
    "createdAt"             DATE    NOT NULL,
    "updatedAt"             DATE    NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauthRefreshToken" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "refreshToken" TEXT    NOT NULL UNIQUE,
    "accessTokenId" TEXT   NOT NULL,
    "expiresAt"    DATE    NOT NULL,
    "createdAt"    DATE    NOT NULL,
    "updatedAt"    DATE    NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauthAuthorizationCode" (
    "id"                  TEXT    NOT NULL PRIMARY KEY,
    "code"                TEXT    NOT NULL UNIQUE,
    "clientId"            TEXT    NOT NULL,
    "userId"              TEXT,
    "scopes"              TEXT    NOT NULL,
    "redirectURI"         TEXT    NOT NULL,
    "codeChallenge"       TEXT,
    "codeChallengeMethod" TEXT,
    "expiresAt"           DATE    NOT NULL,
    "createdAt"           DATE    NOT NULL,
    "updatedAt"           DATE    NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauthConsent" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "clientId"     TEXT    NOT NULL REFERENCES "oauthApplication" ("clientId") ON DELETE CASCADE,
    "userId"       TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "scopes"       TEXT    NOT NULL,
    "createdAt"    DATE    NOT NULL,
    "updatedAt"    DATE    NOT NULL,
    "consentGiven" INTEGER NOT NULL
);

-- @better-auth/passkey plugin
CREATE TABLE IF NOT EXISTS "passkey" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "name"         TEXT,
    "publicKey"    TEXT    NOT NULL,
    "userId"       TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "credentialID"  TEXT    NOT NULL,
    "counter"      INTEGER NOT NULL,
    "deviceType"   TEXT    NOT NULL,
    "backedUp"     INTEGER NOT NULL,                       -- boolean (0/1)
    "transports"   TEXT,
    "createdAt"    DATE,
    "aaguid"       TEXT
);

-- @better-auth/api-key plugin (table name is "apikey" — all lowercase, no underscore;
-- confirmed by API_KEY_TABLE_NAME constant in node_modules/@better-auth/api-key/dist/index-CI6mGUwK.d.mts:52)
CREATE TABLE IF NOT EXISTS "apikey" (
    "id"                TEXT    NOT NULL PRIMARY KEY,
    "configId"          TEXT    NOT NULL,
    "name"              TEXT,
    "start"             TEXT,
    "referenceId"       TEXT    NOT NULL,                  -- FK to user.id (when references="user", the default)
    "prefix"            TEXT,
    "key"               TEXT    NOT NULL,                  -- hashed
    "refillInterval"    INTEGER,
    "refillAmount"      INTEGER,
    "lastRefillAt"      DATE,
    "enabled"           INTEGER,                            -- boolean (0/1); default true
    "rateLimitEnabled"  INTEGER,                            -- boolean (0/1); default true
    "rateLimitTimeWindow" INTEGER,
    "rateLimitMax"      INTEGER,
    "requestCount"      INTEGER,
    "remaining"         INTEGER,
    "lastRequest"       DATE,
    "expiresAt"         DATE,
    "createdAt"         DATE    NOT NULL,
    "updatedAt"         DATE    NOT NULL,
    "permissions"       TEXT,
    "metadata"          TEXT
);

-- twoFactor plugin (backup-codes table — TOTP secret + encrypted backup codes in one row)
CREATE TABLE IF NOT EXISTS "twoFactor" (
    "id"                      TEXT    NOT NULL PRIMARY KEY,
    "secret"                  TEXT    NOT NULL,            -- TOTP secret (unused if only backup codes)
    "backupCodes"             TEXT    NOT NULL,            -- encrypted JSON array of backup codes
    "userId"                  TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "verified"                INTEGER,                     -- boolean (0/1)
    "failedVerificationCount" INTEGER,
    "lockedUntil"             DATE
);

-- ─── Indexes (paste verbatim) ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "session_userId_idx"            ON "session"        ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx"            ON "account"        ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx"   ON "verification"   ("identifier");
CREATE INDEX IF NOT EXISTS "oauthApplication_userId_idx"   ON "oauthApplication" ("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx" ON "oauthAccessToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx"   ON "oauthAccessToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_idx"     ON "oauthConsent"    ("clientId");
CREATE INDEX IF NOT EXISTS "oauthConsent_userId_idx"       ON "oauthConsent"    ("userId");
CREATE INDEX IF NOT EXISTS "passkey_userId_idx"            ON "passkey"        ("userId");
CREATE INDEX IF NOT EXISTS "passkey_credentialID_idx"      ON "passkey"        ("credentialID");
CREATE INDEX IF NOT EXISTS "apikey_configId_idx"          ON "apikey"         ("configId");
CREATE INDEX IF NOT EXISTS "apikey_referenceId_idx"        ON "apikey"         ("referenceId");
CREATE INDEX IF NOT EXISTS "apikey_key_idx"               ON "apikey"         ("key");
CREATE INDEX IF NOT EXISTS "twoFactor_secret_idx"          ON "twoFactor"      ("secret");
CREATE INDEX IF NOT EXISTS "twoFactor_userId_idx"          ON "twoFactor"      ("userId");
    `);
}
