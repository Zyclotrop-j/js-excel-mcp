import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue, cellValueInverse } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

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
            value: cellValue
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                value: args.formula ? { formula: args.formula } : undefined
            }),
            encode: (value) => ({
                cellReference: value.cell,
                formula: typeof value.value === 'object' && 'formula' in value.value ? value.value.formula : undefined,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            formula: z.string(),
            value: z.any()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            formula: z.string(),
            value: z.any()
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

        if (cmd.args.formula) {
            cell.value = cmd.args.formula;
            cell.formula = cmd.args.formula;
        }

        return {
            file: workbook,
            output: {
                message: cmd.args.formula ? `Formula set on ${cellRef}` : `Formula read from ${cellRef}`,
                cellReference: cellRef,
                formula: cell.formula,
                value: cell.value
            }
        };
    },
);