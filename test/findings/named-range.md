# Test Findings: named-range

- **File:** `test/integration/named-range.test.ts`
- **Run command:** `npx tsx test/integration/named-range.run.ts` (with `named-range.run.ts` re-exporting the default `runTests`)
- **Date:** 2026-07-18

## Result: FAIL

### Summary
baretest printed 4 passing bullets (`• • • •`) then aborted on the **5th test**:
`add_named_range without workbook error`

The 4 passing tests are (in execution order): `setup`, `teardown`,
`add_named_range creates named range for current sheet`,
`add_named_range accepts sheet prefix in range`.

### First failing test
`add_named_range without workbook error`

### Error
The test throws an uncaught exception inside its own setup, before any assertion:

```
Error: Tool 'create_new_workbook' is not registered
    at MockMcpServer.getTool (test/helpers/test-server.ts:29:23)
```

### Suspected src cause
**None.** This is a **test-harness bug**, not a `src/` bug.

In the failing test (lines 80–87) a *separate* `MockMcpServer`
(`separateMockServer`) is created and only `NamedRangeHandler` is
registered on it. `create_new_workbook` is registered by `WorkbookTools`
(`src/tools/handleWorkbook.ts`), not by `NamedRangeHandler`. The test then
calls `separateMockServer.getTool('create_new_workbook')`, which throws
because `WorkbookTools` was never registered on `separateMockServer`.

A standalone reproduction (temporary `named-range.diag.ts`, deleted after
use) confirmed the identical `Tool 'create_new_workbook' is not registered`
error, and that the first four tests pass cleanly.

### Notes
- `src/` was **not** modified.
- The failure is reproducible and deterministic (exit code 13 from baretest
  on first failing test).
- The intended assertion of the failing test (expecting a "no workbook is
  currently open" error from `add_named_range`) was never reached because the
  test setup itself crashes while trying to create the prerequisite workbook.
- Remaining tests (`delete_named_range removes existing named range`,
  `delete_named_range error on non-existent range`,
  `add_named_range without current sheet error`,
  `delete_named_range with explicit workbook parameter`) were **not executed**
  because baretest aborts on the first failure.
- To fix the *test* (not done here, out of scope / src not owned): register
  `WorkbookTools` on `separateMockServer` before calling
  `separateMockServer.getTool('create_new_workbook')` in test #5, mirroring
  the setup used in the `setup` test.
