# Test Plan for js-excel-mcp

## Overview

This document outlines the comprehensive test plan for the js-excel-mcp project, a TypeScript-based MCP server for Excel workbook manipulation. The plan covers unit tests, integration tests, E2E tests, and property-based tests.

## Test Architecture

### Test Types

| Test Type | Location | Purpose | Framework |
|-----------|----------|---------|-----------|
| Unit Tests | `test/filesystem/`, `test/meta/` | Test individual modules in isolation | baretest |
| Integration Tests | `test/integration/` | Test tool interactions and workflows | baretest |
| E2E Tests | `test/e2e/` | Full lifecycle testing with multiple tools | baretest |
| Property Tests | `test/property/` | Property-based testing with fast-check | fast-check |

### Test Runner

- **Main runner**: `test/run.ts` - runs unit tests
- **Integration runner**: `test/run-integration.ts`
- **E2E runner**: `test/run-e2e.ts`
- **Property runner**: `test/run-property.ts`

### Test Helpers

- `test/helpers/test-context.ts` - Creates isolated test contexts with temp SQLite DBs
- `test/helpers/test-server.ts` - Mock MCP server for tool testing
- `test/helpers/assertions.ts` - Custom assertions
- `test/helpers/cleanup.ts` - Cleanup utilities
- `test/helpers/test-fetch.ts` - Fetch utilities

---

## Test Coverage Matrix

### 1. Filesystem Layer (`src/filesystem/`)

| Module | Tests | Status | Notes |
|--------|-------|--------|-------|
| `context.ts` | `test/filesystem/context.test.ts` | ✅ Implemented | Context caching, file/sheet/cell state |
| `system.ts` | `test/filesystem/system.test.ts` | ✅ Implemented | Virtual filesystem operations |
| `IDatabaseBackend.ts` | `test/filesystem/IDatabaseBackend.test.ts` | ✅ Implemented | Interface contract tests for DatabaseBackend & MemoryBackend |
| `rateLimiting.ts` | `test/filesystem/rateLimiting.test.ts` | ✅ Implemented | Write-once-per-second-per-key rate limiting |

**Test Cases for Context:**
- [x] getContext returns same instance for same user
- [x] getContext returns different instances for different users
- [x] setCurrentFile/getCurrentFile round-trip
- [x] getCurrentFile returns null when not set
- [x] setCurrentSheet/getCurrentSheet round-trip
- [x] getCurrentSheet isolated per file
- [x] setCurrentCell/getCurrentCell round-trip
- [x] Contextual response formatting
- [x] Workbook CRUD operations
- [x] Export/import file operations

**Test Cases for System:**
- [x] Virtual filesystem CRUD
- [x] File listing
- [x] Database persistence

**Test Cases for IDatabaseBackend:**
- [x] Constructor creates database file and schema
- [x] KV insert/select round-trip
- [x] File insert/select round-trip
- [x] Export insert/select round-trip
- [x] deleteAll operations (KV, Files, Exports)
- [x] insertOrReplace operations (KV, Files)
- [x] TTL selection (File, KV)
- [x] Value selection (KV)
- [x] Transaction commit/rollback
- [x] Close idempotency

**Test Cases for Rate Limiting:**
- [x] Same key written multiple times within 1s writes latest value
- [x] Same key written >1s apart writes each time
- [x] Different keys written in parallel all write to DB
- [x] Files follow same rate limiting as KV
- [x] Exports follow same rate limiting
- [x] Parallel requests with same user respect rate limit
- [x] Parallel requests with different users don't interfere
- [x] Mixed operations on same and different keys
- [x] Rate limit resets after 1 second

---

### 2. Meta Layer (`src/meta/`)

| Module | Tests | Status | Notes |
|--------|-------|--------|-------|
| `mcpdescription.ts` | `test/meta/mcpdescription.test.ts` | ✅ Implemented | MCP tool descriptions |

---

### 3. Tool Handlers (`src/tools/`) — Integration Tests

Each tool handler has corresponding integration tests using MockMcpServer.

#### 3.1 Workbook Tools (`handleWorkbook.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `create_new_workbook` | `test/integration/workbook-flow.test.ts` | ✅ Implemented | Create workbook, verify sheets, custom filename |
| `import_workbook_from_url` | `test/integration/workbook-flow.test.ts` | ✅ Implemented | Tool registration verified |
| `close_workbook` | `test/integration/workbook-flow.test.ts` | ✅ Implemented | Close workbook, verify removal, missing file error |
| `list_open_workbook` | `test/integration/workbook-flow.test.ts` | ✅ Implemented | List multiple workbooks |
| `export_workbook_to_url` | `test/integration/workbook-flow.test.ts` | ✅ Implemented | Export with TTL, autoclose, no current file error |

