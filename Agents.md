---
name: js-excel-mcp
description: Development guide and behavioral guidelines for the js-excel-mcp codebase. Use when writing, reviewing, or refactoring code.
license: MIT
---

# js-excel-mcp

TypeScript MCP server exposing 60+ tools for programmatic Excel `.xlsx` manipulation. Runs as an Express HTTP server (port 3000 for MCP, port 3001 for OAuth).

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js, `tsx` (dev), `node` (production from `dist/`) |
| Language | TypeScript 6.0, strict mode, ES modules (`"type": "module"`) |
| Module | NodeNext |
| Framework | Express, `@modelcontextprotocol/sdk` |
| Excel | `@office-kit/xlsx` |
| Database | SQLite via `better-sqlite3` (per-user `.db` files in `data/`) |
| Auth | better-auth OIDC (demo-only, hardcoded credentials) |
| Process mgmt | PM2 |
| Testing | baretest, fast-check (property), Stryker (mutation), c8 (coverage) |

## Architecture

```
src/
├── index.ts                  Node entry point (6 LOC) — starts Express on port 3000
├── server.ts                 Server wiring — MCP handler, OAuth, CORS, tool registration
├── handler.ts                Cloudflare Workers entry point (forward-readiness)
├── meta/
│   └── mcpdescription.ts     MCP server metadata
├── shared/
│   ├── auth.ts               better-auth OIDC setup (DEMO ONLY)
│   └── authServer.ts         setupAuthServer, getAuth, demoTokenVerifier
├── filesystem/
│   ├── system.ts             SQLite-backed virtual filesystem
│   ├── context.ts            Per-user workbook store + sticky state
│   ├── IDatabaseBackend.ts   Database backend interface (16 methods)
│   ├── databaseBackend.ts    better-sqlite3 production implementation
│   ├── memoryBackend.ts      In-memory Map backend (testing)
│   ├── cloudflareBackend.ts  Cloudflare KV+R2 backend (forward-readiness)
│   └── writeCoordinator.ts   Per-userid FIFO ticket lock + 1s rate limit
├── tools/
│   ├── interface.ts          ToolHandler base class
│   ├── index.ts              Re-exports all 21 handler files
│   ├── handleWorkbook.ts     create/import/close/export/list workbooks
│   ├── handleSheet.ts        list/select sheets
│   ├── handleSheetOps.ts     create/rename/delete/copy/move sheets
│   ├── handleCells/          read, write, cursor, discovery
│   ├── handleChain.ts        chain_operations
│   ├── handleSetContext.ts   set_context
│   ├── handleStyle.ts        bold, font, background, alignment, border
│   ├── handleNumberFormat.ts currency, percent, date, custom number format
│   ├── handleRichText.ts     set_rich_text
│   ├── handleLayout.ts       merge_cells, freeze_panes, column width, row height
│   ├── handleChart.ts        bar chart, line chart
│   ├── handleImage.ts        insert_image
│   ├── handleTable.ts        create_excel_table, add_autofilter
│   ├── handleNamedRange.ts   add/delete named ranges
│   ├── handleValidation.ts   dropdown, number validation
│   ├── handleConditionalFormat.ts  color scale, cell value rule
│   ├── handleProtection.ts   protect_sheet, lock_cell
│   ├── handleComment.ts      add/delete comments
│   ├── handleHyperlink.ts    set_cell_hyperlink
│   ├── handleOutline.ts      group_rows, group_columns
│   └── handlePrint.ts        set_print_area, set_page_setup
└── util/
    ├── requestContext.ts     AsyncLocalStorage wrapper
    ├── detectSelfReference.ts Formula self-reference detector
    └── lru.js                LRU cache wrapper
```

## Development Workflow

| Command | Purpose |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Run dev server via `tsx src/index.ts` (no build) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production from `dist/index.js` |
| `npx tsc --noEmit` | Type-check without emitting (must pass) |

## Testing

| Layer | Command | Framework | Tests |
|---|---|---|---|
| Unit | `npm test` / `npm run test:unit` | baretest + node:assert | 78 |
| Integration | `npm run test:integration` | baretest + MockMcpServer | 232 |
| E2E | `npm run test:e2e` | baretest + MockMcpServer | 47 |
| Property | `npm run test:property` | fast-check + baretest | 61 |
| Mutation | `npm run test:mutation` | Stryker 9.6 (thresholds 90/70/60) | — |
| Coverage | `npm run coverage` | c8 | — |

