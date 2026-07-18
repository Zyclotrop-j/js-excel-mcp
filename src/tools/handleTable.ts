import { ToolHandler } from './interface.js';
import { addExcelTable, makeAutoFilter, type Worksheet } from '@office-kit/xlsx/worksheet';
import type { SheetRef, Workbook } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class TableHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('create_excel_table', { description: 'promote a range to an Excel table', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string(),
            name: z.string(),
            columns: z.array(z.string()),
            style: z.string().optional()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            name: z.string().optional(),
            range: z.string().optional(),
            action: z.literal('created').optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            let wb: Workbook;
            try {
                wb = await context.getWorkbook(filename);
            } catch {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }], isError: true });
            }

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            addExcelTable(wb, ws, { name: arg.name, ref: arg.range, columns: arg.columns, style: arg.style });

            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `table '${arg.name}' created in range '${arg.range}' on sheet '${sheetName}' in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    name: arg.name,
                    range: arg.range,
                    action: 'created'
                }
            });
        });

        this.registerTool('add_autofilter', { description: 'add filter dropdown arrows to a header row range', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string().optional(),
            action: z.literal('added').optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            let wb: Workbook;
            try {
                wb = await context.getWorkbook(filename);
            } catch {
                return context.contextualiseResponse({ content: [{ type: 'text', text: `workbook '${filename}' doesn't exist` }], isError: true });
            }

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            ws.autoFilter = makeAutoFilter({ ref: arg.range });

            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `autofilter added on range '${arg.range}' on sheet '${sheetName}' in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    range: arg.range,
                    action: 'added'
                }
            });
        });
    }
}
