# Test Findings: hyperlink.test.ts

- **Date:** 2026-07-18
- **Test file:** `test/integration/hyperlink.test.ts`
- **Runner:** `test/integration/hyperlink.run.ts` (`import runTests from './hyperlink.test.js'; await runTests();`), run via `npx tsx test/integration/hyperlink.run.ts`

## Result: FAIL

baretest aborts on the **first** failing test. The run stopped at the very first test.

### First failing test

`setup`

### Error

```
! setup

Error: Tool 'set_cell' is not registered
    at MockMcpServer.getTool (test/helpers/test-server.ts:29:23)
    at <anonymous> (test/integration/hyperlink.test.ts:36:36)
    at async Object.fn (test/integration/hyperlink.test.ts:15:5)
    at async self.run (node_modules/baretest/baretest.js:31:9)
    at async default (test/integration/hyperlink.test.ts:118:5)
    at async <anonymous> (test/integration/hyperlink.run.ts:2:1)
```

### Suspected src cause (NOT fixed — diagnostic only)

The `setup` test registers only two handlers:

1. `HyperlinkHandler` (`src/tools/handleHyperlink.ts`) — registers `set_cell_hyperlink`.
2. `WorkbookTools` (`src/tools/handleWorkbook.ts`) — registers workbook-level tools (`create_new_workbook`, `import_workbook_from_url`, etc.).

It then calls `mockServer.getTool('set_cell')`, but **`set_cell` is registered by `CellsTools`** in `src/tools/handleCells/write.ts` (line 16), which is **not** registered in the test's `setup`. Since `MockMcpServer.getTool` throws when a tool name is absent, `setup` fails immediately, so none of the 7 tests in the file were actually exercised.

Because baretest stops at the first failure, the actual `set_cell_hyperlink` behavior (the file's real subject) was never reached.

### Notes

- A benign `console.log` line `User is undefined` is printed during `setup`. It comes from `src/tools/handleWorkbook.ts` (`console.log(\`User is ${this.context.authInfo?.extra?.userId}\`)`) and reflects that the mock test context does not populate `authInfo.extra.userId`. It is unrelated to the failure.
- The failure is in **test setup wiring** (the test does not register the handler that owns `set_cell`), not in the hyperlink handler's production code. No src files were modified.
- Per the hard constraint, src was not touched. The issue is logged as a suspected test-side omission (missing `CellsTools` registration in `setup`).
