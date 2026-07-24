# T-71 — Update AGENTS.md with the mode switch + real-mode reset

- **Difficulty:** 🟢 easy
- **Type:** Docs
- **Dependencies:** T-10 (env list)
- **Output:** New section in `AGENTS.md` documenting `MCP_AUTH_MODE`,
  real-mode env vars, the real-mode DB reset procedure, the
  bootstrap endpoint, and the mailer/DB pluggability story.

## Goal

Future maintainers (human or LLM) need one place to learn that real
mode exists, how to enable it, and what to do when they change the
schema. `AGENTS.md` is that place — every agent session reads it.

## Scope

### 1. New section in `AGENTS.md`

Insert after the existing PM2 section, before the Karpathy
Guidelines. Use the existing tone (concise tables, no fluff).

#### Proposed content (paste-ready, adjust to match the file's
#### existing header style)

```markdown
# Auth modes

The server supports two auth modes, switched by `MCP_AUTH_MODE`:

| Mode | Value | Behavior |
|---|---|---|
| Demo (default) | `MCP_AUTH_MODE` unset or `demo` | Auto-login, no consent screen, `origin: '*'`, loopback-only. Used by `examples/oauth/` and the test client. |
| Real | `MCP_AUTH_MODE=real` | Real signup/signin/recover via MCP tools (elicitation), real consent screen, explicit CORS origins, configurable bind host. |

## Env vars (real mode only; demo uses hardcoded defaults)

| Var | Purpose | Default |
|---|---|---|
| `MCP_AUTH_MODE` | Master switch | `demo` |
| `MCP_AUTH_DB` | SQLite path | `data/_auth_real.db` |
| `MCP_AUTH_BIND_HOST` | Bind host | `localhost` |
| `MCP_AUTH_CORS_ORIGINS` | CORS origin CSV (no `*` in real) | **required** |
| `AUTH_SECRET` | Session/JWT signing secret | **required** |
| `MCP_AUTH_ALLOW_USER_SIGNUP` | `1`/`0` | `1` |
| `AUTH_TRUSTED_ORIGINS` | better-auth trusted origins CSV | derived from base URL |
| `MCP_AUTH_OTP_TRANSPORT` | `console`/`webhook`/`sendgrid`/`custom` | `console` |
| `MCP_AUTH_OTP_WEBHOOK_URL` | When transport=webhook | — |
| `MCP_AUTH_DB_BACKEND` | `sqlite`/`d1`/`turso`/`postgres`/`custom` | `sqlite` |

The canonical list lives in `src/shared/authMode.ts` (`loadAuthConfig`).
Only `src/server.ts` and `authMode.ts` may read `process.env` for auth.

## Endpoints

| Path | Auth | Tools |
|---|---|---|
| `/mcp` | Bearer (OAuth access token or API key) | Excel tools + `auth_signout` / `auth_add_passkey` / `auth_rotate_apikey` |
| `/mcp/bootstrap` | None | `auth_signup` / `auth_signin` / `auth_recover` |

An unauthenticated LLM connects to `/mcp/bootstrap` to sign up; once
authenticated, it connects to `/mcp` for the Excel tools. See
`tickets/real-auth/notes/SIGNUP_FLOW.md` (T-44) for the full flow.

## Schema reset

The real-mode schema is hand-written DDL with `CREATE TABLE IF NOT
EXISTS`. **Adding a column to an existing table does not work** —
delete the DB file before restarting:

```
npx pm2 stop js-excel-mcp
Remove-Item data\_auth_real.db -Force -ErrorAction SilentlyContinue
npx pm2 start ecosystem.config.cjs --env real
```

Demo mode (`data/_auth.db`) follows the same rule.

## Pluggable surfaces

Two real-mode surfaces are designed to be swapped via follow-up
tickets, without touching tools or auth-server:

- **Mailer** (`src/shared/mailer.ts`): the `OtpMailer` function slot.
  Today: `consoleMailer` / `webhookMailer`. Follow-up T-80 adds
  SendGrid / Postmark.
- **Database** (`src/shared/authDatabase/`): the `AuthDatabase`
  interface. Today: `openSqliteAuthDatabase`. Follow-up T-81 adds
  Kysely-backed D1 / Turso / Postgres backends.
```

### 2. Cross-link from the existing "Server management with PM2" section

Add a one-line pointer to the new section so a reader of the PM2
table notices real mode exists.

### 3. Don't touch the Karpathy Guidelines section

That's a separate licensed doc — leave it alone.

## Do not do

- Do not duplicate the full env table in `STUDY_FIRST.md` — point
  there for implementers; `AGENTS.md` is for operators.
- Do not edit existing sections beyond the cross-link.

## Verify

- The new section exists, the env table matches T-10's canonical
  list, the schema reset command matches T-12's verify command.
- A fresh reader can take `AGENTS.md` alone, set the env vars, and
  start the server in real mode without reading anything else.
