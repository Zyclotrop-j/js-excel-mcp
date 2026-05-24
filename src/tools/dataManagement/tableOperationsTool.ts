import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const tableOperationsTool = new FileBasedTool(
    "table_operations",
    "Add, modify, and manage Excel tables.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            tableId: z.string().optional(),
            name: z.string().optional(),
            ref: z.string().optional(),
            headerRow: z.boolean().optional(),
            totalRow: z.boolean().optional(),
            style: z.string().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            tableId: z.string().nullable(),
            name: z.string().nullable(),
            ref: z.string().nullable(),
            headerRow: z.boolean().nullable(),
            totalRow: z.boolean().nullable(),
            style: z.string().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                tableId: args.tableId || null,
                name: args.name || null,
                ref: args.ref || null,
                headerRow: args.headerRow != undefined ? args.headerRow : null,
                totalRow: args.totalRow != undefined ? args.totalRow : null,
                style: args.style || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                tableId: value.tableId || undefined,
                name: value.name || undefined,
                ref: value.ref || undefined,
                headerRow: value.headerRow !== null ? value.headerRow : undefined,
                totalRow: value.totalRow !== null ? value.totalRow : undefined,
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
        const worksheet = getWorksheet(cmd.args, workbook);

        const table = worksheet.addTable({
            name: cmd.args.name,
            ref: cmd.args.ref,
            headerRow: cmd.args.headerRow,
            totalRow: cmd.args.totalRow,
            style: cmd.args.style
        });

        return {
            file: workbook,
            output: {
                message: `Table created successfully`,
                tableId: table.id,
                name: table.name
            }
        };
    },
);
