# Development — `js-excel-mcp`

Single source of truth for: codebase health, test plan, test progress, and outstanding work. Consolidates the prior `CODEBASE_VALIDATION.md`, `TEST_PLAN.md`, and `TEST_PROGRESS.md` (deleted after this file landed).

**Last updated:** 2026-07-19 (testing-fix session)
**Operating context:** Server runs locally as Node + `tsx` under PM2 (`ecosystem.config.cjs`). Codebase is intentionally scaffolded to also run on Cloudflare Workers in the future — `CloudflareBackend`, `src/handler.ts`, `wrangler` / `@cloudflare/workers-types` devDependencies are forward-readiness scaffolding, not dead code.

---

## TL;DR — health summary

| Area | Status |
|---|---|
| Build (`tsc --noEmit`) | 🟢 **Clean** — 0 errors |
| Production entry (`npm start`) | 🟢 `package.json#main` (`dist/index.js`) resolves after `tsconfig.json#outDir` change |
| Dev server (`npm run dev` / PM2) | 🟢 Online, ports 3000 (MCP) + 3001 (OAuth) listening |
| Unit tests (`test/run.ts`) | 🟢 **78 pass** — runner force-exits (no event-loop hang) |
| Property tests (`test/run-property.ts`) | 🟢 **61 pass** — runner force-exits |
| Integration tests (`test/run-integration.ts`) | 🟢 **232 pass** (all 28 suites) — runner force-exits |
| E2E tests (`test/run-e2e.ts`) | 🟢 **47 pass** (6 suites: 7+5+9+9+7+10) — runner force-exits |
| `coverage` script | 🟢 `c8 ^10.1.3` in devDependencies |
| README accuracy | 🟢 Tool list complete; Stack updated; Known Limitations section added |
| Documentation | 🟢 `mcpInstructions` in `src/meta/mcpdescription.ts` is authoritative |
| Git hygiene | 🟢 Clean — no tracked secrets / `.db` / `.env` / large binaries |
| Auth security | 🟡 **Demo-only** — hardcoded password; auth server binds to `localhost`; documented in source |

---

## 1. Source architecture (key facts)

### 1.1 Startup flow
- `src/index.ts:4` — Node entry. `server.app.listen(server.port, ...)` (now uses `server.port` not hardcoded `:3000`).
- `src/handler.ts` — Cloudflare Workers entry (forward-readiness scaffolding, unused on Node).
- `src/server.ts` (78 LOC) — Real wiring:
  - Ports: `port=3000`, `AUTH_PORT = MCP_AUTH_PORT ?? port+1`.
  - Builds Express MCP app; boots separate Express auth server on `AUTH_PORT` via `setupAuthServer`.
  - `cors origin: '*'` (DEMO ONLY per comment).
  - Mounts RFC 9728 Protected Resource Metadata router at `/.well-known/oauth-protected-resource/mcp`.
  - `requireBearerAuth({ verifier: demoTokenVerifier, requiredScopes: [] })` — every request to `/mcp` must pass this middleware.
  - Tool registration: `for (const Tool of Object.values(tools))` — **filters non-handler exports** (e.g. `IMAGE_OPTIONS`) via `Tool.prototype instanceof ToolHandler` so the construction loop doesn't crash on non-callable exports. Each handler's `postCallHook` is set to flush the VFS when `hasPendingWrites()` returns true, so each `tools/call` invocation persists its writes immediately (SSE multi-call fix — see §4.4).
  - Each request wrapped in `run(async () => { try { await nodeHandler(...) } finally { await getContext()?.release?.() } })` — per-request `AsyncLocalStorage` store; VFS lock released + backend closed on request end. `release()` skips the flush when the per-call hook already flushed (no pending writes), avoiding a redundant full DB sync.

### 1.2 Tool pattern
- `src/tools/interface.ts` (49 LOC) — `ToolHandler` base, `registerTool(name, config, cb)`.
- 24 handler files, 60 registered tools. All handlers follow the same template: `async register(allTools)` → `Context.getContext(userId ?? 'public')` → `registerTool('name', {inputSchema, outputSchema, annotations}, async arg => {...})`.
- Cell-touching handlers consistently resolve `workbook → sheet → ws` via optional-parameter + sticky-state fall-back.

