/**
 * `auth_recover` — the public, unauthenticated recovery tool mounted on
 * `/mcp/bootstrap`. The LLM-facing entry point for recovering access to an
 * MCP account when the user has lost their password / passkey / API key
 * and only has a backup code (issued at signup by T-41's `enableTwoFactor`
 * call). Takes `identifier` (email) and `backupCode` as tool arguments
 * (validated by the zod `inputSchema` before the callback fires — no
 * elicitation round-trip, per the architecture decision in
 * `tickets/real-auth/notes/arch-decision-elicitation-blocker.md`).
 *
 * ## better-auth v1.6.23 limitation
 *
 * The dispatched engineer's investigation of the installed types
 * (`node_modules/better-auth/dist/plugins/two-factor/verify-two-factor.mjs`
 * + `backup-codes/index.mjs`) confirms that `verifyBackupCode` does NOT
 * support passwordless recovery in v1.6.23. The endpoint body schema is
 * `{ code, disableSession?, trustDevice? }` — there is no `identifier`
 * field. The user is identified by EITHER:
 *
 *   1. an existing session (via `getSessionFromCtx(ctx)`), OR
 *   2. a `two_factor` cookie from a prior `signInEmail` call (which
 *      requires the user's password).
 *
 * There is no third path for an unauthenticated user who has lost their
 * password. The `verifyTwoFactor` helper throws
 * `INVALID_TWO_FACTOR_COOKIE` when neither a session nor a `two_factor`
 * cookie is present.
 *
 * Per the dispatch directive ("If the better-auth types support this,
 * implement it. If not, the tool returns an error directing the user to
 * use `auth_signin` with password (if they have one) or contact the
 * operator"), this tool surfaces the limitation as a clear, actionable
 * error result. The schema (identifier + backupCode) is still wired so
 * the LLM-facing API surface is stable — when better-auth adds a
 * passwordless recovery endpoint, the handler can be filled in without
 * changing the schema.
 *
 * The supported recovery path for v1.6.23 is `auth_signin` (T-42) with
 * `password` + `backupCode` (the password sign-in sets the
 * `two_factor` cookie, and `verifyBackupCode` consumes it to establish
 * the session). For users who have also lost their password, the
 * operator must intervene (a future ticket could add a server-side
 * `viewBackupCodes`-based recovery flow, but that bypasses the
 * `verifyBackupCode` guarantee of single-use consumption — out of
 * scope for T-43).
 *
 * ## Cookie handoff (T-22 contract)
 *
 * When a future better-auth version supports passwordless recovery, the
 * handler will capture the `Set-Cookie` headers from the recovery
 * response and stash them via `createPendingLogin(userId)` exactly like
 * T-41 / T-42. The mutation pattern on the returned `PendingLogin`
 * reference (cookieHeaders / sessionId) is the contract with T-22's
 * `realSignInHandler`.
 *
 * See `tickets/real-auth/T-43-auth-recover-tool.md` and `[C-PA]`,
 * `[C-PL]`, `[C-RECOVER]` in `STUDY_FIRST.md`.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';

import { AuthToolHandler } from './baseAuthTool';

// -- Recover input schema --------------------------------------------------

const recoverSchema = z.object({
    identifier: z.string()
        .describe('Email address of the account to recover.'),
    backupCode: z.string().min(1)
        .describe('A single backup code from the set issued at signup. ' +
            'Case-insensitive. Codes are single-use; a code that has already ' +
            'been consumed (even partially) cannot be reused.'),
}).describe(
    'Recover access to an MCP account using a backup code. Pass `identifier` ' +
    '(email) and `backupCode`. After recovery, call auth_add_passkey or ' +
    'auth_rotate_apikey to set up a new long-lived credential. ' +
    'Not chainable (auth side-effects).'
);

type RecoverInput = z.infer<typeof recoverSchema>;

export class AuthRecoverHandler extends AuthToolHandler {
    static readonly authSurface = 'bootstrap' as const;

    async register(_allTools: import('../interface').ToolHandler[]): Promise<void> {
        this.registerTool(
            'auth_recover',
            {
                title: 'Recover account',
                description:
                    'Recover access using a backup code. Pass `identifier` (email) and `backupCode`. ' +
                    'Not chainable (auth side-effects).\n\n' +
                    '**v1.6.23 limitation:** the installed better-auth does NOT support ' +
                    'passwordless backup-code recovery — `verifyBackupCode` requires a ' +
                    '`two_factor` cookie from a prior `signInEmail` (which requires a ' +
                    'password). On call, this tool surfaces that limitation and directs ' +
                    'the user to `auth_signin` with `password` + `backupCode` (the ' +
                    'supported 2FA recovery path) or to contact the operator if they ' +
                    'have also lost their password.\n\n' +
                    '**Security:** NEVER log backup codes in chain_operations or any ' +
                    'tool-call record. The LLM should relay the code from the user ' +
                    'without echoing it.',
                inputSchema: recoverSchema,
                annotations: {
                    destructiveHint: false,
                    idempotentHint: false,
                    openWorldHint: false,
                    readOnlyHint: false
                }
            },
            async (arg) => {
                return this.handleRecover(arg as RecoverInput);
            }
        );
    }

    /**
     * Surface the v1.6.23 passwordless-recovery limitation. The schema is
     * wired and the LLM-facing API surface is stable, but the handler
     * short-circuits with a clear, actionable error rather than attempting
     * a `verifyBackupCode` call that is guaranteed to fail with
     * `INVALID_TWO_FACTOR_COOKIE` (no `two_factor` cookie is available
     * without a prior `signInEmail`, which requires a password).
     *
     * When a future better-auth version adds a passwordless recovery
     * endpoint, this method should be filled in with the actual recovery
     * call + cookie handoff (see the file header docblock).
     */
    private async handleRecover(_input: RecoverInput): Promise<CallToolResult> {
        return this.textResult(
            JSON.stringify(
                {
                    status: 'unsupported',
                    reason:
                        'better-auth v1.6.23 does not support passwordless backup-code ' +
                        'recovery. The `verifyBackupCode` API requires a `two_factor` ' +
                        'cookie from a prior `signInEmail` call, which requires a password.',
                    nextStep:
                        'If the user knows their password, call auth_signin with ' +
                        '`identifier` (email), `password`, and `backupCode` — T-42 ' +
                        'implements the full 2FA sign-in flow and will establish a ' +
                        'session. If the user has also lost their password, the ' +
                        'operator must intervene (out of scope for T-43).',
                    openQuestion:
                        'OPEN-QUESTION T-43-A: should a follow-up ticket add a ' +
                        'server-side recovery flow that bypasses `verifyBackupCode` ' +
                        '(e.g. using `viewBackupCodes` + a server-side session ' +
                        'bootstrap)? This would lose the single-use consumption ' +
                        'guarantee and is therefore deferred to the Lead Architect.'
                },
                null,
                2
            ),
            true
        );
    }

    private textResult(text: string, isError = false): CallToolResult {
        return { content: [{ type: 'text', text }], isError };
    }
}

/**
 * Test-only export. Exposed so future tests can inspect the recover
 * schema without re-importing zod.
 *
 * @internal
 */
export const __test__recoverSchema = recoverSchema;
