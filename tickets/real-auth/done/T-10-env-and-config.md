# T-10 — Env switch + `AuthMode` config type

- **Difficulty:** 🟢 easy
- **Type:** Foundation
- **Dependencies:** none
- **Output:** `src/shared/authMode.ts`, `src/shared/mailer.ts` (interface only — impl in T-20), `src/shared/authDatabase.ts` (interface only — impl in T-12)
- **Blocks:** T-12, T-20, T-21, T-70, T-71

## Goal

Introduce the single env switch `MCP_AUTH_MODE=demo|real` and the
`AuthConfig` type that every later ticket reads from. No behavior
changes in demo mode. No real-mode behavior yet — this ticket only
produces the config plumbing.

## Why this first

Every later ticket reads config through `loadAuthConfig(baseURL)`.
Building that one function and the `AuthConfig` shape now means
downstream tickets don't need to invent their own env reads. The
`AGENTS.md` rule "no `process.env` outside `server.ts`" is honored
because `authMode.ts` is the single helper `server.ts` calls.

## Scope

### New file `src/shared/authMode.ts`

Implements `[C-MODE]` from `STUDY_FIRST.md` **exactly**. Specifically:

```ts
export type AuthMode = 'demo' | 'real';
export type OtpTransportKind = 'console' | 'webhook' | 'sendgrid' | 'custom';

export interface OtpMailerRequest {
  to: string;
  otp?: string;
  magicLink?: string;
  userId: string;
  flow: 'magic-link' | 'email-verification';
}
export type OtpMailer = (req: OtpMailerRequest) => Promise<void>;

export interface AuthDatabase {
  readonly betterAuthHandle: unknown;
  initializeSchema(mode: AuthMode): void;
  close(): void;
}

export interface AuthConfig {
  mode: AuthMode;
  dbPath: string;
  bindHost: string;
  corsOrigins: string[];
  secret: string;
  allowUserSignup: boolean;
  trustedOrigins: string[];
  otpTransport: OtpTransportKind;
  otpWebhookUrl?: string;
  otpMailer?: OtpMailer;            // 'custom' impl; T-80 fills this
  databaseBackend?: AuthDatabase;  // 'custom' impl; T-81 fills this
  dbBackend: 'sqlite' | 'd1' | 'turso' | 'postgres' | 'custom';
  dbUrl?: string;
  dbAuthToken?: string;
}

export function loadAuthConfig(baseURL: string): AuthConfig;
```

### Env var contract (canonical list)

`loadAuthConfig` reads exactly these env vars (in `process.env`),
applies the defaults below, and returns the config. **No other file
in the project may read `process.env` for auth purposes.**

| Env var | Used by | Default (demo) | Default (real) | Notes |
|---|---|---|---|---|
| `MCP_AUTH_MODE` | mode | `demo` | (explicit) | The master switch |
| `MCP_AUTH_DB` | dbPath | `data/_auth.db` | `data/_auth_real.db` | Path for SQLite backend |
| `MCP_AUTH_BIND_HOST` | bindHost | `localhost` | `localhost` | Real-mode operators set `0.0.0.0` |
| `MCP_AUTH_CORS_ORIGINS` | corsOrigins | `*` | (required, fail-fast) | CSV |
| `AUTH_SECRET` / `BETTER_AUTH_SECRET` | secret | `ernCjBsavZjKxznbu_1g1g` (today's demo value — read from the existing `DEMO_PASSWORD` constant in `auth.ts:21` so there's one source of truth) | **required**, fail-fast if unset | JWT/session signing |
| `MCP_AUTH_ALLOW_USER_SIGNUP` | allowUserSignup | `true` | `true` | `1`/`0` |
| `AUTH_TRUSTED_ORIGINS` | trustedOrigins | derived from `baseURL` (single entry) | derived from `baseURL` + `AUTH_TRUSTED_ORIGINS` CSV | better-auth `trustedOrigins` |
| `MCP_AUTH_OTP_TRANSPORT` | otpTransport | `console` | `console` | `console`/`webhook`/`sendgrid`/`custom` |
| `MCP_AUTH_OTP_WEBHOOK_URL` | otpWebhookUrl | — | — | Required when `otpTransport=webhook` |
| `MCP_AUTH_OTP_MAILER_FN` | otpMailer | — | — | Reserved; not implemented in this ticket. T-80 will define how a custom mailer is loaded. |
| `MCP_AUTH_DB_BACKEND` | dbBackend | `sqlite` | `sqlite` | `sqlite`/`d1`/`turso`/`postgres`/`custom` |
| `MCP_AUTH_DB_URL` | dbUrl | — | — | Required when `dbBackend != sqlite` |
| `MCP_AUTH_DB_AUTH_TOKEN` | dbAuthToken | — | — | For D1 / Turso |

