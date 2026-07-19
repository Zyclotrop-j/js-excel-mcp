# Architecture Decision — Passkey, API-Key, Version Pin, and Email-Optional

**Decision ID:** arch-decision-passkey-and-related
**Author:** Lead Architect
**Date:** 2026-07-19
**Status:** Final — binding on all downstream tickets
**Supersedes:** T-00-notes.md open questions §1–§4 (resolves all four)

> **Amendment 2026-07-19 (post-T-02):** T-02's researcher verified the
> passkey and api-key API surfaces against the installed
> `@better-auth/passkey@1.6.23` and `@better-auth/api-key@1.6.23`
> `index.mjs` / `.d.mts` files. Four factual corrections applied to
> §1.5 and §3 below (passkey method names, `verifyApiKey` response
> field, two-ceremony passkey signup, `name` required). The decisions
> (Option A' for passkey, Outcome B for api-key, Strategy A for
> email-optional, `^1.6.23` pin) are unchanged — only the API-name
> facts the implementers will code against. See the inline
> "Correction N" markers.

---

## 0. Trigger

T-00-notes.md surfaced the finding that `better-auth@1.6.23` (installed;
`package.json` pins `^1.6.11`) does **not** ship `passkey` or `apiKey`
plugins in its main bundle. T-00 concluded both were "NOT AVAILABLE in
v1.6.23" and asked the Lead Architect to choose between upgrading,
dropping passkey from MVP, or implementing WebAuthn ourselves.

**T-00 missed a fourth path:** both plugins ship as separate, official,
version-matched scoped packages — `@better-auth/passkey@1.6.23` and
`@better-auth/api-key@1.6.23`. This decision document records the
investigation of that path and the four resolutions T-00 asked for.

---

## 1. Investigation summary (what I verified, not speculated)

### 1.1 T-00's core finding is correct about the main bundle

`node_modules/better-auth/package.json` (installed 1.6.23) `exports`
field lists these plugin subpaths: `access`, `admin`, `anonymous`,
`bearer`, `custom-session`, `email-otp`, `generic-oauth`, `jwt`,
`haveibeenpwned`, `oidc-provider`, `magic-link`, `multi-session`,
`oauth-proxy`, `organization`, `one-time-token`, `phone-number`,
`two-factor`, `username`, `siwe`, `device-authorization`,
`mcp/client`, `mcp/client/adapters`. **No `passkey`. No `apiKey`/
`api-key`.** T-00 was right that the main bundle doesn't ship them.

STUDY_FIRST.md §3's claim that better-auth "Ships `passkey`,
`magicLink`, `twoFactor`, `apiKey`, `admin`, `phoneNumber` plugins out
of the box" is **factually wrong** for `passkey` and `apiKey`. This is
a wording error in the contract, not an intent error — the plan always
intended to use these plugins; it just mis-described where they live.

### 1.2 No newer better-auth version ships them either

`npm view better-auth dist-tags`:
```
latest: 1.6.23   beta: 1.7.0-beta.10   rc: 1.7.0-rc.1
```

`npm view better-auth@1.7.0-rc.1 exports` — the 1.7.0-rc.1 `exports`
field is actually *shorter* than 1.6.23 (no `mcp/client` entry) and
still has no `passkey` or `apiKey`. **No released version of
`better-auth` (stable, beta, or rc) ships passkey or apiKey in the
main bundle.** Upgrading better-auth does not solve the problem.

### 1.3 Both plugins ship as separate official scoped packages

`npm view @better-auth/passkey@1.6.23` and `npm view @better-auth/api-key@1.6.23`:

| Property | `@better-auth/passkey` | `@better-auth/api-key` |
|---|---|---|
| Version | 1.6.23 | 1.6.23 |
| Published | 2026-06-29 (same day as `better-auth@1.6.23`) | 2026-06-29 (same day) |
| Repository | `github.com/better-auth/better-auth`, `packages/passkey` | same monorepo, `packages/api-key` |
| Maintainers | bekacru, better-gustavo (same as better-auth) | same |
| License | MIT | MIT |
| SLSA provenance | Yes (`predicateType: slsa.dev/provenance/v1`) | Yes |
| `peerDependencies.better-auth` | `^1.6.23` | `^1.6.23` |
| Runtime deps | `zod@^4.3.6`, `@simplewebauthn/server@^13.2.3`, `@simplewebauthn/browser@^13.2.2` | `zod@^4.3.6` only |
| Exports | `.` (server), `./client` | `.`, `./types`, `./client` |

