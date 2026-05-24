import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const mergedCellsTool = new FileBasedTool(
    "merged_cells",
    "Merge and unmerge cell ranges in worksheets.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            action: z.enum(["merge", "unmerge"]),
            range: z.string(),
            style: z.object({
                alignment: z.object({
                    vertical: z.string().optional(),
                    horizontal: z.string().optional()
                }).optional()
            }).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            action: z.enum(["merge", "unmerge"]).nullable(),
            range: z.string(),
            style: z.object({
                alignment: z.object({
                    vertical: z.string().nullable(),
                    horizontal: z.string().nullable()
                }).nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                action: args.action || null,
                range: args.range,
                style: args.style || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                action: value.action,
                range: value.range,
                style: value.style || undefined,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            action: z.string(),
            range: z.string()
        }),
        z.object({
            message: z.string(),
            action: z.string(),
            range: z.string()
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

        const action = cmd.args.action;
        const range = cmd.args.range;

        if (action === "merge") {
            worksheet.mergeCells(range, cmd.args.style);
            return {
                file: workbook,
                output: { message: `Cells merged: ${range}`, action: "merge", range }
            };
        } else if (action === "unmerge") {
            worksheet.unmergeCells(range);
            return {
                file: workbook,
                output: { message: `Cells unmerged: ${range}`, action: "unmerge", range }
            };
        }

        throw new Error(`Unknown action: ${action}`);
    },
);