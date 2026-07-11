/**
 * Integration test runner.
 */
import baretest from 'baretest';

const test = baretest('Integration Tests');

import workbookFlow from './integration/workbook-flow.test.js';
import sheetOpsFlow from './integration/sheet-ops-flow.test.js';
import cellOpsFlow from './integration/cell-ops-flow.test.js';
import styleFlow from './integration/style-flow.test.js';
import chainFlow from './integration/chain-flow.test.js';
import dataValidationFlow from './integration/data-validation-flow.test.js';
import exportImportFlow from './integration/export-import-flow.test.js';
import authFlow from './integration/auth-flow.test.js';

workbookFlow(test);
sheetOpsFlow(test);
cellOpsFlow(test);
styleFlow(test);
chainFlow(test);
dataValidationFlow(test);
exportImportFlow(test);
authFlow(test);

!(async function () {
    await test.run();
})();
