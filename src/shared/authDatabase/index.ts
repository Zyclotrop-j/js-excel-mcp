/**
 * Database abstraction for the auth server (pluggable backend).
 *
 * The interface lives here (see `tickets/real-auth/STUDY_FIRST.md` [C-DB]);
 * `authMode.ts` imports it for the `AuthConfig.databaseBackend` slot. The
 * SQLite implementation (`openSqliteAuthDatabase`) is in `./sqliteAuthDatabase.ts`
 * (created in T-12). A Kysely-backed D1 / Turso / Postgres implementation
 * (`openKyselyAuthDatabase`) lands in T-81.
 *
 * `AuthMode` is imported type-only (erased at runtime), so there is no module
 * cycle with `authMode.ts`.
 */

import type { AuthMode } from '../authMode';

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
     *
     * May return a Promise — Cloudflare D1's `exec()` is async, so the
     * D1 implementation must await the DDL round-trip before the first
     * better-auth query runs (else `no such table` on a fresh isolate).
     * The SQLite implementation is synchronous and returns `void`.
     */
    initializeSchema(mode: AuthMode): void | Promise<void>;
    /** Close the underlying connection (for graceful shutdown). */
    close(): void;
}
