import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const addRowsTool = new FileBasedTool(
    "add_rows",
    "Add rows by key-value, array, or object.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            values: z.array(z.unknown()),
            startRow: z.number().optional(),
            overwrite: z.boolean().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            values: z.array(z.unknown()).nullable(),
            startRow: z.number().nullable(),
            overwrite: z.boolean().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                values: args.values || undefined,
                startRow: args.startRow || null,
                overwrite: args.overwrite !== undefined ? args.overwrite : null,
            }),
            encode: (value) => ({
                values: value.values,
                startRow: value.startRow,
                overwrite: value.overwrite,
                worksheetName: value.worksheetName,
                worksheetId: value.worksheetId
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            rowCount: z.number()
        }),
        z.object({
            message: z.string(),
            rowCount: z.number()
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

        const startRow = cmd.args.startRow || worksheet.rowCount + 1;

        for (let i = 0; i < cmd.args.values.length; i++) {
            worksheet.addRow(cmd.args.values[i], startRow + i);
        }

        return {
            file: workbook,
            output: {
                message: `${cmd.args.values.length} rows added`,
                rowCount: cmd.args.values.length
            }
        };
    },
);