/**
 * Better Auth Server Setup for MCP
 *
 * Creates a standalone OAuth Authorization Server using better-auth
 * that MCP clients can use to obtain access tokens. Supports both
 * demo mode (hardcoded credentials, loopback-only) and real mode
 * (configurable CORS, bind host, pending-login handoff).
 *
 * See: https://www.better-auth.com/docs/plugins/mcp
 */

import type { OAuthTokenVerifier } from '@modelcontextprotocol/express';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import { toNodeHandler } from 'better-auth/node';
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from 'better-auth/plugins';
import cors from 'cors';
import type { Express, NextFunction, Request, Response as ExpressResponse, Router } from 'express';
import express from 'express';

import type { DemoAuth } from './auth';
import { createAuth, DEMO_USER_CREDENTIALS } from './auth';
import type { AuthConfig } from './authMode';
import { consumePendingLogin, peekMostRecentPendingLogin } from './pendingLogin';

export interface SetupAuthServerOptions {
    authServerUrl: URL;
    mcpServerUrl: URL;
    /** Auth configuration loaded from `process.env` by `loadAuthConfig` in `authMode.ts`. */
    authConfig: AuthConfig;
    /**
     * Enable verbose logging of better-auth requests/responses.
     * WARNING: This may log sensitive information like tokens and cookies.
     * Only use for debugging purposes.
     */
    dangerousLoggingEnabled?: boolean;
    /**
     * DEMO ONLY. When `true`, the `/api/auth/mcp/authorize` endpoint skips the
     * consent screen entirely and immediately 302s back to the client's
     * `redirect_uri` with an authorization `code` — exactly what would happen
     * after a real user clicked **Approve**. Mechanically this strips the OIDC
     * `prompt` parameter from the request before it reaches better-auth, so the
     * MCP plugin's authorize handler takes its no-consent fast path. Combined
     * with the `/sign-in` page that auto-signs-in the demo user, the entire
     * authorization-code flow becomes a deterministic chain of 302s a headless
     * client can follow with `fetch(..., { redirect: 'manual' })`.
     *
     * The `examples/oauth/` server enables this when
     * `OAUTH_DEMO_AUTO_CONSENT=1` so the CI client (`client.ts`) can drive the
     * full browser flow without a browser. NEVER enable in production.
     * Ignored unless `authConfig.mode === 'demo'`.
     */
    autoConsent?: boolean;
    /**
     * Optional Express app to mount the auth routes onto. When omitted
     * (local Node mode), `setupAuthServer` creates its own `authApp`,
     * calls `authApp.listen(AUTH_PORT, ...)` on a separate port, and
     * returns nothing.
     *
     * When provided (Cloudflare Workers mode), `setupAuthServer` mounts
     * all auth routes (`/api/auth/*`, `/sign-in`,
     * `/.well-known/oauth-authorization-server`) onto the supplied app
     * and does NOT call `listen()` — the Worker's single fetch handler
     * drives everything via the port-routing-key of the same Express
     * instance. Auth routes share path prefixes with the MCP routes
     * (`/mcp`, `/mcp/bootstrap`, `/.well-known/oauth-protected-resource
     * /mcp`) without collision.
     */
    mountApp?: Express;
}

// Store auth instance globally so it can be used for token verification
let globalAuth: DemoAuth | null = null;
let demoUserCreated = false;

/**
 * Gets the global auth instance (must call setupAuthServer first)
 */
export function getAuth(): DemoAuth {
    if (!globalAuth) {
        throw new Error('Auth not initialized. Call setupAuthServer first.');
    }
    return globalAuth;
}

/**
 * Ensures the demo user exists by calling signUpEmail (creates user with proper password hash)
 * Returns true if successful, false if user already exists (which is fine)
 */
