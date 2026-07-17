import { ToolHandler } from './interface.js';
import { getCell, getCellByCoord, setCell, type Worksheet } from '@office-kit/xlsx/worksheet';
import { makeRichText, makeTextRun, getCoordinate } from '@office-kit/xlsx/cell';
import { setBold, setFontSize, setFontColor, setItalic, setUnderline } from '@office-kit/xlsx/styles';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import { tupleToCoordinate } from '@office-kit/xlsx/utils';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class RichTextHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('set_rich_text', { description: 'set rich text on a cell with different formatting for each text run', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            parts: z.array(z.object({
                text: z.string(),
                bold: z.boolean().optional(),
                italic: z.boolean().optional(),
                underline: z.boolean().optional(),
                fontSize: z.number().optional(),
                fontColor: z.string().optional(),
                fontName: z.string().optional()
            }))
        }), outputSchema: z.object({
            ref: z.string().optional(),
            runCount: z.number().optional(),
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
            let row: number;
            let col: number;
            if (arg.ref) {
                cellRef = arg.ref;
                const m = cellRef.match(/^([A-Z]+)(\d+)$/);
                row = parseInt(m![2]);
                col = m![1].split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
            } else if (arg.row !== undefined && arg.col !== undefined) {
                row = arg.row;
                col = arg.col;
                cellRef = tupleToCoordinate(col, row);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }] });
                cellRef = currentCell;
                const m = cellRef.match(/^([A-Z]+)(\d+)$/);
                row = parseInt(m![2]);
                col = m![1].split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
            }

            const runs = arg.parts.map((p) => {
                const run = makeTextRun({ text: p.text });
                if (run.font) {
                    if (p.bold) run.font.bold = true;
                    if (p.italic) run.font.italic = true;
                    if (p.underline) run.font.underline = 'single';
                    if (p.fontSize !== undefined) run.font.size = p.fontSize;
                    if (p.fontColor) run.font.color = p.fontColor.startsWith('FF') ? p.fontColor : `FF${p.fontColor}`;
                    if (p.fontName) run.font.name = p.fontName;
                }
                return run;
            });

            const richText = makeRichText(runs);
            const cell = setCell(ws, row, col, richText);

            await context.setWorkbook(filename, wb);
            const ref = getCoordinate(cell);
            await context.setCurrentCell(ref);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `rich text with ${arg.parts.length} runs set on cell ${ref}` }],
                structuredContent: { ref, runCount: arg.parts.length }
            });
        });
    }
}
