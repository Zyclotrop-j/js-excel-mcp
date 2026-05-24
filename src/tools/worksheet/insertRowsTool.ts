import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const insertRowsTool = new FileBasedTool(
    "insert_rows",
    "Insert rows at specific positions with data.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            rowNumber: z.number(),
            values: z.array(z.unknown()),
            options: z.object({
                insertShiftRows: z.boolean().optional(),
                insertShiftCells: z.boolean().optional()
            }).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
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
                rowNumber: args.rowNumber,
                values: args.values || null,
                options: args.options || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                rowNumber: value.rowNumber,
                values: value.values,
                options: value.options,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            rowNumber: z.number()
        }),
        z.object({
            message: z.string(),
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
        const worksheet = getWorksheet(cmd.args, workbook, false);

        const shiftType = cmd.args.options?.insertShiftRows ? 'shiftRows' : 'shiftCells';
        worksheet.insertRow(cmd.args.rowNumber, cmd.args.values, {
            origin: shiftType
        });

        return {
            file: workbook,
            output: {
                message: `Row inserted at ${cmd.args.rowNumber}`,
                rowNumber: cmd.args.rowNumber
            }
        };
    },
);