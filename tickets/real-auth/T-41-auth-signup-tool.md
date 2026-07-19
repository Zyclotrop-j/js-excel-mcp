# T-41 — `auth_signup` tool with elicitation + pending-login handoff

- **Difficulty:** 🔴 hard
- **Type:** Bootstrap tool
- **Dependencies:** T-40 (bootstrap endpoint), T-22 (pending-login
  `/sign-in`), T-00 (plugin APIs), T-01 (elicitation support), T-02
  (email-optional decision)
- **Output:** `src/tools/auth/signup.ts`, re-exported from
  `src/tools/auth/index.ts`
- **Blocks:** T-42, T-43 (they share the elicitation pattern + the
  pending-login handoff contract)

## Goal

The MCP tool an unauthenticated LLM calls to sign up a new user.
Uses elicitation to collect the user's name, optional email, and
credential type (password / passkey / magic-link). Calls
better-auth's `signUpEmail` (or passkey register / magic-link send)
server-side, then calls `signInEmail` to establish a real session,
captures the `Set-Cookie` headers, stashes them in the pending-login
store, and returns `{ loginNonce, backupCodes, nextStep }` to the
LLM. The LLM retries its original Excel tool call; the client SDK
drives the OAuth dance against `/mcp`; the `/sign-in` route (T-22)
finds the pending login, re-emits the cookies, and the flow
completes.

## Context (read before starting)

- `[C-PA]`, `[C-PL]`, `[C-ELICIT]`, `[C-RECOVER]`, `[C-MAILER]`,
  `[C-EP]` in `STUDY_FIRST.md`.
- `src/tools/handleCells/discovery.ts:365-393` — the existing
  elicitation pattern in this codebase. Mirror it.
- `src/tools/interface.ts` — `ToolHandler.registerTool` and the
  `wrappedCb` plumbing.
- T-22's `cookieHeaders` contract — T-41 MUST populate it on the
  pending-login entry.
- T-00's notes — exact API names: `signUpEmail`, `signInEmail`,
  passkey register/verify, magic-link send/verify, backup-code
  generation.
- T-02's notes — the email-optional snippet; how to call `signUpEmail`
  without an email (or with a synthetic one).

## Scope

### 1. `src/tools/auth/baseAuthTool.ts`

Created in T-40. If T-40 hasn't landed yet, create it now as part of
this ticket (T-40's ticket says it creates the scaffold; in practice
T-41 is the first to use it, so co-create if needed):

```ts
import { ToolHandler } from '../interface.js';
export abstract class AuthToolHandler extends ToolHandler {
  static readonly authSurface: 'bootstrap' | 'authenticated';
}
```

### 2. `src/tools/auth/signup.ts`

