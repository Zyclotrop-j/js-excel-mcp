# STUDY_FIRST — Real Auth Mode

> **Read this entire file before implementing any ticket in
> `tickets/real-auth/`.** Tickets reference contracts by ID
> (e.g. `[C-DB]`, `[C-PA]`) defined here. Implementers who skip this
> document will produce code that doesn't fit the rest of the system.

## 1. Project context (one paragraph)

`js-excel-mcp` is a TypeScript MCP server that lets an LLM manipulate
`.xlsx` files. It runs as a single Node process exposing **two Express
apps**:

- the **MCP server** on port 3000 (`src/server.ts`), serving MCP tools at
  `/mcp`, and
- the **OAuth Authorization Server** on port 3001
  (`src/shared/authServer.ts`), serving better-auth's REST API under
  `/api/auth/*` and the MCP plugin's OIDC endpoints.

Both apps live in the same process and share the same module graph —
this matters because **a module-level singleton in one is visible to the
other** (used by the pending-login handoff, see `[C-PL]`).

The MCP port is protected by `requireBearerAuth` from
`@modelcontextprotocol/express`; the AS port is the one that mints those
bearer tokens via the standard OAuth authorization-code flow. The client
SDK's auth driver discovers the AS via RFC 9728 Protected Resource
Metadata served from the MCP port.

## 2. Current auth architecture (demo mode)

Files you must read before any change:

- `src/shared/auth.ts` — builds the `betterAuth({...})` instance.
  Exports `createDemoAuth`, `DEMO_USER_CREDENTIALS`, and the structural
  type `DemoAuth`. Hardcoded demo password. File-backed SQLite at
  `data/_auth.db`. Schema is hand-written `CREATE TABLE IF NOT EXISTS`.
- `src/shared/authServer.ts` — Express app for the AS. Mounts
  `toNodeHandler(auth)` at `/api/auth/{*splat}` (so **better-auth's full
  REST API is already reachable** — `/sign-up/email`, `/sign-in/email`,
  `/sign-out`, `/get-session`, etc. — we just don't expose most of it to
  humans). Has a custom `/sign-in` route that auto-logs in the demo user
  and 302s back to `/api/auth/mcp/authorize`. `autoConsent` middleware
  strips `prompt=consent` for the headless demo client.
- `src/server.ts` — calls `setupAuthServer({ ..., demoMode: false,
  autoConsent: false })`. Applies `requireBearerAuth({ verifier:
  demoTokenVerifier, ... })` to `/mcp`. The token verifier delegates to
  `auth.api.getMcpSession({ headers })`.

Key behavioral facts:

- The custom `/sign-in` route is **demo-only**. Real mode replaces it
  (see `[C-SI]`).
- `demoTokenVerifier` is mode-agnostic — it just calls
  `getMcpSession`, which is the OIDC MCP plugin's session lookup. The
  same verifier works in real mode. Ticket T-30 only renames it.
- `requireBearerAuth` 401s any MCP request without a valid bearer. This
  is what makes the Excel tools "disappear" when unauthenticated. The
  auth tools must therefore live on an endpoint that **bypasses**
  `requireBearerAuth` (see `[C-EP]`).

## 3. Dependencies & versions (already in `package.json`)

> **Architect's note (2026-07-19):** §3 originally claimed better-auth
> "ships `passkey` ... `apiKey` ... out of the box." That was factually
> wrong — those two plugins ship as separate `@better-auth/*` scoped
> packages, not in the main `better-auth` bundle. The correction is
> wording only; the plan's *intent* (use passkey, magicLink,
> twoFactor.backupCodes, apiKey) is unchanged. See
> `tickets/real-auth/notes/arch-decision-passkey-and-related.md` for
> the full decision and the API-name corrections T-20/T-30/T-51/T-52
> implementers must apply.

- `better-auth@^1.6.23` — the auth framework. The main bundle ships
  `magicLink`, `twoFactor`, `admin`, `phoneNumber` (and other) plugins
  in-box under `better-auth/plugins`. We use `magicLink` and
  `twoFactor`; not `phoneNumber`.
- `@better-auth/passkey@^1.6.23` — the passkey plugin, shipped as a
  separate first-party scoped package (same maintainers, same GitHub
  monorepo, SLSA-provenance-attested, `peerDependencies:
  better-auth@^1.6.23`). Import: `import { passkey } from '@better-auth/passkey'`.
  Brings `@simplewebauthn/server` + `@simplewebauthn/browser` as
  transitive runtime deps. Demo mode never imports it.
