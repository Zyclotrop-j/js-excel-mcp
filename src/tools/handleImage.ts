import { ToolHandler } from './interface.js';
import { loadImage, addImageAt } from '@office-kit/xlsx/drawing';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import type { Worksheet } from '@office-kit/xlsx/worksheet';
import z from 'zod';
import { Context } from '../filesystem/context.js';
import wretch from 'wretch';
import { retry, dedupe, throttlingCache } from 'wretch/middlewares';

const imageClient = wretch()
    .middlewares([
        retry({
            maxAttempts: 3,
            delayTimer: 500,
            delayRamp: (delay, attempts) => delay * attempts,
            retryOnNetworkError: true,
            until: (response) => !!response && (response.ok || (response.status >= 400 && response.status < 500)),
        }),
        dedupe({
            key: (url, opts) => opts.method + '@' + url,
            resolver: (response) => response.clone(),
        }),
        throttlingCache({
            throttle: 5 * 60 * 1000,
            key: (url, opts) => opts.method + '@' + url,
            condition: (response) => response.ok,
        }),
    ]);

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
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }], isError: true });

            const wb = await context.getWorkbook(filename);

            const sheetName = arg.sheet ?? await context.getCurrentSheet();
            const sheet = wb.sheets.find((s: SheetRef) => s.sheet.title === sheetName);
            if (!sheet || sheet.kind !== 'worksheet') return context.contextualiseResponse({ content: [{ type: 'text', text: `sheet '${sheetName}' not found` }], isError: true });
            const ws: Worksheet = sheet.sheet;

            let bytes: Uint8Array;
            try {
                const buffer = await imageClient
                    .url(arg.imageUrl)
                    .get()
                    .notFound(() => { throw new Error(`could not find the image at '${arg.imageUrl}'. Please verify the URL is correct and the image exists at this location`) })
                    .unauthorized(() => { throw new Error(`authentication required to access '${arg.imageUrl}'. This image may require an API key, login credentials, or access token. Please check if you need to authenticate to access this resource`) })
                    .forbidden(() => { throw new Error(`access denied to '${arg.imageUrl}'. You may not have permission to access this image. Please check if you need special permissions or a different account`) })
                    .timeout(() => { throw new Error(`request timed out while fetching '${arg.imageUrl}'. The server may be slow or unreachable. Please try again in a moment or check if the URL is accessible`) })
                    .fetchError((err) => { throw new Error(`network error while fetching '${arg.imageUrl}': ${err.message}. Please check your internet connection and verify the URL is reachable`) })
                    .error(400, () => { throw new Error(`the server rejected the request for '${arg.imageUrl}' (bad request). The URL may be malformed or the server may not accept this type of request`) })
                    .error(500, () => { throw new Error(`the server hosting '${arg.imageUrl}' encountered an internal error. This is a server-side issue - please try again later or contact the server administrator`) })
                    .error(502, () => { throw new Error(`bad gateway error fetching '${arg.imageUrl}'. The server is temporarily unavailable, likely due to a proxy or gateway issue. Please try again in a moment`) })
                    .error(503, () => { throw new Error(`the service at '${arg.imageUrl}' is temporarily unavailable. The server may be overloaded or down for maintenance. Please try again later`) })
                    .arrayBuffer();
                bytes = new Uint8Array(buffer);
            } catch (err: any) {
                const message = err?.message ?? String(err);
                return context.contextualiseResponse({ content: [{ type: 'text', text: `failed to fetch image: ${message}` }], isError: true });
            }

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
