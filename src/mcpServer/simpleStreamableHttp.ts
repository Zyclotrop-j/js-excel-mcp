import { randomUUID } from 'node:crypto';

// MCP imports - simplified version without external dependencies
import type {
    CallToolResult,
    ElicitResult,
    GetPromptResult,
    PrimitiveSchemaDefinition,
    ReadResourceResult,
    ResourceLink
} from '@modelcontextprotocol/server';
import { InMemoryTaskMessageQueue, InMemoryTaskStore, isInitializeRequest, McpServer } from '@modelcontextprotocol/server';
import cors from 'cors';
import type { Request, Response } from 'express';
import type { CreateDemoAuthOptions, DemoAuth } from './auth.js';
import { createDemoAuth } from './auth.js';

// Auth server setup + demo token verifier (pass to `requireBearerAuth` from @modelcontextprotocol/express)
import type { SetupAuthServerOptions } from './authServer.js';
import { createProtectedResourceMetadataRouter, demoTokenVerifier, getAuth, setupAuthServer } from './authServer.js';

// Extend Express Request type to include auth property
declare module 'express' {
    interface Request {
        auth?: any;
    }
}
import * as z from 'zod/v4';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { InMemoryEventStore } from './eventStore.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth';

// Check for OAuth flag
const useOAuth = process.argv.includes('--oauth');
const dangerousLoggingEnabled = process.argv.includes('--dangerous-logging-enabled');

// Create shared task store for demonstration
const taskStore = new InMemoryTaskStore();

// Create an MCP server with implementation details
const getServer = async (cb: (server: McpServer) => Promise<void>) => {
    const server = new McpServer(
        {
            name: 'simple-streamable-http-server',
            version: '1.0.0',
            icons: [{ src: './mcp.svg', sizes: ['512x512'], mimeType: 'image/svg+xml' }],
            websiteUrl: 'https://github.com/modelcontextprotocol/typescript-sdk'
        },
        {
            capabilities: {
                logging: {},
                tasks: {
                    requests: { tools: { call: {} } },
                    taskStore,
                    taskMessageQueue: new InMemoryTaskMessageQueue()
                }
            }
        }
    );

    await cb(server);


    return server;
};

const MCP_PORT = process.env.MCP_PORT ? Number.parseInt(process.env.MCP_PORT, 10) : 3000;
const AUTH_PORT = process.env.MCP_AUTH_PORT ? Number.parseInt(process.env.MCP_AUTH_PORT, 10) : 3001;

const app = createMcpExpressApp();

// Enable CORS for browser-based clients (demo only)
// This allows cross-origin requests and exposes WWW-Authenticate header for OAuth
// WARNING: This configuration is for demo purposes only. In production, you should restrict this to specific origins and configure CORS yourself.
app.use(
    cors({
        exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id', 'Last-Event-Id', 'Mcp-Protocol-Version'],
        origin: '*' // WARNING: This allows all origins to access the MCP server. In production, you should restrict this to specific origins.
    })
);

// Set up OAuth if enabled
let authMiddleware = null;
if (useOAuth) {
    // Create auth middleware for MCP endpoints
    const mcpServerUrl = new URL(`http://localhost:${MCP_PORT}/mcp`);
    const authServerUrl = new URL(`http://localhost:${AUTH_PORT}`);

    setupAuthServer({ authServerUrl, mcpServerUrl, demoMode: true, dangerousLoggingEnabled });

    // Add protected resource metadata route to the MCP server
    // This allows clients to discover the auth server
    // Pass the resource path so metadata is served at /.well-known/oauth-protected-resource/mcp
    app.use(createProtectedResourceMetadataRouter('/mcp'));

    authMiddleware = requireBearerAuth({
        verifier: demoTokenVerifier,
        requiredScopes: [],
        resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl)
    });
}

// Map to store transports by session ID
const transports: { [sessionId: string]: any } = {};

