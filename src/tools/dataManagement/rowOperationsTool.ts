import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const rowOperationsTool = new FileBasedTool(
    "row_operations",
    "Insert, delete, and duplicate rows.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            action: z.enum(["insert", "delete", "duplicate"]),
            rowNumber: z.number(),
            values: z.array(z.unknown()).optional(),
            options: z.object({
                insertShiftRows: z.boolean().optional(),
                insertShiftCells: z.boolean().optional()
            }).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            action: z.enum(["insert", "delete", "duplicate"]).nullable(),
            rowNumber: z.number(),
            values: z.array(z.unknown()).nullable(),
            options: z.object({
                insertShiftRows: z.boolean().nullable(),
                insertShiftCells: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                action: args.action || null,
                rowNumber: args.rowNumber,
                values: args.values || null,
                options: args.options || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                action: value.action || undefined,
                rowNumber: value.rowNumber,
                values: value.values || undefined,
                options: value.options || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            action: z.string(),
            rowNumber: z.number()
        }),
        z.object({
            message: z.string(),
            action: z.string(),
            rowNumber: z.number()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        const worksheet = getWorksheet(cmd.args, workbook);

        const action = cmd.args.action;
        const rowNumber = cmd.args.rowNumber;

        if (action === "insert") {
            worksheet.insertRow(rowNumber, cmd.args.values, {
                origin: cmd.args.options?.insertShiftRows ? "shiftRows" : cmd.args.options?.insertShiftCells ? "shiftCells" : "shiftCells"
            });
            return {
                file: workbook,
                output: { message: `Row inserted at ${rowNumber}`, action: "insert", rowNumber }
            };
        } else if (action === "delete") {
            worksheet.deleteRow(rowNumber, cmd.args.count || 1);
            return {
                file: workbook,
                output: { message: `Row ${rowNumber} deleted`, action: "delete", rowNumber }
            };
        } else if (action === "duplicate") {
            const sourceRow = worksheet.getRow(rowNumber);
            const newRow = worksheet.addRow(sourceRow.values);
            newRow.commit();
            return {
                file: workbook,
                output: { message: `Row duplicated at ${rowNumber}`, action: "duplicate", rowNumber }
            };
        }

        throw new Error(`Unknown action: ${action}`);
    },
);