async function ensureDemoUserExists(auth: DemoAuth): Promise<void> {
    if (demoUserCreated) return;

    try {
        // Try to sign up the demo user
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (auth.api as any).signUpEmail({
            body: {
                email: DEMO_USER_CREDENTIALS.email,
                password: DEMO_USER_CREDENTIALS.password,
                name: DEMO_USER_CREDENTIALS.name
            }
        });
        console.log('[Auth] Demo user created via signUpEmail');
        demoUserCreated = true;
    } catch (error) {
        // User might already exist, which is fine
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('already') || message.includes('exists') || message.includes('unique')) {
            console.log('[Auth] Demo user already exists');
            demoUserCreated = true;
        } else {
            console.error('[Auth] Failed to create demo user:', error);
            throw error;
        }
    }
}

// ---------------------------------------------------------------------------
// T-22 helpers — real-mode /sign-in support
// ---------------------------------------------------------------------------

/**
 * Tiny HTML page shown when required OAuth query parameters are missing.
 * Mode-agnostic (demo's 400 page has demo-specific copy; this one does not).
 */
function missingParamsHtml(): string {
    return `<!DOCTYPE html>
<html>
<head><title>Missing OAuth Parameters</title></head>
<body>
    <h1>OAuth Server</h1>
    <p>Missing required OAuth parameters. This page should be accessed via the OAuth flow.</p>
</body>
</html>`;
}

/**
 * 302-redirect to the authorization endpoint, preserving all original OAuth
 * query parameters.  Does NOT strip `prompt=consent` — in real mode the
 * consent screen is real and the user must approve.
 */
function redirectToAuthorize(
    res: ExpressResponse,
    queryParams: URLSearchParams,
    authServerUrl: URL,
): void {
    const authorizeUrl = new URL('/api/auth/mcp/authorize', authServerUrl);
    authorizeUrl.search = queryParams.toString();
    res.redirect(authorizeUrl.toString());
}

/**
 * Small HTML page that polls for a pending login entry.
 *
 * Two refresh mechanisms:
 * - `<meta http-equiv="refresh" content="2">` reloads the current URL
 *   (with all original OAuth query params) every 2 seconds as a fallback.
 * - A client-side script hits `/api/auth/pending-login-wait?since=<now>`
 *   every 1 second and only forces `location.reload()` when the endpoint
 *   returns `{ ready: true }`, avoiding unnecessary hammering.
 */
function pollingHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Waiting for Sign-In</title>
    <meta http-equiv="refresh" content="2">
</head>
<body>
    <h1>Waiting for sign-up to complete…</h1>
    <p>If this takes more than a minute, restart the request.</p>
    <script>
(async function() {
    var since = Date.now();
    while (true) {
        try {
            var resp = await fetch('/api/auth/pending-login-wait?since=' + since);
            var data = await resp.json();
            if (data.ready) { location.reload(); return; }
        } catch (e) { /* meta refresh is the fallback */ }
        await new Promise(function(r) { setTimeout(r, 1000); });
    }
})();
    </script>
