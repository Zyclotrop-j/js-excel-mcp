import { ToolHandler } from './interface.js';
import { setHyperlink, type Worksheet } from '@office-kit/xlsx/worksheet';
import type { SheetRef, Workbook } from '@office-kit/xlsx/workbook';
import { tupleToCoordinate } from '@office-kit/xlsx/utils';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class HyperlinkHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('set_cell_hyperlink', { description: 'set a hyperlink on a cell', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            ref: z.string().optional(),
            row: z.number().optional(),
            col: z.number().optional(),
            url: z.string(),
            tooltip: z.string().optional(),
            display: z.string().optional()
        }), outputSchema: z.object({
            ref: z.string().optional(),
            url: z.string().optional(),
            display: z.string().optional(),
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

            let cellRef: string;
            if (arg.ref) {
                cellRef = arg.ref;
            } else if (arg.row !== undefined && arg.col !== undefined) {
                cellRef = tupleToCoordinate(arg.col, arg.row);
            } else {
                const currentCell = await context.getCurrentCell();
                if (!currentCell) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no cell reference specified and no current cell set' }], isError: true });
                cellRef = currentCell;
            }

            const hyperlink = setHyperlink(ws, cellRef, {
                target: arg.url,
                tooltip: arg.tooltip,
                display: arg.display
            });

            await context.setWorkbook(filename, wb);
            await context.setCurrentCell(cellRef);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `hyperlink set on cell ${cellRef} -> ${arg.url}` }],
                structuredContent: { ref: cellRef, url: arg.url, display: arg.display }
            });
        });
    }
}
