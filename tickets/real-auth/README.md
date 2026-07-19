# Real Auth Mode — Implementation Plan

This folder contains the ticket breakdown for adding a real, switchable
authentication mode to the js-excel-mcp server, alongside the existing demo
auth. The new mode supports:

- User **signup**, **signin**, **logout** — driven by an LLM *through MCP
  tools* (using elicitation), not via an external admin API.
- Passkeys, password, and magic-link credentials. Phone number is
  **unsupported** (not merely optional).
- Email is **optional** — passkey-only accounts are first-class.
- Account recovery via **backup codes** (better-auth `twoFactor.backupCodes`
  plugin) plus magic-link-to-email when an email is on file.
- LLM-friendly persistent access via long-lived **API keys** issued to a
  user.

Everything is gated by a single env switch: `MCP_AUTH_MODE=demo|real`
(default `demo`). Demo mode must remain byte-for-byte identical to current
behavior.

## Read this first

Before implementing **any** ticket, read
[`STUDY_FIRST.md`](./STUDY_FIRST.md). It documents the current code, the
contracts each ticket must honor, and the better-auth / MCP SDK primitives
the plan depends on. Tickets reference contracts by ID (e.g. `[C-DB]`,
`[C-PA]`) defined in STUDY_FIRST.md.

## Ticket index

Tickets are numbered. `T-NN-<name>`. Difficulty: 🟢 easy / 🟡 medium / 🔴 hard.
Dependencies are ticket numbers that must merge before this one can be
implemented cleanly (you may still spike on a branch in parallel).

### Study tickets (no code; produce notes in `tickets/real-auth/notes/`)

| # | Title | Diff | Deps |
|---|---|---|---|
| [T-00](./T-00-study-better-auth-plugins.md) | Study better-auth plugins: passkey, magicLink, twoFactor.backupCodes, apiKey | 🟡 | — |
| [T-01](./T-01-study-elicitation-support.md) | Confirm MCP client elicitation support + `acceptedContent` semantics | 🟡 | — |
| [T-02](./T-02-study-schema-email-optional.md) | Spike: email-optional user schema with passkey-only accounts | 🔴 | T-00 |

### Foundation (shared infra; everything else depends on these)

| # | Title | Diff | Deps |
|---|---|---|---|
| [T-10](./T-10-env-and-config.md) | Env switch + `AuthMode` config type | 🟢 | — |
| [T-11](./T-11-pending-login-store.md) | In-process pending-login nonce store | 🟢 | — |
| [T-12](./T-12-real-auth-schema.md) | Real-mode SQLite schema (hand-written DDL) | 🟡 | T-02 |

### Auth server (better-auth options + Express wiring)

| # | Title | Diff | Deps |
|---|---|---|---|
| [T-20](./T-20-refactor-auth-dispatcher.md) | Refactor `auth.ts` into mode dispatcher + two builders | 🟡 | T-10, T-12, T-00 |
| [T-21](./T-21-refactor-authServer-mode.md) | Branch `authServer.ts` on mode (CORS, bind host, `/sign-in`) | 🔴 | T-20, T-11 |
| [T-22](./T-22-pending-login-handoff.md) | Real-mode `/sign-in` consumes pending-login nonce | 🔴 | T-21, T-11 |

### Token verifier

| # | Title | Diff | Deps |
|---|---|---|---|
| [T-30](./T-30-token-verifier-rename.md) | Rename `demoTokenVerifier` → `tokenVerifier` (keep alias) | 🟢 | T-20 |

### Bootstrap (unauthenticated MCP endpoint + auth tools)

| # | Title | Diff | Deps |
|---|---|---|---|
| [T-40](./T-40-bootstrap-endpoint.md) | Unauthenticated `/mcp/bootstrap` endpoint + Excel-tool `/mcp` | 🔴 | T-30 |
| [T-41](./T-41-auth-signup-tool.md) | `auth_signup` tool with elicitation + pending-login handoff | 🔴 | T-40, T-22, T-00, T-01 |
| [T-42](./T-42-auth-signin-tool.md) | `auth_signin` tool (password / backup-code / magic-link) | 🟡 | T-41 |
| [T-43](./T-43-auth-recover-tool.md) | `auth_recover` tool (backup-code recovery flow) | 🟡 | T-41 |
| [T-44](./T-44-signup-flow-doc.md) | Flow doc + sequence diagram for the LLM bootstrap loop | 🟢 | T-41, T-42, T-43 |

