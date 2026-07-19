import assert from "node:assert";
import { AsyncLocalStorage } from "node:async_hooks";
import { VirtualFileSystem } from "../filesystem/system.js";
import type { Context } from "../filesystem/context.js";

interface RequestContext {
    virtualFileSystem?: VirtualFileSystem;
    release?: () => Promise<void>
    context?: Context;
    /**
     * The HTTP request headers from the underlying Express request that
     * carried the current MCP `tools/call`. Set by `server.ts` at the start
     * of each `/mcp` and `/mcp/bootstrap` `run()` block so auth-tool handlers
     * (T-50 / T-51 / T-52) can pass the `Cookie` header to better-auth's
     * server-side `auth.api.*` methods, which read the session cookie from
     * there.
     *
     * Optional — `tryGetContext()` callers MUST handle `undefined` (e.g. a
     * `chain_operations` step that runs outside any HTTP request would not
     * set this). Auth-tool handlers fall back to an empty `Headers()` in
     * that case, matching the ticket's spec.
     */
    expressRequestHeaders?: Headers;
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

/**
 * Capture the Express request's headers into the per-request AsyncLocalStorage
 * context so auth-tool handlers (T-50 signout, T-51 add-passkey, T-52
 * rotate-apikey) can construct the `Cookie` header better-auth needs for its
 * server-side session APIs. Call this at the start of each `/mcp` and
 * `/mcp/bootstrap` `run()` block — before `excelNodeHandler` /
 * `bootstrapNodeHandler` invokes any tool callback.
 *
 * Accepts `req.headers` from Express directly. Express types headers as
 * `Record<string, string | string[] | undefined>` (Set-Cookie is the array
 * case); we join array values with `', '` so the resulting `Headers` instance
 * is well-formed (Cookie itself is always a single string).
 */
export function setExpressRequestHeaders(
    reqHeaders: Record<string, string | string[] | undefined>
): void {
    const headers = new Headers();
    for (const [key, value] of Object.entries(reqHeaders)) {
        if (value === undefined) continue;
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    getContext().expressRequestHeaders = headers;
}

/**
 * Read back the Express request headers captured by
 * {@link setExpressRequestHeaders}. Returns `undefined` outside an HTTP
 * request (e.g. inside `chain_operations` or a test harness that didn't set
 * them). Callers MUST handle `undefined` — auth-tool handlers fall back to an
 * empty `Headers()`.
 */
export function getExpressRequestHeaders(): Headers | undefined {
    return tryGetContext()?.expressRequestHeaders;
}