- `@better-auth/api-key@^1.6.23` — the API-key plugin, same provenance.
  Import: `import { apiKey } from '@better-auth/api-key'`. Runtime dep:
  `zod` only (already present). Demo mode never imports it.
- `better-sqlite3@^12.10.0` — file-backed SQLite, shared with the VFS.
- `@modelcontextprotocol/server@2.0.0-beta.3` — MCP SDK server side.
  Exposes `inputRequired`, `inputRequired.elicit`, `acceptedContent`,
  `inputResponse`, `InputRequiredResult`, `isInputRequiredResult`.
- `@modelcontextprotocol/express@2.0.0-beta.2` — gives us
  `requireBearerAuth`, `createMcpExpressApp`,
  `getOAuthProtectedResourceMetadataUrl`, and the `OAuthTokenVerifier`
  interface.
- `express@^5.2.1`, `cors@^2.8.6`, `zod@^4.4.3` (used for tool input
  schemas and elicitation schemas).

## 4. Elicitation — what the SDK actually gives us

> **Architect's note (2026-07-20):** Elicitation is **NOT USED** by this
> plan. The installed `@modelcontextprotocol/server@2.0.0-beta.3` ships
> `LATEST_PROTOCOL_VERSION = "2025-11-25"` (the legacy era), and both
> `/mcp` and `/mcp/bootstrap` use per-request `McpServer` factories that
> never see the `initialize` handshake — so `_clientCapabilities` is never
> populated and the `inputRequired.elicit()` capability gate fails with
> "no client capabilities are available on this connection — per-request
> legacy serving cannot receive server-to-client requests." There is no
> legacy-era `requestElicitation` callback (unlike sampling's
> `requestSampling`). See
> `tickets/real-auth/notes/arch-decision-elicitation-blocker.md` for the
> full decision. Auth tools take inputs as `inputSchema` tool arguments
> instead (the LLM collects them in conversation). §4's reference content
> below is preserved as accurate SDK documentation but is **no longer
> load-bearing** for any ticket.

Confirmed against
`node_modules/@modelcontextprotocol/server/dist/index.d.cts` (server
2.0.0-beta.3):

- `inputRequired({ inputRequests: { [key]: inputRequired.elicit({
    message, requestedSchema }) } })` returns an `InputRequiredResult`
  that the tool callback can return to pause the call and ask the client
  for structured input.
- `requestedSchema` is a JSON Schema (or any Standard Schema — zod
  works; the SDK serializes it).
- On retry, the client re-invokes the tool with the filled values
  available at `ctx.mcpReq.inputResponses[key]`.
- `acceptedContent(responses, key, schema?)` extracts the accepted
  content; returns `undefined` when the user declined/cancelled or the
  response is missing.
- `inputResponse(responses, key)` returns a discriminated view
  (`{ kind: 'elicit', action: 'accept'|'decline'|'cancel', content? }`,
  `{ kind: 'sampling' }`, `{ kind: 'roots' }`, `{ kind: 'missing' }`).
- The project already uses this pattern in
  `src/tools/handleCells/discovery.ts:372-393` — read that file before
  implementing any elicitation ticket.
