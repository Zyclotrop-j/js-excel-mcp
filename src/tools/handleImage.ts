import { ToolHandler } from './interface.js';
import { loadImage, addImageAt } from '@office-kit/xlsx/drawing';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import type { Worksheet } from '@office-kit/xlsx/worksheet';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class ImageHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('insert_image', { description: 'fetch an image from a URL and insert it into a worksheet at a cell anchor', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            anchorCell: z.string(),
            imageUrl: z.string(),
            widthPx: z.number().optional(),
            heightPx: z.number().optional()
        }), outputSchema: z.object({
            anchorCell: z.string().optional(),
            widthPx: z.number().optional(),
            heightPx: z.number().optional(),
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

            const response = await fetch(arg.imageUrl);
            if (!response.ok) return context.contextualiseResponse({ content: [{ type: 'text', text: `failed to fetch image: ${response.status} ${response.statusText}` }] });
            const bytes = new Uint8Array(await response.arrayBuffer());

            const image = loadImage(bytes);
            const w = arg.widthPx ?? (image.width > 0 ? image.width : 200);
            const h = arg.heightPx ?? (image.height > 0 ? image.height : 200);

            addImageAt(ws, arg.anchorCell, image, { widthPx: w, heightPx: h });
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `image inserted at ${arg.anchorCell} (${w}x${h}px)` }],
                structuredContent: { anchorCell: arg.anchorCell, widthPx: w, heightPx: h }
            });
        });
    }
}
