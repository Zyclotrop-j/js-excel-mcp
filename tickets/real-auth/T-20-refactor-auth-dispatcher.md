# T-20 — Refactor `auth.ts` into mode dispatcher + two builders

- **Difficulty:** 🟡 medium
- **Type:** Auth server
- **Dependencies:** T-00 (plugin APIs), T-02 (email-optional decision), T-10 (AuthConfig), T-12 (AuthDatabase impl)
- **Output:** Refactored `src/shared/auth.ts`; new `src/shared/mailer.ts` with `consoleMailer` + `webhookMailer`
- **Blocks:** T-21, T-30

> **Architect's note (2026-07-19):** Read
> `tickets/real-auth/notes/arch-decision-passkey-and-related.md`
> before coding. The passkey and apiKey plugins ship as **separate
> scoped packages**, not in the main `better-auth` bundle. The import
> paths in the code examples below (`import { passkey } from 'better-auth/plugins'`
> and `import { apiKey } from 'better-auth/plugins'`) are **wrong**.
> Use:
> ```ts
> import { passkey } from '@better-auth/passkey';
> import { apiKey } from '@better-auth/api-key';
> ```
> The PL installs both packages (`@better-auth/passkey@^1.6.23`,
> `@better-auth/api-key@^1.6.23`) before this ticket is dispatched.
> Verify plugin options and the exact `passkey({...})` / `apiKey({...})`
> option shapes against the installed
> `node_modules/@better-auth/passkey/dist/index.d.mts` and
> `node_modules/@better-auth/api-key/dist/index.d.mts` — the docs
> site is a secondary check only. The passkey plugin supports
> `registration.requireSession: false` + `registration.resolveUser`
> for passkey-first signup (no throwaway password needed) — consider
> this for the real-mode builder.

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
- It uses `cfg.dbPath` (replaces the hardcoded `'data/_auth.db'`).
- **It MUST NOT pass `cfg.secret` to `betterAuth({...})`.** The current
  demo `betterAuth({...})` call has no `secret` field at all —
  better-auth auto-generates one per server start. Passing
  `secret: cfg.secret` (= `DEMO_SECRET`) would change demo behavior
  (the secret would become a fixed known value and sessions would
  persist across restarts), violating §8.1's byte-for-byte invariant.
  `cfg.secret` is **real-mode-only**. `DEMO_SECRET` continues to be
  used as the demo user's *password* (via `DEMO_USER_CREDENTIALS` in
  `authServer.ts`'s `/sign-in` auto-login), NOT as the betterAuth
  `secret` option. The ticket body's earlier wording ("replaces the
  hardcoded `DEMO_PASSWORD` as the `secret` option to `betterAuth`")
  was factually wrong — `DEMO_PASSWORD` was never the betterAuth
  secret; it was the demo user's login password.
- `demoMode` is no longer a parameter. The current `logger` is
  `demoMode ? debug : undefined`, and `src/server.ts:42` passes
  `demoMode: false`, so today the logger is **`undefined`** even in
  demo mode. **Preserve that: set `logger: undefined` in both modes
  for this ticket.** Do NOT switch to `logger: cfg.mode === 'demo' ?
  debug : undefined` — that would activate debug logging in demo
  mode and break §8.1. If a `MCP_AUTH_DEBUG=1` debug-logging env is
  desired, it is a T-21 concern (or a follow-up); it is NOT in scope
  for T-20. T-10 did NOT add `MCP_AUTH_DEBUG`.

The body of `createDemoAuth` — the `mcp(...)` plugin config, the
`emailAndPassword.requireEmailVerification: false`, the `trustedOrigins`
— is **unchanged**. Only the inputs change (now sourced from `cfg`
instead of `options`).

### 4. New `createRealAuth(cfg, opts)` — the actual new code

This is the meat of the ticket. Wire better-auth with all four plugins.
**Read `tickets/real-auth/notes/T-02-notes.md` §1.3 and §3.3 and
`tickets/real-auth/notes/T-00-notes.md` §4 (D-00-4) before coding** —
they contain the paste-ready plugin option shapes. The placeholder
comments below point at the specific note sections.

