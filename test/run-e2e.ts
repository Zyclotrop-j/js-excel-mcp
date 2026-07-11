/**
 * E2E test runner.
 */
import baretest from 'baretest';

const test = baretest('E2E Tests');

import workbookE2E from './e2e/workbook-lifecycle.test.js';
import sheetE2E from './e2e/sheet-lifecycle.test.js';
import cellE2E from './e2e/cell-lifecycle.test.js';
import styleE2E from './e2e/style-lifecycle.test.js';
import dataE2E from './e2e/data-roundtrip.test.js';
import chainE2E from './e2e/chain-scenarios.test.js';

workbookE2E(test);
sheetE2E(test);
cellE2E(test);
styleE2E(test);
dataE2E(test);
chainE2E(test);

!(async function () {
    await test.run();
})();
