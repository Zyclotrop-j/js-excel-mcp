# T-20 — Refactor `auth.ts` into mode dispatcher + two builders

- **Difficulty:** 🟡 medium
- **Type:** Auth server
- **Dependencies:** T-00 (plugin APIs), T-02 (email-optional decision), T-10 (AuthConfig), T-12 (AuthDatabase impl)
- **Output:** Refactored `src/shared/auth.ts`; new `src/shared/mailer.ts` with `consoleMailer` + `webhookMailer`
- **Blocks:** T-21, T-30

## Goal

Split the monolithic `createDemoAuth` into a mode dispatcher that
returns either the existing demo builder (unchanged) or a new real-mode
builder that wires the `passkey`, `magicLink`, `twoFactor.backupCodes`,
and `apiKey` plugins.

## Context (read before starting)

- `src/shared/auth.ts` (current) — `createDemoAuth`, `DEMO_USER_CREDENTIALS`,
  `DemoAuth` structural type, the `as unknown as DemoAuth` cast pattern.
- `[C-MODE]`, `[C-MAILER]`, `[C-DB]` in `STUDY_FIRST.md`.
- T-00's notes — exact plugin option shapes and `auth.api.*` method names.
- T-02's notes — email-optional snippet (Strategy A or B).
- T-12's `openSqliteAuthDatabase`.

## Scope

### 1. New file `src/shared/mailer.ts`

Implements `[C-MAILER]`:

```ts
export interface OtpMailerRequest {
  to: string;
  otp?: string;
  magicLink?: string;
  userId: string;
  flow: 'magic-link' | 'email-verification';
}
export type OtpMailer = (req: OtpMailerRequest) => Promise<void>;

export async function consoleMailer(req: OtpMailerRequest): Promise<void> {
  // Logs a single line: [Mailer] flow=magic-link to=... otp=... (or magicLink=...)
  // Mark with a clear delimiter so operators can grab the OTP from logs.
}

export function webhookMailer(url: string): OtpMailer {
  return async (req) => {
    // POST JSON to `url` with req as body. Use the existing `wretch` dep
    // (already in package.json) — no new dep.
    // Throw on non-2xx so better-auth surfaces the failure.
  };
}

export function resolveMailer(cfg: AuthConfig): OtpMailer {
  if (cfg.otpMailer) return cfg.otpMailer;          // 'custom' / T-80
  if (cfg.otpTransport === 'webhook' && cfg.otpWebhookUrl)
    return webhookMailer(cfg.otpWebhookUrl);
  if (cfg.otpTransport === 'sendgrid')
    throw new Error('SendGrid mailer requires T-80; set MCP_AUTH_OTP_TRANSPORT=console or webhook for now.');
  return consoleMailer;                             // 'console' default
}
```

`wretch` is already in `package.json` — use it for the webhook POST.
No new deps.

### 2. New `createAuth(cfg, opts)` dispatcher in `src/shared/auth.ts`

```ts
export interface CreateAuthOptions {
  baseURL: string;
  resource?: string;
  loginPage?: string;
}

export function createAuth(cfg: AuthConfig, opts: CreateAuthOptions): Auth {
  if (cfg.mode === 'demo') return createDemoAuth(cfg, opts);
  return createRealAuth(cfg, opts);
}
```

`Auth` is a new exported structural type (rename of `DemoAuth` minus
the `as unknown` cast site — see §5 below). For backward compat, keep
`DemoAuth` as an alias of `Auth`.

### 3. `createDemoAuth(cfg, opts)` — behavior unchanged

The current `createDemoAuth` signature is `createDemoAuth(options:
CreateDemoAuthOptions)`. After this ticket:

- It takes `(cfg: AuthConfig, opts: CreateAuthOptions)`.
- It ignores `cfg` for everything except `cfg.secret` (which replaces
  the hardcoded `DEMO_PASSWORD` as the `secret` option to
  `betterAuth`) and `cfg.dbPath` (which replaces the hardcoded
  `'data/_auth.db'`).
- `demoMode` is no longer a parameter — `logger` is configured when
  `cfg.mode === 'demo'` AND a `MCP_AUTH_DEBUG` env is set (T-10 owns
  the env). Actually, keep the current `logger` behavior: it was
  `demoMode ? debug : undefined`. The simplest preservation is to
  set the logger when `cfg.mode === 'demo'` — that's the current
  behavior, since `server.ts:29` passes `demoMode: false`. So the
  logger ends up `undefined` either way. Verify by reading
  `server.ts:29` — it passes `demoMode: false`, so today the logger
  is already off. Preserve that: logger is `undefined` in both modes
  unless a new `MCP_AUTH_DEBUG=1` env is set (T-10 owns that env).

The body of `createDemoAuth` — the `mcp(...)` plugin config, the
`emailAndPassword.requireEmailVerification: false`, the `trustedOrigins`
— is **unchanged**. Only the inputs change (now sourced from `cfg`
instead of `options`).

### 4. New `createRealAuth(cfg, opts)` — the actual new code

This is the meat of the ticket. Wire better-auth with all four plugins:

