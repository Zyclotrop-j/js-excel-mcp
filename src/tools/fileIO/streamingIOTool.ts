import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const streamingIOTool = new FileBasedTool(
    "streaming_io",
    "Memory-efficient file handling for large workbooks.",
    z.codec(
        z.object({
            filename: z.string(),
            mode: z.enum(["read", "write"]),
            options: z.object({
                bufferRows: z.number().optional()
            }).optional()
        }),
        z.object({
            filename: z.string(),
            mode: z.enum(["read", "write"]).nullable(),
            options: z.object({
                bufferRows: z.number().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                filename: args.filename,
                mode: args.mode || null,
                options: args.options || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                filename: value.filename,
                mode: value.mode || undefined,
                options: value.options || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            mode: z.string()
        }),
        z.object({
            message: z.string(),
            mode: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const args = cmd.args;
        
        if (args.mode === "read") {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(args.filename, {
                bufferRows: args.options?.bufferRows
            });
            return {
                file: workbook,
                output: { message: `File read with streaming`, mode: "read" }
            };
        } else {
            const workbook = cmd.file;
            await workbook.xlsx.writeFile(args.filename, {
                bufferRows: args.options?.bufferRows
            });
            return {
                file: workbook,
                output: { message: `File written with streaming`, mode: "write" }
            };
        }
    },
);