// MCP POST endpoint with optional auth
const mcpPostHandler = (cb: (server: McpServer) => Promise<void>) => async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId) {
        console.log(`Received MCP request for session: ${sessionId}`);
    } else {
        console.log('Request body:', req.body);
    }

    if (useOAuth && req.auth) {
        console.log('Authenticated user:', req.auth);
    }
    try {
        let transport: any;
        if (sessionId && transports[sessionId]) {
            // Reuse existing transport
            transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
            // New initialization request
            const eventStore = new InMemoryEventStore();
            transport = new NodeStreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                eventStore, // Enable resumability
                onsessioninitialized: (sessionId: string) => {
                    // Store the transport by session ID when session is initialized
                    // This avoids race conditions where requests might come in before the session is stored
                    console.log(`Session initialized with ID: ${sessionId}`);
                    transports[sessionId] = transport;
                }
            });

            // Set up onclose handler to clean up transport when closed
            transport.onclose = () => {
                const sid = transport.sessionId;
                if (sid && transports[sid]) {
                    console.log(`Transport closed for session ${sid}, removing from transports map`);
                    delete transports[sid];
                }
            };

            // Connect the transport to the MCP server BEFORE handling the request
            // so responses can flow back through the same transport
            const server = await  getServer(cb);
            await server.connect(transport);

            await transport.handleRequest(req, res, req.body);
            return; // Already handled
        } else if (sessionId) {
            res.status(404).json({
                jsonrpc: '2.0',
                error: { code: -32_001, message: 'Session not found' },
                id: null
            });
            return;
        } else {
            res.status(400).json({
                jsonrpc: '2.0',
                error: { code: -32_000, message: 'Bad Request: Session ID required' },
                id: null
            });
            return;
        }

        // Handle the request with existing transport - no need to reconnect
        // The existing transport is already connected to the server
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32_603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
};

export default (cb: (server: McpServer) => Promise<void>) => {
        
    // Set up routes with conditional auth middleware
    if (useOAuth && authMiddleware) {
        app.post('/mcp', authMiddleware, mcpPostHandler(cb));
    } else {
        app.post('/mcp', mcpPostHandler(cb));
    }

    // Handle GET requests for SSE streams (using built-in support from StreamableHTTP)
    const mcpGetHandler = async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId) {
            res.status(400).send('Missing session ID');
            return;
        }
        if (!transports[sessionId]) {
            res.status(404).send('Session not found');
            return;
        }

        if (useOAuth && req.auth) {
            console.log('Authenticated SSE connection from user:', req.auth);
        }

        // Check for Last-Event-ID header for resumability
        const lastEventId = req.headers['last-event-id'] as string | undefined;
        if (lastEventId) {
            console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
        } else {
            console.log(`Establishing new SSE stream for session ${sessionId}`);
        }

        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
    };

    // Set up GET route with conditional auth middleware
    if (useOAuth && authMiddleware) {
        app.get('/mcp', authMiddleware, mcpGetHandler);
    } else {
        app.get('/mcp', mcpGetHandler);
    }

    // Handle DELETE requests for session termination (according to MCP spec)
    const mcpDeleteHandler = async (req: Request, res: Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        if (!sessionId) {
            res.status(400).send('Missing session ID');
            return;
        }
        if (!transports[sessionId]) {
            res.status(404).send('Session not found');
            return;
        }

        console.log(`Received session termination request for session ${sessionId}`);

        try {
            const transport = transports[sessionId];
            await transport.handleRequest(req, res);
        } catch (error) {
            console.error('Error handling session termination:', error);
            if (!res.headersSent) {
                res.status(500).send('Error processing session termination');
            }
        }
    };

    // Set up DELETE route with conditional auth middleware
    if (useOAuth && authMiddleware) {
        app.delete('/mcp', authMiddleware, mcpDeleteHandler);
    } else {
        app.delete('/mcp', mcpDeleteHandler);
    }

    app.listen(MCP_PORT, (error: any) => {
        if (error) {
            console.error('Failed to start server:', error);
            // eslint-disable-next-line unicorn/no-process-exit
            process.exit(1);
        }
        console.log(`MCP Streamable HTTP Server listening on port ${MCP_PORT}`);
        if (useOAuth) {
            console.log(`  Protected Resource Metadata: http://localhost:${MCP_PORT}/.well-known/oauth-protected-resource/mcp`);
        }
    });

    // Handle server shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down server...');

        // Close all active transports to properly clean up resources
        for (const sessionId in transports) {
            try {
                console.log(`Closing transport for session ${sessionId}`);
                await transports[sessionId]!.close();
                delete transports[sessionId];
            } catch (error) {
                console.error(`Error closing transport for session ${sessionId}:`, error);
            }
        }
        console.log('Server shutdown complete');
        process.exit(0);
    });
}
