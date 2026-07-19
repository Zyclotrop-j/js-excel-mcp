# T-52 — `auth_rotate_apikey` tool (issue / rotate / revoke long-lived API key)

- **Difficulty:** 🟡 medium
- **Type:** Authenticated tool
- **Dependencies:** T-50 (Express headers in `requestContext`), T-30
  (verifier accepts API keys if T-00 Outcome B), T-00 (apiKey
  plugin API), T-40 (AuthToolHandler base)
- **Output:** `src/tools/auth/rotateApikey.ts`, re-exported from
  `src/tools/auth/index.ts`

## Goal

A tool the LLM calls from the authenticated `/mcp` endpoint to
issue, rotate, or revoke a long-lived API key bound to the current
user. The API key is the LLM-friendly persistent credential: after
the one-time OAuth bootstrap, the LLM stores the key and uses it as
`Authorization: Bearer mcp_...` on subsequent runs, skipping the
entire elicitation dance.

Supports three modes:

- **issue** (default): create a new API key for the current user.
- **rotate**: revoke the current key (the one in the request) and
  issue a new one. Useful on a schedule or after a suspected leak.
- **revoke**: revoke the current key without issuing a new one.

## Context (read before starting)

- `[C-AT]`, `[C-APIKEY]` in `STUDY_FIRST.md`.
- T-00's notes — exact `apiKey.create` / `apiKey.verify` /
  `apiKey.revoke` / `apiKey.list` API shapes; whether keys are
  hashed at rest (they should be) and what prefix is used
  (recommend `mcp_` so the verifier can fast-path them).
- T-30's `tokenVerifier` — if Outcome B, it already accepts API
  keys. If Outcome A (better-auth's MCP token endpoint accepts
  API keys), the verifier only sees MCP access tokens; the LLM
  must exchange the API key for an MCP access token first. The
  tool's `description` documents whichever path applies.
- T-50's `requestContext.ts` extension (current session cookie
  → current user).

## Scope

### 1. `src/tools/auth/rotateApikey.ts`

```ts
import z from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';
import { getExpressRequestHeaders } from '../../util/requestContext.js';

const rotateApikeySchema = z.object({
  action: z.enum(['issue', 'rotate', 'revoke']).default('issue').describe('issue: create a new key for the current user. rotate: revoke the current key and issue a new one. revoke: revoke the current key without issuing a new one.'),
  label: z.string().optional().describe('Optional friendly name for the new key (e.g. "laptop-macbook").'),
}).describe('Issue, rotate, or revoke a long-lived API key for the current user. The returned key can be used as Authorization: Bearer <key> on /mcp for future sessions without going through the OAuth flow. Store the key securely — it is shown only once.');

export class AuthRotateApikeyHandler extends AuthToolHandler {
  static readonly authSurface = 'authenticated' as const;

  async register(): Promise<void> {
    this.registerTool('auth_rotate_apikey', {
      title: 'Rotate API key',
      description: 'Issue, rotate, or revoke a long-lived API key. The new key (when issued) is shown once — store it securely. Use it as Authorization: Bearer <key> on /mcp to skip the OAuth flow on future runs.',
      inputSchema: rotateApikeySchema,
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: false, readOnlyHint: false }
    }, async (arg) => this.handle(arg));
  }

  private async handle(arg: z.infer<typeof rotateApikeySchema>): Promise<CallToolResult> {
    const auth = getAuth();
    const headers = getExpressRequestHeaders() ?? new Headers();

    // Identify the current user from the session cookie or the
    // verified AuthInfo (this.context.authInfo.extra.userId).
    const userId = this.context.authInfo?.extra?.userId as string | undefined;
    if (!userId) {
      return this.text('Could not identify the current user.', true);
    }

    if (arg.action === 'revoke' || arg.action === 'rotate') {
      // Revoke the current key. Identify it via this.context.authInfo
      // (the verifier set clientId / extra.keyId).
      const keyId = this.context.authInfo?.extra?.keyId as string | undefined;
      if (!keyId) {
        return this.text(`Cannot ${arg.action}: the current session is not an API-key session. Use action='issue' to create a new key, then re-authenticate with it before rotating.`, true);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (auth.api as any).apiKey.revoke({ headers, body: { keyId } });
    }

    if (arg.action === 'revoke') {
      return this.text('API key revoked. The next request with that key will 401.');
    }

    // action === 'issue' or 'rotate' → issue a new key.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createResult = await (auth.api as any).apiKey.create({
      headers,
      body: { userId, prefix: 'mcp_', name: arg.label }
    });
    const newKey = createResult?.key;
    if (!newKey) {
      return this.text('Failed to issue new API key.', true);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify({
        status: arg.action === 'rotate' ? 'rotated' : 'issued',
        apiKey: newKey,
        keyId: createResult?.keyId,
        userId,
        instructions: 'Store this key securely. Use it as Authorization: Bearer <key> on /mcp. The key will not be shown again.'
      }, null, 2) }],
      isError: false
    };
  }

  private text(t: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text: t }], isError };
  }
}
```

