import { ToolHandler } from './interface.js';
import { addDataValidation, makeDataValidation, type Worksheet } from '@office-kit/xlsx/worksheet';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class ValidationHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('add_dropdown_validation', { description: 'add a dropdown list validation to a cell range', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string(),
            options: z.union([z.array(z.string()), z.string()]),
            prompt: z.string().optional(),
            error: z.string().optional()
        }), outputSchema: z.object({
            range: z.string().optional(),
            optionsCount: z.number().optional(),
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

            const list = Array.isArray(arg.options) ? arg.options : arg.options.split(',').map((s: string) => s.trim());
            const formula1 = `"${list.join(',')}"`;

            const validation = makeDataValidation({
                type: 'list',
                sqref: arg.range,
                formula1,
                ...(arg.prompt ? { prompt: arg.prompt } : {}),
                ...(arg.error ? { error: arg.error } : {})
            });

            addDataValidation(ws, validation);
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `dropdown validation added to range '${arg.range}' with ${list.length} options` }],
                structuredContent: { range: arg.range, optionsCount: list.length }
            });
        });

        this.registerTool('add_number_validation', { description: 'add a number validation rule to a cell range', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string(),
            min: z.number().optional(),
            max: z.number().optional(),
            wholeNumber: z.boolean().optional(),
            errorTitle: z.string().optional(),
            error: z.string().optional()
        }), outputSchema: z.object({
            range: z.string().optional(),
            type: z.string().optional(),
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

            const type = arg.wholeNumber ? 'whole' : 'decimal';

            const validation = makeDataValidation({
                type,
                sqref: arg.range,
                operator: 'between',
                ...(arg.min !== undefined ? { formula1: String(arg.min) } : {}),
                ...(arg.max !== undefined ? { formula2: String(arg.max) } : {}),
                ...(arg.errorTitle ? { errorTitle: arg.errorTitle } : {}),
                ...(arg.error ? { error: arg.error } : {})
            });

            addDataValidation(ws, validation);
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `${type} number validation added to range '${arg.range}'` }],
                structuredContent: { range: arg.range, type }
            });
        });
    }
}
