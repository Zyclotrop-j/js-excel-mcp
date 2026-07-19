# T-43 — `auth_recover` tool (backup-code recovery flow)

- **Difficulty:** 🟡 medium
- **Type:** Bootstrap tool
- **Dependencies:** T-41 (elicitation pattern), T-00 (backup-code
  verification API name)
- **Output:** `src/tools/auth/recover.ts`, re-exported from
  `src/tools/auth/index.ts`

## Goal

The MCP tool an unauthenticated LLM calls when a user has lost
their password / passkey / API key and needs to recover access via
a backup code. The tool verifies the backup code server-side,
establishes a recovery session, and returns a `loginNonce` like
the other auth tools. The user (via the LLM) can then call
`auth_add_passkey` (T-51) or `auth_rotate_apikey` (T-52) to
re-establish a usable long-lived credential.

## Context (read before starting)

- `[C-PA]`, `[C-ELICIT]`, `[C-PL]`, `[C-RECOVER]` in `STUDY_FIRST.md`.
- T-41's elicitation pattern and pending-login handoff.
- T-00's notes — the exact API call to verify a backup code
  (likely `auth.api.twoFactor.verifyBackupCode` or similar; T-00
  records it).

## Scope

### 1. `src/tools/auth/recover.ts`

```ts
import z from 'zod';
import { inputRequired, acceptedContent, inputResponse, type InputRequiredResult, type CallToolResult } from '@modelcontextprotocol/server';
import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';
import { createPendingLogin } from '../../shared/pendingLogin.js';

const KEY = 'recover';

const recoverSchema = z.object({
  identifier: z.string().describe('Email or username of the account to recover. For passkey-only accounts with no email, use the synthetic email returned at signup.'),
  backupCode: z.string().length(8).describe('A single backup code from the set issued at signup. Case-insensitive.'),
}).describe('Recover access to an MCP account using a backup code. After recovery, call auth_add_passkey or auth_rotate_apikey to set up a new long-lived credential. Each backup code is single-use.');

export class AuthRecoverHandler extends AuthToolHandler {
  static readonly authSurface = 'bootstrap' as const;

  async register(): Promise<void> {
    this.registerTool('auth_recover', {
      title: 'Recover account',
      description: 'Recover access to an MCP account using a backup code. Returns a loginNonce; retry your original request. After recovery, set up a new credential via auth_add_passkey or auth_rotate_apikey.',
      inputSchema: recoverSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false, readOnlyHint: false }
    }, async () => this.handleRecover());
  }

  private async handleRecover(): Promise<CallToolResult | InputRequiredResult> {
    const auth = getAuth();
    const existing = acceptedContent(this.context.inputResponses, KEY, recoverSchema);
    if (!existing) {
      return inputRequired({ inputRequests: { [KEY]: inputRequired.elicit({
        message: 'Please provide the account identifier and one backup code.',
        requestedSchema: recoverSchema,
      }) } });
    }
    const view = inputResponse(this.context.inputResponses, KEY);
    if (view.kind === 'elicit' && view.action !== 'accept') {
      return this.text(`Recovery declined (action=${view.action}).`);
    }

    // Server-side backup-code verification.
    // T-00 confirms the exact API. Likely:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verifyRes = await (auth.api as any).twoFactor.verifyBackupCode?.({
      body: { identifier: existing.identifier, code: existing.backupCode.toUpperCase() }
    });
    if (!verifyRes || !verifyRes.userId || verifyRes.status === 'error') {
      return this.text('Invalid backup code or unknown identifier.', true);
    }

    // Establish a recovery session. The backup-code verify call may
    // already establish one (return Set-Cookie headers); if not, we
    // need a server-side "log in as this user" call. Confirm with T-00
    // which pattern the installed version uses.
    let setCookieHeaders: string[];
    if (verifyRes.headers?.getSetCookie) {
      setCookieHeaders = verifyRes.headers.getSetCookie();
    } else {
      // Fall back to a server-side session creation. The exact call
      // depends on better-auth's internal API — T-00 records whether
      // there's a "createSessionForUser" or similar. As a last resort,
      // sign in using the recovered user's userId via a privileged
      // admin API. (We do NOT enable the admin plugin by default, so
      // this branch should ideally not fire — T-00 must confirm the
      // backup-code verify call returns Set-Cookie.)
      return this.text('Backup-code verification succeeded but no session was established. T-00 needs to confirm the API surface for recovery-session creation.', true);
    }

    const userId = verifyRes.userId;
    const pending = createPendingLogin(userId);
    pending.cookieHeaders = setCookieHeaders;
    pending.sessionId = verifyRes.sessionId;

    return this.text(JSON.stringify({
      status: 'recovered',
      userId,
      loginNonce: pending.nonce,
      nextStep: 'Retry your original request. Then call auth_add_passkey or auth_rotate_apikey to set up a new long-lived credential.'
    }, null, 2));
  }

  private text(t: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text: t }], isError };
  }
}
```

