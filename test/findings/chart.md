# Chart Integration Test Results (Isolated Run)
- Date: 2026-07-18
- File: test/integration/chart.test.ts
- Runner: tsx test/integration/chart.run.ts (baretest, isolated)
- Result: FAIL
- Tests registered: 11 (setup, 9 chart tests, teardown). baretest aborts on FIRST failure.
- Surfaced: 4 visible (3 passed: `setup`, `add_bar_chart adds a clustered column/bar chart`, `add_bar_chart with optional title omitted`; then 1 failed -> abort). Tests after the failure (no-open-workbook already failed; remaining: row-direction/stacking, line chart, smooth line, missing dataRange, invalid dataRange) did NOT run.

## First failing test (the only one baretest reports)
- `add_bar_chart with no open workbook (separate context)` — chart.test.ts:95 (assertion at line 108)
  - Error: `AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: assert.ok(result.content.some((c:any)=>c.text.includes('no workbook is currently open')))`
  - Baretest printed `! add_bar_chart with no open workbook (separate context)` and aborted. Exit code was 0 (baretest does not propagate failure via exit code).

## Failures

### 1. `add_bar_chart with no open workbook (separate context)` — chart.test.ts:95
- **Error**: `result.content` does not contain the string `'no workbook is currently open'`. The assertion at line 108 was falsy.
- **Suspected src cause**: The test creates a *separate* context (`createTestContext('chart-test-no-wb')`) and a *separate* mock request, then calls the **same** registered `add_bar_chart` tool instance. The chart handler binds `this.context` at `register()` time to the original `testContext` (userId `chart-test`), which has `chart-test.xlsx` open. The handler's `cb` uses its statically-bound context rather than the per-request context, so `getCurrentFile()` returns the open workbook and the chart is added successfully — a normal success response is returned instead of the `'no workbook is currently open'` error. The handler only emits that error when its bound `getCurrentFile()` is null, which never happens here. This is a src design characteristic (handler is not request-context-scoped), not satisfied by the test's isolation assumption. Per task constraints, this is logged — NOT fixed in src.
- **Notes**:
  - `setup` passed in this run (the 3 leading `•` dots confirm the first three tests ran and passed), so `set_cells` registration via `CellWriteHandler.register([])` at chart.test.ts:36 works.
  - The happy-path chart creation and optional-title behavior are confirmed working by the two passing chart tests.
  - No `src/` files were created, modified, or deleted. Run executed in isolation per the task.

## Notes
- Command: `npx tsx test/integration/chart.run.ts` from project root, capturing stdout/stderr.
- Observed output:
  ```
  npm warn Unknown project config "strict-peer-dependencies". ...
  Chart Integration Tests User is undefined
  • • •

  ! add_bar_chart with no open workbook (separate context)

  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

    assert.ok(result.content.some((c:any)=>c.text.includes('no workbook is currently open')))
      at <anonymous> (.../test/integration/chart.test.ts:108:16)
      at async Object.fn (.../test/integration/chart.test.ts:96:5)
      at async self.run (.../node_modules/baretest/baretest.js:31:9)
      at async default (.../test/integration/chart.test.ts:205:5)
      at async <anonymous> (.../test/integration/chart.run.ts:2:1)
  ```
- The `"User is undefined"` line is the known auth-context warning (see baseline notes) and is NOT the failure.
- Because baretest aborts on first failure, only this one assertion surfaced; tests after it (row-direction/stacking, line chart, smooth line, missing dataRange, invalid dataRange) remain UNVERIFIED in this run.
