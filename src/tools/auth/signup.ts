/**
 * `auth_signup` — the public, unauthenticated signup tool mounted on
 * `/mcp/bootstrap`. The LLM-facing entry point for creating a new MCP
 * account. Takes the signup form (`name`, `email`, `credentialType`,
 * `password`) as tool arguments (validated by the zod `inputSchema`
 * before the callback fires — no elicitation round-trip), calls
 * better-auth server-side, captures the session cookies, stashes them
 * in the pending-login store (T-11), and returns a `loginNonce` the
 * LLM can report back after retrying its original (Excel) tool call.
 *
 * ## Tool arguments (no elicitation)
 *
 * Per the architecture decision in
 * `tickets/real-auth/notes/arch-decision-elicitation-blocker.md`,
 * elicitation is not available in the installed SDK's per-request
 * legacy serving mode (the capability gate fails on per-request
 * `McpServer` instances — `this._clientCapabilities` is never populated
 * because the `initialize` handshake happens on the transport layer,
 * not per request). The fix: take all inputs as `inputSchema` tool
 * arguments. The LLM collects them from its conversation with the user
 * and passes them in a single `tools/call`. Zod validates before the
 * callback fires; there is no `inputRequired` round-trip.
 *
 * The `inputSchema` is the same shape that previously lived in
 * `inputRequired.elicit({ requestedSchema })` — schema shape is
 * unchanged, only the plumbing differs.
 *
 * ## Credential-type branches
 *
 * - **`password`**: `signUpEmail` → `signInEmail({ asResponse: true })`
 *   → `enableTwoFactor` (with the captured session cookie) →
 *   `createPendingLogin` (mutating `cookieHeaders` and `sessionId` on
 *   the returned reference per the T-11 mutation pattern) → return
 *   `{ loginNonce, backupCodes, nextStep }`. The user can later
 *   authenticate with the same email+password.
 * - **`passkey`**: no email/password from the user. Create the account
 *   with a **synthetic** email (`{uuid}@local.invalid`) and a
 *   **throwaway** password (`crypto.randomUUID()` × 2 — used once, never
 *   persisted). The synthetic email keeps `signUpEmail` happy (it
 *   requires a valid email at the body-schema level even when the column
 *   is nullable per the `emailOptionalPlugin`). The throwaway
 *   password is the only credential available at signup time; the
 *   actual passkey ceremony lands in T-51's `auth_add_passkey`, which
 *   runs under the just-established session. The user never sees the
 *   throwaway — it is generated, used once, and discarded. The
 *   architect's note on T-41 §3.2 describes the same path.
 * - **`magiclink`**: `signInMagicLink` (which signs the user up because
 *   `disableSignUp: false` per `auth.ts:313`). The session is NOT
 *   established server-side — the user has to click the link in their
 *   email first. The tool returns a "check your email" message; the
 *   LLM is expected to call `auth_signin` (T-42) after the user
 *   confirms the click.
 *
 * ## Backup codes
 *
 * `enableTwoFactor` returns `{ totpURI, backupCodes }`. The `totpURI`
 * is computed but ignored — the user has no authenticator app at this
 * point. The `backupCodes` array is what `auth_recover` (T-43) needs to
 * log the user in if they lose access. Codes are shown ONCE in the
 * tool result (per `[C-RECOVER]`); they are never logged.
 *
 * ## Cookie handoff (T-22 contract)
 *
 * After `signInEmail({ asResponse: true })`, the response headers carry
 * the `Set-Cookie` for the session. We capture them via
 * `signInResponse.headers.getSetCookie()`, build a fresh
 * `PendingLogin` via `createPendingLogin(userId)`, mutate
 * `cookieHeaders` and `sessionId` on the returned reference (per
 * `src/shared/pendingLogin.ts:55-58`), and return the `nonce`. T-22's
 * `realSignInHandler` consumes the nonce (or polls
 * `peekMostRecentPendingLogin`) and re-emits the cookies on the
 * `/sign-in` response so the OAuth dance can complete.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';

import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';
import { createPendingLogin } from '../../shared/pendingLogin.js';

// -- Signup input schema (matches T-02 §3.4 / Correction 4) -----------------
//
// - `name` is required for ALL credential types.
// - `email` is required for password + magiclink; passkey-only accounts
//   may omit it. better-auth's `signUpEmail` body still REQUIRES a
//   valid-looking email at the body-schema level (`z.email()`), so the
//   passkey branch synthesises one (see the throwaway-password note in
//   the file header).
// - `password` is required for `password`; passkey accounts do not
//   collect one from the user (the server generates a throwaway).
//
// This schema is wired as the tool's `inputSchema`. Zod validation runs
// in the SDK BEFORE the callback fires, so by the time `handleSignup`
// receives `arg` it is already typed as `SignupInput` — no elicitation
// round-trip, no `acceptedContent` retry.
const signupSchema = z.object({
    name: z.string().min(1).describe('Display name for the new account.'),
    email: z.string().email().optional().describe('Required for password and magic-link accounts; optional for passkey-only.'),
    credentialType: z.enum(['password', 'passkey', 'magiclink'])
        .describe('How the user will authenticate. "passkey" requires a WebAuthn-capable client (see auth_add_passkey, T-51).'),
    password: z.string().min(12).optional()
        .describe('Required when credentialType=password. Minimum 12 characters.'),
});

type SignupInput = z.infer<typeof signupSchema>;

// -- Auth plugin method helpers (structural cast; mirrors auth.ts:267-283) -

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthApi = Record<string, any>;

function signUpEmail(api: AuthApi, body: Record<string, unknown>) {
    return api.signUpEmail({ body });
}

function signInEmail(api: AuthApi, body: Record<string, unknown>) {
    return api.signInEmail({ body, asResponse: true }) as Promise<Response>;
}

function enableTwoFactor(api: AuthApi, body: Record<string, unknown>, headers: Headers) {
    return api.enableTwoFactor({ body, headers });
}

function signInMagicLink(api: AuthApi, body: Record<string, unknown>, headers?: Headers) {
    return api.signInMagicLink({ body, headers }) as Promise<{ status: boolean } | undefined>;
}

/**
 * Build a `Cookie:` header from a list of `Set-Cookie` strings. Each
 * `Set-Cookie` is `name=value; Path=...; HttpOnly; ...` — we keep only
 * the first `name=value` pair and join with `'; '`. Used to construct
 * the headers for the follow-up `enableTwoFactor` call.
 */