**Test patterns:**
- Suite files export `default function(test: typeof baretest)` — the runner passes a shared baretest instance.
- `MockMcpServer` records `registerTool` calls; tests retrieve registered tool callbacks and invoke them. It applies zod schema defaults (matching real SDK behavior).
- `createTestContext(userId)` creates an isolated temp SQLite DB. Must be called inside a `run()` block.
- All runners `process.exit(ok ? 0 : 1)` after `test.run()` to prevent background timer hangs.

## PM2 Server Management

The server runs under PM2 for process management (auto-restart, logs, backgrounding). PM2 is a dev-dependency; all commands use `npx pm2`.

| Action | Command |
|---|---|
| Start | `npm run pm2:start` / `npx pm2 start ecosystem.config.cjs` |
| Stop | `npm run pm2:stop` / `npx pm2 delete js-excel-mcp` |
| Restart | `npm run pm2:restart` / `npx pm2 restart js-excel-mcp` |
| Logs | `npm run pm2:logs` / `npx pm2 logs js-excel-mcp --lines 20 --nostream` |
| Status | `npm run pm2:status` / `npx pm2 list` |

The PM2 config lives in `ecosystem.config.cjs`. It runs `tsx src/index.ts` with auto-restart (max 10).

**Important:** Always `pm2 delete` + `pm2 start` (not just `pm2 restart`) after updating `ecosystem.config.cjs` or adding new dependencies — restart alone may not pick up all changes.

