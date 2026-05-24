import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const validationFunctionsTool = new FileBasedTool(
    "validation_functions",
    "Formula and data validation.",
    z.codec(
        z.object({
            cellReference: z.string(),
            type: z.enum(["formula", "data"]),
            rule: z.object({
                type: z.string(),
                formula: z.string().optional(),
                operator: z.string().optional(),
                values: z.array(z.string()).optional()
            }),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            type: z.enum(["formula", "data"]).nullable(),
            rule: z.object({
                type: z.string(),
                formula: z.string().nullable(),
                operator: z.string().nullable(),
                values: z.array(z.string()).nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                type: args.type || null,
                rule: args.rule || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                type: value.type || undefined,
                rule: value.rule || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            type: z.string()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            type: z.string()
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

        if (cmd.args.type === "formula") {
            cell.value = { formula: cmd.args.rule.formula, result: undefined };
        } else {
            cell.dataValidation = cmd.args.rule;
        }

        return {
            file: workbook,
            output: {
                message: `${cmd.args.type} validation set for ${cellRef}`,
                cellReference: cellRef,
                type: cmd.args.type
            }
        };
    },
);