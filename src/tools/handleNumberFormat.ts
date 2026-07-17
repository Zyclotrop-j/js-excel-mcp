import { ToolHandler } from './interface.js';
import { setCellAsCurrency, setCellAsPercent, setCellNumberFormat, FORMAT_DATE_DATETIME } from '@office-kit/xlsx/styles';
import { getCell, getCellByCoord, type Worksheet } from '@office-kit/xlsx/worksheet';
import { getCoordinate } from '@office-kit/xlsx/cell';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class NumberFormatHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('set_cell_currency', { description: 'apply currency formatting to a cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            symbol: z.string().optional(),
            decimals: z.number().optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            format: z.string().optional(),
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

            setCellAsCurrency(wb, cell, { symbol: arg.symbol ?? '$' });
            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `currency format applied to cell ${ref}` }],
                structuredContent: { ref, format: 'currency' }
            });
        });

        this.registerTool('set_cell_percent', { description: 'apply percent formatting to a cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            decimals: z.number().optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            format: z.string().optional(),
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

            setCellAsPercent(wb, cell, arg.decimals ?? 0);
            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `percent format applied to cell ${ref}` }],
                structuredContent: { ref, format: 'percent' }
            });
        });

        this.registerTool('set_cell_date_format', { description: 'apply date or time formatting to a cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            format: z.enum(['date', 'datetime', 'time'])
        }), outputSchema: z.object({
            ref: z.string().optional(),
            format: z.string().optional(),
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

            const formatMap: Record<string, string> = {
                date: 'yyyy-mm-dd',
                datetime: FORMAT_DATE_DATETIME,
                time: 'hh:mm:ss'
            };

            setCellNumberFormat(wb, cell, formatMap[arg.format]);
            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `${arg.format} format applied to cell ${ref}` }],
                structuredContent: { ref, format: arg.format }
            });
        });

        this.registerTool('set_cell_number_format', { description: 'apply a custom number format string to a cell (e.g. "#,##0.00" or "0.00%")', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            formatString: z.string()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            format: z.string().optional(),
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

            setCellNumberFormat(wb, cell, arg.formatString);
            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `format '${arg.formatString}' applied to cell ${ref}` }],
                structuredContent: { ref, format: arg.formatString }
            });
        });
    }
}
