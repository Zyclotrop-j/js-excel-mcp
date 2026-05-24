import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const resultTool = new FileBasedTool(
    "result",
    "Get formula calculation results.",
    z.codec(
        z.object({
            cellReference: z.string(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            result: z.unknown()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            result: z.unknown()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        let worksheet = null;
        
        if (cmd.args.worksheetName) {
            worksheet = workbook.getWorksheet(cmd.args.worksheetName);
        } else if (cmd.args.worksheetId !== undefined) {
            workbook.eachSheet((ws, sheetId) => {
                if (sheetId === cmd.args.worksheetId) {
                    worksheet = ws;
                }
            });
        } else {
            worksheet = workbook.getWorksheet(1);
        }

        if (!worksheet) {
            throw new Error(`Worksheet not found`);
        }

        const cellRef = cmd.args.cellReference;
        const cell = worksheet.getCell(cellRef);
        
        // Calculate formula result
        let result = null;
        if (cell.value && cell.value.formula) {
            try {
                // Simplified formula calculation
                result = eval(cell.value.formula); // Note: eval is not recommended in production
            } catch (e) {
                result = '#ERROR!';
            }
        } else {
            result = cell.value;
        }

        return {
            file: workbook,
            output: {
                message: `Formula result retrieved`,
                cellReference: cellRef,
                result
            }
        };
    },
);