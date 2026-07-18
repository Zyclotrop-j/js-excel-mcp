# Table Integration Test — Findings

**Date:** 2026-07-18
**Test file:** `test/integration/table.test.ts`
**Run file:** `test/integration/table.run.ts` (transient, created + deleted per task)
**Command:** `npx tsx test/integration/table.run.ts` (from project root)

## Result: FAIL (import-time failure — no tests executed)

The test file could not be loaded under the prescribed harness. The runner harness
expects `table.test.ts` to export a default async function named `runTests` (used as
`import runTests from './table.test.js'; await runTests();`), but `table.test.ts`
provides **no default export**. (It also never calls `test.run()` itself, so the suite
would not execute even as a direct entry point — see Notes.)

### Error

```
C:\Users\Janne\scripts\js-excel-mcp\test\integration\table.run.ts:1
import runTests from './table.test.js';
       ^
SyntaxError: The requested module './table.test.js' does not provide an export named 'default'
    at #asyncInstantiate (node:internal/modules/esm/module_job:319:21)
    at async ModuleJob.run (node:internal/modules/esm/module_job:422:5)
    ...
Node.js v24.14.1
```

Because the failure occurs during module instantiation, **baretest never runs** and
**no individual test is reported** (no `! <test>` and no `✓ N`). The very first
thing that fails is the `import`, before any test body executes.

### Suspected cause (test-harness, not src)

 - Other integration tests in the same folder (e.g. `chart.test.ts`, `workbook-flow.test.ts`,
   `style-flow.test.ts`, etc.) end with a default-exported runner, e.g.:

   ```ts
   export default async function () {
       await test.run();
   }
   ```

   `table.test.ts` defines its `baretest` suite (`const test = baretest('Table Integration Tests');`)
   and declares all 12 tests, but **never calls `test.run()`** and **has no `export default`**.

 - Verified against `node_modules/baretest/baretest.js`: baretest does **NOT** auto-run on
   process exit. `test.run()` must be invoked explicitly. So this file would not execute its
   suite even if run as a direct entry point — the suite is registered but never run.

 - Under the harness contract (`import runTests from './table.test.js'; await runTests();`),
   the missing default export causes a hard `SyntaxError` at module load, before any test runs.

 - This is a **test-file structural defect** (in `test/`, not `src/`). No `src/` file was
   touched or required to diagnose it. Per task constraints, `src/` was not modified.

### Notes

- All 12 declared tests in `table.test.ts` were never reached:
  1. `setup`
  2. `create_excel_table creates a table in the range`
  3. `create_excel_table with minimal options`
  4. `create_excel_table requires name and columns`
  5. `add_autofilter adds autofilter to specified range`
  6. `add_autofilter on specified sheet`
  7. `add_autofilter requires range`
  8. `create_excel_table uses current workbook when not specified`
  9. `add_autofilter uses current sheet when not specified`
  10. `create_excel_table with no open workbook`
  11. `add_autofilter with unknown sheet`
  12. `teardown`
- The `npm warn Unknown project config "strict-peer-dependencies"` line is an unrelated
  npmrc warning emitted by `npx`; it is not part of the test failure.
- To make this test importable under the harness contract, `table.test.ts` would need
  a default export that invokes `await test.run()`. That change belongs in `test/` and was
  deliberately **not** applied here (task scope: run in isolation + log findings only).