- `McpRequestContext` carries `inputResponses`; in our `ToolHandler`
  base class (`src/tools/interface.ts:11-13`), the per-call context is
  `this.context: McpRequestContext`. So inside a tool callback,
  `this.context.inputResponses` (or `ctx.inputResponses` from the
  callback's second arg) is the retried-request payload.

T-01 exists to confirm the *client* the project tests with supports
elicitation. Server-side we are sure.

## 5. The two-process-same-process trick

Both Express apps share one Node process, one module graph. A
module-level `Map` declared in `src/shared/pendingLogin.ts` (see T-11)
is visible from both the auth tool callback (running inside the MCP
request handler on port 3000) and the auth server's `/sign-in` route
(running on port 3001). This is the bridge that lets the
`auth_signup` tool "hand off" a just-created session to the OAuth flow
the client SDK is about to drive.

## 6. The token-handoff problem (the one design risk)

`auth_signup` creates a real better-auth session server-side, but the
MCP client SDK still has no **Bearer token** — the OAuth code flow
happens at the HTTP transport layer, *not* the tool layer. The chosen
solution is the **pending-login nonce** mechanism (see `[C-PL]`):

1. `auth_signup` calls better-auth's `signUpEmail` then `signInEmail`
   server-side to create a real session.
2. It stores `{ nonce, userId, expiresAt }` in the in-process
   pending-login store and returns the `nonce` to the LLM as the
   tool's structured result.
3. The LLM retries the original Excel tool call → 401 → the client
   SDK starts the OAuth dance → hits the auth server's `/sign-in`.
4. Real-mode `/sign-in` checks the pending-login store. If a pending
   nonce matches a just-set session cookie (or the request carries the
   nonce as a query param — TBD in T-22), it auto-logs in that user
   and redirects to `/api/auth/mcp/authorize`.
5. The OAuth code flow completes with real 302s the client follows
   with `redirect: 'manual'` exactly as the demo client already does.

The LLM does not need to do anything special — it just retries the MCP
request. The client SDK's existing OAuth dance picks up the
server-side session and finishes the flow.

The exact `/sign-in` ↔ nonce handoff is the subject of ticket T-22.
Two candidate mechanisms are documented there; the spike in T-01
will confirm which is cleaner.

## 7. Contracts (the parts that must fit together)

Every ticket that produces an interface MUST honor these. They are
referenced as `[C-XX]` in the tickets.

### `[C-ENV]` — Environment variables

All env vars are read in `src/server.ts` and forwarded via
`SetupAuthServerOptions`. Implementers MUST NOT read `process.env`
outside `server.ts` (matches the existing pattern). The canonical list
is in T-10. Defaults are chosen so that `MCP_AUTH_MODE=demo` (or unset)
reproduces today's behavior exactly.

### `[C-MODE]` — `AuthMode` type

> **Architect's note (2026-07-19, post-T-10 review):** T-10's
> "specifically" block expanded this contract with `'sendgrid'` in
> `OtpTransportKind` and `dbBackend`/`dbUrl`/`dbAuthToken` fields in
> `AuthConfig` (forward-looking slots for T-80/T-81). The amendment
> below brings the contract in line with the shipped implementation.
> No intent change — only added type surface.

```ts
// src/shared/authMode.ts  (new file, created in T-10)
export type AuthMode = 'demo' | 'real';
export type OtpTransportKind = 'console' | 'webhook' | 'sendgrid' | 'custom';

export interface AuthConfig {
  mode: AuthMode;
  dbPath: string;                       // 'data/_auth.db' (demo) | 'data/_auth_real.db' (real)
  bindHost: string;                     // 'localhost' (demo) | e.g. '0.0.0.0' (real)
  corsOrigins: string[];                // ['*'] (demo) | explicit list (real)
  secret: string;                       // hardcoded (demo) | required (real)
  allowUserSignup: boolean;             // true (demo) | env MCP_AUTH_ALLOW_USER_SIGNUP (real, default true)
  trustedOrigins: string[];             // derived from baseURL
  otpTransport: OtpTransportKind;       // 'console' default
  otpWebhookUrl?: string;               // when otpTransport = 'webhook'
  // Custom mailer override. When set, bypasses `otpTransport` entirely
  // and uses this function. T-80 populates this with a real SendGrid/
  // Postmark call. Default in T-20: undefined (use the kind-based impl).
  otpMailer?: OtpMailer;                 // see [C-MAILER]
  // Custom DB backend override. When set, bypasses the default
  // better-sqlite3 instance and uses this instead. T-81 populates
  // this with a Cloudflare D1 / Turso / Postgres-backed Kysely
  // dialect. Default in T-12/T-20: undefined (open better-sqlite3
  // at `dbPath`).
  databaseBackend?: AuthDatabase;       // see [C-DB]
  // DB backend selector (T-81). 'sqlite' default; 'd1'/'turso'/'postgres'/'custom'
  // require `dbUrl`. 'custom' uses `databaseBackend` directly.
  dbBackend: 'sqlite' | 'd1' | 'turso' | 'postgres' | 'custom';
  dbUrl?: string;                       // required when dbBackend !== 'sqlite'
  dbAuthToken?: string;                  // for D1 / Turso
}
export function loadAuthConfig(baseURL: string): AuthConfig;
```

### `[C-MAILER]` — OTP / magic-link delivery (pluggable)

The mailer is a **function slot**, not a string option. The default
implementation lives in `src/shared/mailer.ts` and is chosen by
`otpTransport`:

```ts
// src/shared/mailer.ts  (new file, created in T-20)
export interface OtpMailerRequest {
  to: string;            // recipient email
  otp?: string;          // one-time code, when magic link uses OTP
  magicLink?: string;    // full magic-link URL, when the flow uses links
  userId: string;
  flow: 'magic-link' | 'email-verification';
}
export type OtpMailer = (req: OtpMailerRequest) => Promise<void>;

export function consoleMailer(req: OtpMailerRequest): Promise<void>;   // logs to stdout (default)
export function webhookMailer(url: string): OtpMailer;                  // POSTs JSON to a webhook
export function resolveMailer(cfg: AuthConfig): OtpMailer;             // picks based on cfg
```

- The real-mode better-auth `magicLink` plugin is configured with
  `sendMagicLink: resolveMailer(cfg)` (and `sendVerificationOTP: ...`
  if the installed version splits them — T-00 confirms the exact
  callback names).
- Today's plan ships `consoleMailer` and `webhookMailer`. The
  `otpMailer?: OtpMailer` slot in `AuthConfig` is the integration
  point for T-80 (SendGrid etc.) — a follow-up that adds an impl
  and wires it via env, with **no changes** to tools, schema, or
  auth-server.
- Demo mode does not use magic links, so the mailer is unused there.

### `[C-DB]` — Database (pluggable)

> **Architect's note (2026-07-19, post-T-12 review):** T-10 created
> `src/shared/authDatabase.ts` as a single file (interface only). T-12
> needed to add the SQLite impl alongside the interface, so it converted
> the file to a **directory**: `src/shared/authDatabase/` with
> `index.ts` (re-exports the `AuthDatabase` interface) +
> `sqliteAuthDatabase.ts` (the `openSqliteAuthDatabase` factory + the
> two schema initializers). The contract *intent* (interface surface +
> factory name) is unchanged — only the on-disk layout moved from a
> file to a colocation directory. This is the standard TS pattern for
> co-locating an interface with its default impl and is acceptable.
> Importers use `./authDatabase/index.js` (or `./authDatabase.js`,
> which Node resolves to either form).

The DB is accessed through a thin abstraction so the backend can be
swapped without touching tools or auth-server:

```ts
// src/shared/authDatabase/index.ts  (interface; T-10 created the file,
// T-12 converted it to a directory and added ./sqliteAuthDatabase.ts)
export interface AuthDatabase {
  // The object passed to better-auth's `database` option. Today this is
  // a better-sqlite3 Database instance; tomorrow it could be a Kysely
  // instance configured with a D1 / Postgres dialect.
  readonly betterAuthHandle: unknown;
  // Run DDL for the given mode. Idempotent (CREATE TABLE IF NOT EXISTS).
  initializeSchema(mode: AuthMode): void;
  // Close the underlying connection (for graceful shutdown).
  close(): void;
}

export function openSqliteAuthDatabase(dbPath: string, mode: AuthMode): AuthDatabase;
// Future (T-81): export function openKyselyAuthDatabase(dialect, mode): AuthDatabase;
```

- `getDatabase(cfg)` (defined in `auth.ts`, refactored in T-20)
  returns `cfg.databaseBackend ?? openSqliteAuthDatabase(cfg.dbPath,
  cfg.mode)`. This is the **single** call site that knows about the
  default; everything else takes an `AuthDatabase`.
- T-12 ships `openSqliteAuthDatabase` with the hand-written DDL for
  real mode (and the existing demo DDL for demo mode).
- T-81 will add `openKyselyAuthDatabase(dialect, mode)` and an env
  switch (`MCP_AUTH_DB_BACKEND=sqlite|d1|postgres|turso`); the
  better-auth `database` option already accepts Kysely instances, so
  the swap is mechanical once the dialect is constructed.
- The `initializeSchema` method is the only place SQL strings live
  outside tests. A Kysely-based backend can use Kysely's schema
  builder instead of raw DDL; the interface stays the same.
- Per `AGENTS.md`: when the real schema changes, delete
  `data/_auth_real.db` before restarting. Document this in T-71.

### `[C-PA]` — Public (unauthenticated) auth tools

Three tools live on `/mcp/bootstrap` (the unauthenticated endpoint
— see `[C-EP]`):

- `auth_signup` — T-41
- `auth_signin` — T-42
- `auth_recover` — T-43

These tools:

- Are registered through the **same** `ToolHandler` base class as the
  Excel tools (see `src/tools/interface.ts`).
- Take all user inputs (`name`, `email`, `credentialType`, `password`,
  `identifier`, `backupCode`, etc.) as **tool arguments** in their
  `inputSchema` (zod). The LLM collects these from its conversation with
  the user, then calls the tool in a single `tools/call`. No elicitation
  round-trip. (Originally planned to use `inputRequired.elicit()`; that
  was blocked by the SDK's per-request legacy serving — see
  `tickets/real-auth/notes/arch-decision-elicitation-blocker.md`.)
- Call better-auth's `auth.api.*` methods server-side (the `auth`
  instance is obtained via `getAuth()` from `authServer.ts`).
