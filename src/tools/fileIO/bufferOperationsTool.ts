import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const bufferOperationsTool = new FileBasedTool(
    "buffer_operations",
    "Load from and write to buffers.",
    z.codec(
        z.object({
            action: z.enum(["read", "write"]),
            buffer: z.string().optional(),
            filename: z.string().optional(),
            options: z.object({
                compression: z.string().optional()
            }).optional()
        }),
        z.object({
            action: z.enum(["read", "write"]).nullable(),
            buffer: z.string().nullable(),
            filename: z.string().nullable(),
            options: z.object({
                compression: z.string().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                action: args.action || null,
                buffer: args.buffer || null,
                filename: args.filename || null,
                options: args.options || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                action: value.action || undefined,
                buffer: value.buffer || undefined,
                filename: value.filename || undefined,
                options: value.options || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            action: z.string()
        }),
        z.object({
            message: z.string(),
            action: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const args = cmd.args;
        
        if (args.action === "read") {
            const buffer = Buffer.from(args.buffer, 'base64');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);
            return {
                file: workbook,
                output: { message: `Buffer loaded`, action: "read" }
            };
        } else {
            const workbook = cmd.file;
            const buffer = await workbook.xlsx.writeBuffer();
            return {
                file: workbook,
                output: { 
                    message: `Buffer written`, 
                    action: "write",
                    buffer: buffer.toString('base64')
                }
            };
        }
    },
);