### 2. API key format and prefix

- Use prefix `mcp_` so the verifier (T-30 Outcome B) can fast-path
  any bearer starting with `mcp_` directly to the `apiKey.verify`
  call, skipping the MCP session lookup.
- The full key is returned **only** in the tool result — the
  better-auth `apiKey` plugin stores only a hash. Document this in
  the tool's `description` and in T-44's flow doc.

### 3. Outcome A vs Outcome B

- **Outcome A** (better-auth's MCP token endpoint accepts API keys):
  the LLM exchanges the API key for an MCP access token by POSTing
  to `/api/auth/mcp/token` with the right grant type (T-00
  confirms which). The verifier (T-30) is unchanged. The tool's
  `instructions` field in the result tells the LLM to do the
  exchange; alternatively, the tool does the exchange server-side
  and returns both the API key and a freshly-minted MCP access
  token. Pick whichever T-00 confirms is cleaner.
- **Outcome B** (verifier accepts API keys directly): the LLM uses
  the API key as the bearer. No exchange step.

The tool's result format must match whichever outcome is in effect.
T-00's notes are the source of truth.

### 4. Revoking keys not in the current session

The `revoke` and `rotate` actions operate on the *current* key
(the one used to authenticate this very request). For revoking a
*different* key (e.g. one the user lost), the user must sign in
with a different credential and then call `auth_rotate_apikey`
with `action='revoke'` — but the current session's key isn't the
one to revoke. This is a gap; document it as a known limitation.
A future `auth_revoke_apikey_by_id` tool could fill it; out of
scope for this plan.

## Contract this ticket honors / establishes

- Honors `[C-AT]`, `[C-APIKEY]`.
- Establishes the `mcp_` API-key prefix convention.

## Do not do

- Do not store the API key in plaintext anywhere. The better-auth
  plugin hashes; the tool result returns the plaintext once.
- Do not implement API-key exchange (Outcome A) inside this tool
  unless T-00 confirms it's the right place. Prefer letting the
  LLM do the exchange itself, keeping the tool simple.
- Do not add `admin` plugin support for cross-user key operations.

## Verify

- `npm run build` passes.
- Manual real-mode smoke (Outcome B):
  1. Sign in via `auth_signin`.
  2. Call `auth_rotate_apikey` with `action='issue'` → returns a
     `mcp_...` key.
  3. Store the key. Start a fresh LLM session.
  4. Connect to `/mcp` with `Authorization: Bearer mcp_...`.
  5. Call any Excel tool → succeeds (verifier accepts the key).
  6. From this authenticated session, call `auth_rotate_apikey`
     with `action='rotate'` → returns a new key; the old key is
     revoked.
  7. Try the old key → 401. Use the new key → succeeds.
- `action='revoke'` → key is gone; subsequent calls with it 401.
- Outcome A smoke (if applicable per T-00): the LLM does the
  exchange at `/api/auth/mcp/token` and gets back an MCP access
  token; use that token on `/mcp`.
