import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const batchOperationsTool = new FileBasedTool(
    "batch_operations",
    "Process multiple operations efficiently.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            operations: z.array(z.object({
                type: z.string(),
                cell: z.string(),
                value: z.unknown()
            }))
        }),
        z.object({
            sheet: z.string().nullable(),
            operations: z.array(z.object({
                type: z.string(),
                cell: z.string(),
                value: z.unknown()
            })).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                operations: args.operations || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                operations: value.operations || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            batchCount: z.number()
        }),
        z.object({
            message: z.string(),
            batchCount: z.number()
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

        if (!worksheet) {
            throw new Error(`Worksheet not found`);
        }

        let count = 0;
        for (const op of cmd.args.operations) {
            const cell = worksheet.getCell(op.cell);
            cell.value = op.value;
            count++;
        }

        return {
            file: workbook,
            output: {
                message: `${count} operations processed`,
                batchCount: count
            }
        };
    },
);