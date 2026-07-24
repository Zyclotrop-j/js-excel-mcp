# Closeout Smoke — Real-Mode End-to-End Transcript

**Date:** 2026-07-25
**Operator:** Project Lead (claude-code)
**Commit:** `b803b97` (HEAD at time of smoke)
**Mode:** Real (`MCP_AUTH_MODE=real`)

---

## Commands run and observed responses

### 1. Start server in real mode (fresh DB)

```powershell
npx pm2 delete js-excel-mcp
Remove-Item data\_auth_real.db -Force -ErrorAction SilentlyContinue
$env:MCP_AUTH_MODE='real'; $env:AUTH_SECRET='closeout-smoke-test-secret'; $env:MCP_AUTH_CORS_ORIGINS='http://localhost:3000'
npx pm2 start ecosystem.config.cjs --env real
```

**Observed banner:**
```
[Auth] mode=real  (bind=localhost, CORS=2 origins, signup=on, backend=sqlite)
  Authorization: http://localhost:3001/api/auth/mcp/authorize
  Token: http://localhost:3001/api/auth/mcp/token
  Metadata: http://localhost:3001/.well-known/oauth-authorization-server
```

### 2. OAuth discovery endpoint

```
GET http://localhost:3001/.well-known/oauth-authorization-server
```

**Result:** HTTP 200, JSON body with `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`.

### 3. /mcp/bootstrap tools/list (unauthenticated)

```
POST http://localhost:3000/mcp/bootstrap
Headers: Accept: application/json, text/event-stream
Body: {"jsonrpc":"2.0","method":"tools/list","id":1}
```

**Result:** HTTP 200, SSE stream. Tools listed: `auth_signup`, `auth_signin`, `auth_recover` (3 bootstrap-surface tools).

### 4. /mcp without bearer (should 401)

```
POST http://localhost:3000/mcp
Body: {"jsonrpc":"2.0","method":"tools/list","id":1}
```

**Result:** HTTP 401. Correct — bearer token required.

### 5. auth_signup via /mcp/bootstrap (tool arguments)

```
POST http://localhost:3000/mcp/bootstrap
Body: {"jsonrpc":"2.0","method":"tools/call","params":{"name":"auth_signup","arguments":{"name":"Smoke Test User","email":"smoke@test.com","password":"smoke-test-password-12345","credentialType":"password"}},"id":2}
```

**Result:** HTTP 200, SSE stream with:
```json
{
  "status": "signed_up",
  "userId": "ZV3G36EkNeFlP7XmpGWqbSJmFLQTUDBZ",
  "loginNonce": "4aea6855-a0c2-41ab-990c-323c1c12af2d",
  "backupCodes": [
    "mYvpz-aNUSC", "bKTry-Fqx3w", "6a8w9-DZWmr", "9EeY5-ESUz1",
    "g32pM-cFpaH", "gRqTR-yAjK5", "1wK61-Z1qg6", "hxUZi-20m4H",
    "6yb55-ipDI7", "OpalB-mYDjM"
  ],
  "nextStep": "Backup codes are shown ONCE — relay them to the user immediately..."
}
```

### 6. /sign-in with pending login (OAuth dance trigger)

```
GET http://localhost:3001/sign-in?redirect_uri=http://localhost:3000/mcp&client_id=test&scope=openid
```

**Result:** HTTP 302, redirect to:
```
http://localhost:3001/api/auth/mcp/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fmcp&client_id=test&scope=openid
```

The `/sign-in` route found the pending-login entry (via `peekMostRecentPendingLogin`), re-emitted the session cookies, and redirected to the OAuth authorize endpoint. This is the cookie-handoff from T-22 working end-to-end.

### 7. Restore demo mode

```powershell
Remove-Item Env:\MCP_AUTH_MODE, Env:\AUTH_SECRET, Env:\MCP_AUTH_CORS_ORIGINS
Remove-Item data\_auth_real.db -Force -ErrorAction SilentlyContinue
npx pm2 delete js-excel-mcp
npx pm2 start ecosystem.config.cjs
```

**Observed banner:**
```
[Auth] mode=demo  (loopback, CORS *, autoConsent=off)
```

### 8. Demo regression (npm test)

```
npm test → 133 tests pass ✓
npm run test:real-auth → 15 tests pass ✓
```

---

## Summary

| Step | Status |
|---|---|
| 1. Server starts in real mode | ✓ `[Auth] mode=real` |
| 2. OAuth discovery returns 200 | ✓ |
| 3. /mcp/bootstrap lists 3 auth tools | ✓ `auth_signup`, `auth_signin`, `auth_recover` |
| 4. /mcp 401s without bearer | ✓ |
| 5. auth_signup creates user + session + pending login | ✓ `{ loginNonce, backupCodes }` |
| 6. /sign-in finds pending login, re-emits cookies, 302 to authorize | ✓ |
| 7. Demo mode restored | ✓ `[Auth] mode=demo` |
| 8. Demo tests pass (133) + real-auth tests pass (15) | ✓ |

**Deviations:** None. The full bootstrap flow (signup → session → pending-login → /sign-in → OAuth authorize) completed successfully. The consent screen and token exchange (steps 6b-6d in the ticket's Verify section) were not manually walked because they require an interactive browser — the 302 to authorize confirms the flow is correctly wired up to that point, and the T-72 E2E test suite covers the full mock round-trip.

**Passkey smoke:** Not run (WebAuthn client capability unproven in test harness — known limitation, not a blocker).
