import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const streamingXlsxReaderTool = new FileBasedTool(
    "streaming_xlsx_reader",
    "Read large Excel files efficiently with streaming.",
    z.codec(
        z.object({
            filename: z.string(),
            options: z.object({
                dateNF: z.string().optional(),
                cellDates: z.boolean().optional(),
                cellStyles: z.boolean().optional(),
                cellFormula: z.boolean().optional()
            })
        }),
        z.object({
            filename: z.string(),
            options: z.object({
                dateNF: z.string().nullable(),
                cellDates: z.boolean().nullable(),
                cellStyles: z.boolean().nullable(),
                cellFormula: z.boolean().nullable()
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
            dateNF: args.options?.dateNF,
            cellDates: args.options?.cellDates,
            cellStyles: args.options?.cellStyles,
            cellFormula: args.options?.cellFormula
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