- Return `CallToolResult` with structured content including a
  `loginNonce` when a session was established (signup / signin /
  recover).
- Are **not** included in `chain_operations` — these tools establish or
  mutate auth state with side-effects (session creation, cookie
  handoff) that must not be batched mid-chain. The `chain_operations`
  handler's `InputRequiredResult` rejection no longer applies (these
  tools no longer return `InputRequiredResult`), so the exclusion is by
  convention stated in each tool's `description`, not by the SDK type
  guard.

### `[C-AT]` — Authenticated tools (post-login)

These live on `/mcp` (the bearer-protected endpoint):

- `auth_signout` — T-50
- `auth_add_passkey` — T-51
- `auth_rotate_apikey` — T-52

They take user input as **tool arguments** in `inputSchema` where they
need it (passkey registration — T-51 uses a two-call flow:
generate-options → verify-attestation, or a single call with the
attestation pre-collected by the LLM) and a plain `CallToolResult`
otherwise (signout, rotate-apikey). No elicitation — see
`tickets/real-auth/notes/arch-decision-elicitation-blocker.md`. They
appear *alongside* the Excel tools once a valid bearer is present.

### `[C-EP]` — Endpoints

```
POST /mcp              — requireBearerAuth — Excel tools + [C-AT] tools
POST /mcp/bootstrap   — NO auth           — [C-PA] tools only
GET  /.well-known/oauth-protected-resource/mcp  — existing PRM route
GET  /.well-known/oauth-authorization-server      — existing AS metadata
```

