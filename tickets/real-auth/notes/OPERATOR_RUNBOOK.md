# Operator Runbook — Real-Auth Mode

This runbook tells an operator how to start the `js-excel-mcp` server in demo mode (unchanged) and real mode (new), and what to do when things go wrong.

---

## 1. Start in demo mode (unchanged)

```
npx pm2 start ecosystem.config.cjs
```

No env vars needed. The server starts on port 3000 (MCP) and port 3001 (OAuth AS).

**Verify:** `npx pm2 logs js-excel-mcp --lines 10 --nostream --out` shows:
```
[Auth] mode=demo  (loopback, CORS *, autoConsent=off)
[Auth] Demo user credentials (auto-login):
[Auth]   Email:    demo@example.com
[Auth]   Password: ernCjBsavZjKxznbu_1g1g
```

The OAuth discovery endpoint at `http://localhost:3001/.well-known/oauth-authorization-server` returns JSON (200).

---

## 2. Start in real mode

```
npx pm2 start ecosystem.config.cjs --env real
```

This loads the `env_real` block from `ecosystem.config.cjs`. The operator MUST override `AUTH_SECRET` with a real secret before production use:

```
AUTH_SECRET=<your-strong-secret> npx pm2 start ecosystem.config.cjs --env real
```

### Required env vars (fail-fast if missing)

| Var | Purpose | Default in `env_real` | Must override? |
|---|---|---|---|
| `MCP_AUTH_MODE` | Master switch | `real` (set by `--env real`) | No |
| `AUTH_SECRET` | Session/JWT signing secret | `CHANGE_ME` | **YES — replace before production** |
| `MCP_AUTH_CORS_ORIGINS` | CORS origin CSV (no `*` in real) | `http://localhost:3000,http://localhost:5173` | Adjust to your origins |
| `MCP_AUTH_BIND_HOST` | Bind host | `localhost` | Set `0.0.0.0` for external |
| `MCP_AUTH_ALLOW_USER_SIGNUP` | `1`/`0` | `1` | Set `0` to disable public signup |
| `MCP_AUTH_OTP_TRANSPORT` | `console`/`webhook`/`sendgrid`/`custom` | `console` | Set `webhook` + `MCP_AUTH_OTP_WEBHOOK_URL` for email delivery |
| `MCP_AUTH_DB_BACKEND` | `sqlite`/`d1`/`turso`/`postgres`/`custom` | `sqlite` | Leave `sqlite` until T-81 |
| `MCP_AUTH_PASSKEY_RP_ID` | Passkey relying-party ID | `localhost` | Set to your domain for production |
| `MCP_AUTH_PASSKEY_RP_NAME` | Passkey display name | `js-excel-mcp Auth` | Optional |

### Fail-fast rules

In real mode, the server throws at startup if:
- `AUTH_SECRET` is missing or still `CHANGE_ME`.
- `MCP_AUTH_CORS_ORIGINS` is missing or `*` (refused in real mode).
- `MCP_AUTH_OTP_TRANSPORT=webhook` but `MCP_AUTH_OTP_WEBHOOK_URL` is missing.
- `MCP_AUTH_DB_BACKEND` is not `sqlite` but `MCP_AUTH_DB_URL` is missing.

In demo mode, none of these are checked — the server uses hardcoded defaults.

**Verify:** `npx pm2 logs js-excel-mcp --lines 10 --nostream --out` shows:
```
[Auth] mode=real  (bind=localhost, CORS=2 origin(s), signup=on, backend=sqlite)
```

---

## 3. Schema reset procedure

The real-mode auth schema lives in `data/_auth_real.db` (SQLite, hand-written DDL with `CREATE TABLE IF NOT EXISTS`). **Adding a column to an existing table does NOT work** — delete the DB file before restarting:

```powershell
npx pm2 stop js-excel-mcp
Remove-Item data\_auth_real.db -Force -ErrorAction SilentlyContinue
npx pm2 start ecosystem.config.cjs --env real
```

Demo mode (`data/_auth.db`) follows the same rule:
```powershell
npx pm2 delete js-excel-mcp
Remove-Item data\*.db -Force
npx pm2 start ecosystem.config.cjs
```

---

## 4. The three signup paths

The LLM connects to `/mcp/bootstrap` (unauthenticated MCP endpoint) and calls `auth_signup` with tool arguments:

