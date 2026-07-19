/**
 * Test runner entry point.
 *
 * Baretest is minimal — no file discovery, no hooks, no grouping.
 * We manually import all test modules and run them in sequence.
 * Each test module is a function that registers tests on a shared baretest instance.
 */
import baretest from 'baretest';
import { DatabaseBackend } from '../src/filesystem/databaseBackend.js';
import { MemoryBackend } from '../src/filesystem/memoryBackend.js';

// Create the test suite
const test = baretest('Excel MCP Tests');

// Import all test modules (they register tests on the shared test instance)
import vfsTests from './filesystem/system.test.js';
import contextTests from './filesystem/context.test.js';
import metaTests from './meta/mcpdescription.test.js';
import interfaceTests from './filesystem/IDatabaseBackend.test.js';
import rateLimitingTests from './filesystem/rateLimiting.test.js';
import lockRegressionTests from './filesystem/lockRegression.test.js';
import cloudflareTests from './filesystem/mocked-cloudflare-backend.test.js';

// Register tests with shared instance
vfsTests(test);
contextTests(test);
metaTests(test);
interfaceTests(test, 'DatabaseBackend', (dbPath) => new DatabaseBackend(dbPath));
interfaceTests(test, 'MemoryBackend', (dbPath) => new MemoryBackend(dbPath));
rateLimitingTests(test);
lockRegressionTests(test);
cloudflareTests(test);

// Run all registered tests
!(async function() {
    const ok = await test.run();
    // Force-exit: the VFS cleanup interval keeps the event loop alive after
    // the suite finishes, which would otherwise hang the runner.
    process.exit(ok ? 0 : 1);
})();
