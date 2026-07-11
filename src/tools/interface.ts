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
        this.tools.set(name, { cb, inputSchema: config.inputSchema });
        return this.server.registerTool(name, config, cb);
    }
}
