import { ToolHandler } from './interface.js';
import { groupRows, groupColumns } from '@office-kit/xlsx/worksheet';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import type { Worksheet } from '@office-kit/xlsx/worksheet';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class OutlineHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('group_rows', { description: 'group a range of rows together so they can be collapsed/expanded', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            startRow: z.number(),
            endRow: z.number(),
            collapsed: z.boolean().optional().default(false)
        }), outputSchema: z.object({
            startRow: z.number().optional(),
            endRow: z.number().optional(),
            collapsed: z.boolean().optional(),
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

            groupRows(ws, arg.startRow, arg.endRow);

            if (arg.collapsed) {
                for (let r = arg.startRow; r <= arg.endRow; r++) {
                    const dim = ws.rowDimensions.get(r);
                    if (dim) {
                        dim.hidden = true;
                        dim.collapsed = true;
                    }
                }
            }

            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `rows ${arg.startRow}-${arg.endRow} grouped${arg.collapsed ? ' (collapsed)' : ''}` }],
                structuredContent: {
                    startRow: arg.startRow,
                    endRow: arg.endRow,
                    collapsed: arg.collapsed ?? false
                }
            });
        });

        this.registerTool('group_columns', { description: 'group a range of columns together so they can be collapsed/expanded', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            startCol: z.number(),
            endCol: z.number(),
            collapsed: z.boolean().optional().default(false)
        }), outputSchema: z.object({
            startCol: z.number().optional(),
            endCol: z.number().optional(),
            collapsed: z.boolean().optional(),
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

            groupColumns(ws, arg.startCol, arg.endCol);

            if (arg.collapsed) {
                for (let c = arg.startCol; c <= arg.endCol; c++) {
                    const dim = ws.columnDimensions.get(c);
                    if (dim) {
                        dim.hidden = true;
                        dim.collapsed = true;
                    }
                }
            }

            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `columns ${arg.startCol}-${arg.endCol} grouped${arg.collapsed ? ' (collapsed)' : ''}` }],
                structuredContent: {
                    startCol: arg.startCol,
                    endCol: arg.endCol,
                    collapsed: arg.collapsed ?? false
                }
            });
        });
    }
}