### Authenticated (post-login) tools

| # | Title | Diff | Deps |
|---|---|---|---|
| [T-50](./T-50-auth-signout-tool.md) | `auth_signout` tool (authenticated, always present once authed) | 🟢 | T-40 |
| [T-51](./T-51-auth-add-passkey-tool.md) | `auth_add_passkey` tool (elicitation → passkey register) | 🟡 | T-50, T-00 |
| [T-52](./T-52-auth-rotate-apikey-tool.md) | `auth_rotate_apikey` tool (issue/rotate long-lived API key) | 🟡 | T-50, T-00 |

### Docs, env, verification

| # | Title | Diff | Deps |
|---|---|---|---|
| [T-70](./T-70-ecosystem-env.md) | `ecosystem.config.cjs` env vars for real mode | 🟢 | T-10 |
| [T-71](./T-71-agents-md-docs.md) | Update AGENTS.md with the mode switch + real-mode reset | 🟢 | T-10 |
| [T-72](./T-72-verification-tests.md) | E2E verification: demo unchanged, real-mode bootstrap + recovery | 🔴 | T-41–T-43, T-50–T-52 |

### Follow-up tickets (designed-in pluggability; not in the current waves)

| # | Title | Diff | Deps |
|---|---|---|---|
| [T-80](./T-80-mailer-pluggability.md) | Plug in a real mailer (SendGrid/Postmark) behind the `OtpMailer` slot | 🟡 | T-20 |
| [T-81](./T-81-db-pluggability.md) | Swap SQLite for Cloudflare D1 / Turso / Postgres behind `AuthDatabase` | 🔴 | T-12, T-20 |

## Suggested parallelism

- **Wave 1 (study, parallel):** T-00, T-01, T-02.
- **Wave 2 (foundation, parallel after wave 1):** T-10, T-11, T-12.
- **Wave 3 (auth server, sequential):** T-20 → T-21 → T-22.
- **Wave 4 (parallel):** T-30, T-40 (after T-20 / T-22).
- **Wave 5 (parallel after T-40):** T-41, T-50. Then T-42, T-43, T-51, T-52.
- **Wave 6 (docs/test):** T-70, T-71, T-72.

## What this plan deliberately does NOT include (but is designed to enable as follow-ups)

The plan ships working real auth with sensible defaults. Two surfaces are
**designed to be pluggable** so a follow-up can swap them without reworking
the foundation:

### Mailer (magic-link / verification OTP delivery)

Default: log the OTP / link to stdout (console). The real-mode better-auth
options expose a **mailer function slot** (`OtpMailer` interface, see
`[C-MAILER]` in STUDY_FIRST.md) that today is wired to the console impl.
Follow-up ticket [T-80](./T-80-mailer-pluggability.md) replaces that slot
with a real implementation (SendGrid SDK, Postmark, etc.) — a single env
swap, no schema or tool changes.

### Database backend

Default: file-backed `better-sqlite3` at `data/_auth_real.db`, same as demo
mode. Real mode routes through a **thin DB abstraction**
(`AuthDatabase` interface, see `[C-DB]` in STUDY_FIRST.md) so a follow-up
can swap to Cloudflare D1, Turso/libSQL, or Postgres via Kysely dialects
without touching any tool or auth-server code. Follow-up ticket
[T-81](./T-81-db-pluggability.md) is the swap.

### Explicitly out of scope (and not designed to be added later via this plan)

- No admin HTTP endpoint. The LLM does everything through MCP tools.
- No phone-number plugin. Phone is unsupported (not just optional).
- No migration runner. Schema is hand-written DDL (one
  paste-from-`better-auth generate` step in T-12). A future migration
  story is its own project.
- No new npm dependencies for the core plan; the mailer and DB swap
  tickets (T-80, T-81) will add their own deps when they land.
