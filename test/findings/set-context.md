# Test Findings: set-context

- **Test file:** `test/integration/set-context.test.ts`
- **Run command:** `npx tsx test/integration/set-context.run.ts` (from project root)
- **Run file:** `test/integration/set-context.run.ts` (created per instructions, then deleted)

## Result: FAIL

### First failing test
The suite **aborts before any test runs** with a top-level `ReferenceError`. No individual
test name is reached; baretest never begins executing.

### Error

```
C:\Users\Janne\scripts\js-excel-mcp\test\integration\set-context.test.ts:13
test('setup', async () => {
^

ReferenceError: test is not defined
    at <anonymous> (...\test\integration\set-context.test.ts:13:1)
    at ModuleJob.run (node:internal/modules/esm/module_job:430:25)
```

### Suspected cause

`test/integration/set-context.test.ts` calls `test('setup', ...)` at module top level and
exports `default async function () { await test.run(); }`. It relies on a **global `test`**
symbol, but `baretest` does **not** assign a global when instantiated.

Every other working integration test (see `test/run-integration.ts`) instead exports a
**function that receives the baretest instance as an argument** — e.g.
`workbookFlow(test)` — and `run-integration.ts` wires the shared `test = baretest(...)` into
each module. `set-context.test.ts` is inconsistent with that convention: it neither receives
`test` as a parameter nor is it registered with a baretest instance.

Additionally, `set-context.test.ts` is **not imported by `test/run-integration.ts`** — it is
orphaned, so even when the suite is run the "global `test`" is never established for it.

This is a defect in the **test file itself** (`test/`, not `src/`), so per the HARD
CONSTRAINTS (`NEVER modify src/`) no source fix applies. The failure is environmental to the
test harness, not a `src/` bug.

### Notes

- `baretest` (`node_modules/baretest/baretest.js`) was inspected: it contains no `global` /
  `globalThis.test` assignment, confirming it does not expose a global `test`.
- The run file used the same pattern as the existing `*.run.ts` files
  (`number-format.run.ts`, `chart.run.ts`, etc.): `import runTests from './set-context.test.js'; await runTests();`.
- `test/`, `tsconfig.json`, and `package.json` scripts (`test:integration`) were checked for
  any global `test` injection — none exists.
- Because execution fails at module load (a `ReferenceError` thrown outside any `test`),
  baretest's "abort on first failing test" rule never triggers; the process exits during
  import. No count of passing tests (`✓ N`) can be reported.
