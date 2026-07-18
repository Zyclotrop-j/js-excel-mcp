# Test Findings: print.test.ts

**Result:** FAIL

## Summary

Ran `test/integration/print.test.ts` in isolation via `test/integration/print.run.ts` (deleted afterward). baretest aborts on the first failing test.

## First failing test

`set_print_area without open workbook returns error`

**Error (assertion):**
```
AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
  assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')))
  at print.test.ts:76:16
```

The test calls `set_print_area` for user `different-user` (no open workbook) and expects the handler to return the error text `no workbook is currently open`. Instead the handler returned a non-error result (the workbook belonging to the setup user `print-test` was used), so the assertion on `result.content` failed.

## Suspected src cause

`src/tools/handlePrint.ts` line 12 derives the user context at **registration time** and ignores the per-call request context:

```ts
const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');
```

- The handler captures a fixed `Context` for one user when `register()` runs, and the tool callbacks all close over that single `context`.
- The callback signature is `(arg, ctx) => ...`, but `ctx` (the per-request `McpRequestContext` carrying the actual caller's `authInfo.userId`) is never consulted to re-resolve the user's `Context`.
- In the test, `printHandler.context` is set to the `print-test` TestContext (which has no `authInfo`, so the userId falls back to `'public'`... actually resolved via `print-test` path during setup), so the closure always operates as the setup user. Calling with `createMockRequestContext('different-user')` therefore still resolves the `print-test` workbook via `context.getCurrentFile()` and never reaches the `if (!filename)` error branch.

**Net effect:** the print tools do not honor per-request user isolation; a "different user" is treated as having the setup user's open workbook. This is a src bug — not a test bug. Per the HARD CONSTRAINT, src was NOT modified; this is logged only.

## Notes

- The two prior tests in execution order (`setup`, `teardown` do not run as assertions; actual tests) — baretest order: `setup`, `teardown`, `set_print_area sets print area correctly`, `set_print_area without open workbook returns error`, ... The first assertion-bearing test that failed was `set_print_area without open workbook returns error` (the 4th defined test). `set_print_area sets print area correctly` passed before it.
- Other tests in the suite (`set_page_setup ...`) were not reached because baretest aborts on the first failure.
- Confirmed via reading `src/tools/interface.ts` (`ToolHandler.context` is the request context) and the test helpers (`createMockRequestContext` puts userId in `authInfo.extra.userId`); the handler ignores both.

## Artifacts

- `test/integration/print.run.ts` created and deleted (not left in tree).
- No changes made to `src/`.
