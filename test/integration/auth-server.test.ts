/**
 * Integration tests for src/shared/authServer.ts:
 *   - getAuth() throws before setupAuthServer is called
 *   - after setupAuthServer, getAuth() returns an instance exposing `.api`
 *   - demoTokenVerifier.verifyAccessToken rejects an unknown token with
 *     OAuthError(InvalidToken) (or an underlying error from better-auth)
 *
 * Uses unique ports 13501 (auth) / 13500 (mcp) so the running PM2 server
 * on 3001/3000 is not disturbed. `express.application.listen` is stubbed
 * for the duration of this module so `setupAuthServer`'s `authApp.listen`
 * does NOT hold the test process's event loop open after the test runs.
 */
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import express from 'express';
import { OAuthError } from '@modelcontextprotocol/server';
import {
    getAuth,
    setupAuthServer,
    demoTokenVerifier
} from '../../src/shared/authServer.js';

// Stub express application.listen so it never opens a real socket. Returns a
// fake Server-like EventEmitter with a no-op close(). The original `listen`
// callback (if any) is invoked on next tick so any setup hooks in setupAuthServer
// still fire.
const expressApp = express as unknown as { application: { listen: (...args: any[]) => any } };
expressApp.application.listen = function (this: any, ...args: any[]) {
    const fakeServer = new EventEmitter() as any;
    fakeServer.address = () => ({ port: args[0], family: 'IPv4', address: '127.0.0.1' });
    fakeServer.close = () => { setImmediate(() => fakeServer.emit('close')); return fakeServer; };
    const cb = args[args.length - 1];
    if (typeof cb === 'function') setImmediate(() => (cb as (err?: Error) => void)(undefined));
    return fakeServer;
} as any;

const AUTH_PORT = 13501;
const MCP_PORT = 13500;
const authServerUrl = new URL(`http://localhost:${AUTH_PORT}`);
const mcpServerUrl = new URL(`http://localhost:${MCP_PORT}`);

export default function (test: any) {
    test('authServer: getAuth() throws before setupAuthServer is called', async () => {
        let threw: unknown;
        try {
            getAuth();
        } catch (e) {
            threw = e;
        }
        assert.ok(threw, 'getAuth() should throw before setupAuthServer is called');
        assert.ok(threw instanceof Error);
        assert.ok(/not initialized/i.test((threw as Error).message));
    });

    test('authServer: after setupAuthServer, getAuth() returns instance with .api', async () => {
        setupAuthServer({ authServerUrl, mcpServerUrl, demoMode: false, autoConsent: false });
        const auth = getAuth();
        assert.ok(auth, 'getAuth() should return an instance after setup');
        assert.ok(auth.api, 'auth instance should expose .api');
        assert.equal(typeof (auth.api as any).getMcpSession, 'function');
    });

    test('authServer: demoTokenVerifier rejects an unknown token', async () => {
        let threw: unknown;
        try {
            await demoTokenVerifier.verifyAccessToken('definitely-not-a-real-token');
        } catch (e) {
            threw = e;
        }
        assert.ok(threw, 'verifyAccessToken should reject an unknown token');
        if (threw instanceof OAuthError) {
            assert.equal(threw.code, 'invalid_token');
        } else {
            assert.ok(threw instanceof Error, 'rejects with some error');
        }
    });
}