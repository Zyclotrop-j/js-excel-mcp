/**
 * T-72 §4 — Real-mode recovery suite (gated).
 *
 * Self-skips when `MCP_AUTH_MODE !== 'real'`.
 *
 * Calls `auth_recover` with `identifier` + `backupCode` and asserts
 * the v1.6.23 "unsupported" response (the tool surfaces the
 * better-auth limitation — `verifyBackupCode` requires a
 * `two_factor` cookie from a prior `signInEmail`, which requires
 * a password).
 */
import { strict as assert } from 'node:assert';

import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';
import { AuthRecoverHandler } from '../../src/tools/auth/recover.js';
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

    test('real-auth recover: setup', async () => {
        authConfig = setupRealAuthTestEnv();
        mockServer = new MockMcpServer();
    });

    test('real-auth recover: returns unsupported for v1.6.23 passwordless recovery', async () => {
        const email = uniqueTestEmail('recover');

        const mockCtx = createMockRequestContext('qa-recover-user');
        const handler = new AuthRecoverHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await handler.register([]);

        const tool = mockServer.getTool('auth_recover');
        const result = await tool.cb(
            { identifier: email, backupCode: 'some-backup-code' },
            mockCtx
        );

        assert.ok(result.isError, 'recover should return an error (unsupported)');
        const text = (result.content as any)[0]?.text as string;
        const parsed = JSON.parse(text);

        assert.equal(parsed.status, 'unsupported');
        assert.ok(parsed.reason, 'should have a reason');
        assert.match(
            parsed.reason,
            /v1\.6\.23 does not support passwordless/i,
            'reason should mention v1.6.23 limitation'
        );
        assert.ok(parsed.nextStep, 'should provide next-step guidance');
        assert.match(
            parsed.nextStep,
            /auth_signin/i,
            'nextStep should point to auth_signin as the supported recovery path'
        );
    });

    test('real-auth recover: open question is surfaced for follow-up', async () => {
        const email = uniqueTestEmail('recover-openq');

        const mockCtx = createMockRequestContext('qa-recover-openq-user');
        const handler = new AuthRecoverHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: 'http://localhost:3000', authConfig }
        );
        await handler.register([]);

        const tool = mockServer.getTool('auth_recover');
        const result = await tool.cb(
            { identifier: email, backupCode: 'another-code' },
            mockCtx
        );

        const text = (result.content as any)[0]?.text as string;
        const parsed = JSON.parse(text);
        assert.ok(parsed.openQuestion, 'should surface an open question for the Lead Architect');
        assert.match(
            parsed.openQuestion,
            /OPEN-QUESTION/i,
            'openQuestion should be prefixed with OPEN-QUESTION'
        );
    });
}
