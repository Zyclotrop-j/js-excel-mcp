import { ToolHandler } from './interface.js';
import { sheetNames } from '@office-kit/xlsx/workbook';
import { isValidCellRef } from '@office-kit/xlsx/utils';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class SetContextHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('set_context', {
            description: 'set the current workbook, sheet, and/or cell context. each parameter is optional; only the ones provided are updated. the sheet is only set if its workbook is the active one (or being set in the same call), and the cell is only set if its sheet is the active one (or being set in the same call).',
            inputSchema: z.object({
                workbook: z.string().optional(),
                sheet: z.string().optional(),
                cell: z.string().optional()
            }),
            outputSchema: z.object({
                workbook: z.string().nullable(),
                sheet: z.string().nullable(),
                cell: z.string().nullable(),
                changed: z.array(z.string()),
                context: context.contextualiseResponseTypes()
            }),
            annotations: {
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
                readOnlyHint: true
            }
        }, async (arg) => {
            const changed: string[] = [];

            // 1. Resolve workbook
            let filename = await context.getCurrentFile();
            if (arg.workbook !== undefined) {
                const open = await context.list();
                if (!open.includes(arg.workbook)) {
                    return context.contextualiseResponse({
                        content: [{ type: 'text', text: `workbook '${arg.workbook}' is not open. open workbooks: ${open.join(', ') || 'none'}` }],
                        isError: true
                    });
                }
                filename = arg.workbook;
                await context.setCurrentFile(filename);
                changed.push('workbook');
            }

            // 2. Resolve sheet
            let sheetName = await context.getCurrentSheet();
            if (arg.sheet !== undefined) {
                if (!filename) {
                    return context.contextualiseResponse({
                        content: [{ type: 'text', text: 'cannot set sheet: no workbook is currently open' }],
                        isError: true
                    });
                }
                const wb = await context.getWorkbook(filename);
                const sheets = sheetNames(wb);
                if (!sheets.includes(arg.sheet)) {
                    return context.contextualiseResponse({
                        content: [{ type: 'text', text: `sheet '${arg.sheet}' not found in workbook '${filename}'. sheets: ${sheets.join(', ')}` }],
                        isError: true
                    });
                }
                sheetName = arg.sheet;
                await context.setCurrentSheet(sheetName);
                changed.push('sheet');
            }

            // 3. Resolve cell
            if (arg.cell !== undefined) {
                if (!filename) {
                    return context.contextualiseResponse({
                        content: [{ type: 'text', text: 'cannot set cell: no workbook is currently open' }],
                        isError: true
                    });
                }
                if (!sheetName) {
                    return context.contextualiseResponse({
                        content: [{ type: 'text', text: 'cannot set cell: no sheet is currently selected' }],
                        isError: true
                    });
                }
                if (!isValidCellRef(arg.cell)) {
                    return context.contextualiseResponse({
                        content: [{ type: 'text', text: `'${arg.cell}' is not a valid A1 cell reference (e.g. "C5")` }],
                        isError: true
                    });
                }
                await context.setCurrentCell(arg.cell);
                changed.push('cell');
            }

            if (changed.length === 0) {
                return context.contextualiseResponse({
                    content: [{ type: 'text', text: 'no context parameters provided; nothing changed' }],
                    structuredContent: {
                        workbook: await context.getCurrentFile(),
                        sheet: await context.getCurrentSheet(),
                        cell: await context.getCurrentCell(),
                        changed: []
                    }
                });
            }

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `context updated: ${changed.join(', ')}` }],
                structuredContent: {
                    workbook: await context.getCurrentFile(),
                    sheet: await context.getCurrentSheet(),
                    cell: await context.getCurrentCell(),
                    changed
                }
            });
        });
    }
}