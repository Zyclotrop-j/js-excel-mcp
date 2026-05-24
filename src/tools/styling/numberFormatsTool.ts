import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const numberFormatsTool = new FileBasedTool(
    "number_formats",
    "Set number display formats (percentage, currency, etc.).",
    z.codec(
        z.object({
            cellReference: z.string(),
            format: z.string(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            format: z.string(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                format: args.format,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                format: value.format,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            format: z.string()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            format: z.string()
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

        const cellRef = cmd.args.cellReference;
        const cell = worksheet.getCell(cellRef);
        cell.numFmt = cmd.args.format;

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} format set to "${cmd.args.format}"`,
                cellReference: cellRef,
                format: cmd.args.format
            }
        };
    },
);
