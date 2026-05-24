import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const columnManagementTool = new FileBasedTool(
    "column_management",
    "Add, remove, and configure columns.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            action: z.enum(["add", "remove", "configure"]),
            column: z.number(),
            options: z.object({
                width: z.number().optional(),
                hidden: z.boolean().optional(),
                outlineLevel: z.number().optional()
            }).optional(),
            values: z.array(z.unknown()).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            action: z.enum(["add", "remove", "configure"]).nullable(),
            column: z.number(),
            options: z.object({
                width: z.number().nullable(),
                hidden: z.boolean().nullable(),
                outlineLevel: z.number().nullable()
            }).nullable(),
            values: z.array(z.unknown()).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                action: args.action || null,
                column: args.column,
                options: args.options || null,
                values: args.values || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                action: value.action || undefined,
                column: value.column,
                options: value.options || undefined,
                values: value.values || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            action: z.string(),
            column: z.number()
        }),
        z.object({
            message: z.string(),
            action: z.string(),
            column: z.number()
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
        const col = cmd.args.column;

        if (action === "add") {
            const newCol = worksheet.getColumn(col);
            if (cmd.args.values) {
                cmd.args.values.forEach((val, idx) => {
                    newCol.getCell(idx + 1).value = val;
                });
            }
            return {
                file: workbook,
                output: { message: `Column ${col} added`, action: "add", column: col }
            };
        } else if (action === "remove") {
            worksheet.removeColumn(col);
            return {
                file: workbook,
                output: { message: `Column ${col} removed`, action: "remove", column: col }
            };
        } else {
            const colObj = worksheet.getColumn(col);
            if (cmd.args.options) {
                if (cmd.args.options.width !== undefined) colObj.width = cmd.args.options.width;
                if (cmd.args.options.hidden !== undefined) colObj.hidden = cmd.args.options.hidden;
                if (cmd.args.options.outlineLevel !== undefined) colObj.outlineLevel = cmd.args.options.outlineLevel;
            }
            return {
                file: workbook,
                output: { message: `Column ${col} configured`, action: "configure", column: col }
            };
        }
    },
);