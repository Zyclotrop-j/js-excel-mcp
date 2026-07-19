/**
 * `auth_signout` — the authenticated sign-out tool mounted on `/mcp`.
 * The LLM-facing entry point for ending the current session. Calls
 * better-auth's `auth.api.signOut` server-side with the captured Express
 * request headers (so the `Cookie` header identifies which session to
 * revoke), then returns a clear "session ended" message. The LLM's next
 * call to `/mcp` will 401, sending it back to `/mcp/bootstrap` to
 * re-authenticate.
 *
 * ## API-key sessions
 *
 * T-00 Outcome B: the `tokenVerifier` recognises API keys via
 * `auth.api.verifyApiKey` and tags the resulting `AuthInfo.extra` with
 * `credentialType: 'api-key'`. API keys are stateless — there is no
 * server-side session to sign out. The tool returns a pointer to
 * `auth_rotate_apikey` (T-52) with `revoke: true`, which is the only way
 * to invalidate an API key.
 *
 * ## MCP access-token revocation
 *
 * Per T-00: the better-auth MCP plugin only exposes `getMcpSession` (no
 * `revokeMcpSession`). The MCP access token therefore stays valid until
 * its natural 1h expiry. The web session (the better-auth
 * `better-auth.session_token` cookie) is revoked immediately by
 * `signOut`, so any subsequent `getMcpSession` lookup against the same
 * cookie returns `null` — which `tokenVerifier.verifyAccessToken` turns
 * into a 401 (with API-key fallthrough for keys, which won't match
 * because the bearer is the OAuth token, not `mcp_...`). This satisfies
 * the ticket's "next call 401s" acceptance criterion.
 *
 * See `tickets/real-auth/T-50-auth-signout-tool.md` (Scope §1, §2, §3)
 * and `[C-AT]` in `STUDY_FIRST.md`.
 */

import type { CallToolResult } from '@modelcontextprotocol/server';

import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';
import { getExpressRequestHeaders } from '../../util/requestContext.js';

export class AuthSignoutHandler extends AuthToolHandler {
    static readonly authSurface = 'authenticated' as const;

    async register(): Promise<void> {
        this.registerTool('auth_signout', {
            title: 'Sign out',
            description:
                'End the current session. After sign-out, the next MCP call will return 401 ' +
                'and you must reconnect to /mcp/bootstrap to re-authenticate. If you authenticated ' +
                'with an API key, this tool does not revoke the key — use auth_rotate_apikey with ' +
                'revoke=true instead.',
            annotations: {
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: false,
                readOnlyHint: false
            }
        }, async () => this.handleSignout());
    }

    private async handleSignout(): Promise<CallToolResult> {
        const auth = getAuth();

        // T-30 Outcome B sets `extra.credentialType = 'api-key'` when the
        // bearer token was recognised as a long-lived API key. API keys are
        // stateless — `auth.api.signOut` (which revokes the better-auth web
        // session cookie) would be a no-op and misleadingly report success.
        // Point the LLM at `auth_rotate_apikey` (T-52), the only API that
        // can invalidate an API key.
        const credentialType = this.context.authInfo?.extra?.credentialType;
        if (credentialType === 'api-key') {
            return {
                content: [{
                    type: 'text',
                    text: 'You are authenticated with an API key. auth_signout does not revoke API keys — use auth_rotate_apikey with revoke=true to invalidate this key, or simply delete it from your environment.'
                }],
                isError: false
            };
        }

        // Server-side sign-out. better-auth's `signOut` reads the session
        // cookie from the request headers; the Express request's headers are
        // forwarded via the per-request AsyncLocalStorage context
        // (`setExpressRequestHeaders` is called by `server.ts` at the
        // start of the `/mcp` `run()` block). Fall back to an empty
        // `Headers()` if the context has none (e.g. a `chain_operations`
        // step) — `signOut` will simply find no session and return
        // `{ success: false }`, which is a safe no-op.
        const headers = getExpressRequestHeaders() ?? new Headers();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (auth.api as any).signOut({ headers });

        return {
            content: [{
                type: 'text',
                text: 'Session ended. The next MCP call to /mcp will return 401.'
            }],
            isError: false
        };
    }
}
