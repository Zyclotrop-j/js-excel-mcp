import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const backgroundImagesTool = new FileBasedTool(
    "background_images",
    "Set worksheet background images.",
    z.codec(
        z.object({
            imageId: z.number(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            imageId: z.number()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                imageId: args.imageId,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                imageId: value.imageId,
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

        worksheet.background = {
            image: cmd.args.imageId,
            transparency: 0
        };

        return {
            file: workbook,
            output: {
                message: `Background image ${cmd.args.imageId} set for worksheet "${worksheet.name}"`,
                worksheetName: worksheet.name,
                imageId: cmd.args.imageId
            }
        };
    },
);