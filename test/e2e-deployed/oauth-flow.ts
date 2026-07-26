/**
 * OAuth 2.1 authorization-code flow for the MCP server's better-auth OIDC.
 *
 * Drives the full PKCE flow from a headless Node script:
 *   1. Fetch OAuth discovery metadata (issuer, endpoints).
 *   2. Register an OAuth client (RFC 7591 dynamic registration).
 *   3. Generate PKCE code_verifier + code_challenge (S256).
 *   4. POST /mcp/bootstrap → auth_signup (or auth_signin) → get loginNonce.
 *   5. GET /authorize → 302 to /sign-in (no session yet).
 *   6. GET /sign-in?login_nonce=<nonce>&<original params> → consume
 *      pending-login, re-emit Set-Cookie, 302 to /authorize.
 *   7. GET /authorize (with cookies) → 302 to redirect_uri?code=...&state=...
 *   8. POST /token (code + code_verifier) → access_token.
 *
 * All redirects are followed manually (`redirect: 'manual'`) so we can
 * intercept the Location header at each step and pass cookies between
 * hops.
 */

import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { createMcpClient } from './mcp-client.js';

export interface AuthResult {
    accessToken: string;
    refreshToken?: string;
    clientId: string;
}

export async function signUpAndAuth(
    baseUrl: string,
    name: string,
    email: string,
    password: string,
): Promise<{ auth: AuthResult; backupCodes: string[] }> {
    const discovery = await fetchOAuthDiscovery(baseUrl);
    const client = await registerClient(discovery.registration_endpoint);
    const pkce = generatePkce();
    const redirectUri = 'http://localhost/callback';

    // Step 4: signup via bootstrap
    const mcp = createMcpClient({ baseUrl, endpoint: '/mcp/bootstrap' });
    await mcp.initialize();
    const signupResult = await mcp.callTool('auth_signup', {
        name, email, credentialType: 'password', password,
    });
    if (signupResult.status !== 'signed_up') {
        throw new Error(`Signup failed: ${JSON.stringify(signupResult)}`);
    }
    const nonce = signupResult.loginNonce as string;
    const backupCodes = signupResult.backupCodes as string[];

    // Step 5: authorize → 302 to /sign-in
    const authorizeUrl = buildAuthorizeUrl(discovery.authorization_endpoint, {
        clientId: client.client_id,
        redirectUri,
        scope: 'openid profile email',
        state: 'e2e-state',
        codeChallenge: pkce.codeChallenge,
    });
    const ar = await fetch(authorizeUrl, { redirect: 'manual' });
    if (ar.status !== 302) throw new Error(`Authorize expected 302, got ${ar.status}`);
    const signInPath = ar.headers.get('location');
    if (!signInPath?.includes('/sign-in')) throw new Error(`Authorize redirected to unexpected: ${signInPath}`);

    // Step 6: /sign-in with login_nonce → consume pending-login, 302 to /authorize
    const signInUrl = `${baseUrl}${signInPath}&login_nonce=${nonce}`;
    const sr = await fetch(signInUrl, { redirect: 'manual' });
    if (sr.status !== 302) throw new Error(`/sign-in expected 302, got ${sr.status}: ${await sr.text().catch(() => '')}`);
    const cookies = sr.headers.getSetCookie?.() ?? [];
    if (!cookies.length) throw new Error('/sign-in did not return Set-Cookie');
    const cookieHeader = cookies.map((c: string) => c.split(';')[0]).join('; ');
    const authorizePath2 = sr.headers.get('location');
    if (!authorizePath2) throw new Error('/sign-in did not redirect to /authorize');

    // Step 7: /authorize with cookies → 302 to callback?code=...
    const authorizeUrl2 = authorizePath2.startsWith('http') ? authorizePath2 : `${baseUrl}${authorizePath2}`;
    const ar2 = await fetch(authorizeUrl2, { redirect: 'manual', headers: { Cookie: cookieHeader } });
    if (ar2.status !== 302) throw new Error(`/authorize (2nd) expected 302, got ${ar2.status}: ${await ar2.text().catch(() => '')}`);
    const callback = ar2.headers.get('location');
    if (!callback) throw new Error('/authorize (2nd) did not redirect to callback');

    // Step 8: extract code + exchange token
    const code = new URL(callback).searchParams.get('code');
    if (!code) throw new Error(`Callback URL missing code: ${callback}`);
    const token = await exchangeToken(discovery.token_endpoint, {
        code, redirectUri, clientId: client.client_id, codeVerifier: pkce.codeVerifier,
    });

    return {
        auth: { accessToken: token.access_token, refreshToken: token.refresh_token, clientId: client.client_id },
        backupCodes,
    };
}

