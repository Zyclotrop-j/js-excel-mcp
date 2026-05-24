import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const effectiveTypeTool = new FileBasedTool(
    "effective_type",
    "Get cell effective type after formula evaluation.",
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
            effectiveType: z.string(),
            value: z.unknown()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            effectiveType: z.string(),
            value: z.unknown()
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
        const value = cell.value;

        let effectiveType = 'unknown';
        let displayValue = value;

        if (value === null) {
            effectiveType = 'null';
            displayValue = '';
        } else if (typeof value === 'string') {
            effectiveType = 'string';
        } else if (typeof value === 'number') {
            effectiveType = 'number';
        } else if (typeof value === 'boolean') {
            effectiveType = 'boolean';
        } else if (value && value.formula) {
            effectiveType = 'formula';
            // Simplified formula evaluation
            try {
                displayValue = eval(value.formula);
            } catch (e) {
                displayValue = '#ERROR!';
            }
        } else if (value && value.error) {
            effectiveType = 'error';
            displayValue = value.error;
        }

        return {
            file: workbook,
            output: {
                message: `Effective type retrieved`,
                cellReference: cellRef,
                effectiveType,
                value: displayValue
            }
        };
    },
);