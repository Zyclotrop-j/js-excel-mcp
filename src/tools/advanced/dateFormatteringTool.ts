import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import * as ExcelJS from "exceljs";

export const dateFormatteringTool = new FileBasedTool(
    "date_formatting",
    "Custom date/time formatting for CSV operations.",
    z.codec(
        z.object({
            format: z.string(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            format: z.string(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                format: args.format,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                format: value.format,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            format: z.string()
        }),
        z.object({
            message: z.string(),
            format: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const args = cmd.args;
        // @ts-ignore - utils property may not exist in all ExcelJS versions
        if (ExcelJS.utils && ExcelJS.utils.dateNF) {
            ExcelJS.utils.dateNF = args.format;
        }

        return {
            file: cmd.file,
            output: {
                message: `Date format set to ${args.format}`,
                format: args.format
            }
        };
    },
);