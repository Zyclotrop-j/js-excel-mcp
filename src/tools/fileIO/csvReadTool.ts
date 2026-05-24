import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const csvReadTool = new FileBasedTool(
    "csv_read",
    "Read CSV files with custom parsing and date formats.",
    z.codec(
        z.object({
            filename: z.string(),
            delimiter: z.string().optional(),
            newline: z.string().optional(),
            dateNF: z.string().optional(),
            blankrows: z.boolean().optional(),
            defval: z.unknown().optional(),
            parseDateTime: z.boolean().optional()
        }),
        z.object({
            filename: z.string(),
            delimiter: z.string().nullable(),
            newline: z.string().nullable(),
            dateNF: z.string().nullable(),
            blankrows: z.boolean().nullable(),
            defval: z.unknown().nullable(),
            parseDateTime: z.boolean().nullable()
        }),
        {
            decode: (args) => ({
                filename: args.filename,
                delimiter: args.delimiter || null,
                newline: args.newline || null,
                dateNF: args.dateNF || null,
                blankrows: args.blankrows !== undefined ? args.blankrows : null,
                defval: args.defval || null,
                parseDateTime: args.parseDateTime !== undefined ? args.parseDateTime : null
            }),
            encode: (value) => ({
                filename: value.filename,
                delimiter: value.delimiter || undefined,
                newline: value.newline || undefined,
                dateNF: value.dateNF || undefined,
                blankrows: value.blankrows !== null ? value.blankrows : undefined,
                defval: value.defval || undefined,
                parseDateTime: value.parseDateTime !== null ? value.parseDateTime : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            sheetCount: z.number()
        }),
        z.object({
            message: z.string(),
            sheetCount: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = new ExcelJS.Workbook();
        const args = cmd.args;
        
        await workbook.csv.readFile(args.filename, {
            delimiter: args.delimiter,
            newline: args.newline,
            dateNF: args.dateNF,
            blankrows: args.blankrows,
            defval: args.defval,
            parseDateTime: args.parseDateTime
        });

        return {
            file: workbook,
            output: {
                message: `Successfully read CSV file ${args.filename}`,
                sheetCount: workbook.worksheetNames.length
            }
        };
    },
);