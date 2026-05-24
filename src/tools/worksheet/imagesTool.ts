import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const imagesTool = new FileBasedTool(
    "images",
    "Add images as backgrounds or over cell ranges.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            imageId: z.number(),
            action: z.enum(["add", "remove", "position"]),
            options: z.object({
                tl: z.object({
                    col: z.number(),
                    row: z.number()
                }).optional(),
                br: z.object({
                    col: z.number(),
                    row: z.number()
                }).optional(),
                editAs: z.string().optional(),
                hidden: z.boolean().optional()
            }).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            imageId: z.number(),
            action: z.enum(["add", "remove", "position"]).nullable(),
            options: z.object({
                tl: z.object({
                    col: z.number().nullable(),
                    row: z.number().nullable()
                }).nullable(),
                br: z.object({
                    col: z.number().nullable(),
                    row: z.number().nullable()
                }).nullable(),
                editAs: z.string().nullable(),
                hidden: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                imageId: args.imageId,
                action: args.action || null,
                options: args.options || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                imageId: value.imageId,
                action: value.action,
                options: value.options,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            imageId: z.number(),
            action: z.string()
        }),
        z.object({
            message: z.string(),
            imageId: z.number(),
            action: z.string()
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

        const action = cmd.args.action;
        const imageId = cmd.args.imageId;

        if (action === "add") {
            const image = workbook.getImage(imageId);
            if (cmd.args.options) {
                image.position = cmd.args.options;
            }
            worksheet.addImage(image);
            return {
                file: workbook,
                output: { message: `Image ${imageId} added`, imageId, action: "add" }
            };
        } else if (action === "remove") {
            worksheet.removeImage(imageId);
            return {
                file: workbook,
                output: { message: `Image ${imageId} removed`, imageId, action: "remove" }
            };
        } else if (action === "position") {
            const image = workbook.getImage(imageId);
            if (cmd.args.options) {
                image.position = cmd.args.options;
            }
            return {
                file: workbook,
                output: { message: `Image ${imageId} positioned`, imageId, action: "position" }
            };
        }

        throw new Error(`Unknown action: ${action}`);
    },
);