export async function signInAndAuth(
    baseUrl: string,
    email: string,
    password: string,
    backupCode: string,
): Promise<AuthResult> {
    const discovery = await fetchOAuthDiscovery(baseUrl);
    const client = await registerClient(discovery.registration_endpoint);
    const pkce = generatePkce();
    const redirectUri = 'http://localhost/callback';

    // Signin via bootstrap
    const mcp = createMcpClient({ baseUrl, endpoint: '/mcp/bootstrap' });
    await mcp.initialize();
    const signinResult = await mcp.callTool('auth_signin', {
        identifier: email, password, backupCode,
    });
    if (signinResult.status !== 'signed_in') {
        throw new Error(`Signin failed: ${JSON.stringify(signinResult)}`);
    }
    const nonce = signinResult.loginNonce as string;

    // Same authorize → sign-in → authorize → callback chain as above
    const authorizeUrl = buildAuthorizeUrl(discovery.authorization_endpoint, {
        clientId: client.client_id,
        redirectUri,
        scope: 'openid profile email',
        state: 'e2e-state',
        codeChallenge: pkce.codeChallenge,
    });
    const ar = await fetch(authorizeUrl, { redirect: 'manual' });
    const signInPath = ar.headers.get('location');
    const sr = await fetch(`${baseUrl}${signInPath}&login_nonce=${nonce}`, { redirect: 'manual' });
    const cookies = sr.headers.getSetCookie?.() ?? [];
    const cookieHeader = cookies.map((c: string) => c.split(';')[0]).join('; ');
    const authorizePath2 = sr.headers.get('location')!;
    const ar2 = await fetch(`${baseUrl}${authorizePath2}`, { redirect: 'manual', headers: { Cookie: cookieHeader } });
    const callback = ar2.headers.get('location')!;
    const code = new URL(callback).searchParams.get('code')!;
    const token = await exchangeToken(discovery.token_endpoint, {
        code, redirectUri, clientId: client.client_id, codeVerifier: pkce.codeVerifier,
    });
    return { accessToken: token.access_token, refreshToken: token.refresh_token, clientId: client.client_id };
}

// ---- internal helpers ----

async function fetchOAuthDiscovery(baseUrl: string) {
    const r = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`).then(r => r.json()) as any;
    return {
        authorization_endpoint: r.authorization_endpoint,
        token_endpoint: r.token_endpoint,
        registration_endpoint: r.registration_endpoint,
    };
}

async function registerClient(registrationEndpoint: string) {
    const r = await fetch(registrationEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_name: 'e2e-test',
            redirect_uris: ['http://localhost/callback'],
            grant_types: ['authorization_code'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            scope: 'openid profile email',
        }),
    }).then(r => r.json()) as any;
    if (!r.client_id) throw new Error(`Client registration failed: ${JSON.stringify(r)}`);
    return { client_id: r.client_id, client_secret: r.client_secret };
}

function generatePkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { codeVerifier: verifier, codeChallenge: challenge };
}

function buildAuthorizeUrl(authorizeEndpoint: string, opts: {
    clientId: string; redirectUri: string; scope: string; state: string; codeChallenge: string;
}) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: opts.clientId,
        redirect_uri: opts.redirectUri,
        scope: opts.scope,
        state: opts.state,
        code_challenge: opts.codeChallenge,
        code_challenge_method: 'S256',
    });
    return `${authorizeEndpoint}?${params}`;
}

async function exchangeToken(tokenEndpoint: string, opts: {
    code: string; redirectUri: string; clientId: string; codeVerifier: string;
}) {
    const r = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: opts.code,
            redirect_uri: opts.redirectUri,
            client_id: opts.clientId,
            code_verifier: opts.codeVerifier,
        }),
    });
    const token = await r.json() as any;
    if (!token.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(token)}`);
    return token;
}