function buildCookieHeader(setCookieHeaders: string[]): string {
    return setCookieHeaders
        .map(c => c.split(';', 1)[0]?.trim() ?? '')
        .filter(pair => pair.length > 0)
        .join('; ');
}

export class AuthSignupHandler extends AuthToolHandler {
    static readonly authSurface = 'bootstrap' as const;

    async register(_allTools: import('../interface.js').ToolHandler[]): Promise<void> {
        // The `description` carries the security-critical instructions for
        // backup-code handling and the chain_operations restriction. The
        // chain handler no longer rejects this tool (with elicitation
        // removed, the tool no longer returns `InputRequiredResult` —
        // `handleChain.ts:120-127` only fires for sampling-required
        // tools now). The "not chainable" guidance is by convention:
        // the tool has auth side-effects (creates a user row,
        // establishes a session) so the LLM should call it directly.
        this.registerTool(
            'auth_signup',
            {
                title: 'Sign up',
                description:
                    'Sign up a new MCP account. Collects the signup form as tool arguments — ' +
                    '`name` (required, display name), `email` (required for password and magic-link ' +
                    'accounts, optional for passkey-only), `credentialType` (one of "password" | ' +
                    '"passkey" | "magiclink"), and `password` (required when credentialType=password, ' +
                    'min 12 characters). The LLM should collect these from the user in conversation ' +
                    'before calling. Returns { loginNonce, backupCodes, userId, nextStep } on ' +
                    'success.\n\n' +
                    '**Backup codes:** shown ONCE in the tool result. Relay them to the user ' +
                    'immediately and instruct the user to store them securely. NEVER log backup ' +
                    'codes in chain_operations or any other tool-call record. The codes are the ' +
                    'user\'s only recovery path if they lose access (used by auth_recover).\n\n' +
                    '**Retry after success:** the LLM must retry the original Excel tool call ' +
                    'that failed with a 401. The client completes the OAuth authorization-code ' +
                    'flow against /mcp and reconnects automatically; the server emits the captured ' +
                    'session cookies via the /sign-in handoff.\n\n' +
                    '**Not chainable:** this tool has auth side-effects (creates a user, ' +
                    'establishes a session) and should be invoked directly — not via ' +
                    'chain_operations.',
                inputSchema: signupSchema,
                annotations: {
                    destructiveHint: false,
                    idempotentHint: false,
                    openWorldHint: false,
                    readOnlyHint: false
                }
            },
            async (arg) => {
                return this.handleSignup(arg as SignupInput);
            }
        );
    }

    private async handleSignup(
        input: SignupInput
    ): Promise<CallToolResult> {
        // -- 0. Public-signup gate -----------------------------------------
        // The ticket (§5) requires honouring `authConfig.allowUserSignup`
        // before proceeding. `server.ts` threads `authConfig` through
        // `ServerOptions` (the extension lives in `tools/interface.ts`).
        if (this.serverOptions.authConfig && this.serverOptions.authConfig.allowUserSignup === false) {
            return this.textResult('Public signup is disabled on this server.', true);
        }

        // -- 1. Cross-field validation (schema can't express these) -------
        if (input.credentialType === 'password' && !input.password) {
            return this.textResult('password is required when credentialType=password.', true);
        }
        if ((input.credentialType === 'magiclink' || input.credentialType === 'password') && !input.email) {
            return this.textResult('email is required when credentialType=password or magiclink.', true);
        }

        // -- 2. Branch on credentialType -----------------------------------
        const auth = getAuth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = auth.api as any;

        if (input.credentialType === 'magiclink') {
            return await this.handleMagicLink(api, input.email!);
        }
        if (input.credentialType === 'passkey') {
            // Synthetic email + throwaway password. The user never sees
            // either. The real credential (passkey) is attached later via
            // `auth_add_passkey` (T-51) under the just-established session.
            const syntheticEmail = input.email ?? `${randomUUID()}@local.invalid`;
            const throwaway = `${randomUUID()}${randomUUID()}`;
            return await this.handleAccountCreation(api, {
                name: input.name,
                email: syntheticEmail,
                password: throwaway
            });
        }
        // credentialType === 'password'
        return await this.handleAccountCreation(api, {
            name: input.name,
            email: input.email!,
            password: input.password!
        });
    }

