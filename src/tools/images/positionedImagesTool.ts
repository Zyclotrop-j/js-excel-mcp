import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const positionedImagesTool = new FileBasedTool(
    "positioned_images",
    "Add images with custom positioning.",
    z.codec(
        z.object({
            imageId: z.number(),
            x: z.number(),
            y: z.number(),
            width: z.number().optional(),
            height: z.number().optional(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            imageId: z.number(),
            x: z.number(),
            y: z.number(),
            width: z.number().nullable(),
            height: z.number().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                imageId: args.imageId,
                x: args.x,
                y: args.y,
                width: args.width || null,
                height: args.height || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                imageId: value.imageId,
                x: value.x,
                y: value.y,
                width: value.width,
                height: value.height,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            imageId: z.number(),
            worksheetName: z.string()
        }),
        z.object({
            message: z.string(),
            imageId: z.number(),
            worksheetName: z.string()
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

        const image = worksheet.addImage(cmd.args.imageId, {
            x: cmd.args.x,
            y: cmd.args.y,
            width: cmd.args.width,
            height: cmd.args.height
        });

        return {
            file: workbook,
            output: {
                message: `Image ${cmd.args.imageId} positioned at (${cmd.args.x}, ${cmd.args.y}) in worksheet "${worksheet.name}"`,
                worksheetName: worksheet.name,
                imageId: cmd.args.imageId
            }
        };
    },
);