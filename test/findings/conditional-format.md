# Findings: conditional-format.test.ts (run in isolation)

**Result: FAIL**

## How it was run

- Created `test/integration/conditional-format.run.ts` containing:
  ```ts
  import runTests from './conditional-format.test.js';
  await runTests();
  ```
- Command (from project root): `npx tsx test/integration/conditional-format.run.ts`
- Captured stdout/stderr.
- Runner stub deleted afterward (HARD CONSTRAINT honored — no `src/` changes, no extra files left behind).

## First failing test

`! teardown` — the `teardown` test registered at `conditional-format.test.ts:60`.
baretest aborts the whole run on the first failure, so no subsequent tests executed.

### Error

```
TypeError: testContext.cleanup is not a function
    at Object.fn (conditional-format.test.ts:61:23)
    at self.run (node_modules/baretest/baretest.js:31:20)
    at async default (conditional-format.test.ts:214:5)
    at async <anonymous> (conditional-format.run.ts:2:1)
```

Note: the `setup` test (`:17`) printed `• ` (baretest's success marker), because it does not itself call `.cleanup()`; the missing method only surfaces in the immediately following `teardown` test.

## Root cause (test harness, NOT a src bug)

Line 20 of the test:

```ts
testContext = createTestContext('conditional-format-test');
```

`createTestContext` is an `async` function (declared in `test/helpers/test-context.ts:15`) and therefore **returns a Promise**. The assignment is missing an `await`, so the module-level `testContext` variable is bound to a *pending Promise object* instead of the resolved `TestContext` instance. A Promise has no `cleanup` property, so `testContext.cleanup()` at line 61 throws `cleanup is not a function`.

This was confirmed by an isolated repro that `await`ed `createTestContext` and observed a fully-formed object (`keys: ['virtualFileSystem','userId','cleanup']`, `typeof cleanup === 'function'`). The same repro reproducing the test's exact non-awaited pattern yielded `testContext` === `{}`-shaped Promise (no `cleanup`), matching the live failure.

A second, identical defect exists at line 193:

```ts
const testContextNoWb = createTestContext('cf-test-no-wb');
```

This is in the `add_color_scale without open workbook (error)` test, which is never reached because baretest aborts at the first `teardown` failure.

## Suspected src cause

**None.** The `src/` code under test is not implicated:

- `src/filesystem/context.ts` `Context.getContext` and `Context` behave correctly.
- `src/util/requestContext.ts` `run`/`getContext` behave correctly.
- `src/tools/handleConditionalFormat.js`, `src/tools/handleCells/write.js`, `src/tools/handleWorkbook.js` all register and execute as expected (the `setup` test populated the workbook and cells without error).
- `createTestContext` (test helper, not `src/`) correctly attaches `cleanup` when its result is awaited.

The failure is entirely in the test file: a missing `await` on an `async` call. Per the HARD CONSTRAINTS, `src/` was not modified. The test file itself was also left untouched (only temporary debug copies were used and removed).

## Notes

- The benign `User is undefined` banner printed before the failure originates from `createMockRequestContext` / `WorkbookTools.register()` logging `authInfo?.extra?.userId`, which the mock context does not populate. It is unrelated to the failure.
- Because `teardown` is the second test and baretest aborts on first failure, the actual conditional-format tools (`add_color_scale`, `add_cell_value_rule`, incl. their happy-path / default / error variants) were **never exercised**. Their pass/fail status is **unknown** from this isolated run.
- The test's default export (`export default async function () { await test.run(); }`) matches the runner stub's `import runTests from './conditional-format.test.js'; await runTests();` — the import itself succeeded.
- Prior findings file (`test/findings/conditional-format.md`) described an earlier failure (`set_cell is not registered` in `setup`). The test has since been updated to register `CellWriteHandler` (`:35`), so that issue is resolved; the current blocker is the missing-`await` defect above.
- No `src/` files were modified, created, or deleted (per HARD CONSTRAINTS).
