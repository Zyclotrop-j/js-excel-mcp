import assert from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { VirtualFileSystem } from "../filesystem/system.js";
import type { Context } from "../filesystem/context.js";

interface RequestContext {
    virtualFileSystem?: VirtualFileSystem;
    release?: () => Promise<void>
    context?: Context;
}
const requestContext = new AsyncLocalStorage<RequestContext>();

export function run<T>(cb: () => T): T {
    const ctx: RequestContext = {};
    return requestContext.run(ctx, cb);
}
export function getContext(): RequestContext {
    const context = requestContext.getStore();
    assert(context, "Can't use request context outside a request context!");
    return context;
}
export function tryGetContext(): RequestContext | undefined {
    return requestContext.getStore();
}