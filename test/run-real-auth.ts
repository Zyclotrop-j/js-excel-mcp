/**
 * Real-auth test runner (T-72 §6).
 *
 * Sets `MCP_AUTH_MODE=real` and required env vars programmatically,
 * then runs the real-auth test suites. This avoids needing `cross-env`
 * (no new deps) and keeps the real-mode tests isolated from the
 * demo-mode integration suite (no `globalAuth` singleton conflict).
 *
 * The demo-regression suite is NOT included here — it runs in
 * `test/run.ts` (unit tests) where it always passes regardless of
 * `MCP_AUTH_MODE`.
 *
 * Usage: `npm run test:real-auth`
 */
import baretest from 'baretest';

// ---- Set env vars BEFORE any function that reads them is called ----
// ESM static imports are evaluated first, but none of the imported
// modules read process.env at module-evaluation time — only inside
// function bodies (loadAuthConfig, setupAuthServer, etc.).
process.env.MCP_AUTH_MODE = 'real';
process.env.AUTH_SECRET = 'test-secret-for-qa-real-auth';
process.env.MCP_AUTH_CORS_ORIGINS = 'http://localhost:3000';
process.env.MCP_AUTH_DB = 'data/_auth_real_test.db';

const test = baretest('Real-Auth Tests');

// Import test modules (their default-export functions register tests).
import signupTests from './real-auth/signup-to-excel.test.js';
import signinTests from './real-auth/signin.test.js';
import recoverTests from './real-auth/recover.test.js';
import apikeyTests from './real-auth/apikey.test.js';
import passkeyTests from './real-auth/passkey.test.js';

// Register tests.
signupTests(test);
signinTests(test);
recoverTests(test);
apikeyTests(test);
passkeyTests(test);

!(async function () {
    const ok = await test.run();

    // Cleanup: delete the test DB.
    const { cleanupRealAuthTestEnv } = await import('./real-auth/helpers.js');
    cleanupRealAuthTestEnv();

    // Force-exit: background timers (auth server) keep the event loop alive.
    process.exit(ok ? 0 : 1);
})();
