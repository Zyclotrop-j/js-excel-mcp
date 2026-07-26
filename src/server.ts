import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import type { McpRequestContext } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { Express } from 'express';
import { getContext, run, setExpressRequestHeaders, tryGetContext } from './util/requestContext';

import { createProtectedResourceMetadataRouter, tokenVerifier, setupAuthServer } from './shared/authServer';
import { createMcpExpressApp, getOAuthProtectedResourceMetadataUrl, requireBearerAuth } from '@modelcontextprotocol/express';
import { loadAuthConfig } from './shared/authMode';

import cors from 'cors';
import type { AuthConfig } from './shared/authMode';

import * as tools from './tools/index';
import { ToolHandler, type ServerOptions } from './tools/interface';
import { AuthToolHandler } from './tools/auth/baseAuthTool';
import { bootstrapInstructions, mcpDescription, mcpInstructions, mcpName, mcpTitle, mcpVersion } from './meta/mcpdescription';

const port = 3000;
const basehost = process.env.MCP_BASEHOST ?? 'http://localhost';
// On Cloudflare Workers the auth server and MCP server share the same
// Worker (single fetch handler, single Express app, single routing-key
// port). Collapsing AUTH_PORT onto `port` makes `authServerUrl === mcpServerUrl`
// (modulo path), so RFC 9728 PRM and OAuth discovery metadata publish the
// Worker's real external URL for both endpoints. Local Node keeps the
// standalone authApp on port+1 (3001) so the auth Express instance can
// call `listen()` independently.
const isCloudflare = process.env.BACKEND?.toLowerCase() === 'cloudflare';
const AUTH_PORT = isCloudflare
    ? port
    : (process.env.MCP_AUTH_PORT ? Number.parseInt(process.env.MCP_AUTH_PORT, 10) : port + 1);
const baseUrl = `${basehost}:${port}`;
// localhost (not `localhost`) so the PRM `resource` value matches the URL the
// runner passes the client byte-for-byte — the SDK auth driver enforces that.
const mcpServerUrl = new URL(`${basehost}:${port}/mcp`);
const authServerUrl = new URL(`${basehost}:${AUTH_PORT}`)

// `createMcpExpressApp` defaults `host: '127.0.0.1'` which enables
// `localhostHostValidation()` — that middleware 403s any request whose
// `Host` header isn't loopback, which on Cloudflare means the deployed
// `*.workers.dev` URL would be blocked. On Cloudflare we pass
// `host: '0.0.0.0'` to disable the protective validation entirely; on
// local Node we keep the loopback default for DNS-rebinding protection.
const app = createMcpExpressApp({ host: isCloudflare ? '0.0.0.0' : '127.0.0.1' });


// ---- Authorization Server (better-auth OIDC; authorization_code only) ----
// `autoConsent` is the demo-only switch that turns the consent screen into an
// immediate 302 — set by the runner so `./client.ts` can run without a browser.
//
// Auth config is loaded once at startup from `process.env` via the single
// reader in `authMode.ts` (see `tickets/real-auth/T-10-env-and-config.md`).
// T-21 makes `authConfig` the primary input to `setupAuthServer`.

// `authConfig` for the local-Node path is computed eagerly here. On
// Cloudflare it is recomputed inside `ensureAuth(req)` using the deployed
// hostname (derived from the first request's `Host` header), so PRM and
// OAuth discovery metadata advertise the real `*.workers.dev` URL instead
// of `http://localhost:3000`. The eager call below is the local-Node
// fallback and is overridden by the lazy path on Cloudflare.
const authConfigLocal = loadAuthConfig(baseUrl);

