import { ToolHandler } from '../interface.js';
import { getCell, getCellByCoord, findCells, getRangeValues, type Worksheet } from '@office-kit/xlsx/worksheet';
import { cellValueAsPrimitive, cellValueAsString, getFormulaText, getCoordinate, type Cell } from '@office-kit/xlsx/cell';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import { encode } from '@toon-format/toon';
import z from 'zod';
import { Context } from '../../filesystem/context.js';

const cellNativeValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.object({ kind: z.literal('duration'), ms: z.number() }).loose(),
    z.object({ kind: z.literal('error'), code: z.enum(['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#GETTING_DATA']) }).loose(),
    z.object({ kind: z.literal('rich-text'), runs: z.array(z.object({ text: z.string(), font: z.object({
        name: z.string().optional(), sz: z.number().optional(), b: z.boolean().optional(), i: z.boolean().optional(),
        u: z.enum(['single', 'double', 'singleAccounting', 'doubleAccounting']).optional(),
        strike: z.boolean().optional(), outline: z.boolean().optional(), shadow: z.boolean().optional(),
        condense: z.boolean().optional(), extend: z.boolean().optional(),
        vertAlign: z.enum(['baseline', 'superscript', 'subscript']).optional(),
        color: z.string().optional(), family: z.number().optional(), charset: z.number().optional(),
        scheme: z.enum(['major', 'minor']).optional(),
    }).optional() })) }).loose(),
    z.object({ kind: z.literal('formula'), formula: z.string(), t: z.enum(['normal', 'array', 'shared', 'dataTable']),
        cachedValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
        ref: z.string().optional(), si: z.number().optional(),
        r1: z.string().optional(), r2: z.string().optional(),
        dt2D: z.boolean().optional(), dtr: z.boolean().optional(),
        del1: z.boolean().optional(), del2: z.boolean().optional(),
        aca: z.boolean().optional(), ca: z.boolean().optional(),
    }).loose(),
    z.null(),
]);

export class CellReadHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('get_cell', { description: 'get the content of a cell by A1 reference or row/col', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            value: z.string().optional(),
            nativeValue: cellNativeValueSchema.optional(),
            formula: z.string().nullable().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            let cell;
            if (arg.ref) {
                cell = getCellByCoord(ws, arg.ref);
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cell = getCell(ws, arg.row, arg.col);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }], isError: true });
                cell = getCellByCoord(ws, currentCell);
            }

            if (!cell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'cell is empty' }], isError: true });

            const value = cell.value;
            const primitive = cellValueAsPrimitive(value);
            const formula = getFormulaText(cell);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ ref, value: primitive, formula: formula ?? null }) }],
                structuredContent: { ref, value: cellValueAsString(value), nativeValue: value instanceof Date ? value.toISOString() : value, formula: formula ?? null }
            });
        });

        this.registerTool('search_cells', { description: 'search all cells in a worksheet for text matching a query', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            query: z.string()
        }), outputSchema: z.object({
            query: z.string().optional(),
            matchCount: z.number().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            const query = arg.query.toLowerCase();
            const matches: { ref: string; value: string; formula: string | null }[] = [];

            for (const cell of findCells(ws, (c: Cell) => {
                const v = cellValueAsString(c.value).toLowerCase();
                const f = getFormulaText(c);
                return v.includes(query) || (f !== undefined && f.toLowerCase().includes(query));
            })) {
                matches.push({
                    ref: getCoordinate(cell),
                    value: cellValueAsString(cell.value),
                    formula: getFormulaText(cell) ?? null
                });
            }

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ query: arg.query, matches }) }],
                structuredContent: { query: arg.query, matchCount: matches.length }
            });
        });

        this.registerTool('get_range', { description: 'get all cells in a range (e.g. A1:C5) encoded in TOON format', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string()
        }), outputSchema: z.object({
            range: z.string().optional(),
            values: z.array(z.array(cellNativeValueSchema.nullable())).optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: true
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            const values = getRangeValues(ws, arg.range)?.map(value => value.map(value => value instanceof Date ? value.toISOString() : value));

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ range: arg.range, values }) }],
                structuredContent: { range: arg.range, values }
            });
        });
    }
}
