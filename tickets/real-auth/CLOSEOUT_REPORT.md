# Closeout Report — Real-Auth Initiative

**Project:** js-excel-mcp real-auth
**Date:** 2026-07-25
**Project Lead:** claude-code (z-ai/glm-5.2)
**Lead Architect:** claude-code (z-ai/glm-5.2)

---

## 1. What was shipped

A real, switchable authentication mode for the `js-excel-mcp` server, gated by a single env switch (`MCP_AUTH_MODE=demo|real`, default `demo`). Demo mode remains byte-for-byte identical to pre-initiative behavior. Real mode adds: user signup (password/passkey/magic-link), signin, recovery (backup codes), long-lived API keys, passkey registration, and session signout — all driven by LLM-callable MCP tools on a two-endpoint layout (`/mcp/bootstrap` unauthenticated, `/mcp` bearer-protected). The `@better-auth/passkey` and `@better-auth/api-key` packages were added as separate scoped packages (passkey stays in MVP; email is truly optional). The `OtpMailer` and `AuthDatabase` interfaces are designed for pluggable follow-ups (T-80 mailer, T-81 DB).

---

## 2. Tickets merged

| Ticket | Assignee | Status | Commit |
|---|---|---|---|
| T-00 | researcher (general) | Merged | `0c5998e` |
| T-01 | researcher (general) | Merged | pre-existing |
| T-02 | researcher (general) | Merged | `0c5998e` |
| T-10 | junior-engineer-config (general) | Merged | `654d487` |
| T-11 | junior-engineer-router (general) | Merged | `654d487` |
| T-12 | engineer-schema | Merged | `995af75` |
| T-20 | senior-engineer-auth-a | Merged | `f59f9c5` |
| T-21 | senior-engineer-auth-a | Merged | `7c0e2a2` |
| T-22 | senior-engineer-auth-a | Merged | `7bd9a5e` |
| T-30 | engineer-schema | Merged | `cfc1383` |
| T-40 | senior-engineer-mcp | Merged | `92595cd` |
| T-41 | senior-engineer-mcp | Merged | `349f003` |
| T-42 | engineer-tools (general) | Merged | `a2e66aa` |
| T-43 | engineer-tools (general) | Merged | `a2e66aa` |
| T-44 | junior-engineer-docs (general) | Merged | `b803b97` |
| T-50 | engineer-followup (general) | Merged | `7337b0e` |
| T-51 | engineer-tools (general) | Merged | `a2e66aa` |
| T-52 | engineer-tools (general) | Merged | `a2e66aa` |
| T-70 | junior-engineer-docs (general) | Merged | `25025d7` |
| T-71 | junior-engineer-docs (general) | Merged | `25025d7` |
| T-72 | senior-qa (general) | Merged | `25025d7` |

**Note:** Several agents (`researcher`, `junior-engineer-config`, `junior-engineer-router`, `junior-engineer-docs`, `engineer-tools`, `engineer-followup`) were reassigned to the `general` subagent due to cached broken model configs in the opencode session (double-prefix bugs + unreliable free models). See `tickets/real-auth/notes/SCOPE_CHANGES.md` for the full record.

---

## 3. Contracts honored

