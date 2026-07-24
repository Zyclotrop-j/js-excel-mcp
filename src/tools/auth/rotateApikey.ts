/**
 * `auth_rotate_apikey` — the authenticated API-key management tool
 * mounted on `/mcp`. Lets an already-authenticated user issue, rotate,
 * or revoke a long-lived API key bound to their account.
 *
 * ## Actions
 *
 *   - `issue` (default) — create a new `mcp_`-prefixed API key for the
 *     current user. The plaintext key is returned **once** in the tool
 *     result; better-auth's `@better-auth/api-key` plugin stores only a
 *     hash. The LLM stores the key and uses it as
 *     `Authorization: Bearer mcp_...` on subsequent runs.
 *   - `rotate` — revoke the current key (the one in the request) and
 *     issue a new one. Useful on a schedule or after a suspected leak.
 *   - `revoke` — revoke a key by id (or the current key if `keyId` is
 *     omitted and the session is an API-key session).
 *
 * ## `deleteApiKey` without session cookies
 *
 * The `@better-auth/api-key` plugin's `deleteApiKey` endpoint uses
 * session middleware — it requires a `Cookie` header to identify the
 * caller. When the current session is an API-key session (no cookies),
 * the plugin API cannot be used. Per the architect's note in
 * `tickets/real-auth/notes/arch-decision-passkey-and-related.md` §3
 * and the plugin docs ("If you want to delete a key without these
 * checks, we recommend you use an ORM to directly mutate your DB
 * instead"), the revoke/rotate actions fall back to a direct
 * `DELETE FROM apikey WHERE id = ?` via a temporary `better-sqlite3`
 * connection to the auth database. The table name is `apikey` (per
 * `API_KEY_TABLE_NAME` in the installed plugin types).
 *
 * ## Security
 *
 * The API key plaintext is shown **only** in the tool result. It is
 * never logged (`console.log`, logger, chain logs). The tool's
 * `description` carries the instruction: "NEVER log API keys in
 * chain_operations or any other tool-call record."
 *
 * See `tickets/real-auth/T-52-auth-rotate-apikey-tool.md` and
 * `[C-AT]` / `[C-APIKEY]` in `STUDY_FIRST.md`.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/server';
import Database from 'better-sqlite3';

import { AuthToolHandler } from './baseAuthTool.js';
import { getAuth } from '../../shared/authServer.js';

const rotateApikeySchema = z.object({
    action: z.enum(['issue', 'rotate', 'revoke']).default('issue')
        .describe(
            'issue: create a new key for the current user. ' +
            'rotate: revoke the current key and issue a new one. ' +
            'revoke: revoke the current key (or the one identified by keyId) without issuing a new one.'
        ),
    name: z.string().optional()
        .describe('Optional friendly name for the new key (e.g. "laptop-macbook"). Used by action=issue and action=rotate.'),
    keyId: z.string().optional()
        .describe('The id of the key to revoke. Required by action=revoke when the current session is not an API-key session. For action=rotate, the current key is revoked automatically; this field overrides which key to revoke.'),
}).describe(
    'Issue, rotate, or revoke a long-lived API key for the current user. ' +
    'The returned key can be used as Authorization: Bearer <key> on /mcp for ' +
    'future sessions without going through the OAuth flow. ' +
    'Store the key securely — it is shown only once. ' +
    'NEVER log API keys in chain_operations or any other tool-call record.'
);

type RotateApikeyInput = z.infer<typeof rotateApikeySchema>;

export class AuthRotateApikeyHandler extends AuthToolHandler {
    static readonly authSurface = 'authenticated' as const;

    async register(_allTools: import('../interface.js').ToolHandler[]): Promise<void> {
        this.registerTool(
            'auth_rotate_apikey',
            {
                title: 'Rotate API key',
                description:
                    'Issue, rotate, or revoke a long-lived API key. ' +
                    'The new key (when issued) is shown once — store it securely. ' +
                    'Use it as Authorization: Bearer <key> on /mcp to skip the OAuth flow on future runs. ' +
                    'NEVER log API keys in chain_operations or any other tool-call record.',
                inputSchema: rotateApikeySchema,
                annotations: {
                    destructiveHint: true,
                    idempotentHint: false,
                    openWorldHint: false,
                    readOnlyHint: false
                }
            },
            async (arg) => this.handle(arg as RotateApikeyInput)
        );
    }

    private async handle(input: RotateApikeyInput): Promise<CallToolResult> {
        const userId = this.context.authInfo?.extra?.userId as string | undefined;
        if (!userId) {
            return this.text('Could not identify the current user.', true);
        }

        if (input.action === 'revoke') {
            return await this.handleRevoke(input, userId);
        }
        if (input.action === 'rotate') {
            return await this.handleRotate(input, userId);
        }
        return await this.handleIssue(input, userId);
    }

    /**
     * `action: 'issue'` — create a new `mcp_`-prefixed API key for the
     * current user. `createApiKey` does not use session middleware — the
     * `userId` in the body is the owner; it becomes `referenceId` on the
     * stored row (per the architect's note, Correction 2).
     */
    private async handleIssue(input: RotateApikeyInput, userId: string): Promise<CallToolResult> {
        const auth = getAuth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = auth.api as any;
        try {
            const result = await api.createApiKey({
                body: { userId, prefix: 'mcp_', name: input.name },
            });
            if (!result || typeof result.key !== 'string') {
                return this.text('Failed to issue new API key.', true);
            }
            return this.keyResult('issued', result.key, result.id, userId);
        } catch (err) {
            return this.errorResult(err, 'issue API key');
        }
    }

    /**
     * `action: 'rotate'` — revoke the current key (identified by
     * `authInfo.extra.keyId` or the `keyId` argument) and issue a new
     * one. The old key is deleted first; if the new key issuance fails
     * the old key is already gone (acceptable — the user can issue a
     * fresh one with `action=issue`).
     */
    private async handleRotate(input: RotateApikeyInput, userId: string): Promise<CallToolResult> {
        const oldKeyId = input.keyId ?? (this.context.authInfo?.extra?.keyId as string | undefined);
        if (!oldKeyId) {
            return this.text(
                'Cannot rotate: no keyId to revoke. The current session is not an API-key ' +
                'session and no keyId argument was provided. Use action=issue to create a new key.',
                true
            );
        }

        const revokeResult = await this.deleteKey(oldKeyId, userId);
        if (revokeResult !== true) {
            return this.text(`Failed to revoke the old key (id=${oldKeyId}): ${revokeResult}`, true);
        }

        const auth = getAuth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = auth.api as any;
        try {
            const result = await api.createApiKey({
                body: { userId, prefix: 'mcp_', name: input.name },
            });
            if (!result || typeof result.key !== 'string') {
                return this.text('Old key was revoked but the new key issuance failed. Call action=issue to create a fresh key.', true);
            }
            return this.keyResult('rotated', result.key, result.id, userId);
        } catch (err) {
            return this.errorResult(err, 'issue replacement API key after rotate');
        }
    }

    /**
     * `action: 'revoke'` — revoke a key by id. The `keyId` argument
     * takes precedence; otherwise the current session's key
     * (`authInfo.extra.keyId`) is revoked.
     */
    private async handleRevoke(input: RotateApikeyInput, userId: string): Promise<CallToolResult> {
        const keyId = input.keyId ?? (this.context.authInfo?.extra?.keyId as string | undefined);
        if (!keyId) {
            return this.text(
                'Cannot revoke: keyId is required. Pass the keyId argument, or call this ' +
                'tool from an API-key session to revoke the current key.',
                true
            );
        }

        const result = await this.deleteKey(keyId, userId);
        if (result !== true) {
            return this.text(`Failed to revoke key (id=${keyId}): ${result}`, true);
        }
        return this.text('API key revoked. The next request with that key will 401.');
    }

    /**
     * Delete an API key row by id. First tries the plugin's
     * `deleteApiKey` API (works when a session cookie is present); on
     * failure falls back to a direct `DELETE FROM apikey WHERE id = ?`
     * via a temporary `better-sqlite3` connection — the
     * architect-approved fallback for API-key sessions without cookies.
     * The `referenceId` ownership guard ensures a caller can only
     * delete keys bound to their own account.
     *
     * Returns `true` on success, or an error-message string on failure.
     */
    private async deleteKey(keyId: string, userId: string): Promise<boolean | string> {
        const auth = getAuth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = auth.api as any;
        try {
            const result = await api.deleteApiKey({ body: { keyId } });
            if (result && result.success === false) {
                // Plugin refused; fall through to direct delete.
                return await this.directDbDelete(keyId, userId);
            }
            return true;
        } catch {
            // Session middleware threw (no Cookie header) — fall back to
            // the direct DB delete per the architect's note.
            return await this.directDbDelete(keyId, userId);
        }
    }

    /**
     * Direct `DELETE FROM apikey WHERE id = ? AND referenceId = ?` via a
     * temporary `better-sqlite3` connection. Used when `deleteApiKey`'s
     * session middleware rejects the request (the caller is on an
     * API-key session with no cookies). The `referenceId = userId` guard
     * scopes the delete to the caller's own keys — a user cannot revoke
     * another user's key by guessing its id. The `dbPath` comes from
     * `this.serverOptions.authConfig.dbPath`.
     */
    private async directDbDelete(keyId: string, userId: string): Promise<boolean | string> {
        const dbPath = this.serverOptions.authConfig?.dbPath;
        if (!dbPath) {
            return 'authConfig.dbPath is not available; cannot perform direct DB delete.';
        }
        let db: Database.Database | undefined;
        try {
            db = new Database(dbPath);
            const info = db.prepare('DELETE FROM apikey WHERE id = ? AND referenceId = ?').run(keyId, userId);
            if (info.changes === 0) {
                return `no apikey row with id=${keyId} (already revoked or never existed).`;
            }
            return true;
        } catch (err) {
            const e = err as { message?: string };
            return e?.message ?? String(err);
        } finally {
            db?.close();
        }
    }

    /**
     * Build the tool result for a successful issue/rotate. The
     * plaintext `key` appears ONLY here — never in logs, never in
     * chain_operation step records.
     */
    private keyResult(status: 'issued' | 'rotated', key: string, keyId: string, userId: string): CallToolResult {
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    status,
                    apiKey: key,
                    keyId,
                    userId,
                    instructions:
                        'Store this key securely. Use it as Authorization: Bearer <key> on /mcp. ' +
                        'The key will not be shown again. NEVER log it in chain_operations or any ' +
                        'other tool-call record.'
                }, null, 2)
            }],
            isError: false
        };
    }

    private text(t: string, isError = false): CallToolResult {
        return { content: [{ type: 'text', text: t }], isError };
    }

    private errorResult(err: unknown, op: string): CallToolResult {
        const e = err as { body?: { message?: string }; message?: string };
        const msg = e?.body?.message ?? e?.message ?? String(err);
        return this.text(`Failed to ${op}: ${msg}`, true);
    }
}

/**
 * Test-only export. Exposed so future tests can inspect the schema /
 * handler behaviour without re-importing zod. Not part of the public API.
 *
 * @internal
 */
export const __test__rotateApikeySchema = rotateApikeySchema;