```ts
function createRealAuth(cfg: AuthConfig, opts: CreateAuthOptions): Auth {
  const db = getDatabase(cfg);   // from [C-DB]; returns AuthDatabase
  const mailer = resolveMailer(cfg);

  const mcpPlugin = mcp({
    loginPage: opts.loginPage ?? '/sign-in',
    resource: opts.resource,
    oidcConfig: { /* same as demo, see below */ }
  });

  const passkeyPlugin = passkey({ /* per T-00 notes */ });
  const magicLinkPlugin = magicLink({
    sendMagicLink: mailer,             // or sendVerificationOTP — T-00 confirms name
    // disable the email-verification requirement when email is optional
  });
  const twoFactorPlugin = twoFactor({
    backupCodes: { enabled: true /* + any required opts per T-00 */ }
    // TOTP not required — confirm in T-00 that backupCodes can run alone.
  });
  const apiKeyPlugin = apiKey({ /* per T-00 */ });

  return betterAuth({
    baseURL: opts.baseURL,
    database: db.betterAuthHandle,
    trustedOrigins: cfg.trustedOrigins,
    secret: cfg.secret,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: cfg.mode === 'real' ? /* per T-00; default false for passkey-friendly flow */ false : false
    },
    user: { fields: { email: { /* per T-02 decision */ } } },
    plugins: [mcpPlugin, passkeyPlugin, magicLinkPlugin, twoFactorPlugin, apiKeyPlugin],
    logger: /* same env-gated logger as demo */
  }) as unknown as Auth;
}
```

OIDC config for the MCP plugin in real mode is **identical** to demo
mode (same code/access/refresh expirations, same scopes, same
`allowDynamicClientRegistration`). Real vs demo differ only in the
*better-auth* plugins, not in the OIDC/MCP plumbing.

### 5. Type shape — `Auth` vs `DemoAuth`

The current `DemoAuth` structural type (`auth.ts:269-283`) lists
`handler`, `signUpEmail`, `signInEmail`, `getMcpSession`,
`getMcpOAuthConfig`, `getMCPProtectedResource`. Real mode needs a
few more methods exposed on `auth.api.*`:

- `signOut` (used by T-50).
- `passkey.register` / `passkey.verify` / `passkey.listUserPasskeys`
  (used by T-51; confirm names from T-00).
- `magicLink.signIn` / `magicLink.verify` (used by T-42).
- `verifyBackupCode` or whatever T-00 confirms (used by T-43).
- `apiKey.create` / `apiKey.verify` / `apiKey.revoke` (used by
  T-52; confirm names from T-00).
- `createApiKey` if the API key plugin has a top-level wrapper.

Extend the `Auth` structural type to include all of these as `AnyFn`.
Demo mode's `betterAuth(...)` instance has these methods too (they're
added by the plugins), but demo doesn't load the plugins — so the
structural type for the demo instance won't actually have them. The
`as unknown as Auth` cast is fine because `authServer.ts` and the
tools only call the methods that exist for the current mode; never
call a real-only method from demo mode (the tools are gated by
`[C-EP]`).

Keep `DemoAuth` as `export type DemoAuth = Auth;` for back-compat.

### 6. `getDatabase(cfg)` — single call site

```ts
function getDatabase(cfg: AuthConfig): AuthDatabase {
  return cfg.databaseBackend ?? openSqliteAuthDatabase(cfg.dbPath, cfg.mode);
}
```

`auth.ts` no longer keeps its own singleton — `openSqliteAuthDatabase`
returns a fresh `better-sqlite3` instance every call, which is the
current behavior anyway. (The current `_db` singleton exists to avoid
re-running `initializeSchema`; T-12's `openSqliteAuthDatabase` calls
`initializeSchema` once on the fresh instance, which is what
`CREATE TABLE IF NOT EXISTS` makes safe anyway. Drop the singleton.)

### 7. `DEMO_USER_CREDENTIALS` stays

The `DEMO_USER_CREDENTIALS` export is still used by `authServer.ts`'s
demo `/sign-in` auto-login route. Keep it. The `DEMO_PASSWORD`
constant moves to `authMode.ts` (per T-10's note: "move the constant
to `authMode.ts` and have `auth.ts` import it").

## Contract this ticket honors / establishes

- Establishes `createAuth` — the dispatcher every consumer uses.
- Honors `[C-MODE]`, `[C-MAILER]`, `[C-DB]`.
- Establishes the extended `Auth` structural type used by T-30,
  T-41, T-42, T-43, T-50, T-51, T-52.

## Do not do

- Do not touch `authServer.ts` — T-21 does the route-level branch.
- Do not implement any auth tool — those are T-41+.
- Do not change demo behavior. The diff for the demo path is:
  - Inputs now come from `cfg` instead of `options`.
  - The hardcoded `_db` singleton is removed (no behavior change —
    schema is still initialized once per instance).
  - `DEMO_PASSWORD` is imported from `authMode.ts` instead of
    declared in `auth.ts`.
- Do not add new npm deps.

## Verify

- `npm run build` passes.
- `npm test` passes (demo mode default).
- `MCP_AUTH_MODE=real` with valid env → server starts, logs
  `[Auth] mode=real`, and the OIDC discovery endpoint
  (`http://localhost:3001/.well-known/oauth-authorization-server`)
  returns the expected JSON. The Excel tools still 401 when
  unauthenticated (T-40 will surface the bootstrap endpoint).
- `MCP_AUTH_MODE=demo` (or unset) → server starts and behaves
  identically to today. The demo `/sign-in` auto-login still works
  (T-21 preserves it).
