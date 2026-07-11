# How to Build a Tool for This MCP Server

A guide for LLM agents (or humans) adding new tools to the js-excel-mcp server.

---

## Architecture Overview

Each tool is a method inside a `ToolHandler` subclass. The handler class lives in its own file under `src/tools/`. Tools are auto-registered at startup via `src/index.ts` which iterates all exports from `src/tools/index.ts`.

```
src/
  tools/
    interface.ts        ← base class (ToolHandler)
    index.ts            ← re-exports all handler files
    handleWorkbook.ts   ← example: workbook tools
    handleSheet.ts      ← example: sheet tools
    handleCell.ts       ← example: cell tools
    YOUR_FILE.ts        ← you are here
```

## Key Objects

| Object | What it is | How to get it |
|--------|-----------|---------------|
| `this.server` | The MCP server instance (for `registerTool`) | From constructor, already on `ToolHandler` |
| `this.context` | The MCP request context (auth info etc.) | From constructor |
| `context` (local) | The `Context` helper — manages workbooks, current file/sheet/cell state | `Context.getContext(userId)` |
| `wb` | The in-memory `Workbook` object | `await context.getWorkbook(filename)` — always followed by `await context.setWorkbook(filename, wb)` after mutations |
| `ws` | The `Worksheet` object | Looked up from `wb.sheets` by name, narrow to `kind === 'worksheet'` |

## The Blueprint

Every tool file follows this exact structure:

```typescript
import { ToolHandler } from './interface.js';
import z from 'zod';
import { Context } from '../filesystem/context.js';
// ↑ Always import these three things.

// Import whatever you need from @office-kit/xlsx/* subpaths.
// Examples:
//   import { setCell, getCell, getCellByCoord, setCellByCoord, type Worksheet } from '@office-kit/xlsx/worksheet';
//   import { setBold, setFontSize } from '@office-kit/xlsx/styles';
//   import { type SheetRef } from '@office-kit/xlsx/workbook';
//   import { getCoordinate, type Cell } from '@office-kit/xlsx/cell';

export class MyHandler extends ToolHandler {
    async register(): Promise<void> {

        // 1. Get the per-user context
        const context = Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        // 2. Register your tool(s)
        this.server.registerTool('tool_name', {
            description: 'Short, clear description of what this tool does',
            inputSchema: z.object({
                // ... parameters. All optional workbook/sheet params use z.string().optional()
                workbook: z.string().optional(),
                sheet: z.string().optional(),
                // ... your specific params
            }),
            outputSchema: z.object({
                // ... your return shape
                context: context.contextualiseResponseTypes()  // ← ALWAYS include this
            }),
            annotations: {
                destructiveHint: false,   // true if it modifies/deletes data
                idempotentHint: false,    // true if running twice gives same result
                openWorldHint: false,     // true if it fetches from external URLs
                readOnlyHint: false       // true if it only reads data
            }
        }, async (arg) => {

            // 3. Resolve workbook filename
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({
                content: [{ type: 'text', text: 'no workbook is currently open' }]
            });

            // 4. Load the workbook
            const wb = await context.getWorkbook(filename);

            // 5. Resolve the worksheet
            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheet '${sheetName}' not found` }]
            });
            const ws: Worksheet = sheet.sheet;

            // 6. Resolve the cell (if the tool operates on a cell)
            //    Use getCellByCoord for ref string, getCell for row/col.
            //    Fall back to currentCell from context.
            let cell;
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref);
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({
                    content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }]
                });
                cell = getCellByCoord(ws, currentCell);
            }
            if (!cell) return context.contextualiseResponse({
                content: [{ type: 'text', text: 'cell is empty' }]
            });

            // 7. Do the work (mutate wb/ws/cell)

            // 8. Save the workbook back if you mutated it
            await context.setWorkbook(filename, wb);

            // 9. Update the current cell if relevant
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            // 10. Return the response — ALWAYS use context.contextualiseResponse()
            return context.contextualiseResponse({
                content: [{ type: 'text', text: `done: ${ref}` }],
                structuredContent: {
                    ref,
                    // ... your result fields
                }
            });
        });
    }
}
```

## Critical Rules

### 1. Always wrap the response with `context.contextualiseResponse(...)`

This prepends the current file/sheet/cell context to every response so the calling agent always knows where it is. **Never return a raw object.**

### 2. Always include `context: context.contextualiseResponseTypes()` in `outputSchema`

This ensures the structured output includes the context block. Without it the schema won't match.

### 3. Always save the workbook after mutations

```typescript
await context.setWorkbook(filename, wb);
```

If you forget this, the changes are lost.

### 4. Cell resolution is a 3-step fallback

Every tool that operates on a cell should resolve it in this order:
1. `arg.ref` → `getCellByCoord(ws, arg.ref)`
2. `arg.row` + `arg.col` → `getCell(ws, arg.row, arg.col)`
3. `await context.getCurrentCell()` → `getCellByCoord(ws, currentCell)`

### 5. Cell resolution is a 3-step fallback

Same pattern for writing:
1. `arg.ref` → `setCellByCoord(ws, arg.ref, value)`
2. `arg.row` + `arg.col` → `setCell(ws, arg.row, arg.col, value)`
3. `await context.getCurrentCell()` → `setCellByCoord(ws, currentCell, value)`

### 6. The `SheetRef` pattern

Always look up a sheet this way:
```typescript
const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
if (!sheet || sheet.kind !== 'worksheet') return /* error */;
const ws: Worksheet = sheet.sheet;
```

### 7. Workbook/sheet params are always optional

The caller can omit `workbook` and `sheet` — they fall back to the currently active file/sheet from context.

### 8. Styling functions require the workbook, not just the cell

Style helpers like `setBold(wb, cell)` take the `Workbook` as first arg, not the `Worksheet`. This is because styles are pooled at the workbook level.

### 9. Import from the right subpath

Each function lives in exactly one subpath:

| What | Import from |
|------|-------------|
| Workbook creation, sheet management, defined names | `@office-kit/xlsx/workbook` |
| Cell get/set, merge, freeze, tables, validation, hyperlinks | `@office-kit/xlsx/worksheet` |
| Cell value, formula, rich text | `@office-kit/xlsx/cell` |
| Fonts, fills, borders, alignment, number formats | `@office-kit/xlsx/styles` |
| Charts | `@office-kit/xlsx/chart` |
| Drawings, images | `@office-kit/xlsx/drawing` |
| A1 ↔ row/col conversion | `@office-kit/xlsx/utils` |

### 10. Register the new file in `src/tools/index.ts`

Add a re-export line:
```typescript
export * from './handleMyThing.js';
```

## Writing Your Tool

1. Create `src/tools/handleYourThing.ts`
2. Follow the blueprint above
3. Export a class that extends `ToolHandler`
4. Add the re-export to `src/tools/index.ts`
5. Import the @office-kit/xlsx functions you need
6. Implement the tool logic
7. Always return via `context.contextualiseResponse(...)`