```ts
import z from 'zod';
import { inputRequired, acceptedContent, inputResponse, type InputRequiredResult, type CallToolResult } from '@modelcontextprotocol/server';
import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';
import { createPendingLogin } from '../../shared/pendingLogin.js';

const KEY = 'signup';
const MAX_RETRIES = 3;

const signupSchema = z.object({
  name: z.string().min(1).describe('Display name for the new account.'),
  email: z.string().email().optional().describe('Optional. Required for magic-link and password accounts; passkey-only accounts may omit.'),
  credentialType: z.enum(['password', 'passkey', 'magiclink']).describe('How the user will authenticate. passkey requires a WebAuthn-capable client.'),
  password: z.string().min(12).optional().describe('Required when credentialType=password. Minimum 12 characters.'),
}).describe('Sign up for an MCP account. Email is optional for passkey-only accounts. After signup, backup codes are returned for account recovery — store them securely.');

export class AuthSignupHandler extends AuthToolHandler {
  static readonly authSurface = 'bootstrap' as const;

  async register(allTools: ToolHandler[]): Promise<void> {
    this.registerTool('auth_signup', {
      title: 'Sign up',
      description: 'Sign up a new MCP account. Uses elicitation to collect signup details. Returns a loginNonce (retry your original request), backup codes (store these), and the user id.',
      inputSchema: signupSchema,
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false, readOnlyHint: false }
    }, async (arg) => {
      return this.handleSignup(arg);
    });
  }

  private async handleSignup(_arg: unknown): Promise<CallToolResult | InputRequiredResult> {
    const auth = getAuth();

    // First round: check for an accepted elicitation response.
    const existing = acceptedContent(this.context.inputResponses, KEY, signupSchema);
    if (!existing) {
      return inputRequired({
        inputRequests: {
          [KEY]: inputRequired.elicit({
            message: 'Please provide signup details. Email is optional for passkey-only accounts.',
            requestedSchema: signupSchema,
          })
        }
      });
    }

    // Detect decline / cancel.
    const view = inputResponse(this.context.inputResponses, KEY);
    if (view.kind === 'elicit' && view.action !== 'accept') {
      return this.textResult(`Signup declined by user (action=${view.action}).`);
    }

    // Validate cross-field rules the schema can't express.
    if (existing.credentialType === 'password' && !existing.password) {
      return this.textResult('password is required when credentialType=password.', true);
    }
    if (existing.credentialType === 'magiclink' && !existing.email) {
      return this.textResult('email is required when credentialType=magiclink.', true);
    }

    // Server-side signup. Branch on credentialType.
    let userId: string;
    let backupCodes: string[] | undefined;

    if (existing.credentialType === 'password') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signUpResult = await (auth.api as any).signUpEmail({
        body: { email: existing.email, password: existing.password, name: existing.name }
      });
      userId = signUpResult?.user?.id ?? signUpResult?.userId;
    } else if (existing.credentialType === 'passkey') {
      // Passkey bootstrap requires either an email/password first or a
      // server-issued challenge the client completes. The simplest
      // LLM-friendly path: create an email-less account (per T-02
      // Strategy A) with a random throwaway password, then issue a
      // passkey registration challenge the LLM's client can complete
      // in a follow-up `auth_add_passkey` call (T-51).
      //
      // For pure passkey bootstrap with no password at all, confirm
      // with T-00 whether `passkey.signUp` exists or whether we must
      // go through `signUpEmail` with a synthetic email.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signUpResult = await (auth.api as any).signUpEmail({
        body: { email: existing.email ?? `${crypto.randomUUID()}@local.invalid`, password: generateRandomPassword(), name: existing.name }
      });
      userId = signUpResult?.user?.id ?? signUpResult?.userId;
      // T-51 (auth_add_passkey) is the follow-up to actually attach a passkey.
    } else {
      // magiclink: send the link via the mailer, return a "check your
      // email" message. The session is NOT yet established — the LLM
      // must call `auth_signin` after the user clicks the link.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (auth.api as any).magicLink.sendMagicLink({ body: { email: existing.email } });
      return this.textResult(`Magic link sent to ${existing.email}. Call auth_signin after the user clicks the link.`);
    }

    // Generate backup codes via twoFactor.backupCodes plugin.
    // T-00 confirms the exact API name — likely:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const backupResult = await (auth.api as any).twoFactor.generateBackupCodes?.({ body: { userId } }) ?? null;
    backupCodes = backupResult?.backupCodes;

    // Establish a real session for the cookie handoff (T-22 contract).
    // For password accounts we can sign in directly. For passkey
    // bootstrap, the throwaway password above lets us sign in here too.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signInResponse = await (auth.api as any).signInEmail({
      body: { email: existing.email ?? `${userId}@local.invalid`, password: /* same throwaway */ ... },
      asResponse: true
    });
    const setCookieHeaders = signInResponse.headers.getSetCookie();

    // Stash in the pending-login store.
    const pending = createPendingLogin(userId);
    pending.sessionId = /* parse from session cookie if feasible, else undefined */;
    pending.cookieHeaders = setCookieHeaders;

    // Return the nonce + backup codes to the LLM.
    return this.textResult(JSON.stringify({
      status: 'signed_up',
      userId,
      loginNonce: pending.nonce,
      backupCodes,
      nextStep: 'Retry your original request. The client will complete the OAuth flow.'
    }, null, 2));
  }

  private textResult(text: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text }], isError };
  }
}

function generateRandomPassword(): string {
  // 32-byte base64url — used only as a throwaway for passkey bootstrap.
  // The user never sees it; the LLM stores nothing.
  return crypto.randomUUID() + crypto.randomUUID();
}
```

