import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const sheetProtectionTool = new FileBasedTool(
    "sheet_protection",
    "Protect worksheets with passwords and configure permissions.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            password: z.string().optional(),
            options: z.object({
                sheet: z.boolean().optional(),
                formatCells: z.boolean().optional(),
                formatColumns: z.boolean().optional(),
                formatRows: z.boolean().optional(),
                insertColumns: z.boolean().optional(),
                insertRows: z.boolean().optional(),
                insertHyperlinks: z.boolean().optional(),
                deleteColumns: z.boolean().optional(),
                deleteRows: z.boolean().optional(),
                sort: z.boolean().optional(),
                autoFilter: z.boolean().optional(),
                pivotTables: z.boolean().optional(),
                selectLockedCells: z.boolean().optional(),
                selectUnlockedCells: z.boolean().optional()
            })
        }),
        z.object({
            sheet: z.boolean().nullable(),
            options: z.object({
                sheet: z.boolean().nullable(),
                formatCells: z.boolean().nullable(),
                formatColumns: z.boolean().nullable(),
                formatRows: z.boolean().nullable(),
                insertColumns: z.boolean().nullable(),
                insertRows: z.boolean().nullable(),
                insertHyperlinks: z.boolean().nullable(),
                deleteColumns: z.boolean().nullable(),
                deleteRows: z.boolean().nullable(),
                sort: z.boolean().nullable(),
                autoFilter: z.boolean().nullable(),
                pivotTables: z.boolean().nullable(),
                selectLockedCells: z.boolean().nullable(),
                selectUnlockedCells: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                password: args.password || null,
                options: args.options || null
            }),
            encode: (value) => ({
                password: value.password || undefined,
                options: value.options || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            protected: z.boolean()
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            protected: z.boolean()
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

        worksheet.protect(cmd.args.password, cmd.args.options);

        return {
            file: workbook,
            output: {
                message: `Worksheet "${worksheet.name}" is now protected`,
                worksheetName: worksheet.name,
                protected: true
            }
        };
    },
);