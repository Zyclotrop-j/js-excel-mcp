/**
 * T-72 §2 — Real-mode signup → Excel suite (gated).
 *
 * Self-skips when `MCP_AUTH_MODE !== 'real'`.
 *
 * Drives the `auth_signup` tool with password credentials through a
 * `MockMcpServer`, asserts the structured result contains a
 * `loginNonce` (UUID) and `backupCodes` (array), and verifies the
 * pending-login store has an entry with `cookieHeaders` set.
 */
import { strict as assert } from 'node:assert';

import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { AuthSignupHandler } from '../../src/tools/auth/signup.js';
import { peekPendingLogin } from '../../src/shared/pendingLogin.js';
import {
    isRealMode,
    setupRealAuthTestEnv,
    uniqueTestEmail,
    type AuthConfig,
} from './helpers.js';

export default function (test: any) {
    if (!isRealMode()) return;

    let mockServer: MockMcpServer;
    let authConfig: AuthConfig;

    test('real-auth signup: setup', async () => {
        authConfig = await setupRealAuthTestEnv();
        mockServer = new MockMcpServer();
    });

    test('real-auth signup: auth_signup with password returns loginNonce and backupCodes', async () => {
        const email = uniqueTestEmail('signup');
        const password = 'qa-test-password-12345';

        const mockCtx = createMockRequestContext('qa-signup-user');
        const handler = new AuthSignupHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await handler.register([]);

        const tool = mockServer.getTool('auth_signup');
        const result = await tool.cb(
            { name: 'QA Test User', email, credentialType: 'password', password },
            mockCtx
        );

        assert.ok(!result.isError, 'signup should not return an error');

        const text = (result.content as any)[0]?.text as string;
        assert.ok(text, 'result should have text content');

        const parsed = JSON.parse(text);
        assert.equal(parsed.status, 'signed_up');
        assert.ok(parsed.userId, 'should return a userId');
        assert.ok(parsed.loginNonce, 'should return a loginNonce');
        assert.match(
            parsed.loginNonce,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            'loginNonce should be a UUID v4'
        );
        assert.ok(Array.isArray(parsed.backupCodes), 'backupCodes should be an array');
        assert.ok(parsed.backupCodes.length > 0, 'backupCodes should be non-empty');
    });

    test('real-auth signup: pending-login store has entry with cookieHeaders', async () => {
        const email = uniqueTestEmail('signup-pending');
        const password = 'qa-test-password-12345';

        const mockCtx = createMockRequestContext('qa-signup-pending-user');
        const handler = new AuthSignupHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await handler.register([]);

        const tool = mockServer.getTool('auth_signup');
        const result = await tool.cb(
            { name: 'QA Pending User', email, credentialType: 'password', password },
            mockCtx
        );

        assert.ok(!result.isError, 'signup should not return an error');
        const parsed = JSON.parse((result.content as any)[0]?.text as string);
        const nonce = parsed.loginNonce as string;

        const pending = peekPendingLogin(nonce);
        assert.ok(pending, 'pending-login store should have an entry');
        assert.equal(pending!.userId, parsed.userId);
        assert.ok(
            pending!.cookieHeaders && pending!.cookieHeaders.length > 0,
            'pending-login entry should have cookieHeaders set'
        );
    });

    test('real-auth signup: cross-field validation rejects missing password for credentialType=password', async () => {
        const email = uniqueTestEmail('signup-validation');

        const mockCtx = createMockRequestContext('qa-signup-validation-user');
        const handler = new AuthSignupHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await handler.register([]);

        const tool = mockServer.getTool('auth_signup');
        const result = await tool.cb(
            { name: 'QA Validation User', email, credentialType: 'password' },
            mockCtx
        );

        assert.ok(result.isError, 'should return an error for missing password');
        const text = (result.content as any)[0]?.text as string;
        assert.match(text, /password is required/i);
    });

    test('real-auth signup: allowUserSignup=false blocks signup', async () => {
        const email = uniqueTestEmail('signup-blocked');

        const mockCtx = createMockRequestContext('qa-signup-blocked-user');
        const handler = new AuthSignupHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig: { ...authConfig, allowUserSignup: false } }
        );
        await handler.register([]);

        const tool = mockServer.getTool('auth_signup');
        const result = await tool.cb(
            { name: 'QA Blocked User', email, credentialType: 'password', password: 'qa-test-password-12345' },
            mockCtx
        );

        assert.ok(result.isError, 'should return an error when signup is disabled');
        const text = (result.content as any)[0]?.text as string;
        assert.match(text, /signup is disabled/i);
    });
}
