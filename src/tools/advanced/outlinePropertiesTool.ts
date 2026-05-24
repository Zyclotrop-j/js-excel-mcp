import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const outlinePropertiesTool = new FileBasedTool(
    "outline_properties",
    "Configure expand/collapse behavior.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            properties: z.object({
                defaultOutline: z.boolean().optional(),
                summaryBelow: z.boolean().optional(),
                summaryRight: z.boolean().optional()
            })
        }),
        z.object({
            sheet: z.string().nullable(),
            properties: z.object({
                defaultOutline: z.boolean().nullable(),
                summaryBelow: z.boolean().nullable(),
                summaryRight: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                properties: args.properties || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                properties: value.properties || undefined,
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
        const workbook = cmd.file;
        const worksheet = getWorksheet(cmd.args, workbook, false);

        if (!worksheet) {
            throw new Error(`Worksheet not found`);
        }

        if (cmd.args.properties) {
            if (cmd.args.properties.defaultOutline !== undefined) worksheet.properties.defaultOutline = cmd.args.properties.defaultOutline;
            if (cmd.args.properties.summaryBelow !== undefined) worksheet.properties.summaryBelow = cmd.args.properties.summaryBelow;
            if (cmd.args.properties.summaryRight !== undefined) worksheet.properties.summaryRight = cmd.args.properties.summaryRight;
        }

        return {
            file: workbook,
            output: { message: `Outline properties configured` }
        };
    },
);