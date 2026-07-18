# Test Findings: hyperlink.test.ts

- **Date:** 2026-07-18
- **Test file:** `test/integration/hyperlink.test.ts`
- **Runner:** `test/integration/hyperlink.run.ts` (`import runTests from './hyperlink.test.js'; await runTests();`), run via `npx tsx test/integration/hyperlink.run.ts`

## Result: FAIL

baretest aborts on the **first** failing test. The run stopped at the 5th test (`setup` through the 4 passing hyperlink tests ran first, then execution halted).

### First failing test

`set_cell_hyperlink errors when no workbook is open`

(The 4 preceding tests passed: `setup`, `set_cell_hyperlink sets a hyperlink with ref and url`, `set_cell_hyperlink sets a hyperlink with display and tooltip`, `set_cell_hyperlink resolves cell via row and col`.)

### Error

```
! set_cell_hyperlink errors when no workbook is open

AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

  assert.ok(result.content.some((c: any) => c.text && c.text.includes('no workbook is currently open')))

    at <anonymous> (test/integration/hyperlink.test.ts:99:16)
```

The test expects that calling `set_cell_hyperlink` with a context that has no open workbook returns a content message containing the string `no workbook is currently open`. The actual `result.content` did not contain any text matching that string — i.e. the handler did not produce the expected "no workbook open" error message.

### Suspected src cause (NOT fixed — diagnostic only)

The `set_cell_hyperlink` handler (in `src/tools/handleHyperlink.ts`) is expected to detect a missing/closed workbook and return an MCP error content block whose text includes `no workbook is currently open`. The test received a `result` (it did not throw, and `result.content` was present) but the text did not match.

Likely one of:
- The handler, when no workbook is open, returns a different message string (or an empty/structured-only response) instead of the literal `no workbook is currently open` text.
- The handler may not be enforcing the "no open workbook" guard for the no-workbook context path at all, returning something other than the expected error content.

This is a suspected **src** defect in the hyperlink handler's missing-workbook error behavior, not a test-wiring issue. No src files were modified per the hard constraint; the failure is logged for follow-up.

### Notes

- A benign `console.log` line `User is undefined` is printed during `setup`. It comes from `src/tools/handleWorkbook.ts` (`console.log(\`User is ${this.context.authInfo?.extra?.userId}\`)`) and reflects that the mock test context does not populate `authInfo.extra.userId`. It is unrelated to the failure.
- The next test (`set_cell_hyperlink errors when url is missing`) was not reached because baretest aborts on first failure.
- Per the hard constraint, `src/` was not modified. The issue is logged as a suspected src-side defect in the hyperlink handler's "no workbook open" error handling.
