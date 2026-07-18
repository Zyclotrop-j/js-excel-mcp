import { ToolHandler } from '../interface.js';
import { getCell, setCell, setCellByCoord, getCellByCoord, setRangeValues, type Worksheet } from '@office-kit/xlsx/worksheet';
import { bindValue, setFormula, cellValueAsString, getCoordinate } from '@office-kit/xlsx/cell';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../../filesystem/context.js';

const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export class CellWriteHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('set_cell', { description: 'set the content of a cell (string, number, boolean, or null)', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            value: cellValueSchema
        }), outputSchema: z.object({
            ref: z.string().optional(),
            value: cellValueSchema.optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }] });
            const ws: Worksheet = sheet.sheet;

            let cell;
            if (arg.ref) {
                cell = setCellByCoord(ws, arg.ref, arg.value);
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = setCell(ws, arg.row, arg.col, arg.value);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }] });
                cell = setCellByCoord(ws, currentCell, arg.value);
            }

            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `cell ${ref} set to ${JSON.stringify(arg.value)}` }],
                structuredContent: { ref, value: arg.value }
            });
        });

        this.registerTool('set_formula', { description: 'set a formula on a cell (e.g. =SUM(A1:A10)). Note: The fomulas result is NOT calculated, and will only become available after downloading the sheet and opening it in Excel!', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            formula: z.string()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            formula: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }] });
            const ws: Worksheet = sheet.sheet;

            let cell;
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref) ?? setCellByCoord(ws, arg.ref, null);
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col) ?? setCell(ws, arg.row, arg.col, null);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }] });
                cell = getCellByCoord(ws, currentCell) ?? setCellByCoord(ws, currentCell, null);
            }

            setFormula(cell, arg.formula);
            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `formula '${arg.formula}' set on cell ${ref}` }],
                structuredContent: { ref, formula: arg.formula }
            });
        });

        this.registerTool('set_cells', { description: 'set multiple cells at once from a 2D array of values (batch-set)', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string(),
            values: z.array(z.array(cellValueSchema.nullable()))
        }), outputSchema: z.object({
            range: z.string().optional(),
            rows: z.number().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }] });
            const ws: Worksheet = sheet.sheet;

            const rangeParts = arg.range.split(':');
            const parseCellRef = (ref: string) => {
                const m = ref.match(/^([A-Z]+)(\d+)$/);
                if (!m) throw new Error(`Invalid cell reference: ${ref}`);
                let col = 0;
                for (let i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
                return { row: parseInt(m[2], 10), col };
            };
            const startCell = parseCellRef(rangeParts[0]);
            const endCell = rangeParts.length > 1 ? parseCellRef(rangeParts[1]) : startCell;
            const maxRows = endCell.row - startCell.row + 1;
            const maxCols = endCell.col - startCell.col + 1;
            if (arg.values.length > maxRows) {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `values array has ${arg.values.length} rows but range '${arg.range}' only covers ${maxRows} rows` }], isError: true });
            }
            for (let i = 0; i < arg.values.length; i++) {
                if (arg.values[i].length > maxCols) {
                    return context.contextualiseResponse({ content: [{ type: 'text', text: `values row ${i + 1} has ${arg.values[i].length} columns but range '${arg.range}' only covers ${maxCols} columns` }], isError: true });
                }
            }

            setRangeValues(ws, arg.range, arg.values);
            await context.setWorkbook(filename, wb);
            const startRef = arg.range.split(':')[0];
            await context.setCurrentCell(startRef);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `set ${arg.values.length} rows in range '${arg.range}'` }],
                structuredContent: { range: arg.range, rows: arg.values.length }
            });
        });

        this.registerTool('set_cell_type', { description: 'change the value type of a cell (number, currency, percent, date, text, boolean)', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            type: z.enum(['number', 'currency', 'percent', 'date', 'text', 'boolean'])
        }), outputSchema: z.object({
            ref: z.string().optional(),
            type: z.string().optional(),
            newValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }] });
            const ws: Worksheet = sheet.sheet;

            let cell;
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref);
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }] });
                cell = getCellByCoord(ws, currentCell);
            }

            if (!cell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'cell is empty' }] });

            const currentValue = cellValueAsString(cell.value);
            let newValue: string | number | boolean | Date | null = null;

            switch (arg.type) {
                case 'number':
                    newValue = Number(currentValue) || 0;
                    break;
                case 'currency':
                    newValue = Number(currentValue.replace(/[^0-9.-]/g, '')) || 0;
                    break;
                case 'percent':
                    newValue = Number(currentValue.replace(/[^0-9.-]/g, '')) || 0;
                    break;
                case 'date':
                    newValue = new Date(currentValue);
                    break;
                case 'text':
                    newValue = currentValue;
                    break;
                case 'boolean':
                    newValue = /^(true|1|yes)$/i.test(currentValue);
                    break;
            }

            bindValue(cell, newValue);
            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `cell ${ref} converted to ${arg.type}: ${JSON.stringify(newValue)}` }],
                structuredContent: { ref, type: arg.type, newValue: newValue instanceof Date ? newValue.toISOString() : newValue }
            });
        });
    }
}
