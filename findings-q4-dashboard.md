# Findings — Q4_Sales_Dashboard.xlsx repair log

Source: `mcp_tool_calls.md` (self-reported LLM tool calls) and the actual
generated `C:\Users\Janne\Downloads\Q4_Sales_Dashboard.xlsx`.

Excel's recovery log reported two discarded parts:

```
Removed Feature: Table from /xl/tables/table1.xml part (Table)
Removed Records: Conditional formatting from /xl/worksheets/sheet3.xml part
```

The user also reported a separate "circular references" warning dialog on open.

## Root-cause analysis

I extracted the .xlsx and inspected the raw parts. Three server bugs and one
data bug were found.

### Finding 1 — `add_cell_value_rule` rules are dropped on round-trip (HIGH)

**Symptom:** sheet3.xml ends up with empty `cellIs` cfRules:

```xml
<conditionalFormatting sqref="H4:H10"><cfRule type="cellIs" priority="3"/></conditionalFormatting>
<conditionalFormatting sqref="G4:G10"><cfRule type="cellIs" priority="4"/></conditionalFormatting>
```

Excel sees a `cellIs` rule with no `operator` and no `<formula>` child, which
is schema-invalid, so it removes the conditional formatting.

**Root cause.** `src/tools/handleConditionalFormat.ts` builds the rule like
this:

```ts
const innerXml = `<cellIs operator="${arg.operator}"><formula>${valueStr}</formula></cellIs>`;
const rule = makeCfRule({ type: 'cellIs', priority: ..., formulas: [], innerXml });
```

`Context.setWorkbook` serialises the workbook to bytes on every tool call, and
`Context.getWorkbook` parses those bytes back on the next call
(`src/filesystem/context.ts:41-47`). So the cfRule goes:

1. Tool writes `<cfRule type="cellIs" priority="N"><cellIs operator="..."><formula>...</formula></cellIs></cfRule>` (via `innerXml`).
2. Next tool call parses it. `parseCfRule` (in `@office-kit/xlsx`) only
   preserves `innerXml` for `VISUAL_RULE_TYPES` (colorScale, dataBar,
   iconSet). For `cellIs`, it reads `operator` off the `<cfRule>` element and
   `<formula>` children of `<cfRule>` directly. The handler's nested
   `<cellIs>` wrapper is not recognised, so `operator` and `formulas` are
   lost.
3. Next save serialises an empty `<cfRule type="cellIs" priority="N"/>`.

**Fix.** Set `operator` and `formulas` directly on the rule instead of
nesting them inside `innerXml`. The serialiser already emits them as
`<cfRule>` attributes / `<formula>` children, which the parser round-trips
correctly.

### Finding 2 — `add_cell_value_rule` ignores `fillColor` (MEDIUM)

**Symptom:** the LLM passed `fillColor: "FFFF6B6B"` / `"FF2ECC71"` to two
`add_cell_value_rule` calls. Even after the round-trip bug above is fixed,
the highlight would never appear — no `<dxf>` is ever registered and no
`dxfId` is ever set on the rule.

**Root cause.** `src/tools/handleConditionalFormat.ts` accepts `fillColor` in
its Zod schema but never uses it. The differential-format (dxf) pool exists
in `@office-kit/xlsx` (`addDxf`, `makeDifferentialStyle`, `makePatternFill`)
but is not wired up.

**Fix.** When `fillColor` is provided, build a `makeDifferentialStyle({ fill:
makePatternFill({ patternType: 'solid', fgColor: fillColor }) })`, call
`addDxf(wb.styles, dxf)` to get a `dxfId`, and pass it to `makeCfRule`.

### Finding 3 — `create_excel_table` + `add_autofilter` on the same range makes Excel drop the table (HIGH)

**Symptom:** `xl/tables/table1.xml` (RegionalSummary, `ref="A3:F9"`) is
removed during repair. `table2.xml` (ProductBreakdown, `ref="A3:H10"`,
no autofilter) survives.

**Root cause.** `mcp_tool_calls.md` calls `add_autofilter { range: "A3:F9" }`
on the Regional Performance sheet *and then* `create_excel_table { range:
"A3:F9" }` on the same range. The generated `sheet2.xml` has both:

```xml
<autoFilter ref="A3:F9"/>
...
<tableParts count="1"><tablePart r:id="rId2"/></tableParts>
```

Excel tables own their filter (the `<autoFilter>` child of `<table>`). A
worksheet-level `<autoFilter>` covering the exact same range as a table is
treated as a conflicting definition and Excel discards the table part.

**Fix.** In `create_excel_table`, when the sheet's `autoFilter` covers the
exact range being promoted to a table, clear the redundant sheet-level
autoFilter and report it in the response. (Tables come with their own filter
dropdowns, so this is what the caller almost certainly wanted.)

### Finding 4 — Circular-reference formulas in the LLM's tool-call data (NOT a server bug)

**Symptom:** Excel pops a "circular references" dialog on open.

**Root cause.** `mcp_tool_calls.md` §8 writes the MoM-growth column with
self-referential formulas:

```
set_formula { ref: "E14", formula: "=E14/D14-1" }
set_formula { ref: "E15", formula: "=E15/D15-1" }
... (E16..E19 same pattern)
```

The data layout (row 13 header) is:

| A | B | C | D | E |
| Region | October | November | December | MoM Growth |

So `E14` (MoM Growth) is computed as `E14 / D14 - 1` — it references itself.
The intended formula was almost certainly `=D14/C14-1` (December-over-
November) or `=C14/B14-1` (November-over-October).

This is a data error in the LLM's tool-call markdown, not a defect in the
MCP server. The server has no way to know the caller's intent.

**Decision (escalated to user):** add server-side self-reference detection
to `set_formula` that surfaces a non-fatal warning in the tool response. The
write still goes through — Excel allows self-references and shows them in
the circular-reference dialog; the warning gives the LLM a chance to notice
and self-correct on the next call.

**Fix.** Added `src/util/detectSelfReference.ts` — a conservative detector
that scans the formula string for bare A1 cell refs and ranges, skips
function-call tokens (e.g. `LOG10(`), skips sheet-qualified refs (it doesn't
know the current sheet so it can't safely flag them), and returns a list
of warning strings. `set_formula` now resolves the target ref, calls the
detector before writing, and includes a `warnings` array on the structured
response (and a `(warning: ...)` note in the text content) when matches
are found.

## Status

| # | Finding | Status |
|---|---------|--------|
| 1 | `add_cell_value_rule` round-trip loss | **addressed** — `src/tools/handleConditionalFormat.ts` now sets `operator` + `formulas` on the rule instead of nesting them in `innerXml`. Regression test `BUG-5A` in `test/integration/bug5-cf-table-repair.test.ts`. |
| 2 | `add_cell_value_rule` ignores `fillColor` | **addressed** — handler now builds a `makeDifferentialStyle({ fill: makePatternFill({ patternType: 'solid', fgColor }) })`, registers it via `addDxf(wb.styles, dxf)`, and attaches the returned `dxfId` to the rule. Regression test `BUG-5B`. |
| 3 | Table dropped due to overlapping sheet autoFilter | **addressed** — `src/tools/handleTable.ts` `create_excel_table` now clears a sheet-level `autoFilter` whose `ref` exactly matches the table's range, and reports `clearedAutoFilter: true` in the structured response. Regression tests `BUG-5C` (overlap cleared) and the non-overlap variant (left alone). |
| 4 | Circular-reference formulas in tool-call data | **addressed** — `set_formula` now runs `detectSelfReference` (`src/util/detectSelfReference.ts`) and surfaces a non-fatal `warnings` array on the structured response. 12 unit tests in `test/util/detect-self-reference.test.ts`; 2 integration tests `BUG-5D` (warning surfaced for self-ref; no warning for clean formula). |

## Verification

- `npx tsc --noEmit` — clean.
- `npx tsx test/run.ts` — 90 unit tests pass (78 + 12 detector tests).
- `npx tsx test/run-integration.ts` — 239 integration tests pass
  (237 + 2 new `BUG-5D` tests; 5 `BUG-5*` total).
- `npx tsx test/run-e2e.ts` — 47 e2e tests pass.
- The 7 `BUG-5*` tests were verified to fail when their respective source
  fix is reverted (`git stash` of `src/tools/handle{ConditionalFormat,Table,Cells/write}.ts`
  → tests fail with the expected assertions).