// ---- Lazy auth-server init (Cloudflare + local Node) ----
//
// On Cloudflare Workers:
//  (a) the D1 binding (`env.AUTH`) is NOT available at module-eval time —
//      bindings are only delivered to the `fetch` handler as the `env`
//      argument, which `src/index.ts` stashes via `setWorkerEnv(env)` on
//      the first request. `setupAuthServer` → `createAuth` → `getDatabase`
//      reaches `env.AUTH` through `getWorkerEnv()`, so it MUST run after
//      the first `setWorkerEnv` call, not at module-eval.
//  (b) the deployed `*.workers.dev` hostname is also only knowable from
//      the request's `Host` header — we don't bake it into `wrangler.jsonc`
//      because the subdomain is allocated by Cloudflare on first deploy
//      and could change between deploys. So `baseUrl`, `mcpServerUrl`,
//      `authServerUrl`, `authConfig`, the bearer middleware, the PRM
//      router, AND the `/mcp` / `/mcp/bootstrap` route registrations all
//      run inside `ensureAuth(req)` on the first request.
//
// Local Node: bindings aren't an issue (better-sqlite3 doesn't need
// `env`), and `baseUrl` is fixed via `MCP_BASEHOST`, so the eager consts
// above are sufficient — but we still run through `ensureAuth` for parity
// (it no-ops overhead-wise after the first request).
//
// `tokenVerifier` is a stable shared object (its `verifyAccessToken` calls
// `getAuth()` at request time only), so `requireBearerAuth(...)` can be
// constructed lazily inside `ensureAuth` and still validate subsequent
// requests correctly.
// Module-level slots populated by `ensureAuth(req)` on the first request.
// The `createMcpHandler` callbacks (which run per McpServer build, i.e. per
// `tools/call` invocation) read these via `activeBaseUrl` / `activeAuthConfig`
// so the serverHost + authConfig threaded into each ToolHandler match the
// deployed `*.workers.dev` URL on Cloudflare, not the eager `localhost:3000`
// consts. On local Node these stay `undefined` and the callbacks fall back
// to the eager consts (see usage sites below).
let activeBaseUrl: string | undefined;
let activeAuthConfig: AuthConfig | undefined;

let authReady: boolean | Promise<void> = false;
// Tracks the in-flight auth init so concurrent first-requests serialise on
// the same promise rather than each racing `setupAuthServer` independently.
let authInitPromise: Promise<void> | null = null;

function ensureAuth(req: import('express').Request): Promise<void> {
    if (authReady === true) return Promise.resolve();
    if (authInitPromise) return authInitPromise;
    let cfgBase: string;
    let cfgMcpUrl: URL;
    let cfgAuthUrl: URL;
    if (isCloudflare) {
        // workers.dev and custom domains are always HTTPS. `req.hostname`
        // is the Host header without the port (Express parses it).
        const origin = `https://${req.hostname}`;
        cfgBase = origin;
        cfgMcpUrl = new URL(`${origin}/mcp`);
        cfgAuthUrl = new URL(origin); // auth routes share the same Worker
    } else {
        cfgBase = baseUrl;
        cfgMcpUrl = mcpServerUrl;
        cfgAuthUrl = authServerUrl;
    }
    const cfg = isCloudflare ? loadAuthConfig(cfgBase) : authConfigLocal;
    // Publish to module scope so per-request handler callbacks (which run
    // AFTER ensureAuth has set authReady=true) can read the live values.
    activeBaseUrl = cfgBase;
    activeAuthConfig = cfg;
    // Build the lazy init promise. setupAuthServer is async (D1 exec) so
    // it must complete before any route or bearer middleware can run.
    authInitPromise = (async () => {
        await setupAuthServer({
            authServerUrl: cfgAuthUrl, mcpServerUrl: cfgMcpUrl, authConfig: cfg,
            autoConsent: false,
            ...(isCloudflare ? { mountApp: app } : {})
        });
        // RFC 9728 Protected Resource Metadata at
        // /.well-known/oauth-protected-resource/mcp — the client discovers
        // the AS from the 401 challenge → this route → AS metadata. Mounted
        // lazily because `createProtectedResourceMetadataRouter` calls
        // `getAuth()` which needs `setupAuthServer` to have resolved.
        //
        // Note: PRM continues to point at `/mcp` only. `/mcp/bootstrap` is
        // not a "protected resource" by design — it has no bearer
        // requirement and is not advertised anywhere by the server.
        app.use(createProtectedResourceMetadataRouter('/mcp'));
        // Bearer middleware and the `/mcp` + `/mcp/bootstrap` routes are
        // also constructed here, lazily, because they need `cfgMcpUrl`
        // (which on Cloudflare is request-derived).
        const bearerAuth = requireBearerAuth({
            verifier: tokenVerifier,
            requiredScopes: [],
            resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(cfgMcpUrl)
        });
        app.all('/mcp', bearerAuth, mcpRouteHandler);
        app.all('/mcp/bootstrap', bootstrapRouteHandler);
        authReady = true;
        authInitPromise = null;
    })();
    return authInitPromise;
}
// First-request middleware: lazily wire auth + routes on the first fetch,
// then no-op for the rest of the isolate's lifetime. Express's router walks
// `app._router.stack` on every request, so routes mounted inside
// `ensureAuth()` (auth handlers + PRM + /mcp + /mcp/bootstrap) are visible
// to subsequent requests even though they were added after `app` started
// handling. The current request that triggers `ensureAuth` continues down
// the stack via `next()` and is dispatched to the freshly-registered
// `/mcp*` route as expected.
app.use((req, _res, next) => { ensureAuth(req).then(() => next()).catch(next); });

