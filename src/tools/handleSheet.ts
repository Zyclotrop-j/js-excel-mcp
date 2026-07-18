import { ToolHandler } from './interface.js';
import { addWorksheet, getSheet, removeSheet, renameSheet, setActiveSheet, sheetNames } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class SheetHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('create_sheet', { description: 'create a new worksheet in a workbook', inputSchema: z.object({
            workbook: z.string().optional(),
            name: z.string()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            action: z.literal('created'),
            sheets: z.array(z.string()).optional(),
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
            addWorksheet(wb, arg.name);
            await context.setWorkbook(filename, wb);
            await context.setCurrentSheet(arg.name);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheet '${arg.name}' created in workbook '${filename}' and set active` }],
                structuredContent: {
                    filename,
                    sheet: arg.name,
                    action: 'created',
                    sheets: sheetNames(wb)
                }
            });
        });

        this.registerTool('delete_sheet', { description: 'delete a worksheet from a workbook', inputSchema: z.object({
            workbook: z.string().optional(),
            name: z.string().optional()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            action: z.literal('deleted').optional(),
            sheets: z.array(z.string()).optional(),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const sheetName = arg.name ?? await context.getCurrentSheet();
            if (!sheetName) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no sheet specified and no current sheet set' }], isError: true });

            const wb = await context.getWorkbook(filename);

            if(!getSheet(wb, sheetName)) {
                return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheet '${sheetName}' not found in workbook '${filename}'` }],
                isError: true,
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    sheets: sheetNames(wb)
                }
            });
            }

            await removeSheet(wb, sheetName);
            await context.setWorkbook(filename, wb);

            const currentSheet = await context.getCurrentSheet();
            if (currentSheet === sheetName) {
                await context.setCurrentSheet(sheetNames(wb)[0] ?? '');
            }

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheet '${sheetName}' deleted from workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    action: 'deleted',
                    sheets: sheetNames(wb)
                }
            });
        });

        this.registerTool('select_sheet', { description: 'set a worksheet as the current active sheet', inputSchema: z.object({
            workbook: z.string().optional(),
            name: z.string().optional()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            action: z.literal('selected'),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const sheetName = arg.name ?? await context.getCurrentSheet();
            if (!sheetName) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no sheet specified and no current sheet set' }], isError: true });

            const wb = await context.getWorkbook(filename);
            setActiveSheet(wb, sheetName);
            await context.setWorkbook(filename, wb);
            await context.setCurrentSheet(sheetName);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `active sheet set to '${sheetName}' in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    action: 'selected'
                }
            });
        });

        this.registerTool('list_sheets', { description: 'list all worksheets in a workbook', inputSchema: z.object({
            workbook: z.string().optional()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheets: z.array(z.string()).optional(),
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
            const names = sheetNames(wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheets in '${filename}': ${names.join(', ')}` }],
                structuredContent: {
                    filename,
                    sheets: names
                }
            });
        });

        this.registerTool('rename_sheet', { description: 'rename a worksheet in a workbook', inputSchema: z.object({
            workbook: z.string().optional(),
            oldName: z.string().optional(),
            newName: z.string()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            oldName: z.string().optional(),
            newName: z.string().optional(),
            action: z.literal('renamed'),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const oldName = arg.oldName ?? await context.getCurrentSheet();
            if (!oldName) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no sheet specified and no current sheet set' }], isError: true });

            const wb = await context.getWorkbook(filename);
            renameSheet(wb, oldName, arg.newName);
            await context.setWorkbook(filename, wb);

            const currentSheet = await context.getCurrentSheet();
            if (currentSheet === oldName) {
                await context.setCurrentSheet(arg.newName);
            }

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheet '${oldName}' renamed to '${arg.newName}' in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    oldName,
                    newName: arg.newName,
                    action: 'renamed'
                }
            });
        });
    }
}
