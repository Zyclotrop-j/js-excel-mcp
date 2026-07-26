/**
 * Barrel export for the auth-tool handlers.
 *
 * The handlers themselves land in follow-up tickets:
 *   - signup.ts       (T-41) AuthSignupHandler       — mounts on /mcp/bootstrap
 *   - signin.ts       (T-42) AuthSigninHandler       — mounts on /mcp/bootstrap
 *   - recover.ts      (T-43) AuthRecoverHandler      — mounts on /mcp/bootstrap
 *   - signout.ts      (T-50) AuthSignoutHandler      — mounts on /mcp
 *   - addPasskey.ts   (T-51) AuthAddPasskeyHandler   — mounts on /mcp
 *   - rotateApikey.ts (T-52) AuthRotateApikeyHandler — mounts on /mcp
 *
 * Each handler extends {@link AuthToolHandler} (from `./baseAuthTool.js`) and
 * sets `static authSurface = 'bootstrap' | 'authenticated'` so the dispatcher
 * in `src/server.ts` can route it to the correct endpoint.
 *
 * See `tickets/real-auth/T-40-bootstrap-endpoint.md` (Scope §1) and the
 * `[C-PA]` / `[C-AT]` / `[C-REG]` contracts in `STUDY_FIRST.md`.
 */

export { AuthSignupHandler } from './signup';
export { AuthSigninHandler } from './signin';
export { AuthRecoverHandler } from './recover';
export { AuthSignoutHandler } from './signout';
export { AuthAddPasskeyHandler } from './addPasskey';
export { AuthRotateApikeyHandler } from './rotateApikey';