#### 3.2 Sheet Tools (`handleSheet.ts`, `handleSheetOps.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `list_sheets` | `test/integration/sheet-ops-flow.test.ts` | ✅ Implemented | List sheets in workbook |
| `select_sheet` | `test/integration/sheet-ops-flow.test.ts` | ✅ Implemented | Switch active sheet, validate exists |
| `create_sheet` | `test/integration/sheet-ops-flow.test.ts` | ✅ Implemented | Create new sheet, handle duplicate names |
| `rename_sheet` | `test/integration/sheet-ops-flow.test.ts` | ✅ Implemented | Rename existing sheet, validate new name |
| `delete_sheet` | `test/integration/sheet-ops-flow.test.ts` | ✅ Implemented | Delete sheet, prevent deleting last sheet |
| `copy_sheet` | `test/integration/sheet-ops-flow.test.ts` | ✅ Implemented | Copy sheet within workbook |
| `move_sheet` | `test/integration/sheet-ops-flow.test.ts` | ✅ Implemented | Move sheet position |

#### 3.3 Cell Tools (`handleCells/`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `get_cell` | `test/integration/cell-ops-flow.test.ts` | ✅ Implemented | Read single cell, empty cell |
| `get_range` | `test/integration/cell-ops-flow.test.ts` | ✅ Implemented | Read rectangular range |
| `set_cell` | `test/integration/cell-ops-flow.test.ts` | ✅ Implemented | Write string, number, boolean, formula |
| `set_cells` | `test/integration/cell-ops-flow.test.ts` | ✅ Implemented | Write multiple cells at once |
| `set_formula` | `test/integration/cell-ops-flow.test.ts` | ✅ Implemented | Set formula explicitly |
| `set_cell_type` | `test/integration/cell-ops-flow.test.ts` | ✅ Implemented | Change cell type |
| `search_cells` | `test/integration/cell-ops-flow.test.ts` | ✅ Implemented | Exact match and regex match |
| `move_cell_cursor` | `test/integration/cell-ops-flow.test.ts` | ✅ Implemented | Navigate right/down, UNTIL_BLANK, UNTIL_ERROR |

#### 3.4 Style Tools (`handleStyle.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `set_cell_bold` | `test/integration/style-flow.test.ts` | ✅ Implemented | Toggle bold on/off |
| `set_cell_font` | `test/integration/style-flow.test.ts` | ✅ Implemented | Font family/size/color |
| `set_cell_background_color` | `test/integration/style-flow.test.ts` | ✅ Implemented | Background color |
| `set_cell_alignment` | `test/integration/style-flow.test.ts` | ✅ Implemented | Horizontal/vertical alignment, wrapText |
| `set_cell_border` | `test/integration/style-flow.test.ts` | ✅ Implemented | Border styles, sides, none |

#### 3.5 Chain Tools (`handleChain.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `chain_operations` | `test/integration/chain-flow.test.ts` | ✅ Implemented | Sequential writes, write+read in chain, stopOnError true/false |

#### 3.6 Data Validation Tools (`handleValidation.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `add_dropdown_validation` | `test/integration/data-validation-flow.test.ts` | ✅ Implemented | String array, comma-separated, prompt/error, single option |
| `add_number_validation` | `test/integration/data-validation-flow.test.ts` | ✅ Implemented | Decimal range, whole number, no min/max |

#### 3.7 Export/Import Tools (`handleWorkbook.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `export_workbook_to_url` | `test/integration/export-import-flow.test.ts` | ✅ Implemented | Valid URL, with data, autoclose, URL format, unique URLs, TTL |
| `import_workbook_from_url` | `test/integration/export-import-flow.test.ts` | ✅ Implemented | Tool registration verified |

#### 3.8 Authentication & Authorization

| Feature | Test File | Status | Test Cases |
|---------|-----------|--------|------------|
| User isolation | `test/integration/auth-flow.test.ts` | ✅ Implemented | User A workbook not visible to B, independent current files, close isolation, concurrent users |
| Token structure | `test/integration/auth-flow.test.ts` | ✅ Implemented | Required fields, independence |
| Context passing | `test/integration/auth-flow.test.ts` | ✅ Implemented | authInfo passed through to tool callbacks |

#### 3.9 Bug Regression Tests

