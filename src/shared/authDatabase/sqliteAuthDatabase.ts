/**
 * SQLite implementation of the `AuthDatabase` interface (T-12).
 *
 * Provides `openSqliteAuthDatabase(dbPath, mode)` — the default factory
 * referenced in `[C-DB]`. The `betterAuthHandle` is the raw `better-sqlite3`
 * instance, exactly what the current `auth.ts` passes to
 * `betterAuth({ database: db as any })`.
 *
 * Schema DDL lives in `./schemaDdl.ts`, shared with `./d1AuthDatabase.ts`
 * (T-81). Both modes use identical SQL because D1 is SQLite-backed.
 */

import Database from 'better-sqlite3';

import type { AuthDatabase } from './index';
import type { AuthMode } from '../authMode';
import { DEMO_SCHEMA_DDL, REAL_SCHEMA_DDL } from './schemaDdl';

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
            if (m === 'demo') db.exec(DEMO_SCHEMA_DDL);
            else db.exec(REAL_SCHEMA_DDL);
        },
        close() {
            db.close();
        },
    };
}