The `/mcp/bootstrap` endpoint uses its own `McpServer` instance and its
own `createMcpHandler` — it does not share the Excel-tool `McpServer`.
It is registered with `requireBearerAuth` replaced by a no-op
middleware that injects a synthetic `AuthInfo` (or sets a "no auth"
flag the handler reads — T-40 decides the cleanest wiring).

The PRM document at `/.well-known/oauth-protected-resource/mcp`
continues to point clients at `/mcp` for the protected surface. Clients
discovering `/mcp/bootstrap` do so via the 401 challenge's interaction
with the auth tools — T-40 + T-44 document the discovery contract.

### `[C-PL]` — Pending-login store

> **Architect's note (2026-07-19, post-T-11 review):** T-11's
> "specifically" block expanded this contract with `cookieHeaders`
> on `PendingLogin` and the `peekMostRecentPendingLogin` / `sweep`
> functions. The amendment below brings the contract in line with
> the shipped implementation. The mutation-on-returned-reference
> pattern (T-11 returns the same object stored in the `Map`, so the
> auth tool sets `sessionId` / `cookieHeaders` by direct mutation) is
> confirmed acceptable — no `setSessionId` setter is added. See the
> T-11 review note and `arch-decision-passkey-and-related.md`
> Correction 3 for the `[C-PL]` impact analysis.

```ts
// src/shared/pendingLogin.ts  (new file, created in T-11)
export interface PendingLogin {
  nonce: string;          // opaque, uuid v4
  userId: string;        // better-auth user id
  expiresAt: number;     // epoch ms, NOW + 5 min
  sessionId?: string;    // better-auth session id (set after signInEmail)
  cookieHeaders?: string[]; // Set-Cookie headers from signInEmail (asResponse: true)
}
export function createPendingLogin(userId: string): PendingLogin;
export function consumePendingLogin(nonce: string): PendingLogin | null;
export function peekPendingLogin(nonce: string): PendingLogin | null;  // for /sign-in polling
export function peekMostRecentPendingLogin(): PendingLogin | null;      // /sign-in fallback: most recent entry with sessionId set
export function sweep(): number;                                       // removes expired entries; returns count removed
```

