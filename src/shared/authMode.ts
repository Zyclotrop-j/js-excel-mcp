/**
 * Auth mode + config loader for the MCP auth server.
 *
 * This is the **single** reader of `process.env` for auth purposes (alongside
 * `src/server.ts`, which also reads a few non-auth env vars for binding). Every
 * other module receives its auth configuration via the `AuthConfig` value
 * returned by {@link loadAuthConfig}. See `tickets/real-auth/STUDY_FIRST.md`
 * sections [C-ENV] and [C-MODE], and `tickets/real-auth/T-10-env-and-config.md`
 * for the canonical env-var contract.
 *
 * Demo mode (`MCP_AUTH_MODE` unset or `demo`) never fails and returns the
 * current hardcoded defaults so demo behavior is byte-for-byte identical to
 * pre-T-10 `main`. Real mode fails fast at startup for missing/misconfigured
 * env vars (see T-10 "Fail-fast rules").
 */

import type { AuthDatabase } from './authDatabase/index.js';
import type { OtpMailer } from './mailer.js';

export type AuthMode = 'demo' | 'real';
export type OtpTransportKind = 'console' | 'webhook' | 'sendgrid' | 'custom';

export interface AuthConfig {
    mode: AuthMode;
    /** Path for the SQLite backend. `data/_auth.db` (demo) | `data/_auth_real.db` (real). */
    dbPath: string;
    /** `localhost` (demo) | e.g. `0.0.0.0` (real). */
    bindHost: string;
    /** `['*']` (demo) | explicit list (real). `*` is refused in real mode. */
    corsOrigins: string[];
    /** Hardcoded (demo) | required (real). JWT/session signing. */
    secret: string;
    allowUserSignup: boolean;
    /** Derived from `baseURL` (demo) | `baseURL` + `AUTH_TRUSTED_ORIGINS` CSV (real). */
    trustedOrigins: string[];
    otpTransport: OtpTransportKind;
    /** Required when `otpTransport === 'webhook'`. */
    otpWebhookUrl?: string;
    /** Custom mailer override. T-80 fills this; undefined here. */
    otpMailer?: OtpMailer;
    /** Custom DB backend override. T-81 fills this; undefined here. */
    databaseBackend?: AuthDatabase;
    dbBackend: 'sqlite' | 'd1' | 'turso' | 'postgres' | 'custom';
    /** Required when `dbBackend !== 'sqlite'`. */
    dbUrl?: string;
    /** For D1 / Turso. */
    dbAuthToken?: string;
    /** Passkey relying-party ID. `'localhost'` (demo) | env `MCP_AUTH_PASSKEY_RP_ID` (real). */
    passkeyRpID: string;
    /** Passkey relying-party display name. Defaults to `'js-excel-mcp Auth'`. */
    passkeyRpName: string;
}

/**
 * Demo secret — the hardcoded password committed to source for demo builds
 * only (per the demo-only posture of this auth server). This is the **single**
 * source of truth; `auth.ts` imports it. It does NOT rotate per server start.
 * The auto-login `/sign-in` route uses it; the auth server binds to `localhost`
 * so the credential is not reachable from outside the host.
 *
 * In demo mode this value is the only secret that appears in the startup
 * banner (it is already there today). In real mode it is never logged.
 */
export const DEMO_SECRET = 'ernCjBsavZjKxznbu_1g1g';

const DEMO_DB_PATH = 'data/_auth.db';
const REAL_DB_PATH_DEFAULT = 'data/_auth_real.db';

function parseBooleanEnv(v: string | undefined, fallback: boolean): boolean {
    if (v === undefined || v === '') return fallback;
    return v === '1' || v.toLowerCase() === 'true';
}

