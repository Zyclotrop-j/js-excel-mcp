/**
 * Database abstraction for the auth server (pluggable backend).
 *
 * The interface lives here (see `tickets/real-auth/STUDY_FIRST.md` [C-DB]);
 * `authMode.ts` imports it for the `AuthConfig.databaseBackend` slot. The
 * SQLite implementation (`openSqliteAuthDatabase`) lands in T-12 — this ticket
 * only ships the type surface so `AuthConfig` can name it. A Kysely-backed D1
 * / Turso / Postgres implementation (`openKyselyAuthDatabase`) lands in T-81.
 *
 * `AuthMode` is imported type-only (erased at runtime), so there is no module
 * cycle with `authMode.ts`.
 */

import type { AuthMode } from './authMode.js';

export interface AuthDatabase {
    /**
     * The object passed to better-auth's `database` option. Today this is a
     * `better-sqlite3` `Database` instance; tomorrow it could be a Kysely
     * instance configured with a D1 / Postgres dialect. Typed as `unknown`
     * because better-auth's accepted handle type varies across versions and
     * backends; callers cast at the boundary.
     */
    readonly betterAuthHandle: unknown;
    /**
     * Run DDL for the given mode. Idempotent (`CREATE TABLE IF NOT EXISTS`).
     * The only place SQL strings live outside tests.
     */
    initializeSchema(mode: AuthMode): void;
    /** Close the underlying connection (for graceful shutdown). */
    close(): void;
}
