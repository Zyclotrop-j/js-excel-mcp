/**
 * T-72 §4b — Real-mode API-key suite (gated).
 *
 * Self-skips when `MCP_AUTH_MODE !== 'real'`.
 *
 * Creates a user via `auth_signup`, calls `auth_rotate_apikey` with
 * `action='issue'` to obtain a plaintext API key, verifies the key
 * via `tokenVerifier.verifyAccessToken`, revokes it with
 * `action='revoke'`, and asserts the revoked key fails verification.
 */
import { strict as assert } from 'node:assert';

import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { AuthSignupHandler } from '../../src/tools/auth/signup.js';
import { AuthRotateApikeyHandler } from '../../src/tools/auth/rotateApikey.js';
import { tokenVerifier } from '../../src/shared/authServer.js';
import { OAuthError } from '@modelcontextprotocol/server';
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

    test('real-auth apikey: setup', async () => {
        authConfig = setupRealAuthTestEnv();
        mockServer = new MockMcpServer();
    });

    test('real-auth apikey: issue → verify → revoke → verify-fails', async () => {
        const email = uniqueTestEmail('apikey');
        const password = 'qa-test-password-12345';

        // Step 1: Sign up to create a user.
        const signupCtx = createMockRequestContext('qa-apikey-signup-user');
        const signupHandler = new AuthSignupHandler(
            mockServer as any,
            signupCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await signupHandler.register([]);

        const signupTool = mockServer.getTool('auth_signup');
        const signupResult = await signupTool.cb(
            { name: 'QA ApiKey User', email, credentialType: 'password', password },
            signupCtx
        );

        assert.ok(!signupResult.isError, 'signup should succeed');
        const signupParsed = JSON.parse((signupResult.content as any)[0]?.text as string);
        const userId = signupParsed.userId as string;
        assert.ok(userId, 'signup should return a userId');

        // Step 2: Issue an API key.
        const apikeyCtx = createMockRequestContext('qa-apikey-user');
        // Override authInfo to carry the real userId (the handler reads
        // `this.context.authInfo?.extra?.userId`).
        (apikeyCtx as any).authInfo = {
            token: 'mock-token',
            clientId: 'mock-client',
            scopes: [],
            extra: { userId },
        };

        const apikeyHandler = new AuthRotateApikeyHandler(
            mockServer as any,
            apikeyCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await apikeyHandler.register([]);

        const issueTool = mockServer.getTool('auth_rotate_apikey');
        const issueResult = await issueTool.cb({ action: 'issue' }, apikeyCtx);

        assert.ok(!issueResult.isError, 'issue should not return an error');
        const issueText = (issueResult.content as any)[0]?.text as string;
        const issueParsed = JSON.parse(issueText);

        assert.equal(issueParsed.status, 'issued');
        assert.ok(issueParsed.apiKey, 'should return an apiKey');
        assert.ok(
            issueParsed.apiKey.startsWith('mcp_'),
            'API key should have the mcp_ prefix'
        );
        assert.ok(issueParsed.keyId, 'should return a keyId');

        const apiKey = issueParsed.apiKey as string;
        const keyId = issueParsed.keyId as string;

        // Step 3: Verify the API key via tokenVerifier.
        const authInfo = await tokenVerifier.verifyAccessToken(apiKey);
        assert.ok(authInfo, 'tokenVerifier should return AuthInfo for a valid key');
        assert.equal(authInfo.extra?.userId, userId,
            'AuthInfo.extra.userId should match the signup userId');
        assert.equal(authInfo.extra?.credentialType, 'api-key',
            'AuthInfo.extra.credentialType should be "api-key"');
        assert.equal(authInfo.extra?.keyId, keyId,
            'AuthInfo.extra.keyId should match the issued keyId');

        // Step 4: Revoke the API key.
        const revokeResult = await issueTool.cb({ action: 'revoke', keyId }, apikeyCtx);

        assert.ok(!revokeResult.isError, 'revoke should not return an error');
        const revokeText = (revokeResult.content as any)[0]?.text as string;
        assert.match(revokeText, /revoked/i, 'should report the key was revoked');

        // Step 5: Verify the revoked key fails.
        let threw: unknown;
        try {
            await tokenVerifier.verifyAccessToken(apiKey);
        } catch (e) {
            threw = e;
        }
        assert.ok(threw, 'revoked key should fail verification');
        if (threw instanceof OAuthError) {
            assert.equal(threw.code, 'invalid_token',
                'revoked key should fail with invalid_token');
        }
    });

    test('real-auth apikey: revoke without keyId returns error', async () => {
        const email = uniqueTestEmail('apikey-revoke-no-id');
        const password = 'qa-test-password-12345';

        // Sign up first.
        const signupCtx = createMockRequestContext('qa-apikey-revoke-noid-signup');
        const signupHandler = new AuthSignupHandler(
            mockServer as any,
            signupCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await signupHandler.register([]);

        const signupTool = mockServer.getTool('auth_signup');
        const signupResult = await signupTool.cb(
            { name: 'QA Revoke NoId', email, credentialType: 'password', password },
            signupCtx
        );
        const signupParsed = JSON.parse((signupResult.content as any)[0]?.text as string);
        const userId = signupParsed.userId;

        // Try revoke without keyId (and without an API-key session).
        const apikeyCtx = createMockRequestContext('qa-apikey-revoke-noid');
        (apikeyCtx as any).authInfo = {
            token: 'mock-token',
            clientId: 'mock-client',
            scopes: [],
            extra: { userId },
        };

        const apikeyHandler = new AuthRotateApikeyHandler(
            mockServer as any,
            apikeyCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await apikeyHandler.register([]);

        const tool = mockServer.getTool('auth_rotate_apikey');
        const result = await tool.cb({ action: 'revoke' }, apikeyCtx);

        assert.ok(result.isError, 'revoke without keyId should return an error');
        const text = (result.content as any)[0]?.text as string;
        assert.match(text, /keyId is required/i);
    });
}
