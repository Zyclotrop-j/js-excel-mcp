# T-30 — Rename `demoTokenVerifier` → `tokenVerifier` (keep alias)

- **Difficulty:** 🟢 easy
- **Type:** Token verifier
- **Dependencies:** T-20 (the `Auth` structural type exists)
- **Output:** `src/shared/authServer.ts` — rename + alias; possible extension to accept API keys
- **Blocks:** T-40 (the bootstrap endpoint mounts the verifier), T-52 (API-key flow)

## Goal

Rename `demoTokenVerifier` to `tokenVerifier` (it's no longer
demo-only once real mode exists) and keep `demoTokenVerifier` as a
backward-compat alias so existing imports don't break. If T-00
concluded that the `apiKey` plugin does not integrate with the MCP
OIDC token endpoint, also extend the verifier to recognize API keys
directly so the LLM can use a long-lived key as a bearer against
`/mcp`.

## Context (read before starting)

- `src/shared/authServer.ts:378-398` — the current
  `demoTokenVerifier`. It calls `auth.api.getMcpSession({ headers })`
  and returns `AuthInfo`.
- `[C-VF]` in `STUDY_FIRST.md`.
- `[C-APIKEY]` in `STUDY_FIRST.md` — the API-key bridge decision.
- T-00's notes — decision **D-00-2** ("API-key → MCP-token bridge").
  Read it before coding. The two possible outcomes:

  - **Outcome A**: better-auth's MCP token endpoint already accepts
    API keys. Nothing to do here beyond the rename. T-52 issues the
    key; the LLM hits `/api/auth/mcp/token` with `grant_type=...`
    using the API key; gets back an MCP access token; uses that as
    the bearer on `/mcp`. The verifier never sees the API key
    directly.
  - **Outcome B**: the MCP token endpoint does NOT accept API
    keys. The verifier must recognize an API key directly. T-52's
    `auth_rotate_apikey` returns the key; the LLM uses it as
    `Authorization: Bearer mcp_...` on `/mcp`; the verifier looks
    it up via the `apiKey` plugin's `verify` API.

## Scope

### 1. Rename + alias (always)

```ts
export const tokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const auth = getAuth();
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${token}`);

    // Try the MCP OIDC session first.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await (auth.api as any).getMcpSession({ headers });
    if (session) {
      const scopes = typeof session.scopes === 'string' ? session.scopes.split(' ') : ['openid'];
      const expiresAt = session.accessTokenExpiresAt
        ? Math.floor(new Date(session.accessTokenExpiresAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 3600;
      return { token, clientId: session.clientId, scopes, expiresAt, extra: { userId: session.userId } };
    }

    // If T-00 outcome B, fall through to API-key verification here
    // (see §2 below). Else throw.
    if (API_KEY_FALLTHROUGH) {
      return verifyApiKey(auth, token);
    }

    throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid token');
  }
};

export const demoTokenVerifier = tokenVerifier; // back-compat alias
```

### 2. API-key fallthrough (only if T-00 outcome B)

If T-00 decision D-00-2 said "verifier must accept API keys
directly," add `verifyApiKey(auth, token)`:

```ts
async function verifyApiKey(auth: Auth, token: string): Promise<AuthInfo> {
  // Confirm the exact API with T-00 — likely:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (auth.api as any).apiKey.verify({ body: { key: token } });
  if (!result || !result.userId) {
    throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid API key');
  }
  // API keys don't expire in the same way MCP tokens do; use a long horizon.
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  // Synthesize a clientId for the AuthInfo — the apiKey plugin
  // doesn't go through OAuth's clientId concept. Use the key's
  // prefix or a fixed 'mcp-api-key' value. Confirm with T-00.
  return {
    token,
    clientId: result.keyId ?? 'mcp-api-key',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    expiresAt,
    extra: { userId: result.userId, credentialType: 'api-key' }
  };
}
```

The `AuthInfo.extra.credentialType: 'api-key'` flag lets downstream
tools distinguish API-key sessions from OAuth sessions (useful for
T-50's `auth_signout`: an API-key session can't be "signed out"
the same way).

### 3. Update `src/server.ts` import

`src/server.ts:5` imports `demoTokenVerifier`. After this ticket,
either:

- Keep importing `demoTokenVerifier` (works via the alias), or
- Update the import to `tokenVerifier` and the usage at line 45.

Pick the second — it reads better once real mode exists. The alias
stays for *external* consumers.

### 4. Gate `API_KEY_FALLTHROUGH`

```ts
const API_KEY_FALLTHROUGH = /* T-00 outcome B */ false; // or true
```

Hardcode it based on T-00's conclusion. If T-00 lands after this
ticket (it shouldn't — T-30 depends on T-20 which depends on
T-00), default to `false` and let T-52 flip it.

## Contract this ticket honors / establishes

- Establishes `[C-VF]`.
- If Outcome B, establishes the `AuthInfo.extra.credentialType`
  convention used by T-50 / T-52.

## Do not do

- Do not change the MCP OIDC session verification path — it stays
  byte-for-byte the same as today.
- Do not change the verifier's signature — `OAuthTokenVerifier`
  comes from `@modelcontextprotocol/express`.
- Do not add new deps.
- Do not implement `auth_rotate_apikey` — T-52 does. This ticket
  only makes the verifier able to *accept* the keys T-52 will
  issue.

## Verify

- `npm run build` passes.
- `npm test` passes (demo mode default; the verifier behavior is
  unchanged for MCP tokens).
- Manual smoke: in demo mode, the existing test client still
  completes the OAuth dance and the verifier still returns valid
  `AuthInfo` — behavior identical to before the rename.
- If Outcome B implemented: a synthetic API key inserted into the
  `apiKey` table (manually, for the test) verifies correctly when
  presented as `Authorization: Bearer <key>`. T-52 will issue real
  keys end-to-end.
