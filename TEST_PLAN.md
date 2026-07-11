# Test Plan for js-excel-mcp

## Overview

This document outlines the comprehensive test plan for the js-excel-mcp project, a TypeScript-based MCP server for Excel workbook manipulation. The plan covers unit tests, integration tests, E2E tests, and property-based tests.

## Test Architecture

### Test Types

| Test Type | Location | Purpose | Framework |
|-----------|----------|---------|-----------|
| Unit Tests | `test/filesystem/`, `test/meta/` | Test individual modules in isolation | baretest |
| Integration Tests | `test/integration/` | Test tool interactions and workflows | baretest |
| E2E Tests | `test/e2e/` | Full MCP protocol testing with real server | baretest |
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

---

### 2. Meta Layer (`src/meta/`)

| Module | Tests | Status | Notes |
|--------|-------|--------|-------|
| `mcpdescription.ts` | `test/meta/mcpdescription.test.ts` | ✅ Implemented | MCP tool descriptions |

---

### 3. Tool Handlers (`src/tools/`)

Each tool handler should have corresponding integration tests. The tools are organized into categories:

#### 3.1 Workbook Tools (`handleWorkbook.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `create_new_workbook` | `test/integration/workbook.test.ts` | 🔴 Planned | Create workbook, verify sheets, context update |
| `import_workbook_from_url` | `test/integration/workbook.test.ts` | 🔴 Planned | Import from URL, verify content |
| `close_workbook` | `test/integration/workbook.test.ts` | 🔴 Planned | Close workbook, verify removal |
| `list_open_workbook` | `test/integration/workbook.test.ts` | 🔴 Planned | List multiple workbooks |
| `export_workbook_to_url` | `test/integration/workbook.test.ts` | 🔴 Planned | Export with TTL, autoclose option |

#### 3.2 Sheet Tools (`handleSheet.ts`, `handleSheetOps.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `list_sheets` | `test/integration/sheet.test.ts` | 🔴 Planned | List sheets in workbook |
| `select_sheet` | `test/integration/sheet.test.ts` | 🔴 Planned | Switch active sheet |
| `create_sheet` | `test/integration/sheet.test.ts` | 🔴 Planned | Create new sheet |
| `rename_sheet` | `test/integration/sheet.test.ts` | 🔴 Planned | Rename existing sheet |
| `delete_sheet` | `test/integration/sheet.test.ts` | 🔴 Planned | Delete sheet |
| `copy_sheet` | `test/integration/sheet.test.ts` | 🔴 Planned | Copy sheet within workbook |
| `move_sheet` | `test/integration/sheet.test.ts` | 🔴 Planned | Move sheet position |

#### 3.3 Cell Tools (`handleCell.ts`, `handleCells/`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `get_cell` | `test/integration/cell.test.ts` | 🔴 Planned | Read single cell value |
| `get_range` | `test/integration/cell.test.ts` | 🔴 Planned | Read cell range |
| `set_cell` | `test/integration/cell.test.ts` | 🔴 Planned | Write single cell |
| `set_cells` | `test/integration/cell.test.ts` | 🔴 Planned | Write multiple cells |
| `set_formula` | `test/integration/cell.test.ts` | 🔴 Planned | Set formula |
| `set_cell_type` | `test/integration/cell.test.ts` | 🔴 Planned | Set cell type |
| `search_cells` | `test/integration/cell.test.ts` | 🔴 Planned | Search by value/regex |
| `move_cell_cursor` | `test/integration/cell.test.ts` | 🔴 Planned | Cursor navigation |

**Cursor Navigation Tests (`handleCells/cursor.ts`):**
- [ ] Move up/down/left/right
- [ ] Stop conditions: UNTIL_BLANK, UNTIL_ERROR
- [ ] Value comparison stops
- [ ] Regex matching stops
- [ ] Date comparison stops

**Discovery Tests (`handleCells/discovery.ts`):**
- [ ] Find used range
- [ ] Detect headers
- [ ] Get row/column samples

**Read Tests (`handleCells/read.ts`):**
- [ ] Read single cell
- [ ] Read range with TOON encoding
- [ ] Read with header detection

**Write Tests (`handleCells/write.ts`):**
- [ ] Write single cell
- [ ] Write range
- [ ] Write with formatting

