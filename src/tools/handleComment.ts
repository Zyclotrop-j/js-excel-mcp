import { ToolHandler } from './interface.js';
import { setComment, type Worksheet, type LegacyComment } from '@office-kit/xlsx/worksheet';
import { getCoordinate } from '@office-kit/xlsx/cell';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import { tupleToCoordinate } from '@office-kit/xlsx/utils';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class CommentHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('add_comment', { description: 'add a comment/note to a cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            text: z.string(),
            author: z.string().optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            author: z.string().optional(),
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

            let cellRef: string;
            if (arg.ref) {
                cellRef = arg.ref;
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cellRef = tupleToCoordinate(arg.col, arg.row);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }] });
                cellRef = currentCell;
            }

            const author = arg.author ?? 'User';
            const comment = setComment(ws, { ref: cellRef, author, text: arg.text });

            await context.setWorkbook(filename, wb);
            await context.setCurrentCell(cellRef);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `comment added to cell ${cellRef} by ${author}` }],
                structuredContent: { ref: cellRef, author }
            });
        });

        this.registerTool('delete_comment', { description: 'remove a comment from a cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: true,
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

            let cellRef: string;
            if (arg.ref) {
                cellRef = arg.ref;
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cellRef = tupleToCoordinate(arg.col, arg.row);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }] });
                cellRef = currentCell;
            }

            const before = ws.legacyComments.length;
            ws.legacyComments = ws.legacyComments.filter((c: LegacyComment) => c.ref !== cellRef);
            const removed = ws.legacyComments.length < before;

            await context.setWorkbook(filename, wb);
            await context.setCurrentCell(cellRef);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: removed ? `comment removed from cell ${cellRef}` : `no comment found on cell ${cellRef}` }],
                structuredContent: { ref: cellRef }
            });
        });
    }
}
