/**
 * Test runner entry point.
 *
 * Baretest is minimal — no file discovery, no hooks, no grouping.
 * We manually import all test modules and run them in sequence.
 * Each test module is a function that registers tests on a shared baretest instance.
 */
import baretest from 'baretest';

// Create the test suite
const test = baretest('Excel MCP Tests');

// Import all test modules (they register tests on the shared test instance)
import vfsTests from './filesystem/system.test.js';
import contextTests from './filesystem/context.test.js';
import metaTests from './meta/mcpdescription.test.js';

// Register tests with shared instance
vfsTests(test);
contextTests(test);
metaTests(test);

// Run all registered tests
!(async function() {
    await test.run();
})();
