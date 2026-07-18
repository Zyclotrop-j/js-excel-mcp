import { ToolHandler } from './interface.js';
import { makePageSetup, type Worksheet } from '@office-kit/xlsx/worksheet';
import { addDefinedName } from '@office-kit/xlsx/workbook';
import type { SheetRef, Workbook } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class PrintHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('set_print_area', { description: 'set the print area for a worksheet', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string().optional(),
            action: z.literal('set'),
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

            addDefinedName(wb, {
                name: '_xlnm.Print_Area',
                value: `${sheetName}!${arg.range}`,
                scope: sheetName,
                hidden: true
            });
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `print area set to '${arg.range}' on sheet '${sheetName}' in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    range: arg.range,
                    action: 'set'
                }
            });
        });

        this.registerTool('set_page_setup', { description: 'configure page orientation, paper size, or scale-to-fit', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            orientation: z.enum(['default', 'portrait', 'landscape']).optional(),
            paperSize: z.number().optional(),
            fitToWidth: z.number().optional(),
            fitToHeight: z.number().optional(),
            scale: z.number().optional()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            orientation: z.string().optional(),
            paperSize: z.number().optional(),
            scale: z.number().optional(),
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

            const pageSetup = makePageSetup({
                orientation: arg.orientation,
                paperSize: arg.paperSize,
                scale: arg.scale,
                fitToWidth: arg.fitToWidth,
                fitToHeight: arg.fitToHeight
            });
            ws.pageSetup = {
                ...(ws.pageSetup ?? {}),
                ...pageSetup
            };

            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `page setup updated on sheet '${sheetName}' in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    orientation: arg.orientation,
                    paperSize: arg.paperSize,
                    scale: arg.scale
                }
            });
        });
    }
}