### Fail-fast rules in `loadAuthConfig`

In **real mode only**, fail at startup with a clear `throw new Error(...)`:

- `AUTH_SECRET` / `BETTER_AUTH_SECRET` missing.
- `MCP_AUTH_CORS_ORIGINS` missing or `*` (refuse the dangerous
  default in real mode).
- `MCP_AUTH_OTP_TRANSPORT=webhook` but `MCP_AUTH_OTP_WEBHOOK_URL`
  missing.
- `MCP_AUTH_DB_BACKEND != sqlite` but `MCP_AUTH_DB_URL` missing.

In **demo mode**, never fail — produce the current behavior's
equivalent config (which means ignoring most of the above and using
the hardcoded defaults).

### Wire-up in `src/server.ts`

`server.ts` currently calls `setupAuthServer({ authServerUrl,
mcpServerUrl, demoMode: false, autoConsent: false })`. After this
ticket:

```ts
const authConfig = loadAuthConfig(baseUrl);
setupAuthServer({ authServerUrl, mcpServerUrl, authConfig, autoConsent: false });
```

The `demoMode` flag is replaced by `authConfig.mode === 'demo'`
inside `authServer.ts` (T-21 makes that swap). For now, `server.ts`
passes the whole `authConfig` through; `authServer.ts` continues
to use the existing `demoMode` field by deriving it: **leave the
`SetupAuthServerOptions` shape alone in this ticket** — T-21
refactors it. This ticket only:

1. Calls `loadAuthConfig(baseUrl)`.
2. Passes the resulting config to `setupAuthServer` as a new
   optional `authConfig?: AuthConfig` field. (T-21 removes
   `demoMode` and uses `authConfig` directly.)
3. While `authConfig` is present, asserts `authConfig.mode` and
   logs a one-line startup banner: `[Auth] mode=demo` or
   `[Auth] mode=real (signup=on, backend=sqlite)`.

### Demo-mode equivalence

`MCP_AUTH_MODE` unset or `demo` → `loadAuthConfig` returns a config
whose fields match the current hardcoded values. The existing
`DEMO_PASSWORD` constant stays in `auth.ts:21` as the source of
truth for the secret; `loadAuthConfig` reads it via a re-export
(e.g. add `export const DEMO_SECRET = DEMO_PASSWORD;` to `auth.ts`
or move the constant to `authMode.ts` and have `auth.ts` import
it — pick the move, it's cleaner).

## Contract this ticket honors / establishes

- Establishes `[C-ENV]`, `[C-MODE]`, the `OtpMailerRequest` /
  `OtpMailer` shapes from `[C-MAILER]`, and the `AuthDatabase`
  shape from `[C-DB]` (interface only — implementations land in
  T-12 and T-20).
- Honors `AGENTS.md`'s "no `process.env` outside `server.ts`" by
  making `authMode.ts` the single reader, called only from
  `server.ts`.

## Do not do

- Do not write `consoleMailer` / `webhookMailer` implementations
  — that's T-20.
- Do not write `openSqliteAuthDatabase` — that's T-12.
- Do not touch `auth.ts` or `authServer.ts` logic beyond
  accepting the new `authConfig` field. T-20 and T-21 do the
  refactoring.
- Do not add new npm deps.

## Verify

- `npm run build` (tsc) passes.
- `MCP_AUTH_MODE=demo` (or unset) → `loadAuthConfig` returns an
  object whose `secret` equals the current `DEMO_PASSWORD`, whose
  `dbPath` is `data/_auth.db`, whose `bindHost` is `localhost`,
  whose `corsOrigins` is `['*']`.
- `MCP_AUTH_MODE=real` with no `AUTH_SECRET` → calling
  `loadAuthConfig` throws a clear error.
- `MCP_AUTH_MODE=real` with valid env → returns a config with
  `mode === 'real'`, the real DB path, and the supplied
  corsOrigins parsed as an array.
- Existing tests (`npm test`) pass unchanged — they run in demo
  mode by default.
