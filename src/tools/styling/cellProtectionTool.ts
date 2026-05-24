import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const cellProtectionTool = new FileBasedTool(
    "cell_protection",
    "Set cell-level protection (locked, hidden).",
    z.codec(
        z.object({
            cellReference: z.string(),
            protection: z.object({
                locked: z.boolean().optional(),
                hidden: z.boolean().optional()
            }),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            protection: z.object({
                locked: z.boolean().nullable(),
                hidden: z.boolean().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                protection: args.protection || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                protection: value.protection || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            protection: z.object({
                locked: z.boolean(),
                hidden: z.boolean()
            })
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            protection: z.object({
                locked: z.boolean(),
                hidden: z.boolean()
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

        if (cmd.args.protection) {
            if (cmd.args.protection.locked !== undefined) cell.protection.locked = cmd.args.protection.locked;
            if (cmd.args.protection.hidden !== undefined) cell.protection.hidden = cmd.args.protection.hidden;
        }

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} protection updated`,
                cellReference: cellRef,
                protection: {
                    locked: cell.protection.locked,
                    hidden: cell.protection.hidden
                }
            }
        };
    },
);
