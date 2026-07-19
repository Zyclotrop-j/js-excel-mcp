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

## Database Management

Data lives in `data/*.db` (SQLite via `better-sqlite3`, one `.db` per user). If you change the schema in `src/filesystem/system.ts`, **delete the old `.db` files** before restarting — the tables use `CREATE TABLE IF NOT EXISTS` which won't add columns to an existing table:

```
npx pm2 delete js-excel-mcp
Remove-Item data\*.db -Force
npx pm2 start ecosystem.config.cjs
```

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