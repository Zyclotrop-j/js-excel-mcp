import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const getRowsTool = new FileBasedTool(
    "get_rows",
    "Get multiple row objects from worksheet.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            startRow: z.number().optional(),
            endRow: z.number().optional(),
            includeEmpty: z.boolean().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            startRow: z.number().nullable(),
            endRow: z.number().nullable(),
            includeEmpty: z.boolean().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                startRow: args.startRow || null,
                endRow: args.endRow || null,
                includeEmpty: args.includeEmpty !== undefined ? args.includeEmpty : null,
            }),
            encode: (value) => ({
                startRow: value.startRow,
                endRow: value.endRow,
                includeEmpty: value.includeEmpty,
                worksheetName: value.worksheetName,
                worksheetId: value.worksheetId
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            rowCount: z.number(),
            rows: z.array(z.object({
                row: z.number(),
                values: z.array(z.any())
            }))
        }),
        z.object({
            message: z.string(),
            rowCount: z.number(),
            rows: z.array(z.object({
                row: z.number(),
                values: z.array(z.any())
            }))
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

        const rows = [];
        const startRow = cmd.args.startRow || 1;
        const endRow = cmd.args.endRow || worksheet.rowCount;

        for (let i = startRow; i <= endRow; i++) {
            const row = worksheet.getRow(i);
            if (cmd.args.includeEmpty || row.values.some(v => v !== undefined && v !== null)) {
                rows.push({
                    row: i,
                    values: row.values.map(v => v ? v.value : null)
                });
            }
        }

        return {
            file: workbook,
            output: {
                message: `${rows.length} rows retrieved`,
                rowCount: rows.length,
                rows
            }
        };
    },
);