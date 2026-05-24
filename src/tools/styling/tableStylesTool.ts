import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const tableStylesTool = new FileBasedTool(
    "table_styles",
    "Configure table appearance (theme, stripes, etc.).",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            tableId: z.string(),
            style: z.object({
                table: z.string().optional(),
                tableRowStripes: z.boolean().optional(),
                tableColumnStripes: z.boolean().optional(),
                tableStyleRowStripes: z.boolean().optional(),
                tableStyleColumnStripes: z.boolean().optional(),
                tableStyleLastRow: z.boolean().optional(),
                tableStyleFirstColumn: z.boolean().optional(),
                tableStyleLastColumn: z.boolean().optional()
            })
        }),
        z.object({
            sheet: z.string().nullable(),
            tableId: z.string(),
            style: z.object({
                table: z.string().nullable(),
                tableRowStripes: z.boolean().nullable(),
                tableColumnStripes: z.boolean().nullable(),
                tableStyleRowStripes: z.boolean().nullable(),
                tableStyleColumnStripes: z.boolean().nullable(),
                tableStyleLastRow: z.boolean().nullable(),
                tableStyleFirstColumn: z.boolean().nullable(),
                tableStyleLastColumn: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                tableId: args.tableId,
                style: args.style || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                tableId: value.tableId,
                style: value.style || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            tableId: z.string(),
            style: z.object({
                table: z.string().nullable(),
                tableRowStripes: z.boolean().nullable()
            })
        }),
        z.object({
            message: z.string(),
            tableId: z.string(),
            style: z.object({
                table: z.string().nullable(),
                tableRowStripes: z.boolean().nullable()
            })
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        const worksheet = getWorksheet(cmd.args, workbook);

        const table = worksheet.getTable(cmd.args.tableId);
        if (!table) {
            throw new Error(`Table ${cmd.args.tableId} not found`);
        }

        if (cmd.args.style) {
            if (cmd.args.style.table) table.style = cmd.args.style.table;
            if (cmd.args.style.tableRowStripes !== undefined) table.style.tableRowStripes = cmd.args.style.tableRowStripes;
            if (cmd.args.style.tableColumnStripes !== undefined) table.style.tableColumnStripes = cmd.args.style.tableColumnStripes;
            if (cmd.args.style.tableStyleRowStripes !== undefined) table.style.tableStyleRowStripes = cmd.args.style.tableStyleRowStripes;
            if (cmd.args.style.tableStyleColumnStripes !== undefined) table.style.tableStyleColumnStripes = cmd.args.style.tableStyleColumnStripes;
            if (cmd.args.style.tableStyleLastRow !== undefined) table.style.tableStyleLastRow = cmd.args.style.tableStyleLastRow;
            if (cmd.args.style.tableStyleFirstColumn !== undefined) table.style.tableStyleFirstColumn = cmd.args.style.tableStyleFirstColumn;
            if (cmd.args.style.tableStyleLastColumn !== undefined) table.style.tableStyleLastColumn = cmd.args.style.tableStyleLastColumn;
        }

        return {
            file: workbook,
            output: {
                message: `Table ${cmd.args.tableId} style updated`,
                tableId: cmd.args.tableId,
                style: cmd.args.style
            }
        };
    },
);
