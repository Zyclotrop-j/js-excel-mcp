import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const formulaTool = new FileBasedTool(
    "formula",
    "Get and set cell formulas.",
    z.codec(
        z.object({
            cellReference: z.string(),
            formula: z.string().optional(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            formula: z.string().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                formula: args.formula || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                formula: value.formula || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            formula: z.string().nullable()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            formula: z.string().nullable()
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

        const cellRef = cmd.args.cell;
        const cell = worksheet.getCell(cellRef);

        if (cmd.args.formula !== undefined) {
            cell.value = { formula: cmd.args.formula || "", result: undefined };
            return {
                file: workbook,
                output: {
                    message: `Formula set for ${cellRef}`,
                    cellReference: cellRef,
                    formula: cmd.args.formula
                }
            };
        } else {
            return {
                file: workbook,
                output: {
                    message: `Formula retrieved for ${cellRef}`,
                    cellReference: cellRef,
                    formula: (cell.value as any)?.formula || null
                }
            };
        }
    },
);