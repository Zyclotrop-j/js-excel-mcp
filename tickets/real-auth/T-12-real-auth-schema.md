# T-12 — Real-mode SQLite schema (hand-written DDL)

- **Difficulty:** 🟡 medium
- **Type:** Foundation
- **Dependencies:** T-02 (email-optional decision), T-00 (plugin tables list)
- **Output:** `src/shared/authDatabase/sqliteAuthDatabase.ts` + the real-mode DDL
- **Blocks:** T-20

## Goal

The `openSqliteAuthDatabase(dbPath, mode)` implementation promised
by `[C-DB]` in STUDY_FIRST.md, with hand-written DDL for both demo
mode (unchanged from today) and real mode (new — pasted once from
`better-auth generate`, then maintained by hand).

## Context (read before starting)

- `[C-DB]` in `STUDY_FIRST.md` — the `AuthDatabase` interface.
- T-00's notes — the list of tables / columns each plugin
  (`passkey`, `magicLink`, `twoFactor.backupCodes`, `apiKey`) adds
  to the core schema.
- T-02's notes — whether `email` is nullable (Strategy A) or
  synthetic (Strategy B). The DDL differs accordingly.
- `src/shared/auth.ts:44-156` — the current hand-written DDL for
  demo mode. This ticket **preserves** that DDL verbatim and adds
  a real-mode branch.

## Scope

### New file `src/shared/authDatabase/sqliteAuthDatabase.ts`

```ts
import Database from 'better-sqlite3';
import type { AuthDatabase, AuthMode } from '../authMode.js';

export function openSqliteAuthDatabase(dbPath: string, mode: AuthMode): AuthDatabase {
  const db = new Database(dbPath);
  return {
    betterAuthHandle: db,
    initializeSchema(m) {
      if (m === 'demo') initializeDemoSchema(db);
      else initializeRealSchema(db);
    },
    close() { db.close(); }
  };
}
```

The `betterAuthHandle` is the raw `better-sqlite3` instance — that's
exactly what the current `auth.ts` passes to `betterAuth({ database:
db as any })`, so demo behavior is preserved byte-for-byte.

### Demo-mode DDL (`initializeDemoSchema`)

Move the existing SQL from `auth.ts:44-156` verbatim. **Do not edit
it.** A diff of the demo DDL before and after this ticket must be
empty (only the file location changes — it now lives in
`authDatabase/sqliteAuthDatabase.ts` instead of `auth.ts`).

### Real-mode DDL (`initializeRealSchema`)

Paste-once, hand-maintained SQL. Steps:

1. Run `npx @better-auth/cli@latest generate --output -` against a
   scratch config that enables `passkey`, `magicLink`,
   `twoFactor.backupCodes`, `apiKey`. Capture the DDL.
2. Adapt to the project's existing style (lowercase keywords, no
   `IF NOT EXISTS` removal — keep them; the project's `AGENTS.md`
   notes that `CREATE TABLE IF NOT EXISTS` won't add columns to
   existing tables, so schema changes require deleting the DB
   file — document that in T-71).
3. Apply T-02's decision:
   - **Strategy A (nullable email)**: write
     `email TEXT UNIQUE` (no `NOT NULL`).
   - **Strategy B (synthetic email)**: keep
     `email TEXT NOT NULL UNIQUE`; document the synthetic convention
     in a comment block above the table.
4. Include every table T-00 listed as required by the four plugins:
   `passkey`, `verification` (already in demo, may need extra columns
   for magic-link/backup-code flows), `twoFactor`, `backupCode`,
   `apiKey` (exact names per T-00's notes).
5. Include the OIDC/MCP plugin tables — same as demo mode's
   `oauthApplication`, `oauthAccessToken`, `oauthRefreshToken`,
   `oauthAuthorizationCode`, `oauthConsent`. These don't change
   between modes (the MCP plugin is loaded in both).
6. Add a comment block at the top of `initializeRealSchema`:
   ```ts
   /*
    * Real-mode schema. Generated once via `npx @better-auth/cli generate`
    * and hand-maintained thereafter. To regenerate from scratch:
    *   1. Delete data/_auth_real.db
    *   2. Start the server with MCP_AUTH_MODE=real
    *   3. The schema is re-created by this function.
    * When you change this DDL, delete data/_auth_real.db before restarting
    * (CREATE TABLE IF NOT EXISTS won't add columns to existing tables).
    */
   ```

### Refactor of `auth.ts`

`auth.ts` currently owns `getDatabase()` and `initializeSchema()`.
After this ticket:

- `auth.ts` imports `openSqliteAuthDatabase` from
  `./authDatabase/sqliteAuthDatabase.js`.
- `getDatabase(cfg)` (which T-20 will reshape into a dispatcher)
  delegates to `cfg.databaseBackend ?? openSqliteAuthDatabase(cfg.dbPath, cfg.mode)`.
  **In this ticket**, keep `getDatabase()` taking just a path string
  (current signature) — T-20 will widen it to take `AuthConfig`.
  This ticket only moves the schema into the new file and exposes
  the `openSqliteAuthDatabase` factory; `auth.ts`'s internal
  `getDatabase` continues to call it for the demo path so nothing
  breaks.

Concretely the minimal change to `auth.ts`:

- Move `initializeSchema`'s body into `authDatabase/sqliteAuthDatabase.ts`
  as `initializeDemoSchema(db)` (verbatim).
- Replace `auth.ts`'s `initializeSchema(_db)` call with
  `openSqliteAuthDatabase('data/_auth.db', 'demo').initializeSchema('demo')`
  — or, to keep the singleton behavior, refactor `getDatabase()` to
  return the `AuthDatabase` from this ticket. Pick the minimal change
  that keeps demo behavior identical.

### Demo equivalence invariant

The demo DDL moved to the new file must be **byte-for-byte** the
same SQL string as today. Verify by diffing the current `auth.ts`
schema strings against the new file.

## Contract this ticket honors / establishes

- Establishes `openSqliteAuthDatabase` — the default
  `AuthDatabase` impl referenced in `[C-DB]`.
- Honors T-02's email-optional decision in the `user` table DDL.

## Do not do

- Do not add a Kysely backend (T-81).
- Do not write any better-auth options — T-20 wires the plugins.
- Do not change demo behavior. The demo DDL string is unchanged;
  only its location moves.
- Do not add a migration runner. Hand-written DDL only.
- Do not add new npm deps.

## Verify

- `npm run build` passes.
- `npm test` passes — demo mode is the default and the schema is
  unchanged.
- `MCP_AUTH_MODE=real` → a fresh `data/_auth_real.db` is created
  with all the real-mode tables. Verify by:
  ```
  npx pm2 stop js-excel-mcp
  Remove-Item data\_auth_real.db -Force -ErrorAction SilentlyContinue
  $env:MCP_AUTH_MODE='real'; $env:AUTH_SECRET='test'; $env:MCP_AUTH_CORS_ORIGINS='http://localhost:3000'
  npx pm2 start ecosystem.config.cjs
  # then inspect:
  # node -e "const db = require('better-sqlite3')('data/_auth_real.db'); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all());"
  ```
  The expected table list includes: `user`, `session`, `account`,
  `verification`, `passkey`, `twoFactor`, `backupCode`, `apiKey`,
  `oauthApplication`, `oauthAccessToken`, `oauthRefreshToken`,
  `oauthAuthorizationCode`, `oauthConsent`. (Exact names per T-00.)
- Diff the demo DDL before/after this ticket — must be empty.
