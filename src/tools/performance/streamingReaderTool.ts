import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const streamingReaderTool = new FileBasedTool(
    "streaming_reader",
    "Memory-efficient reading for large files.",
    z.codec(
        z.object({
            filename: z.string(),
            options: z.object({
                sheetStubs: z.boolean().optional(),
                dateNF: z.string().optional()
            })
        }),
        z.object({
            filename: z.string(),
            options: z.object({
                sheetStubs: z.boolean().nullable(),
                dateNF: z.string().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                filename: args.filename,
                options: args.options || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                filename: value.filename,
                options: value.options || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetCount: z.number()
        }),
        z.object({
            message: z.string(),
            worksheetCount: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const args = cmd.args;
        const workbook = new ExcelJS.Workbook();
        
        await workbook.xlsx.readFile(args.filename, {
            sheetStubs: args.options?.sheetStubs,
            dateNF: args.options?.dateNF
        });

        return {
            file: workbook,
            output: {
                message: `File read with streaming`,
                worksheetCount: workbook.worksheetNames.length
            }
        };
    },
);