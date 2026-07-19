import { ToolHandler } from './interface.js';
import { addExcelTable, makeAutoFilter, setAutoFilter, getAutoFilter, listTables, type Worksheet } from '@office-kit/xlsx/worksheet';
import { rangeBoundaries } from '@office-kit/xlsx/utils';
import { rangesOverlap } from '@office-kit/xlsx/worksheet';
import type { SheetRef, Workbook } from '@office-kit/xlsx/workbook';
import z from 'zod';
import { Context } from '../filesystem/context.js';

/** True iff `a` and `b` (A1 range strings) share at least one cell. */
function overlaps(a: string, b: string): boolean {
    return rangesOverlap(rangeBoundaries(a), rangeBoundaries(b));
}

export class TableHandler extends ToolHandler {
    async register(allTools: ToolHandler[]): Promise<void> {
        this.toolSet = allTools;

        const context = await Context.getContext((this.context.authInfo?.extra?.userId as string) ?? 'public');

        this.registerTool('create_excel_table', { description: 'promote a range to an Excel table', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string(),
            name: z.string(),
            columns: z.array(z.string()),
            style: z.string().optional()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            name: z.string().optional(),
            range: z.string().optional(),
            action: z.literal('created').optional(),
            clearedAutoFilter: z.boolean().optional(),
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

            // Reject if an existing table overlaps the requested range — Excel
            // repairs files with two tables sharing cells by dropping one.
            for (const t of listTables(ws)) {
                if (overlaps(t.ref, arg.range)) {
                    return context.contextualiseResponse({
                        content: [{ type: 'text', text: `table '${t.displayName}' already covers range '${t.ref}' which overlaps the requested range '${arg.range}'. Pick a non-overlapping range or delete the existing table first.` }],
                        isError: true
                    });
                }
            }

            // Clear a sheet-level autoFilter that overlaps the table range —
            // Excel treats a sheet-level autoFilter on the same range as a
            // table as a conflict and removes the table during repair. Tables
            // carry their own filter dropdowns, so the sheet-level one is
            // redundant.
            const existingAutoFilter = getAutoFilter(ws);
            let clearedAutoFilter = false;
            if (existingAutoFilter && overlaps(existingAutoFilter.ref, arg.range)) {
                setAutoFilter(ws, undefined);
                clearedAutoFilter = true;
            }

            addExcelTable(wb, ws, { name: arg.name, ref: arg.range, columns: arg.columns, style: arg.style });

            await context.setWorkbook(filename, wb);

            const note = clearedAutoFilter
                ? ` (also cleared a redundant sheet-level autoFilter overlapping '${arg.range}' — tables carry their own filter)`
                : '';
            return context.contextualiseResponse({
                content: [{ type: 'text', text: `table '${arg.name}' created in range '${arg.range}' on sheet '${sheetName}' in workbook '${filename}'${note}` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    name: arg.name,
                    range: arg.range,
                    action: 'created',
                    ...(clearedAutoFilter ? { clearedAutoFilter: true } : {})
                }
            });
        });

        this.registerTool('add_autofilter', { description: 'add filter dropdown arrows to a header row range', inputSchema: z.object({
            workbook: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string()
        }), outputSchema: z.object({
            filename: z.string().optional(),
            sheet: z.string().optional(),
            range: z.string().optional(),
            action: z.enum(['added', 'skipped']).optional(),
            reason: z.string().optional(),
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

            // Skip silently if a table already overlaps this range — Excel
            // treats a sheet-level autoFilter and a table on the same range
            // as a conflict and repairs by removing the table. Tables carry
            // their own filter dropdowns, so the sheet-level autoFilter is
            // redundant anyway. Return success with `action: 'skipped'` and a
            // reason so the caller can tell what happened.
            for (const t of listTables(ws)) {
                if (overlaps(t.ref, arg.range)) {
                    return context.contextualiseResponse({
                        content: [{ type: 'text', text: `autoFilter skipped on range '${arg.range}' on sheet '${sheetName}' in workbook '${filename}': table '${t.displayName}' already covers '${t.ref}' and provides its own filter dropdowns.` }],
                        structuredContent: {
                            filename,
                            sheet: sheetName,
                            range: arg.range,
                            action: 'skipped',
                            reason: `overlaps_table:${t.displayName}`
                        }
                    });
                }
            }

            ws.autoFilter = makeAutoFilter({ ref: arg.range });

            await context.setWorkbook(filename, wb);

            return context.contextualiseResponse({
                content: [{ type: 'text', text: `autofilter added on range '${arg.range}' on sheet '${sheetName}' in workbook '${filename}'` }],
                structuredContent: {
                    filename,
                    sheet: sheetName,
                    range: arg.range,
                    action: 'added'
                }
            });
        });
    }
}