    /**
     * Magic-link path: trigger the email send, no server-side session is
     * established. The user must click the link, then call `auth_signin`
     * (T-42) to complete the flow. Backup codes are NOT generated here
     * because there's no session to attach them to.
     */
    private async handleMagicLink(api: AuthApi, email: string): Promise<CallToolResult> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await signInMagicLink(api, { email, disableSignUp: false } as any);
        const status = result?.status ?? true;
        return this.textResult(
            JSON.stringify(
                {
                    status: status ? 'magic_link_sent' : 'magic_link_failed',
                    email,
                    nextStep: 'Check your email and click the magic link. Then call auth_signin to establish a session.'
                },
                null,
                2
            )
        );
    }

    /**
     * Password / passkey-bootstrap path: create the user, sign in to
     * establish a real session, generate backup codes, stash the
     * cookies in the pending-login store, return the `loginNonce`.
     */
    private async handleAccountCreation(
        api: AuthApi,
        credentials: { name: string; email: string; password: string }
    ): Promise<CallToolResult> {
        // 4a. Create the user row. `signUpEmail` requires a valid-looking
        // email at the body-schema level; for passkey-bootstrap we pass
        // the synthetic one (see handleSignup).
        const signUpResult = await signUpEmail(api, {
            name: credentials.name,
            email: credentials.email,
            password: credentials.password
        });
        const userId: string | undefined =
            signUpResult?.user?.id ?? signUpResult?.userId;
        if (!userId) {
            return this.textResult('signUpEmail did not return a user id.', true);
        }

        // 4b. Sign in to establish a real session. `asResponse: true`
        // returns a Response object so we can read the Set-Cookie headers
        // (the cookie handoff contract with T-22).
        const signInResponse = await signInEmail(api, {
            email: credentials.email,
            password: credentials.password
        });
        const setCookieHeaders = signInResponse.headers.getSetCookie();
        if (setCookieHeaders.length === 0) {
            return this.textResult('signInEmail did not return Set-Cookie headers; cannot complete cookie handoff.', true);
        }

        // 4c. Generate backup codes. `enableTwoFactor` is the only entry
        // point that returns the plaintext codes (per T-00 §3). It
        // requires a session — we attach the captured cookie via the
        // `headers` argument. `allowPasswordless: true` means the body
        // schema permits an empty `password`, but we pass the user's
        // password (or the throwaway for passkey) to satisfy any
        // pre-enable password-validation check.
        const cookieHeader = buildCookieHeader(setCookieHeaders);
        const sessionHeaders = new Headers();
        sessionHeaders.set('Cookie', cookieHeader);
        const enableResult = await enableTwoFactor(
            api,
            { password: credentials.password },
            sessionHeaders
        );
        const backupCodes: string[] | undefined = enableResult?.backupCodes;

        // 4d. Stash cookies + return the nonce. The mutation pattern is
        // the contract with T-22 — `createPendingLogin` returns the same
        // reference stored in the module-level Map (per
        // `src/shared/pendingLogin.ts:55-69`).
        const pending = createPendingLogin(userId);
        pending.cookieHeaders = setCookieHeaders;
        // Extract the session id from the cookie if feasible; T-22 only
        // checks `cookieHeaders?.length`, so leaving this undefined is
        // safe (it just means `peekMostRecentPendingLogin` won't match
        // until `sessionId` is set on a follow-up write — but
        // `cookieHeaders` is set, so the query-param fast path in T-22
        // works regardless).
        const sessionCookie = setCookieHeaders
            .map(c => c.split(';', 1)[0] ?? '')
            .find(pair => pair.startsWith('better-auth.session_token='));
        if (sessionCookie) {
            const sessionToken = sessionCookie.slice('better-auth.session_token='.length);
            if (sessionToken) pending.sessionId = sessionToken;
        }

        return this.textResult(
            JSON.stringify(
                {
                    status: 'signed_up',
                    userId,
                    loginNonce: pending.nonce,
                    backupCodes,
                    nextStep:
                        'Backup codes are shown ONCE — relay them to the user immediately and ' +
                        'instruct the user to store them securely. ' +
                        'Then retry the original request. The client will complete the OAuth flow.'
                },
                null,
                2
            )
        );
    }

    private textResult(text: string, isError = false): CallToolResult {
        return { content: [{ type: 'text', text }], isError };
    }
}

/**
 * Test-only export. Exposed so future tests can inspect the signup
 * schema / handler behaviour without re-importing zod. Not part of
 * the public API; the import path is internal.
 *
 * @internal
 */
export const __test__signupSchema = signupSchema;
