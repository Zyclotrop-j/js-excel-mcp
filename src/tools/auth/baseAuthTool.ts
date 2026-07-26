/**
 * `AuthToolHandler` — base class for the auth-tool handlers
 * (signup / signin / recover / signout / addPasskey / rotateApikey).
 *
 * Extends the standard {@link ToolHandler} (same `register()`, same
 * `postCallHook` slot, same Express wiring) so the auth tools compose with
 * the existing `server.ts` registration loop. The discriminator
 * {@link AuthToolHandler.authSurface} is what splits them across the two
 * endpoints (per `[C-EP]`):
 *
 *   - `'bootstrap'`     → `/mcp/bootstrap` (no bearer required)
 *   - `'authenticated'` → `/mcp`          (bearer required)
 *
 * The Excel tools extend `ToolHandler` *directly* and so are NOT instances of
 * `AuthToolHandler`; the dispatcher uses that distinction to filter them out
 * of the auth loops.
 *
 * See `tickets/real-auth/T-40-bootstrap-endpoint.md` (Scope §3) and
 * `[C-PA]` / `[C-AT]` / `[C-REG]` in `STUDY_FIRST.md`.
 */

import { ToolHandler } from '../interface';

/**
 * Discriminator: which endpoint does this tool mount on?
 *
 * Each subclass MUST set this to `'bootstrap'` or `'authenticated'`.
 * No default — leaving it unset is a static type error by design
 * (the abstract declaration forces every subclass to declare it).
 */
export type AuthSurface = 'bootstrap' | 'authenticated';

export abstract class AuthToolHandler extends ToolHandler {
    /**
     * Which endpoint this tool mounts on. Subclasses set this to a literal:
     *
     * ```ts
     * export class AuthSignupHandler extends AuthToolHandler {
     *     static readonly authSurface: AuthSurface = 'bootstrap';
     *     // ...
     * }
     * ```
     *
     * The two `createMcpHandler` factories in `src/server.ts` use
     * `Tool.authSurface === 'bootstrap'` / `'authenticated'` to decide which
     * loop a given handler belongs in. See `isBootstrapAuthTool` /
     * `isAuthenticatedAuthTool` in `server.ts`.
     */
    static readonly authSurface: AuthSurface;
}