import type { CallToolResult } from '@modelcontextprotocol/server';
import type z from 'zod';

type ToolCallback = (args: any, ctx: any) => Promise<CallToolResult>;

/**
 * Minimal McpServer stub that records registerTool calls.
 * Tests can retrieve and invoke registered tool callbacks.
 *
 * `getTool` returns a callback that applies zod defaults to the args before
 * invoking the handler, matching the real MCP server's behavior (the SDK
 * parses args through `inputSchema` before calling the tool callback). Tests
 * that pass valid-but-incomplete args thus see the same defaults-applied shape
 * the handler sees in production.
 */
export class MockMcpServer {
    readonly registeredTools = new Map<string, { cb: ToolCallback; inputSchema?: unknown; config: Record<string, unknown> }>();
    readonly sentLogs: { level: string; data: unknown }[] = [];

    // Stubs for the real McpServer interface used by ToolHandler
    registerTool(name: string, config: Record<string, unknown>, cb: ToolCallback): void {
        this.registeredTools.set(name, { cb, inputSchema: config.inputSchema, config });
    }

    registerResource(_name: string, _config: Record<string, unknown>): void {
        // Stub for resource registration - not used in tests
    }

    async sendLoggingMessage(msg: { level: string; logger?: string; data: unknown }): Promise<void> {
        this.sentLogs.push({ level: msg.level, data: msg.data });
    }

    getTool(name: string): { cb: ToolCallback; inputSchema?: unknown } {
        const t = this.registeredTools.get(name);
        if (!t) throw new Error(`Tool '${name}' is not registered`);
        const rawCb = t.cb;
        const schema = t.inputSchema as z.ZodType<any> | undefined;
        // Apply zod defaults (and coercion) to match the real MCP server, which
        // parses args through `inputSchema` before invoking the tool callback.
        // On parse failure we fall through with the raw args so tests that
        // intentionally exercise the handler with invalid input still run.
        const wrappedCb: ToolCallback = schema && typeof (schema as any).safeParse === 'function'
            ? async (args: any, ctx: any) => {
                const parsed = (schema as any).safeParse(args);
                return rawCb(parsed.success ? parsed.data : args, ctx);
            }
            : rawCb;
        return { cb: wrappedCb, inputSchema: t.inputSchema };
    }

    hasTool(name: string): boolean {
        return this.registeredTools.has(name);
    }
}

/**
 * Create a mock MCP request context with a userId.
 */
export function createMockRequestContext(userId: string = 'test-user') {
    return {
        authInfo: {
            token: 'mock-token',
            clientId: 'mock-client',
            scopes: [],
            extra: { userId }
        }
    } as any;
}