| Credential | What the LLM passes | What happens |
|---|---|---|
| **Password** | `name`, `email`, `password`, `credentialType: 'password'` | `signUpEmail` → `signInEmail` (captures cookies) → `enableTwoFactor` (generates backup codes) → pending-login entry → returns `{ loginNonce, backupCodes }` |
| **Passkey** | `name`, `credentialType: 'passkey'` | `signUpEmail` (synthetic email + throwaway password) → `signInEmail` → `enableTwoFactor` → pending-login entry → returns `{ loginNonce, backupCodes }`. The actual passkey is registered later via `auth_add_passkey` on `/mcp`. |
| **Magic-link** | `name`, `email`, `credentialType: 'magiclink'` | `signInMagicLink` (creates user, sends link) → returns `{ status: 'magic_link_sent' }`. The user clicks the link in their email; the LLM then calls `auth_signin`. |

### Recovery flow (backup codes)

After signup, the user receives 10 backup codes. To recover access:
1. The LLM calls `auth_signin` with `identifier` (email) + `password` + `backupCode` (the backup code is the 2FA second factor).
2. If the user is passkey-only (no password), backup-code recovery is **unsupported in better-auth v1.6.23** — `verifyBackupCode` requires a `two_factor` cookie from a prior `signInEmail` which requires a password. The tool returns an error directing the user to contact the operator.

### API-key flow (persistent LLM access)

After the initial OAuth bootstrap, the LLM can call `auth_rotate_apikey` with `action: 'issue'` on `/mcp` to get a long-lived API key (`mcp_...`). The LLM stores the key and uses it as `Authorization: Bearer mcp_...` on subsequent runs, skipping the entire OAuth dance.

---

## 5. Known limitations

1. **No SMTP transport until T-80.** The default mailer is `consoleMailer` (logs OTP/magic-link to stdout). The `webhookMailer` is available but requires a webhook URL. SendGrid/Postmark require T-80.
2. **SQLite-only until T-81.** The real-mode auth DB is file-backed `better-sqlite3` at `data/_auth_real.db`. Cloudflare D1 / Turso / Postgres require T-81.
3. **Passkey bootstrap uses a throwaway password.** `auth_signup` with `credentialType: 'passkey'` creates the account with a synthetic email + throwaway password (used once, never persisted). The actual passkey is registered later via `auth_add_passkey`. This is because `verifyPasskeyRegistration` returns no session and `auth.api.createSession` doesn't exist in better-auth v1.6.23.
4. **Passkey-only backup-code recovery is unsupported.** `verifyBackupCode` requires a `two_factor` cookie from `signInEmail` (which needs a password). Passkey-only accounts can't recover via backup codes in v1.6.23.
5. **Cross-user API-key revocation is out of scope.** The `deleteApiKey` fallback uses a `referenceId` ownership guard — users can only revoke their own keys.
6. **Elicitation is not used.** The installed MCP SDK (`@modelcontextprotocol/server@2.0.0-beta.3`) uses the 2025-11-25 protocol (legacy era) which can't fulfill `inputRequired.elicit()` in per-request serving mode. All auth tools use tool arguments (zod inputSchema) instead. See `tickets/real-auth/notes/arch-decision-elicitation-blocker.md`.
7. **`/mcp/bootstrap` is not advertised by the server.** The LLM's host system prompt must tell it to connect to `/mcp/bootstrap` after receiving a 401 from `/mcp`. The PRM at `/.well-known/oauth-protected-resource/mcp` points at `/mcp` only.

---

## 6. Where to find logs and what to look for

```powershell
# stdout (banner, mode, OAuth endpoints)
npx pm2 logs js-excel-mcp --lines 50 --nostream --out

# stderr (errors, Protected Resource Metadata)
npx pm2 logs js-excel-mcp --lines 50 --nostream --err

# Both
npx pm2 logs js-excel-mcp --lines 50 --nostream
```

**What to look for in the startup banner:**
- `[Auth] mode=demo` or `[Auth] mode=real` — confirms which mode is active.
- `OAuth Authorization Server listening on port 3001` — the AS is up.
- `Database schema initialized (data/_auth.db)` or `(data/_auth_real.db)` — the DB is ready.
- In real mode with `consoleMailer`: `[Mailer] flow=magic-link to=... otp=...` — the OTP/magic-link is in the log (for console transport only).

---

## 7. MCP endpoints

| Path | Auth | Tools |
|---|---|---|
| `/mcp/bootstrap` | None | `auth_signup`, `auth_signin`, `auth_recover` |
| `/mcp` | Bearer (OAuth access token or API key) | 60 Excel tools + `auth_signout`, `auth_add_passkey`, `auth_rotate_apikey` |

An unauthenticated LLM connects to `/mcp/bootstrap` to sign up; once authenticated, it connects to `/mcp` for the Excel tools.

---

## 8. Test commands

| Command | What it runs |
|---|---|
| `npm test` | 133 demo-mode tests (baseline + auth-mode regression) |
| `npm run test:real-auth` | 15 real-mode tests (signup-to-Excel, signin, recover, API-key, passkey, demo-regression) |
| `npm run build` | TypeScript compile to `dist/` |