### 3. Elicitation retry loop

The above code handles one round trip (request → response → retry
with `inputResponses`). If the client declines, the tool returns
text and the LLM gives up or retries the whole `auth_signup` call.
For invalid input (e.g. missing password), the tool returns an
error text — the LLM is expected to call `auth_signup` again with
corrected args. We do NOT loop the elicitation inside a single
`tools/call` invocation (the SDK doesn't support mid-call re-elicit
loops; each elicitation is one round trip).

Document this in the tool's `description` so the LLM knows to retry.

### 4. Backup-code display

Backup codes are sensitive. The tool result includes them in plain
text — the LLM must relay them to the user out-of-band (or store
them on the user's behalf). The `description` instructs the LLM:

> "After signup, backup codes are returned in the tool result.
> Relay them to the user immediately and instruct the user to store
> them securely. Do not log backup codes in chain_operations or any
> other tool-call record."

### 5. Signup gating

If `authConfig.allowUserSignup === false`, the tool's callback
returns immediately:

```ts
const authConfig = loadAuthConfig(/* or get it from a dep */);
if (!authConfig.allowUserSignup) {
  return this.textResult('Public signup is disabled on this server.', true);
}
```

`authConfig` reaches the tool via the same `serverOptions` plumbing
the Excel tools use (the `ServerOptions` interface on
`ToolHandler`). Extend `ServerOptions` in `interface.ts` with an
optional `authConfig?: AuthConfig` field (T-40 sets up the
constructor call). Avoid making it required so the Excel tools
don't need to know about it.

### 6. Synthetic-email convention (only if T-02 chose Strategy B)

If T-02 picked Strategy B (synthetic emails), the
`{uuid}@local.invalid` pattern above is correct. If T-02 picked
Strategy A (nullable email), `signUpEmail` should accept
`email: null` or `email: undefined` — confirm with T-00 / T-02's
notes and adjust the call shape. The synthetic pattern is the
safer fallback if T-00 was inconclusive.

## Contract this ticket honors / establishes

- Establishes the elicitation pattern used by T-42 and T-43.
- Honors the T-22 `cookieHeaders` contract.
- Honors `[C-PA]`, `[C-ELICIT]`, `[C-PL]`, `[C-RECOVER]`.

## Do not do

- Do not store passwords in the pending-login entry. The throwaway
  password for passkey bootstrap is generated, used once for
  `signInEmail`, and discarded — never persisted.
- Do not log backup codes anywhere except the tool result.
- Do not implement `auth_add_passkey` here — that's T-51. The
  passkey bootstrap path creates the account with a throwaway
  password and returns; T-51 attaches a real passkey later.
- Do not call `signInEmail` with `asResponse: false` — you need
  the `Set-Cookie` headers.

## Verify

- `npm run build` passes.
- Manual real-mode smoke (with T-22 landed):
  1. `MCP_AUTH_MODE=real`, valid env, allowUserSignup=on.
  2. LLM connects to `/mcp/bootstrap`.
  3. LLM calls `auth_signup` with `{ name: 'Test', email:
     'test@example.com', credentialType: 'password', password:
     '...' }`.
  4. Server returns `inputRequired` with the elicit schema.
  5. Client (LLM) responds with the accepted content.
  6. Server: `signUpEmail` → `generateBackupCodes` → `signInEmail`
     (asResponse) → captures cookies → stashes in pending-login.
  7. Server returns `{ status: 'signed_up', userId, loginNonce,
     backupCodes: [...], nextStep }`.
  8. LLM retries an Excel tool call against `/mcp` → 401 → client
     SDK drives OAuth → `/sign-in` finds the pending login →
     cookies re-emitted → consent screen → token issued → Excel
     tool succeeds.
- The user row exists in `data/_auth_real.db`'s `user` table.
- The backup codes (or their hashes) exist in the `backupCode`
  table.
- `MCP_AUTH_ALLOW_USER_SIGNUP=0` → tool returns the disabled
  message without prompting.
