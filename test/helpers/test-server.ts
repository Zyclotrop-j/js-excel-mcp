import type { CallToolResult } from '@modelcontextprotocol/server';
import type z from 'zod';

type ToolCallback = (args: any, ctx: any) => Promise<CallToolResult>;

/**
 * Minimal McpServer stub that records registerTool calls.
 * Tests can retrieve and invoke registered tool callbacks.
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
        return { cb: t.cb, inputSchema: t.inputSchema };
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
