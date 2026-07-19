# T-81 — Swap SQLite for Cloudflare D1 / Turso / Postgres behind `AuthDatabase`

- **Difficulty:** 🔴 hard
- **Type:** Follow-up (designed-in pluggability; not in the current waves)
- **Dependencies:** T-12 (`AuthDatabase` interface + `openSqliteAuthDatabase`), T-20 (the `getDatabase(cfg)` call site)
- **Output:** `src/shared/authDatabase/kyselyAuthDatabase.ts` + env wiring + Kysely dialect integration
- **Does NOT block:** the core plan — real auth works with `better-sqlite3` until this lands.

## Goal

Replace the default `better-sqlite3` backend with a Kysely-backed
backend so the auth database can run on:

- **Cloudflare D1** (workers + REST binding / `@libsql/client` D1
  adapter),
- **Turso / libSQL** (`@libsql/kysely-libsql`),
- **Postgres** (`kysely` + `pg`).

The pluggability was baked into T-12/T-20 — this ticket is the first
non-SQLite consumer.

## Context (read before starting)

- `[C-DB]` in `STUDY_FIRST.md` — the `AuthDatabase` interface and
  the `databaseBackend?: AuthDatabase` slot on `AuthConfig`.
- The existing `getDatabase(cfg)` in `auth.ts` (refactored in T-20)
  returns `cfg.databaseBackend ?? openSqliteAuthDatabase(...)`. This
  ticket populates `cfg.databaseBackend` for non-SQLite modes.
- better-auth accepts **any Kysely instance** as its `database`
  option (it auto-detects Kysely and the dialect). So the
  `betterAuthHandle` returned by an `AuthDatabase` impl just needs
  to be a Kysely instance constructed with the right dialect.
  Confirm this against the installed better-auth version's `.d.ts`
  (search for `Kysely` in `node_modules/better-auth/dist`).

## Scope

1. Add the new file `src/shared/authDatabase/kyselyAuthDatabase.ts`
   exporting:
   ```ts
   export function openKyselyAuthDatabase(
     dialect: Kysely.Dialect,
     mode: AuthMode
   ): AuthDatabase;
   ```
   - `betterAuthHandle` is a `Kysely` instance constructed from the
     passed dialect.
   - `initializeSchema` runs the same DDL strings T-12 uses, but
     via `Kysely.schema.createTable(...)` (or raw `sql` for the
     parts Kysely's builder can't express). Idempotent.
   - `close()` calls `kysely.destroy()`.
2. Add env wiring in `authMode.ts`:
   ```ts
   dbBackend: 'sqlite' | 'd1' | 'turso' | 'postgres' | 'custom';
   dbUrl?: string;            // backend-specific connection string
   dbAuthToken?: string;     // for D1/Turso
   databaseBackend?: AuthDatabase;  // when dbBackend = 'custom'
   ```
   And the matching env vars: `MCP_AUTH_DB_BACKEND`,
   `MCP_AUTH_DB_URL`, `MCP_AUTH_DB_AUTH_TOKEN`.
3. Update `getDatabase(cfg)` in `auth.ts` to dispatch on
   `cfg.dbBackend` and construct the appropriate Kysely dialect:
   - `d1` → `KyselyD1Dialect` (via `@libsql/kysely-libsql` or the
     CF-native dialect).
   - `turso` → `LibSQLDialect({ url, authToken })`.
   - `postgres` → `PostgresDialect({ connectionString })`.
   - `sqlite` → fall back to `openSqliteAuthDatabase` (unchanged
     default).
   - `custom` → return `cfg.databaseBackend` directly.
4. Add the new deps (`kysely`, `@libsql/kysely-libsql`, `pg`,
   `kysely-d1` — only those needed for the backends the operator
   actually wants to use; allow them to be optional via dynamic
   `import()` so the default SQLite build stays slim). This ticket
   is allowed to add npm deps; keep them in `optionalDependencies`
   if practical.
5. Test matrix (mocked where the real service isn't available in
   CI):
   - `sqlite` (default) — unchanged from T-12.
   - `turso` against a local libSQL server in CI — full
     signup/signin/recover smoke test.
   - `postgres` against a docker postgres in CI — same smoke.
   - `d1` is exercised by running the test inside a `wrangler`
     mini-environment; the project already has `wrangler` in
     devDeps (see `package.json`).
6. Document the env switch and the per-backend setup in
   `AGENTS.md` (addendum to T-71).

## Contract this ticket honors

- `[C-DB]` — `AuthDatabase` interface.
- `[C-ENV]` — no `process.env` reads outside `server.ts` /
  `authMode.ts`'s `loadAuthConfig`.

## Migration story (the hard part)

This ticket must also provide a **one-time data migration path**
from `data/_auth_real.db` to the new backend, because operators
who adopted real mode on SQLite will have real users in that DB.

- Ship a small script `scripts/migrate-auth-db.mjs` that:
  - opens the source SQLite file with `better-sqlite3`,
  - opens the destination via the new Kysely backend,
  - copies each table row-by-row (the schemas are identical, by
    contract),
  - is idempotent (skip rows that already exist by PK).
- The script is operator-run, not automatic. Document it.

## Do not do

- Do not change any auth tool, any better-auth plugin option, or
  any auth-server route. The whole point is that the swap is
  invisible above the `AuthDatabase` interface.
- Do not change the schema. The same DDL T-12 wrote must run on
  the new backend (with dialect-specific SQL dialect tweaks only
  where strictly necessary — e.g. `INTEGER` vs `BIGINT` for
  booleans on Postgres).
- Do not introduce an ORM. Kysely is a query builder, not an ORM;
  keep it that way.

## Verify

- `MCP_AUTH_DB_BACKEND=sqlite` → behavior unchanged from T-12.
- `MCP_AUTH_DB_BACKEND=turso` with a valid `MCP_AUTH_DB_URL` →
  real-mode signup/signin/recover all work against the remote DB.
- `migrate-auth-db.mjs` copies a populated SQLite DB into a fresh
  Turso DB and a row count check matches per table.
- `npm test` passes on the default SQLite backend; the
  Turso/Postgres/D1 tests run only when their respective env is
  set (skip otherwise — same pattern as T-72's gating).
