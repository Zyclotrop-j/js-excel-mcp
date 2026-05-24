import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const cellRangeImagesTool = new FileBasedTool(
    "cell_range_images",
    "Add images over cell ranges.",
    z.codec(
        z.object({
            imageId: z.number(),
            range: z.string(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            imageId: z.number(),
            range: z.string()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                imageId: args.imageId,
                range: args.range,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                imageId: value.imageId,
                range: value.range,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            imageId: z.number()
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            imageId: z.number()
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

        const range = cmd.args.range.split(':');
        const row = Number(range[0].replace(/[A-Z]/g, ''));
        const col = range[0].replace(/[0-9]/g, '').charCodeAt(0) - 64;
        const row2 = Number(range[1].replace(/[A-Z]/g, ''));
        const col2 = range[1].replace(/[0-9]/g, '').charCodeAt(0) - 64;

        const image = worksheet.addImage(cmd.args.imageId, {
            tl: { row, col },
            br: { row: row2, col: col2 }
        });

        return {
            file: workbook,
            output: {
                message: `Image ${cmd.args.imageId} added over range ${cmd.args.range} in worksheet "${worksheet.name}"`,
                worksheetName: worksheet.name,
                imageId: cmd.args.imageId
            }
        };
    },
);