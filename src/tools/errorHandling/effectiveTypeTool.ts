import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

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
            cellReference: z.string(),
            effectiveType: z.string(),
            cellValue: z.any(),
            formula: z.string()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            effectiveType: z.string(),
            cellValue: z.any(),
            formula: z.string()
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

        // Determine effective type
        let effectiveType = 'unknown';
        const val = cell.value;
        if (val === null || val === undefined) {
            effectiveType = 'null';
        } else if (typeof val === 'number') {
            effectiveType = 'number';
        } else if (typeof val === 'string') {
            if (val.startsWith('#')) {
                effectiveType = 'error';
            } else if (val.startsWith('=')) {
                effectiveType = 'formula';
            } else {
                effectiveType = 'string';
            }
        } else if (val instanceof Date) {
            effectiveType = 'date';
        } else if (typeof val === 'boolean') {
            effectiveType = 'boolean';
        } else if (typeof val === 'object' && val.hasOwnProperty('text') && val.hasOwnProperty('hyperlink')) {
            effectiveType = 'hyperlink';
        }

        return {
            file: workbook,
            output: {
                message: `Effective type for ${cellRef}`,
                cellReference: cellRef,
                effectiveType,
                cellValue: cell.value,
                formula: cell.formula
            }
        };
    },
);