</body>
</html>`;
}

/**
 * Sets up and starts the OAuth Authorization Server on a separate port.
 *
 * @param options - Server configuration
 */
export async function setupAuthServer(options: SetupAuthServerOptions): Promise<void> {
    const { authServerUrl, mcpServerUrl, authConfig, dangerousLoggingEnabled = false, autoConsent = false } = options;

    // Create better-auth instance via mode dispatcher (async — D1 schema
    // init may await a round-trip to Cloudflare D1 before better-auth can
    // issue its first query).
    const auth = await createAuth(authConfig, {
        baseURL: authServerUrl.toString().replace(/\/$/, ''),
        resource: mcpServerUrl.toString(),
        loginPage: '/sign-in',
    });

    // Store globally for token verification
    globalAuth = auth;

    // Create Express app for auth server (local Node mode). When called with
    // `mountApp` (Cloudflare Workers mode — see option doc), auth routes are
    // mounted onto the supplied MCP Express app instead, sharing the single
    // Worker fetch handler. Auth and MCP route path prefixes are disjoint
    // (`/api/auth/*`, `/sign-in`, `/.well-known/oauth-authorization-server`
    // vs `/mcp`, `/mcp/bootstrap`,
    // `/.well-known/oauth-protected-resource/mcp`).
    const authApp = options.mountApp ?? express();

    // CORS — demo allows all origins; real uses the explicit list from authConfig.
    // The `cors` package accepts string or string[].
    const corsOrigin = authConfig.mode === 'demo' ? '*' : authConfig.corsOrigins;
    // On Workers we mount onto the MCP app, which already has its own CORS
    // middleware from `server.ts`. Calling `app.use(cors(...))` again is
    // idempotent for OPTIONS handling and only widens the origin list, so it
    // is safe to call in both modes.
    authApp.use(cors({ origin: corsOrigin }));

    // Create better-auth handler
    // toNodeHandler bypasses Express methods
    const betterAuthHandler = toNodeHandler(auth);

    // The issuer identifier this AS publishes in its metadata; must exactly match the
    // `issuer` value better-auth emits at /.well-known/oauth-authorization-server.
    const issuer = authServerUrl.toString().replace(/\/$/, '');
    const issuerOrigin = new URL(issuer).origin;

    // RFC 9207 (SEP-2468): append `iss` to every authorization-response redirect (success
    // and error) that targets the client's redirect_uri. better-auth does not emit `iss`
    // itself yet, so intercept the 302 Location header. Internal hops (to /sign-in or back
    // to /api/auth/mcp/authorize) are left untouched.
    authApp.use('/api/auth/mcp/authorize', (_req: Request, res: ExpressResponse, next: NextFunction) => {
        const originalWriteHead = res.writeHead.bind(res);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.writeHead = function (statusCode: number, ...args: any[]) {
            const headers = args.find(a => typeof a === 'object' && a !== null) as Record<string, string> | undefined;
            const loc = headers?.location ?? headers?.Location ?? (res.getHeader('Location') as string | undefined);
            if (statusCode >= 300 && statusCode < 400 && loc && !loc.startsWith('/') && new URL(loc).origin !== issuerOrigin) {
                const u = new URL(loc);
                u.searchParams.set('iss', issuer);
                if (headers && 'location' in headers) headers.location = u.href;
                else if (headers && 'Location' in headers) headers.Location = u.href;
                else res.setHeader('Location', u.href);
            }
            return originalWriteHead(statusCode, ...args);
        } as typeof res.writeHead;
        next();
    });

    // DEMO ONLY: simulate the user clicking "Approve" on the consent screen.
    // The SDK auth driver appends `prompt=consent` whenever it requests the
    // `offline_access` scope (per OIDC §11). With a real user, better-auth
    // would render a consent UI and wait for an explicit Approve; here we drop
    // `prompt` from the query before it reaches better-auth so its authorize
    // handler takes the no-consent fast path and 302s straight back to
    // `redirect_uri?code=...`. See {@link SetupAuthServerOptions.autoConsent}.
    // Force-disabled in real mode: `prompt=consent` must reach better-auth.
    if (authConfig.mode === 'demo' && autoConsent) {
        authApp.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
            const qmark = req.url.indexOf('?');
            if (req.path === '/api/auth/mcp/authorize' && qmark !== -1) {
                const search = new URLSearchParams(req.url.slice(qmark + 1));
                if (search.has('prompt')) {
                    search.delete('prompt');
                    const qs = search.toString();
                    // toNodeHandler reconstructs the Fetch Request from req.url
                    // (req.baseUrl is empty at the app level), so rewriting it
                    // here is what better-auth's handler will see.
                    req.url = `/api/auth/mcp/authorize${qs ? `?${qs}` : ''}`;
                }
            }
            next();
        });
    }

    // T-22: Polling endpoint for the real-mode pending-login wait page.
    // Intentionally unauthenticated — leaks only "pending login exists, yes/no",
    // not the nonce or userId.
    // MUST be registered BEFORE the better-auth catch-all below so
    // toNodeHandler doesn't swallow the request.
    authApp.get('/api/auth/pending-login-wait', (req: Request, res: ExpressResponse) => {
        if (authConfig.mode !== 'real') { res.status(404).end(); return; }
        const since = Number(req.query.since ?? 0);
        const pending = peekMostRecentPendingLogin();
        res.json({ ready: !!pending && pending.expiresAt > since, expiresAt: pending?.expiresAt ?? null });
    });

    // Mount better-auth handler BEFORE body parsers
    // toNodeHandler reads the raw request body, so Express must not consume it first
    if (dangerousLoggingEnabled) {
        // Verbose logging mode - intercept at Node.js level to see all requests/responses
        // WARNING: This may log sensitive information like tokens and cookies
        authApp.all('/api/auth/{*splat}', (req, res) => {
            const ts = new Date().toISOString();
            console.log(`\n${'='.repeat(60)}`);
            console.log(`${ts} [AUTH] ${req.method} ${req.originalUrl}`);
            console.log(`${ts} [AUTH] Query:`, JSON.stringify(req.query));
            console.log(`${ts} [AUTH] Headers.Cookie:`, req.headers.cookie?.slice(0, 100));

            // Intercept writeHead to capture status and headers (including redirects)
            const originalWriteHead = res.writeHead.bind(res);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res.writeHead = function (statusCode: number, ...args: any[]) {
                console.log(`${ts} [AUTH] >>> Response Status: ${statusCode}`);
                // Headers can be in different positions depending on the overload
                const headers = args.find(a => typeof a === 'object' && a !== null);
                if (headers) {
                    if (headers.location || headers.Location) {
                        console.log(`${ts} [AUTH] >>> Location (redirect): ${headers.location || headers.Location}`);
                    }
                    console.log(`${ts} [AUTH] >>> Headers:`, JSON.stringify(headers));
                }
                return originalWriteHead(statusCode, ...args);
            };

            // Intercept write to capture response body
            const originalWrite = res.write.bind(res);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            res.write = function (chunk: any, ...args: any[]) {
                if (chunk) {
                    const bodyPreview = typeof chunk === 'string' ? chunk.slice(0, 500) : chunk.toString().slice(0, 500);
                    console.log(`${ts} [AUTH] >>> Body: ${bodyPreview}`);
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return originalWrite(chunk, ...(args as [any]));
            };

            return betterAuthHandler(req, res);
        });
    } else {
        // Normal mode - no verbose logging
        authApp.all('/api/auth/{*splat}', toNodeHandler(auth));
    }

    // OAuth metadata endpoints using better-auth's built-in handlers
    // Add explicit OPTIONS handler for CORS preflight
    authApp.options('/.well-known/oauth-authorization-server', cors({ origin: corsOrigin }));
    // Wrap better-auth's metadata to advertise RFC 9207 support (the `iss` middleware
    // above makes that claim true).
    const discoveryHandler = oAuthDiscoveryMetadata(auth);
    authApp.get('/.well-known/oauth-authorization-server', cors({ origin: corsOrigin }), async (req: Request, res: ExpressResponse) => {
        const upstream = await discoveryHandler(new Request(new URL(req.originalUrl, issuer)));
        const body = (await upstream.json()) as Record<string, unknown>;
        body.authorization_response_iss_parameter_supported = true;
        res.status(upstream.status).json(body);
    });

    // Body parsers for non-better-auth routes (like /sign-in)
    authApp.use(express.json());
    authApp.use(express.urlencoded({ extended: true }));

    // -----------------------------------------------------------------------
    // /sign-in route — mode-branched
    // Demo: auto-login as the demo user (byte-for-byte identical to pre-T-21).
    // Real: T-22 pending-login-aware handler (re-emits captured cookies).
    // -----------------------------------------------------------------------

    // Demo handler — extracted verbatim from the inline route body.
    const demoSignInHandler = async (req: Request, res: ExpressResponse): Promise<void> => {
        // Get the OAuth authorization parameters from the query string
        const queryParams = new URLSearchParams(req.query as Record<string, string>);
        const redirectUri = queryParams.get('redirect_uri');
        const clientId = queryParams.get('client_id');

        if (!redirectUri || !clientId) {
            res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Demo Login</title></head>
                <body>
                    <h1>Demo OAuth Server</h1>
                    <p>Missing required OAuth parameters. This page should be accessed via OAuth flow.</p>
                </body>
                </html>
            `);
            return;
        }

        try {
            // Ensure demo user exists (creates with proper password hash)
            await ensureDemoUserExists(auth);

            // Create a session using better-auth's signIn API with asResponse to get Set-Cookie headers
            const signInResponse = await auth.api.signInEmail({
                body: {
                    email: DEMO_USER_CREDENTIALS.email,
                    password: DEMO_USER_CREDENTIALS.password
                },
                asResponse: true
            });

            console.log('[Auth] Sign-in response status:', signInResponse.status);

            // Forward all Set-Cookie headers from better-auth's response
            const setCookieHeaders = signInResponse.headers.getSetCookie();
            console.log('[Auth] Set-Cookie headers:', setCookieHeaders);

            for (const cookie of setCookieHeaders) {
                res.append('Set-Cookie', cookie);
            }

            console.log(`[Auth Server] Session created, redirecting to authorize`);

            // Strip the `prompt` parameter so better-auth takes the no-consent
            // fast path after the session is created.  Without this, the MCP SDK
            // auth driver's `prompt=consent` (added for `offline_access` scope)
            // causes better-auth to redirect back to the login page, creating an
            // infinite sign-in ↔ authorize loop.
            queryParams.delete('prompt');

            // Redirect to the authorization endpoint
            const authorizeUrl = new URL('/api/auth/mcp/authorize', authServerUrl);
            authorizeUrl.search = queryParams.toString();

            res.redirect(authorizeUrl.toString());
        } catch (error) {
            console.error('[Auth Server] Failed to create session:', error);
            res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Demo Login Error</title></head>
                <body>
                    <h1>Demo OAuth Server - Error</h1>
                    <p>Failed to create demo session: ${error instanceof Error ? error.message : 'Unknown error'}</p>
                    <pre>${error instanceof Error ? error.stack : ''}</pre>
                </body>
                </html>
            `);
        }
    };

    // Real handler — T-22: pending-login-aware sign-in.
    //
    // Cookie-emission contract with T-41: the auth_signup tool MUST store
    // `cookieHeaders` (from `signInEmail({ asResponse: true }).headers.getSetCookie()`)
    // on the PendingLogin entry it creates.  This handler re-emits those
    // captured Set-Cookie headers without calling signInEmail again — the
    // signup tool already established the session server-side.
    const realSignInHandler = async (req: Request, res: ExpressResponse): Promise<void> => {
        const queryParams = new URLSearchParams(req.query as Record<string, string>);
        const redirectUri = queryParams.get('redirect_uri');
        const clientId = queryParams.get('client_id');
        if (!redirectUri || !clientId) {
            res.status(400).send(missingParamsHtml());
            return;
        }

        // Try the query-param fast path (Option B optimisation from T-01).
        let pending = null as ReturnType<typeof peekMostRecentPendingLogin>;
        const nonce = queryParams.get('login_nonce');
        if (nonce) pending = consumePendingLogin(nonce);
        if (!pending) pending = peekMostRecentPendingLogin();

        if (pending && pending.cookieHeaders?.length) {
            // Fast path: re-emit cookies captured by the signup tool (T-41),
            // then redirect to the authorization endpoint.
            for (const c of pending.cookieHeaders) res.append('Set-Cookie', c);
            if (nonce) consumePendingLogin(nonce); // already consumed above; idempotent safety net
            redirectToAuthorize(res, queryParams, authServerUrl);
            return;
        }

        // Slow path: render a small HTML page that polls and auto-reloads.
        res.status(200).send(pollingHtml());
    };

    // Route branches on mode
    authApp.get('/sign-in', async (req: Request, res: ExpressResponse) => {
        if (authConfig.mode === 'demo') return demoSignInHandler(req, res);
        return realSignInHandler(req, res);
    });

    // Start the auth server — bind to loopback in demo, configurable in real.
    //
    // Cloudflare Workers mode (`mountApp` provided): we mounted the auth
    // routes onto the MCP app, and there is no second TCP port on a
    // Worker — `httpServerHandler({ port: server.port })` drives the single
    // Express instance. The standalone `listen()` would no-op on Workers
    // anyway (no real network port), but we also skip it to avoid the
    // startup banner lying about a port that doesn't exist there. The
    // banner below logs only on the local-Node path.
    if (options.mountApp) {
        const corsSummary = authConfig.mode === 'demo'
            ? 'CORS *'
            : `CORS=${authConfig.corsOrigins.length} origin${authConfig.corsOrigins.length !== 1 ? 's' : ''}`;
        if (authConfig.mode === 'demo') {
            console.log(`[Auth] mode=demo mounted on same Worker (${corsSummary}, autoConsent=${autoConsent ? 'on' : 'off'})`);
        } else {
            console.log(`[Auth] mode=real mounted on same Worker (${corsSummary}, signup=${authConfig.allowUserSignup ? 'on' : 'off'}, backend=${authConfig.dbBackend})`);
        }
        console.log(`  Authorization: ${authServerUrl}api/auth/mcp/authorize`);
        console.log(`  Token:         ${authServerUrl}api/auth/mcp/token`);
        console.log(`  Metadata:      ${authServerUrl}.well-known/oauth-authorization-server`);
        return;
    }

    const authPort = Number.parseInt(authServerUrl.port, 10);
    authApp.listen(authPort, authConfig.bindHost, (error?: Error) => {
        if (error) {
            console.error('Failed to start auth server:', error);
            // eslint-disable-next-line unicorn/no-process-exit
            process.exit(1);
        }
        const corsSummary = authConfig.mode === 'demo'
            ? 'CORS *'
            : `CORS=${authConfig.corsOrigins.length} origin${authConfig.corsOrigins.length !== 1 ? 's' : ''}`;
        if (authConfig.mode === 'demo') {
            console.log(`[Auth] mode=demo  (${authConfig.bindHost === 'localhost' ? 'loopback' : `bind=${authConfig.bindHost}`}, ${corsSummary}, autoConsent=${autoConsent ? 'on' : 'off'})`);
        } else {
            console.log(`[Auth] mode=real  (bind=${authConfig.bindHost}, ${corsSummary}, signup=${authConfig.allowUserSignup ? 'on' : 'off'}, backend=${authConfig.dbBackend})`);
        }
        console.log(`  Authorization: ${authServerUrl}api/auth/mcp/authorize`);
        console.log(`  Token: ${authServerUrl}api/auth/mcp/token`);
        console.log(`  Metadata: ${authServerUrl}.well-known/oauth-authorization-server`);
    });
}

/**
 * Creates an Express router that serves OAuth Protected Resource Metadata
 * on the MCP server using better-auth's built-in handler.
 *
 * This is needed because MCP clients discover the auth server by first
 * fetching protected resource metadata from the MCP server.
 *
 * Per RFC 9728 Section 3, the metadata URL includes the resource path.
 * E.g., for resource http://localhost:3000/mcp, metadata is at
 * http://localhost:3000/.well-known/oauth-protected-resource/mcp
 *
 * See: https://www.better-auth.com/docs/plugins/mcp#oauth-protected-resource-metadata
 *
 * @param resourcePath - The path of the MCP resource (e.g., '/mcp'). Defaults to '/mcp'.
 */
