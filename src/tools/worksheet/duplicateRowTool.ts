import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const duplicateRowTool = new FileBasedTool(
    "duplicate_row",
    "Duplicate rows with options for insert or replace.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            rowNumber: z.number(),
            action: z.enum(["insert", "replace"]),
            newRowNumber: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            rowNumber: z.number(),
            action: z.enum(["insert", "replace"]).nullable(),
            newRowNumber: z.number().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                rowNumber: args.rowNumber,
                action: args.action || null,
                newRowNumber: args.newRowNumber || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                rowNumber: value.rowNumber,
                action: value.action,
                newRowNumber: value.newRowNumber,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            rowNumber: z.number(),
            action: z.string()
        }),
        z.object({
            message: z.string(),
            rowNumber: z.number(),
            action: z.string()
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

        const sourceRow = worksheet.getRow(cmd.args.rowNumber);
        const action = cmd.args.action;

        if (action === "insert") {
            const newRowNumber = cmd.args.newRowNumber || cmd.args.rowNumber + 1;
            const newRow = worksheet.addRow(sourceRow.values, newRowNumber);
            newRow.commit();
            return {
                file: workbook,
                output: { message: `Row duplicated and inserted at ${newRowNumber}`, rowNumber: cmd.args.rowNumber, action: "insert" }
            };
        } else if (action === "replace") {
            const newRowNumber = cmd.args.newRowNumber || cmd.args.rowNumber;
            const newRow = worksheet.getRow(newRowNumber);
            newRow.values = sourceRow.values;
            newRow.commit();
            return {
                file: workbook,
                output: { message: `Row duplicated and replaced at ${newRowNumber}`, rowNumber: cmd.args.rowNumber, action: "replace" }
            };
        }

        throw new Error(`Unknown action: ${action}`);
    },
);