### 1.3 Sticky state & per-user isolation
- Sticky state lives in per-user VFS (`src/filesystem/system.ts`), KV keys: `currentFile`, `${currentFile}-currentSheet`, `${currentFile}-${currentSheet}-currentCell`.
- `Context.getContext(userId)` (in `src/filesystem/context.ts:26`) caches the `Context` on the per-request `AsyncLocalStorage` store; subsequent calls in the same `run()` return the same Context.

### 1.4 Database backends
- `IDatabaseBackend.ts` — clean interface, 16 methods.
- `databaseBackend.ts` — better-sqlite3 (production Node path).
- `memoryBackend.ts` — test-only `Map`-backed; rate-limit cooldown removed (WriteCoordinator handles the global 1s-per-key invariant).
- `cloudflareBackend.ts` — KV + R2 (forward-readiness).
- `writeCoordinator.ts` — per-userid FIFO ticket lock + **1-second per-(userid,key) write rate limit** enforced globally (10/10 `rateLimiting.test.ts` pass).

### 1.5 Auth
- `src/shared/auth.ts` — Better-auth OIDC setup. **DEMO ONLY**.
- Hardcoded demo password `ernCjBsavZjKxznbu_1g1g` (comment explicitly says it does NOT rotate per start; auto-login `/sign-in` uses this; auth server binds to `localhost`). Comments corrected to reflect file-backed `data/_auth.db` (not in-memory).
- `DemoAuth` structural interface (added this session) hides the inferred plugin-internal `MCPOptions` type — TS4058 fixed cleanly.
- `src/shared/authServer.ts` (355 LOC) — `setupAuthServer`, `getAuth()`, `demoTokenVerifier`.

### 1.6 Tool completeness
60 tools registered; README's tool list is now complete (added `list_open_workbook` and `delete_named_range` this session).

### 1.7 Code quality
- Zero `TODO`/`FIXME`/`HACK`.
- All `any` escapes deliberate + eslint-disabled.
- All cell-touching handlers wrap `context.getWorkbook(filename)` in try/catch returning graceful `isError` `workbook '<filename>' doesn't exist` (sweep landed this session).
- `handleSheet.ts` / `handleSheetOps.ts` guards: dup target name, missing source, invalid Excel title (length 1..31, forbidden chars `: \ / ? * [ ]`, reserved word "History"), last-sheet deletion.
- `copy_sheet` uses `copyRange` API (preserves formula + style; comments/hyperlinks not carried).
- `handleChart.ts:128` `as LineSeries` cast commented (office-kit exposes `makeBarSeries` but no `makeLineSeries`).
- `set_cell` accepts error-cell values `{kind: 'error', code}` (new capability); `get_cell` surfaces non-primitive cell values (error / duration / rich-text / formula) in the `value` field via `cellNativeValueSchema`.
- `lock_cell` auto-creates the cell if missing (mirrors `set_cell` / `handleStyle` patterns).

---

## 2. Build, package & tooling

### 2.1 `tsconfig.json`
- `outDir: "./dist"` (matches `package.json#main: "dist/index.js"`)
- `types: ["@cloudflare/workers-types", "node"]` — Node typings included for current runtime, Cloudflare typings for forward path
- `target: es2025`, `module: NodeNext`, `strict: true`
- Tests excluded from tsc (`exclude: ["**/*.test.ts"]`) — they run via `tsx`

### 2.2 `package.json` dependencies (verified used in `src/`)
Used: `@modelcontextprotocol/{express,node,server}`, `@office-kit/xlsx`, `@toon-format/toon`, `better-auth`, `better-sqlite3`, `cors`, `express`, `lru-cache`, `wretch` (handleImage only), `zod`.

Removed this session: `@modelcontextprotocol/fastify`, `@modelcontextprotocol/sdk`, `memfs`, `@cfworker/json-schema`.

Added: `c8 ^10.1.3` (devDep — `coverage` script now works).

### 2.3 PM2 / `ecosystem.config.cjs`
- `nodeModules/tsx/dist/cli.mjs src/index.ts` — tsx runs TypeScript directly in PM2 (no pre-build step).
- `autorestart`, `max_restarts: 10`. No `env` block — ports 3000/3001 hardcoded in `src/server.ts:14,16`.

### 2.4 Other root files
- `opencode.json` — opencode MCP client config; `test/helpers/test-context.ts` — test-isolation helper (requires `run()` block); `test/helpers/test-server.ts` — `MockMcpServer` {registeredTools, getTool, hasTool}.
- `OFFICEKIT_FEATURES_LIST.md` (renamed from `EXCELJS_FEATURES_LIST.md` this session).
- `BLACKBOX_TEST_REPORT.md` — manual blackbox run, 76/76 pass (2026-07-17).
- `TOOL_BUILDING_GUIDE.md` — how to add new tools.

