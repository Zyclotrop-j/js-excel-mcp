/**
 * Better Auth mode dispatcher + builders.
 *
 * `createAuth(cfg, opts)` routes to either `buildDemoAuth` (unchanged
 * behaviour, hardcoded SQLite at `cfg.dbPath`) or `buildRealAuth` (wires
 * passkey, magicLink, twoFactor.backupCodes, apiKey plugins).
 *
 * Demo mode (`MCP_AUTH_MODE` unset or `demo`) is byte-for-byte identical
 * to pre-T-20 `main` — see `STUDY_FIRST.md` §8.1.
 */

import { betterAuth } from 'better-auth';
import { mcp } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { magicLink } from 'better-auth/plugins';
import { twoFactor } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';

import type { AuthConfig } from './authMode.js';
import { DEMO_SECRET, loadAuthConfig } from './authMode.js';
import type { AuthDatabase } from './authDatabase/index.js';
import { openSqliteAuthDatabase } from './authDatabase/sqliteAuthDatabase.js';
import { resolveMailer } from './mailer.js';
import { emailOptionalPlugin } from './emailOptionalPlugin.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface CreateAuthOptions {
    baseURL: string;
    /** The MCP resource server URL (for protected resource metadata). */
    resource?: string;
    /** Path to login page (defaults to /sign-in). */
    loginPage?: string;
}

/**
 * Backward-compatible options shape used by `authServer.ts`'s current
 * `createDemoAuth(...)` call.  Kept until T-21 migrates `authServer.ts`
 * to `createAuth(cfg, opts)`.
 */
export interface CreateDemoAuthOptions {
    baseURL: string;
    resource?: string;
    loginPage?: string;
    /** @deprecated Ignored after T-20; kept for call-site compat. */
    demoMode?: boolean;
}

// ---------------------------------------------------------------------------
// `Auth` structural type — superset of what both demo and real need.
//
// better-auth's inferred return type references non-exported interfaces
// across module boundaries (TS4058). We declare only the members consumers
// actually use; `betterAuth(...)` is structurally compatible.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

/**
 * Structural type for the auth instance returned by `createAuth` (and
 * therefore both `buildDemoAuth` and `buildRealAuth`).
 *
 * Real-mode methods (passkey, magicLink, twoFactor, apiKey, signOut) are
 * included even though the demo instance won't have all of them — the
 * `as unknown as Auth` cast is safe because callers gate on mode.
 */
export interface Auth {
    /** Request handler — consumed by `toNodeHandler(auth)` from `better-auth/node`. */
    handler: AnyFn;
    api: {
        /** Used by `authServer.ts` to create the demo user (accessed via `as any`). */
        signUpEmail: AnyFn;
        /** Used by `authServer.ts` `/sign-in` flow to create a session. */
        signInEmail: AnyFn;
        /** Used by `demoTokenVerifier.verifyAccessToken` (accessed via `as any`). */
        getMcpSession: AnyFn;
        /** Required by `oAuthDiscoveryMetadata(auth)` generic constraint. */
        getMcpOAuthConfig: AnyFn;
        /** Required by `oAuthProtectedResourceMetadata(auth)` generic constraint. */
        getMCPProtectedResource: AnyFn;
        /** Sign-out (used by T-50). */
        signOut: AnyFn;

        // -- Passkey (from @better-auth/passkey) --
        generatePasskeyRegistrationOptions: AnyFn;
        verifyPasskeyRegistration: AnyFn;
        generatePasskeyAuthenticationOptions: AnyFn;
        verifyPasskeyAuthentication: AnyFn;
        listPasskeys: AnyFn;
        deletePasskey: AnyFn;
        updatePasskey: AnyFn;

        // -- Magic-link (from better-auth/plugins) --
        signInMagicLink: AnyFn;
        magicLinkVerify: AnyFn;

        // -- Two-factor / backup codes (from better-auth/plugins) --
        enableTwoFactor: AnyFn;
        disableTwoFactor: AnyFn;
        verifyBackupCode: AnyFn;
        generateBackupCodes: AnyFn;
        viewBackupCodes: AnyFn;

        // -- API key (from @better-auth/api-key) --
        createApiKey: AnyFn;
        verifyApiKey: AnyFn;
        getApiKey: AnyFn;
        updateApiKey: AnyFn;
        deleteApiKey: AnyFn;
        listApiKeys: AnyFn;
        deleteAllExpiredApiKeys: AnyFn;
    };
}

