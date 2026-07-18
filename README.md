# js-excel-mcp

A TypeScript-based MCP (Model Context Protocol) server for programmatic Excel workbook manipulation. Exposes 50+ tools for reading, writing, formatting, charting, and exporting `.xlsx` files through a stateful session model. Supports Node.js and Cloudflare Workers.

## Overview

This server implements the Model Context Protocol to let AI assistants and other MCP clients manipulate Excel workbooks. It maintains sticky state (current file, sheet, cell cursor) so clients can chain operations without re-specifying targets on every call.

## Features

- **Stateful sessions** — sticky file/sheet/cell cursor auto-follows operations
- **50+ MCP tools** — workbook, sheet, cell, styling, chart, table, validation, protection, and more
- **Smart header detection** — uses MCP sampling or heuristic analysis to identify header bands
- **Token-efficient output** — TOON encoding for range/search results
- **Per-user isolation** — SQLite/memory/Cloudflare-backed virtual filesystem with user-scoped workbooks
- **OAuth 2.1** — OIDC authorization server with PKCE
- **Cursor navigation** — directional moves with stopping conditions (UNTIL_BLANK, UNTIL_ERROR, value/regex/date compares)
- **Chain operations** — batch tool calls with shared context
- **Export URLs** — 4-hour TTL download links for workbooks
- **MCP resources** — open workbooks exposed as `workbook://` URIs
- **Explicit context control** — `set_context` tool to manually set file/sheet/cell
- **Cloudflare Workers** — deployable as a Cloudflare Worker via `handler.ts`
- **PM2 process management** — auto-restart, logs, backgrounding
- **Comprehensive test suite** — unit, integration, e2e, property-based, and mutation tests

## Stack

- **TypeScript** — strict type safety
- **@modelcontextprotocol/sdk** — MCP server framework
- **@modelcontextprotocol/express** — Express MCP transport
- **@modelcontextprotocol/fastify** — Fastify MCP transport (alternative)
- **@office-kit/xlsx** — Excel file manipulation (workbook, worksheet, styles, cell, io)
- **better-sqlite3** — per-user virtual filesystem (production)
- **memfs** — in-memory filesystem (testing)
- **better-auth** — OIDC authorization server
- **zod** — runtime validation
- **@toon-format/toon** — token-efficient encoding
- **@cfworker/json-schema** — JSON schema validation
- **lru-cache** — caching
- **Express / Fastify** — HTTP transports
- **Node.js** — primary runtime
- **Cloudflare Workers** — alternative deployment target

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

### PM2 Process Management

The server can run under PM2 for auto-restart and backgrounding:

```bash
npm run pm2:start      # Start via PM2
npm run pm2:stop       # Stop and delete
npm run pm2:restart    # Restart
npm run pm2:logs       # View last 20 log lines
npm run pm2:status     # List PM2 processes
```

See [Agents.md](Agents.md) for detailed PM2 usage and notes.

## Usage

The server runs on **port 3000** (MCP endpoint at `/mcp`) with an OAuth authorization server on **port 3001**.

### Configuration

```bash
# Optional: override auth server port (default: 3001)
MCP_AUTH_PORT=3001 npm run dev

# Optional: override base host (default: http://localhost)
MCP_BASEHOST=http://localhost npm run dev
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

**Context Control**
- `set_context` — manually set the current workbook, sheet, and/or cell

**Chaining**
- `chain_operations` — dispatch a list of tool calls sequentially with shared context

## Architecture

### File Structure

```
src/
  index.ts              ← Express server entry point
  server.ts             ← server setup + MCP handler wiring
  handler.ts            ← Cloudflare Workers handler entry
  shared/
    auth.ts             ← demo auth credentials
    authServer.ts       ← OIDC authorization server setup
  filesystem/
    system.ts           ← SQLite-backed virtual filesystem
    context.ts          ← per-user workbook store + sticky state
    IDatabaseBackend.ts ← database backend interface
    databaseBackend.ts  ← SQLite backend implementation
    memoryBackend.ts    ← in-memory backend (testing)
    cloudflareBackend.ts← Cloudflare D1 backend
    writeCoordinator.ts ← write serialization
  tools/
    index.ts            ← tool re-exports
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
    handleSetContext.ts ← set_context
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
  util/
    requestContext.ts   ← async context helpers
    lru.js / lru.d.ts   ← LRU cache wrapper
test/
  run.ts                ← test runner entry
  run-integration.ts    ← integration test runner
  run-e2e.ts            ← e2e test runner
  run-property.ts       ← property-based test runner
  filesystem/           ← filesystem unit tests
  meta/                 ← metadata tests
  integration/          ← integration tests
  e2e/                  ← end-to-end tests
  property/             ← property-based tests
  helpers/              ← test utilities
  fixtures/             ← test fixture files
  findings/             ← per-feature test findings
  snapshots/            ← test snapshots
```

### Key Concepts

**Sticky State**
Every tool's `workbook`, `sheet`, and `ref` parameters are optional. If omitted, the server uses the current file/sheet/cell from the session context. The cursor auto-follows any cell-touching operation.

**Per-User Isolation**
Each user gets a separate database scope. The server supports multiple backends: SQLite (`databaseBackend.ts`, stored in `data/{userId}.db`), in-memory (`memoryBackend.ts`, for testing), and Cloudflare D1 (`cloudflareBackend.ts`). The `IDatabaseBackend.ts` interface abstracts over all implementations. The `_shared` database holds cross-user export URLs.

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
- [Agents.md](Agents.md) — PM2 management, development conventions
- [TEST_PLAN.md](TEST_PLAN.md) — test strategy and coverage goals
- [TEST_PROGRESS.md](TEST_PROGRESS.md) — feature-by-feature test completion status

## Testing

Tests use [baretest](https://github.com/volument/baretest) as the test runner. The suite includes unit, integration, end-to-end, and property-based tests.

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit           # unit tests (baretest)
npm run test:integration    # integration tests
npm run test:e2e            # end-to-end tests
npm run test:property       # property-based tests (fast-check)
npm run test:mutation       # mutation testing (Stryker)
npm run coverage            # coverage report (c8)
```

### Test categories

- **Unit tests** — filesystem backends (SQLite, in-memory, Cloudflare), context/state management, rate limiting, lock regression
- **Integration tests** — tool handler end-to-end workflows over HTTP
- **E2E tests** — full client–server tool call round-trips
- **Property-based tests** — generated inputs against invariants using `fast-check`
- **Mutation tests** — Stryker mutator with TypeScript checker (thresholds: 90% high, 70% low, 60% break)

### CI

A [GitHub Actions workflow](.github/workflows/release.yml) runs tests and coverage on every push/PR to `main`, then publishes to npm via `semantic-release` on push.

## Known Limitations

- **`set_cell_date_format` requires a cell value** — Applying a date format to an empty cell returns an error. Set the cell value first, then apply the date format.

## License

MIT