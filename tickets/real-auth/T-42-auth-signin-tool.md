# T-42 — `auth_signin` tool (password / backup-code / magic-link)

- **Difficulty:** 🟡 medium
- **Type:** Bootstrap tool
- **Dependencies:** T-41 (elicitation pattern + pending-login handoff established)
- **Output:** `src/tools/auth/signin.ts`, re-exported from `src/tools/auth/index.ts`

## Goal

The MCP tool an unauthenticated LLM calls to log into an existing
account. Supports three credential paths:

- **password** — `auth.api.signInEmail({ body: { email, password } })`
- **backup code** — delegates to T-43 (`auth_recover`); but if the
  user knows they're recovering, they should call `auth_recover`
  directly. `auth_signin` with a backup code is a convenience alias.
- **magic link** — used *after* the user has clicked the link in
  their email (the link delivers a token); the tool calls
  `auth.api.magicLink.verify({ body: { token } })`.

## Context (read before starting)

- `[C-PA]`, `[C-ELICIT]`, `[C-PL]` in `STUDY_FIRST.md`.
- T-41's `AuthSignupHandler` — same elicitation skeleton, same
  pending-login `cookieHeaders` contract.
- T-00's notes — exact `signInEmail`, `magicLink.verify` shapes.

## Scope

### 1. `src/tools/auth/signin.ts`

```ts
import z from 'zod';
import { inputRequired, acceptedContent, inputResponse, type InputRequiredResult, type CallToolResult } from '@modelcontextprotocol/server';
import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';
import { createPendingLogin } from '../../shared/pendingLogin.js';

const KEY = 'signin';

const signinSchema = z.object({
  identifier: z.string().describe('Email or username. For passkey-only accounts, use the synthetic email returned at signup or any identifier the server accepts.'),
  password: z.string().optional().describe('Required for password accounts.'),
  magicLinkToken: z.string().optional().describe('Required for magic-link accounts; the token from the link the user clicked.'),
  credentialType: z.enum(['password', 'magiclink']).describe('Which credential to use. For backup-code recovery, use auth_recover instead.'),
}).describe('Sign in to an existing MCP account. For password accounts, supply identifier+password. For magic-link, supply identifier+magicLinkToken (after the user clicked the link).');

export class AuthSigninHandler extends AuthToolHandler {
  static readonly authSurface = 'bootstrap' as const;

  async register(): Promise<void> {
    this.registerTool('auth_signin', {
      title: 'Sign in',
      description: 'Sign in to an existing MCP account. Uses elicitation. Returns a loginNonce; retry your original request.',
      inputSchema: signinSchema,
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: false }
    }, async () => this.handleSignin());
  }

  private async handleSignin(): Promise<CallToolResult | InputRequiredResult> {
    const auth = getAuth();
    const existing = acceptedContent(this.context.inputResponses, KEY, signinSchema);
    if (!existing) {
      return inputRequired({ inputRequests: { [KEY]: inputRequired.elicit({
        message: 'Please provide sign-in details.',
        requestedSchema: signinSchema,
      }) } });
    }
    const view = inputResponse(this.context.inputResponses, KEY);
    if (view.kind === 'elicit' && view.action !== 'accept') {
      return this.text(`Sign-in declined (action=${view.action}).`);
    }

    // Validate credential-specific requirements.
    if (existing.credentialType === 'password' && !existing.password) {
      return this.text('password is required when credentialType=password.', true);
    }
    if (existing.credentialType === 'magiclink' && !existing.magicLinkToken) {
      return this.text('magicLinkToken is required when credentialType=magiclink.', true);
    }

    // Server-side sign-in.
    let userId: string;
    let setCookieHeaders: string[];

    if (existing.credentialType === 'password') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (auth.api as any).signInEmail({
        body: { email: existing.identifier, password: existing.password },
        asResponse: true
      });
      if (res.status !== 200) return this.text(`Sign-in failed: ${res.status}`, true);
      setCookieHeaders = res.headers.getSetCookie();
      // Extract userId from the session or from a getSession call.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = await (auth.api as any).getSession({ headers: new Headers({ cookie: setCookieHeaders.join('; ') }) });
      userId = session?.user?.id;
    } else {
      // magiclink
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (auth.api as any).magicLink.verify({
        body: { token: existing.magicLinkToken },
        asResponse: true
      });
      if (res.status !== 200) return this.text(`Magic-link verification failed: ${res.status}`, true);
      setCookieHeaders = res.headers.getSetCookie();
      // Extract userId from the resulting session.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = await (auth.api as any).getSession({ headers: new Headers({ cookie: setCookieHeaders.join('; ') }) });
      userId = session?.user?.id;
    }

    if (!userId) return this.text('Sign-in succeeded but userId could not be extracted from the session.', true);

    // Pending-login handoff (same as T-41).
    const pending = createPendingLogin(userId);
    pending.cookieHeaders = setCookieHeaders;

    return this.text(JSON.stringify({
      status: 'signed_in',
      userId,
      loginNonce: pending.nonce,
      nextStep: 'Retry your original request.'
    }, null, 2));
  }

  private text(t: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text: t }], isError };
  }
}
```

### 2. Pending-login handoff

Identical to T-41's: stash `cookieHeaders` on the
`PendingLogin` entry so T-22's `/sign-in` route can re-emit them.
No need to store `sessionId` separately — the route only checks
`cookieHeaders?.length`.

### 3. Magic-link flow

The magic-link path requires the user to have received the link
*before* calling `auth_signin` (the link is sent by the
`auth_signup` tool's magiclink branch, or by a future
`auth_send_magic_link` tool not in this plan). The user clicks the
link, which contains a token; the LLM extracts the token and passes
it to `auth_signin` via elicitation. The tool calls
`magicLink.verify` and establishes the session.

This is the one path where the LLM needs human cooperation (the user
must click the link and paste the token). Document it clearly in the
tool's `description`.

### 4. Backup-code recovery

`auth_signin` does **not** support backup codes directly. The user
who needs to recover calls `auth_recover` (T-43) instead. This
separation keeps `auth_signin`'s schema simple.

## Contract this ticket honors / establishes

- Honors `[C-PA]`, `[C-ELICIT]`, `[C-PL]`.
- Reuses the T-41 elicitation pattern and pending-login handoff.

## Do not do

- Do not implement backup-code verification — T-43 owns it.
- Do not implement passkey sign-in via this tool. Passkey sign-in
  happens at the WebAuthn level (the client's authenticator), not
  via a tool call. For an account whose only credential is a
  passkey, the user signs in via the standard OAuth flow's
  `/sign-in` page (which better-auth renders), not via `auth_signin`.
  Document this in the tool's description.
- Do not log the password or magic-link token. The `description`
  warns the LLM not to echo them in chain logs.

## Verify

- `npm run build` passes.
- Manual real-mode smoke: create a user via `auth_signup` (T-41),
  then call `auth_signin` from a fresh (unauthenticated) LLM session
  with the same credentials → `loginNonce` returned → retry Excel
  call → succeeds with the user's session.
- Wrong password → tool returns an error text, no session created,
  no pending-login entry.
- Magic-link path: trigger a magic-link send (via `auth_signup`'s
  magiclink branch), grab the token from the mailer log (default
  `consoleMailer`), call `auth_signin` with the token → succeeds.