| Bug | Test File | Status | Test Cases |
|-----|-----------|--------|------------|
| BUG-1: hydrate() on acquire() | `test/integration/bug1-hydrate.test.ts` | ✅ Implemented | acquire() calls hydrate(), cross-request context preserves state |
| BUG-2: add_cell_value_rule types | `test/integration/bug2-cell-value-rule.test.ts` | ✅ Implemented | Schema accepts numeric, string, boolean values |
| BUG-3: set_rich_text parts | `test/integration/bug3-rich-text.test.ts` | ✅ Implemented | Schema rejects invalid parts, accepts valid parts, happy path callbacks |
| BUG-4: close_workbook no-args | `test/integration/bug4-close-workbook.test.ts` | ✅ Implemented | Sticky context, schema validation, graceful errors |

---

### 4. E2E Lifecycle Tests

| Workflow | Test File | Status | Description |
|----------|-----------|--------|-------------|
| Workbook lifecycle | `test/e2e/workbook-lifecycle.test.ts` | ✅ Implemented | Create → write → list → export → close, autoclose, multiple workbooks, error cases |
| Sheet lifecycle | `test/e2e/sheet-lifecycle.test.ts` | ✅ Implemented | Create → add → select → rename → copy → move → delete, error cases |
| Cell lifecycle | `test/e2e/cell-lifecycle.test.ts` | ✅ Implemented | Write → read → range → formula → search → cursor → overwrite, empty cell |
| Style lifecycle | `test/e2e/style-lifecycle.test.ts` | ✅ Implemented | Bold → font → background → alignment → border → chain styles, current cell |
| Data roundtrip | `test/e2e/data-roundtrip.test.ts` | ✅ Implemented | Write → read, multi-sheet, export → import roundtrip, overwrite, batch |
| Chain scenarios | `test/e2e/chain-scenarios.test.ts` | ✅ Implemented | Sequential cells, multi-sheet chains, style chains, copy sheet, cursor moves, rename, delete, rapid set+search+read |

---

### 5. Property-Based Tests

| Property | Test File | Status | Description |
|----------|-----------|--------|-------------|
| Cell round-trips | `test/property/cell-properties.test.ts` | ✅ Implemented | String/int/float/bool round-trips, independence, overwrite, empty string |
| Range operations | `test/property/range-properties.test.ts` | ✅ Implemented | set_cells/get_range round-trips, row/column/2D grid |
| Sheet operations | `test/property/sheet-properties.test.ts` | ✅ Implemented | Create/list/rename/delete/select, N sheets |
| Style properties | `test/property/style-properties.test.ts` | ✅ Implemented | Bold/font/bg/alignment/border round-trips, value preservation |
| VFS operations | `test/property/vfs-properties.test.ts` | ✅ Implemented | Create/list/close workbooks, current file, reuse name |
| Encoding round-trips | `test/property/encoding-properties.test.ts` | ✅ Implemented | Unicode, whitespace, special chars, emoji, long strings |
| Cursor properties | `test/property/cursor-properties.test.ts` | ✅ Implemented | Move right/left/down/up, return to start, multi-move, cursor reflects position |

---

### 6. Tests Not Yet Implemented

The following tool categories lack dedicated integration tests (some are covered in E2E):

| Tool Category | Test File | Status | Notes |
|---------------|-----------|--------|-------|
| Layout (`merge_cells`, `freeze_panes`, `set_column_width`, `set_row_height`) | `test/integration/layout.test.ts` | 🔴 Not Started | Tested in E2E style-lifecycle |
| Charts (`add_bar_chart`, `add_line_chart`) | `test/integration/chart.test.ts` | 🔴 Not Started | Tested in E2E chain-scenarios |
| Tables (`create_excel_table`, `add_autofilter`) | `test/integration/table.test.ts` | 🔴 Not Started | Tested in e2e-results.md |
| Protection (`protect_sheet`, `lock_cell`) | `test/integration/protection.test.ts` | 🔴 Not Started | Tested in e2e-results.md |
| Conditional Formatting (`add_cell_value_rule`, `add_color_scale`) | `test/integration/conditional-format.test.ts` | 🔴 Not Started | Partially covered in bug2 tests |
| Comments (`add_comment`, `delete_comment`) | `test/integration/comment.test.ts` | 🔴 Not Started | Tested in e2e-results.md |
| Hyperlinks (`set_cell_hyperlink`) | `test/integration/hyperlink.test.ts` | 🔴 Not Started | Tested in e2e-results.md |
| Images (`insert_image`) | `test/integration/image.test.ts` | 🔴 Not Started | Tested in e2e-results.md |
| Named Ranges (`add_named_range`, `delete_named_range`) | `test/integration/named-range.test.ts` | 🔴 Not Started | Tested in e2e-results.md |
| Outline (`group_rows`, `group_columns`) | `test/integration/outline.test.ts` | 🔴 Not Started | Tested in e2e-results.md |
| Print (`set_print_area`, `set_page_setup`) | `test/integration/print.test.ts` | 🔴 Not Started | Tested in e2e-results.md |
| Number Formats (`set_cell_currency`, `set_cell_percent`, `set_cell_date_format`, `set_cell_number_format`) | `test/integration/number-format.test.ts` | 🔴 Not Started | Tested in E2E & e2e-results.md |
| Rich Text (`set_rich_text`) | `test/integration/rich-text.test.ts` | 🔴 Not Started | Covered in bug3 tests |
| Set Context (`set_context`) | `test/integration/set-context.test.ts` | 🔴 Not Started | |

