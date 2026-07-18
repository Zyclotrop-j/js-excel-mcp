# Test Findings: protection.test.ts

- **Date:** 2026-07-18
- **Test file:** `test/integration/protection.test.ts`
- **Run method:** `npx tsx test/integration/protection.run.ts` (isolated, via generated `protection.run.ts` wrapper importing `./protection.test.js`; wrapper deleted after run)

## Result: FAIL

baretest aborts on the FIRST failing test. The run stopped at the test below; no further tests executed (including `teardown`).

### First failing test

`lock_cell locks a cell by ref` (protection.test.ts:71-82, assertion at line 79)

### Error

```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
undefined !== 'A1'
    at protection.test.ts:79:16
    at protection.test.ts:72:5
```

The assertion `assert.equal(result.structuredContent.ref, 'A1')` failed because
`result.structuredContent.ref` was `undefined`.

### Preceding tests (passed before abort)

- `setup` — passed
- `protect_sheet enables protection` — passed (asserts `structuredContent.protected === true`)
- `protect_sheet disables protection` — passed (asserts `structuredContent.protected === false`)

### Tests NOT executed (after abort)

- `lock_cell unlocks a cell by ref`
- `lock_cell locks cell by row/col coordinates`
- `lock_cell error when sheet not found`
- `protect_sheet error when no workbook is open`
- `teardown` (cleanup not run — test context may need manual cleanup)

## Suspected src cause

In `src/tools/handleProtection.ts` (lock_cell handler, lines 69-102):

- The response builds `structuredContent: { ref, locked: arg.locked }` where
  `ref = getCoordinate(cell)` (line 95).
- `protect_sheet` (which uses the same `context.contextualiseResponse` path and passed)
  only returns `structuredContent: { protected }`, so the response plumbing is fine.
- Therefore the `undefined` value points to `getCoordinate(cell)` returning `undefined`
  for the cell reference, rather than a formatting/response-marshalling problem.

Concretely: `getCoordinate` (imported from `@office-kit/xlsx/cell`) appears to return
`undefined` for the cell produced by `getCellByCoord(ws, 'A1')`, so `ref` is `undefined`
and the assertion fails. (This is the suspected root cause in src — NOT fixed, per task
constraints.)

## Notes

- The test imports `./protection.test.js` (compiled output) but was run via tsx against
  the `.ts` source; tsx resolved the `.js` extension to the sibling `.ts` file correctly
  (no missing-module error). Import resolution is OK.
- Stray log line `User is undefined` appeared during `setup` (from `getContext(...)`
  falling back to `'public'` when `authInfo` is absent in the mock context). This is a
  debug log, not a failure.
- `teardown` did not run because baretest aborts on first failure, so `testContext.cleanup()`
  was skipped. The mock/test context created in `setup` was not cleaned up by the test run.
- Exit code reported as 0 by the shell wrapper despite baretest printing `! <name>` and
  aborting; the abort is evidenced by the `! lock_cell locks a cell by ref` marker and the
  truncated test list (only 3 of 9 tests ran).
