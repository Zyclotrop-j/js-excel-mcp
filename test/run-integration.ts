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
import discoveryTests from './integration/discovery.test.js';
import authServerTests from './integration/auth-server.test.js';
import layoutTests from './integration/layout.test.js';
import chartTests from './integration/chart.test.js';
import tableTests from './integration/table.test.js';
import protectionTests from './integration/protection.test.js';
import conditionalFormatTests from './integration/conditional-format.test.js';
import commentTests from './integration/comment.test.js';
import hyperlinkTests from './integration/hyperlink.test.js';
import imageTests from './integration/image.test.js';
import namedRangeTests from './integration/named-range.test.js';
import outlineTests from './integration/outline.test.js';
import printTests from './integration/print.test.js';
import numberFormatTests from './integration/number-format.test.js';
import richTextTests from './integration/rich-text.test.js';
import setContextTests from './integration/set-context.test.js';
import bug1HydrateTests from './integration/bug1-hydrate.test.js';
import bug2CellValueRuleTests from './integration/bug2-cell-value-rule.test.js';
import bug3RichTextTests from './integration/bug3-rich-text.test.js';
import bug4CloseWorkbookTests from './integration/bug4-close-workbook.test.js';

workbookFlow(test);
sheetOpsFlow(test);
cellOpsFlow(test);
styleFlow(test);
chainFlow(test);
dataValidationFlow(test);
exportImportFlow(test);
authFlow(test);
discoveryTests(test);
authServerTests(test);
layoutTests(test);
chartTests(test);
tableTests(test);
protectionTests(test);
conditionalFormatTests(test);
commentTests(test);
hyperlinkTests(test);
imageTests(test);
namedRangeTests(test);
outlineTests(test);
printTests(test);
numberFormatTests(test);
richTextTests(test);
setContextTests(test);
bug1HydrateTests(test);
bug2CellValueRuleTests(test);
bug3RichTextTests(test);
bug4CloseWorkbookTests(test);

!(async function () {
    await test.run();
})();
