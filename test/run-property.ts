/**
 * Property-based test runner.
 */
import baretest from 'baretest';

const test = baretest('Property-Based Tests');

import cellProps from './property/cell-properties.test.js';
import rangeProps from './property/range-properties.test.js';
import sheetProps from './property/sheet-properties.test.js';
import styleProps from './property/style-properties.test.js';
import vfsProps from './property/vfs-properties.test.js';
import encodingProps from './property/encoding-properties.test.js';
import cursorProps from './property/cursor-properties.test.js';
import cursorPropertiesV2 from './property/cursor-properties-v2.test.js';

cellProps(test);
rangeProps(test);
sheetProps(test);
styleProps(test);
vfsProps(test);
encodingProps(test);
cursorProps(test);
cursorPropertiesV2(test);

!(async function () {
    await test.run();
})();