#### 3.4 Style Tools (`handleStyle.ts`, `handleNumberFormat.ts`, `handleRichText.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `set_cell_bold` | `test/integration/style.test.ts` | 🔴 Planned | Bold formatting |
| `set_cell_font` | `test/integration/style.test.ts` | 🔴 Planned | Font family/size/color |
| `set_cell_background_color` | `test/integration/style.test.ts` | 🔴 Planned | Background color |
| `set_cell_alignment` | `test/integration/style.test.ts` | 🔴 Planned | Horizontal/vertical alignment |
| `set_cell_border` | `test/integration/style.test.ts` | 🔴 Planned | Border styles |
| `set_cell_currency` | `test/integration/style.test.ts` | 🔴 Planned | Currency format |
| `set_cell_percent` | `test/integration/style.test.ts` | 🔴 Planned | Percentage format |
| `set_cell_date_format` | `test/integration/style.test.ts` | 🔴 Planned | Date format |
| `set_cell_number_format` | `test/integration/style.test.ts` | 🔴 Planned | Custom number format |
| `set_rich_text` | `test/integration/style.test.ts` | 🔴 Planned | Mixed formatting in cell |

#### 3.5 Layout Tools (`handleLayout.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `merge_cells` | `test/integration/layout.test.ts` | 🔴 Planned | Merge/unmerge cells |
| `freeze_panes` | `test/integration/layout.test.ts` | 🔴 Planned | Freeze rows/columns |
| `set_column_width` | `test/integration/layout.test.ts` | 🔴 Planned | Set column width |
| `set_row_height` | `test/integration/layout.test.ts` | 🔴 Planned | Set row height |

#### 3.6 Chart Tools (`handleChart.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `create_chart` | `test/integration/chart.test.ts` | 🔴 Planned | Create various chart types |
| `update_chart` | `test/integration/chart.test.ts` | 🔴 Planned | Update chart data/options |
| `delete_chart` | `test/integration/chart.test.ts` | 🔴 Planned | Remove chart |

#### 3.7 Table Tools (`handleTable.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `create_table` | `test/integration/table.test.ts` | 🔴 Planned | Create Excel table |
| `update_table` | `test/integration/table.test.ts` | 🔴 Planned | Modify table |
| `delete_table` | `test/integration/table.test.ts` | 🔴 Planned | Remove table |

#### 3.8 Validation Tools (`handleValidation.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `set_validation` | `test/integration/validation.test.ts` | 🔴 Planned | Data validation rules |
| `clear_validation` | `test/integration/validation.test.ts` | 🔴 Planned | Remove validation |

#### 3.9 Protection Tools (`handleProtection.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `protect_sheet` | `test/integration/protection.test.ts` | 🔴 Planned | Sheet protection |
| `unprotect_sheet` | `test/integration/protection.test.ts` | 🔴 Planned | Remove protection |
| `protect_workbook` | `test/integration/protection.test.ts` | 🔴 Planned | Workbook protection |

#### 3.10 Conditional Format Tools (`handleConditionalFormat.ts`)

| Tool | Test File | Status | Test Cases |
|------|-----------|--------|------------|
| `add_conditional_format` | `test/integration/conditional-format.test.ts` | 🔴 Planned | Add rules |
| `remove_conditional_format` | `test/integration/conditional-format.test.ts` | 🔴 Planned | Remove rules |

#### 3.11 Other Tools

| Tool Category | Test File | Status |
|---------------|-----------|--------|
| `handleComment.ts` | `test/integration/comment.test.ts` | 🔴 Planned |
| `handleHyperlink.ts` | `test/integration/hyperlink.test.ts` | 🔴 Planned |
| `handleImage.ts` | `test/integration/image.test.ts` | 🔴 Planned |
| `handleNamedRange.ts` | `test/integration/named-range.test.ts` | 🔴 Planned |
| `handleOutline.ts` | `test/integration/outline.test.ts` | 🔴 Planned |
| `handlePrint.ts` | `test/integration/print.test.ts` | 🔴 Planned |
| `handleChain.ts` | `test/integration/chain.test.ts` | 🔴 Planned |
| `handleSetContext.ts` | `test/integration/set-context.test.ts` | 🔴 Planned |

---

### 4. Authentication & Authorization (`src/shared/auth*.ts`)

| Feature | Test File | Status | Test Cases |
|---------|-----------|--------|------------|
| OAuth 2.1 flow | `test/integration/auth.test.ts` | 🔴 Planned | Authorization code flow with PKCE |
| Token validation | `test/integration/auth.test.ts` | 🔴 Planned | Valid/invalid/expired tokens |
| Scope enforcement | `test/integration/auth.test.ts` | 🔴 Planned | Tool access by scope |
| User isolation | `test/integration/auth.test.ts` | 🔴 Planned | Per-user data isolation |

