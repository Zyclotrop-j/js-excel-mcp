import { ToolHandler } from './interface.js';
import { addDefinedName, removeDefinedName } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class NamedRangeHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('add_named_range', { description: 'define a named range on the workbook', inputSchema: z.object({
            workbook: z.string().optional(),
            name: z.string(),
            range: z.string()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            name: z.string().optional(),
            range: z.string().optional(),
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

            let range = arg.range;
            if (!range.includes('!')) {
                const currentSheet = await context.getCurrentSheet();
                if (!currentSheet) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no sheet specified and no current sheet set' }] });
                range = `${currentSheet}!${range}`;
            }

            addDefinedName(wb, { name: arg.name, value: range });
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `named range '${arg.name}' defined as '${range}' in workbook '${filename}'` }],
                structuredContent: { filename, name: arg.name, range }
            });
        });

        this.registerTool('delete_named_range', { description: 'remove a defined name from the workbook', inputSchema: z.object({
            workbook: z.string().optional(),
            name: z.string()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            name: z.string().optional(),
            action: z.literal('deleted'),
            context: context.contextualiseResponseTypes()
        }), annotations: {
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
            readOnlyHint: false
        }}, async (arg) => {
            const filename = arg.workbook ?? await context.getCurrentFile();
            if (!filename) return context.contextualiseResponse({ content: [{ type: 'text', text: 'no workbook is currently open' }] });

            const wb = await context.getWorkbook(filename);
            const removed = removeDefinedName(wb, arg.name);
            if (!removed) return context.contextualiseResponse({ content: [{ type: 'text', text: `named range '${arg.name}' not found` }] });
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `named range '${arg.name}' deleted from workbook '${filename}'` }],
                structuredContent: { filename, name: arg.name, action: 'deleted' }
            });
        });
    }
}
