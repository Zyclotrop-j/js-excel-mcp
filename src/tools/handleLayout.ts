import { ToolHandler } from './interface.js';
import { mergeCells, setColumnWidth, setRowHeight, makeFreezePane, makeSheetView, type Worksheet } from '@office-kit/xlsx/worksheet';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import { encode } from '@toon-format/toon';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class LayoutHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('merge_cells', { description: 'merge a range of cells into a single cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string()
        }), outputSchema: z.object({
            range: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            mergeCells(ws, arg.range);
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ range: arg.range, merged: true }) }],
                structuredContent: { range: arg.range }
            });
        });

        this.registerTool('freeze_panes', { description: 'freeze rows and columns at a cell reference (the cell below/right of the freeze line)', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            cellRef: z.string()
        }), outputSchema: z.object({
            cellRef: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            ws.views.push(makeSheetView({ pane: makeFreezePane(arg.cellRef) }));
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ cellRef: arg.cellRef, frozen: true }) }],
                structuredContent: { cellRef: arg.cellRef }
            });
        });

        this.registerTool('set_column_width', { description: 'set the width of a specific column', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            column: z.number(),
            width: z.number()
        }), outputSchema: z.object({
            column: z.number().optional(),
            width: z.number().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            setColumnWidth(ws, arg.column, arg.width);
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ column: arg.column, width: arg.width }) }],
                structuredContent: { column: arg.column, width: arg.width }
            });
        });

        this.registerTool('set_row_height', { description: 'set the height of a specific row', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            row: z.number(),
            height: z.number()
        }), outputSchema: z.object({
            row: z.number().optional(),
            height: z.number().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            setRowHeight(ws, arg.row, arg.height);
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: encode({ row: arg.row, height: arg.height }) }],
                structuredContent: { row: arg.row, height: arg.height }
            });
        });
    }
}