```ts
function createRealAuth(cfg: AuthConfig, opts: CreateAuthOptions): Auth {
  const db = getDatabase(cfg);   // from [C-DB]; returns AuthDatabase
  const mailer = resolveMailer(cfg);

  const mcpPlugin = mcp({
    loginPage: opts.loginPage ?? '/sign-in',
    resource: opts.resource,
    oidcInfo: { /* same as demo, see below */ }
  });

  // Passkey plugin — paste options from T-02 §3.3 (worked spike) or §3.2.
  // Requires: rpID, rpName, origin, registration.requireSession:false,
  // registration.resolveUser. The plugin ships in @better-auth/passkey.
  const passkeyPlugin = passkey({ /* per T-02 §3.3 */ });

  // Magic-link plugin — paste options from T-00 §4 D-00-4.
  // sendMagicLink is the mailer hook (T-00 §2 confirms the callback name).
  const magicLinkPlugin = magicLink({
    sendMagicLink: mailer,
    disableSignUp: false,
    storeToken: 'hashed',
    expiresIn: 300,
    rateLimit: { window: 60, max: 5 },
  });

  // twoFactor plugin (backup codes only) — paste from T-00 §4 D-00-4.
  // Omit totpOptions/otpOptions; backupCodeOptions + allowPasswordless
  // both at top level and in backupCodeOptions.
  const twoFactorPlugin = twoFactor({
    backupCodeOptions: {
      amount: 10,
      length: 10,
      storeBackupCodes: 'encrypted',
      allowPasswordless: true,
    },
    allowPasswordless: true,
  });

  // API-key plugin — no required options (per arch-decision §1.5:
  // "Plugin: `apiKey()` (no required options)"). The `mcp_` prefix is
  // supported natively by createApiKey at issuance time (T-52).
  const apiKeyPlugin = apiKey();

  // Email-optional plugin — paste VERBATIM from T-02 §1.3.
  // DO NOT use `user: { fields: { email: { ... } } }` at the top level
  // of betterAuth({...}) — T-02 §1.2 confirms that option only renames
  // columns and silently does nothing for attribute overrides. The
  // emailOptionalPlugin is the supported override path (its
  // `schema.user.fields.email` spreads AFTER the core email field in
  // `@better-auth/core`'s get-tables.mjs, replacing `required: true`
  // with `required: false`).
  const emailOptionalPluginInstance = emailOptionalPlugin;

  return betterAuth({
    baseURL: opts.baseURL,
    database: db.betterAuthHandle,
    trustedOrigins: cfg.trustedOrigins,
    secret: cfg.secret,                                  // real-mode only (real's cfg.secret is AUTH_SECRET)
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,                    // passkey-friendly; matches demo
    },
    plugins: [
      mcpPlugin,
      passkeyPlugin,
      magicLinkPlugin,
      twoFactorPlugin,
      apiKeyPlugin,
      emailOptionalPluginInstance,                       // ← must appear in the plugins array; order does not matter
    ],
    logger: undefined,                                   // see §3 — do NOT activate in real mode for this ticket
  }) as unknown as Auth;
}
```

OIDC config for the MCP plugin in real mode is **identical** to demo
mode (same code/access/refresh expirations, same scopes, same
`allowDynamicClientRegistration`). Real vs demo differ only in the
*better-auth* plugins, not in the OIDC/MCP plumbing.

### 5. Type shape — `Auth` vs `DemoAuth`

The current `DemoAuth` structural type (`auth.ts:151-165`) lists
`handler`, `signUpEmail`, `signInEmail`, `getMcpSession`,
`getMcpOAuthConfig`, `getMCPProtectedResource`. Real mode needs a
few more methods exposed on `auth.api.*`. **Use the corrected API
names from `arch-decision-passkey-and-related.md` §1.5 + §3 and
`T-02-notes.md` §3.1 + §5.2 — NOT the names that appeared in earlier
drafts of this ticket body** (`passkey.register`, `passkey.verify`,
`apiKey.create`, `apiKey.revoke` — those names do not exist in
`@better-auth/passkey@1.6.23` or `@better-auth/api-key@1.6.23`).

Real-mode `Auth` structural type additions (all `AnyFn`):

- `signOut` (used by T-50).
- **Passkey** (verified against
  `node_modules/@better-auth/passkey/dist/index-Cyjp_etN.d.mts:256-842`):
  - `generatePasskeyRegistrationOptions`
  - `verifyPasskeyRegistration` (returns the `Passkey` row; no session)
  - `generatePasskeyAuthenticationOptions`
  - `verifyPasskeyAuthentication` (returns `{ session, user }`)
  - `listPasskeys`
  - `deletePasskey`
  - `updatePasskey`
- **Magic-link** (per T-00 §2):
  - `signInMagicLink`
  - `magicLinkVerify`
- **Backup codes / twoFactor** (per T-00 §3):
  - `enableTwoFactor`
  - `disableTwoFactor`
  - `verifyBackupCode` (used by T-43)
  - `generateBackupCodes`
  - `viewBackupCodes` (server-only; useful for admin/recovery)
- **API key** (verified against
  `node_modules/@better-auth/api-key/dist/index-CI6mGUwK.d.mts`):
  - `createApiKey` (returns the `ApiKey` object including the plaintext
    `key` — shown once)
  - `verifyApiKey` (returns `{ valid, error, key }`; `key.referenceId`
    is the user id, NOT `userId` — see arch-decision §3 Correction 2)
  - `getApiKey`
  - `updateApiKey`
  - `deleteApiKey`
  - `listApiKeys`
  - `deleteAllExpiredApiKeys`

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
demo `/sign-in` auto-login route. Keep it. Its `password` field
already references `DEMO_SECRET`, which T-10 moved to `authMode.ts`
(`auth.ts` imports it from there — single source of truth). No
constant moves are needed in T-20; T-10 already did the move.

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
  - `DEMO_SECRET` continues to be imported from `authMode.ts` (already
    moved by T-10; no constant moves needed in T-20).
  - **Do NOT add `secret: cfg.secret` to the demo `betterAuth({...})`
    call** — that would change demo behavior (see §3 above).
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
