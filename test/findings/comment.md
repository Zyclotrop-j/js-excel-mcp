# Findings: comment.test.ts

**Date:** 2026-07-18
**Runner:** `npx tsx test/integration/comment.run.ts` (isolated)
**Result:** FAIL

## Failure

baretest aborts on FIRST failing test. The first failing test is:

**`! setup`** (the very first test in the suite)

**Error:**
```
Error: Tool 'set_cell' is not registered
    at MockMcpServer.getTool (test/helpers/test-server.ts:29:23)
    at comment.test.ts:36:36   (in the `setup` test)
    at comment.test.ts:15:5
```

The `setup` test registers `CommentHandler` and `WorkbookTools`, then calls:
- `create_new_workbook` → OK
- `set_cell` (A1, B1) → THROWS, because `set_cell` was never registered.

## Suspected src cause

`src/tools/handleWorkbook.ts` (the `WorkbookTools` handler) only registers workbook-level tools such as `create_new_workbook`, `import_workbook_from_url`, etc. The `set_cell` tool is registered by a **different** handler file:

- `src/tools/handleCells/write.ts` (line 16): `this.registerTool('set_cell', ...)`

The `setup` test only instantiates and registers `CommentHandler` and `WorkbookTools`; it does **not** import/register the cell-writing handler (`handleCells/write.ts`). Therefore `set_cell` is never registered with the `MockMcpServer`, and `getTool('set_cell')` throws `Tool 'set_cell' is not registered`.

This is a test-side registration gap: the suite needs the cell handler registered in `setup` to make `set_cell` available. (Per task constraints, src was NOT modified.)

## Notes

- The run printed `User is undefined` before the failure — `CommentHandler`/`WorkbookTools` `register()` logs `User is ${this.context.authInfo?.extra?.userId}`, and the test context's `authInfo?.extra?.userId` is undefined. This is logged but is a separate non-fatal observation, not the cause of the abort.
- Subsequent tests (`add_comment`, `delete_comment`, no-workbook error cases, `teardown`) never ran because baretest terminates on the first failure in `setup`.
- `baretest` returned no `✓ N` — the suite did not complete; it aborted at the first test.
