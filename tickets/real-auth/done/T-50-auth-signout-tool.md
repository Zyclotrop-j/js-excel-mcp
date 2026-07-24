# T-50 — `auth_signout` tool (authenticated, always present once authed)

- **Difficulty:** 🟢 easy
- **Type:** Authenticated tool
- **Dependencies:** T-40 (bootstrap endpoint scaffold + `AuthToolHandler` base)
- **Output:** `src/tools/auth/signout.ts`, re-exported from `src/tools/auth/index.ts`
- **Blocks:** T-51, T-52 (they should land together so the authenticated surface is complete)

## Goal

A small tool the LLM calls from the authenticated `/mcp` endpoint to
end the current session. Calls `auth.api.signOut` server-side and
returns a clear "session ended" message. The LLM's next call to
`/mcp` will 401, sending it back to `/mcp/bootstrap`.

## Context (read before starting)

- `[C-AT]` in `STUDY_FIRST.md`.
- `src/server.ts` — the authenticated tool set is registered on
  `/mcp` (T-40 split the endpoints). `auth_signout` lives there.
- T-30's `tokenVerifier` — if it recognizes API keys (T-00 Outcome
  B), `auth_signout` must handle both OAuth sessions and API-key
  sessions. An API-key session has no server-side session to sign
  out of; the LLM should call `auth_rotate_apikey` (T-52) with
  `revoke: true` instead. The tool's `description` says so.

## Scope

### 1. `src/tools/auth/signout.ts`

```ts
import type { CallToolResult } from '@modelcontextprotocol/server';
import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';

export class AuthSignoutHandler extends AuthToolHandler {
  static readonly authSurface = 'authenticated' as const;

  async register(): Promise<void> {
    this.registerTool('auth_signout', {
      title: 'Sign out',
      description: 'End the current session. After sign-out, the next MCP call will return 401 and you must reconnect to /mcp/bootstrap to re-authenticate. If you authenticated with an API key, this tool does not revoke the key — use auth_rotate_apikey with revoke=true instead.',
      inputSchema: undefined,  // no args
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false, readOnlyHint: false }
    }, async () => this.handleSignout());
  }

  private async handleSignout(): Promise<CallToolResult> {
    const auth = getAuth();

    // Detect API-key auth (T-30 Outcome B sets extra.credentialType).
    const credentialType = this.context.authInfo?.extra?.credentialType;
    if (credentialType === 'api-key') {
      return {
        content: [{ type: 'text', text: 'You are authenticated with an API key. auth_signout does not revoke API keys — use auth_rotate_apikey with revoke=true to invalidate this key, or simply delete it from your environment.' }],
        isError: false
      };
    }

    // Server-side sign-out. Better-auth reads the session cookie from
    // the request headers; the MCP request's headers are forwarded
    // via the context (confirm exact plumbing — may need to construct
    // a Headers from this.context's underlying Express request).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (auth.api as any).signOut({ headers: /* derive from context */ new Headers() });

    return {
      content: [{ type: 'text', text: 'Session ended. The next MCP call to /mcp will return 401.' }],
      isError: false
    };
  }
}
```

### 2. Getting the session cookie to `signOut`

`auth.api.signOut` needs the request's `Cookie` header to identify
which session to revoke. The MCP `McpRequestContext` carries
`authInfo` (the verified `AuthInfo` from `tokenVerifier`), but not
the raw headers. Two options:

- **Option A**: read the cookie from the underlying Express request.
  The `ToolHandler` base class has `this.context` but it's the MCP
  context, not Express. T-40's split could expose the Express
  request via a per-request side channel (the existing
  `requestContext.ts` `run()` / `getContext()` pattern already does
  this for the VFS — extend it to carry the Express request's
  headers). This is the clean approach but adds plumbing.
- **Option B**: revoke the session by `userId` directly via a
  better-auth admin API. We do NOT enable the `admin` plugin by
  default, so this is not available.
- **Option C**: use `tokenVerifier`'s `expiresAt` to detect the
  session's MCP access token and revoke it via
  `auth.api.revokeMcpSession` (if such an API exists — T-00
  confirms). The MCP session is separate from the better-auth web
  session, so this only kills the MCP access token, not the web
  session. Sufficient for "the LLM's next call 401s" but not for a
  full logout.

**Pick Option A** — extend `requestContext.ts` to carry the Express
request headers alongside the VFS, and read the `Cookie` header from
there. Add a small helper
`getExpressRequestHeaders(): Headers | undefined` in
`src/util/requestContext.ts`. T-40's bootstrap and `/mcp` handlers
already wrap their calls in `run(async () => { ... })`, so set the
headers there.

If T-00 confirms `revokeMcpSession` exists, also call it after
`signOut` so the MCP access token is immediately invalid (otherwise
it stays valid until its 1h expiry).

### 3. No elicitation

This tool takes no arguments and never needs user input. It returns
a plain `CallToolResult`.

## Contract this ticket honors / establishes

- Honors `[C-AT]`.
- Extends `requestContext.ts` to carry Express request headers (used
  by T-51 and T-52 too).

## Do not do

- Do not implement `auth_rotate_apikey` — T-52 owns it. Just mention
  it in the `description`.
- Do not add the `admin` plugin to better-auth.
- Do not revoke the MCP access token unless T-00 confirms
  `revokeMcpSession` exists.

## Verify

- `npm run build` passes.
- Manual real-mode smoke:
  1. Sign in via `auth_signin`.
  2. From the authenticated `/mcp`, call `auth_signout`.
  3. Tool returns "Session ended."
  4. Call any Excel tool → 401.
- API-key session (T-52 landed): call `auth_signout` → tool returns
  the "use auth_rotate_apikey" message; the API key still works
  afterward.