- In-process `Map<string, PendingLogin>` with TTL sweep on each call.
- `consumePendingLogin` is destructive (one-shot).
- `createPendingLogin` returns the **same object reference** stored in
  the `Map`; the auth tool mutates `sessionId` / `cookieHeaders` on
  it after `signInEmail` succeeds. `/sign-in` (T-22) then reads those
  fields via `consume` or `peek`. No `setSessionId` setter — the
  mutation pattern is the mechanism.
- No persistence — a server restart drops pending logins; the LLM
  just retries the signup tool.

### `[C-SI]` — Real-mode `/sign-in`

Real-mode `/sign-in` (replaces the demo auto-login):

1. Reads `login_nonce` from the query string OR polls the pending-login
   store for the most recent unexpired entry whose `sessionId` is set.
   (T-22 decides which.)
2. Calls better-auth's `signInEmail` server-side if needed (the
   signup tool may have already created the session — `sessionId` will
   be set, and we only need to set the cookie from the existing
   session).
3. Sets the session cookie on the response.
4. 302s to `/api/auth/mcp/authorize` with the original OAuth params.

Demo-mode `/sign-in` is unchanged.

### `[C-VF]` — Token verifier

```ts
export const tokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token): Promise<AuthInfo> {
    const auth = getAuth();
    const session = await (auth.api as any).getMcpSession({ headers: ... });
    if (!session) throw new OAuthError(...);
    return { token, clientId, scopes, expiresAt, extra: { userId } };
  }
};
export const demoTokenVerifier = tokenVerifier;  // back-compat alias
```

Mode-agnostic — `getMcpSession` works identically in both modes. T-30
renames and aliases; no logic change.

### `[C-REG]` — Tool registration contract

The auth tools (`src/tools/auth/*.ts`) each `export class
XxxHandler extends ToolHandler` (just like the Excel handlers) and
implement `register(allTools)`. They are exported from
`src/tools/auth/index.ts` and re-exported from `src/tools/index.ts`.
`server.ts` picks them up by iterating `Object.values(tools)` as it
already does (`src/server.ts:56-73`), with the gating logic from
`[C-EP]` deciding which set to mount on which endpoint.

The `ToolHandler` base class wires the `postCallHook` for VFS flushing
— the auth tools don't touch the VFS so the hook is a no-op for them
but still harmless.

### `[C-ELICIT]` — Input-collection pattern inside an auth tool

> **Architect's note (2026-07-20):** This contract was originally named
> for the `inputRequired.elicit()` SDK primitive. Elicitation is **not
> used** (see `tickets/real-auth/notes/arch-decision-elicitation-blocker.md`).
> The contract ID `[C-ELICIT]` is retained for traceability, but the
> pattern is now **tool arguments**, not an elicitation round-trip.

```ts
// The zod schema is the tool's `inputSchema` — the LLM fills the values
// from its conversation with the user, and the SDK validates before the
// callback runs. `arg` IS the validated, typed input.
const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  credentialType: z.enum(['password', 'passkey', 'magiclink']),
  password: z.string().min(12).optional(),
}).describe('Sign up for an MCP account. Email is optional for passkey-only accounts.');

// In the tool callback — `arg` is already the validated SignupInput.
async (arg: z.infer<typeof signupSchema>, ctx) => {
  // Cross-field validation the schema can't express:
  if (arg.credentialType === 'password' && !arg.password) { ... }
  if ((arg.credentialType === 'magiclink' || arg.credentialType === 'password') && !arg.email) { ... }
  // ... proceed to auth.api.* server-side ...
}
```

- No `inputRequired` / `acceptedContent` / `inputResponse` — those are
  the elicitation primitives and are not used.
- The `description` on the tool (and on each schema field via
  `.describe()`) tells the LLM what to collect and when each field is
  required. The LLM is expected to gather all required fields before the
  single `tools/call`.
