# Test Findings: table.test.ts

**Result:** FAIL

**Test command:** `npx tsx test/integration/table.run.ts`

## Failures

### First failing test: `create_excel_table uses current workbook when not specified`

**Error:**
```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected
+ 'table-test2.xlsx'
- 'table-test.xlsx'
    at test/integration/table.test.ts:161:16
    (await tool.cb({ range: 'A1:C3', name: 'CurrentWorkbookTable', columns: [...] }, ctx))
    assert.equal(result.structuredContent.filename, 'table-test.xlsx');
```

baretest aborts on the FIRST failing test (prints `! <name>`). The run stopped here; remaining tests (e.g. `add_autofilter uses current sheet when not specified`, `create_excel_table with no open workbook`, `add_autofilter with unknown sheet`, `teardown`) were NOT executed.

## Suspected src cause

The test relies on the server's sticky "current workbook" context remaining `table-test.xlsx` after an earlier test (`add_autofilter on specified sheet`) created a *second* workbook `table-test2.xlsx` (with `createDefaultWorksheet: 'DataSheet'`) and operated on it by passing `workbook`/`sheet` explicitly.

The failing test calls `create_excel_table` with **no** `workbook` argument and expects the current workbook to still be `table-test.xlsx`. Instead the handler resolved the current workbook to `table-test2.xlsx`. This points to a state-management bug in the sticky context (`src/util/requestContext.js` or the workbook/context layer) where creating/operating on an explicitly-named different workbook mutates the saved "current workbook" pointer, rather than leaving it unchanged when the target workbook is passed explicitly.

> NOTE: Per HARD CONSTRAINTS, `src/` was NOT modified. This is logged for follow-up.

## Notes

- The 6 tests before the failure passed (`setup`, `create_excel_table creates a table in the range`, `create_excel_table with minimal options`, `create_excel_table requires name and columns`, `add_autofilter adds autofilter to specified range`, `add_autofilter on specified sheet`). They printed as `•` (dots) and were not individually labeled by baretest's minimal output.
- A warning was emitted by npm (`Unknown project config "strict-peer-dependencies"`), unrelated to the test result.
- A `User is undefined` line appeared in stdout before the test output — appears to be incidental logging from the test harness, not a failure.
- The `teardown` test (which calls `testContext.cleanup()`) did NOT run because baretest aborted early, so any test-created resources may not have been cleaned up by the suite.