### 2.5 Git hygiene — 🟢 Clean
- No tracked secrets / `.db` / `.env` / large binaries.
- `.gitignore` excludes `dist/`, `data/` (keeps `data/.gitkeep`), `node_modules/`.

---

## 3. Test infrastructure

### 3.1 Framework & runners
- Framework: `baretest` 2.0 + `fast-check` 4.9. All assertions via `node:assert/strict`.
- Four runners: `test/run.ts` (unit), `test/run-integration.ts`, `test/run-e2e.ts`, `test/run-property.ts`.
- Each runner builds a shared `baretest(name)` instance and passes it to each suite file's `export default function (test) { ... }` (Pattern A — canonical).
- All 28 integration files (and 8 property files) now Pattern A. All 20 cleanup hooks use `test.after(fn)` instead of `test('teardown', fn)` (baretest runs after-hooks correctly at end-of-suite; null-guarded because baretest's catch path invokes all after-hooks on any failure).

### 3.2 Test isolation helper
- `test/helpers/test-context.ts` — `createTestContext(userId)`:
  - MUST be called inside a `run()` block — populates the `AsyncLocalStorage` slot synchronously with a stub `Context` (with `authInfo.extra.userId` set), then `VirtualFileSystem.acquire(id, false)` hydrates the VFS asynchronously and patches the same synced object.
  - Returns a `Promise<TestContext>` augmented with `.authInfo` / `.cleanup()` accessible synchronously (so `handler.context = testContext` works before await).
  - `test/integration/auth-flow.test.ts` uses a separate `run()` block per user to avoid the per-`run` Context cache aliasing both users to the first.

### 3.3 Current runner state

| Runner | Status | Pass count |
|---|---|---|
| `test/run.ts` (unit: filesystem + meta) | 🟢 | **78** |
| `test/run-property.ts` (8 property suites) | 🟢 | **61** |
| `test/run-integration.ts` (28 integration suites) | 🟢 | **232** |
| `test/run-e2e.ts` (6 e2e suites) | 🟢 | **47** (7+5+9+9+7+10) |

All four runners now `process.exit(ok ? 0 : 1)` after `test.run()` so background
timers (VFS cleanup interval, auth-server listener, fast-check's event-loop
residue) no longer hang the process. Each runner exits with code 0 on success
and 1 on failure.

### 3.4 Test coverage matrix

#### Filesystem layer (`src/filesystem/`)

| Module | Test file | Status |
|---|---|---|
| `context.ts` | `test/filesystem/context.test.ts` | ✅ |
| `system.ts` | `test/filesystem/system.test.ts` | ✅ |
| `IDatabaseBackend.ts` | `test/filesystem/IDatabaseBackend.test.ts` | ✅ (DatabaseBackend + MemoryBackend) |
| `rateLimiting` (1s/key invariant) | `test/filesystem/rateLimiting.test.ts` | ✅ 10 tests |
| `cloudflareBackend.ts` | `test/filesystem/mocked-cloudflare-backend.test.ts` (**NEW**) | ✅ 4 smoke tests |
| `lockRegression` | `test/filesystem/lockRegression.test.ts` | ✅ |

#### Meta

| Module | Test file | Status |
|---|---|---|
| `mcpdescription.ts` | `test/meta/mcpdescription.test.ts` | ✅ |

#### Tool handlers (integration)

All 28 integration `.test.ts` files wired into `test/run-integration.ts` as Pattern A:

`workbook-flow`, `sheet-ops-flow`, `cell-ops-flow`, `style-flow`, `chain-flow`, `data-validation-flow`, `export-import-flow`, `auth-flow`, `discovery` (NEW), `auth-server` (NEW), `layout`, `chart`, `table`, `protection`, `conditional-format`, `comment`, `hyperlink`, `image`, `named-range`, `outline`, `print`, `number-format`, `rich-text`, `set-context`, `bug1-hydrate`, `bug2-cell-value-rule`, `bug3-rich-text`, `bug4-close-workbook`.

#### Property tests (8 files, 61 PASS)

| Suite | File | Status |
|---|---|---|
| Cell round-trips | `cell-properties.test.ts` | ✅ 10 |
| Range operations | `range-properties.test.ts` | ✅ 7 |
| Sheet operations | `sheet-properties.test.ts` | ✅ 7 |
| Style properties | `style-properties.test.ts` | ✅ 11 |
| VFS operations | `vfs-properties.test.ts` | ✅ 7 |
| Encoding round-trips | `encoding-properties.test.ts` | ✅ 8 |
| Cursor properties | `cursor-properties.test.ts` | ✅ 8 |
| **Cursor V2** (NEW) | `cursor-properties-v2.test.ts` | ✅ 3 |

### 3.5 Integration / e2e test fixes landed this session

The previous "late-suite cleanup" gap is fully resolved. All 28 integration
suites and all 6 e2e suites now pass end-to-end. The fixes fall into four
buckets:

1. **`MockMcpServer.getTool` now applies zod defaults** (`test/helpers/test-server.ts`).
   The real MCP SDK parses args through `inputSchema` before invoking the tool
   callback, so handlers see zod-applied defaults (e.g.
   `createDefaultWorksheet: 'Sheet1'`). The previous mock returned the raw
   callback, so any test that omitted a defaulted field silently exercised the
   "no default applied" path — the root cause of the bug3 / bug4 / e2e
   failures. The mock now wraps each callback in a `safeParse`-then-invoke
   shim that matches the SDK's behavior. Tests that intentionally pass invalid
   input fall through with raw args (the schema rejection happens in the real
   SDK before the callback, but tests using `schema.safeParse(...)` directly
   still cover that path).

2. **Test-isolation pattern for "no workbook" error paths** — outline,
   print, rich-text, set-context, workbook-lifecycle (e2e). The previous
   pattern mutated the shared `testContext` (e.g. `await testContext.cleanup()`
   mid-suite) which left subsequent tests in the suite with a closed DB
   connection. The fixed pattern creates a **separate** `createTestContext`
   inside its own `run()` block for each "no workbook" test, registers a
   throwaway handler on a fresh `MockMcpServer`, asserts the error, then
   cleans up that throwaway context — leaving the suite's main context
   untouched.

3. **API-contract drift in e2e tests** — the e2e suites were written against
   an older handler API and had drifted: `cell` → `ref` for `set_cell` /
   `get_cell`; `status` → `action` for `create_sheet` / `rename_sheet` /
   `copy_sheet` / `move_sheet` / `delete_sheet`; `sourceName`/`targetName` →
   `sourceSheet`/`newName` for `copy_sheet`; `name`/`position` →
   `sheet`/`newIndex` for `move_sheet`; `set_cells` `{cells:[{ref,value}]}`
   → `{range, values:[[v,v]]}`; `move_cell_cursor` `{direction,steps}` →
   `{moves:[{direction,count}]}`; `search_cells` `.matches` /
   `.matchCount` instead of `.matches.length`. All updated to match the
   current handler contracts.

4. **Source-side fixes** (3 surgical changes, each traced to a bug-regression
   test that was failing):
   - `src/tools/handleConditionalFormat.ts` — `add_cell_value_rule` `value` /
     `value2` schema widened from `z.string()` to
     `z.union([z.string(), z.number(), z.boolean()])`, with internal
     `String(...)` coercion for the XML formula (bug2).
   - `src/tools/handleWorkbook.ts` — `close_workbook` `filename` made
     optional (`z.string().optional()`), with sticky-context fall-back via
     `context.getCurrentFile()`; "no workbook" guard returns a graceful error
     response instead of throwing on missing `arg.filename` (bug4).
   - `src/filesystem/system.ts` + `src/tools/interface.ts` + `src/server.ts`
     — SSE multi-call release timing fix (see §4.4 below for details).

The `assert.strictEqual(result.structuredContent, undefined)` pattern from
the old §4.1 is no longer present anywhere in the test tree — `grep` confirms
zero matches outside this doc. The `contextualiseResponse` helper injects a
`context` block on every response (success or error), and tests now assert
`result.structuredContent.action === undefined` + `result.isError === true`
+ `result.content.some(...)` per the documented fix pattern.

### 3.6 Mutation testing
- `stryker.conf.json` — `mutate: src/**/*.ts` (excludes `*.d.ts`, `index.ts`, `authServer.ts`, `mcpdescription.ts`); `testRunner: command` → `npm run test` (unit only); `thresholds: { high: 90, low: 70, break: 60 }`.
- Correctly configured against the unit runner.

### 3.7 Bug regressions (4)
`bug1-hydrate`, `bug2-cell-value-rule`, `bug3-rich-text`, `bug4-close-workbook` — all Pattern A, wired.

### 3.8 Issue 1–4 verification (other-agent fixes)

A parallel agent applied 4 bug fixes; each verified behaviorally via the live MCP server (`my-server_*`):

| Issue | Fix | Verification |
|---|---|---|
| 1 | `createDefaultWorksheet: true` → `"Sheet1"` (not `"true"`) via `z.literal(true)` in `handleWorkbook.ts:18-22` | ✅ PASS |
| 2 | `get_cell` returns native type via `cellValueAsPrimitive` in `read.ts:84` + `outputSchema` updated to accept `cellNativeValueSchema` (this session caught the schema gap) | ✅ PASS |
| 3 | "Known Limitations" section in `README.md:278` for `set_cell_date_format` empty-cell limitation | ✅ PASS |
| 4 | `move_cell_cursor` fixed-count uses Excel sheet max (1,048,576 × 16,384) not data boundary — `cursor.ts:80-81,174-175` | ✅ PASS |

---

## 4. Open items

1. ✅ **Integration runner late-suite cleanup** — RESOLVED. All 28 integration suites pass (232 tests). The `structuredContent === undefined` pattern is gone; tests use the `action === undefined` + `isError === true` + `content.some(...)` pattern. See §3.5 for the four fix buckets.
2. **E2E real HTTP transport** — current `test/e2e/*.test.ts` are in-process handler tests via `MockMcpServer`; a true end-to-end suite that boots the server and talks MCP over HTTP on 3000/3001 would add confidence. Deferred — low incremental value given property + integration coverage, and the in-process e2e suites now pass cleanly (47 tests).
3. **`extract workbook→sheet→cell` resolution helper** — ~10 cell-touching handlers duplicate the same 5-line idiom. Deferred: large surface, low risk.
4. ✅ **SSE multi-call release timing** — RESOLVED. `src/tools/interface.ts` now wraps every registered tool callback so that `postCallHook` fires after each `tools/call` completes; `src/server.ts` sets `postCallHook` to flush the VFS when `VirtualFileSystem.hasPendingWrites()` returns true. `src/filesystem/system.ts` adds `hasPendingWrites()` (checks `WriteCoordinator.getPendingWrites(userid)`), and `release()` now skips the flush when there are no pending writes (the per-call hook already flushed them). This means: (a) each tool call's writes persist immediately, so a long-lived SSE stream or JSON-RPC batch sees consistent state across calls; (b) the outer `release()` in `server.ts:74` becomes a no-op flush + lock release + backend close, avoiding a redundant full DB sync.

---

## 5. What's good

- Clean, consistent tool-handler pattern across 24 handlers / 60 tools.
- Zero `TODO`/`FIXME`/`HACK` markers — no shame code.
- All `any` escapes deliberate and eslint-disabled.
- `IDatabaseBackend.test.ts` and `system.test.ts` are high-quality, broad, well-architected.
- Thorough MCP `instructions` field in `src/meta/mcpdescription.ts` — authoritative and more complete than README.
- Discipline around Cloudflare-readiness scaffolding — backend abstraction is clean and interfaces amply documented.
- Git hygiene is clean — no tracked secrets, no tracked `.db` files, `.gitignore` correctly configured.
- Property tests meaningfully exercise `set_cell`/`get_cell` round-trips with realistic fast-check arbitraries.
- `set_cell` now supports error-cell values (`{kind:'error', code}`) — round-trips via `get_cell`'s `value` field.

---

## 6. Verification commands

```powershell
npx tsc --noEmit                              # → 0 errors
npx tsx test/run.ts                           # → ✓ 78   (unit)       exits 0
npx tsx test/run-property.ts                  # → ✓ 61   (property)   exits 0
npx tsx test/run-integration.ts               # → ✓ 232  (integration) exits 0
npx tsx test/run-e2e.ts                       # → ✓ 47   (e2e)         exits 0
npx pm2 list                                  # js-excel-mcp status=online
npx pm2 logs js-excel-mcp --lines 5 --nostream  # both 3000 + 3001 listening
```

All four runners now `process.exit(ok ? 0 : 1)` after `test.run()` — background
timers (VFS cleanup interval, auth-server listener, fast-check residue) no
longer hang the process. Each runner exits with code 0 on success and 1 on
failure.