/** Back-compat alias — authServer.ts imports `DemoAuth`. */
export type DemoAuth = Auth;

// ---------------------------------------------------------------------------
// Demo user credentials (kept for authServer.ts's `/sign-in` auto-login)
// ---------------------------------------------------------------------------

/**
 * Demo user credentials for auto-login. The password is the fixed value
 * committed to source as `DEMO_SECRET` in `authMode.ts` (single source of
 * truth); it does NOT rotate per server start. Used by authServer.ts to create
 * and sign in the demo user.
 */
export const DEMO_USER_CREDENTIALS = {
    email: 'demo@example.com',
    password: DEMO_SECRET,
    name: 'Demo User'
};

// ---------------------------------------------------------------------------
// Database helper — single call site that knows about the default
// ---------------------------------------------------------------------------

/**
 * Return the database adapter for the given config. If `cfg.databaseBackend`
 * is set (T-81), use it directly; otherwise open a better-sqlite3 instance
 * at `cfg.dbPath` and call `initializeSchema` on it.
 */
function getDatabase(cfg: AuthConfig): AuthDatabase {
    if (cfg.databaseBackend) return cfg.databaseBackend;
    const db = openSqliteAuthDatabase(cfg.dbPath, cfg.mode);
    db.initializeSchema(cfg.mode);
    return db;
}

// ---------------------------------------------------------------------------
// Mode dispatcher
// ---------------------------------------------------------------------------

/**
 * Create a better-auth instance for the given mode. This is the canonical
 * entry point; `authServer.ts` (T-21) will migrate to this.
 */
export function createAuth(cfg: AuthConfig, opts: CreateAuthOptions): Auth {
    if (cfg.mode === 'demo') return buildDemoAuth(cfg, opts);
    return buildRealAuth(cfg, opts);
}

/**
 * Backward-compatible `createDemoAuth` — matches the signature that
 * `authServer.ts` currently calls. Builds a default demo `AuthConfig` from
 * `process.env` and delegates to `buildDemoAuth`.
 *
 * @deprecated Use `createAuth(cfg, opts)` instead. Will be removed in T-21.
 */
export function createDemoAuth(options: CreateDemoAuthOptions): Auth {
    const cfg = loadAuthConfig(options.baseURL);
    return buildDemoAuth(cfg, {
        baseURL: options.baseURL,
        resource: options.resource,
        loginPage: options.loginPage,
    });
}

// ---------------------------------------------------------------------------
// Demo builder — behaviour unchanged from pre-T-20
// ---------------------------------------------------------------------------

/**
 * Creates a better-auth instance configured for MCP OAuth demo.
 *
 * TS4058: The `betterAuth({...})` result transitively references the
 * non-exported `MCPOptions` interface from `better-auth/dist/plugins/mcp`,
 * which trips TS4058 across the module boundary. Fixed by casting the result
 * to the explicit structural `Auth` type.
 */
function buildDemoAuth(cfg: AuthConfig, opts: CreateAuthOptions): Auth {
    const { baseURL, resource, loginPage = '/sign-in' } = opts;

    // File-backed SQLite at cfg.dbPath. Demo data persists across server
    // restarts; delete the DB file between demo runs to reset.
    const authDb = getDatabase(cfg);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = authDb.betterAuthHandle as any;

    console.log('[Auth] Database schema initialized (%s)', cfg.dbPath);
    console.log('[Auth] ========================================');
    console.log('[Auth] Demo user credentials (auto-login):');
    console.log(`[Auth]   Email:    ${DEMO_USER_CREDENTIALS.email}`);
    console.log(`[Auth]   Password: ${DEMO_USER_CREDENTIALS.password}`);
    console.log('[Auth] ========================================');

    // MCP plugin configuration — identical to what was here before T-20.
    const mcpPlugin = mcp({
        loginPage,
        resource,
        oidcConfig: {
            loginPage,
            codeExpiresIn: 600, // 10 minutes
            accessTokenExpiresIn: 3600, // 1 hour
            refreshTokenExpiresIn: 604_800, // 7 days
            defaultScope: 'openid',
            scopes: ['openid', 'profile', 'email', 'offline_access'],
            allowDynamicClientRegistration: true,
            metadata: {
                scopes_supported: ['openid', 'profile', 'email', 'offline_access']
            }
        }
    });

    return betterAuth({
        baseURL,
        database: db,
        trustedOrigins: [baseURL.toString()],
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false
        },
        plugins: [mcpPlugin, emailOptionalPlugin],
        // logger is undefined — preserves demo-mode behaviour (server.ts
        // passes demoMode: false so the debug logger was never activated).
        logger: undefined
    }) as unknown as Auth;
}

