/**
 * E2E test runner.
 *
 * Each e2e suite is Pattern B (self-contained baretest instance + default
 * export that calls `test.run()`). The runner awaits each suite in sequence
 * and exits non-zero if any suite reported a failure.
 */
import baretest from 'baretest';

// The shared instance is unused — each suite runs its own — but keeps the
// shape consistent with the integration runner for future Pattern A migration.
const test = baretest('E2E Tests');

import workbookE2E from './e2e/workbook-lifecycle.test.js';
import sheetE2E from './e2e/sheet-lifecycle.test.js';
import cellE2E from './e2e/cell-lifecycle.test.js';
import styleE2E from './e2e/style-lifecycle.test.js';
import dataE2E from './e2e/data-roundtrip.test.js';
import chainE2E from './e2e/chain-scenarios.test.js';

!(async function () {
    let ok = true;
    for (const suite of [workbookE2E, sheetE2E, cellE2E, styleE2E, dataE2E, chainE2E]) {
        try {
            await suite();
        } catch {
            ok = false;
        }
    }
    void test;
    // Force-exit: background timers (VFS cleanup interval, auth server) keep
    // the event loop alive after suites finish.
    process.exit(ok ? 0 : 1);
})();
