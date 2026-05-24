import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const xlsxWriteTool = new FileBasedTool(
    "xlsx_write",
    "Write Excel files with buffering and streaming support.",
    z.codec(
        z.object({
            filename: z.string(),
            buffer: z.boolean().optional(),
            useStyles: z.boolean().optional(),
            dateNF: z.string().optional(),
            zip: z.object({
                compression: z.string().optional(),
                level: z.number().optional()
            }).optional()
        }),
        z.object({
            filename: z.string(),
            buffer: z.boolean().nullable(),
            useStyles: z.boolean().nullable(),
            dateNF: z.string().nullable(),
            zip: z.object({
                compression: z.string().nullable(),
                level: z.number().nullable()
            }).nullable()
        }),
        {
            decode: (args) => ({
                filename: args.filename,
                buffer: args.buffer != undefined ? args.buffer : null,
                useStyles: args useStyles != undefined ? args useStyles : null,
                dateNF: args.dateNF || null,
                zip: args.zip || null
            }),
            encode: (value) => ({
                filename: value.filename,
                buffer: value.buffer !== null ? value.buffer : undefined,
                useStyles: value useStyles !== null ? value useStyles : undefined,
                dateNF: value.dateNF || undefined,
                zip: value.zip || undefined
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
            useStyles: args useStyles,
            dateNF: args.dateNF,
            zip: args.zip
        });

        return {
            file: workbook,
            output: {
                message: `Successfully wrote file ${args.filename}`,
                filePath: args.filename
            }
        };
    },
);