// ---------------------------------------------------------------------------
// Real builder — wires passkey + magicLink + twoFactor + apiKey
// ---------------------------------------------------------------------------

function buildRealAuth(cfg: AuthConfig, opts: CreateAuthOptions): Auth {
    const { baseURL, resource, loginPage = '/sign-in' } = opts;

    const authDb = getDatabase(cfg);
    const mailer = resolveMailer(cfg);

    // MCP plugin — same OIDC config as demo mode (T-20 §4).
    const mcpPlugin = mcp({
        loginPage,
        resource,
        oidcConfig: {
            loginPage,
            codeExpiresIn: 600, // 10 minutes
            accessTokenExpiresIn: 3600, // 1 hour
            refreshTokenExpiresIn: 604_800, // 7 days
            defaultScope: 'openid',
            scopes: ['openid', 'profile', 'email', 'offline_access'],
            allowDynamicClientRegistration: true,
            metadata: {
                scopes_supported: ['openid', 'profile', 'email', 'offline_access']
            }
        }
    });

    // Passkey — per T-02 §3.3 (worked spike). registration.requireSession:
    // false + registration.resolveUser for passkey-first signup.
    const passkeyPlugin = passkey({
        rpID: 'localhost',
        rpName: 'js-excel-mcp Auth',
        origin: baseURL,
        registration: {
            requireSession: false,
            resolveUser: async ({ ctx, context }) => {
                // Sessionless passkey registration: the client sends userId
                // in the `context` string so we can look up the pre-created
                // user row. T-41 creates the user row before this is called.
                const userId = context;
                if (!userId) {
                    throw new Error(
                        'resolveUser requires userId in context for sessionless registration'
                    );
                }
                const user = await ctx.context.internalAdapter.findUserById(userId);
                if (!user) {
                    throw new Error(`User not found for context userId: ${userId}`);
                }
                return {
                    id: user.id,
                    name: user.name ?? 'User',
                    displayName: user.name ?? undefined,
                };
            },
        },
    });

    // Magic-link — per T-00 §4 D-00-4. sendMagicLink adapted to our
    // OtpMailer interface.
    const magicLinkPlugin = magicLink({
        sendMagicLink: async (data, _ctx) => {
            await mailer({
                to: data.email,
                magicLink: data.url,
                userId: '', // userId not available in this callback context
                flow: 'magic-link',
            });
        },
        disableSignUp: false,
        storeToken: 'hashed',
        expiresIn: 300,
        rateLimit: { window: 60, max: 5 },
    });

    // Two-factor (backup codes only) — per T-00 §4 D-00-4.
    const twoFactorPlugin = twoFactor({
        backupCodeOptions: {
            amount: 10,
            length: 10,
            storeBackupCodes: 'encrypted',
            allowPasswordless: true,
        },
        allowPasswordless: true,
    });

    // API key — no required options (arch-decision §1.5).
    const apiKeyPlugin = apiKey();

    return betterAuth({
        baseURL,
        database: authDb.betterAuthHandle,
        trustedOrigins: cfg.trustedOrigins,
        secret: cfg.secret,
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
        },
        plugins: [
            mcpPlugin,
            passkeyPlugin,
            magicLinkPlugin,
            twoFactorPlugin,
            apiKeyPlugin,
            emailOptionalPlugin,
        ],
        logger: undefined,
    }) as unknown as Auth;
}
