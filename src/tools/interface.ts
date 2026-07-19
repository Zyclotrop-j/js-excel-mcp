import { McpServer, McpRequestContext, type CallToolResult, type InputRequiredResult, type StandardSchemaWithJSON, type ServerContext, type ToolCallback, type ToolAnnotations, type Icon } from "@modelcontextprotocol/server";
import { Express } from 'express';

type StoredCallback = (args: any, ctx: any) => CallToolResult | InputRequiredResult | Promise<CallToolResult | InputRequiredResult>;

export interface ServerOptions {
    serverHost: string;
}

export abstract class ToolHandler {
    server: McpServer;
    context: McpRequestContext
    expressApp: Express;
    toolSet: ToolHandler[] = [];
    serverOptions: ServerOptions;
    /**
     * Optional hook invoked after each tool callback completes successfully.
     * `server.ts` sets this to flush the VFS so that changes persist even when
     * a single HTTP request (SSE stream or JSON-RPC batch) wraps multiple
     * `tools/call` invocations — without it the VFS only flushes at
     * stream-completion in `release()`.
     */
    postCallHook?: () => Promise<void>;
    protected tools = new Map<string, { cb: StoredCallback; inputSchema?: unknown }>();
    constructor(server: McpServer, context: McpRequestContext, expressApp: Express, serverOptions: ServerOptions) {
        this.server = server;
        this.context = context;
        this.expressApp = expressApp;
        this.serverOptions = serverOptions;
    }

    abstract register(allTools: ToolHandler[]): Promise<void>

    getTool(name: string): { cb: StoredCallback; inputSchema?: unknown } | undefined {
        return this.tools.get(name);
    }
    listTools(): Readonly<Record<string, Readonly<{ cb: Readonly<StoredCallback>; inputSchema?: unknown }>>> {
        return Object.freeze(Object.fromEntries(this.tools.entries()));
    }

    protected registerTool<S extends StandardSchemaWithJSON>(
        name: string,
        config: {
            title?: string;
            description?: string;
            inputSchema?: S;
            outputSchema?: StandardSchemaWithJSON;
            annotations?: ToolAnnotations;
            icons?: Icon[];
            _meta?: Record<string, unknown>;
        },
        cb: ToolCallback<S>
    ) {
        // Wrap the callback so the post-call hook fires after each invocation.
        // This lets server.ts flush the VFS per-tool-call rather than only at
        // request-completion, fixing the SSE multi-call release-timing gap.
        const wrappedCb: StoredCallback = async (args, ctx) => {
            const result = await cb(args, ctx);
            await this.postCallHook?.();
            return result as CallToolResult | InputRequiredResult;
        };
        this.tools.set(name, { cb: wrappedCb, inputSchema: config.inputSchema });
        return this.server.registerTool(name, config, wrappedCb as ToolCallback<S>);
    }
}
