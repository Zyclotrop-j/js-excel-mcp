/**
 * Shared DDL for the auth schema, used by both the SQLite and D1
 * `AuthDatabase` implementations. Kept idempotent (`CREATE TABLE IF NOT
 * EXISTS` / `CREATE INDEX IF NOT EXISTS`) so it can be re-run on every
 * isolate startup without changing existing rows.
 *
 * The DDL is byte-for-byte identical to the original `sqliteAuthDatabase.ts`
 * (T-12 paste verbatim). D1's `exec()` accepts the same multi-statement
 * string shape as better-sqlite3's `db.exec()`.
 */

import type { AuthMode } from '../authMode';

/**
 * Demo-mode schema DDL. Matches the pre-T-12 demo schema byte-for-byte.
 */
export const DEMO_SCHEMA_DDL = `
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
`;

/**
 * Real-mode schema DDL. Matches the T-12 paste verbatim. Strategy A:
 * `email TEXT UNIQUE` (nullable — passkey-only accounts).
 */
export const REAL_SCHEMA_DDL = `
    CREATE TABLE IF NOT EXISTS "user" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "name"            TEXT    NOT NULL,
        "email"           TEXT    UNIQUE,
        "emailVerified"   INTEGER NOT NULL,
        "image"           TEXT,
        "createdAt"       DATE    NOT NULL,
        "updatedAt"       DATE    NOT NULL,
        "twoFactorEnabled" INTEGER
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

    CREATE TABLE IF NOT EXISTS "passkey" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "name"         TEXT,
        "publicKey"    TEXT    NOT NULL,
        "userId"       TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
        "credentialID"  TEXT    NOT NULL,
        "counter"      INTEGER NOT NULL,
        "deviceType"   TEXT    NOT NULL,
        "backedUp"     INTEGER NOT NULL,
        "transports"   TEXT,
        "createdAt"    DATE,
        "aaguid"       TEXT
    );

    CREATE TABLE IF NOT EXISTS "apikey" (
        "id"                TEXT    NOT NULL PRIMARY KEY,
        "configId"          TEXT    NOT NULL,
        "name"              TEXT,
        "start"             TEXT,
        "referenceId"       TEXT    NOT NULL,
        "prefix"            TEXT,
        "key"               TEXT    NOT NULL,
        "refillInterval"    INTEGER,
        "refillAmount"      INTEGER,
        "lastRefillAt"      DATE,
        "enabled"           INTEGER,
        "rateLimitEnabled"  INTEGER,
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

    CREATE TABLE IF NOT EXISTS "twoFactor" (
        "id"                      TEXT    NOT NULL PRIMARY KEY,
        "secret"                  TEXT    NOT NULL,
        "backupCodes"             TEXT    NOT NULL,
        "userId"                  TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
        "verified"                INTEGER,
        "failedVerificationCount" INTEGER,
        "lockedUntil"             DATE
    );

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
`;

/**
 * Return the DDL string for the given mode, sanitised for the target backend.
 *
 * D1's `exec()` is stricter than better-sqlite3's `db.exec()`:
 *   - It does not tolerate SQL comments (`--` lines) — the parser fails
 *     with `incomplete input: SQLITE_ERROR`.
 *   - It does not tolerate blank lines mid-statement.
 *   - Each statement must end with `;` and start cleanly on a new boundary.
 *
 * `sanitizeForD1` strips `--` comments and blank lines, then collapses
 * runs of whitespace into single spaces so each statement is one line.
 * The SQLite path keeps the original pretty-printed DDL (for readability
 * in error messages and parity with the T-12 paste).
 */
export function getD1ModeSchema(mode: AuthMode): string {
    const raw = mode === 'demo' ? DEMO_SCHEMA_DDL : REAL_SCHEMA_DDL;
    return sanitizeForD1(raw);
}

/**
 * Sanitise DDL for D1's `exec()`:
 *   1. Strip `--` line comments (everything from `--` to end of line).
 *   2. Drop blank lines.
 *   3. Collapse internal whitespace runs to single spaces so each
 *      statement occupies exactly one line, terminated by `;`.
 *   4. Trim leading/trailing whitespace.
 *
 * The resulting string is semantically identical to the input — only
 * whitespace and comments change. Comments don't affect SQL semantics.
 */
function sanitizeForD1(ddl: string): string {
    return ddl
        .split('\n')
        .map(line => {
            // Strip everything from the first `--` to end of line. We don't
            // have any string literals containing `--` in the DDL, so this
            // is safe.
            const dash = line.indexOf('--');
            return dash >= 0 ? line.slice(0, dash) : line;
        })
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n')
        // Collapse whitespace runs (including newlines) inside statements
        // to single spaces. Each statement ends with `;` already, so the
        // only multi-token separators remaining are line wraps within a
        // single CREATE TABLE block.
        .replace(/\s+/g, ' ')
        .trim();
}