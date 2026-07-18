# Test Findings: layout
- Date: 2026-07-18
- Test file: test/integration/layout.test.ts
- Ran via: npx tsx test/integration/layout.run.ts
- Result: FAIL (0 passed / M failed)

## Failures
### (entire suite — import/load failure, no tests executed)
- Error: SyntaxError: The requested module './layout.test.js' does not provide an export named 'default'
  ```
  C:\Users\Janne\scripts\js-excel-mcp\test\integration\layout.run.ts:1
  import runTests from './layout.test.js';
         ^
  SyntaxError: The requested module './layout.test.js' does not provide an export named 'default'
      at #asyncInstantiate (node:internal/modules/esm/module_job:319:21)
      at async ModuleJob.run (node:internal/modules/esm/module_job:422:5)
      at async asyncRunEntryPointWithESMLoader (node:internal/modules/loader:661:26)
      at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)
  ```
- Suspected src cause (DO NOT fix): NONE in src. The test file `test/integration/layout.test.ts` does not export a `default` function named `runTests`. It instead creates a local `baretest('Layout Integration Tests')` instance and registers its tests directly at module load, and never calls `test.run()` nor exports anything. The prescribed runner `import runTests from './layout.test.js'; await runTests();` therefore cannot obtain a callable export — the import itself throws before any test runs.
  - Additionally, even if the import were satisfied, `layout.test.ts` never invokes `test.run()`, so the registered tests (setup, merge_cells x3, freeze_panes x3, set_column_width x3, set_row_height x3, teardown) would not execute. The project's other integration suites (e.g. `test/run-integration.ts`) follow a different pattern: each module exports a function `(test) => void` that registers onto a shared baretest instance, and the runner calls `test.run()`. `layout.test.ts` does not follow that pattern.
- Notes:
  - This is a test-harness/interface mismatch, not a src bug. No src files were touched (per hard constraints).
  - Because the module fails to load, NONE of the test cases executed (0 passed).
  - The runner `test/integration/layout.run.ts` was created and removed per procedure.
  - NOTE: A prior findings entry for this file reported a *syntax error at line 195* (`\"` inside a single-quoted string). That syntax error is NO LONGER PRESENT in the current file — line 195 is now a valid double-quoted literal containing single quotes (`"sheet 'NonExistentSheet' not found"`). The earlier finding is stale.