Real mode is started with `npx pm2 start ecosystem.config.cjs --env real` (uses the `env_real` block). See the [Auth modes](#auth-modes) section below for the full env var list and reset procedure.

## Auth modes

The server supports two auth modes, switched by `MCP_AUTH_MODE`:

| Mode | Value | Behavior |
|---|---|---|
| Demo (default) | `MCP_AUTH_MODE` unset or `demo` | Auto-login, no consent screen, `origin: '*'`, loopback-only. Used by `examples/oauth/` and the test client. |
| Real | `MCP_AUTH_MODE=real` | Real signup/signin/recover via MCP tools, real consent screen, explicit CORS origins, configurable bind host. |

### Env vars (real mode only; demo uses hardcoded defaults)

| Var | Purpose | Default |
|---|---|---|
| `MCP_AUTH_MODE` | Master switch | `demo` |
| `MCP_AUTH_DB` | SQLite path | `data/_auth_real.db` |
| `MCP_AUTH_BIND_HOST` | Bind host | `localhost` |
| `MCP_AUTH_CORS_ORIGINS` | CORS origin CSV (no `*` in real) | **required** |
| `AUTH_SECRET` | Session/JWT signing secret (also accepts `BETTER_AUTH_SECRET`) | **required** |
| `MCP_AUTH_ALLOW_USER_SIGNUP` | `1`/`0` | `1` |
| `AUTH_TRUSTED_ORIGINS` | better-auth trusted origins CSV | derived from base URL |
| `MCP_AUTH_OTP_TRANSPORT` | `console`/`webhook`/`sendgrid`/`custom` | `console` |
| `MCP_AUTH_OTP_WEBHOOK_URL` | Required when transport=webhook | — |
| `MCP_AUTH_DB_BACKEND` | `sqlite`/`d1`/`turso`/`postgres`/`custom` | `sqlite` |
| `MCP_AUTH_DB_URL` | Required when backend≠sqlite | — |
| `MCP_AUTH_DB_AUTH_TOKEN` | For D1 / Turso | — |
| `MCP_AUTH_PASSKEY_RP_ID` | Passkey relying-party ID | `localhost` |
| `MCP_AUTH_PASSKEY_RP_NAME` | Passkey relying-party display name | `js-excel-mcp Auth` |

The canonical list lives in `src/shared/authMode.ts` (`loadAuthConfig`). Only `src/server.ts` and `authMode.ts` may read `process.env` for auth. The `env_real` block in `ecosystem.config.cjs` carries the defaults; operators override `AUTH_SECRET` and other sensitive vars via their own PM2 setup.

### Endpoints

| Path | Auth | Tools |
|---|---|---|
| `/mcp/bootstrap` | None | `auth_signup` / `auth_signin` / `auth_recover` |
| `/mcp` | Bearer (OAuth access token or API key) | Excel tools + `auth_signout` / `auth_add_passkey` / `auth_rotate_apikey` |

An unauthenticated LLM connects to `/mcp/bootstrap` to sign up; once authenticated, it connects to `/mcp` for the Excel tools. Auth actions use **tool arguments** (not MCP elicitation) — the elicitation path was evaluated and deferred in favor of explicit tool arguments for broader client compatibility. See `tickets/real-auth/notes/SIGNUP_FLOW.md` (T-44) for the full flow.

### Schema reset (real mode)

The real-mode auth schema lives in `data/_auth_real.db` (SQLite, hand-written DDL with `CREATE TABLE IF NOT EXISTS`). **Adding a column to an existing table does not work** — delete the DB file before restarting:

```
npx pm2 stop js-excel-mcp
Remove-Item data\_auth_real.db -Force -ErrorAction SilentlyContinue
npx pm2 start ecosystem.config.cjs --env real
```

Demo mode (`data/_auth.db`) follows the same rule (see Database Management below).

### Pluggable surfaces

Two real-mode surfaces are designed to be swapped via follow-up tickets, without touching tools or auth-server:

- **Mailer** (`src/shared/mailer.ts`): the `OtpMailer` function slot. Today: `consoleMailer` / `webhookMailer`. Follow-up T-80 adds SendGrid / Postmark.
- **Database** (`src/shared/authDatabase/`): the `AuthDatabase` interface. Today: `openSqliteAuthDatabase`. Follow-up T-81 adds Kysely-backed D1 / Turso / Postgres backends.

## Database Management

Data lives in `data/*.db` (SQLite via `better-sqlite3`, one `.db` per user). If you change the schema in `src/filesystem/system.ts`, **delete the old `.db` files** before restarting — the tables use `CREATE TABLE IF NOT EXISTS` which won't add columns to an existing table:

```
npx pm2 delete js-excel-mcp
Remove-Item data\*.db -Force
npx pm2 start ecosystem.config.cjs
```

## Re-authenticating the `my-server` MCP

The `my-server` MCP (this server, at `http://localhost:3000/mcp`) uses OAuth and its token expires periodically. When a `my-server` tool call fails with an auth/401 error, run the non-interactive reauth script (it skips if already authed and hard-kills after 90s, so it can't hang):

```
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reauth-my-server.ps1
```

After it returns, retry the original tool call. The script is safe to invoke proactively at the start of a session if you're unsure of auth state.

## Key Conventions

### Tool Handler Pattern

Every tool is a class extending `ToolHandler` (`src/tools/interface.ts:14`). Each file can register multiple tools. The constructor receives `McpServer`, `McpRequestContext`, `Express`, `ServerOptions`. The `register(allTools)` method is called at startup.

### Sticky State

Every tool's `workbook`, `sheet`, and `ref` parameters are optional (`z.string().optional()`). If omitted, the server uses the current file/sheet/cell from the per-user `Context`. The cursor auto-follows any cell-touching operation. State is stored as KV pairs: `currentFile`, `${file}-currentSheet`, `${file}-${sheet}-currentCell`.

### Cell Resolution (3-step fallback)

1. `arg.ref` → 2. `arg.row + arg.col` → 3. `await context.getCurrentCell()`

### Response Wrapping

Every response MUST use `context.contextualiseResponse(...)` which prepends the current file/sheet/cell context. The `outputSchema` MUST include `context: context.contextualiseResponseTypes()`.

### Mutation Tracking

Every tool that mutates a workbook must call `await context.setWorkbook(filename, wb)` to persist the change. Each tool call round-trips the workbook through bytes (serialise → re-parse).

### Per-User Isolation

Each user gets a separate SQLite database (`data/{userId}.db`). `Context.getContext(userId)` caches the context per request. `AsyncLocalStorage` isolates each request.

### Auth

Demo-only — hardcoded credentials. `requireBearerAuth` middleware on `/mcp`. OIDC authorization server on port 3001. RFC 9728 Protected Resource Metadata at `/.well-known/oauth-protected-resource/mcp`.

### No dead code

Cloudflare-related files (`handler.ts`, `cloudflareBackend.ts`, `wrangler`/`@cloudflare/workers-types` devDependencies) are forward-readiness scaffolding. Zero `TODO`/`FIXME`/`HACK` markers. All `any` escapes are deliberate and eslint-disabled.

---

# Karpathy Guidelines

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876).

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.