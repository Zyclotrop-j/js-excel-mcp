/**
 * T-72 §3 — Real-mode signin suite (gated).
 *
 * Self-skips when `MCP_AUTH_MODE !== 'real'`.
 *
 * Creates a user via `auth_signup`, then calls `auth_signin` with
 * the password and one backup code (the 2FA second factor). Asserts
 * the result contains a `loginNonce` and `status: 'signed_in'`.
 */
import { strict as assert } from 'node:assert';

import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { AuthSignupHandler } from '../../src/tools/auth/signup.js';
import { AuthSigninHandler } from '../../src/tools/auth/signin.js';
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

    test('real-auth signin: setup', async () => {
        authConfig = setupRealAuthTestEnv();
        mockServer = new MockMcpServer();
    });

    test('real-auth signin: password + backupCode establishes a session', async () => {
        const email = uniqueTestEmail('signin');
        const password = 'qa-test-password-12345';

        // Step 1: Sign up to create the user and get backup codes.
        const signupCtx = createMockRequestContext('qa-signin-signup-user');
        const signupHandler = new AuthSignupHandler(
            mockServer as any,
            signupCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await signupHandler.register([]);

        const signupTool = mockServer.getTool('auth_signup');
        const signupResult = await signupTool.cb(
            { name: 'QA Signin User', email, credentialType: 'password', password },
            signupCtx
        );

        assert.ok(!signupResult.isError, 'signup should succeed');
        const signupParsed = JSON.parse((signupResult.content as any)[0]?.text as string);
        const backupCodes: string[] = signupParsed.backupCodes;
        assert.ok(backupCodes && backupCodes.length > 0, 'should have backup codes');

        // Step 2: Sign in with password + first backup code.
        const signinCtx = createMockRequestContext('qa-signin-user');
        const signinHandler = new AuthSigninHandler(
            mockServer as any,
            signinCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await signinHandler.register([]);

        const signinTool = mockServer.getTool('auth_signin');
        const signinResult = await signinTool.cb(
            { identifier: email, password, backupCode: backupCodes[0] },
            signinCtx
        );

        assert.ok(!signinResult.isError, 'signin should not return an error');
        const text = (signinResult.content as any)[0]?.text as string;
        const parsed = JSON.parse(text);

        assert.equal(parsed.status, 'signed_in');
        assert.ok(parsed.loginNonce, 'should return a loginNonce');
        assert.ok(parsed.userId, 'should return a userId');
        assert.match(
            parsed.loginNonce,
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            'loginNonce should be a UUID v4'
        );
    });

    test('real-auth signin: missing password returns error', async () => {
        const email = uniqueTestEmail('signin-no-pw');

        const mockCtx = createMockRequestContext('qa-signin-no-pw-user');
        const handler = new AuthSigninHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await handler.register([]);

        const tool = mockServer.getTool('auth_signin');
        const result = await tool.cb(
            { identifier: email },
            mockCtx
        );

        assert.ok(result.isError, 'should return an error');
        const text = (result.content as any)[0]?.text as string;
        assert.match(text, /password is required/i);
    });

    // KNOWN LIMITATION (T-42 bug): `auth_signin`'s handleMagicLink calls
    // `api.signInMagicLink({ body: { email } })` without a `headers` argument.
    // better-auth's `signInMagicLink` endpoint requires `Headers` for rate
    // limiting / session detection and throws `APIError: Headers is required`.
    // This is a bug in T-42, not in this test. File a follow-up to add
    // `headers` to the `signInMagicLink` call (matching the signup handler's
    // `signInMagicLink` helper which accepts an optional `headers` param).
    // When fixed, add a test that asserts `{ status: 'magic_link_sent' }`.
}
