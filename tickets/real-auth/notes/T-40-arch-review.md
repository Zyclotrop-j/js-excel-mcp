# Arch decision — T-40 (bootstrap endpoint scaffold)

**Date:** 2026-07-19
**Ticket:** T-40 — Unauthenticated `/mcp/bootstrap` endpoint + Excel-tool `/mcp`
**Verdict:** LGTM — architect co-sign confirmed.

This note records three decisions T-40 made under authority delegated by
`[C-EP]` ("T-40 decides the cleanest wiring") so downstream implementers
(T-41+ auth-tool authors) don't have to re-derive them.

## 1. Wiring choice for `/mcp/bootstrap`: no `requireBearerAuth`, no synthetic `AuthInfo`

`[C-EP]` text offered two options: (a) replace `requireBearerAuth` with a
no-op middleware that injects a synthetic `AuthInfo`, or (b) some other
"no auth" flag the handler reads. **T-40 chose a third, simpler option:**
mount `bootstrapToolHandler` directly on `app.all('/mcp/bootstrap', …)`
with **no auth middleware at all**. See `src/server.ts`:

```ts
app.all('/mcp/bootstrap', async (req, res) => {
    await run(async () => { try { await bootstrapNodeHandler(req, res, req.body); } finally { await getContext()?.release?.(); } });
});
```

**Downstream impact for T-41/T-42/T-43 (signup / signin / recover):**
the auth-tool handlers run **without** `req.auth` / `AuthInfo` being
populated. They are inherently unauthenticated — they *produce* the
session, they don't consume one. Implementers MUST NOT read `req.auth`
or any token-verifier output from the request context inside a
bootstrap-surface tool. If they need a session for a follow-on call
(e.g. `auth_signup` calling `signInEmail` after creating the user),
they call better-auth's `auth.api.*` directly with explicit headers
they construct themselves.

This is a contract amendment to `[C-EP]`. The contract's two suggested
wirings (synthetic `AuthInfo` / "no auth" flag) are both more
machinery than the bootstrap endpoint needs. The third option is
narrower and cleaner. Recorded here so future readers of `[C-EP]` see
the choice.

## 2. Discriminators use TypeScript type predicates, not `Tool: any`

The T-40 ticket §3 spec wrote the `is*Tool` helpers as
`function isBootstrapAuthTool(Tool: any): boolean { … }`. The
implementer correctly observed that `any` loses the narrowing needed
for `new Tool(...)` after the `if (!is*Tool(Tool)) continue;` guard,
because the `Object.values(tools)` barrel leaks non-class exports
(`IMAGE_OPTIONS`, `IMPORT_OPTIONS`) that would then type-check as
constructible. The implementer used `Tool: unknown` with
`Tool is ToolCtor` predicates instead, casting inside the body.

**Verdict:** Approved. The runtime semantics are identical to the
ticket's `any` form (`typeof Tool === 'function'` +
`Tool.prototype instanceof …`), and the typing is strictly safer. This
is a surgical type-narrowing fix, not a behavioral change. Future
implementers adding new `is*Tool` discriminators should follow this
pattern.

## 3. Bootstrap `McpServer` declares `capabilities: { tools: {} }`

The bootstrap `McpServer` constructor passes
`capabilities: { tools: {} }` even though zero tools are registered
today. Without it, the SDK's `setToolRequestHandlers()` is only
called inside `registerTool()`, so `tools/list` on `/mcp/bootstrap`
would return JSON-RPC `Method not found` (-32601) until T-41 lands.

**Verdict:** Approved. The verify step in T-40 explicitly requires
"`/mcp/bootstrap` lists zero tools" to work today, so this capability
declaration is required to satisfy the ticket's own acceptance
criteria. The implementer's comment cites the SDK's idempotency guard
(`setToolRequestHandlers()` no-ops once initialized), so T-41+ calling
`registerTool` later does not double-register. Idempotent with T-41+.

## Check-list confirmation

| # | Check | Result |
|---|---|---|
| 1 | §8.1 demo invariant: `/mcp` Excel path preserved | ✓ Excel loop's only change is `isExcelTool(Tool)` filter; `postCallHook` (VFS flush) unchanged |
| 2 | `[C-EP]` two-endpoint layout | ✓ `/mcp` (bearer) + `/mcp/bootstrap` (no bearer); PRM still on `/mcp`; `/mcp/bootstrap` has no PRM |
| 3 | `AuthToolHandler.authSurface` discriminator | ✓ `'bootstrap' \| 'authenticated'` static, `is*Tool` predicates use `instanceof AuthToolHandler` |
| 4 | Bootstrap instructions moved to `mcpdescription.ts` | ✓ `export const bootstrapInstructions` in `src/meta/mcpdescription.ts` |
| 5 | `capabilities: { tools: {} }` on bootstrap server | ✓ See decision §3 above — required for T-40's own verify step, idempotent with T-41+ |
| 6 | No `process.env` outside `server.ts`/`authMode.ts` | ✓ Only `process.env.MCP_BASEHOST` in `server.ts` |
| 6 | No new deps | ✓ Only type-only imports added (`import type { Express }`, `import type { McpRequestContext }`) |
| 7 | Excel tool count: 60 on `/mcp`, 0 auth on `/mcp/bootstrap` | ✓ `npm test` 121 ✓; `npx tsc --noEmit` ✓ |

## Unblocks

- **T-41** (`auth_signup`) — scaffold in place; implementer knows
  `req.auth` is undefined on `/mcp/bootstrap` and must call
  `auth.api.signUpEmail` directly.
- **T-42** (`auth_signin`) — same as T-41.
- **T-43** (`auth_recover`) — same as T-41.
- **T-50** (`auth_signout`), **T-51** (`auth_add_passkey`),
  **T-52** (`auth_rotate_apikey`) — these mount on `/mcp` (bearer
  required) and CAN rely on `req.auth` being populated by
  `requireBearerAuth`. The `isAuthenticatedAuthTool` loop already
  reserves a slot for them with a no-op `postCallHook`.

## Standing-rule audit

- §8.1 demo invariant: preserved — Excel path byte-for-byte unchanged
  except for the discriminator filter (which only adds an exclusion
  for `AuthToolHandler` subclasses, of which there are zero today).
- No `process.env` outside `server.ts`/`authMode.ts`: confirmed.
- No new npm deps: confirmed.
- Surgical changes: confirmed — the `+123 −7` on `server.ts` is
  purely the split + discriminators + bootstrap wiring; no adjacent
  code reformatted.
