# T-20 architect review — accepted scope deviation

**Date:** 2026-07-19
**Ticket:** T-20 (Refactor `auth.ts` into mode dispatcher + two builders)
**Authority:** §11.2 (minor scope changes) + §11.4 (process changes)
**Verdict:** LGTM — architect co-sign confirmed (combined review+co-sign per §11.4;
code-reviewer unavailable — see `SCOPE_CHANGES.md` 2026-07-19 entry).

---

## Deviation: `emailOptionalPlugin` added to the **demo** builder

**Ticket §3 contract:** "The body of `createDemoAuth` — the `mcp(...)` plugin
config, `emailAndPassword.requireEmailVerification: false`, the
`trustedOrigins` — is **unchanged**. Only the inputs change (now sourced from
`cfg` instead of `options`)."

The §4 amendment (line 220 of the ticket) shows `emailOptionalPlugin` in the
**real-mode** plugins array only. The ticket did not authorize adding it to the
demo builder.

**What the implementer did:** Added `emailOptionalPlugin` to **both** builders:
- `src/shared/auth.ts:236` — `plugins: [mcpPlugin, emailOptionalPlugin]` (demo)
- `src/shared/auth.ts:348` — `emailOptionalPlugin` in the real plugins array

The implementer did **not** flag this as a deviation in their report.

### Decision: ACCEPTED as a minor scope amendment (§11.2)

**Rationale:**

1. **Behavioral invariant (§8.1) is preserved.** The plugin only overrides the
   core `user.email` column from `required: true` to `required: false`
   (unique preserved). The demo user (`demo@example.com`) always supplies an
   email, so the nullable change is invisible to every demo flow:
   - `/sign-in` auto-login → `signUpEmail` passes `email` → unaffected.
   - OIDC discovery / token / authorize endpoints → unchanged (plugin doesn't
     touch MCP plumbing).
   - Startup logs → unchanged (plugin emits no startup output).
   `npm test` (121) passes; `npx tsc --noEmit` passes.

2. **Schema divergence across modes would be worse.** If demo omitted the
   plugin and real included it, a fresh `data/_auth.db` would have
   `email text not null unique` while `data/_auth_real.db` would have
   `email text unique`. T-21 migrates `authServer.ts` to `createAuth`; having
   one schema across modes removes a mode-switch footgun and simplifies any
   future mode-toggle tooling.

3. **Existing demo DBs are truly byte-identical.** `CREATE TABLE IF NOT EXISTS`
   in `initializeSchema` does not migrate an existing table, so any developer
   with a pre-T-20 `data/_auth.db` sees no schema change at all. Only fresh
   demo DBs get the nullable-email column — and that is not observable via HTTP.

4. **The ticket's "unchanged" wording was about observable behavior, not the
   internal plugins array.** §3's three named anchors (`mcp(...)` config,
   `requireEmailVerification`, `trustedOrigins`) are all preserved verbatim.
   The plugins array was not explicitly called out as frozen.

**Cost accepted:** Fresh demo DBs (`data/_auth.db` deleted + recreated) will
have `email text unique` instead of `email text not null unique`. This is a
strict-schema relaxation that does not affect any demo code path. Recorded here
so T-21 and the test suite are aware.

**Action item (not a T-20 blocker):** When the demo test fixtures assert the
exact `user` DDL, update the expected column to drop `not null`. No fixture
currently does this (121 tests pass), so no action needed today.

---

## Naming deviation: `createDemoAuth`/`createRealAuth` → `buildDemoAuth`/`buildRealAuth`

**Decision: ACCEPTED.**

The ticket body named the builders `createDemoAuth(cfg, opts)` and
`createRealAuth(cfg, opts)`. The implementer renamed them to
`buildDemoAuth`/`buildRealAuth` and kept `createDemoAuth(options)` as a
backward-compatible wrapper that delegates via `loadAuthConfig(baseURL)`.

**Rationale:** T-20's "Do not do" list forbids touching `authServer.ts` (T-21
owns that migration). `authServer.ts:119` calls
`createDemoAuth({ baseURL, resource, loginPage, demoMode })` with the old
options shape. The implementer could not change that call site, so the
`createDemoAuth` name had to stay bound to the old signature. Renaming the
internal builders to `build*` is the clean resolution — `createAuth` is the
new public dispatcher, `build*` are the internal constructors, and
`createDemoAuth(options)` is the deprecated back-compat shim T-21 will delete.
The `build*` names are arguably clearer than the ticket's `create*` names
(internal builders shouldn't share the `create*` prefix with the public
dispatcher). No contract referenced the builder names; only `createAuth` and
`DemoAuth` are contract-referenced, and both are preserved.

---

## Separate `emailOptionalPlugin.ts` file

**Decision: ACCEPTED.** The ticket §4 amendment said to add the plugin to the
plugins array but did not specify a file location. A 35-line custom plugin
under `src/shared/` is the right call — co-locating it in `auth.ts` would bloat
that file and entangle the plugin definition with the builder logic.

---

## Passkey `resolveUser` signature — CONFIRMED correct

Verified against
`node_modules/@better-auth/passkey/dist/index-Cyjp_etN.d.mts:97-100`:

```ts
resolveUser?: ((args: {
    ctx: GenericEndpointContext;
    context?: string | null | undefined;
}) => Awaitable<PasskeyRegistrationUser>) | undefined;
```

`PasskeyRegistrationUser` (line 78-81):
```ts
interface PasskeyRegistrationUser { id: string; name: string; displayName?: string | undefined; }
```

The implementer's implementation (`auth.ts:279-298`):
- Destructures `{ ctx, context }` — matches the signature. ✓
- Treats `context` as a client-sent `userId` string — correct; the type is
  `string | null | undefined`, and the doc comment confirms it's
  "client-sent metadata," not a request object. ✓