| Contract | How upheld |
|---|---|
| `[C-MODE]` | `loadAuthConfig(baseURL)` in `authMode.ts` implements the `AuthConfig` type with all env vars, defaults, and fail-fast rules. Demo mode never fails; real mode fails fast on missing `AUTH_SECRET`, `*` CORS, webhook-without-URL, non-sqlite-without-URL. |
| `[C-ENV]` | `authMode.ts` is the single `process.env` reader (alongside `server.ts`). No other file reads `process.env` for auth. |
| `[C-DB]` | `openSqliteAuthDatabase(dbPath, mode)` in `authDatabase/sqliteAuthDatabase.ts` returns `{ betterAuthHandle, initializeSchema, close }`. Demo DDL moved verbatim; real DDL from T-02 pasted verbatim. |
| `[C-MAILER]` | `OtpMailer` interface in `mailer.ts`; `consoleMailer` (default), `webhookMailer` (uses existing `wretch` dep), `resolveMailer(cfg)` priority chain. SendGrid requires T-80. |
| `[C-PL]` | `pendingLogin.ts` — module-level `Map<string, PendingLogin>`, 5-min TTL, sweep-on-create, one-shot consume, `peekMostRecentPendingLogin`, mutation-on-returned-reference for `sessionId`/`cookieHeaders`. |
| `[C-SI]` | Demo `/sign-in` auto-login preserved verbatim in `demoSignInHandler`. Real `/sign-in` (`realSignInHandler`) consumes pending-login nonce, re-emits cookies, redirects to authorize without stripping `prompt=consent`. Polling fallback for race conditions. |
| `[C-EP]` | Two-endpoint layout: `/mcp/bootstrap` (no bearer, auth tools) + `/mcp` (bearer, Excel tools + authenticated auth tools). PRM router points at `/mcp` only. |
| `[C-PA]` | Auth tools use tool arguments (zod `inputSchema`), not elicitation — per `arch-decision-elicitation-blocker.md` Option 2. `AuthToolHandler.authSurface` discriminator (`'bootstrap'` / `'authenticated'`). |
| `[C-AT]` | Authenticated tools (`auth_signout`, `auth_add_passkey`, `auth_rotate_apikey`) on `/mcp` with `authSurface = 'authenticated'`. Plain `CallToolResult`, no elicitation. |
| `[C-VF]` | `tokenVerifier` (renamed from `demoTokenVerifier`) — MCP OIDC session check first, API-key fallthrough second (`auth.api.verifyApiKey`), `credentialType: 'api-key'` in `AuthInfo.extra`. `demoTokenVerifier` kept as alias. |
| `[C-APIKEY]` | `@better-auth/api-key` plugin wired in `buildRealAuth`. `createApiKey`/`verifyApiKey`/`deleteApiKey` with `referenceId` ownership guard. Direct DB delete fallback includes `referenceId` ownership check. |
| `[C-REG]` | `auth_signup` takes `name` (required), `email` (optional), `password` (optional), `credentialType` (required: password/passkey/magiclink). Creates user via `signUpEmail`, session via `signInEmail`, backup codes via `enableTwoFactor`. |
| `[C-ELICIT]` | Amended per `arch-decision-elicitation-blocker.md` — tool arguments replace elicitation. The `[C-ELICIT]` ID is retained for traceability; the body documents the tool-arguments pattern. |
| `[C-RECOVER]` | `auth_recover` takes `identifier` + `backupCode`. Passkey-only recovery is unsupported in v1.6.23 (`verifyBackupCode` requires `two_factor` cookie from `signInEmail`). Tool returns actionable error. Partially fulfilled — see `FOLLOWUPS.md` P5. |

---

## 4. Deviations from the plan

