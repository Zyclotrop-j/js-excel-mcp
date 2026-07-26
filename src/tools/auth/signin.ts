/**
 * `auth_signin` — the public, unauthenticated sign-in tool mounted on
 * `/mcp/bootstrap`. The LLM-facing entry point for logging into an
 * existing MCP account. Takes signin credentials as tool arguments
 * (`identifier`, `password`, `backupCode`, `magicLink`), validated by
 * the zod `inputSchema` before the callback fires — no elicitation
 * round-trip (per the architecture decision in
 * `tickets/real-auth/notes/arch-decision-elicitation-blocker.md`).
 *
 * ## Credential paths
 *
 * - **password** — `signInEmail({ asResponse: true })`. If the account
 *   has 2FA enabled (which all accounts created via `auth_signup` do),
 *   `signInEmail` does NOT establish a session — instead it returns
 *   `{ twoFactorRedirect: true }` and sets a `two_factor` cookie. The
 *   tool then calls `verifyBackupCode` with the `two_factor` cookie and
 *   the user's `backupCode` to establish the session. If the account
 *   does NOT have 2FA enabled, `signInEmail` returns the session
 *   directly.
 * - **backup code** — backup codes are a 2FA second factor, not a
 *   standalone credential. `verifyBackupCode` requires a `two_factor`
 *   cookie from a prior `signInEmail` call, which in turn requires the
 *   user's password. Therefore `auth_signin` with `backupCode` but no
 *   `password` is not supported — the user should call `auth_recover`
 *   (T-43) for passwordless recovery. When `backupCode` is provided
 *   alongside `password`, it is used as the 2FA second factor after
 *   `signInEmail` returns the 2FA challenge.
 * - **magic link** — `signInMagicLink({ body: { email } })` sends a
 *   magic-link email. No session is established by this call — the user
 *   must click the link in their email, which triggers `magicLinkVerify`
 *   on the auth server and establishes the session there. The tool
 *   returns `{ status: 'magic_link_sent' }` with no `loginNonce`.
 *
 * ## Cookie handoff (T-22 contract)
 *
 * Same as T-41's pattern: after `signInEmail` (or `verifyBackupCode`)
 * returns `Set-Cookie` headers, `createPendingLogin(userId)` is called
 * and `cookieHeaders` / `sessionId` are mutated on the returned
 * reference. T-22's `realSignInHandler` consumes the nonce and
 * re-emits the cookies on the `/sign-in` response.
 *
 * See `tickets/real-auth/T-42-auth-signin-tool.md` and `[C-PA]`,
 * `[C-PL]`, `[C-ELICIT]` in `STUDY_FIRST.md`.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';

import { AuthToolHandler } from './baseAuthTool';
import { getAuth } from '../../shared/authServer';
import { createPendingLogin, savePendingLogin } from '../../shared/pendingLogin';

// -- Signin input schema ---------------------------------------------------

const signinSchema = z.object({
    identifier: z.string()
        .describe('Email address of the account to sign in to.'),
    password: z.string().optional()
        .describe('Required for password signin. If the account has 2FA enabled (default), ' +
            'also provide backupCode as the second factor.'),
    backupCode: z.string().optional()
        .describe('Backup code for 2FA verification. Must be accompanied by password ' +
            '(it is a second factor, not a standalone credential). ' +
            'For passwordless recovery, use auth_recover instead.'),
    magicLink: z.boolean().default(false)
        .describe('If true, send a magic-link sign-in email. No session is established by this call — ' +
            'the user must click the link in their email. Pass identifier (email) and magicLink: true.'),
}).describe(
    'Sign in to an existing MCP account. Collects signin credentials as tool arguments. ' +
    'For password signin, pass `identifier` (email) and `password`. ' +
    'For backup-code recovery, pass `identifier` and `backupCode` (password is also required — ' +
    'backup codes are a 2FA second factor, not a standalone credential; for passwordless ' +
    'recovery use auth_recover). ' +
    'For magic-link, pass `identifier` and `magicLink: true`. ' +
    'Not chainable (auth side-effects).'
);

type SigninInput = z.infer<typeof signinSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthApi = Record<string, any>;

export class AuthSigninHandler extends AuthToolHandler {
    static readonly authSurface = 'bootstrap' as const;

    async register(_allTools: import('../interface').ToolHandler[]): Promise<void> {
        this.registerTool(
            'auth_signin',
            {
                title: 'Sign in',
                description:
                    'Sign in to an existing MCP account. Collects signin credentials as tool arguments — ' +
                    'For password signin, pass `identifier` (email) and `password`. ' +
                    'For backup-code 2FA, also pass `backupCode` alongside `password`. ' +
                    'For magic-link, pass `identifier` and `magicLink: true`. ' +
                    'Returns { loginNonce, status } on success for password/backup-code paths; ' +
                    'returns { status: "magic_link_sent" } for magic-link (no nonce).\n\n' +
                    '**Security:** NEVER log passwords, backup codes, or session cookies in ' +
                    'chain_operations or any tool-call record. The LLM should relay credentials ' +
                    'from the user without echoing them.\n\n' +
                    '**Not chainable:** this tool has auth side-effects (establishes a session) ' +
                    'and should be invoked directly — not via chain_operations.',
                inputSchema: signinSchema,
                annotations: {
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false,
                    readOnlyHint: false
                }
            },
            async (arg) => {
                return this.handleSignin(arg as SigninInput);
            }
        );
    }

    private async handleSignin(input: SigninInput): Promise<CallToolResult> {
        // -- 1. Cross-field validation (schema can't express these) -------
        if (!input.identifier) {
            return this.textResult('identifier (email) is required.', true);
        }

        if (input.magicLink) {
            if (input.password || input.backupCode) {
                return this.textResult(
                    'When magicLink is true, password and backupCode are not used. ' +
                    'Set magicLink: false for password signin.',
                    true
                );
            }
            return await this.handleMagicLink(input.identifier);
        }

        if (!input.password) {
            return this.textResult(
                'password is required for signin (or set magicLink: true for magic-link signin). ' +
                'For passwordless recovery via backup code, use auth_recover.',
                true
            );
        }

        return await this.handlePasswordSignin(
            input.identifier,
            input.password,
            input.backupCode
        );
    }

    /**
     * Magic-link path: trigger the email send. No session is established
     * server-side — the user must click the link in their email, which
     * triggers `magicLinkVerify` on the auth server. Returns
     * `{ status: 'magic_link_sent' }` with no `loginNonce`.
     */
    private async handleMagicLink(email: string): Promise<CallToolResult> {
        const auth = getAuth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = auth.api as any;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await api.signInMagicLink({
            body: { email },
        }) as { status?: boolean } | undefined;

        const status = result?.status ?? true;
        return this.textResult(
            JSON.stringify(
                {
                    status: status ? 'magic_link_sent' : 'magic_link_failed',
                    email,
                    nextStep:
                        'Check your email and click the magic link. The session will be ' +
                        'established when you click the link — retry your original request ' +
                        'after clicking.'
                },
                null,
                2
            )
        );
    }

    /**
     * Password path: `signInEmail` → check for 2FA challenge → if 2FA
     * and backupCode provided, `verifyBackupCode` → session. If no 2FA,
     * session is established directly by `signInEmail`.
     */
    private async handlePasswordSignin(
        email: string,
        password: string,
        backupCode?: string
    ): Promise<CallToolResult> {
        const auth = getAuth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = auth.api as any;

        // -- signInEmail with asResponse: true to capture Set-Cookie ------
        const signInResponse = await api.signInEmail({
            body: { email, password },
            asResponse: true,
        }) as Response;

        if (signInResponse.status !== 200) {
            return this.textResult(
                `Sign-in failed (HTTP ${signInResponse.status}). Check credentials.`,
                true
            );
        }

        // Parse the response body (can only read once).
        let body: Record<string, unknown>;
        try {
            body = await signInResponse.json() as Record<string, unknown>;
        } catch {
            return this.textResult('Sign-in response was not valid JSON.', true);
        }

        const setCookieHeaders = signInResponse.headers.getSetCookie();

        // -- Check for 2FA challenge ---------------------------------------
        if (body.twoFactorRedirect) {
            // 2FA is enabled — signInEmail returned a two_factor cookie,
            // NOT a session. Need verifyBackupCode to establish the session.
            if (!backupCode) {
                return this.textResult(
                    'Two-factor authentication is enabled on this account. ' +
                    'Provide a backupCode (alongside password) to complete sign-in. ' +
                    'For passwordless recovery, use auth_recover.',
                    true
                );
            }

            // Extract the two_factor cookie from the Set-Cookie headers.
            // The two-factor hook deletes the session cookie and sets a
            // `two_factor` cookie (see two-factor/index.mjs:233-250).
            const twoFactorCookie = setCookieHeaders
                .find(c => c.startsWith('two_factor='));
            if (!twoFactorCookie) {
                return this.textResult(
                    'Sign-in returned a 2FA challenge but no two-factor cookie was found.',
                    true
                );
            }

            // Build a Cookie header with just the two_factor cookie.
            const cookieValue = twoFactorCookie.split(';')[0] ?? '';
            const headers = new Headers();
            headers.set('Cookie', cookieValue);

            // Call verifyBackupCode — the body is { code, disableSession?, trustDevice? }.
            // The two_factor cookie identifies the user (no identifier in body).
            const verifyResponse = await api.verifyBackupCode({
                body: { code: backupCode },
                headers,
                asResponse: true,
            }) as Response;

            if (verifyResponse.status !== 200) {
                return this.textResult(
                    `Backup-code verification failed (HTTP ${verifyResponse.status}). ` +
                    'The backup code may be incorrect or already consumed.',
                    true
                );
            }

            let verifyBody: Record<string, unknown>;
            try {
                verifyBody = await verifyResponse.json() as Record<string, unknown>;
            } catch {
                return this.textResult(
                    'Backup-code verification response was not valid JSON.',
                    true
                );
            }

            const verifyCookies = verifyResponse.headers.getSetCookie();
            const user = verifyBody.user as { id?: string } | undefined;
            const userId = user?.id;
            const sessionToken = verifyBody.token as string | undefined;

            if (!userId) {
                return this.textResult(
                    'Backup-code verification succeeded but no user id was returned.',
                    true
                );
            }

            if (verifyCookies.length === 0) {
                return this.textResult(
                    'Backup-code verification succeeded but no session cookies were returned.',
                    true
                );
            }

            return this.completeSignIn(userId, verifyCookies, sessionToken);
        }

        // -- No 2FA challenge — session established directly by signInEmail --
        const user = body.user as { id?: string } | undefined;
        const userId = user?.id;
        const sessionToken = body.token as string | undefined;

        if (!userId) {
            return this.textResult(
                'Sign-in succeeded but no user id was returned.',
                true
            );
        }

        if (setCookieHeaders.length === 0) {
            return this.textResult(
                'Sign-in succeeded but no session cookies were returned.',
                true
            );
        }

        return this.completeSignIn(userId, setCookieHeaders, sessionToken);
    }

    /**
     * Stash cookies + return the nonce. The mutation pattern is the
     * contract with T-22 — `createPendingLogin` returns the same
     * reference stored in the module-level Map (per
     * `src/shared/pendingLogin.ts:55-69`).
     */
    private async completeSignIn(
        userId: string,
        cookieHeaders: string[],
        sessionToken?: string
    ): Promise<CallToolResult> {
        const pending = await createPendingLogin(userId);
        pending.cookieHeaders = cookieHeaders;

        // Extract session id from the token (preferred) or from the
        // Set-Cookie header. T-22 only checks `cookieHeaders?.length`,
        // so leaving sessionId undefined is safe, but setting it enables
        // `peekMostRecentPendingLogin` to match.
        if (sessionToken) {
            pending.sessionId = sessionToken;
        } else {
            const sessionCookie = cookieHeaders
                .map(c => c.split(';', 1)[0] ?? '')
                .find(pair => pair.startsWith('better-auth.session_token='));
            if (sessionCookie) {
                const token = sessionCookie.slice('better-auth.session_token='.length);
                if (token) pending.sessionId = token;
            }
        }
        await savePendingLogin(pending);

        return this.textResult(
            JSON.stringify(
                {
                    status: 'signed_in',
                    userId,
                    loginNonce: pending.nonce,
                    nextStep: 'Retry your original request. The client will complete the OAuth flow.'
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
 * Test-only export. Exposed so future tests can inspect the signin
 * schema without re-importing zod.
 *
 * @internal
 */
export const __test__signinSchema = signinSchema;
