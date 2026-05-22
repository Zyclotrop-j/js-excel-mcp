# js-excel-mcp

A JavaScript-based Excel MCP (Model Context Protocol) server that provides tools for reading, writing, and managing Excel files.

## Features

- 📖 Read Excel files with automatic header detection
- ✍️ Write data to Excel files
- 📋 List all sheets in a workbook
- 🔧 Built with TypeScript for type safety
- 🚀 Uses official MCP server SDK
- ✅ Comprehensive unit and integration tests out of the box
- 📦 Multiple output formats (ESM, CommonJS, TypeScript definitions)
- 🔄 Automated releases and versioning via semantic-release
- 📊 Code coverage reporting

## Stack

- **TypeScript** - Type-safe JavaScript
- **@modelcontextprotocol/sdk** - Official MCP server framework
- **exceljs** - Excel file manipulation
- **esbuild** - Fast bundling for ESM and CommonJS
- **Node test runner** - Native test framework
- **c8** - Code coverage reporting
- **semantic-release** - Automated versioning and npm publishing

## Installation

```bash
npm install
```

## Development

```bash
# Run the development server
npm run dev

# Build all formats (ESM, CommonJS, TypeScript definitions)
npm run build

# Run all tests (unit + integration)
npm test

# Run only unit tests
npm run test:unit

# Run only integration/E2E tests
npm run test:integration

# Generate code coverage reports
npm run coverage
```

## Usage

The server exposes three tools:

### `read_excel`

Read data from an Excel file. Returns rows as JSON objects with column headers as keys.

**Parameters:**
- `filePath` (string, required) - Path to the Excel file
- `sheetName` (string, optional) - Name of the sheet to read (defaults to first sheet)

**Example:**
```json
{
  "filePath": "data.xlsx",
  "sheetName": "Users"
}
```

### `write_excel`

Write data to an Excel file.

**Parameters:**
- `filePath` (string, required) - Path to the Excel file
- `data` (array, required) - Array of objects representing rows
- `sheetName` (string, optional) - Name of the sheet to write to (defaults to "Sheet1")

**Example:**
```json
{
  "filePath": "output.xlsx",
  "data": [
    { "name": "Alice", "age": 30 },
    { "name": "Bob", "age": 25 }
  ],
  "sheetName": "People"
}
```

### `list_sheets`

List all sheet names in an Excel file.

**Parameters:**
- `filePath` (string, required) - Path to the Excel file

**Example:**
```json
{
  "filePath": "data.xlsx"
}
```

## Testing

The project includes comprehensive tests:

- **Unit Tests** (`src/**/*.test.ts`) - Test individual services and components
- **Integration/E2E Tests** (`src/integration.test.ts`) - Test complete workflows

Run tests with:
```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
```

Generate coverage reports:
```bash
npm run coverage
```

## Building

The project builds to multiple formats:

```bash
# Build all formats
npm run build

# Build specific formats
npm run build:esm      # ECMAScript modules (.mjs)
npm run build:cjs      # CommonJS (.cjs)
npm run build:types    # TypeScript definitions
```

Built files are in the `dist/` directory:
- `dist/index.mjs` - ESM module with source map
- `dist/index.cjs` - CommonJS module with source map
- `dist/types/` - TypeScript type definitions

## Publishing

The project is configured for automatic publishing to npm via **semantic-release**.

### Conventional Commits

Use conventional commit messages to trigger automatic version bumps:

- `feat: add new tool` → bumps **minor** version
- `fix: resolve issue` → bumps **patch** version
- `BREAKING CHANGE: redesign API` → bumps **major** version

### Publishing Flow

1. Commit changes with conventional messages
2. Push to `main` branch
3. GitHub Actions automatically:
   - Runs all tests
   - On success, semantic-release:
     - Updates version in `package.json`
     - Builds all formats (ESM, CommonJS, types)
     - Publishes to npm with provenance attestation
     - Creates GitHub release with auto-generated notes
     - Tags the commit

### Manual Publishing

If needed, you can manually trigger semantic-release:

```bash
npm run semantic-release
```

## License

MIT