---

### 5. MCP Protocol Compliance

| Feature | Test File | Status | Test Cases |
|---------|-----------|--------|------------|
| Tool discovery | `test/e2e/protocol.test.ts` | 🔴 Planned | List tools, schemas |
| Resource discovery | `test/e2e/protocol.test.ts` | 🔴 Planned | List workbook resources |
| Resource reading | `test/e2e/protocol.test.ts` | 🔴 Planned | Read workbook:// URIs |
| Error handling | `test/e2e/protocol.test.ts` | 🔴 Planned | Proper MCP error codes |
| Notifications | `test/e2e/protocol.test.ts` | 🔴 Planned | Progress, logging |

---

### 6. E2E Workflows

| Workflow | Test File | Status | Description |
|----------|-----------|--------|-------------|
| Create → Write → Format → Export | `test/e2e/workflows.test.ts` | 🔴 Planned | Full workbook lifecycle |
| Import → Modify → Export | `test/e2e/workflows.test.ts` | 🔴 Planned | Edit existing workbook |
| Multi-sheet operations | `test/e2e/workflows.test.ts` | 🔴 Planned | Cross-sheet references |
| Chain operations | `test/e2e/workflows.test.ts` | 🔴 Planned | Batch tool calls |
| Header detection + sampling | `test/e2e/workflows.test.ts` | 🔴 Planned | Smart data analysis |

---

### 7. Property-Based Tests

| Property | Test File | Status | Description |
|----------|-----------|--------|-------------|
| Round-trip serialization | `test/property/roundtrip.test.ts` | 🔴 Planned | Write → Read = original |
| Cursor invariants | `test/property/cursor.test.ts` | 🔴 Planned | Cursor stays in bounds |
| Context isolation | `test/property/isolation.test.ts` | 🔴 Planned | Users don't see each other's data |
| Idempotent operations | `test/property/idempotent.test.ts` | 🔴 Planned | Repeated calls = same result |

---

## Test Implementation Priority

### Phase 1: Core Infrastructure (Week 1)
- [ ] Set up integration test runner (`test/run-integration.ts`)
- [ ] Create test fixtures and helpers for tool testing
- [ ] Implement workbook tool integration tests
- [ ] Implement sheet tool integration tests

### Phase 2: Cell & Data Operations (Week 2)
- [ ] Cell read/write tests
- [ ] Cursor navigation tests
- [ ] Search/filter tests
- [ ] Formula evaluation tests

### Phase 3: Formatting & Layout (Week 3)
- [ ] Style tool tests
- [ ] Number format tests
- [ ] Layout tool tests
- [ ] Rich text tests

### Phase 4: Advanced Features (Week 4)
- [ ] Chart tests
- [ ] Table tests
- [ ] Validation tests
- [ ] Protection tests
- [ ] Conditional format tests

### Phase 5: E2E & Protocol (Week 5)
- [ ] E2E test runner setup
- [ ] MCP protocol compliance tests
- [ ] Full workflow tests
- [ ] Auth integration tests

### Phase 6: Property-Based & Mutation (Week 6)
- [ ] Property-based test suite
- [ ] Mutation testing configuration
- [ ] Coverage targets

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

## CI/CD Integration

### GitHub Actions (Planned)
```yaml
# .github/workflows/test.yml
- Unit tests on every push
- Integration tests on PR
- E2E tests on main branch
- Property tests nightly
- Mutation tests weekly
```

---

## Progress Tracking

### Completed ✅
- [x] Unit tests for filesystem/context.ts
- [x] Unit tests for filesystem/system.ts
- [x] Unit tests for meta/mcpdescription.ts
- [x] Test runner infrastructure (baretest)
- [x] Test helpers (context, server mock, assertions)

### In Progress 🔄
- [ ] Integration test runner setup
- [ ] Workbook tool integration tests

### Planned 🔴
- [ ] All other integration tests
- [ ] E2E test suite
- [ ] Property-based tests
- [ ] Mutation testing
- [ ] CI/CD pipeline

---

## Notes

1. **Test Isolation**: Each test gets a unique user ID and temp database
2. **Async Testing**: All tests are async; use `await` properly
3. **Mock Server**: Use `MockMcpServer` from `test/helpers/test-server.ts` for tool testing
4. **Context**: Use `createTestContext()` from `test/helpers/test-context.ts` for isolated contexts
5. **Assertions**: Use custom assertions from `test/helpers/assertions.ts` for MCP-specific checks

---

*Last Updated: 2026-07-12*
*Version: 1.0*