---

## Test Commands

```bash
# Run all unit tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run property-based tests
npm run test:property

# Run with coverage
npm run coverage

# Run mutation tests
npm run test:mutation
```

---

## Coverage Targets

| Metric | Target |
|--------|--------|
| Line Coverage | ≥ 80% |
| Branch Coverage | ≥ 70% |
| Function Coverage | ≥ 80% |
| Mutation Score | ≥ 60% |

---

## Test Data Management

### Fixtures
- Location: `test/fixtures/`
- Sample workbooks for import testing
- Expected output files for comparison

### Snapshots
- Location: `test/snapshots/__snapshots__/`
- TOON encoding output snapshots
- Resource response snapshots

### Cleanup
- Each test creates isolated context with unique user ID
- `test/helpers/cleanup.ts` provides cleanup utilities
- Temp databases auto-cleaned on test completion

---

## Progress Tracking

### Completed ✅
- [x] Unit tests for filesystem/context.ts
- [x] Unit tests for filesystem/system.ts
- [x] Unit tests for filesystem/IDatabaseBackend.ts (both backends)
- [x] Unit tests for filesystem/rateLimiting.ts
- [x] Unit tests for meta/mcpdescription.ts
- [x] Test runner infrastructure (baretest) — all 4 runners
- [x] Test helpers (context, server mock, assertions)
- [x] Integration tests: workbook flow (9 tests)
- [x] Integration tests: sheet ops flow (13 tests)
- [x] Integration tests: cell ops flow (14 tests)
- [x] Integration tests: style flow (11 tests)
- [x] Integration tests: chain flow (4 tests)
- [x] Integration tests: data validation flow (7 tests)
- [x] Integration tests: export-import flow (10 tests)
- [x] Integration tests: auth flow (10 tests)
- [x] Integration tests: bug regressions (22 tests across 4 bugs)
- [x] E2E tests: workbook lifecycle (4 tests)
- [x] E2E tests: sheet lifecycle (3 tests)
- [x] E2E tests: cell lifecycle (7 tests)
- [x] E2E tests: style lifecycle (7 tests)
- [x] E2E tests: data roundtrip (6 tests)
- [x] E2E tests: chain scenarios (7 tests)
- [x] Property tests: cell, range, sheet, style, vfs, encoding, cursor (62 tests)

### Not Yet Implemented 🔴
- [ ] Layout integration tests
- [ ] Chart integration tests
- [ ] Table integration tests
- [ ] Protection integration tests
- [ ] Conditional format integration tests (beyond bug2)
- [ ] Comment integration tests
- [ ] Hyperlink integration tests
- [ ] Image integration tests
- [ ] Named range integration tests
- [ ] Outline integration tests
- [ ] Print integration tests
- [ ] Number format integration tests
- [ ] Rich text integration tests (beyond bug3)
- [ ] Set context integration tests

---

## Notes

1. **Test Isolation**: Each test gets a unique user ID and temp database
2. **Async Testing**: All tests are async; use `await` properly
3. **Mock Server**: Use `MockMcpServer` from `test/helpers/test-server.ts` for tool testing
4. **Context**: Use `createTestContext()` from `test/helpers/test-context.ts` for isolated contexts
5. **Assertions**: Use custom assertions from `test/helpers/assertions.ts` for MCP-specific checks
6. **Bug Regression**: Bug-specific tests exist for 4 bugs found during E2E testing

---

*Last Updated: 2026-07-18*
*Version: 2.0*
