# T-22 — Real-mode `/sign-in` consumes pending-login nonce

- **Difficulty:** 🔴 hard
- **Type:** Auth server
- **Dependencies:** T-21 (mode branch in place), T-11 (pending-login store), T-01 (handoff decision)
- **Output:** `realSignInHandler` implementation in `src/shared/authServer.ts`

## Goal

The real-mode `/sign-in` route that completes the OAuth flow after
the `auth_signup` (or `auth_signin` / `auth_recover`) tool has
created a server-side session. The route consumes the pending-login
nonce from T-11 and turns the client SDK's standard OAuth dance into
a real authenticated session, with zero cooperation required from
the LLM beyond "retry the original request."

## Context (read before starting)

- `[C-SI]`, `[C-PL]` in `STUDY_FIRST.md`.
- `STUDY_FIRST.md` §6 "The token-handoff problem" — the design rationale.
- T-01's notes — the chosen handoff mechanism (query-param vs.
  polling). **Implement the mechanism T-01 recommends.** If T-01
  hasn't landed, run a fresh spike: the simplest workable option
  is the **polling fallback** (see Option A below), which requires
  no client cooperation.
- T-11's `consumePendingLogin` / `peekPendingLogin` /
  `peekMostRecentPendingLogin` / `PendingLogin.cookieHeaders`.
- T-20's `Auth` type — you'll call `auth.api.signInEmail` with
  `asResponse: true` to capture `Set-Cookie` headers (the signup
  tool may have already done this; T-22 re-emits them from the
  pending-login entry).

## Two handoff mechanisms (pick the one T-01 recommended)

### Option A — Polling fallback (default; needs no client cooperation)

1. Client SDK hits `/sign-in` (no query params it controls besides
   the OAuth ones: `redirect_uri`, `client_id`, `scope`, etc.).
2. `realSignInHandler` calls `peekMostRecentPendingLogin()`.
   - If a pending login exists and is unexpired: re-emit its
     `cookieHeaders` on the response (or, if `cookieHeaders` is
     undefined, call `auth.api.signInEmail({ body: { email,
     password }, asResponse: true })` to mint a fresh session and
     forward the cookies — but this needs the credentials, which
     the signup tool *hasn't* stored in the pending entry for
     security reasons). **The signup tool (T-41) MUST stash
     `cookieHeaders` in the pending entry** so this route doesn't
     need credentials. T-41's ticket says so.
   - 302 to `/api/auth/mcp/authorize` with the OAuth params.
3. If no pending login exists, return a small HTML page that
   long-polls `/api/auth/pending-login-wait?since=<timestamp>` and
   auto-reloads when a pending login appears. (A 10-second SSE or
   `<meta http-equiv="refresh" content="2">` loop is enough.)

   This handles the race where the client SDK's authorize request
   arrives *before* the signup tool has stored the nonce — the page
   waits, then completes the flow when the nonce appears.

### Option B — Query-param handoff (cleaner if the client supports it)

1. The `auth_signup` tool's structured result includes `loginNonce`.
2. The LLM, per the tool's `description`, includes the nonce in its
   next MCP request (e.g. as a header `X-Pending-Login-Nonce: ...`).
3. When the client SDK gets a 401 and starts the OAuth dance, the
   nonce propagates as a query param to `/sign-in?login_nonce=...`.
4. `realSignInHandler` calls `consumePendingLogin(nonce)` — one-shot.

Option B requires the LLM to actively pass the nonce *through* the
client SDK, which is fragile (the SDK owns the authorize URL). Only
use B if T-01 confirms the SDK lets the host inject extra params.

### Recommendation

Implement **Option A** (polling) as the default. If T-01 confirms
Option B is workable, add B as an optimization: when
`req.query.login_nonce` is present, use `consumePendingLogin`; else
fall back to `peekMostRecentPendingLogin` + polling. Both code
paths share the cookie-emission logic.

## Scope

### 1. `realSignInHandler(req, res, deps)`

```ts
async function realSignInHandler(req, res, { auth, authConfig, authServerUrl }) {
  const queryParams = new URLSearchParams(req.query as Record<string, string>);
  const redirectUri = queryParams.get('redirect_uri');
  const clientId = queryParams.get('client_id');
  if (!redirectUri || !clientId) {
    return res.status(400).send(missingParamsHtml());
  }

  // Try the query-param fast path.
  let pending = null;
  const nonce = queryParams.get('login_nonce');
  if (nonce) pending = consumePendingLogin(nonce);
  if (!pending) pending = peekMostRecentPendingLogin();

  if (pending && pending.cookieHeaders?.length) {
    // Fast path: re-emit cookies, redirect to authorize.
    for (const c of pending.cookieHeaders) res.append('Set-Cookie', c);
    if (nonce) consumePendingLogin(nonce); // already consumed above; idempotent
    return redirectToAuthorize(res, queryParams, authServerUrl);
  }

  // Slow path: render a small HTML page that polls and auto-reloads.
  return res.status(200).send(pollingHtml({ queryParams, authServerUrl }));
}
```

