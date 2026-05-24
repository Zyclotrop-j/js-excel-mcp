import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const imageHyperlinksTool = new FileBasedTool(
    "image_hyperlinks",
    "Add hyperlinks to images.",
    z.codec(
        z.object({
            imageId: z.number(),
            hyperlink: z.string(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            imageId: z.number(),
            hyperlink: z.string()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                imageId: args.imageId,
                hyperlink: args.hyperlink,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                imageId: value.imageId,
                hyperlink: value.hyperlink,
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

        const image = worksheet.addImage(cmd.args.imageId);
        image.hyperlink = cmd.args.hyperlink;

        return {
            file: workbook,
            output: {
                message: `Hyperlink ${cmd.args.hyperlink} added to image ${cmd.args.imageId} in worksheet "${worksheet.name}"`,
                worksheetName: worksheet.name,
                imageId: cmd.args.imageId
            }
        };
    },
);