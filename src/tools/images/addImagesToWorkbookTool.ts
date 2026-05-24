import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const addImagesToWorkbookTool = new FileBasedTool(
    "add_images_to_workbook",
    "Register images with workbook by filename or buffer.",
    z.codec(
        z.object({
            image: z.union([z.string(), z.buffer()]),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            image: z.union([z.string(), z.buffer()]).nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                image: args.image || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                image: value.image,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            imageId: z.number()
        }),
        z.object({
            message: z.string(),
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

        let imageData;
        if (typeof cmd.args.image === 'string') {
            const fs = require('fs');
            const buffer = fs.readFileSync(cmd.args.image);
            imageData = buffer;
        } else {
            imageData = Buffer.from(cmd.args.image);
        }

        const imageId = workbook.addImage(imageData);

        return {
            file: workbook,
            output: {
                message: `Image registered with ID ${imageId}`,
                imageId
            }
        };
    },
);