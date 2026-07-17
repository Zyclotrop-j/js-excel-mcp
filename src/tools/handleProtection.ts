import { ToolHandler } from './interface.js';
import { getCell, getCellByCoord, makeSheetProtection, type Worksheet } from '@office-kit/xlsx/worksheet';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import { getCoordinate } from '@office-kit/xlsx/cell';
import { setCellProtection, makeProtection } from '@office-kit/xlsx/styles';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class ProtectionHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('protect_sheet', { description: 'enable or disable sheet protection', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            password: z.string().optional(),
            enable: z.boolean()
        }), outputSchema: z.object({
            protected: z.boolean().optional(),
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

            if (arg.enable) {
                ws.sheetProtection = makeSheetProtection({ sheet: true });
            } else {
                ws.sheetProtection = undefined;
            }

            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheet '${sheetName}' ${arg.enable ? 'protected' : 'unprotected'}` }],
                structuredContent: { protected: arg.enable }
            });
        });

        this.registerTool('lock_cell', { description: 'set the lock status on a specific cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            locked: z.boolean()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            locked: z.boolean().optional(),
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

            setCellProtection(wb, cell, makeProtection({ locked: arg.locked }));
            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `cell ${ref} ${arg.locked ? 'locked' : 'unlocked'}` }],
                structuredContent: { ref, locked: arg.locked }
            });
        });
    }
}