function parseCsv(v: string | undefined): string[] {
    if (!v) return [];
    return v.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Load the auth configuration from `process.env`. The single reader for auth
 * env vars (the only other `process.env` reader in the project is `server.ts`,
 * for non-auth binding vars).
 *
 * @param baseURL - The MCP server's base URL (e.g. `http://localhost:3000`),
 *   used to derive `trustedOrigins`.
 * @throws {Error} in real mode when required env vars are missing or
 *   misconfigured (see T-10 "Fail-fast rules"). Demo mode never throws.
 */
export function loadAuthConfig(baseURL: string): AuthConfig {
    const modeEnv = process.env.MCP_AUTH_MODE;
    const mode: AuthMode = modeEnv === 'real' ? 'real' : 'demo';

    if (mode === 'demo') {
        return {
            mode: 'demo',
            dbPath: process.env.MCP_AUTH_DB ?? DEMO_DB_PATH,
            bindHost: process.env.MCP_AUTH_BIND_HOST ?? 'localhost',
            corsOrigins: ['*'],
            secret: DEMO_SECRET,
            allowUserSignup: parseBooleanEnv(process.env.MCP_AUTH_ALLOW_USER_SIGNUP, true),
            trustedOrigins: [baseURL],
            otpTransport: 'console',
            dbBackend: 'sqlite',
            passkeyRpID: process.env.MCP_AUTH_PASSKEY_RP_ID ?? 'localhost',
            passkeyRpName: process.env.MCP_AUTH_PASSKEY_RP_NAME ?? 'js-excel-mcp Auth',
        };
    }

    // ---- real mode: fail fast on missing/misconfigured env ----

    const secret = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error('[Auth] real mode requires AUTH_SECRET or BETTER_AUTH_SECRET to be set');
    }

    const corsRaw = process.env.MCP_AUTH_CORS_ORIGINS;
    if (!corsRaw) {
        throw new Error('[Auth] real mode requires MCP_AUTH_CORS_ORIGINS (CSV); the wildcard default is refused');
    }
    const corsOrigins = parseCsv(corsRaw);
    if (corsOrigins.includes('*')) {
        throw new Error('[Auth] real mode refuses MCP_AUTH_CORS_ORIGINS="*" — set an explicit origin list');
    }
    if (corsOrigins.length === 0) {
        throw new Error('[Auth] real mode requires MCP_AUTH_CORS_ORIGINS to contain at least one origin');
    }

    const otpTransport = (process.env.MCP_AUTH_OTP_TRANSPORT ?? 'console') as OtpTransportKind;
    let otpWebhookUrl: string | undefined;
    if (otpTransport === 'webhook') {
        otpWebhookUrl = process.env.MCP_AUTH_OTP_WEBHOOK_URL;
        if (!otpWebhookUrl) {
            throw new Error('[Auth] real mode with MCP_AUTH_OTP_TRANSPORT=webhook requires MCP_AUTH_OTP_WEBHOOK_URL');
        }
    }

    const dbBackend = (process.env.MCP_AUTH_DB_BACKEND ?? 'sqlite') as AuthConfig['dbBackend'];
    let dbUrl: string | undefined;
    let dbAuthToken: string | undefined;
    if (dbBackend !== 'sqlite') {
        dbUrl = process.env.MCP_AUTH_DB_URL;
        if (!dbUrl) {
            throw new Error(`[Auth] real mode with MCP_AUTH_DB_BACKEND="${dbBackend}" requires MCP_AUTH_DB_URL`);
        }
        dbAuthToken = process.env.MCP_AUTH_DB_AUTH_TOKEN;
    }

    const trustedOrigins = [baseURL, ...parseCsv(process.env.AUTH_TRUSTED_ORIGINS)];

    return {
        mode: 'real',
        dbPath: process.env.MCP_AUTH_DB ?? REAL_DB_PATH_DEFAULT,
        bindHost: process.env.MCP_AUTH_BIND_HOST ?? 'localhost',
        corsOrigins,
        secret,
        allowUserSignup: parseBooleanEnv(process.env.MCP_AUTH_ALLOW_USER_SIGNUP, true),
        trustedOrigins,
        otpTransport,
        otpWebhookUrl,
        dbBackend,
        dbUrl,
        dbAuthToken,
        passkeyRpID: process.env.MCP_AUTH_PASSKEY_RP_ID ?? 'localhost',
        passkeyRpName: process.env.MCP_AUTH_PASSKEY_RP_NAME ?? 'js-excel-mcp Auth',
    };
}
