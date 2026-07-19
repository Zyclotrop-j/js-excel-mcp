# T-21 — Branch `authServer.ts` on mode (CORS, bind host, `/sign-in`)

- **Difficulty:** 🔴 hard
- **Type:** Auth server
- **Dependencies:** T-20 (createAuth dispatcher), T-11 (pending-login store)
- **Output:** Refactored `src/shared/authServer.ts`
- **Blocks:** T-22

## Goal

Make `setupAuthServer` mode-aware: demo mode keeps the current
behavior byte-for-byte; real mode swaps CORS, bind host, and the
`/sign-in` route (the demo auto-login becomes a real handler backed
by the pending-login store). The `autoConsent` middleware is
demo-only and is force-disabled in real mode.

## Context (read before starting)

- `src/shared/authServer.ts` (current) — note in particular:
  - CORS `origin: '*'` at line 125-129.
  - `authApp.listen(authPort, 'localhost', ...)` at line 329.
  - The custom `/sign-in` route at line 253-324 (demo auto-login).
  - The `autoConsent` middleware at line 169-185.
  - The `iss` redirect-rewriting middleware at line 144-160 — this
    one is **mode-agnostic** (it implements RFC 9207) and stays in
    both modes.
- `[C-EP]`, `[C-SI]`, `[C-ENV]` in `STUDY_FIRST.md`.
- T-11's `pendingLogin` store.
- T-20's `createAuth(cfg, opts)`.

## Scope

### 1. `SetupAuthServerOptions` refactor

```ts
export interface SetupAuthServerOptions {
  authServerUrl: URL;
  mcpServerUrl: URL;
  authConfig: AuthConfig;        // replaces `demoMode: boolean`
  dangerousLoggingEnabled?: boolean;
  autoConsent?: boolean;          // ignored unless authConfig.mode === 'demo'
}
```

Remove `demoMode` from the interface (it's now `authConfig.mode === 'demo'`).
Update `src/server.ts` to drop the `demoMode` field — T-10 already
added `authConfig`. After this ticket, `server.ts` reads:

```ts
const authConfig = loadAuthConfig(baseUrl);
setupAuthServer({ authServerUrl, mcpServerUrl, authConfig, autoConsent: false });
```

### 2. CORS — branch on mode

```ts
const corsOrigin = authConfig.mode === 'demo' ? '*' : authConfig.corsOrigins;
authApp.use(cors({ origin: corsOrigin }));
```

In real mode, `corsOrigins` is an explicit list (T-10's fail-fast
already refuses `*`). Pass the array to `cors()` directly; the
`cors` package accepts string or array.

### 3. Bind host — branch on mode

```ts
authApp.listen(authPort, authConfig.bindHost, (error) => { ... });
```

Demo mode: `bindHost` is `localhost` (current behavior). Real mode:
operators set `MCP_AUTH_BIND_HOST` (e.g. `0.0.0.0`).

### 4. `autoConsent` — demo-only, enforced

The existing `autoConsent` middleware (lines 169-185) is only
mounted when `authConfig.mode === 'demo' && options.autoConsent ===
true`. In real mode, ignore the option entirely — never mount
the middleware. Add an `if` guard:

```ts
if (authConfig.mode === 'demo' && options.autoConsent) {
  authApp.use(/* the existing prompt-stripping middleware */);
}
```

In real mode, the consent screen is always rendered by better-auth's
MCP plugin.

### 5. `/sign-in` route — branch on mode

Demo branch: keep the current body (lines 253-324) **verbatim**.
Real branch: replace with the pending-login-aware handler. **T-22
implements the real branch's body** — this ticket just carves out
the branch and calls a stub:

```ts
authApp.get('/sign-in', async (req, res) => {
  if (authConfig.mode === 'demo') {
    return demoSignInHandler(req, res, /* deps */);
  }
  return realSignInHandler(req, res, /* deps */);
});
```

Where `demoSignInHandler` is the current `/sign-in` body renamed,
and `realSignInHandler` is a stub that T-22 fills in (for now, it
can 501 Not Implemented so the route shape is in place without
breaking demo).

### 6. RFC 9207 `iss` middleware — keep in both modes

The middleware at lines 144-160 (rewriting the `Location` header to
add `iss`) is mode-agnostic and stays mounted in both modes.

### 7. `dangerousLoggingEnabled` branch — keep in both modes

The verbose-logging branch (lines 189-228) is mode-agnostic. Keep
it.

### 8. Startup banner

Replace the current `console.log('OAuth Authorization Server
listening on port ${authPort}')` block with a mode-aware version:

```
[Auth] mode=demo  (loopback, CORS *, autoConsent=off)
[Auth] mode=real  (bind=0.0.0.0, CORS=3 origins, signup=on, backend=sqlite)
```

The exact fields printed depend on `authConfig`; keep it short.

### 9. `ensureDemoUserExists` — demo-only

Move `ensureDemoUserExists` into the demo branch of `demoSignInHandler`
(it's only ever called from the demo `/sign-in` route). Real mode
never seeds a user.

## Contract this ticket honors / establishes

- Establishes the mode-aware `setupAuthServer`.
- Honors `[C-ENV]`, `[C-SI]` (demo half — real half is T-22).
- Preserves `demoTokenVerifier` (T-30 renames it).

## Do not do

- Do not implement `realSignInHandler`'s body — T-22 does.
- Do not change the demo `/sign-in` route logic — only its location
  (extracted into a named function).
- Do not change the `iss` middleware.
- Do not change `demoTokenVerifier` — T-30 owns that.
- Do not add new deps.

## Verify

- `npm run build` passes.
- `npm test` passes — demo mode default, all existing tests unchanged.
- `MCP_AUTH_MODE=demo` → behavior identical to today. Manual smoke:
  start the server, run the demo client in `examples/oauth/`, see
  the full OAuth dance complete with auto-login.
- `MCP_AUTH_MODE=real` with valid env → server starts on the
  configured `bindHost`, CORS rejects requests from origins not in
  the list (curl with a bad `Origin` header → 403 / CORS error),
  `/sign-in` returns 501 (until T-22 lands).
- `autoConsent: true` with `MCP_AUTH_MODE=real` → middleware NOT
  mounted (no `prompt` stripping). Verify by inspecting the request
  log — `prompt=consent` should reach better-auth and trigger the
  consent UI.
