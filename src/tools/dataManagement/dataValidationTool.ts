import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const dataValidationTool = new FileBasedTool(
    "data_validation",
    "Set input validation rules for cells.",
    z.codec(
        z.object({
            cellReference: z.string(),
            validation: z.object({
                type: z.string(),
                operator: z.string(),
                formulae: z.array(z.string()).optional(),
                showErrorMessage: z.boolean().optional(),
                showInputMessage: z.boolean().optional(),
                promptTitle: z.string().optional(),
                prompt: z.string().optional(),
                errorTitle: z.string().optional(),
                error: z.string().optional()
            }),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            validation: z.object({
                type: z.string(),
                operator: z.string(),
                formulae: z.array(z.string()).nullable(),
                showErrorMessage: z.boolean().nullable(),
                showInputMessage: z.boolean().nullable(),
                promptTitle: z.string().nullable(),
                prompt: z.string().nullable(),
                errorTitle: z.string().nullable(),
                error: z.string().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                validation: args.validation || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                validation: value.validation || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            validation: z.object({
                type: z.string(),
                operator: z.string()
            })
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            validation: z.object({
                type: z.string(),
                operator: z.string()
            })
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
        cell.dataValidation = cmd.args.validation;

        return {
            file: workbook,
            output: {
                message: `Data validation set for ${cellRef}`,
                cellReference: cellRef,
                validation: {
                    type: cmd.args.validation.type,
                    operator: cmd.args.validation.operator
                }
            }
        };
    },
);
