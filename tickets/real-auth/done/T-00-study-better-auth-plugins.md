# T-00 — Study better-auth plugins (passkey, magicLink, twoFactor.backupCodes, apiKey)

- **Difficulty:** 🟡 medium
- **Type:** Study (no production code)
- **Dependencies:** none
- **Output:** `tickets/real-auth/notes/T-00-notes.md`
- **Blocks:** T-12, T-20, T-41, T-42, T-43, T-51, T-52

## Goal

Pin down the **exact API surface** of four better-auth plugins for the
version in `package.json` (`better-auth@^1.6.11`). Every later ticket
that calls `auth.api.*` depends on the method names and option shapes
recorded here.

## Why this first

better-auth's plugin API is the foundation of the real-mode wiring.
Guessing at method names like `signUpEmail`, `verifyBackupCode`, or
`createApiKey` will cause cascading rework across the auth tools. One
focused study pass up front prevents that.

## Scope

For each of the four plugins — `passkey`, `magicLink`,
`twoFactor.backupCodes`, `apiKey` — record:

1. **Import path** (e.g. `import { passkey } from 'better-auth/plugins'`
   — confirm the export exists at that path in the installed version).
2. **Plugin options object** — the full options shape, with defaults.
   Pull it from the installed `.d.ts` (search
   `node_modules/better-auth/dist/**/*.d.ts`), not from the docs site
   (the docs may describe a newer version).
3. **Required database tables / columns** the plugin adds beyond
   better-auth's core tables. Note table names and columns — T-12
   needs them verbatim.
4. **`auth.api.*` methods exposed** by the plugin, with their argument
   shapes (`body`, `headers`, `asResponse`, etc.). Pay special
   attention to:
   - Passkey: `passkey.register`, `passkey.verify`,
     `passkey.listUserPasskeys`, `passkey.deletePasskey`. Confirm
     which require an existing session.
   - Magic link: `magicLink.signIn`, `magicLink.verify`,
     `magicLink.sendMagicLink`. Identify the `sendMagicLink`
     callback signature (transport).
   - Backup codes: how to *generate* codes programmatically at
     signup (is there a `generateBackupCodes` API, or do they only
     get generated when 2FA is enabled?), how to *verify* a backup
     code during recovery, how they are stored (hashed? plain?).
   - API keys: `apiKey.create`, `apiKey.verify`, `apiKey.revoke`,
     `apiKey.list`. Confirm the returned key shape (`{ key: string,
     id: string, prefix?: string }`) and whether the plugin can be
     told to accept `Authorization: Bearer mcp_...` directly or only
     via a session-exchange call.
5. **Interaction with the `mcp` (OIDC) plugin.** Critical questions:
   - Does the `apiKey` plugin integrate with the MCP token endpoint,
     so an API key can be exchanged for an MCP access token? If yes,
     how? If no, can the `tokenVerifier` we ship in T-30 be extended
     to recognize API keys directly?
   - Does enabling `twoFactor` *require* an authenticator app (TOTP)
     or can we use **only** the backup-codes sub-feature without
     TOTP?
   - Does `passkey` require `@simplewebauthn/server` as a peer
     dependency? Check `peerDependencies` in
     `node_modules/better-auth/package.json`. If a peer dep is
     needed, flag it — the plan said "no new deps", so this is a
     decision point.
6. **Email-optional interaction.** For each plugin, note whether a
   user with `email = null` can:
   - register a passkey
   - receive a magic link (obviously no — but confirm)
   - generate / use backup codes
   - hold / verify an API key
   This feeds T-02.

## How to investigate

- Read `.d.ts` files under
  `node_modules/better-auth/dist/**/plugins/**/*.d.ts` and
  `node_modules/better-auth/dist/**/plugins/**/*.d.cts`. Use
  `Select-String` (PowerShell) or `rg -t ts`.
- Cross-reference with `https://www.better-auth.com/docs/plugins/<name>`
  **only as a secondary check** — the installed types are the source
  of truth.
- For the "does it integrate with the MCP plugin" question, read the
  MCP plugin's source (`node_modules/better-auth/dist/**/mcp*`) and
  grep for `apiKey` / `passkey` references.

## Deliverable

A single markdown file at `tickets/real-auth/notes/T-00-notes.md`
with:

- One section per plugin (passkey, magicLink, twoFactor, apiKey).
- The six points above answered for each.
- A "Decisions" section at the end that records:
  - **D-00-1**: backup-codes-without-TOTP — possible? If not, the
    plan falls back to "generate 10 random codes ourselves and hash
    them with bcrypt, store in a custom column." Flag this for T-12
    and T-41.
  - **D-00-2**: API-key → MCP-token bridge — does T-30 need to
    extend the token verifier, or does better-auth already accept API
    keys at the token endpoint?
  - **D-00-3**: passkey peer deps — list any new `package.json`
    entries required, or confirm none.
  - **D-00-4**: any plugin option that *must* be set for our use
    case (e.g. `twoFactor.backupCodes: { enabled: true,
    customGenerateBackupCodes: ... }`).

## Do not do

- Do not write any production code in this ticket.
- Do not edit `package.json`. If a peer dep is needed, record it in
  the notes — it's a decision, not an automatic change.
- Do not run the server. This is static analysis of the installed
  types plus the docs.

## Verify

The notes file exists, has all four plugin sections, and answers all
six numbered points per plugin. The "Decisions" section has at least
the four decision entries (D-00-1 through D-00-4).