// DEMO ONLY — restrict `origin` in production. `exposedHeaders` lists the
// response headers a browser-based MCP client must be able to read.
app.use(
    cors({
        origin: '*',
        exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate', 'Last-Event-Id', 'Mcp-Protocol-Version']
    })
);

// ---- Route handler bodies (hoisted as named consts so the lazy route ----
// ---- registration inside `ensureAuth` can reference them)            ----
//
// Defined here but invoked only from the lazily-registered routes above.
// `excelNodeHandler` / `bootstrapNodeHandler` (also module-level consts)
// are declared further down and are in scope by the time `ensureAuth`
// first runs — see the comment in `ensureAuth` for the ordering argument.
async function mcpRouteHandler(req: import('express').Request, res: import('express').Response): Promise<void> {
    // request start here
    await run(async () => {
        // Capture the Express request headers into the per-request context
        // so authenticated auth-tool handlers (T-50 signout, T-51 add-passkey,
        // T-52 rotate-apikey) can read the `Cookie` header for better-auth's
        // server-side session APIs.
        setExpressRequestHeaders(req.headers);
        try {
            await excelNodeHandler(req, res, req.body);
        } finally {
            await getContext()?.release?.();
        }
    });
    // request end here
}

// `/mcp/bootstrap` — no `requireBearerAuth`. Same `run()` + `release()`
// pattern as `/mcp` so the per-request AsyncLocalStorage context is set up
// identically (auth tools may need it in T-41+).
async function bootstrapRouteHandler(req: import('express').Request, res: import('express').Response): Promise<void> {
    // request start here
    await run(async () => {
        // Same context capture as `/mcp` — bootstrap auth tools (T-41 signup,
        // T-42 signin, T-43 recover) may also need to read the `Cookie` header
        // (e.g. `signInEmail({ asResponse: true })` then re-emit Set-Cookie).
        setExpressRequestHeaders(req.headers);
        try {
            await bootstrapNodeHandler(req, res, req.body);
        } finally {
            await getContext()?.release?.();
        }
    });
    // request end here
}

// ---- Tool discriminators (T-40 Scope §3) ----
//
// Three mutually exclusive sets:
//
//   isExcelTool(T)             → /mcp          (Excel handlers, extend ToolHandler directly)
//   isAuthenticatedAuthTool(T) → /mcp          (signout/addPasskey/rotateApikey, extend AuthToolHandler)
//   isBootstrapAuthTool(T)     → /mcp/bootstrap (signup/signin/recover, extend AuthToolHandler)
//
// The `instanceof AuthToolHandler` check is what separates Excel tools from
// auth tools — the auth tools extend `AuthToolHandler extends ToolHandler`,
// so a plain `instanceof ToolHandler` would also match them.
//
// All three share the existing `typeof Tool === 'function' && Tool.prototype`
// guard, so non-handler exports (e.g. `IMAGE_OPTIONS` from handleImage.ts or
// `IMPORT_OPTIONS` from handleWorkbook.ts) are filtered out, exactly as the
// previous in-line loop did.
//
// Each predicate narrows to a `new (...args) => ToolHandler` so TypeScript
// can still `new Tool(...)` after the `if (!is*(Tool)) continue;` guard.
type ToolCtor = new (server: McpServer, context: McpRequestContext, expressApp: Express, serverOptions: ServerOptions) => ToolHandler;

