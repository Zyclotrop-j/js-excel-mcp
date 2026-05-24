import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const pageBreaksTool = new FileBasedTool(
    "page_breaks",
    "Add page breaks for printing.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            action: z.enum(["add", "remove"]),
            position: z.object({
                row: z.number().optional(),
                column: z.number().optional(),
                address: z.string().optional()
            })
        }),
        z.object({
            sheet: z.string().nullable(),
            action: z.enum(["add", "remove"]).nullable(),
            position: z.object({
                row: z.number().nullable(),
                column: z.number().nullable(),
                address: z.string().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                action: args.action || null,
                position: args.position || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                action: value.action || undefined,
                position: value.position || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            action: z.string(),
            position: z.object({
                row: z.number().nullable(),
                column: z.number().nullable()
            })
        }),
        z.object({
            message: z.string(),
            action: z.string(),
            position: z.object({
                row: z.number().nullable(),
                column: z.number().nullable()
            })
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

        const action = cmd.args.action;
        const pos = cmd.args.position;

        if (action === "add") {
            if (pos.row) worksheet.addPageBreak(pos.row);
            if (pos.column) worksheet.addPageBreak(pos.column);
            return {
                file: workbook,
                output: { message: `Page break added`, action: "add", position: pos }
            };
        } else {
            if (pos.row) worksheet.removePageBreak(pos.row);
            if (pos.column) worksheet.removePageBreak(pos.column);
            return {
                file: workbook,
                output: { message: `Page break removed`, action: "remove", position: pos }
            };
        }
    },
);