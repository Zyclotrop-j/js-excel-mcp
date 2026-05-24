import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const cellTypeTool = new FileBasedTool(
    "cell_type",
    "Get cell type and value type information.",
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
            address: z.string(),
            formula: z.string(),
            result: z.any()
        }),
        z.object({
            message: z.string(),
            cellType: z.string(),
            value: z.any(),
            address: z.string(),
            formula: z.string(),
            result: z.any()
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
                message: `Cell type information for ${cellRef}`,
                cellType: cell.type,
                value: cell.value,
                address: cell.address,
                formula: cell.formula,
                result: cell.result
            }
        };
    },
);