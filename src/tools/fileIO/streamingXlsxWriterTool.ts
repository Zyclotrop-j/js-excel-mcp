import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const streamingXlsxWriterTool = new FileBasedTool(
    "streaming_xlsx_writer",
    "Write large Excel files efficiently with streaming.",
    z.codec(
        z.object({
            filename: z.string(),
            options: z.object({
                compression: z.string().optional(),
                useStyles: z.boolean().optional()
            })
        }),
        z.object({
            filename: z.string(),
            options: z.object({
                compression: z.string().nullable(),
                useStyles: z.boolean().nullable()
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
            filePath: z.string()
        }),
        z.object({
            message: z.string(),
            filePath: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const args = cmd.args;
        const workbook = cmd.file;
        
        await workbook.xlsx.writeFile(args.filename, {
            compression: args.options?.compression,
            useStyles: args.options?.useStyles
        });

        return {
            file: workbook,
            output: {
                message: `File written with streaming`,
                filePath: args.filename
            }
        };
    },
);