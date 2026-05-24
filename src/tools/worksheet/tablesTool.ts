import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const tablesTool = new FileBasedTool(
    "tables",
    "Create and manage Excel tables with headers, totals, and styles.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            name: z.string(),
            ref: z.string(),
            headerRow: z.boolean().optional(),
            totalRow: z.boolean().optional(),
            style: z.string().optional(),
            columns: z.array(z.object({
                header: z.string(),
                key: z.string(),
                totalsRowFunction: z.string().optional(),
                totalsRowLabel: z.string().optional()
            })).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            name: z.string(),
            ref: z.string(),
            headerRow: z.boolean().nullable(),
            totalRow: z.boolean().nullable(),
            style: z.string().nullable(),
            columns: z.array(z.object({
                header: z.string(),
                key: z.string(),
                totalsRowFunction: z.string().nullable(),
                totalsRowLabel: z.string().nullable()
            })).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                name: args.name,
                ref: args.ref,
                headerRow: args.headerRow !== undefined ? args.headerRow : null,
                totalRow: args.totalRow !== undefined ? args.totalRow : null,
                style: args.style || null,
                columns: args.columns || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                name: value.name,
                ref: value.ref,
                headerRow: value.headerRow,
                totalRow: value.totalRow,
                style: value.style,
                columns: value.columns,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            tableId: z.string(),
            name: z.string()
        }),
        z.object({
            message: z.string(),
            tableId: z.string(),
            name: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        const worksheet = getWorksheet(cmd.args, workbook, false);

        const table = worksheet.addTable({
            name: cmd.args.name,
            ref: cmd.args.ref,
            headerRow: cmd.args.headerRow,
            totalRow: cmd.args.totalRow,
            style: cmd.args.style,
            columns: cmd.args.columns
        });

        return {
            file: workbook,
            output: {
                message: `Table created`,
                tableId: table.id,
                name: table.name
            }
        };
    },
);