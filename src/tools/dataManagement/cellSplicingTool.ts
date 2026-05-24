import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const cellSplicingTool = new FileBasedTool(
    "cell_splicing",
    "Insert/remove cells with shifting.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            cellReference: z.string(),
            action: z.enum(["insert", "remove"]),
            count: z.number().optional(),
            shift: z.enum(["right", "down"]).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cellReference: z.string(),
            action: z.enum(["insert", "remove"]).nullable(),
            count: z.number().nullable(),
            shift: z.enum(["right", "down"]).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cellReference: args.cellReference,
                action: args.action || null,
                count: args.count || null,
                shift: args.shift || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cellReference,
                action: value.action || undefined,
                count: value.count || undefined,
                shift: value.shift || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            action: z.string()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
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

        if (!worksheet) {
            throw new Error(`Worksheet not found`);
        }

        const action = cmd.args.action;
        const cellRef = cmd.args.cellReference;

        if (action === "insert") {
            const row = worksheet.getCell(cellRef).row;
            const col = worksheet.getCell(cellRef).column;
            worksheet.insertCell(row, col, {
                shift: cmd.args.shift || 'right'
            });
            return {
                file: workbook,
                output: { message: `Cell inserted at ${cellRef}`, cellReference: cellRef, action: "insert" }
            };
        } else {
            const row = worksheet.getCell(cellRef).row;
            const col = worksheet.getCell(cellRef).column;
            worksheet.removeCell(row, col);
            return {
                file: workbook,
                output: { message: `Cell removed at ${cellRef}`, cellReference: cellRef, action: "remove" }
            };
        }
    },
);