import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';

import { createProtectedResourceMetadataRouter, demoTokenVerifier, setupAuthServer } from './shared/authServer.js';
import { createMcpExpressApp, getOAuthProtectedResourceMetadataUrl, requireBearerAuth } from '@modelcontextprotocol/express';

import cors from 'cors';

import * as tools from './tools/index.js';
import { ToolHandler } from './tools/interface.js';
import { mcpDescription, mcpInstructions, mcpName, mcpTitle, mcpVersion } from './meta/mcpdescription.js';

const port = 3000;
const AUTH_PORT = process.env.MCP_AUTH_PORT ? Number.parseInt(process.env.MCP_AUTH_PORT, 10) : port + 1;
// localhost (not `localhost`) so the PRM `resource` value matches the URL the
// runner passes the client byte-for-byte — the SDK auth driver enforces that.
const mcpServerUrl = new URL(`http://localhost:${port}/mcp`);
const authServerUrl = new URL(`http://localhost:${AUTH_PORT}`)

const app = createMcpExpressApp();


// ---- Authorization Server (better-auth OIDC; authorization_code only) ----
// `autoConsent` is the demo-only switch that turns the consent screen into an
// immediate 302 — set by the runner so `./client.ts` can run without a browser.
setupAuthServer({ authServerUrl, mcpServerUrl, demoMode: false, autoConsent: false });


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
app.use(createProtectedResourceMetadataRouter('/mcp'));

const auth = requireBearerAuth({
    verifier: demoTokenVerifier,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl)
});

const handler = createMcpHandler((context) => {
    const server = new McpServer({ name: mcpName, version: mcpVersion, description: mcpDescription, 'title': mcpTitle }, {
        'instructions': mcpInstructions,
    });

    const toolSet: ToolHandler[] = [];
    for(const Tool  of Object.values(tools)) {
        const   t = new Tool(server, context, app);
        toolSet.push(t);
        t.register(toolSet);
    }

    return server;
});
const nodeHandler = toNodeHandler(handler);

app.all('/mcp', auth, (req, res) => void nodeHandler(req, res, req.body));

app.listen(port, () => {
    console.error(`  Protected Resource Metadata: http://localhost:${3000}/.well-known/oauth-protected-resource/mcp`);
});