- Cross-field validation (e.g. "password required when
  credentialType=password") is done in the callback body — zod can't
  express conditionally-required fields cleanly.
- The tool returns a plain `CallToolResult` (never `InputRequiredResult`).
- No retry round — the call is single-shot.

### `[C-RECOVER]` — Backup-code recovery contract

- Backup codes are generated by better-auth's `twoFactor.backupCodes`
  plugin during signup (T-41 surfaces them in the tool result).
- `auth_recover` collects `{ identifier, backupCode }` as tool arguments
  (per `[C-ELICIT]` — no elicitation; see the elicitation-blocker
  decision).
- It calls the better-auth backup-code verification endpoint
  server-side (T-00 confirms the exact API name — likely
  `auth.api.verifyBackupCode` or a custom handler).
- On success, a session is established and a `loginNonce` is returned
  exactly like `auth_signin` — the LLM retries its Excel request and
  the OAuth flow completes via `[C-SI]`.
- `auth_rotate_apikey` (T-52) is the follow-up tool used after
  recovery to invalidate any compromised API keys.

### `[C-APIKEY]` — Long-lived API key contract

- Issued by `auth_rotate_apikey` (T-52) via the `@better-auth/api-key`
  plugin (separate scoped package; see §3).
- The LLM stores the returned key and uses it on subsequent runs as
  `Authorization: Bearer mcp_...` against `/mcp`.
- T-00 confirmed the MCP plugin's token endpoint does NOT accept API
  keys (only OAuth grants). Therefore `tokenVerifier` (T-30) MUST be
  extended with an API-key fallthrough that calls
  `auth.api.verifyApiKey({ body: { key } })` directly — this is
  T-30 "Outcome B." Verify exact API names and response shape
  (`{ valid, error, key }`) against
  `node_modules/@better-auth/api-key/dist/index.d.mts` before coding;
  see `arch-decision-passkey-and-related.md` §3 for the confirmed
  method names (`createApiKey` / `verifyApiKey` / `deleteApiKey`,
  NOT `apiKey.create` / `apiKey.verify` / `apiKey.revoke`).

## 8. Behavioral invariants (must not break)

1. `MCP_AUTH_MODE` unset or `demo` → behavior is byte-for-byte
   identical to current `main`. Existing tests must pass without
   modification.
2. The custom demo `/sign-in` route and the `autoConsent` middleware
   stay demo-only. Real mode never strips `prompt=consent` — the
   consent screen is real.
3. CORS `origin: '*'` is demo-only. Real mode MUST use an explicit
   origin list from `MCP_AUTH_CORS_ORIGINS` (T-21 enforces).
4. `demoTokenVerifier` continues to exist (as an alias) so external
   imports don't break.
5. The Excel tools and their `chain_operations` wrapper are unchanged
   by this plan. The only addition to the authenticated surface is
   the three `[C-AT]` tools.
6. Phone number is unsupported in real mode. The `phoneNumber` plugin
   is NOT loaded. Do not add a phone column to the user table.

## 9. Things to verify before coding (spike notes)

- T-00 — confirm `passkey`, `magicLink`, `twoFactor.backupCodes`,
  `apiKey` plugin options and the exact API surface (`auth.api.*`
  method names) for the version pinned in `package.json`.
- T-01 — confirm the client SDK used by `examples/oauth/` (and any
  other test client) supports `elicitation/create`. Server-side we
  already know it works.
- T-02 — confirm better-auth allows `email` to be nullable while
  `passkey` functions. If it requires an email, use a synthetic
  `{userId}@local.invalid` and document it.

Spike outputs go into `tickets/real-auth/notes/T-NN-notes.md` so
later implementers can read the conclusions without re-spiking.

## 10. Working agreement

- Follow `AGENTS.md` karpathy guidelines: surgical changes, no
  speculative generality, no unrelated refactors.
- TypeScript strict — match the existing `as any` + structural-type
  pattern used in `auth.ts:267-283` for `DemoAuth`. The new
  `RealAuth` type follows the same shape.
- Don't add npm deps. If a spike conclusively shows one is needed,
  raise it in `tickets/real-auth/notes/` and get a decision before
  editing `package.json`.
- Don't edit the demo code paths. Real mode is additive. The only
  edits to demo-path files are: the mode dispatcher in `auth.ts` and
  the mode branch in `authServer.ts`'s `setupAuthServer` — both
  guarded so demo behavior is unchanged.
- Use `npx pm2 restart js-excel-mcp` after schema changes; delete
  `data/_auth_real.db` first if you touched the real schema.
