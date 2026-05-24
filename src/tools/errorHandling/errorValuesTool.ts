import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue, cellValueInverse } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const errorValuesTool = new FileBasedTool(
    "error_values",
    "Set Excel error values in cells.",
    z.codec(
        z.object({
            cellReference: z.string(),
            errorValue: z.enum(['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#GETTING_DATA', '#SPILL!', '#FIELD!', '#CALC!', '']).optional(),
            customError: z.string().optional(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            value: cellValue
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                value: args.errorValue || args.customError || ''
            }),
            encode: (value) => ({
                cellReference: value.cell,
                customError: value.value || undefined,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            errorValue: z.string()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            errorValue: z.string()
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
        cell.value = cmd.args.errorValue || cmd.args.customError || '';

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} set to error value "${cell.value}"`,
                cellReference: cellRef,
                errorValue: String(cell.value)
            }
        };
    },
);