Both packages are official first-party better-auth plugins, published
by the same maintainers, from the same GitHub monorepo, on the same
day as the core `better-auth@1.6.23` release, with SLSA provenance
attestations. They are not community forks. They declare
`peerDependencies: better-auth@^1.6.23` — i.e. the maintainers
explicitly assert compatibility with our installed version.

### 1.4 Demo mode is structurally isolated from these plugins

`src/shared/auth.ts` `createDemoAuth(...)` (lines 194–255) imports only:
```ts
import { betterAuth } from 'better-auth';
import { mcp } from 'better-auth/plugins';
```
…and constructs `betterAuth({ plugins: [mcpPlugin], ... })`. Demo mode
loads **one** plugin (`mcp`). It never imports `@better-auth/passkey`
or `@better-auth/api-key`. Installing these packages as dependencies
cannot perturb demo-mode behavior — the packages sit in
`node_modules` unused until real mode's `createRealAuth` (T-20)
imports them. The §8.1 demo invariant is structurally preserved.

### 1.5 Docs-confirmed API surfaces (secondary check; installed `.d.ts` is primary)

**`@better-auth/passkey`** ([docs](https://www.better-auth.com/docs/plugins/passkey)):
- Import: `import { passkey } from '@better-auth/passkey'`
- Plugin: `passkey({ rpID, rpName, origin, registration?: {...}, authentication?: {...}, advanced?: {...} })`
- Server API (**Correction 1, post-T-02**: verified against
  `@better-auth/passkey@1.6.23` `index.mjs` — `addPasskey` and
  `signInPasskey` do NOT exist in the installed package; the four
  confirmed method names are):
  - `auth.api.generatePasskeyRegistrationOptions({ context? })` —
    generates WebAuthn registration options (the challenge).
  - `auth.api.verifyPasskeyRegistration({ body: { name?, attestationResponse, context? }, headers })` —
    verifies the attestation and stores the passkey. **Returns the
    `Passkey` row; does NOT create a session.**
  - `auth.api.generatePasskeyAuthenticationOptions({ context? })` —
    generates WebAuthn authentication options (the challenge).
  - `auth.api.verifyPasskeyAuthentication({ body: { assertionResponse, context? }, headers })` —
    authenticates an existing passkey. **Returns `{ session, user }`.**
  - `auth.api.listPasskeys`, `auth.api.deletePasskey`,
    `auth.api.updatePasskey` — docs-mentioned but NOT in scope of
    T-02's spike. Verify against the installed `.d.ts` before coding.
- **Passkey-first signup**: `registration.requireSession: false` +
  `registration.resolveUser` callback allows passkey registration
  without a pre-existing session. **However, `verifyPasskeyRegistration`
  returns the `Passkey` row but NO session** (Correction 3, post-T-02).
  T-41's passkey-first signup therefore needs EITHER (a) two WebAuthn
  ceremonies in one tool call (register via `verifyPasskeyRegistration`
  → authenticate via `verifyPasskeyAuthentication` to obtain
  `{ session, user }`), OR (b) a server-side session bootstrap after
  registration (create a session directly from the `userId` on the
  `Passkey` row, without a second WebAuthn ceremony). This is a T-41
  design choice — see the architect's note on
  `T-41-auth-signup-tool.md` for the full analysis, including the
  `[C-PL]` impact. Passkey-only accounts do NOT require a throwaway
  password.
- Schema: adds a `passkey` table (id, name?, publicKey, userId,
  credentialID, counter, deviceType, backedUp, transports?, createdAt?,
  aaguid?).

**`@better-auth/api-key`** ([docs](https://www.better-auth.com/docs/plugins/api-key)):
- Import: `import { apiKey } from '@better-auth/api-key'`
- Plugin: `apiKey()` (no required options)
- Server API: `auth.api.createApiKey`, `auth.api.verifyApiKey`,
  `auth.api.getApiKey`, `auth.api.updateApiKey`,
  `auth.api.deleteApiKey`, `auth.api.listApiKeys`,
  `auth.api.deleteAllExpiredApiKeys`
- `createApiKey({ body: { userId, name, prefix, expiresIn, ... } })`
  returns the `ApiKey` object including the plaintext `key` (shown
  once). `prefix: 'mcp_'` is supported natively — T-52's `mcp_`
  prefix convention works out of the box.
- `verifyApiKey({ body: { key, permissions? } })` returns
  `{ valid: boolean, error: {message, code} | null, key: Omit<ApiKey, 'key'> | null }`.
  **Correction 2 (post-T-02):** the user identifier on the `key`
  object is `referenceId`, NOT `userId`. T-30's verifier fallthrough
  must extract `result.key.referenceId` (the user id) and
  `result.key.id` (the key id) — NOT `result.userId` /
  `result.keyId` as T-30's ticket body guesses. The `key.referenceId`
  field is the link back to `user.id`; `verifyApiKey` does NOT return
  a top-level `userId`.
- **Gap flagged for T-52**: `deleteApiKey` requires session cookies
  ("This endpoint requires session cookies"). T-52's `revoke`/`rotate`
  actions run under an API-key session (no session cookie). The docs
  note: "If you want to delete a key without these checks, we recommend
  you use an ORM to directly mutate your DB instead." T-52's
  implementer must either (a) verify `deleteApiKey` accepts the
  API-key-authenticated request or whether T-52's revoke/rotate
  actions need a direct DB delete (the docs note: "If you want to
  delete a key without these checks, we recommend you use an ORM to
  directly mutate your DB instead").

**IMPORTANT for implementers:** T-51's ticket body uses
`auth.api.passkey.register` / `auth.api.passkey.verify` — **these
names do not exist**. T-52's ticket body uses
`auth.api.apiKey.create` / `auth.api.apiKey.revoke` — **these names do
not exist**. The correct names are `auth.api.verifyPasskeyRegistration` /
`auth.api.verifyPasskeyAuthentication` /
`auth.api.generatePasskeyRegistrationOptions` /
`auth.api.generatePasskeyAuthenticationOptions` (passkey) and
`auth.api.createApiKey` / `auth.api.deleteApiKey` (api-key) etc. as
listed above. **The installed `.d.ts` files are the source of truth** —
verify every API name against `node_modules/@better-auth/passkey/dist/index.d.mts`
and `node_modules/@better-auth/api-key/dist/index.d.mts` before coding.
My agent file's standing rule: "the installed types are the source of
truth — the docs site is a secondary check at best."

---

## 2. Decision 1 — Passkey

### Chosen: Option A' (install `@better-auth/passkey@1.6.23`)

Install the official version-matched `@better-auth/passkey` package as
a runtime dependency. **Do not** upgrade `better-auth` itself. Passkey
stays in MVP scope. T-02, T-41, T-51, T-72 all proceed as originally
scoped (with the API-name corrections noted in §1.5 above).

### Rationale

1. **Zero demo-invariant risk.** Demo mode (`createDemoAuth`) never
   imports `@better-auth/passkey`. The package sits unused in
   `node_modules` until real mode loads it. §8.1 is structurally
   preserved — no test, no behavior change in demo mode.

2. **Zero breaking-change risk to better-auth.** We are not upgrading
   `better-auth` itself. The installed 1.6.23 stays. The passkey
   package declares `peerDependencies: better-auth@^1.6.23` — the
   maintainers explicitly assert compatibility.

3. **No contract intent changes.** `[C-PA]` keeps three signup
   credential types. `[C-AT]` keeps three authenticated tools.
   `[C-ELICIT]` keeps the `passkey` enum value. The only contract
   edits are **wording corrections** to §3 (passkey/apiKey ship as
   separate packages, not in the main bundle) and a precision fix to
   `[C-APIKEY]` ("the `@better-auth/api-key` plugin" instead of
   "better-auth's apiKey plugin"). Neither changes a contract's
   *intent* — they fix factual errors. Per briefing §11.2, this is
   not a major scope change (no feature surface added/removed, no
   contract intent changed, no new dependency *category* — same auth
   category as `better-auth` itself).

4. **Official, version-matched, SLSA-attested.** Same maintainers,
   same monorepo, same release day, same version (1.6.23). This is
   not a community fork; it is the canonical plugin.

5. **Shortens T-02's spike.** With `@better-auth/passkey` installed,
   T-02 can spike the real plugin (nullable email + passkey
   registration) instead of speculating about a non-existent plugin
   or falling back to a synthetic-email workaround.

6. **Enables passkey-first signup.** The plugin's
   `registration.requireSession: false` + `resolveUser` callback
   allows passkey-only account creation without a throwaway password.
   T-41's "throwaway password for passkey bootstrap" path can be
   simplified in implementation (T-41's ticket body already notes
   this as a TBD — the implementer now has a clean path).

### Alternatives rejected

- **Option A (upgrade `better-auth` to a version that ships passkey
  in-bundle):** **Not viable.** No released version of better-auth
  (stable, beta, or rc) ships passkey in the main bundle. Verified
  against `npm view better-auth@1.7.0-rc.1 exports` — the 1.7.0-rc.1
  exports list is shorter than 1.6.23 and still has no passkey. There
  is nothing to upgrade to.

- **Option B (drop passkey from MVP, password + magic-link +
  backup-codes only):** **Rejected as unnecessary.** This would be a
  *major* scope change per briefing §11.2 ("removing a planned
  feature surface" is explicitly listed under major). Major scope
  changes require "last resort when no other option remains." Option
  A' is a viable non-major alternative — it adds a version-matched
  official package with zero demo-invariant risk and zero contract
  intent changes. Dropping passkey would also require amending the
  *intent* of `[C-PA]` (3 → 2 credential types), `[C-AT]` (3 → 2
  tools), `[C-ELICIT]` (remove `passkey` enum value), and §8.6 (add
  "passkey unsupported" alongside "phoneNumber unsupported"). That
  is precisely the kind of multi-contract intent change §11.2
  classifies as major. Option A' avoids all of it. Passkey can still
  be deferred later as a T-81-style follow-up if T-01/T-72 reveal
  the test client can't do WebAuthn — but that decision should be
  made *after* T-01's client-capability findings, not pre-emptively
  before them.

- **Option C (implement WebAuthn ourselves):** **Rejected.** High
  complexity, high risk, out of scope. The official plugin exists
  and is version-matched; there is no reason to roll our own.

- **Option D (hybrid: install `@better-auth/api-key` now, defer
  passkey):** **Rejected.** Deferring passkey is still a major scope
  change with the same multi-contract intent amendments as Option B.
  The rationale for deferral (WebAuthn client capability unproven)
  is speculative — T-01 hasn't finished, and even if the test client
  can't do WebAuthn, T-51's ticket already documents a browser
  fallback. Decide deferral *if* T-01/T-72 surface a real blocker;
  don't pre-empt.

### Breaking-change analysis (Option A')

- **`better-auth` itself:** unchanged. No version movement. Zero
  breaking changes from the core library.
- **Demo mode (`createDemoAuth`):** unchanged. Never imports the new
  packages. `npm test` (demo) will pass without modification.
- **Real mode (`createRealAuth`, T-20):** T-20's ticket body has
  `import { passkey } from 'better-auth/plugins'` and
  `import { apiKey } from 'better-auth/plugins'` in code examples.
  These imports are **wrong** — they must be
  `import { passkey } from '@better-auth/passkey'` and
  `import { apiKey } from '@better-auth/api-key'`. T-20's implementer
  must read this decision file and use the correct import paths. (The
  PL should point T-20's assignee at this file before dispatch.)
- **Transitive deps:** `@better-auth/passkey` brings
  `@simplewebauthn/server@^13.2.3` and `@simplewebauthn/browser@^13.2.2`
  as runtime dependencies (not peer deps — they install
  automatically). `@better-auth/api-key` brings no new transitive
  deps (only `zod`, already present). Neither WebAuthn library is
  imported by our code directly; they're internal to the passkey
  plugin.
- **Bundle size:** `@better-auth/passkey` unpacked is 72.6 KB;
  `@better-auth/api-key` is 153.7 KB. Both are server-side only (no
  client bundle impact; the MCP server is a Node process).

### Affected contracts

- **`STUDY_FIRST.md §3`** — factual correction: passkey and apiKey
  ship as separate `@better-auth/*` packages, not in the main
  better-auth bundle. Add the two new deps to the list. (Surgical
  edit, wording only — see §5 below.)
- **`[C-APIKEY]`** — precision fix: "better-auth's `apiKey` plugin"
  → "the `@better-auth/api-key` plugin". (Wording only, no intent
  change.)
- **`[C-PA]`, `[C-AT]`, `[C-ELICIT]`, `[C-RECOVER]`, `[C-MAILER]`,
  `[C-VF]`, `[C-PL]`, `[C-SI]`, `[C-EP]`, `[C-REG]`, `[C-DB]`,
  `[C-ENV]`, `[C-MODE]`** — **no changes.** Their intents are
  preserved. No ticket's "Contracts honored" section needs updating
  because they reference contracts by `[C-XX]` ID, not by the
  wording being corrected.

### Affected tickets

| Ticket | Impact | Action for implementer |
|---|---|---|
| T-02 | **Unblocked.** Can spike real `@better-auth/passkey` plugin. | Read this decision; import from `@better-auth/passkey`; verify nullable-email + passkey registration against installed `.d.ts`. |
| T-12 | Schema must include `passkey` table (per §1.5 schema) and `api_key` table (per `@better-auth/api-key` docs reference page). | Read this decision; pull DDL from plugin docs + installed `.d.ts`. |
| T-20 | Import paths in ticket body are wrong. | Use `import { passkey } from '@better-auth/passkey'` and `import { apiKey } from '@better-auth/api-key'`. Verify plugin options against installed `.d.ts`. |
| T-30 | Outcome B confirmed (verifier accepts API keys directly). API name correction. | Use `auth.api.verifyApiKey({ body: { key } })`; extract `result.key.referenceId` (user id) and `result.key.id` (key id) from the `{ valid, error, key }` response. **Correction 2:** the user id field is `referenceId`, NOT `userId`. |
| T-41 | Passkey-first signup path available via `registration.requireSession: false`, BUT `verifyPasskeyRegistration` returns no session (Correction 3). | Choose: (a) two WebAuthn ceremonies (register → authenticate), or (b) server-side session bootstrap. See architect's note on T-41 for `[C-PL]` analysis. `name` is required (Correction 4) — already covered by `[C-ELICIT]`. |
| T-51 | API names in ticket body are wrong. | Use `auth.api.verifyPasskeyRegistration` / `auth.api.verifyPasskeyAuthentication` / `auth.api.generatePasskeyRegistrationOptions` / `auth.api.generatePasskeyAuthenticationOptions`. NOT `passkey.register` / `passkey.verify` / `addPasskey` / `signInPasskey`. `verifyPasskeyRegistration` returns the `Passkey` row but NO session. |
| T-52 | API names in ticket body are wrong. `deleteApiKey` may require session cookies. | Use `auth.api.createApiKey` / `auth.api.verifyApiKey` / `auth.api.deleteApiKey`. For revoke/rotate under an API-key session, verify `deleteApiKey` accepts API-key auth or use a direct DB delete (docs-recommended fallback). |
| T-72 | Passkey E2E smoke may need a WebAuthn-capable test client. | Already documented as "gated, optional" in T-72 §5. If the test client lacks WebAuthn, mark the passkey suite as a known limitation and defer to a follow-up. |

### Version pin (Decision 4, consolidated here)

Pin all three packages to `^1.6.23`:

```json
"dependencies": {
  "better-auth": "^1.6.23",
  "@better-auth/passkey": "^1.6.23",
  "@better-auth/api-key": "^1.6.23",
  ...
}
```

**Rationale:**
- The new packages declare `peerDependencies: better-auth@^1.6.23`.
  The current pin `^1.6.11` allows npm to resolve better-auth to
  1.6.11–1.6.22 in a fresh install, which would violate the peer dep
  range. Tightening to `^1.6.23` satisfies the peer dep exactly.
- `^1.6.23` allows patch fixes within 1.6.x and the future stable
  1.7.x (currently rc). The peer dep range `^1.6.23` is what the
  maintainers assert compatibility against, so following it is the
  least-surprise choice.
- Exact pin `1.6.23` would block legitimate patch fixes and is
  overly restrictive for a library with frequent patch releases (23
  releases in the 1.6.x line over ~3 months).
- `^1.6.11` is wrong — it allows versions the new packages don't
  support.

**Action for PL:** after merging this decision, run
`npx pm2 delete js-excel-mcp; npm install; npx pm2 start ecosystem.config.cjs`
to install the new packages and restart the server. (PM2 delete+start,
not just restart — per AGENTS.md, new deps require a full
delete+start.)

---

## 3. Decision 2 — API-key strategy

### Chosen: Confirm T-30/T-52 custom-verifier-fallthrough approach (Outcome B), using `@better-auth/api-key` for key issuance/verification

T-00's D-00-2 recommended "Option 1 — extend `tokenVerifier` with
custom API key table." T-00's reasoning was that the `apiKey` plugin
doesn't exist in the main bundle and the MCP token endpoint doesn't
accept API keys. Both premises are correct. T-00's recommendation
assumed a *custom* `api_key` table because T-00 didn't know
`@better-auth/api-key` existed.

With `@better-auth/api-key` installed, we don't need a custom table —
the plugin provides `createApiKey`, `verifyApiKey`, `deleteApiKey`,
and its own `api_key` table (schema per the plugin's reference page).
T-30's `verifyApiKey` fallthrough calls `auth.api.verifyApiKey`
(native plugin API) instead of a hand-rolled lookup. T-52's
`auth_rotate_apikey` tool calls `auth.api.createApiKey` /
`auth.api.deleteApiKey` (native plugin APIs) instead of custom SQL.

### Confirmation of T-30 Outcome B

T-00 confirmed: the MCP plugin's `mcpOAuthToken` endpoint only handles
OAuth grants (`authorization_code`, `refresh_token`,
`client_credentials`). No API-key grant type. **Therefore the
verifier must accept API keys directly** — this is T-30's "Outcome B."

T-30's ticket body §2 already implements this:
```ts
async function verifyApiKey(auth: Auth, token: string): Promise<AuthInfo> {
  const result = await (auth.api as any).apiKey.verify({ body: { key: token } });
  ...
}
```
**Corrections the implementer must apply:**
1. The API name is `auth.api.verifyApiKey`, NOT `auth.api.apiKey.verify`.
2. The response shape is `{ valid: boolean, error: {message, code} | null, key: Omit<ApiKey, 'key'> | null }`.
   **Correction 2 (post-T-02):** the user identifier on the `key`
   object is `referenceId`, NOT `userId`. Extract
   `result.key?.referenceId` (the user id) and `result.key?.id` (the
   key id) (NOT `result.userId` / `result.keyId`). The
   `key.referenceId` field is the link back to `user.id`.
3. Check `result.valid === true` before trusting `result.key`
   (the plugin returns `valid: false` with an error for invalid keys).
4. Set `API_KEY_FALLTHROUGH = true` (T-30 §4) — Outcome B is in effect.

T-30's `AuthInfo.extra.credentialType: 'api-key'` convention (for
T-50's `auth_signout` to distinguish API-key sessions) is confirmed
good — keep it.

### Confirmation of T-52

T-52's ticket body is mostly correct in intent. Corrections:
1. `auth.api.apiKey.create` → `auth.api.createApiKey`
2. `auth.api.apiKey.revoke` → `auth.api.deleteApiKey`
3. `createApiKey` response: the plaintext key is at `result.key`
   (string), and the key metadata (id, referenceId, name, etc.) is at
   `result` (the rest of the `ApiKey` object). **Correction 2
   (post-T-02):** the user id field on the stored row is
   `referenceId` (the `userId` passed in the request body becomes
   `referenceId` on the row). Verify exact shape against installed
   `.d.ts`.
4. `prefix: 'mcp_'` is supported natively by `createApiKey` — no
   custom prefix logic needed.
5. **`deleteApiKey` requires session cookies** per the docs. T-52's
   `revoke`/`rotate` actions run under an API-key session (no session
   cookie). The implementer must verify whether `deleteApiKey`
   accepts API-key-authenticated requests. If not, fall back to a
   direct DB delete via better-sqlite3 (the docs explicitly recommend
   this: "If you want to delete a key without these checks, we
   recommend you use an ORM to directly mutate your DB instead.").
   This is an implementation detail for T-52 to resolve against the
   installed types — it does not change `[C-APIKEY]`'s intent.

### No contract amendment needed for `[C-APIKEY]`'s intent

`[C-APIKEY]` anticipated both Outcome A and Outcome B ("T-00 must
confirm whether the apiKey plugin integrates with the MCP token
endpoint, or whether tokenVerifier must be extended in T-30 to also
accept API keys directly"). T-00 confirmed Outcome B. The contract's
intent is unchanged; only the precision fix ("the `@better-auth/api-key`
plugin" wording) is applied.

---

## 4. Decision 3 — Magic-link + email-optional

### Chosen: Email is truly optional at the schema level; magic-link only fires when email is present

T-02 should proceed with **Strategy A (nullable email)** — configure
better-auth's user table with `email TEXT UNIQUE` (no `NOT NULL`).
SQLite allows multiple NULLs in a UNIQUE column (confirmed standard
SQLite behavior — NULLs are distinct for UNIQUE). Passkey-only
accounts have `email = NULL`.

**Per-credential-type email semantics:**

| `credentialType` | Email required? | Why |
|---|---|---|
| `password` | **Yes** | Email is the login identifier for `signUpEmail` / `signInEmail`. |
| `magiclink` | **Yes** | Email is the delivery channel for the magic link. |
| `passkey` | **No** | Passkey is the credential; email is never used for authentication. Passkey-first signup (`registration.requireSession: false`) creates the account without email. |

**Magic-link + email=null:** A passkey-only account (`email = NULL`)
**cannot** use magic link. This is acceptable — they authenticate via
passkey. If they later want magic-link capability, they would need to
add an email to their account (a future `auth_update_profile` tool,
out of scope for this plan). T-41's existing cross-field validation
already enforces this:
```ts
if (existing.credentialType === 'magiclink' && !existing.email) {
  return this.textResult('email is required when credentialType=magiclink.', true);
}
```
No contract amendment needed. T-02 should confirm in its spike that
`@better-auth/passkey` tolerates `email = NULL` on the user row (the
docs don't explicitly say; the installed `.d.ts` and a spike are the
confirmation path). If the plugin requires email, fall back to
**Strategy B (synthetic `{userId}@local.invalid`)** as documented in
T-02's ticket — this is T-02's decision to make based on the spike,
not a Lead Architect decision.

### T-02 unblock

T-02 is **unblocked** by this decision. The researcher can proceed
with:
1. Reading this decision file.
2. Importing `passkey` from `@better-auth/passkey` (after PL installs
   the package).
3. Spiking Strategy A (nullable email + passkey registration) against
   the installed plugin.
4. Falling back to Strategy B (synthetic email) if the spike reveals
   the plugin requires email.
5. Producing `T-02-notes.md` with the copy-paste-ready DDL and
   better-auth options snippet.

---

## 5. Contract amendments applied

### 5.1 `STUDY_FIRST.md §3` — factual correction (wording only)

The current text:
> `better-auth@^1.6.11` — the auth framework. Ships `passkey`,
> `magicLink`, `twoFactor`, `apiKey`, `admin`, `phoneNumber` plugins
> out of the box. We use the first four; not `phoneNumber`.

Is factually wrong: `passkey` and `apiKey` do NOT ship in the main
bundle. Amended to reflect that they ship as separate
`@better-auth/*` packages, and to add the two new deps + the version
pin tightening. See the surgical edit in STUDY_FIRST.md.

### 5.2 `STUDY_FIRST.md [C-APIKEY]` — precision fix (wording only)

The current text:
> Issued by `auth_rotate_apikey` (T-52) via better-auth's `apiKey`
> plugin.

Is imprecise. Amended to:
> Issued by `auth_rotate_apikey` (T-52) via the
> `@better-auth/api-key` plugin.

No intent change. The contract still says API keys are issued by
T-52 via the apiKey plugin, stored hashed, used as bearer. Only the
package attribution is corrected.

### 5.3 No other contracts amended

`[C-PA]`, `[C-AT]`, `[C-ELICIT]`, `[C-RECOVER]`, `[C-MAILER]`,
`[C-VF]`, `[C-PL]`, `[C-SI]`, `[C-EP]`, `[C-REG]`, `[C-DB]`,
`[C-ENV]`, `[C-MODE]` — all unchanged. Their intents are preserved by
Option A'. No ticket's "Contracts honored" section references §3 or
the `[C-APIKEY]` wording being corrected (they reference `[C-XX]`
IDs), so no ticket's "Contracts honored" section needs updating.

### 5.4 No scope change

Option A' does **not** add or remove a feature surface, change a
contract intent, add a new dependency *category* (the new packages
are in the same auth category as `better-auth`), or change the number
of waves. Per briefing §11.2, this is not a scope change — it is a
new-dep decision authorized by the Lead Architect with rationale
recorded (this file). `SCOPE_CHANGES.md` is **not** created.

---

## 6. Downstream unblocks (signal to PL)

After the PL installs the new packages and restarts PM2:

- **T-02** — unblocked. Dispatch to `researcher`. Researcher reads
  this file, imports from `@better-auth/passkey`, spikes Strategy A.
- **T-12** — still gated on T-02's notes (per wave plan), but the
  schema now known to need: core better-auth tables + `passkey`
  table (per §1.5) + `api_key` table (per `@better-auth/api-key`
  reference docs) + `twoFactor` table (per T-00 §3) + MCP/OIDC
  tables (already in demo). T-12's implementer pulls DDL from the
  plugin docs + installed `.d.ts`.
- **T-20** — still gated on T-00 + T-02 + T-12 (per wave plan).
  T-20's implementer MUST read this file before coding — the import
  paths in T-20's ticket body are wrong.
- **T-30** — Outcome B confirmed. T-30 can proceed once T-20 lands.
  Implementer applies the API-name corrections from §3 above.
- **T-51, T-52** — API-name corrections recorded in §1.5 and §3.
  Implementers read this file before coding.
- **T-72** — passkey E2E smoke is already "gated, optional" in T-72
  §5. If the test client lacks WebAuthn, mark as a known limitation.

---

## 7. Standing rules honored

- **No production code written** by the Lead Architect. This file is
  a decision document; the PL and ICs implement.
- **No `npm test` or PM2 restart** by the Lead Architect. The PL
  installs packages and restarts.
- **Demo invariant (§8.1)** preserved — demo mode never imports the
  new packages.
- **No `process.env` reads** introduced.
- **New npm deps authorized** with rationale recorded (this file),
  per the Lead Architect's dependency-decision authority.
- **Surgical contract edits only** — §3 and `[C-APIKEY]` wording
  fixed; all other contracts preserved.
- **Installed types are the source of truth** — implementers are
  directed to verify every API name against
  `node_modules/@better-auth/passkey/dist/index.d.mts` and
  `node_modules/@better-auth/api-key/dist/index.d.mts` before coding.
  The docs-confirmed names in §1.5 are a starting point, not a
  substitute for the installed types.
