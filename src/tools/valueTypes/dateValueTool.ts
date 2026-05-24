import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const dateValueTool = new FileBasedTool(
    "date_value",
    "Set date and time values in cells.",
    z.codec(
        z.object({
            cellReference: z.string(),
            value: z.union([z.string(), z.number()]),
            worksheetName: z.string().optional(),
            worksheetId: z.number().min(1).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            value: z.union([z.string(), z.number()]),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                value: args.value,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                value: value.value,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            value: z.string()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            value: z.string()
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

        // Handle different input types
        let dateValue;
        if (typeof cmd.args.value === 'string') {
            dateValue = new Date(cmd.args.value);
        } else if (typeof cmd.args.value === 'number') {
            dateValue = new Date(cmd.args.value);
        } else {
            dateValue = cmd.args.value;
        }

        cell.value = dateValue;

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} set to date "${dateValue.toISOString()}"`,
                cellReference: cellRef,
                value: dateValue.toISOString()
            }
        };
    },
);