function isExcelTool(Tool: unknown): Tool is ToolCtor {
    return typeof Tool === 'function'
        && (Tool as { prototype: unknown }).prototype instanceof ToolHandler
        && !((Tool as { prototype: unknown }).prototype instanceof AuthToolHandler);
}
function isBootstrapAuthTool(Tool: unknown): Tool is ToolCtor {
    return typeof Tool === 'function'
        && (Tool as { prototype: unknown }).prototype instanceof AuthToolHandler
        && (Tool as { authSurface?: string }).authSurface === 'bootstrap';
}
function isAuthenticatedAuthTool(Tool: unknown): Tool is ToolCtor {
    return typeof Tool === 'function'
        && (Tool as { prototype: unknown }).prototype instanceof AuthToolHandler
        && (Tool as { authSurface?: string }).authSurface === 'authenticated';
}

// ---- Excel endpoint (`/mcp`) — Excel tools + authenticated auth tools ----
//
// Two loops: Excel handlers get the VFS-flush `postCallHook` (preserves the
// pre-T-40 behavior exactly). Authenticated auth tools (signout / addPasskey
// / rotateApikey — T-50/T-51/T-52) get a no-op hook because they don't touch
// the VFS. The hook slot exists on the base `ToolHandler` class so neither
// loop needs to special-case it.
const excelToolHandler = createMcpHandler(async (context) => {
    const server = new McpServer({ name: mcpName, version: mcpVersion, description: mcpDescription, 'title': mcpTitle }, {
        'instructions': mcpInstructions,
    });

    const toolSet: ToolHandler[] = [];
    for (const Tool of Object.values(tools)) {
        if (!isExcelTool(Tool)) continue;
        const t = new Tool(server, context, app, { serverHost: activeBaseUrl ?? baseUrl, authConfig: activeAuthConfig ?? authConfigLocal });
        // Flush the VFS after each tool call so changes persist even when a
        // single HTTP request (SSE stream or JSON-RPC batch) wraps multiple
        // `tools/call` invocations. Without this, the VFS only flushes at
        // stream-completion in `release()`, losing intermediate state if the
        // stream is long-lived or the server crashes mid-batch.
        t.postCallHook = async () => {
            const reqCtx = tryGetContext();
            if (reqCtx?.virtualFileSystem?.hasPendingWrites()) {
                await reqCtx.virtualFileSystem.flush();
            }
        };
        toolSet.push(t);
        await t.register(toolSet);
    }

    for (const Tool of Object.values(tools)) {
        if (!isAuthenticatedAuthTool(Tool)) continue;
        const t = new Tool(server, context, app, { serverHost: activeBaseUrl ?? baseUrl, authConfig: activeAuthConfig ?? authConfigLocal });
        // Auth tools don't touch the VFS, so the post-call hook is a no-op.
        // Kept explicit (rather than omitted) for symmetry with the Excel
        // loop and to leave a single point to add VFS-related logic later.
        t.postCallHook = async () => {};
        toolSet.push(t);
        await t.register(toolSet);
    }

    return server;
});
const excelNodeHandler = toNodeHandler(excelToolHandler);

// ---- Bootstrap endpoint (`/mcp/bootstrap`) — bootstrap auth tools only ----
//
// No bearer required. Mounts in both demo and real modes (the bootstrap
// endpoint is always present; it's a no-op-list until T-41+ land the signup
// / signin / recover handlers). See T-40 Scope §7.
//
// `capabilities: { tools: {} }` is declared explicitly so the SDK registers
// the `tools/list` request handler up-front, even with zero tools registered
// today. Without it, the SDK only flips `_capabilities.tools` when the first
// `registerTool()` is called, and the bootstrap endpoint would 404 `tools/list`
// until T-41 lands. The `{ tools: {} }` shape is idempotent —
// `setToolRequestHandlers()` is a no-op once initialized (see SDK line ~10039),
// so later `registerTool` calls don't double-register.
const bootstrapToolHandler = createMcpHandler(async (context) => {
    const server = new McpServer(
        { name: `${mcpName}-bootstrap`, version: mcpVersion, title: 'MCP Auth Bootstrap' },
        { instructions: bootstrapInstructions, capabilities: { tools: {} } }
    );

    const toolSet: ToolHandler[] = [];
    for (const Tool of Object.values(tools)) {
        if (!isBootstrapAuthTool(Tool)) continue;
        const t = new Tool(server, context, app, { serverHost: activeBaseUrl ?? baseUrl, authConfig: activeAuthConfig ?? authConfigLocal });
        t.postCallHook = async () => {};
        toolSet.push(t);
        await t.register(toolSet);
    }

    return server;
});
const bootstrapNodeHandler = toNodeHandler(bootstrapToolHandler);

export default {app, port};