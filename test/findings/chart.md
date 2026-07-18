# Chart Integration Test Results (Isolated Run)
- Date: 2026-07-18
- File: test/integration/chart.test.ts
- Runner: tsx test/integration/chart.run.ts (baretest, isolated)
- Result: FAIL
- Visible: 4/N (baretest aborts on first failure; 11 tests registered, 1 failure surfaced)
  - Passed before abort: setup, add_bar_chart adds a clustered column/bar chart, add_bar_chart with optional title omitted
  - Registered tests: setup, add_bar_chart adds a clustered column/bar chart, add_bar_chart with optional title omitted, add_bar_chart with no open workbook (separate context), add_bar_chart with row direction and stacking, add_line_chart adds a line chart, add_line_chart with smooth option, add_bar_chart requires dataRange parameter, add_bar_chart with invalid dataRange fails, add_line_chart with invalid dataRange fails

## First failing test (the only one baretest reports)
- `add_bar_chart with no open workbook (separate context)` — chart.test.ts:95 (assertion fails at line 108, inside the `run` block)
  - Error: `AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: assert.ok(result.content.some((c:any)=>c.text.includes('no workbook is currently open')))`
  - at <anonymous> (chart.test.ts:108:16)
  - at async Object.fn (chart.test.ts:96:5)
  - at baretest run
  - baretest printed `! add_bar_chart with no open workbook (separate context)` and aborted the run (exit code 0 — baretest returns 0 even on failure).

## Failures

### 1. `add_bar_chart with no open workbook (separate context)` — chart.test.ts:95
- **Error**: `assert.ok(result.content.some((c) => c.text.includes('no workbook is currently open')))` evaluated falsy. The returned `result.content` does not contain the string `'no workbook is currently open'`.
- **Suspected src cause**: The test attempts to exercise per-request context isolation by creating a separate context (`createTestContext('chart-test-no-wb')`) and a separate mock request (`createMockRequestContext('chart-test-no-wb')`), then calling the SAME registered `add_bar_chart` tool. However, the chart handler (`src/tools/handleChart.ts`) binds `this.context` to the context passed at `register()` time — the original `testContext` for userId `chart-test`, which DOES have a workbook open. The handler's `cb` ignores the per-request context and always uses `this.context` (see `handleChart.ts:13` `Context.getContext(...)` at register, and `:35` `const filename = arg.workbook ?? await context.getCurrentFile()` where `context` is the bound `this.context`). Because the bound context has `chart-test.xlsx` open, `filename` is truthy, the handler proceeds to add the chart successfully, and returns a normal success `result` whose `content` holds the context-state text (from `context.contextualiseResponse` -> `Context.getCurrentState`, `src/filesystem/context.ts:91`) rather than the `'no workbook is currently open'` error text. The handler only emits that error text when `getCurrentFile()` returns null, which never happens for the bound (original) context. So this is a **src design characteristic**: the handler is not request-context-scoped — it uses its statically-bound context. The test's assumption of per-request isolation is not satisfied by the current src. Per task constraints this is logged, not fixed.
- **Notes**:
  - This is a different first-failure than a previously recorded findings file, which reported `setup` failing with `Tool 'set_cells' is not registered`. In the current run the `setup` test PASSED (the `• • •` dots before the `!` indicate the first three tests ran and passed), meaning the `CellWriteHandler` registration in `setup` now succeeds (set_cells is registered via `CellWriteHandler.register([])` at chart.test.ts:36). The current blocker is the context-isolation test below `setup`.
  - The `structuredContent` success path (anchorCell / title assertions in the other tests) was never reached for this failing case, but the passing tests above it (`add_bar_chart adds a clustered column/bar chart`, `add_bar_chart with optional title omitted`) confirm the happy-path chart creation and the optional-title behavior work correctly against `src/tools/handleChart.ts`.
  - No `src/` files were created, modified, or deleted. This run was executed in isolation per the task; the baretest abort behavior means only the first failure is observable (downstream tests 5–11 never ran).

## Notes
- Command: `npx tsx test/integration/chart.run.ts` from project root, capturing stdout/stderr. Exit code was 0 (baretest does not signal failure via exit code here).
- Output observed:
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
      at async default (.../test/integration/chart.test.ts:216:5)
      at async <anonymous> (.../test/integration/chart.run.ts:2:1)
  ```
- The `"User is undefined"` line is the known auth-context warning (see baseline.md notes) and is NOT the failure.
- Because baretest aborts on the first failure, only this one assertion surfaced. Tests 5–11 (row-direction/stacking, line chart, smooth line, missing dataRange, invalid dataRange for both charts) remain UNVERIFIED in this run.