### 2. `pollingHtml(...)`

A tiny HTML page with:

- A `<meta http-equiv="refresh" content="2">` (refreshes every 2s
  with the original OAuth query string preserved).
- A short visible message: "Waiting for sign-up to complete… if
  this takes more than a minute, restart the request."
- A script that hits `/api/auth/pending-login-wait?since=<now>`
  (below) and only forces the reload when the endpoint returns
  `{ ready: true }` (avoids the meta refresh hammering).

The page preserves the original query string so the redirect to
`/api/auth/mcp/authorize` after success has all the right params.

### 3. `GET /api/auth/pending-login-wait` (new route, real mode only)

```ts
authApp.get('/api/auth/pending-login-wait', (req, res) => {
  if (authConfig.mode !== 'real') return res.status(404).end();
  const since = Number(req.query.since ?? 0);
  const pending = peekMostRecentPendingLogin();
  res.json({ ready: !!pending && pending.expiresAt > since, expiresAt: pending?.expiresAt ?? null });
});
```

This route is intentionally unauthenticated — it leaks only
"pending login exists, yes/no," not the nonce or userId. Add a
short comment justifying that.

### 4. `redirectToAuthorize(res, queryParams, authServerUrl)`

Strips `prompt` from `queryParams` only if the signup tool
captured a session that makes the consent screen redundant.
Actually, in real mode we **do** want the consent screen to render
(at least the first time), so **do not strip `prompt`**. The user
must approve. (Demo strips it because there's no real user; real
keeps it.)

```ts
function redirectToAuthorize(res, queryParams, authServerUrl) {
  const authorizeUrl = new URL('/api/auth/mcp/authorize', authServerUrl);
  authorizeUrl.search = queryParams.toString();
  res.redirect(authorizeUrl.toString());
}
```

### 5. Cookie-emission contract with T-41

T-41 (`auth_signup`) **must** store `cookieHeaders` on the
`PendingLogin` entry. This is the bridge that makes the
`/sign-in` route work without re-issuing credentials. The
contract:

- After `auth.api.signInEmail({ body: { email, password },
  asResponse: true })`, the signup tool reads
  `signInResponse.headers.getSetCookie()` (array of `Set-Cookie`
  header strings).
- It calls `createPendingLogin(userId)` to get a `PendingLogin`
  entry, then sets `entry.cookieHeaders = setCookieHeaders` and
  `entry.sessionId = ...` (parsed from the session cookie if
  feasible; otherwise leave `sessionId` undefined — the route
  only checks `cookieHeaders?.length`).

Document this contract in this ticket's comments and in T-41's
ticket — they must land together.

### 6. `missingParamsHtml()`

Tiny HTML page saying "Missing OAuth parameters" — copy of the
demo's existing 400 page, minus the demo-specific copy.

## Contract this ticket honors / establishes

- Establishes `[C-SI]` (real half).
- Establishes the `cookieHeaders` contract with T-41.

## Do not do

- Do not strip `prompt=consent` in real mode. The consent screen
  is real.
- Do not log the session cookie values. The existing
  `[Auth] Set-Cookie headers:` log line in the demo route is
  demo-only — do NOT replicate it in real mode.
- Do not call `signInEmail` from this route. The signup tool did
  that; this route only re-emits the captured cookies.
- Do not change the demo `/sign-in` route.

## Verify

- `npm run build` passes.
- `npm test` passes (demo mode default; real route is not
  exercised here).
- Manual real-mode smoke (after T-41 lands):
  1. `MCP_AUTH_MODE=real` + valid env.
  2. LLM calls `auth_signup` via `/mcp/bootstrap`.
  3. `auth_signup` returns `{ loginNonce, backupCodes }`.
  4. LLM retries any Excel tool → 401 → client SDK drives OAuth.
  5. Client hits `/sign-in` → route finds the pending login via
     `peekMostRecentPendingLogin` → re-emits cookies → 302 to
     `/api/auth/mcp/authorize`.
  6. Consent screen renders. User/LLM approves.
  7. Client exchanges code for token at
     `/api/auth/mcp/token` → bearer token.
  8. Original Excel tool call now succeeds with the bearer.

  If steps 5-6 fail, fall back to the polling page (slow path)
  and confirm the polling eventually succeeds.
- `peekMostRecentPendingLogin` returns the entry T-41 stored
  (round-trip through the shared in-process Map).
