import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const formulaValueTool = new FileBasedTool(
    "formula_value",
    "Set Excel formulas with results.",
    z.codec(
        z.object({
            cellReference: z.string(),
            formula: z.string(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().min(1).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            formula: z.string(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                formula: args.formula,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                formula: value.formula,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            formula: z.string()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            formula: z.string()
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

        const cellRef = cmd.args.cellReference;
        const cell = worksheet.getCell(cellRef);
        cell.value = { formula: cmd.args.formula, result: undefined };

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} set to formula "${cmd.args.formula}"`,
                cellReference: cellRef,
                formula: cmd.args.formula
            }
        };
    },
);