| Deviation | Rationale | Architect sign-off |
|---|---|---|
| **Elicitation replaced with tool arguments** (T-41, T-42, T-43, T-51) | Installed SDK (`@modelcontextprotocol/server@2.0.0-beta.3`) uses 2025-11-25 protocol — can't fulfill `inputRequired.elicit()` in per-request serving mode. | `arch-decision-elicitation-blocker.md` — Option 2 |
| **Passkey signup uses throwaway-password bootstrap** (T-41) | `auth.api.createSession` doesn't exist in better-auth v1.6.23. `verifyPasskeyRegistration` returns no session. Throwaway password → `signUpEmail` → `signInEmail` → session is the workaround. | Architect review of T-41 |
| **Passkey-only backup-code recovery unsupported** (T-43) | `verifyBackupCode` requires `two_factor` cookie from `signInEmail` (needs password). Passkey-only accounts can't recover via backup codes. | Dispatch directive authorized "surface as error" |
| **`emailOptionalPlugin` added to demo plugins array too** (T-20) | Unifies schema across modes; removes T-21 mode-switch footgun; demo DBs byte-identical (`CREATE TABLE IF NOT EXISTS` doesn't migrate). | `T-20-arch-review.md` |
| **`rpID`/`rpName` env overrides added** (T-21) | T-20 arch-review flagged hardcoded values. T-21 added `MCP_AUTH_PASSKEY_RP_ID` / `MCP_AUTH_PASSKEY_RP_NAME` to `AuthConfig` with env-driven defaults. | Bonus from T-21 |
| **Per-route `cors()` fix on `/.well-known/oauth-authorization-server`** (T-21) | Pre-existing per-route `cors()` calls used default `origin: *`, overriding the app-level CORS in real mode. Updated to pass `{ origin: corsOrigin }`. | Necessary for real-mode CORS |
| **Agent model configs fixed** (process change) | 8 agent files had double-prefix model bugs (`openrouter/openrouter/...`) or unreliable free models. Fixed to `openrouter/z-ai/glm-5.2` (confirmed working) or `openrouter/pareto-code` (fixed prefix). | `SCOPE_CHANGES.md` |
| **Agent reassignment to `general` subagent** (process change) | Task tool caches agent-file models at session start; mid-session edits aren't picked up. Agents with broken-at-session-start models were dispatched via the built-in `general` subagent (same model). | `SCOPE_CHANGES.md` |

---

## 5. Known limitations

1. **No SMTP transport until T-80.** Default mailer logs to stdout.
2. **SQLite-only until T-81.** File-backed `better-sqlite3`.
3. **Passkey bootstrap uses a throwaway password.** `verifyPasskeyRegistration` returns no session; `createSession` doesn't exist in v1.6.23.
4. **Passkey-only backup-code recovery is unsupported.** `verifyBackupCode` requires a password.
5. **Cross-user API-key revocation is out of scope.** Ownership guard in `directDbDelete` prevents it.
6. **Elicitation is not used.** Tools use tool arguments. SDK upgrade needed for elicitation (P3 in FOLLOWUPS).
7. **`/mcp/bootstrap` is not advertised by the server.** The LLM's host system prompt must mention it.

---

## 6. Follow-ups

See `tickets/real-auth/notes/FOLLOWUPS.md` for the full list:
- P1: T-80 mailer (SendGrid/Postmark)
- P2: T-81 DB (D1/Turso/Postgres)
- P3: MCP SDK upgrade (elicitation support)
- P4: better-auth upgrade (passkey session bootstrap)
- P5: Passkey-only backup-code recovery
- P6: Alternative single-endpoint architecture (future iteration)
- P7: `handleChain.ts` message (self-resolved)
- P8: `AGENTS.md` stale Auth subsection (minor docs hygiene)

---

## 7. Final test status

| Suite | Result | Commit SHA |
|---|---|---|
| `npm test` (demo) | 133 pass ✓ | `b803b97` |
| `npm run test:real-auth` | 15 pass ✓ | `b803b97` |
| `npm run build` (tsc) | clean ✓ | `b803b97` |
| Closeout smoke (real-mode end-to-end) | pass ✓ | `b803b97` |

---

## 8. Sign-off

**Project Lead:** claude-code (z-ai/glm-5.2)
**Lead Architect:** claude-code (z-ai/glm-5.2)
**Date:** 2026-07-25

All six closeout items (section 12 of the briefing) are satisfied:
1. ✅ Implementation done — all 22 core tickets merged.
2. ✅ Operator runbook delivered — `tickets/real-auth/notes/OPERATOR_RUNBOOK.md`.
3. ✅ Closeout smoke recorded — `tickets/real-auth/notes/CLOSEOUT_SMOKE.md`.
4. ✅ Tickets archived — all `T-NN-*.md` files under `tickets/real-auth/done/`.
5. ✅ Follow-ups recorded — `tickets/real-auth/notes/FOLLOWUPS.md`.
6. ✅ Closeout report produced — this document.
