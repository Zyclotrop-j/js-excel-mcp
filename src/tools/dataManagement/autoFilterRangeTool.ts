import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const autoFilterRangeTool = new FileBasedTool(
    "auto_filter_range",
    "Set filter ranges for data.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            range: z.string()
        }),
        z.object({
            sheet: z.string().nullable(),
            range: z.string(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                range: args.range,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                range: value.range,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            range: z.string()
        }),
        z.object({
            message: z.string(),
            range: z.string()
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

        if (!worksheet) {
            throw new Error(`Worksheet not found`);
        }

        worksheet.autoFilter = cmd.args.range;

        return {
            file: workbook,
            output: {
                message: `Auto filter set to range ${cmd.args.range}`,
                range: cmd.args.range
            }
        };
    },
);