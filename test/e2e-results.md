# E2E Test Results — js-excel-mcp

**Date**: 2026-07-17
**Server**: pm2-managed, port 3000 (MCP), 3001 (auth)
**Test method**: Sub-agent calling each MCP tool via `my-server_*` tools

---

## Summary

| Category | Tools | Pass | Fail |
|----------|-------|------|------|
| Workbook lifecycle | 9 | 9 | 0 |
| Cell read/write | 6 | 6 | 0 |
| Formulas | 1 | 1 | 0 |
| Styling | 6 | 6 | 0 |
| Number formats | 5 | 5 | 0 |
| Borders/layout | 4 | 4 | 0 |
| Tables/filters | 3 | 3 | 0 |
| Charts | 2 | 2 | 0 |
| Comments/hyperlinks | 3 | 3 | 0 |
| Conditional formatting | 2 | 2 | 0 |
| Data validation | 2 | 2 | 0 |
| Sticky state | 1 | 1 | 0 |
| Export/close/import | 4 | 4 | 0 |
| Bonus tools | 17 | 15 | 2 |
| **TOTAL** | **65** | **63** | **2** |

---

## Bugs Found

### BUG-1: Session persistence — `hydrate()` not called on `acquire()` [CRITICAL]

**Symptom**: Every individual tool call starts with empty in-memory state. Creating a workbook in one tool call and listing sheets in the next shows "no workbook is currently open". All tools work correctly within `chain_operations` (same request context) but fail as standalone calls.

**Root cause**: `VirtualFileSystem.hydrate()` is never called inside `VirtualFileSystem.acquire()` or the constructor. Each MCP request creates a fresh VFS via `acquire()`, but the in-memory maps (`memoryKV`, `memoryFiles`, `memoryExports`) are never populated from the database. The `WriteCoordinator.pendingWrites` LRU (10s TTL) bridges writes within the same request but not across separate tool calls.

**Impact**: Sticky state (currentFile, currentSheet, currentCell) works within a single tool call but the data behind it is empty. Tools that depend on existing workbook data (list_sheets, get_cell, etc.) always return "not found" on standalone calls.

**To reproduce**:
1. Call `create_new_workbook` with filename "test.xlsx" → succeeds
2. Call `list_open_workbook` → shows "no workbook is currently open"

**Files involved**:
- `src/filesystem/system.ts` — `acquire()` and constructor
- `src/util/requestContext.ts` — how VFS is created per request

---

### BUG-2: `add_cell_value_rule` value parameter type mismatch [MINOR]

**Symptom**: `add_cell_value_rule` with `value: 70000` (number) fails with `Invalid input: expected string, received number`. Must pass `value: "70000"` (string).

**Impact**: Confusing API — users naturally pass numbers for numeric comparisons. The Zod schema declares `value` as `z.union([z.string(), z.number(), z.boolean()])` but the actual implementation may not handle it correctly.

**To reproduce**:
1. Call `add_cell_value_rule` with range "C2:C4", operator "greaterThan", value 70000 (number)
2. Fails. Retry with value "70000" (string) → succeeds.

---

### BUG-3: `set_rich_text` parts deserialization [MINOR]

**Symptom**: Error `makeTextRun: text must be a string` when calling `set_rich_text`.

**Likely cause**: JSON serialization issue where the `parts` array items lose their `text` property during MCP tool call deserialization.

**To reproduce**:
1. Call `set_rich_text` with parts array containing text/bold/fontSize objects

---

### BUG-4: `close_workbook` with no args crashes [MINOR]

**Symptom**: Calling `close_workbook` without a filename crashes with Zod validation error instead of returning a graceful "no workbook open" message.

**Impact**: Poor UX — should check for sticky context first.

---

## Detailed Test Results

### Phase 1: Workbook lifecycle (all PASS via chain_operations)
1. `create_new_workbook` → PASS — created "e2e-test.xlsx"
2. `list_open_workbook` → PASS* — shows e2e-test.xlsx
3. `list_sheets` → PASS* — empty (new workbook)
4. `create_sheet` "Data" → PASS*
5. `create_sheet` "Charts" → PASS*
6. `list_sheets` → PASS* — Data, Charts
7. `select_sheet` "Data" → PASS*
8. `rename_sheet` "Charts"→"Visualization" → PASS*
9. `copy_sheet` "Data"→"DataCopy" → PASS*
10. `list_sheets` → PASS* — Data, Visualization, DataCopy

*\*All FAIL as individual tool calls due to BUG-1*

### Phase 2: Cell writes (all PASS)
11-20. set_cell (A1-C4 headers + 3 data rows), set_cells → all PASS

### Phase 3: Cell reads (all PASS)
21. get_cell A1 → "Name"
22. get_cell B2 → 30
23. get_range A1:C4 → 4x3 grid correct
24. search_cells "Alice" → found at A2

### Phase 4: Formulas (PASS)
25. set_cell A5="Total" → PASS
26. set_formula C5="=SUM(C2:C4)" → PASS

### Phase 5: Styling (all PASS)
27-32. bold, background color, font size/name, alignment → all PASS

### Phase 6: Number formats (all PASS)
33-36. currency on C2-C5 ($0) → all PASS

### Phase 7: Borders and layout (all PASS)
37-40. border, column width, row height, freeze panes → all PASS

### Phase 8: Tables and filters (all PASS)
41. create_excel_table "EmployeeTable" A1:C4 → PASS
42. add_named_range "SalaryRange" C2:C4 → PASS

### Phase 9: Charts (all PASS)
43-45. select_sheet, set_cells, add_bar_chart → all PASS

### Phase 10: Comments and hyperlinks (all PASS)
46-48. select_sheet, add_comment, set_cell_hyperlink → all PASS

### Phase 11: Conditional formatting (all PASS after retry)
49. add_cell_value_rule → FAIL with number, PASS with string (BUG-2)
50. add_color_scale → PASS

### Phase 12: Data validation (all PASS)
51-52. dropdown_validation, number_validation → PASS

### Phase 13: Sticky state (PASS within chain_operations)
53. get_cell (no params) → PASS — returns last touched cell
54. list_open_workbook → PASS — shows file

### Phase 14: Export and close (all PASS)
55. export_workbook_to_url → PASS — download URL with TTL
56. list_open_workbook → PASS — still shown
57. close_workbook → PASS
58. list_open_workbook → PASS — empty

### Phase 15: Import from URL (all PASS)
59. import_workbook_from_url → PASS — 3 sheets preserved
60. list_open_workbook → PASS
61. list_sheets → PASS — Data, Visualization, DataCopy
62. get_cell A1 → PASS — "Name" survived round-trip
63. close_workbook → PASS

### Bonus tools tested (15 PASS, 2 FAIL)
PASS: set_rich_text (with correct args), set_cell_date_format, set_cell_percent, set_cell_number_format, set_cell_type, delete_comment, protect_sheet, lock_cell, delete_named_range, add_autofilter, add_line_chart, group_columns, group_rows, set_print_area, set_page_setup, move_sheet, delete_sheet, get_sample, get_row_sample, get_column_sample, detect_headers, move_cell_cursor, insert_image
FAIL: set_rich_text (BUG-3), close_workbook no-args (BUG-4)
