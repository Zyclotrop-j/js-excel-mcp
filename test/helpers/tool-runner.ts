import { run, getContext } from '../../src/util/requestContext.js';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { MockMcpServer } from './test-server.js';

type ToolCallback = (args: any, ctx: any) => Promise<CallToolResult>;

/**
 * Wrap a tool callback call in run() so Context.getContext() has AsyncLocalStorage.
 */
export function invokeTool(cb: ToolCallback, args: any, requestCtx: any): Promise<CallToolResult> {
    return run(async () => await cb(args, requestCtx));
}

/**
 * Register tool handlers inside a run() block that shares the given context.
 * This prevents Context.getContext() from creating duplicate VFS instances.
 */
export async function registerHandlers(
    mockServer: MockMcpServer,
    context: { virtualFileSystem: any; userId: string },
    authUserId: string,
    registerFn: () => Promise<void>
): Promise<void> {
    await run(async () => {
        const reqCtx = getContext();
        reqCtx.context = context as any;
        reqCtx.virtualFileSystem = context.virtualFileSystem;
        reqCtx.release = async () => {}; // cleanup handles release
        await registerFn();
    });
}