### 2. Backup-code semantics

- Codes are **single-use**. better-auth's plugin marks a code as
  consumed on successful verification; a second attempt with the
  same code fails.
- Codes are **case-insensitive** — normalize to upper case before
  sending to better-auth.
- The tool's `description` warns the LLM not to retry the same code
  if the first attempt failed for a non-credential reason (e.g. a
  network blip between verify and session-creation — the code may
  still have been consumed).

### 3. Recovery-session creation (the open question)

T-00 must confirm whether `verifyBackupCode` returns a session
(`Set-Cookie` headers) or only validates the code. If only
validates, this ticket needs a follow-up server-side call to create
a session for the recovered user. The cleanest path is:

- The `twoFactor` plugin's backup-code verify is a "step" in a
  multi-step authentication flow that ends with a session. If the
  installed version does that, capture the cookies from the final
  response.
- If the installed version only validates, the recovery flow must
  go through a "set new password" or "add new passkey" sub-step
  that *does* establish a session. In that case, `auth_recover`'s
  schema must be extended with `newPassword` and the tool calls
  `auth.api.twoFactor.enableBackupCodes` or similar after
  verification.

**Record the answer in T-00's notes** and implement accordingly.
If T-00 is inconclusive, fall back to the schema-with-`newPassword`
shape and document the assumption.

### 4. Post-recovery follow-ups

The `nextStep` message directs the LLM to T-51 (`auth_add_passkey`)
and T-52 (`auth_rotate_apikey`). Those tools are authenticated
(they live on `/mcp`), so the LLM must first retry its original
request — the OAuth flow completes via the recovery session, and
then the LLM can call `auth_add_passkey` / `auth_rotate_apikey` on
the authenticated endpoint.

## Contract this ticket honors / establishes

- Honors `[C-PA]`, `[C-ELICIT]`, `[C-PL]`, `[C-RECOVER]`.
- Reuses T-41's elicitation pattern and pending-login handoff.

## Do not do

- Do not implement `auth_add_passkey` or `auth_rotate_apikey` —
  T-51 / T-52 own them.
- Do not store backup codes anywhere; they're single-use and
  consumed by better-auth.
- Do not allow recovery for a user with no backup codes on file
  (better-auth will reject; surface the error).

## Verify

- `npm run build` passes.
- Manual real-mode smoke:
  1. Sign up via T-41; record the backup codes.
  2. From a fresh LLM session, call `auth_recover` with the
     identifier and one backup code.
  3. Verify the tool returns `{ status: 'recovered', loginNonce }`.
  4. Retry an Excel tool call → succeeds with the recovered user's
     session.
  5. Re-use the same backup code → fails (single-use enforced).
- Recovery with an unknown identifier → tool returns the
  "Invalid backup code or unknown identifier" error (don't leak
  which).
