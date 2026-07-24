/**
 * T-72 §1 — Demo-mode regression suite (always runs).
 *
 * Guards against accidental demo regressions from any of the real-auth
 * tickets. Runs in both demo and real CI; no `MCP_AUTH_MODE` gating.
 *
 * Tests at the unit / handler level:
 *  - `loadAuthConfig` with no env returns demo defaults.
 *  - Auth tool handlers have the correct `authSurface` discriminator.
 *  - `AuthToolHandler` extends `ToolHandler` (the Excel base class).
 *  - `demoTokenVerifier` is the same object as `tokenVerifier` (back-compat).
 *  - Auth tool handlers can be registered on a `MockMcpServer`.
 */
import { strict as assert } from 'node:assert';

import { loadAuthConfig, DEMO_SECRET } from '../../src/shared/authMode.js';
import { tokenVerifier, demoTokenVerifier } from '../../src/shared/authServer.js';
import { ToolHandler } from '../../src/tools/interface.js';
import { AuthToolHandler } from '../../src/tools/auth/baseAuthTool.js';
import { AuthSignupHandler } from '../../src/tools/auth/signup.js';
import { AuthSigninHandler } from '../../src/tools/auth/signin.js';
import { AuthRecoverHandler } from '../../src/tools/auth/recover.js';
import { AuthSignoutHandler } from '../../src/tools/auth/signout.js';
import { AuthAddPasskeyHandler } from '../../src/tools/auth/addPasskey.js';
import { AuthRotateApikeyHandler } from '../../src/tools/auth/rotateApikey.js';
import { MockMcpServer, createMockRequestContext } from '../helpers/test-server.js';

export default function (test: any) {
    const REAL_BASE = 'http://localhost:3000';

    function withCleanEnv(fn: () => void): void {
        const saved: Record<string, string | undefined> = {};
        const keys = ['MCP_AUTH_MODE', 'AUTH_SECRET', 'MCP_AUTH_CORS_ORIGINS', 'MCP_AUTH_DB'];
        for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
        try { fn(); } finally {
            for (const k of keys) {
                if (saved[k] !== undefined) process.env[k] = saved[k];
                else delete process.env[k];
            }
        }
    }

    test('demo regression: loadAuthConfig returns demo defaults with no env', () => {
        withCleanEnv(() => {
            const cfg = loadAuthConfig(REAL_BASE);
            assert.equal(cfg.mode, 'demo');
            assert.equal(cfg.dbPath, 'data/_auth.db');
            assert.equal(cfg.bindHost, 'localhost');
            assert.deepEqual(cfg.corsOrigins, ['*']);
            assert.equal(cfg.secret, DEMO_SECRET);
            assert.equal(cfg.allowUserSignup, true);
            assert.equal(cfg.dbBackend, 'sqlite');
        });
    });

    test('demo regression: explicit MCP_AUTH_MODE=demo matches unset', () => {
        withCleanEnv(() => {
            process.env.MCP_AUTH_MODE = 'demo';
            const cfg = loadAuthConfig(REAL_BASE);
            assert.equal(cfg.mode, 'demo');
            assert.deepEqual(cfg.corsOrigins, ['*']);
        });
    });

    test('demo regression: bootstrap auth tools have authSurface=bootstrap', () => {
        assert.equal(AuthSignupHandler.authSurface, 'bootstrap');
        assert.equal(AuthSigninHandler.authSurface, 'bootstrap');
        assert.equal(AuthRecoverHandler.authSurface, 'bootstrap');
    });

    test('demo regression: authenticated auth tools have authSurface=authenticated', () => {
        assert.equal(AuthSignoutHandler.authSurface, 'authenticated');
        assert.equal(AuthAddPasskeyHandler.authSurface, 'authenticated');
        assert.equal(AuthRotateApikeyHandler.authSurface, 'authenticated');
    });

    test('demo regression: AuthToolHandler extends ToolHandler', () => {
        assert.ok(
            AuthToolHandler.prototype instanceof ToolHandler,
            'AuthToolHandler should extend ToolHandler'
        );
    });

    test('demo regression: demoTokenVerifier is back-compat alias for tokenVerifier', () => {
        assert.strictEqual(demoTokenVerifier, tokenVerifier,
            'demoTokenVerifier should be the same object as tokenVerifier');
    });

    test('demo regression: auth signup handler registers on MockMcpServer', async () => {
        const mockServer = new MockMcpServer();
        const mockCtx = createMockRequestContext('demo-regression-user');
        const handler = new AuthSignupHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: REAL_BASE }
        );
        await handler.register([]);

        assert.ok(mockServer.hasTool('auth_signup'), 'auth_signup should be registered');
        const tool = mockServer.getTool('auth_signup');
        assert.ok(tool, 'getTool should return the tool');
    });

    test('demo regression: auth signin handler registers on MockMcpServer', async () => {
        const mockServer = new MockMcpServer();
        const mockCtx = createMockRequestContext('demo-regression-user');
        const handler = new AuthSigninHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: REAL_BASE }
        );
        await handler.register([]);

        assert.ok(mockServer.hasTool('auth_signin'), 'auth_signin should be registered');
    });

    test('demo regression: auth recover handler registers on MockMcpServer', async () => {
        const mockServer = new MockMcpServer();
        const mockCtx = createMockRequestContext('demo-regression-user');
        const handler = new AuthRecoverHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: REAL_BASE }
        );
        await handler.register([]);

        assert.ok(mockServer.hasTool('auth_recover'), 'auth_recover should be registered');
    });

    test('demo regression: auth signout handler registers on MockMcpServer', async () => {
        const mockServer = new MockMcpServer();
        const mockCtx = createMockRequestContext('demo-regression-user');
        const handler = new AuthSignoutHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: REAL_BASE }
        );
        await handler.register([]);

        assert.ok(mockServer.hasTool('auth_signout'), 'auth_signout should be registered');
    });

    test('demo regression: auth rotate_apikey handler registers on MockMcpServer', async () => {
        const mockServer = new MockMcpServer();
        const mockCtx = createMockRequestContext('demo-regression-user');
        const handler = new AuthRotateApikeyHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: REAL_BASE }
        );
        await handler.register([]);

        assert.ok(mockServer.hasTool('auth_rotate_apikey'), 'auth_rotate_apikey should be registered');
    });

    test('demo regression: auth add_passkey handler registers on MockMcpServer', async () => {
        const mockServer = new MockMcpServer();
        const mockCtx = createMockRequestContext('demo-regression-user');
        const handler = new AuthAddPasskeyHandler(
            mockServer as any,
            mockCtx as any,
            { get: () => {}, post: () => {} } as any,
            { serverHost: REAL_BASE }
        );
        await handler.register([]);

        assert.ok(mockServer.hasTool('auth_add_passkey'), 'auth_add_passkey should be registered');
    });
}