- Resolves via `ctx.context.internalAdapter.findUserById(userId)` — the
  canonical better-auth internal-adapter pattern (`ctx.context` is the auth
  context, `internalAdapter` is the user CRUD surface). ✓
- Returns `{ id, name, displayName? }` — matches `PasskeyRegistrationUser`. ✓

**T-20 doesn't exercise `resolveUser` in a live flow** (it only wires the
option). T-41 (signup tool) is the first ticket to call it. The wiring is
correct, so T-41 is unblocked.

---

## Passkey `rpID`/`rpName` hardcoded — noted, not a T-20 blocker

`buildRealAuth` hardcodes `rpID: 'localhost'` and `rpName: 'js-excel-mcp Auth'`
(`auth.ts:274-275`). `AuthConfig` (T-10) has no `passkeyRpID`/`passkeyRpName`
fields. This is fine for T-20 (wiring only) and for local development. T-21
(or a follow-up config ticket) must add env-driven overrides
(`MCP_AUTH_PASSKEY_RP_ID`, `MCP_AUTH_PASSKEY_RP_NAME`) before any non-localhost
real deployment. Recorded here so it isn't lost.

---

## Checklist summary

| # | Check | Result |
|---|---|---|
| 1 | §8.1 demo invariant — no `secret` in demo `betterAuth({...})` | ✓ confirmed (diff line: `betterAuth({ baseURL, database: db, trustedOrigins, emailAndPassword, plugins, logger: undefined })` — no `secret`) |
| 1 | `logger: undefined` in demo (literal, not conditional) | ✓ `auth.ts:239` |
| 1 | `mcp(...)`, `requireEmailVerification: false`, `trustedOrigins` unchanged | ✓ verbatim from pre-T-20 |
| 1 | `cfg.dbPath` replaces `'data/_auth.db'` (no-op in demo) | ✓ `authMode.ts:62` `DEMO_DB_PATH = 'data/_auth.db'` |
| 1 | `npm test` 121 pass | ✓ verified |
| 1 | `git diff` demo path — input-source swap only (plus accepted emailOptionalPlugin) | ✓ |
| 2 | `createAuth` dispatcher routes on `cfg.mode` | ✓ `auth.ts:161-164` |
| 3 | passkey options match T-02 §3.3 + installed types | ✓ verified against `index-Cyjp_etN.d.mts` |
| 3 | magicLink options match T-00 §4 D-00-4 | ✓ `auth.ts:304-317` |
| 3 | twoFactor backupCodes-only, no TOTP | ✓ `auth.ts:320-328` |
| 3 | apiKey() no required options | ✓ `auth.ts:331` |
| 3 | emailOptionalPlugin in real plugins array | ✓ `auth.ts:348` |
| 3 | `secret: cfg.secret` in real | ✓ `auth.ts:337` |
| 3 | `trustedOrigins: cfg.trustedOrigins` in real | ✓ `auth.ts:336` |
| 3 | `database: authDb.betterAuthHandle` in real | ✓ `auth.ts:335` |
| 3 | `resolveMailer(cfg)` for magicLink `sendMagicLink` | ✓ `auth.ts:251, 305-312` |
| 3 | OIDC config identical demo↔real | ✓ `auth.ts:211-226` vs `auth.ts:254-269` |
| 3 | `as unknown as Auth` at real return site | ✓ `auth.ts:351` |
| 4 | `Auth` type includes all §5 methods | ✓ `auth.ts:70-116` — passkey×7, magicLink×2, twoFactor×5, apiKey×7, signOut |
| 5 | `DemoAuth = Auth` alias | ✓ `auth.ts:119`; `authServer.ts` still type-checks (tsc passed) |
| 6 | `getDatabase(cfg)` — singleton dropped, idempotent schema init | ✓ `auth.ts:146-151` |
| 7 | `consoleMailer` logs OTP with delimiter | ✓ `mailer.ts:36-42` |
| 7 | `webhookMailer` uses wretch, throws on non-2xx | ✓ `mailer.ts:48-52` |
| 7 | `resolveMailer` priority custom→webhook→sendgrid-throws→console | ✓ `mailer.ts:61-72` |
| 7 | Console default in real acceptable per [C-MAILER] | ✓ |
| 8 | `emailOptionalPlugin.ts` matches T-02 §1.3 | ✓ `emailOptionalPlugin.ts:20-34` |
| 9 | Naming deviation | ACCEPTED (see above) |
| 10 | Separate `emailOptionalPlugin.ts` file | ACCEPTED (see above) |
| 11 | Passkey `resolveUser` signature | CONFIRMED correct (see above) |
| 12 | No new npm deps | ✓ `package.json` unchanged; `wretch@^3.0.9` pre-existing |
| 13 | No `process.env` outside `server.ts`/`authMode.ts` | ✓ only a doc comment at `auth.ts:169` |
| 14 | Karpathy surgical changes | ✓ 2 modified files + 1 new 35-line file, no unrelated refactor |

---

## Downstream unblocks

- **T-21** (authServer.ts migration to `createAuth`) — safe to dispatch. The
  back-compat `createDemoAuth(options)` shim can be deleted once T-21 switches
  the call site to `createAuth(cfg, opts)`.
- **T-30** (real-mode tools) — safe to dispatch. The `Auth` structural type is
  the contract T-30 codes against.
- **T-41** (signup tool) — safe to dispatch. Passkey `resolveUser` wiring
  confirmed correct; the `userId`-in-`context` convention is the contract
  T-41 must follow when it pre-creates the user row before calling
  `verifyPasskeyRegistration`.
