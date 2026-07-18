# Findings: outline.test.ts

**Result:** FAIL

## First failing test

`group_rows fails with no open workbook`

baretest aborts on the first failing test, so the remaining tests
(`group_columns fails with no open workbook`) were NOT executed.

## Error

```
! group_rows fails with no open workbook

TypeError: testContext.cleanup is not a function
    at <anonymous> (test/integration/outline.test.ts:104:27)
    at AsyncLocalStorage.run (node:internal/async_local_storage/async_context_frame:63:14)
    at run (src/util/requestContext.ts:15:27)
    at Object.fn (test/integration/outline.test.ts:99:11)
    at self.run (node_modules/baretest/baretest.js:31:20)
    at default (test/integration/outline.test.ts:129:5)
```

The test crashes inside the test body when it calls `await testContext.cleanup()`.

## Suspected src cause

**None — this is a test-helper defect, not a src bug.**

`testContext` comes from `createTestContext()` in `test/helpers/test-context.ts`
(outside `src/`). That helper attaches `cleanup` via `Object.assign(ctx, {...})`
to the object returned by `Context.getContext(id)`. The runtime reports
`testContext.cleanup is not a function`, meaning the `cleanup` method was not
present on the resolved context object at call time.

Possible reasons (all in the test helper, not src):
- `Context.getContext(id)` returns a value (e.g. a fresh proxy/immutable
  object or `undefined`/`null`) onto which the `Object.assign` append didn't
  take effect, or the returned object replaced the assigned one.
- The `TestContext` interface promises `cleanup()` but the helper's
  `Object.assign` shape doesn't always end up on the variable referenced as
  `testContext` (note it is captured via the `let testContext` closure after
  being awaited inside the `setup` test; its value is whatever `createTestContext`
  returned).

The crash occurs before any `group_rows`/src logic is exercised in this test,
so no src-level behavior of the outline handlers was confirmed by this run.

## Notes

- Tests that ran and passed before the abort:
  - `setup`
  - `teardown`
  - `group_rows groups a range of rows`
  - `group_rows groups rows with collapsed state`
  - `group_columns groups a range of columns`
  - `group_columns groups columns with collapsed state`
- The `teardown` test (`await (await testContext).cleanup()`) would likely hit
  the same `cleanup is not a function` failure if reached, suggesting the
  `cleanup` absence is systemic to the test context in this environment rather
  than unique to one call site.
- Console also emitted `User is undefined` during the run (from `setup`/`run`
  context), which may be related to the context object not fully materializing
  its helper methods.
- **Not modified `src/`.** Per the hard constraints, the failing test is a
  test/helper issue and was logged, not fixed.
