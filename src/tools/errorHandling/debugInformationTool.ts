import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue, cellValueInverse } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const debugInformationTool = new FileBasedTool(
    "debug_information",
    "Get debug information about cells, including type and formula details.",
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
            cellType: z.string(),
            value: z.any(),
            formula: z.string(),
            style: z.string().nullable(),
            address: z.string()
        }),
        z.object({
            message: z.string(),
            cellType: z.string(),
            value: z.any(),
            formula: z.string(),
            style: z.string().nullable(),
            address: z.string()
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

        return {
            file: workbook,
            output: {
                message: `Debug info for cell ${cellRef}`,
                cellType: cell.type,
                value: cell.value,
                formula: cell.formula,
                style: cell.style ? JSON.stringify(cell.style) : null,
                address: cell.address
            }
        };
    },
);