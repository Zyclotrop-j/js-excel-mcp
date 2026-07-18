import { ToolHandler } from './interface.js';
import { addWorksheet, sheetNames, moveSheet, validateSheetTitle, type SheetRef, type Workbook } from '@office-kit/xlsx/workbook';
import { copyRange, getMaxCol, getMaxRow, type Worksheet } from '@office-kit/xlsx/worksheet';
import { columnLetterFromIndex } from '@office-kit/xlsx/utils';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class SheetOpsHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('copy_sheet', { description: 'duplicate a worksheet in a workbook', inputSchema: z.object({
            workbook: z.string().optional(),
            sourceSheet: z.string().optional(),
            newName: z.string()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sourceSheet: z.string().optional(),
            newName: z.string().optional(),
            action: z.literal('copied').optional(),
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

            const sourceName = arg.sourceSheet ?? await context.getCurrentSheet();
            if (!sourceName) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no source sheet specified and no current sheet set' }], isError: true });

            const wb = await context.getWorkbook(filename);
            const sourceSheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sourceName);
            if (!sourceSheet || sourceSheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `source sheet '${sourceName}' not found` }], isError: true });
            const sourceWs: Worksheet = sourceSheet.sheet;

            if (wb.sheets.find((s: SheetRef) => s.sheet.title === arg.newName)) {
                return context.contextualiseResponse({
                    content: [{ type: 'text', text: `sheet '${arg.newName}' already exists in workbook '${filename}'` }],
                    isError: true,
                    structuredContent: {
                        filename,
                        newName: arg.newName,
                        sheets: sheetNames(wb)
                    }
                });
            }

            const titleReason = validateSheetTitle(arg.newName);
            if (titleReason) {
                return context.contextualiseResponse({
                    content: [{ type: 'text', text: `invalid sheet name '${arg.newName}': ${titleReason}` }],
                    isError: true,
                    structuredContent: {
                        filename,
                        newName: arg.newName,
                        sheets: sheetNames(wb)
                    }
                });
            }

            addWorksheet(wb, arg.newName);
            const newSheet = wb.sheets.find((s: SheetRef) => s.sheet.title === arg.newName);
            if (!newSheet || newSheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `failed to create new sheet '${arg.newName}'` }], isError: true });
            const targetWs: Worksheet = newSheet.sheet;

            // copyRange shallow-clones every populated cell's `value` + `styleId`
            // across sheets; since both sheets share this workbook's stylesheet
            // pool (cellXfs — font/fill/border/alignment/numberFormat), formulas
            // and styles survive intact. Comments / hyperlinks are NOT carried by
            // copyRange — see office-kit's copyRange doc.
            const maxRow = getMaxRow(sourceWs);
            const maxCol = getMaxCol(sourceWs);
            if (maxRow > 0 && maxCol > 0) {
                copyRange(sourceWs, `A1:${columnLetterFromIndex(maxCol)}${maxRow}`, 'A1', { targetWs: targetWs });
            }

            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheet '${sourceName}' copied to '${arg.newName}' in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sourceSheet: sourceName,
                    newName: arg.newName,
                    action: 'copied',
                    sheets: sheetNames(wb)
                }
            });
        });

        this.registerTool('move_sheet', { description: 'move a worksheet to a different position in the workbook order', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            newIndex: z.number()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            newIndex: z.number().optional(),
            action: z.literal('moved').optional(),
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

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            if (!sheetName) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no sheet specified and no current sheet set' }], isError: true });

            const wb = await context.getWorkbook(filename);
            const names = sheetNames(wb);
            if (!names.includes(sheetName)) return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            if (arg.newIndex < 0 || arg.newIndex >= names.length) return context.contextualiseResponse({ content: [{ type: 'text', text: `index ${arg.newIndex} is out of range (0-${names.length - 1})` }], isError: true });

            moveSheet(wb, sheetName, arg.newIndex);
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `sheet '${sheetName}' moved to index ${arg.newIndex} in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    newIndex: arg.newIndex,
                    action: 'moved',
                    sheets: sheetNames(wb)
                }
            });
        });
    }
}
