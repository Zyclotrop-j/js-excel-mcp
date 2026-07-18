import { ToolHandler } from './interface.js';
import { addConditionalFormatting, makeConditionalFormatting, makeCfRule, type Worksheet } from '@office-kit/xlsx/worksheet';
import type { SheetRef } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class ConditionalFormatHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('add_color_scale', { description: 'add a 3-color scale conditional formatting rule to a cell range', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string(),
            lowColor: z.string().optional(),
            midColor: z.string().optional(),
            highColor: z.string().optional()
        }), outputSchema: z.object({
            range: z.string().optional(),
            lowColor: z.string().optional(),
            midColor: z.string().optional(),
            highColor: z.string().optional(),
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

            const lowColor = arg.lowColor ?? 'FFF8696B';
            const midColor = arg.midColor ?? 'FFFFEB84';
            const highColor = arg.highColor ?? 'FF63BE7B';

            const innerXml =
                '<colorScale>' +
                '<cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' +
                `<color rgb="${lowColor}"/><color rgb="${midColor}"/><color rgb="${highColor}"/>` +
                '</colorScale>';

            const rule = makeCfRule({ type: 'colorScale', priority: 1, formulas: [], innerXml });
            const cf = makeConditionalFormatting({ sqref: arg.range, rules: [rule] });
            addConditionalFormatting(ws, cf);
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `3-color scale added to range '${arg.range}' (low: ${lowColor}, mid: ${midColor}, high: ${highColor})` }],
                structuredContent: {
                    range: arg.range,
                    lowColor,
                    midColor,
                    highColor
                }
            });
        });

        this.registerTool('add_cell_value_rule', { description: 'add a cell value conditional formatting rule (greater than, less than, equal, between)', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string(),
            operator: z.enum(['greaterThan', 'lessThan', 'equal', 'between']),
            value: z.string(),
            value2: z.string().optional(),
            fillColor: z.string().optional()
        }), outputSchema: z.object({
            range: z.string().optional(),
            operator: z.string().optional(),
            value: z.string().optional(),
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

            const innerXml = arg.operator === 'between' && arg.value2
                ? `<cellIs priority="1" operator="${arg.operator}"><formula>${arg.value}</formula><formula>${arg.value2}</formula></cellIs>`
                : `<cellIs priority="1" operator="${arg.operator}"><formula>${arg.value}</formula></cellIs>`;

            const rule = makeCfRule({ type: 'cellIs', priority: 1, formulas: [], innerXml });
            const cf = makeConditionalFormatting({ sqref: arg.range, rules: [rule] });
            addConditionalFormatting(ws, cf);
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `cell value rule (${arg.operator}) added to range '${arg.range}'` }],
                structuredContent: {
                    range: arg.range,
                    operator: arg.operator,
                    value: arg.value
                }
            });
        });
    }
}
