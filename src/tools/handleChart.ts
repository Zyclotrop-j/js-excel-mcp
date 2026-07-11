import { ToolHandler } from './interface.js';
import { type SheetRef } from '@office-kit/xlsx/workbook';
import type { Worksheet } from '@office-kit/xlsx/worksheet';
import { makeBarChart, makeBarSeries, makeChartSpace, makeLineChart, type LineSeries } from '@office-kit/xlsx/chart';
import { addChartAt } from '@office-kit/xlsx/drawing';
import z from 'zod';
import { Context } from '../filesystem/context.js';

export class ChartHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('add_bar_chart', { description: 'add a clustered column/bar chart to a worksheet', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            dataRange: z.string(),
            anchorCell: z.string(),
            title: z.string().optional(),
            widthPx: z.number().optional(),
            heightPx: z.number().optional(),
            barDir: z.enum(['col', 'row']).optional(),
            grouping: z.enum(['clustered', 'stacked', 'percentStacked']).optional()
        }), outputSchema: z.object({
            anchorCell: z.string().optional(),
            title: z.string().optional(),
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

            const parts = arg.dataRange.split(':');
            const startRef = parts[0];
            const endRef = parts[1] ?? startRef;

            const startMatch = startRef.match(/^([A-Z]+)(\d+)$/);
            const endMatch = endRef.match(/^([A-Z]+)(\d+)$/);
            if (!startMatch || !endMatch) return context.contextualiseResponse({ content: [{ type: 'text', text: 'invalid dataRange format' }] });

            const startRow = parseInt(startMatch[2]);
            const endRow = parseInt(endMatch[2]);
            const catCol = startMatch[1];
            const valCol = String.fromCharCode(catCol.charCodeAt(0) + 1);

            const series = makeBarSeries({
                idx: 0,
                tx: { kind: 'literal', value: arg.title ?? 'Series' },
                cat: { ref: sheetName + '!$' + catCol + '$' + startRow + ':$' + catCol + '$' + endRow },
                val: { ref: sheetName + '!$' + valCol + '$' + startRow + ':$' + valCol + '$' + endRow }
            });

            const chart = makeBarChart({
                barDir: arg.barDir ?? 'col',
                grouping: arg.grouping ?? 'clustered',
                series: [series]
            });

            const space = makeChartSpace({
                plotArea: { chart },
                title: arg.title,
                legend: { position: 'r' }
            });

            addChartAt(ws, arg.anchorCell, { space }, { widthPx: arg.widthPx ?? 480, heightPx: arg.heightPx ?? 320 });
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `bar chart added at '${arg.anchorCell}'` }],
                structuredContent: { anchorCell: arg.anchorCell, title: arg.title }
            });
        });

        this.registerTool('add_line_chart', { description: 'add a line chart to a worksheet', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            dataRange: z.string(),
            anchorCell: z.string(),
            title: z.string().optional(),
            widthPx: z.number().optional(),
            heightPx: z.number().optional(),
            smooth: z.boolean().optional()
        }), outputSchema: z.object({
            anchorCell: z.string().optional(),
            title: z.string().optional(),
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

            const parts = arg.dataRange.split(':');
            const startRef = parts[0];
            const endRef = parts[1] ?? startRef;

            const startMatch = startRef.match(/^([A-Z]+)(\d+)$/);
            const endMatch = endRef.match(/^([A-Z]+)(\d+)$/);
            if (!startMatch || !endMatch) return context.contextualiseResponse({ content: [{ type: 'text', text: 'invalid dataRange format' }] });

            const startRow = parseInt(startMatch[2]);
            const endRow = parseInt(endMatch[2]);
            const catCol = startMatch[1];
            const valCol = String.fromCharCode(catCol.charCodeAt(0) + 1);

            const series = makeBarSeries({
                idx: 0,
                tx: { kind: 'literal', value: arg.title ?? 'Series' },
                cat: { ref: sheetName + '!$' + catCol + '$' + startRow + ':$' + catCol + '$' + endRow },
                val: { ref: sheetName + '!$' + valCol + '$' + startRow + ':$' + valCol + '$' + endRow }
            }) as LineSeries;

            const chart = makeLineChart({
                series: [series],
                smooth: arg.smooth
            });

            const space = makeChartSpace({
                plotArea: { chart },
                title: arg.title,
                legend: { position: 'r' }
            });

            addChartAt(ws, arg.anchorCell, { space }, { widthPx: arg.widthPx ?? 480, heightPx: arg.heightPx ?? 320 });
            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `line chart added at '${arg.anchorCell}'` }],
                structuredContent: { anchorCell: arg.anchorCell, title: arg.title }
            });
        });
    }
}
