# js-excel-mcp

A TypeScript-based MCP (Model Context Protocol) server for programmatic Excel workbook manipulation. Exposes 50+ tools for reading, writing, formatting, charting, and exporting `.xlsx` files through a stateful session model.

## Overview

This server implements the Model Context Protocol to let AI assistants and other MCP clients manipulate Excel workbooks. It maintains sticky state (current file, sheet, cell cursor) so clients can chain operations without re-specifying targets on every call.

## Features

- **Stateful sessions** — sticky file/sheet/cell cursor auto-follows operations
- **50+ MCP tools** — workbook, sheet, cell, styling, chart, table, validation, protection, and more
- **Smart header detection** — uses MCP sampling or heuristic analysis to identify header bands
- **Token-efficient output** — TOON encoding for range/search results
- **Per-user isolation** — SQLite-backed virtual filesystem with user-scoped workbooks
- **OAuth 2.1** — OIDC authorization server with PKCE
- **Cursor navigation** — directional moves with stopping conditions (UNTIL_BLANK, UNTIL_ERROR, value/regex/date compares)
- **Chain operations** — batch tool calls with shared context
- **Export URLs** — 4-hour TTL download links for workbooks
- **MCP resources** — open workbooks exposed as `workbook://` URIs

## Stack

- **TypeScript** — strict type safety
- **@modelcontextprotocol/sdk** — MCP server framework
- **@office-kit/xlsx** — Excel file manipulation (workbook, worksheet, styles, cell, io)
- **better-sqlite3** — per-user virtual filesystem
- **better-auth** — OIDC authorization server
- **zod** — runtime validation
- **@toon-format/toon** — token-efficient encoding
- **Express** — HTTP transport
- **Node.js** — runtime

## Installation

```bash
npm install
```

## Development

```bash
# Run the development server (tsx watch mode)
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Watch mode for TypeScript compilation
npm run watch
```

## Usage

The server runs on **port 3000** (MCP endpoint at `/mcp`) with an OAuth authorization server on **port 3001**.

### Configuration

```bash
# Optional: override auth server port (default: 3001)
MCP_AUTH_PORT=3001 npm run dev
```

### Connecting an MCP Client

1. Start the server: `npm run dev`
2. Configure your MCP client to connect to `http://localhost:3000/mcp`
3. The client will discover the authorization server via RFC 9728 Protected Resource Metadata
4. Complete OAuth flow to obtain an access token
5. Make tool calls with the bearer token

### Tool Categories

**Workbook Management**
- `create_new_workbook` — make a fresh workbook
- `import_workbook_from_url` — fetch an existing `.xlsx`
- `close_workbook` — drop a workbook from the session
- `export_workbook_to_url` — get a download URL with TTL

**Sheet Operations**
- `list_sheets`, `select_sheet`, `create_sheet`, `rename_sheet`, `delete_sheet`, `copy_sheet`, `move_sheet`

**Cell Operations**
- `get_cell`, `get_range`, `set_cell`, `set_cells`, `set_formula`, `set_cell_type`
- `search_cells`, `move_cell_cursor`

**Header Detection & Sampling**
- `detect_headers` — find header bands (uses MCP sampling or heuristic)
- `get_sample`, `get_row_sample`, `get_column_sample` — TOON-encoded data samples

**Styling & Formatting**
- `set_cell_bold`, `set_cell_font`, `set_cell_background_color`, `set_cell_alignment`, `set_cell_border`
- `set_cell_currency`, `set_cell_percent`, `set_cell_date_format`, `set_cell_number_format`
- `set_rich_text` — mixed formatting in one cell

**Layout & Structure**
- `merge_cells`, `freeze_panes`, `set_column_width`, `set_row_height`
- `create_excel_table`, `add_autofilter`, `add_named_range`

**Data Validation & Protection**
- `add_dropdown_validation`, `add_number_validation`
- `protect_sheet`, `lock_cell`

**Conditional Formatting**
- `add_color_scale`, `add_cell_value_rule`

**Visualizations**
- `add_bar_chart`, `add_line_chart`, `insert_image`

**Annotations**
- `add_comment`, `delete_comment`, `set_cell_hyperlink`

**Outline & Print**
- `group_rows`, `group_columns`
- `set_print_area`, `set_page_setup`

**Chaining**
- `chain_operations` — dispatch a list of tool calls sequentially with shared context

## Architecture

### File Structure

```
src/
  index.ts              ← MCP server entry point
  shared/
    auth.ts             ← demo auth credentials
    authServer.ts       ← OIDC authorization server setup
  filesystem/
    system.ts           ← SQLite-backed virtual filesystem
    context.ts          ← per-user workbook store + sticky state
  tools/
    interface.ts        ← ToolHandler base class
    handleWorkbook.ts   ← workbook tools
    handleSheet.ts      ← sheet tools
    handleCell.ts       ← cell tools (top-level)
    handleCells/
      read.ts           ← get_cell, get_range, search_cells
      write.ts          ← set_cell, set_cells, set_formula
      cursor.ts         ← move_cell_cursor
      discovery.ts      ← detect_headers, get_sample, etc.
    handleChain.ts      ← chain_operations
    handleStyle.ts      ← styling tools
    handleNumberFormat.ts
    handleRichText.ts
    handleLayout.ts     ← merge_cells, freeze_panes, column/row sizing
    handleChart.ts      ← bar/line charts
    handleImage.ts      ← image insertion
    handleTable.ts      ← Excel tables
    handleValidation.ts ← data validation
    handleConditionalFormat.ts
    handleProtection.ts
    handleNamedRange.ts
    handleComment.ts
    handleHyperlink.ts
    handleOutline.ts    ← group rows/columns
    handlePrint.ts      ← print area, page setup
    handleSheetOps.ts   ← higher-level sheet operations
  meta/
    mcpdescription.ts   ← MCP server metadata + instructions
```

### Key Concepts

**Sticky State**
Every tool's `workbook`, `sheet`, and `ref` parameters are optional. If omitted, the server uses the current file/sheet/cell from the session context. The cursor auto-follows any cell-touching operation.

**Per-User Isolation**
Each user gets a separate SQLite database in `data/{userId}.db`. Workbooks, state, and exports are scoped per user. The `_shared` database holds cross-user export URLs.

**TOON Encoding**
Many read/search tools return TOON-encoded strings (a compact, token-efficient format) to minimize context usage. The `@toon-format/toon` library handles encoding/decoding.

**MCP Sampling**
The `detect_headers` tool can use MCP sampling to ask the host LLM which rows/columns are headers when a local heuristic is unreliable (e.g., data rows that are all strings).

**Export URLs**
`export_workbook_to_url` writes the workbook to a shared SQLite database with a 4-hour TTL and returns a download key. Clients fetch via `importFile(name, key)`.

## Documentation

- [TOOL_BUILDING_GUIDE.md](TOOL_BUILDING_GUIDE.md) — how to add new tools
- [EXCELJS_FEATURES_LIST.md](EXCELJS_FEATURES_LIST.md) — full feature matrix reference
- [officekit-xlsx-llms.txt](officekit-xlsx-llms.txt) — `@office-kit/xlsx` API reference

## Testing

Tests are not yet implemented. The codebase is ready for unit and integration tests using Node's built-in test runner.

```bash
# Future commands (not yet configured)
npm test
npm run test:unit
npm run test:integration
npm run coverage
```

## License

MIT