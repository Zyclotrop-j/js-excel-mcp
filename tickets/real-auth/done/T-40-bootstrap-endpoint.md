# T-40 — Unauthenticated `/mcp/bootstrap` endpoint + Excel-tool `/mcp`

- **Difficulty:** 🔴 hard
- **Type:** Bootstrap
- **Dependencies:** T-30 (token verifier exists), T-20 (createAuth),
  T-21 (mode-aware authServer)
- **Output:** `src/server.ts` rewrite — split MCP handler across two
  endpoints; `src/tools/auth/index.ts` empty scaffold (tools land in
  T-41+)
- **Blocks:** T-41, T-42, T-43, T-50, T-51, T-52

## Goal

Create a second MCP endpoint `/mcp/bootstrap` that does NOT require a
bearer token, and mount only the auth tools (signup / signin /
recover) there. Keep the existing `/mcp` endpoint, requiring a bearer
via `requireBearerAuth`, mounting the Excel tools + the authenticated
auth tools (`auth_signout`, `auth_add_passkey`, `auth_rotate_apikey`).

The split keeps the LLM's surface minimal at each stage:

- **Unauthenticated**: only `auth_signup`, `auth_signin`,
  `auth_recover`.
- **Authenticated**: only Excel tools + `auth_signout`,
  `auth_add_passkey`, `auth_rotate_apikey`.

## Context (read before starting)

- `src/server.ts` (current) — single `/mcp` endpoint with
  `requireBearerAuth`. The Excel tools are registered inside the
  `createMcpHandler(async (context) => { ... })` factory.
- `[C-EP]`, `[C-PA]`, `[C-AT]` in `STUDY_FIRST.md`.
- `src/tools/interface.ts` — the `ToolHandler` base class. The auth
  tools will extend it.
- `src/tools/index.ts` — the barrel export. The auth tools will be
  re-exported here so `server.ts`'s `Object.values(tools)` loop
  (line 56) picks them up.
- `src/tools/handleChain.ts:120-127` — `chain_operations` rejects
  `InputRequiredResult`. The auth tools' elicitation-driven flow
  returns `InputRequiredResult` on the first round, so they
  **cannot** be chained. That's correct and intended — don't try to
  work around it.

## Scope

### 1. New directory `src/tools/auth/`

```
src/tools/auth/
  index.ts        — barrel export for auth handlers (signup, signin, recover, signout, addPasskey, rotateApikey)
  signup.ts       — (T-41) AuthSignupHandler
  signin.ts       — (T-42) AuthSigninHandler
  recover.ts      — (T-43) AuthRecoverHandler
  signout.ts      — (T-50) AuthSignoutHandler
  addPasskey.ts   — (T-51) AuthAddPasskeyHandler
  rotateApikey.ts — (T-52) AuthRotateApikeyHandler
```

This ticket creates the **directory and `index.ts` only**, with empty
re-exports of nothing (or `export {};`). T-41+ add the actual
handlers and re-export them.

Update `src/tools/index.ts` to `export * from './auth/index.js';`
so `server.ts`'s loop sees them.

### 2. Split `server.ts` into two MCP handler factories

The current `server.ts:50-76` has one `createMcpHandler(async
(context) => { ... })` that builds one `McpServer` with all Excel
tools. After this ticket:

```ts
const excelToolHandler = createMcpHandler(async (context) => {
  const server = new McpServer({ name: mcpName, version: mcpVersion, ... }, { instructions: mcpInstructions });
  const toolSet: ToolHandler[] = [];
  for (const Tool of Object.values(tools)) {
    if (!isExcelTool(Tool)) continue;                       // skip auth tools
    const t = new Tool(server, context, app, { serverHost: baseUrl });
    t.postCallHook = /* existing VFS flush */;
    toolSet.push(t);
    await t.register(toolSet);
  }
  // Authenticated auth tools (signout, addPasskey, rotateApikey):
  for (const Tool of Object.values(tools)) {
    if (!isAuthenticatedAuthTool(Tool)) continue;
    const t = new Tool(server, context, app, { serverHost: baseUrl });
    t.postCallHook = async () => {};                        // no VFS to flush
    toolSet.push(t);
    await t.register(toolSet);
  }
  return server;
});

const bootstrapToolHandler = createMcpHandler(async (context) => {
  const server = new McpServer({ name: `${mcpName}-bootstrap`, version: mcpVersion, title: 'MCP Auth Bootstrap' },
    { instructions: bootstrapInstructions });
  const toolSet: ToolHandler[] = [];
  for (const Tool of Object.values(tools)) {
    if (!isBootstrapAuthTool(Tool)) continue;                // only signup / signin / recover
    const t = new Tool(server, context, app, { serverHost: baseUrl });
    t.postCallHook = async () => {};                         // no VFS
    toolSet.push(t);
    await t.register(toolSet);
  }
  return server;
});
```

### 3. The `is*Tool` discriminators

Add a small marker on each auth handler class so the dispatcher can
tell which set it belongs to. The cleanest is a static property:

```ts
// src/tools/auth/baseAuthTool.ts (new file in this ticket)
export abstract class AuthToolHandler extends ToolHandler {
  /** 'bootstrap' | 'authenticated' — which endpoint this tool mounts on. */
  static readonly authSurface: 'bootstrap' | 'authenticated';
}
```

Each auth tool class sets `static authSurface = 'bootstrap'` (for
signup / signin / recover) or `'authenticated'` (for signout /
addPasskey / rotateApikey). The `is*Tool` helpers then become:

```ts
function isBootstrapAuthTool(Tool: any): boolean {
  return typeof Tool === 'function' && Tool.prototype instanceof AuthToolHandler && Tool.authSurface === 'bootstrap';
}
function isAuthenticatedAuthTool(Tool: any): boolean {
  return typeof Tool === 'function' && Tool.prototype instanceof AuthToolHandler && Tool.authSurface === 'authenticated';
}
function isExcelTool(Tool: any): boolean {
  return typeof Tool === 'function' && Tool.prototype instanceof ToolHandler && !(Tool.prototype instanceof AuthToolHandler);
}
```

### 4. Mount both endpoints

```ts
const excelAuth = requireBearerAuth({
  verifier: tokenVerifier,
  requiredScopes: [],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl)
});
app.all('/mcp', excelAuth, async (req, res) => {
  await run(async () => { try { await toNodeHandler(excelToolHandler)(req, res, req.body); } finally { await getContext()?.release?.(); } });
});

// Bootstrap endpoint: no bearer required.
app.all('/mcp/bootstrap', async (req, res) => {
  await run(async () => { try { await toNodeHandler(bootstrapToolHandler)(req, res, req.body); } finally { await getContext()?.release?.(); } });
});
```

`/mcp/bootstrap` does NOT mount `requireBearerAuth`. It also does NOT
mount the PRM router — the PRM at
`/.well-known/oauth-protected-resource/mcp` continues to point at
`/mcp`, not `/mcp/bootstrap`. The bootstrap endpoint is intentionally
a separate MCP server with a separate name; it is not a "protected
resource" because by design it has no protected resource to protect.

### 5. Bootstrap instructions

The bootstrap `McpServer`'s `instructions` string tells the LLM
what to do here. Roughly:

> You are connected to the MCP server's bootstrap endpoint. None of
> the Excel tools are available here. Use `auth_signup`,
> `auth_signin`, or `auth_recover` to establish a session. Once the
> tool returns `{ loginNonce }`, retry the request that originally
> failed; the client will complete the OAuth flow and you will be
> reconnected to the Excel tools at `/mcp`.

Move the existing `mcpInstructions` constant into a separate export
if needed; don't inline a 200-word string in `server.ts`.

### 6. PRM router — keep as-is

The existing `app.use(createProtectedResourceMetadataRouter('/mcp'))`
stays. It points clients at `/mcp`. A client that tries `/mcp`
without a bearer gets a 401 with `WWW-Authenticate` pointing at the
AS — the standard flow. The LLM discovers `/mcp/bootstrap` via the
401 challenge? No — the 401 challenge doesn't mention bootstrap. So
how does the LLM know to connect to `/mcp/bootstrap`?

Two options:

- **Option 1 (recommended)**: the standard 401 from `/mcp` is the
  trigger. The LLM, told by its system prompt that "if you get a 401,
  call the auth tools at `/mcp/bootstrap`," connects there. The
  bootstrap endpoint's `instructions` then walk the LLM through
  signup. This keeps `/mcp/bootstrap` a separate MCP server the LLM
  chooses to connect to.
- **Option 2**: add a hint in the 401 response body or in the PRM
  metadata. Heavier and less standard.

Document Option 1 in this ticket and in T-44 (the flow doc). The
LLM's host system prompt is the operator's concern, not the server's.

### 7. Demo mode behavior

In **demo mode**, the bootstrap endpoint also exists and registers
the auth tools — but the demo `/sign-in` auto-login makes them
redundant. The LLM in demo mode just connects to `/mcp/bootstrap`,
calls `auth_signin` with the demo credentials (or `auth_signup`),
and the flow completes via the existing demo `/sign-in`. Actually
simpler: in demo mode, the client SDK's existing OAuth dance against
`/mcp` still works without bootstrap. The bootstrap endpoint is
**optional in demo mode** but harmless. Don't gate it on mode — it's
always mounted.

## Contract this ticket honors / establishes

- Establishes `[C-EP]` — the two-endpoint layout.
- Establishes `AuthToolHandler.authSurface` discriminator used by
  every auth tool.
- Honors the existing `ToolHandler` interface (auth tools extend
  `AuthToolHandler extends ToolHandler`).

## Do not do

- Do not implement the auth tools themselves — T-41+ do. This
  ticket only sets up the scaffold (the `auth/` dir, the empty
  `index.ts`, the `AuthToolHandler` base, and the two endpoints).
- Do not change the Excel tool registration logic beyond adding the
  `isExcelTool` filter. The postCallHook behavior is unchanged.
- Do not change `requireBearerAuth`'s config on `/mcp` — same
  verifier, same scopes, same PRM URL.
- Do not add new deps.

## Verify

- `npm run build` passes.
- `npm test` passes — demo mode default. The `/mcp` endpoint still
  works exactly as today.
- `MCP_AUTH_MODE=demo` → both endpoints mount. Connecting to
  `/mcp/bootstrap` lists zero tools (because no auth tools exist
  yet — they land in T-41+). Connecting to `/mcp` (with a valid
  bearer from the demo OAuth dance) lists the Excel tools.
- `MCP_AUTH_MODE=real` → same: `/mcp/bootstrap` lists zero tools
  for now; `/mcp` 401s without a bearer (the auth tools aren't
  registered yet, so this ticket's `real` mode is just "Excel
  tools behind OAuth, no way to bootstrap" until T-41 lands).
- The PRM router continues to advertise `/mcp` as the protected
  resource. `/mcp/bootstrap` is not advertised anywhere by the
  server.
