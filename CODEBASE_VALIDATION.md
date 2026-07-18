# Codebase Validation Report — `js-excel-mcp`

**Date:** 2026-07-18
**Scope:** Full audit of setup, architecture, build, tests, tooling, and hygiene.
**Method:** Read-only — three sub-agents (architecture, tests, build/config) plus targeted shell verification. No code was modified.

**Operating context:** The server runs locally today as Node + `tsx` under PM2 (`ecosystem.config.cjs`). The codebase is intentionally scaffolded to also run on Cloudflare Workers in the future — the `CloudflareBackend`, `src/handler.ts`, and `wrangler` / `@cloudflare/workers-types` devDependencies are part of that forward-readiness scaffolding, not dead code.

---

## TL;DR — health summary

| Area | Status |
|---|---|
| Build (`tsc --noEmit`) | 🔴 **Fails** — 1 error: `src/shared/auth.ts:190:17` TS4058 |
| Production entry (`npm start`) | 🔴 **Broken** — `package.json#main` points to `dist/index.js` but `tsc` writes to `dist/types/index.js` |
| Dev server (`npm run dev` / PM2) | 🟢 Works (uses `tsx` directly, bypasses the broken main) |
| Test execution | 🔴 Only `test:property` is correctly wired; `test`, `test:integration`, `test:e2e` are broken or partially no-op |
| Test coverage | 🔴 `authServer`, `discovery` tools, Cloudflare backend, `requestContext.ts`, `util/lru.js` = zero coverage |
| README accuracy | 🟡 Mostly current; tool list misses 2 tools; "Comprehensive test suite" overstates |
| Security (auth) | 🟡 Hardcoded demo credentials; **demo-only, not for production**; mitigated by `localhost` binding |
| Documentation | 🟢 Thorough — `mcpInstructions` in `src/meta/mcpdescription.ts` is authoritative |
| Git hygiene | 🟢 Clean — no tracked secrets / `.db` / `.env` / large binaries |

Top priority fixes:
1. Fix `tsconfig.json#outDir` or `package.json#main` so `npm start` resolves.
2. Fix the TS4058 export-name error (`src/shared/auth.ts:190`).
3. Rewire the `baretest` suites — only `test:property` actually runs.
4. Add `c8` to devDependencies or remove the `coverage` script.

---

## 1. Source architecture

### 1.1 Startup flow
- `src/index.ts:4` — Node entry. `server.app.listen(server.port, ...)`. The Protected Resource Metadata log line at `src/index.ts:4` hardcodes `:3000` rather than `server.port` (minor inconsistency).
- `src/handler.ts` (6 LOC) — Cloudflare Workers entry. Imports `httpServerHandler` from `cloudflare:node`, then `export default`s the Cloudflare handler. By-design scaffolding for the future Worker deployment.
- `src/server.ts` (63 LOC) — Real wiring.
  - Ports: `port=3000` (`:14`); `AUTH_PORT = MCP_AUTH_PORT ?? port+1` (`:16`).
  - Builds Express MCP app (`:23`), boots separate Express auth server on `AUTH_PORT` (`:29`).
  - Mounts `cors({ origin: '*' })` with exposed session headers (`:34-39`) — **DEMO ONLY** per comment.
  - Mounts RFC 9728 Protected Resource Metadata router at `/.well-known/oauth-protected-resource/mcp` (`:42`).
  - Wires `requireBearerAuth({ verifier: demoTokenVerifier, requiredScopes: [] })` (`:44-48`) → **every** request to `/mcp` requires a bearer token. `requiredScopes: []` means no per-tool scope check.
  - Inside `createMcpHandler(callback)`, each session constructs a fresh `McpServer` and registers **every** `ToolHandler` via `Object.values(tools)` (`:56`). Registration happens at session init, not server boot.
  - Wraps request handling in `run(async () => { getContext()?.release?.() })` so an `AsyncLocalStorage` store is created per request and the per-user VFS is released on request end.

**Transports wired:** Express only (`@modelcontextprotocol/express` + `@modelcontextprotocol/node`). README lists Fastify as a transport — **fastify is declared as a dependency but not imported anywhere**.

### 1.2 Tool registration pattern
- `src/tools/interface.ts` (43 LOC) defines `ToolHandler` base. `registerTool(name, config, cb)` stores the callback in a local `Map` and forwards to `server.registerTool(...)` (`:33-48`).
- `src/tools/index.ts` (21 LOC) re-exports 20 handler modules. `handleCell.ts` is a 1-line re-export barrel into `handleCells/`.

**Pattern consistency:** Excellent. All 23 handler classes follow the same template:
```ts
async register(allTools: ToolHandler[]): Promise<void> {
  this.toolSet = allTools;
  const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');
  this.registerTool('tool_name', { description, inputSchema: z.object({...}), outputSchema: ..., annotations: {...} }, async (arg) => { ... });
}
```
Cell-touching handlers consistently resolve `workbook → sheet → cell` via the optional-parameter + sticky-state fall-back, persist mutated workbooks via `context.setWorkbook`, and update the cursor via `context.setCurrentCell`.

