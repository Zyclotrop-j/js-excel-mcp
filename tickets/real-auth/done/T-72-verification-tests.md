# T-72 — E2E verification: demo unchanged, real-mode bootstrap + recovery

- **Difficulty:** 🔴 hard
- **Type:** Verification
- **Dependencies:** T-41, T-42, T-43 (bootstrap tools), T-50, T-51,
  T-52 (authenticated tools), T-22 (handoff), T-30 (verifier)
- **Output:** Test files under `test/` (likely `test/real-auth/`)
  gated on `MCP_AUTH_MODE=real`; updates to `test/run.ts` /
  `test/run-integration.ts` to include them when the env is set.

## Goal

Prove the real-mode plan works end-to-end and that demo mode is
unaffected. Tests are gated so they only run when
`MCP_AUTH_MODE=real` is set; CI in demo mode skips them. A
real-mode CI job can be added separately.

## Context (read before starting)

- `test/run.ts`, `test/run-integration.ts`, `test/run-e2e.ts` —
  the project's test runners (all use `tsx` directly with
  `baretest`).
- `examples/oauth/` — the existing demo client that drives the
  OAuth dance headlessly. Real-mode tests can reuse much of its
  plumbing.
- `package.json` scripts — `npm test`, `npm run test:e2e`, etc.

## Scope

### 1. Demo-mode regression suite (always runs)

A test file `test/real-auth/demo-regression.test.ts` that:

- Starts the server with no `MCP_AUTH_MODE` (demo).
- Runs the existing demo OAuth dance via a small client.
- Asserts the `/sign-in` auto-login still works, the consent
  fast-path still triggers (when `autoConsent=1`), and the Excel
  tools respond after the bearer is obtained.
- Asserts `/mcp/bootstrap` is reachable but lists zero tools (or
  lists the auth tools, but they're no-ops in demo mode — depends
  on whether T-40 gates them by mode; check the T-40 ticket).

This guards against accidental demo regressions from any of the
earlier tickets.

### 2. Real-mode signup → Excel suite (gated)

`test/real-auth/signup-to-excel.test.ts`:

- Skips with `if (process.env.MCP_AUTH_MODE !== 'real') return;`
  at the top of every test (or use a `describe.skip` based on a
  helper).
- Starts the server with `MCP_AUTH_MODE=real` and a test
  `AUTH_SECRET`.
- Drives a mock MCP client (reuse `examples/oauth/client.ts`
  patterns) through:
  1. Connect to `/mcp/bootstrap`.
  2. Call `auth_signup` → elicit schema returned.
  3. Respond with `{ name: 'Test', email: 'test@example.com',
     credentialType: 'password', password: '...' }`.
  4. Receive `{ loginNonce, backupCodes }`.
  5. Retry a stub Excel tool call against `/mcp` → client SDK
     drives OAuth → `/sign-in` finds the pending login → cookies
     re-emitted → consent screen — the test auto-approves (the
     mock client can hit the consent endpoint directly).
  6. Excel tool call succeeds with the bearer.
  7. Assert the user row exists in `data/_auth_real.db`.
  8. Assert the backup-code row exists.
- After: delete `data/_auth_real.db` so the next test run starts
  fresh.

### 3. Real-mode signin suite (gated)

`test/real-auth/signin.test.ts`:

- Prerequisite: a user exists (created by the signup test or by a
  fixture).
- Calls `auth_signin` with the known credentials.
- Asserts the session is established, the bearer works on `/mcp`.

### 4. Real-mode recovery suite (gated)

`test/real-auth/recover.test.ts`:

- Prerequisite: a user with known backup codes.
- Calls `auth_recover` with the identifier and one backup code.
- Asserts the recovery session is established.
- Asserts the backup code is consumed (a second recovery with the
  same code fails).
- Calls `auth_rotate_apikey` to issue a new API key.
- Uses the API key as bearer on a fresh session → Excel tool
  succeeds.
- Calls `auth_rotate_apikey` with `action='rotate'` → new key
  issued; old key 401s.

### 5. Real-mode passkey suite (gated, optional)

`test/real-auth/passkey.test.ts`:

- Requires a virtual authenticator (e.g. the
  `virtual-authenticator` package or a hand-rolled mock that
  produces valid WebAuthn attestation responses).
- Calls `auth_add_passkey` → challenge → mock attestation →
  "Passkey added."
- Asserts the passkey row exists.
- Sign out, then complete a real OAuth flow that uses the passkey
  (the test client must produce valid WebAuthn assertion
  responses — same virtual authenticator).
- Mark this test as `skip` if no virtual authenticator is available
  in CI; document the dependency.

### 6. Wire into the test runners

- `test/run.ts` (unit): include `test/real-auth/demo-regression.test.ts`
  (always).
- `test/run-integration.ts` (integration): include the gated real-mode
  tests. The runner should skip files when `MCP_AUTH_MODE !== 'real'`.
  Pattern: each gated file self-skips; the runner just imports them.
- `package.json` — add a script:
  ```json
  "test:real-auth": "cross-env MCP_AUTH_MODE=real AUTH_SECRET=test-secret MCP_AUTH_CORS_ORIGINS=http://localhost:3000 tsx test/run-integration.ts"
  ```
  (`cross-env` may need to be added as a devDep; alternatively use a
  PowerShell-friendly wrapper — check what the existing scripts do on
  Windows.)

### 7. CI considerations

- Demo CI (existing): runs `npm test` — unchanged, real-mode files
  self-skip.
- Real CI (new, optional in this ticket): runs
  `npm run test:real-auth`. Out of scope to wire into a specific CI
  provider; just make the script available.

## Contract this ticket honors

- Honors all the `[C-*]` contracts by exercising them end-to-end.

## Do not do

- Do not modify production source to make tests pass. If a test
  fails, the bug is in the implementation ticket that owns the
  behavior — file a follow-up.
- Do not commit a `data/_auth_real.db` with test users. The tests
  create their own.
- Do not run real-mode tests in the demo CI job (they'd fail on
  missing env).

## Verify

- `npm test` (default, demo) → all existing tests pass +
  `demo-regression.test.ts` passes.
- `npm run test:real-auth` → all real-mode tests pass against a
  fresh `data/_auth_real.db`.
- Both can run back-to-back without state bleed (delete the DB
  between them).
