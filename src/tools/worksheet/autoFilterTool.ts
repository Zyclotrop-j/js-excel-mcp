import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const autoFilterTool = new FileBasedTool(
    "auto_filter",
    "Apply auto filters to worksheet data ranges.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            range: z.string().optional(),
            from: z.object({
                row: z.number().optional(),
                column: z.number().optional(),
                address: z.string().optional()
            }).optional(),
            to: z.object({
                row: z.number().optional(),
                column: z.number().optional(),
                address: z.string().optional()
            }).optional()
        }),
        z.object({
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable(),
            range: z.string().nullable(),
            from: z.object({
                row: z.number().nullable(),
                column: z.number().nullable(),
                address: z.string().nullable()
            }).nullable(),
            to: z.object({
                row: z.number().nullable(),
                column: z.number().nullable(),
                address: z.string().nullable()
            }).nullable()
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                range: args.range || null,
                from: args.from || null,
                to: args.to || null
            }),
            encode: (value) => ({
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined,
                range: value.range || undefined,
                from: value.from || undefined,
                to: value.to || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            autoFilter: z.string().nullable()
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            autoFilter: z.string().nullable()
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

        // Set auto filter
        if (cmd.args.range) {
            worksheet.autoFilter = cmd.args.range;
        } else if (cmd.args.from && cmd.args.to) {
            worksheet.autoFilter = {
                from: cmd.args.from,
                to: cmd.args.to
            };
        } else if (cmd.args.from) {
            worksheet.autoFilter = cmd.args.from;
        } else if (cmd.args.to) {
            worksheet.autoFilter = cmd.args.to;
        } else {
            throw new Error('Either range, from/to objects must be provided');
        }

        return {
            file: workbook,
            output: {
                message: `Successfully set auto filter for worksheet "${worksheet.name}"`,
                worksheetName: worksheet.name,
                worksheetId: worksheet.id,
                autoFilter: worksheet.autoFilter
            }
        };
    },
);