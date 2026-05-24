import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const imageAnchoringTool = new FileBasedTool(
    "image_anchoring",
    "Control image movement with cells.",
    z.codec(
        z.object({
            imageId: z.number(),
            type: z.enum(['none', 'oneCell', 'twoCell', 'threeCell']),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            imageId: z.number(),
            type: z.enum(['none', 'oneCell', 'twoCell', 'threeCell'])
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                imageId: args.imageId,
                type: args.type,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                imageId: value.imageId,
                type: value.type,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            imageId: z.number(),
            type: z.string()
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            imageId: z.number(),
            type: z.string()
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
        image.alignment = cmd.args.type;

        return {
            file: workbook,
            output: {
                message: `Image ${cmd.args.imageId} anchored with type ${cmd.args.type} in worksheet "${worksheet.name}"`,
                worksheetName: worksheet.name,
                imageId: cmd.args.imageId,
                type: cmd.args.type
            }
        };
    },
);