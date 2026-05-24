import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import * as ExcelJS from "exceljs";

export const customParsersTool = new FileBasedTool(
    "custom_parsers",
    "Custom CSV value parsing with mapping functions.",
    z.codec(
        z.object({
            filename: z.string(),
            mapping: z.array(z.object({
                key: z.string(),
                parse: z.string()
            })),
            parser: z.string().optional()
        }),
        z.object({
            filename: z.string(),
            mapping: z.array(z.object({
                key: z.string(),
                parse: z.string()
            })).nullable(),
            parser: z.string().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                filename: args.filename,
                mapping: args.mapping || null,
                parser: args.parser || null,
                worksheetName: null,
                worksheetId: null
            }),
            encode: (value) => ({
                filename: value.filename,
                mapping: value.mapping,
                parser: value.parser || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string()
        }),
        z.object({
            message: z.string()
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
        
        // Parse CSV with custom options
        await workbook.csv.readFile(args.filename, {
            // @ts-ignore - defval is not in TypeScript types but works in practice
            defval: args.parser ? Function(args.parser) : undefined
        });

        return {
            file: workbook,
            output: { message: `CSV read with custom parser` }
        };
    },
);