**Divergences (all intentional, not bugs):**
- `handleChain.ts:51-162` — Dispatcher that looks up sibling tools from `this.toolSet`, manually validates args via the schema's `'~standard'.validate`, dispatches with the same captured `this.context`, and **explicitly disallows** tools requiring client sampling (`InputRequiredResult`).
- `handleCells/discovery.ts:524-848` — Only handler using MCP sampling. Tool callbacks consume the second `ctx` argument for `requestSampling`/`inputResponses`. Can return `inputRequired(...)` mid-tool.
- `handleSetContext.ts` — Only mutates cursor; no `setWorkbook` call.
- `handleSheetOps.ts:42-58` (`copy_sheet`) — Copies cells via `cellValueAsString`, **losing** formulas / styles / number formats / comments / hyperlinks. Functional but a quality caveat.
- `handleImage.ts` — Only handler with a `catch (err: any)` block; uses `wretch` for HTTP.
- `handleChart.ts:128-133` — Casts `BarSeries as LineSeries` to work around office-kit chart factory.

### 1.3 Sticky state & per-user isolation
State lives in the per-user VFS (`src/filesystem/system.ts`), keyed in a KV table:
- `currentFile` (`context.ts:65-70`)
- `${currentFile}-currentSheet` (`:72-77`)
- `${currentFile}-${currentSheet}-currentCell` (`:79-84`)

Deleting a workbook (`Context.delete`) erases `${fileName}-` prefix keys and `cache:bands:${fileName}:` prefix keys, so cursor and header-detection cache are cleaned up implicitly.

Per-request lifecycle: `run(...)` creates an `AsyncLocalStorage` store; first call to `Context.getContext(userId)` acquires a VFS for that user (`WriteCoordinator.acquireLock`), hydrates from disk, registers `reqCtx.release` on the store; `server.ts:72` calls `getContext()?.release?.()` at request end → `vfs.release()` → `vfs.flush()` writes state back to disk → releases the per-user lock.

**Concurrency / durability concerns identified:**
1. **SharedFS never persists to disk.** `Context.initSharedFs` (`context.ts:18-25`) acquires `_shared` VFS once and *immediately releases the lock*. The singleton is held in `Context.sharedFs` for the process lifetime and **never** `release()`d → its `flush()` is never called → export URLs added via `Context.exportFile` (`:128-131`) only live in the in-memory `memoryExports` map. **A server restart drops every outstanding export URL** regardless of TTL. The README's claim of a "shared SQLite database" for exports (`README.md`) is not what the source does.
2. **Captured `Context` is bound at session init.** The `createMcpHandler` callback runs once per session and captures `Context` in each handler's closure. The lock acquired there is released at end-of-session-init. For subsequent per-request tool calls the `release` registered in `AsyncLocalStorage` is a no-op (since `Context.getContext` isn't called again). **Concern: writes after session init may not be flushed to disk unless the same VFS is re-acquired in another session.** Worth verifying with the test suite — this may be the real root cause behind "data not persisted" symptoms.
3. **Auth fallback to `'public'`** (`?? 'public'`) is global per unauthenticated session. Today every request goes through `requireBearerAuth` so theoretical, but the safety net is fragile.
4. **`WriteCoordinator` statics are process-global.** Correct for single-process PM2 today, but if cluster mode is ever enabled two processes would each have their own `lockQueues` and silently corrupt per-user DB files.
5. **`flush()` is delete-all-then-parallel-inserts** (`system.ts:96-140`) — a failure partway through leaves the on-disk state partial. `finally` clears `pendingWrites` regardless, so the snapshot is also lost. SQLite backend could wrap in `transaction()` but doesn't.

