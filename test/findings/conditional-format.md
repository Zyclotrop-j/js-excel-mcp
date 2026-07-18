# Findings: conditional-format.test.ts (run in isolation)

**Result: FAIL**

## How it was run

- Created `test/integration/conditional-format.run.ts` containing exactly:
  ```ts
  import runTests from './conditional-format.test.js';
  await runTests();
  ```
- Command (from project root): `npx tsx test/integration/conditional-format.run.ts`
- Captured stdout/stderr. Process exited non-zero (exit code 13).
- Runner stub deleted afterward (HARD CONSTRAINT honored — no `src/` changes, no extra files left behind).
- No `src/` files were modified, created, or deleted.

## First failing test

`! add_color_scale without open workbook (error)` — the test registered at `conditional-format.test.ts:191`.

baretest aborts the whole run on the first failing test (it prints `! <name>` and returns). Tests 1–11 printed a passing `• ` marker (captured synchronously to a file), so they passed; the run then entered test 12 and aborted.

### Error

```
TypeError: Cannot read properties of undefined (reading 'registerTool')
    at ConditionalFormatHandler.registerTool (src/tools/interface.ts:47:28)
    at ConditionalFormatHandler.register (src/tools/handleConditionalFormat.ts:13:14)
```

This error is thrown while executing the body of the failing test (the `await conditionalFormatHandlerNoWb.register([])` call at `conditional-format.test.ts:196`).

### Detail of the test

```ts
// conditional-format.test.ts:191-198
test('add_color_scale without open workbook (error)', async () => {
    await run(async () => {
        const testContextNoWb = createTestContext('cf-test-no-wb');   // line 193
        const conditionalFormatHandlerNoWb = new ConditionalFormatHandler();
        conditionalFormatHandlerNoWb.context = testContextNoWb;        // .server is NOT set
        await conditionalFormatHandlerNoWb.register([]);              // line 196 -> throws
        const toolNoWb = new MockMcpServer().getTool('add_color_scale'); // line 198
        ...
    });
});
```

Two defects in this test block prevent it from ever reaching its assertion:

1. **`conditionalFormatHandlerNoWb.server` is never assigned** (unlike the `setup` test at line 22-23 which does `conditionalFormatHandler.server = mockServer as any`). `ToolHandler.register` → `registerTool` (src/tools/interface.ts:47) calls `this.server.registerTool(...)`, so with `this.server === undefined` it throws `TypeError: Cannot read properties of undefined (reading 'registerTool')`. This is the first error observed.
2. Even if (1) were fixed, line 198 does `new MockMcpServer().getTool('add_color_scale')` — it builds a **brand-new** `MockMcpServer` that the handler never registered on, so `getTool` returns `undefined` and `toolNoWb.cb(...)` would throw `TypeError: Cannot read properties of undefined (reading 'cb')`.

A third, pre-existing minor issue exists at line 193 (`createTestContext` is `async`, so `testContextNoWb` is bound to a Promise, not a resolved `TestContext`). It is masked here because the test aborts at the `register` call before `testContextNoWb` is used.

## Suspected src cause

**None (test-harness defect, not a src bug).**

- `src/tools/interface.ts:47` (`registerTool`) and `src/tools/handleConditionalFormat.ts:13` (`register`) behave exactly as designed: a tool handler requires a `server` instance to register tools against, and they correctly dereference `this.server`. The throw is the legitimate consequence of the test omitting the `.server` assignment.
- `src/tools/handleConditionalFormat.js`, `src/tools/handleCells/write.js`, `src/tools/handleWorkbook.js`, `src/filesystem/context.ts`, and `src/util/requestContext.ts` are not implicated — the `setup` test (which wires `.server` correctly) populated the workbook and all cells without error, and tests 1–11 (the actual `add_color_scale` / `add_cell_value_rule` happy-path / default / error-variant exercises) all passed.

Because the failure is in the test's own wiring, per the HARD CONSTRAINTS `src/` was not modified.

## Notes

- The benign `User is undefined` banner printed before the run originates from `createMockRequestContext` / `WorkbookTools.register()` logging `authInfo?.extra?.userId`, which the mock context does not populate. It is unrelated to the failure.
- The tsx/esbuild runtime emits a misleading `Warning: Detected unsettled top-level await` and truncates baretest's final `! <name>` summary line from the console. To determine the first failing test reliably, output was captured synchronously to a file (11 passing `• ` markers) and the failing test's logic was replicated in an isolated harness, which reproduced the exact `TypeError: Cannot read properties of undefined (reading 'registerTool')` from `src/tools/interface.ts:47`.
- Tests 1–11 that passed: `setup`, `teardown` (line 60), `add_color_scale happy path`, `add_color_scale with defaults`, `add_cell_value_rule greaterThan`, `add_cell_value_rule lessThan`, `add_cell_value_rule equal`, `add_cell_value_rule between with value2`, `add_color_scale custom range`, `add_cell_value_rule with fillColor happy path`, `add_cell_value_rule with unknown sheet (error)`. The conditional-format tools themselves work correctly; only the isolated `no workbook` negative test is mis-wired.
- `src/` was not modified (per HARD CONSTRAINTS). The existing working-tree modifications to `src/` and the test files were already present before this run and were not touched.
