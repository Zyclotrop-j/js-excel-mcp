/**
 * Shared setup helper for real-mode E2E tests (T-72).
 *
 * Sets `process.env` for real mode, stubs `express.application.listen`
 * so `setupAuthServer` does not open a real socket, deletes any stale
 * test DB, and calls `setupAuthServer` with a real-mode `AuthConfig`.
 * The resulting better-auth instance is stored in the module-level
 * `globalAuth` singleton inside `authServer.ts`; test files call
 * `getAuth()` to access it.
 *
 * Also provides `isRealMode()` and `cleanupRealAuthTestEnv()` for
 * self-skipping and DB cleanup.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import express from 'express';

import { loadAuthConfig, type AuthConfig } from '../../src/shared/authMode.js';
import { setupAuthServer } from '../../src/shared/authServer.js';

export const TEST_DB_PATH = 'data/_auth_real_test.db';
const AUTH_PORT = 14501;
const MCP_PORT = 14500;

let initialized = false;
let cachedConfig: AuthConfig | null = null;

/**
 * Stub `express.application.listen` so `setupAuthServer`'s
 * `authApp.listen` does NOT hold the test process's event loop open.
 * Returns a fake Server-like EventEmitter with a no-op close().
 */
function stubExpressListen(): void {
    const expressApp = express as unknown as { application: { listen: (...args: unknown[]) => unknown } };
    expressApp.application.listen = function (this: unknown, ...args: unknown[]) {
        const fakeServer = new EventEmitter() as unknown as Record<string, unknown>;
        fakeServer.address = () => ({ port: args[0], family: 'IPv4', address: '127.0.0.1' });
        fakeServer.close = () => {
            setImmediate(() => (fakeServer as EventEmitter).emit('close'));
            return fakeServer;
        };
        const cb = args[args.length - 1];
        if (typeof cb === 'function') {
            setImmediate(() => (cb as (err?: Error) => void)(undefined));
        }
        return fakeServer;
    } as unknown as typeof expressApp.application.listen;
}

/**
 * Set up the real-mode auth server for tests. Idempotent — only
 * initializes once per process. Returns the `AuthConfig` so test
 * files can read `dbPath` and other fields.
 */
export function setupRealAuthTestEnv(): AuthConfig {
    if (initialized && cachedConfig) return cachedConfig;

    // Set env vars for real mode BEFORE loadAuthConfig is called.
    process.env.MCP_AUTH_MODE = 'real';
    process.env.AUTH_SECRET = 'test-secret-for-qa-real-auth';
    process.env.MCP_AUTH_CORS_ORIGINS = 'http://localhost:3000';
    process.env.MCP_AUTH_DB = TEST_DB_PATH;

    // Delete stale test DB so each run starts fresh.
    if (existsSync(TEST_DB_PATH)) {
        try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
    }

    stubExpressListen();

    const cfg = loadAuthConfig(`http://localhost:${MCP_PORT}`);
    setupAuthServer({
        authServerUrl: new URL(`http://localhost:${AUTH_PORT}`),
        mcpServerUrl: new URL(`http://localhost:${MCP_PORT}/mcp`),
        authConfig: cfg,
    });

    cachedConfig = cfg;
    initialized = true;
    return cfg;
}

/**
 * Delete the test DB. Call after all tests finish.
 */
export function cleanupRealAuthTestEnv(): void {
    if (existsSync(TEST_DB_PATH)) {
        try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
    }
}

/**
 * True when `MCP_AUTH_MODE=real` is set (i.e. the real-auth runner is active).
 */
export function isRealMode(): boolean {
    return process.env.MCP_AUTH_MODE === 'real';
}

/**
 * Generate a unique email for a test user. Uses a counter so emails
 * are deterministic within a single process.
 */
let emailCounter = 0;
export function uniqueTestEmail(prefix: string): string {
    return `qa-${prefix}-${++emailCounter}@example.com`;
}