### 1.4 Database backends
- `IDatabaseBackend.ts` (157 LOC) — clean interface contract, 16 methods, supports sync or async returns.
- `databaseBackend.ts` (99 LOC) — better-sqlite3; complete; wraps `transaction()` in `BEGIN/COMMIT/ROLLBACK`.
- `memoryBackend.ts` (169 LOC) — in-memory Maps; configurable latency simulator. Has its OWN `waitForRateLimit` (`:39-47`) with 1000ms cooldown **in addition to** `WriteCoordinator.waitForRateLimit` — in `BACKEND=test` mode both fire for each write (2000ms effective worst case). Snapshot/restore transaction support is more correct than SQLite's.
- `cloudflareBackend.ts` (202 LOC) — KV for `kv`, two R2 buckets for files/exports. All selectAll* paginate. `insert*` and `insertOrReplace*` are byte-for-byte identical (KV/R2 are upserts) — minor duplication that could be aliased. `transaction` is a no-op by design (KV/R2 aren't transactional). Not used today; prepared for the Cloudflare future. `system.ts:39` does `new CloudflareBackend(globalThis as any, ...)` — works only inside a Worker where env bindings live on `globalThis`.
- `writeCoordinator.ts` (71 LOC) — per-userid FIFO ticket lock; per-write-key rate limit (LRU 10k/2s); per-userid pending-writes snapshot (LRU 1k/10s). Comment at `:11-15` documents a prior lost-wakeup bug — current design is correct for single-process.

### 1.5 Auth
- `src/shared/auth.ts` (228 LOC) — Better-auth OIDC setup. Marked **"DEMO ONLY - NOT FOR PRODUCTION"** (`:1-8`).
- `src/shared/authServer.ts` (355 LOC) — Mounts better-auth on a separate Express app explicitly bound to `'localhost'` (`:329`).

**Security findings (demo context):**
1. 🔴 **High** — Hardcoded demo password `DEMO_PASSWORD = 'ernCjBsavZjKxznbu_1g1g'` (`auth.ts:18`). The preceding comment (`:17`) claims "Generate a random password for the demo user (new each time the server starts)" but the value is a stable string committed to the repo. Anyone who reads the source can authenticate against any deployed instance running these defaults.
2. 🟠 **High** — `/sign-in` GET endpoint (`authServer.ts:253-324`) auto-creates the demo user and auto-signs-in programmatically as the demo user with no password prompt. Anyone reaching the auth server can complete an OAuth authorization-code grant. Mitigated only by the `'localhost'` bind (`:329`); if a deployment binds to `0.0.0.0` or sits behind a proxy exposing the port, anyone can obtain tokens.
3. 🟠 **Medium** — `allowDynamicClientRegistration: true` (`auth.ts:208`) — open client registration.
4. 🟡 **Medium** — `cors origin: '*'` on both auth server (`authServer.ts:127`) and MCP server (`server.ts:35-39`) — exposes response headers including `Mcp-Session-Id` to any origin. Documented as demo posture.
5. 🟡 **Low** — `requireEmailVerification: false` (`auth.ts:223`).
6. 🟡 **Low** — `database: db as any` (`auth.ts:218`) — bypasses better-auth typings.
7. 🟡 **Low** — `dangerousLoggingEnabled` mode (`authServer.ts:189-228`) intercepts response bodies, can log tokens; off by default.
8. Auth server writes to `data/_auth.db` (`auth.ts:26`) — same `data/` dir as per-user VFS. The janitor specifically exempts `_auth.db` (`system.ts:293`).

### 1.6 Tool completeness (README ↔ implementation)
- **60 tools** actually registered. README documents **58**.
- **Missing from README tool list** (both listed in `src/meta/mcpdescription.ts`, the authoritative source):
  - `list_open_workbook` — registered at `src/tools/handleWorkbook.ts:129`.
  - `delete_named_range` — registered at `src/tools/handleNamedRange.ts:48`.
- **No README tool is missing** — every documented tool name resolves to a `registerTool` call.
- `record_headers` is NOT an MCP tool — it is a virtual callback passed to the host LLM during MCP sampling in `discovery.ts`.

### 1.7 Code quality observations
**File line counts** (PowerShell `Measure-Object — files with CR-only breaks in template literals report short; Read tool counts are truer):

| File | LOC | File | LOC |
|---|---:|---|---:|
| `src/tools/handleCells/discovery.ts` | 848 (largest) | `src/util/requestContext.ts` | 22 |
| `src/shared/authServer.ts` | 355 | `src/tools/handleCells/read.ts` | 151 |
| `src/util/lru.js` | 274 | `src/tools/handleChain.ts` | 144 |
| `src/tools/handleStyle.ts` | 273 | `src/tools/handleChart.ts` | 131 |
| `src/filesystem/system.ts` | 272 | `src/tools/handleLayout.ts` | 124 |
| `src/tools/handleCells/cursor.ts` | 234 | `src/filesystem/context.ts` | 124 |
| `src/shared/auth.ts` | 228 | `src/tools/handleSetContext.ts` | 112 |
| `src/tools/handleCells/write.ts` | 216 | `src/meta/mcpdescription.ts` | 158 |
| `src/tools/handleWorkbook.ts` | 203 | `src/tools/handlePrint.ts` | 103 |
| `src/filesystem/cloudflareBackend.ts` | 202 | `src/tools/handleSheetOps.ts` | 102 |
| `src/tools/handleNumberFormat.ts` | 195 | `src/tools/handleConditionalFormat.ts` | 101 |
| `src/tools/handleSheet.ts` | 180 | `src/tools/handleOutline.ts` | 100 |
| Total `src/` | | | ~3.9k LOC |

**TODO/FIXME/HACK comments:** zero — the code is clean of shame markers.

**Dead code / duplications:**
- `cloudflareBackend.insertKV` ≡ `insertOrReplaceKV` (and file/export variants) — KV/R2 are upserts so the distinction is moot.
- Double rate-limiting in test mode (`memoryBackend.waitForRateLimit` + `writeCoordinator.waitForRateLimit`).
- Identical "resolve workbook → sheet → ws" + cell-ref resolution preamble copied into ~10 cell-touching handlers — candidate for a `resolveCell(context, ws, arg)` helper.
- `handleChart.ts:45-83` and `:115-153` differ only in chart factory and `as LineSeries` cast.
- `handleCell.ts` is a 1-line re-export — vestigial.
- `system.ts:293` — `cleanupProcess` excludes `_auth.db` redundantly (`|| entry === '_auth.db'` is dead since the preceding `/[a-zA-Z0-9]/.test(entry[0])` already passes `_auth.db`).
- `system.ts:288-313` — `cleanupProcess` runs `setInterval` at module load (import-time side effect); `.unref()`'d so doesn't keep the process alive.
- Comment mismatch: `auth.ts:21` claims "in-memory database" but `:26` opens file-backed `data/_auth.db`.
- Log line discrepancy: `index.ts:4` / `handler.ts:5` hardcode `:3000` instead of `server.port`.

**Stray debug logging:**
- `handleWorkbook.ts:14` — `console.log('User is ${userId}')` per session init (stdout PII).
- `handleWorkbook.ts:195` — `console.log(response)` logs full tool response (potentially including base64 attachment bytes).
- `auth.ts:154-159` — logs demo email + password on every startup.
- `authServer.ts:286,290,296,336-338` — `[Auth]` log lines per sign-in.

**`any` usage** (16 distinct sites, every one in `auth.ts`/`authServer.ts`/`interface.ts` carries an explicit `// eslint-disable-next-line @typescript-eslint/no-explicit-any`):
- `interface.ts:4` — `StoredCallback` uses `any` for schema generics.
- `system.ts:39` — `globalThis as any` for Cloudflare env bindings.
- `auth.ts:218` — `database: db as any`.
- `authServer.ts:79,147,202,218,224,386` — `as any` forced casts (eslint-disabled at each).
- `handleImage.ts:80` — `catch (err: any)`.
- `handleChain.ts:11,22` — `z.any()` for chain step args/results (permissive schemas by design).
- `lru.d.ts:70` — type def for the vendored lru library.

### 1.8 Meta
`src/meta/mcpdescription.ts` (158 LOC) — exports `mcpName`, `mcpTitle`, `mcpVersion`, `mcpDescription`, and `mcpInstructions` (long template literal set as the MCP server `instructions` at `server.ts:51-53`). The instructions document sticky-state, a recommended workflow for every tool, the `jump-to-original` cursor idiom with a worked example, and gotchas (refs, hex `AARRGGBB` colors, currency symbols, formula cachedValues, TOON encoding, pooled styles, chart+image anchoring). **More thorough than the README** and is the authoritative surface — it correctly lists `list_open_workbook` (`:138`).

---

## 2. Build, package & tooling

### 2.1 `tsconfig.json` — issues
| Issue | Detail |
|---|---|
| 🔴 **`outDir` / `main` mismatch** | `tsconfig.json:6` sets `outDir: "./dist/types"`. `package.json:5` sets `"main": "dist/index.js"`. Verified on disk: `dist/index.js` does **NOT** exist; the real entry is `dist/types/index.js` (229 bytes). Running `npm start` (`package.json:10` → `node dist/index.js`) would ENOENT. |
| 🟡 **Node typings missing** | `types: ["@cloudflare/workers-types"]` only. The project runs as Node today under PM2 and uses `fs`, `crypto`, `path`, etc. `@types/node` is in devDependencies but not in the `types` array — type-check falls back to ambient libs but some Node globals are not surfaced cleanly. |
| 🟡 **target/lib mismatch** | `target: es2025`, `lib: ["ES2020","ES2021","ES2022","ES2023"]` — ES2024/ES2025 missing. |
| 🟢 rootDir/include | OK — all `.ts` lives under `src/`. |
| 🟢 exclude `**/*.test.ts` | Appropriate — tests are tsx-run, not part of tsc's program. |

### 2.2 Type-check status — 🔴 FAILS
```
$ npx tsc --noEmit
src/shared/auth.ts(190,17): error TS4058: Return type of exported function has or is using name 'MCPOptions' from
external module "node_modules/better-auth/dist/plugins/mcp/index" but cannot be named.
```
Single error. Fixable by either re-exporting `MCPOptions` from this module or annotating the return type more concretely.

### 2.3 `package.json` — dependency usage
Grep-verified import usage in `src/`:

**Declared and used:**
- `@modelcontextprotocol/express` ✅ (server.ts)
- `@modelcontextprotocol/node` ✅ (server.ts)
- `@modelcontextprotocol/server` ✅ (server.ts)
- `better-auth` ✅
- `better-sqlite3` ✅
- `cors` ✅ (server.ts, authServer.ts)
- `express` ✅
- `@toon-format/toon` ✅
- `@office-kit/xlsx` ✅
- `lru-cache` ✅ (writeCoordinator.ts, memoryBackend.ts)
- `zod` ✅ (every tool schema)

**Declared but NOT imported in `src/`:**
- `@modelcontextprotocol/fastify` — unused (README §Stack lists fastify as a transport, but it's not wired).
- `@modelcontextprotocol/sdk` — unused (likely superseded by the `@modelcontextprotocol/server`subpackage).
- `memfs` — unused.
- `wretch` — **used by `handleImage.ts` only** (verified). The earlier build/config scan missed it. Not unused, but single-handler usage is worth knowing.
- `@cfworker/json-schema` — unused in `src/` (may have been intended for runtime schema validation; the `handleChain.ts` uses zod's `'~standard'.validate` instead).

**devDependencies:**
- `wrangler` + `@cloudflare/workers-types` — part of intentional Cloudflare-readiness scaffolding. By-design.
- `pm2` ✅; but scripts call bare `pm2 start ecosystem.config.cjs` whereas AGENTS.md says `npx pm2`. In an npm-script context PATH includes `node_modules/.bin`, so `npm run pm2:start` works — but if someone runs the commands verbatim from AGENTS.md without `npx` they will fail globally.
- `c8` is **NOT** in devDependencies, but `package.json:23` defines `"coverage": "npx c8 tsx test/run.ts"`. `npx c8` will ad-hoc-fetch, which is unreliable in CI. **Either add `c8` to devDependencies or remove the script.**
- `@stryker-mutator/core` + `@stryker-mutator/typescript-checker` ✅ — wired to `stryker.conf.json`.

**Scripts:**
| Script | Command | Status |
|---|---|---|
| `build` | `tsc` | Compiles output directly to `dist/types/` — see tsconfig issue. |
| `dev` | `tsx src/index.ts` | Works 🟢 |
| `start` | `node dist/index.js` | 🔴 Broken — `dist/index.js` doesn't exist. |
| `watch` | `tsc --watch` | Works but compiles to wrong path. |
| `test` / `test:unit` | `tsx test/run.ts` | Identical — duplication. And `test/run.ts` is partially broken (see §3). |
| `test:integration` | `tsx test/run-integration.ts` | 🔴 Broken wiring — see §3. |
| `test:e2e` | `tsx test/run-e2e.ts` | 🔴 Broken wiring — see §3. |
| `test:property` | `tsx test/run-property.ts` | 🟢 Correct, the only reliable suite runner. |
| `test:mutation` | `npx stryker run` | Configured but targets `npm run test` (the broken unit runner) — see §3.8. |
| `coverage` | `npx c8 tsx test/run.ts` | 🔴 `c8` not in devDependencies. |
| `pm2:*` | bare `pm2 ...` | Works within npm scripts (PATH has `node_modules/.bin`); bare invocation fails without `npx`. |

### 2.4 PM2 / `ecosystem.config.cjs`
- 11 LOC, runs `node_modules/tsx/dist/cli.mjs src/index.ts` — verified the script path exists.
- `autorestart`, `max_restarts: 10`. No `env` block — ports 3000/3001 are not configured here, hardcoded in `src/server.ts:14,16`.
- Uses `tsx` directly in "production" rather than compiled JS — bypasses the type-check. Acceptable for a dev/staging setup but inconsistent with the `npm start` script's expectation of compiled output.

### 2.5 Other root-level files
| File | Purpose | Note |
|---|---|---|
| `.lsp.json` | LSP config for TypeScript language server | OK |
| `opencode.json` | OpenCode MCP integration config | OK |
| `AGENTS.md` | Karpathy guidelines + PM2 setup | Note: opencode instructions reference `AGENTS.md`; both spellings resolve to the same case-insensitive file on Windows. |
| `transform-export-import.cjs` (67 LOC) | Test transformer for import/export fixtures | Used by `tsx` via its `--import` mechanism; not referenced in npm scripts — verify usage. |
| `transform-tests.cjs` (93 LOC) | Adds `requestContext` imports + transforms test bodies | Same status. |
| `repro2.mjs` (6 LOC) | Small reproduction script | Not referenced anywhere; isolated scratch. |
| `officekit-xlsx-llms.txt` | ~10.4 MB, `@office-kit/xlsx` API reference | Not git-tracked (good). Not in `.gitignore` explicitly either — relies on `node_modules`/`dist` patterns; fine since it's untracked. |
| `EXCELJS_FEATURES_LIST.md` | Feature matrix | 🟡 **Misnamed/stale** — project uses `@office-kit/xlsx`, not exceljs. Content may still be useful but the filename is misleading. |
| `TOOL_BUILDING_GUIDE.md` | How to add new MCP tools | OK |

### 2.6 Git hygiene — 🟢 Clean
- `git status --short`: a few modified untracked files (`BLACKBOX_TEST_REPORT.md`, `README.md`, one integration test). Nothing staged.
- `git ls-files | Select-String '\.db$|\.env'` → **no matches**. No `.db` or `.env` files tracked. Earlier suggestion that `_shared.db` was tracked was incorrect — it is a runtime artifact in `data/`.
- Reference docs (`officekit-xlsx-llms.txt`) untracked.
- No committed secrets.
- `.gitignore` properly excludes `dist/`, `data/` (but keeps `data/.gitkeep`), `node_modules/`.

---

## 3. Test infrastructure

### 3.1 Runners & framework
**Framework:** `baretest` 2.0 + `fast-check` 4.9. All suites use `node:assert/strict`. No test discovery — every suite registers against a passed-in `baretest` instance.

Four runners (`test/run.ts`, `run-integration.ts`, `run-e2e.ts`, `run-property.ts`) — 24–35 LOC each, structurally similar.

### 3.2 🔴 Critical wiring inconsistency
`baretest` requires registration against a shared instance, but the codebase uses **three conflicting patterns**:

| Pattern | Form | Result |
|---|---|---|
| **A — correct** | `export default function (test) { test(...); ... }` | Registers on the runner's shared suite. ✅ |
| **B — detached** | `export default async function () { await test.run(); }` (ignores the shared suite; runs a detached local suite) | Runner invokes a function returning a detached promise. Runner awaits an empty shared suite. Tests race the runner's exit. 🔴 |
| **C — silent no-op** | `import test from 'baretest'` then `test('name', fn)` (the factory, not a suite) | Calls `baretest('name')`, ignores the callback, discards the suite. **Zero tests registered**. 🔴 |

**Per-runner health:**
- **`run-property.ts`** 🟢 All 7 property files use Pattern A — only fully functional runner.
- **`run.ts`** 🔴 `context.test.ts` and `mcpdescription.test.ts` use Pattern C → **silently dead**. `TEST_PROGRESS.md:18,22` falsely claims they pass.
- **`run-integration.ts`** 🔴 Loads 8 of 26 integration files; 7 of those use detached Pattern B. Only `export-import-flow` (Pattern A) actually executes.
- **`run-e2e.ts`** 🔴 All 6 e2e files use detached Pattern B.

`test/findings/baseline.md:1-19` already acknowledges all four suites currently fail on first assertion; baretest aborts on first failure and **exits 0** (so CI gates based on exit code would miss the failure).

### 3.3 Test category inventory
| Directory | Files | Wired? | Notes |
|---|---:|---|---|
| `test/tools/` | 0 (only empty `handleCells/` subdir) | — | Reserved, never populated. |
| `test/integration/` | **26** `.test.ts` | 8 wired (7 detached, 1 functional) | **18 orphaned**: `chart`, `comment`, `conditional-format`, `hyperlink`, `image`, `layout`, `named-range`, `number-format`, `outline`, `print`, `protection`, `rich-text`, `set-context`, `table`, `bug1-hydrate`, `bug2-cell-value-rule`, `bug3-rich-text`, `bug4-close-workbook`. |
| `test/e2e/` | 6 | All wired, all detached (Pattern B) | Named "e2e" but actually in-process handler tests — see §3.5. |
| `test/property/` | 7 | All wired correctly (Pattern A) | ✅ |
| `test/filesystem/` | 5 | Wired into `run.ts` (3 Pattern A, 1 Pattern B, 1 Pattern C) | `IDatabaseBackend.test.ts`, `system.test.ts`, `rateLimiting.test.ts`, `lockRegression.test.ts` use Pattern A; `context.test.ts` uses Pattern C. |
| `test/meta/` | 1 (`mcpdescription.test.ts`) | Wired into `run.ts` but Pattern C — silent no-op | 🔴 |
| `test/helpers/` | 6 | n/a | `assertions`, `cleanup`, `test-context`, `test-fetch`, `test-server`, `tool-runner`. Real disk impact — `test-context.ts` writes to `data/${id}.db` relative to CWD. |
| `test/fixtures/` | 0 | n/a | Empty. `TEST_PROGRESS.md:45,132` flags "Missing test fixtures for import testing" as a blocker. |
| `test/findings/` | 20 entries (4 raw logs + 15 per-category reports + README) | n/a | Documentation of the current broken state. |
| `test/snapshots/__snapshots__/` | 0 | n/a | Empty. |
| `test/` (root) | 10 | 4 runners + `e2e-results.md` + `FINDINGS_SUMMARY.md` + **4 scratch files** | `_temp_check.ts`, `debug-roundtrip.ts`, `debug-tools.ts`, `verify-fix.ts` are tracked commit-residue, all unreferenced by runners — **should be deleted**. |

### 3.4 Coverage gaps by source module

| `src/` module | Test presence | Adequate? |
|---|---|---|
| `tools/handleWorkbook.ts` | `test/integration/workbook-flow`, `test/e2e/workbook-lifecycle`, all 7 property suites | Reasonable surface, but wired files use broken detached pattern. |
| `tools/handleChain.ts` | `test/integration/chain-flow`, `test/e2e/chain-scenarios` | Logic covered, wired file detached. |
| `tools/handleCells/read.ts` | `test/property/cell-properties` (fast-check round-trips) | Best-covered handler. |
| `tools/handleCells/write.ts` | `test/integration/cell-ops-flow`, `test/e2e/cell-lifecycle` | OK surface, but wired file detached. |
| `tools/handleCells/cursor.ts` | `test/property/cursor-properties`, `test/integration/cell-ops-flow` | Property suite has **weak invariant assertions** (truthy-only). |
| `tools/handleCells/discovery.ts` | Registered in handlers, never invoked | 🔴 **No functional coverage** of `detect_headers`, `get_sample`, `get_row_sample`, `get_column_sample`. |
| `filesystem/system.ts` | `test/filesystem/system.test.ts` (25 tests, 355 LOC) | ✅ Highest-quality suite. |
| `filesystem/context.ts` | `test/filesystem/context.test.ts` (16 tests) | 🔴 Written thoroughly but Pattern C — silently dead. |
| `shared/authServer.ts` | None; explicitly stryker-excluded (`stryker.conf.json:9`) | 🔴 **Zero coverage** of OAuth/OIDC server on port 3001. |
| `filesystem/cloudflareBackend.ts` | None | 🔴 Untested (by design — Cloudflare-readiness path). |
| `util/requestContext.ts`, `util/lru.js` | None | Indirect-only coverage. |
| `index.ts`, `handler.ts` | None (also stryker-excluded) | Entry points. |

### 3.5 Property tests — `fast-check` arbitraries
- `cell-properties.test.ts` (213 LOC): generative strings, integers, floats (noNaN), booleans, with realistic filters. **Meaningful** round-trip invariants. Small `numRuns` (5–20). Note: boolean test asserts the *stringified* value — matches the known `set_cell` type-coercion quirk reported in `BLACKBOX_TEST_REPORT.md:44-49` and `test/e2e-results.md:51-60` (BUG-2).
- `encoding-properties.test.ts` (197 LOC): uses `fc.constantFrom(...)` with hard-coded unicode literals rather than generative arbitraries. **Functional** but less robust. Some Unicode literals in the file appear to have Windows-encoding artifacts — fragile.
- `cursor-properties.test.ts` (157 LOC): invariants are **weak** — assert that `result.structuredContent` is truthy, but don't verify the cursor actually returns to start. Not meaningful as property tests.

### 3.6 E2E tests — actually in-process handler tests
Every e2e file imports `MockMcpServer` from `test/helpers/test-server.ts` and calls `mockServer.getTool('tool_name').cb(args, ctx)` directly. **No IPC, no HTTP/stdio transport, no real MCP handshake, no OAuth.** They exercise the handler tier with a fake transport on a real SQLite-backed `Context`. Therefore: labelled "e2e" but genuinely **integration tests against handlers**. The only true end-to-end exercise is the manual sub-agent log in `test/e2e-results.md` dated 2026-07-17 (63/65 pass, 2 known bugs).

### 3.7 Helpers & fixtures — risks
- `test-context.ts:30-32` and `cleanup.ts` write/delete files in `data/` **relative to CWD** — no `mkdtempSync`/`tmpdir()` isolation. Tests must run from repo root or they could collide with real user DBs.
- Many call sites do not `await` the result of `createTestContext(...)` (returns `Promise<TestContext>`); documented in `FINDINGS_SUMMARY.md:34` — causes `teardown.cleanup()` to throw.
- `WriteCoordinator.pendingWrites` and `lastWriteTimestamps` are static — `rateLimiting.test.ts:33` explicitly clears them per test; other suites do not → cross-test contamination risk flagged in `findings/*.md`.
- `test-fetch.ts` replaces `globalThis.fetch` with a throw-on-unknown-URL map. `handleImage.ts`'s `wretch` fetch has no timeout, so a missing URL config hangs the test (`FINDINGS_SUMMARY.md:25`: "Image.test.ts FAIL — fetch hangs / no timeout. SRC-FINDING").

### 3.8 Mutation testing — `stryker.conf.json`
- `mutate`: `src/**/*.ts`, excluding `*.d.ts`, `index.ts`, `shared/authServer.ts`, `meta/mcpdescription.ts`.
- `testRunner: "command"` with `command: "npm run test"` — i.e. shells out to the **unit-only** runner. Since `npm run test` itself is partially broken (Pattern C suite skipping) and currently fails on first assertion, **mutation scores will be measured against a non-green baseline**. The `break: 60` threshold is effectively meaningless.
- Integration / e2e / property suites are entirely outside mutation analysis, so large src surface (`handleWorkbook`, `handleChain`, `handleCells/*`) goes un-mutated.
- Otherwise correctly configured: `@stryker-mutator/core` + `@stryker-mutator/typescript-checker` 9.6.1 in devDeps, `coverageAnalysis: "perTest"`, `checkers: ["typescript"]`, `thresholds: { high: 90, low: 70, break: 60 }`.

### 3.9 Test report / status files at repo root
| File | Length | Status |
|---|---|---|
| `BLACKBOX_TEST_REPORT.md` (271 LOC, dated 2026-07-18) | 9,330 B | **Current** — manual blackbox run (76/76 pass, 4 minor quirks). |
| `TEST_PLAN.md` (345 LOC) | 17,267 B | Current as a plan, but per-module `[x]` checklists overclaim status (e.g. line 41 marks `context.test.ts` "✅ Implemented" despite the silent no-op wiring). |
| `TEST_PROGRESS.md` (168 LOC) | 7,357 B | 🟡 **Aspirational, not measured** — marks every suite ✅ passing, contradicts `findings/baseline.md` which says all four suites FAIL on first assertion. Coverage: Lines ~15% / Branches ~10% / Functions ~12% / Statements ~15% (🔴). |
| `test-integration-output.txt` (~3 KB) | 2,994 B | Current raw `npm run test:integration` capture — recurring `"User is undefined"` auth warnings; truncates after one pass marker. |

### 3.10 README consistency
README line 192 ("Tests are not yet implemented.") has **already been updated** in a prior edit. The current README says:
- Line 24 (Features): *"Comprehensive test suite — unit, integration, e2e, property-based, and mutation tests."*
- §Testing (lines 249-273): describes baretest, lists all six `npm run` test scripts plus `coverage` and the mutation thresholds.

This framing is **directionally true** (multiple suites physically exist) but **overstates reliability**:
- This README claim contradicts: actual wiring of `test`/`test:unit`/`test:integration`/`test:e2e` is broken.
- `c8` is undeclared.
- Eighteen integration files plus the entire `discovery` tool surface have no real coverage.
- `TEST_PROGRESS.md` reports ✅ passing while `baseline.md` records FAIL-on-first-assertion.

---

## 4. Cross-cutting issues — recommended priority order

### P0 — broken / blocking
1. **`package.json#main` does not exist after build.** Fix `tsconfig.json#outDir` to `./dist` or update `main` to `dist/types/index.js`.
2. **`tsc --noEmit` fails** with TS4058 at `auth.ts:190:17` (`MCPOptions` not re-exported). Fix the export or annotate the return type.
3. **`coverage` script references `c8` which is not in devDependencies.** Add it or remove the script.
4. **Rewire `baretest` suites.** Convert all Pattern B and Pattern C suites to Pattern A so `npm test`, `npm run test:integration`, and `npm run test:e2e` actually execute their tests. Then import the 18 orphaned integration suites into `run-integration.ts`.
5. **Session-init context capture may leak writes.** Verify whether the closure-bound `Context` releases correctly per request, given releases only flush. If confirmed, data written after session init may never be persisted until/unless the same VFS is re-acquired.

### P1 — accuracy / cleanliness
6. **SharedFS (`_shared`) never flushes** (`context.ts:18-25`). Export URLs are memory-only — a restart drops them regardless of TTL. Update either the implementation or the README's "shared SQLite database" claim.
7. **`depends on Fastify`** — `fastify` is declared but never imported; either wire an alternative transport or remove.
8. **Delete committed scratch files** — `test/_temp_check.ts`, `test/debug-roundtrip.ts`, `test/debug-tools.ts`, `test/verify-fix.ts`.
9. **Update README tool list** to include `list_open_workbook` and `delete_named_range` (both already documented in `mcpInstructions`).
10. **Update `TEST_PROGRESS.md`** to reflect measured state, not aspirational state (or move to a "TODO" framing).
11. **Rename or replace `EXCELJS_FEATURES_LIST.md`** — project uses `@office-kit/xlsx`, not exceljs.

### P2 — quality / consistency
12. **Extract the workbook→sheet→cell resolution preamble** into a helper to dedupe ~10 handlers.
13. **`copy_sheet` loses formulas/styles** (`handleSheetOps.ts:42-58`). Document or fix.
14. **Double rate-limiting in test mode** — `MemoryBackend` and `WriteCoordinator` both enforce 1000ms cooldowns; either disable one when `BACKEND=test` or document.
15. **`handleChart.ts:128-133`** `as LineSeries` cast — file an against `@office-kit/xlsx` for a `makeLineSeries` factory.
16. **Stray `console.log(response)` at `handleWorkbook.ts:195`** + PII log at `:14`; remove or gate behind env flag.
17. **Log lines hardcode `:3000`** at `index.ts:4`, `handler.ts:5` — use `server.port` for parity.
18. **`auth.ts:18` hardcoded password** — even for demo, generate per-start as the comment claims, or pull from env var.

### P3 — coverage
19. **Tests for `discovery.ts`** (`detect_headers`, `get_sample`, `get_row_sample`, `get_column_sample`) — currently zero.
20. **Tests for `authServer.ts`** — currently zero (also stryker-excluded).
21. **Tests for `cloudflareBackend.ts`** — currently zero (acceptable if the Cloudflare path is intentionally deferred).
22. **Strengthen `cursor-properties`** — assert actual cursor position invariant, not just truthy structuredContent.
23. **Real e2e test over HTTP transport** — the named "e2e" tests are in-process handler tests; consider a true end-to-end suite that boots the server and talks MCP over the real HTTP transport on ports 3000/3001.

---

## 5. What's good

- Clean, consistent tool-handler pattern across **23 handlers** and **60 tools**.
- Zero `TODO`/`FIXME`/`HACK` markers — no shame code.
- All `any` escapes are deliberate and eslint-disabled, not silent.
- `IDatabaseBackend.test.ts` and `system.test.ts` are high-quality, broad, well-architected.
- Thorough MCP `instructions` field in `src/meta/mcpdescription.ts` — authoritative and more complete than the README.
- Discipline around Cloudflare-readiness scaffolding — backend abstraction is clean and interfaces amply documented.
- Git hygiene is clean — no tracked secrets, no tracked `.db` files, `.gitignore` correctly configured.
- Property tests meaningfully exercise `set_cell`/`get_cell` round-trips with realistic fast-check arbitraries.

---

## 6. Verification commands used

```powershell
npx tsc --noEmit          # → 1 error (TS4058 at src/shared/auth.ts:190:17)
Get-ChildItem dist -Force # → only dist/types/ subdir; no dist/index.js
Test-Path dist/index.js   # → False
Test-Path dist/types/index.js   # → True (229 bytes)
git ls-files | Select-String '\.db$|\.env'   # → no tracked DBs/env files
git status --short        # → working tree dirty on a few test docs
```

No files were modified during this review. Sub-agents used: `explore` (architecture, tests), `north-mini-code-free` (build/config).