export function createProtectedResourceMetadataRouter(resourcePath = '/mcp'): Router {
    const auth = getAuth();
    const router = express.Router();

    // Construct the metadata path per RFC 9728 Section 3
    const metadataPath = `/.well-known/oauth-protected-resource${resourcePath}`;

    // Enable CORS for browser-based clients to discover the auth server
    // Add explicit OPTIONS handler for CORS preflight
    router.options(metadataPath, cors());
    router.get(metadataPath, cors(), toNodeHandler(oAuthProtectedResourceMetadata(auth)));

    return router;
}

// T-00 Outcome B: the MCP plugin's token endpoint does not accept API keys,
// so the verifier must recognise them directly via `auth.api.verifyApiKey`.
const API_KEY_FALLTHROUGH = true;

/**
 * API-key fallthrough for {@link tokenVerifier}. Calls the `@better-auth/api-key`
 * plugin's `verifyApiKey` server API and synthesises an {@link AuthInfo} from
 * the result. The user identifier is `result.key.referenceId` (NOT `userId` —
 * the apiKey plugin stores the caller-supplied userId as `referenceId` on the
 * row). `verifyApiKey` does NOT return a top-level `userId`.
 *
 * API confirmed against installed `@better-auth/api-key@1.6.23` types
 * (`node_modules/@better-auth/api-key/dist/index-CI6mGUwK.d.mts`).
 */
