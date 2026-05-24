import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const mergeCellTool = new FileBasedTool(
    "merge_cell",
    "Access merged cell values.",
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
            range: z.string(),
            value: z.unknown()
        }),
        z.object({
            message: z.string(),
            range: z.string(),
            value: z.unknown()
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

        // Check if range is merged
        const mergedRange = worksheet.getMergedCells().find(mc => mc.s.row === mc.e.row && mc.s.col === mc.e.col);

        if (!mergedRange) {
            throw new Error(`Range ${cmd.args.range} is not merged`);
        }

        const cell = worksheet.getCell(mergedRange.s.row, mergedRange.s.col);

        return {
            file: workbook,
            output: {
                message: `Merged cell value retrieved`,
                range: cmd.args.range,
                value: cell.value
            }
        };
    },
);