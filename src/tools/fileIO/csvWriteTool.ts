import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const csvWriteTool = new FileBasedTool(
    "csv_write",
    "Write CSV files with formatting and custom mapping.",
    z.codec(
        z.object({
            filename: z.string(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            options: z.object({
                dateNF: z.string().optional(),
                encoding: z.string().optional(),
                useStyles: z.boolean().optional(),
                defval: z.unknown().optional(),
                autoFilter: z.boolean().optional()
            })
        }),
        z.object({
            filename: z.string(),
            options: z.object({
                dateNF: z.string().nullable(),
                encoding: z.string().nullable(),
                useStyles: z.boolean().nullable(),
                defval: z.unknown().nullable(),
                autoFilter: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                filename: args.filename,
                options: args.options || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null
            }),
            encode: (value) => ({
                filename: value.filename,
                options: value.options,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined
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
        const workbook = cmd.file;
        const worksheet = getWorksheet(cmd.args, workbook, false);

        await worksheet.csv.write(cmd.args.filename, {
            dateNF: cmd.args.options?.dateNF,
            encoding: cmd.args.options?.encoding,
            useStyles: cmd.args.options?.useStyles,
            defval: cmd.args.options?.defval,
            autoFilter: cmd.args.options?.autoFilter
        });

        return {
            file: workbook,
            output: {
                message: `CSV written to ${cmd.args.filename}`,
                filePath: cmd.args.filename
            }
        };
    },
);