async function verifyApiKey(auth: DemoAuth, token: string): Promise<AuthInfo> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (auth.api as any).verifyApiKey({ body: { key: token } });
    if (!result || result.valid !== true || !result.key) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid API key');
    }
    // API keys don't expire in the same way MCP tokens do; use a long horizon.
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    return {
        token,
        clientId: result.key.id ?? 'mcp-api-key',
        scopes: ['openid', 'profile', 'email', 'offline_access'],
        expiresAt,
        extra: { userId: result.key.referenceId, keyId: result.key.id, credentialType: 'api-key' }
    };
}

/**
 * {@link OAuthTokenVerifier} backed by better-auth's `getMcpSession` with an
 * API-key fallthrough (when `API_KEY_FALLTHROUGH` is true). Pass this to
 * `requireBearerAuth({ verifier: tokenVerifier, ... })` from
 * `@modelcontextprotocol/express` to validate Bearer tokens against the
 * Authorization Server started by `setupAuthServer`.
 *
 * Resolution order:
 * 1. MCP OIDC session lookup (`auth.api.getMcpSession`) — works for tokens
 *    minted by the standard OAuth code flow.
 * 2. If no session and `API_KEY_FALLTHROUGH` is true, API-key verification
 *    (`auth.api.verifyApiKey`) — works for long-lived `mcp_...` keys issued
 *    by `auth_rotate_apikey` (T-52).
 * 3. Otherwise, throws `OAuthError(InvalidToken)`.
 */
export const tokenVerifier: OAuthTokenVerifier = {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
        const auth = getAuth();

        const headers = new Headers();
        headers.set('Authorization', `Bearer ${token}`);

        // Try the MCP OIDC session first.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = await (auth.api as any).getMcpSession({ headers });
        if (session) {
            const scopes = typeof session.scopes === 'string' ? session.scopes.split(' ') : ['openid'];
            const expiresAt = session.accessTokenExpiresAt
                ? Math.floor(new Date(session.accessTokenExpiresAt).getTime() / 1000)
                : Math.floor(Date.now() / 1000) + 3600;

            return { token, clientId: session.clientId, scopes, expiresAt, extra: { userId: session.userId } };
        }

        // T-00 Outcome B: fall through to API-key verification.
        if (API_KEY_FALLTHROUGH) {
            return verifyApiKey(auth, token);
        }

        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid token');
    }
};

/** Back-compat alias — external imports of `demoTokenVerifier` still work. */
export const demoTokenVerifier = tokenVerifier;
