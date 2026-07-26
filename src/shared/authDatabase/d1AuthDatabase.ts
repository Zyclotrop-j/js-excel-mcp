/**
 * D1 implementation of the `AuthDatabase` interface (T-81).
 *
 * Real-mode Cloudflare deployment uses the `AUTH` D1 binding (declared in
 * `wrangler.jsonc`) as the backing database for better-auth. better-auth
 * accepts a `D1Database` instance directly in its `database` option
 * (see `@better-auth/core` `BetterAuthDBOptions.database`), so the
 * `betterAuthHandle` is the raw D1 binding — no Kysely dialect adapter
 * needed in this codebase.
 *
 * `initializeSchema(mode)` runs the same DDL as `sqliteAuthDatabase.ts`
 * against D1 via `d1.exec(...)`, which accepts a multi-statement string.
 * `CREATE TABLE IF NOT EXISTS` makes this idempotent — every isolate
 * re-runs it cheaply. Idempotent schema init means a schema reset (adding
 * a column to an existing table) doesn't work — D1 has no `ALTER TABLE`
 * migration story here; drop & recreate the database via
 * `wrangler d1 execute excel-mcp-js-auth --command="DROP TABLE ..."`
 * when the schema changes.
 */

import type { AuthDatabase } from './index';
import type { AuthMode } from '../authMode';
import { getD1ModeSchema } from './schemaDdl';

/**
 * Open a D1-backed `AuthDatabase` using the given Cloudflare D1 binding.
 * The returned object satisfies the `AuthDatabase` interface:
 * - `betterAuthHandle` is the raw `D1Database` instance passed straight to
 *   better-auth's `database` option.
 * - `initializeSchema(mode)` runs the DDL via `d1.exec(...)` (idempotent).
 * - `close()` is a no-op — D1 connections are managed by the Workers runtime.
 */
export function openD1AuthDatabase(d1: D1Database): AuthDatabase {
    return {
        betterAuthHandle: d1,
        initializeSchema(m: AuthMode) {
            // D1.exec is async (returns a Promise<D1ExecResult>) — but
            // initializeSchema's signature is `void` to match the SQLite
            // implementation. We fire-and-forget the exec and rely on the
            // first better-auth query's own await to surface any DDL errors,
            // because better-auth reaches D1 through its own adapter, which
            // serialises on the same binding. The explicit `void` here
            // discards the Promise intentionally; fresh isolates replay the
            // idempotent DDL so a transient failure is self-healing.
            void d1.exec(getD1ModeSchema(m)).catch((e: unknown) => {
                console.error('[Auth] D1 schema initialization failed:', e);
            });
        },
        close() {
            // No-op — D1 connections are managed by the Workers runtime.
        },
    };
}