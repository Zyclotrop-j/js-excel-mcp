# Test Findings: number-format.test.ts

**Result: FAIL**

## How it was run
- Created `test/integration/number-format.run.ts` (`import runTests from './number-format.test.js'; await runTests();`)
- Executed `npx tsx test/integration/number-format.run.ts` from project root
- Deleted `number-format.run.ts` afterward (per instructions)

## First failing test
baretest aborts on the first failure. The first failing test is:

**`set_cell_currency applies currency format and echoes input`** (line 49)

```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
undefined !== 'A1'
    at test/integration/number-format.test.ts:57:16
```

The assertion `assert.equal(result.structuredContent.ref, 'A1')` fails because `result.structuredContent` does
not contain a `ref` field.

## Error / observed behaviour
A throwaway debug script (run outside `src/`, not committed) showed the actual tool output:

```
structuredContent: { context: { currentFile, currentSheet, currentCell, now } }
content: [
  { type: 'text', text: 'context: ...' },
  { type: 'text', text: 'cell is empty' }   <-- error path taken
]
isError: true (implied by the 'cell is empty' branch)
```

`structuredContent` contains only the `context` block (added by `Context.contextualiseResponse`). The expected
`ref` and `format` fields are absent because the handler returned via the early-exit branch:

```ts
// src/tools/handleNumberFormat.ts:54
if (!cell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'cell is empty' }], isError: true });
```

i.e. `getCellByCoord(ws, 'A1')` returned `undefined` even though the cell A1 was previously written with a value
(`set_cell` wrote `1234.5` to A1 in the setup test, line 42).

## Suspected src cause
`src/tools/handleNumberFormat.ts` resolves the target cell with `getCellByCoord(ws, arg.ref)`
(`@office-kit/xlsx/worksheet`). For a cell that exists in the sheet but whose lookup returns falsy, the handler
bails out with `"cell is empty"` and never reaches the `structuredContent: { ref, format }` success return.

Likely one of:
- `getCellByCoord` returns `undefined` for cells populated via the `set_cell` write path (worksheet model /
  coordinate mismatch between the write handler and the number-format handler), or
- the currency/percent/date/number-format handlers all share the same `getCellByCoord` lookup, so every format
  test hits this same `undefined` cell and fails on the `structuredContent.ref` assertion.

This is a **src bug** — the test harness (mock server, test context, `set_cell`) writes the value correctly; the
number-format handler simply cannot locate the written cell. `src/` was NOT modified, per the hard constraint.

## Notes
- The `User is undefined` line printed during setup is incidental noise (the handler falls back to the `'public'`
  context because `this.context.authInfo` is unset in the test harness). It is not the cause of the failure.
- All subsequent number-format tests (`set_cell_currency` defaults, `set_cell_percent` x2, `set_cell_date_format`
  x4, `set_cell_number_format` x2, and the invalid-format rejection test) depend on the same cell-lookup path and
  would fail with the same `result.structuredContent.ref === undefined` assertion; not individually verified
  because baretest stops at the first failure.
- The `set_cell_currency errors when no workbook is open` test (line 181) uses a separate context with no workbook
  and only asserts on `result.content` text, so it would likely not hit the cell-lookup path — but it was not
  reached due to the early abort.

## Recommendation (for src owner)
Investigate why `getCellByCoord` returns `undefined` for a cell written via the `CellWriteHandler` in the same
worksheet, or guard the lookup so it does not report `"cell is empty"` for cells that contain a value. Do not
make the assumption that the cell-write path and the number-format read path use a compatible coordinate scheme.
