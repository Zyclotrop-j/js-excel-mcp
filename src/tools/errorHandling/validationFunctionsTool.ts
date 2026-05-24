import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const validationFunctionsTool = new FileBasedTool(
    "validation_functions",
    "Validate cells and formulas with custom validation rules.",
    z.codec(
        z.object({
            cellReference: z.string(),
            validationType: z.enum(['is_number', 'is_string', 'is_date', 'is_boolean', 'is_empty', 'is_error']).optional(),
            customValidation: z.string().optional(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference
            }),
            encode: (value) => ({
                cellReference: value.cell,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            isValid: z.boolean(),
            validationType: z.string(),
            cellValue: z.any()
        }),
        z.object({
            message: z.string(),
            isValid: z.boolean(),
            validationType: z.string(),
            cellValue: z.any()
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
        const value = cell.value;

        let isValid = false;
        let validationType = cmd.args.validationType || 'is_string';

        switch (validationType) {
            case 'is_number':
                isValid = typeof value === 'number' || !isNaN(Number(value));
                break;
            case 'is_string':
                isValid = typeof value === 'string';
                break;
            case 'is_date':
                isValid = value instanceof Date;
                break;
            case 'is_boolean':
                isValid = typeof value === 'boolean';
                break;
            case 'is_empty':
                isValid = value === null || value === undefined || value === '';
                break;
            case 'is_error':
                isValid = typeof value === 'string' && value.startsWith('#');
                break;
            default:
                isValid = true;
        }

        return {
            file: workbook,
            output: {
                message: `Validation ${validationType} for cell ${cellRef}: ${isValid ? 'PASS' : 'FAIL'}`,
                isValid,
                validationType,
                cellValue: value
            }
        };
    },
);