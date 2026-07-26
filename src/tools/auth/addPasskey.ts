/**
 * `auth_add_passkey` — the authenticated passkey-registration tool mounted
 * on `/mcp`. Lets an already-authenticated user attach a new WebAuthn
 * passkey to their account (e.g. after `auth_signup` with
 * `credentialType=passkey`, where the account was bootstrapped with a
 * throwaway password, or after `auth_recover` to replace a lost
 * credential).
 *
 * ## Tool arguments (no elicitation)
 *
 * Per the architecture decision in
 * `tickets/real-auth/notes/arch-decision-elicitation-blocker.md`,
 * elicitation is not available in the installed SDK's per-request legacy
 * serving mode. The tool takes a single `action` argument that selects
 * one of three branches, plus `attestationResponse` / `name` where
 * relevant:
 *
 *   - `action: 'register'` — calls
 *     `auth.api.generatePasskeyRegistrationOptions({ headers, query })`
 *     and returns the WebAuthn challenge (`PublicKeyCredentialRequestOptionsJSON`).
 *     The LLM relays the challenge to the user's browser/authenticator, which
 *     runs `navigator.credentials.create({ publicKey: challenge })` and
 *     returns a `RegistrationResponseJSON`. The LLM then calls this tool
 *     again with `action: 'verify'`.
 *   - `action: 'verify'` — takes `attestationResponse` (a JSON-stringified
 *     `RegistrationResponseJSON` from the client's WebAuthn ceremony) and
 *     an optional `name` (display label for the passkey). Calls
 *     `auth.api.verifyPasskeyRegistration({ headers, body: { response, name } })`,
 *     which verifies the attestation and stores the passkey row. Returns
 *     the stored `Passkey` row. The caller already has a session —
 *     `verifyPasskeyRegistration` does NOT create a new one (per T-02
 *     §3.1/§3.2).
 *   - `action: 'list'` — calls `auth.api.listPasskeys({ headers })` and
 *     returns the user's registered passkeys.
 *
 * ## Session identification
 *
 * Both `generatePasskeyRegistrationOptions` and `verifyPasskeyRegistration`
 * use session middleware — they read the `Cookie` header to identify the
 * user. The Express request headers are forwarded via
 * `getExpressRequestHeaders()` (set by `server.ts` at the start of each
 * `/mcp` `run()` block). An empty `Headers()` fallback is used outside an
 * HTTP request (e.g. `chain_operations`), in which case the better-auth
 * calls will fail with a session-required error — surfaced to the LLM as
 * an `isError` result.
 *
 * See `tickets/real-auth/T-51-auth-add-passkey-tool.md` and `[C-AT]` in
 * `STUDY_FIRST.md`.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';

import { AuthToolHandler } from './baseAuthTool';
import { getAuth } from '../../shared/authServer';
import { getExpressRequestHeaders } from '../../util/requestContext';

// -- Input schema ------------------------------------------------------------
//
// `attestationResponse` is a JSON-stringified `RegistrationResponseJSON`
// (the output of `navigator.credentials.create({ publicKey: challenge })`).
// We accept a string rather than a structured object so the LLM can relay
// the authenticator's output verbatim; the callback JSON-parses it before
// passing it to `verifyPasskeyRegistration`'s `body.response` (which is
// typed `ZodAny` in the installed plugin — see
// `node_modules/@better-auth/passkey/dist/index-Cyjp_etN.d.mts:502-507`).
const addPasskeySchema = z.object({
    action: z.enum(['register', 'verify', 'list'])
        .describe('Which step of the passkey-registration flow to run. ' +
            '"register" returns a WebAuthn challenge to complete with the user\'s authenticator; ' +
            '"verify" accepts the attestation response and stores the passkey; ' +
            '"list" returns the user\'s currently registered passkeys.'),
    attestationResponse: z.string().optional()
        .describe('Required when action=verify. A JSON-stringified RegistrationResponseJSON ' +
            '(the output of navigator.credentials.create({ publicKey: <challenge> })). ' +
            'Generate it by completing the challenge returned from action=register in a ' +
            'browser or via your client SDK\'s passkey support.'),
    name: z.string().optional()
        .describe('Optional friendly label for the passkey (e.g. "iPhone Face ID"). ' +
            'Used by action=verify (stored on the passkey row) and action=register ' +
            '(passed as a hint to the authenticator).'),
}).describe('Attach a new passkey to the current account, or list existing passkeys. ' +
    'Two-step flow: call action=register to get a WebAuthn challenge, complete it with ' +
    'the user\'s authenticator, then call action=verify with the attestation response. ' +
    'Requires a WebAuthn-capable client (browser navigator.credentials.create or a ' +
    'passkey SDK); the LLM cannot complete WebAuthn itself.');

type AddPasskeyInput = z.infer<typeof addPasskeySchema>;

export class AuthAddPasskeyHandler extends AuthToolHandler {
    static readonly authSurface = 'authenticated' as const;

    async register(_allTools: import('../interface').ToolHandler[]): Promise<void> {
        this.registerTool(
            'auth_add_passkey',
            {
                title: 'Add passkey',
                description:
                    'Attach a new passkey to the current account, or list existing passkeys. ' +
                    'Two-step flow:\n' +
                    '  1. action=register → returns a WebAuthn challenge (PublicKeyCredentialRequestOptionsJSON).\n' +
                    '  2. Complete the challenge with the user\'s authenticator ' +
                    '(browser navigator.credentials.create or a client SDK passkey helper) — ' +
                    'the LLM cannot do WebAuthn itself; relay the challenge to the user\'s ' +
                    'browser/authenticator and collect the resulting RegistrationResponseJSON.\n' +
                    '  3. action=verify with attestationResponse (JSON-stringified ' +
                    'RegistrationResponseJSON) and optional name → stores the passkey row.\n' +
                    'action=list returns the user\'s registered passkeys without changing ' +
                    'anything.\n\n' +
                    'Adding a passkey requires a WebAuthn authenticator. If your host supports ' +
                    'navigator.credentials.create (browser) or a passkey SDK, use it to ' +
                    'complete the challenge. Otherwise, ask the user to complete the ceremony ' +
                    'in a browser and paste the attestation response back.\n\n' +
                    '**Not chainable:** this tool mutates auth state (registers a credential) ' +
                    'and should be invoked directly — not via chain_operations.',
                inputSchema: addPasskeySchema,
                annotations: {
                    destructiveHint: false,
                    idempotentHint: false,
                    openWorldHint: true,
                    readOnlyHint: false
                }
            },
            async (arg) => this.handleAddPasskey(arg as AddPasskeyInput)
        );
    }

    private async handleAddPasskey(input: AddPasskeyInput): Promise<CallToolResult> {
        // Cross-field validation the schema can't express: `verify`
        // requires `attestationResponse`.
        if (input.action === 'verify' && !input.attestationResponse) {
            return this.textResult(
                'attestationResponse is required when action=verify. ' +
                'Call action=register first to obtain a WebAuthn challenge, ' +
                'complete it with the user\'s authenticator, then call ' +
                'action=verify with the resulting RegistrationResponseJSON.',
                true
            );
        }

        const auth = getAuth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = auth.api as any;
        const headers = getExpressRequestHeaders() ?? new Headers();

        if (input.action === 'register') {
            return await this.handleRegister(api, headers, input.name);
        }
        if (input.action === 'verify') {
            return await this.handleVerify(api, headers, input.attestationResponse!, input.name);
        }
        // action === 'list'
        return await this.handleList(api, headers);
    }

    /**
     * `action: 'register'` — issue a WebAuthn registration challenge. The
     * passkey plugin's `generatePasskeyRegistrationOptions` endpoint uses
     * session middleware to identify the user from the `Cookie` header and
     * returns a `PublicKeyCredentialRequestOptionsJSON` challenge for the
     * client to pass to `navigator.credentials.create`.
     */
    private async handleRegister(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api: any,
        headers: Headers,
        name?: string
    ): Promise<CallToolResult> {
        const query: Record<string, string> = {};
        if (name) query.name = name;
        try {
            const challenge = await api.generatePasskeyRegistrationOptions({
                headers,
                query,
            });
            return this.textResult(
                JSON.stringify(
                    {
                        status: 'challenge_issued',
                        challenge,
                        nextStep:
                            'Complete the WebAuthn registration ceremony with this challenge ' +
                            '(navigator.credentials.create({ publicKey: challenge }) in a ' +
                            'browser, or via your client SDK\'s passkey support). Then call ' +
                            'auth_add_passkey with action=verify, attestationResponse set to ' +
                            'the JSON-stringified RegistrationResponseJSON, and optional name.',
                    },
                    null,
                    2
                )
            );
        } catch (err) {
            return this.errorResult(err, 'generate passkey registration options');
        }
    }

    /**
     * `action: 'verify'` — verify the attestation response and store the
     * passkey. The passkey plugin's `verifyPasskeyRegistration` endpoint
     * accepts `body: { response, name? }` (per the installed
     * `.d.mts:502-507`), where `response` is the WebAuthn
     * `RegistrationResponseJSON`. It uses session middleware (the `Cookie`
     * header identifies the user) and returns the stored `Passkey` row —
     * it does NOT create a new session (the caller already has one).
     *
     * The LLM-facing `attestationResponse` argument is a JSON-stringified
     * `RegistrationResponseJSON`; we parse it here so the plugin receives
     * the structured object it expects.
     */
    private async handleVerify(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api: any,
        headers: Headers,
        attestationResponse: string,
        name?: string
    ): Promise<CallToolResult> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(attestationResponse);
        } catch {
            return this.textResult(
                'attestationResponse must be a JSON-stringified RegistrationResponseJSON. ' +
                'The value could not be parsed as JSON.',
                true
            );
        }
        const body: Record<string, unknown> = { response: parsed };
        if (name) body.name = name;
        try {
            const passkeyRow = await api.verifyPasskeyRegistration({ headers, body });
            return this.textResult(
                JSON.stringify(
                    {
                        status: 'passkey_added',
                        passkey: passkeyRow,
                        nextStep:
                            'Passkey registered. You can now use this passkey to sign in via ' +
                            'the standard OAuth /sign-in page.',
                    },
                    null,
                    2
                )
            );
        } catch (err) {
            return this.errorResult(err, 'verify passkey registration');
        }
    }

    /**
     * `action: 'list'` — return the user's registered passkeys. The
     * `listPasskeys` endpoint uses session middleware and returns a
     * `Passkey[]`.
     */
    private async handleList(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api: any,
        headers: Headers
    ): Promise<CallToolResult> {
        try {
            const passkeys = await api.listPasskeys({ headers });
            return this.textResult(
                JSON.stringify(
                    { status: 'ok', passkeys: passkeys ?? [] },
                    null,
                    2
                )
            );
        } catch (err) {
            return this.errorResult(err, 'list passkeys');
        }
    }

    private textResult(text: string, isError = false): CallToolResult {
        return { content: [{ type: 'text', text }], isError };
    }

    /**
     * Normalise a thrown better-auth error into a concise `isError` tool
     * result. better-auth throws `APIError` instances whose `.body`
     * carries `{ message, code }`; a plain `Error` falls back to
     * `.message`. We never log secrets — passkey challenges and
     * attestation responses are not sensitive, but we avoid dumping the
     * full error stack to keep the LLM context clean.
     */
    private errorResult(err: unknown, op: string): CallToolResult {
        const e = err as { body?: { message?: string }; message?: string };
        const msg = e?.body?.message ?? e?.message ?? String(err);
        return this.textResult(`Failed to ${op}: ${msg}`, true);
    }
}

/**
 * Test-only export. Exposed so future tests can inspect the schema /
 * handler behaviour without re-importing zod. Not part of the public API.
 *
 * @internal
 */
export const __test__addPasskeySchema = addPasskeySchema;
