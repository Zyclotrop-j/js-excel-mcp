import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import type { McpRequestContext } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { Express } from 'express';
import { getContext, run, setExpressRequestHeaders, tryGetContext } from './util/requestContext.js';

import { createProtectedResourceMetadataRouter, tokenVerifier, setupAuthServer } from './shared/authServer.js';
import { createMcpExpressApp, getOAuthProtectedResourceMetadataUrl, requireBearerAuth } from '@modelcontextprotocol/express';
import { loadAuthConfig } from './shared/authMode.js';

import cors from 'cors';

import * as tools from './tools/index.js';
import { ToolHandler, type ServerOptions } from './tools/interface.js';
import { AuthToolHandler } from './tools/auth/baseAuthTool.js';
import { bootstrapInstructions, mcpDescription, mcpInstructions, mcpName, mcpTitle, mcpVersion } from './meta/mcpdescription.js';

const port = 3000;
const basehost = process.env.MCP_BASEHOST ?? 'http://localhost';
const AUTH_PORT = process.env.MCP_AUTH_PORT ? Number.parseInt(process.env.MCP_AUTH_PORT, 10) : port + 1;
const baseUrl = `${basehost}:${port}`;
// localhost (not `localhost`) so the PRM `resource` value matches the URL the
// runner passes the client byte-for-byte — the SDK auth driver enforces that.
const mcpServerUrl = new URL(`${basehost}:${port}/mcp`);
const authServerUrl = new URL(`${basehost}:${AUTH_PORT}`)

const app = createMcpExpressApp();


// ---- Authorization Server (better-auth OIDC; authorization_code only) ----
// `autoConsent` is the demo-only switch that turns the consent screen into an
// immediate 302 — set by the runner so `./client.ts` can run without a browser.
//
// Auth config is loaded once at startup from `process.env` via the single
// reader in `authMode.ts` (see `tickets/real-auth/T-10-env-and-config.md`).
// T-21 makes `authConfig` the primary input to `setupAuthServer`.
const authConfig = loadAuthConfig(baseUrl);
setupAuthServer({ authServerUrl, mcpServerUrl, authConfig, autoConsent: false });


// DEMO ONLY — restrict `origin` in production. `exposedHeaders` lists the
// response headers a browser-based MCP client must be able to read.
app.use(
    cors({
        origin: '*',
        exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate', 'Last-Event-Id', 'Mcp-Protocol-Version']
    })
);
// RFC 9728 Protected Resource Metadata at /.well-known/oauth-protected-resource/mcp
// — the client discovers the AS from the 401 challenge → this route → AS metadata.
//
// Note: PRM continues to point at `/mcp` only. `/mcp/bootstrap` is not a
// "protected resource" by design — it has no bearer requirement and is not
// advertised anywhere by the server. Clients discover it via the standard
// 401-challenge interaction with the auth tools (see T-40 §6).
app.use(createProtectedResourceMetadataRouter('/mcp'));

const auth = requireBearerAuth({
    verifier: tokenVerifier,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl)
});

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
        const t = new Tool(server, context, app, { serverHost: baseUrl, authConfig });
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
        const t = new Tool(server, context, app, { serverHost: baseUrl, authConfig });
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
        const t = new Tool(server, context, app, { serverHost: baseUrl, authConfig });
        t.postCallHook = async () => {};
        toolSet.push(t);
        await t.register(toolSet);
    }

    return server;
});
const bootstrapNodeHandler = toNodeHandler(bootstrapToolHandler);

app.all('/mcp', auth, async (req, res) => {
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
});

// `/mcp/bootstrap` — no `requireBearerAuth`. Same `run()` + `release()`
// pattern as `/mcp` so the per-request AsyncLocalStorage context is set up
// identically (auth tools may need it in T-41+).
app.all('/mcp/bootstrap', async (req, res) => {
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
});

export default {app, port};