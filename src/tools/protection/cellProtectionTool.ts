import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";
import type { Worksheet } from "exceljs";

export const cellProtectionTool = new FileBasedTool(
    "cell_protection",
    "Protect individual cells.",
    z.codec(
        z.object({
            cellReference: z.string(),
            locked: z.boolean().optional(),
            hidden: z.boolean().optional()
        }),
        z.object({
            cell: z.string(),
            locked: z.boolean().nullable(),
            hidden: z.boolean().nullable()
        }),
        {
            decode: (args) => ({
                cell: args.cellReference,
                locked: args.locked != undefined ? args.locked : null,
                hidden: args.hidden != undefined ? args.hidden : null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                locked: value.locked !== null ? value.locked : undefined,
                hidden: value.hidden !== null ? value.hidden : undefined
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
        const worksheet = getWorksheet({ sheet: cmd.args.cell }, workbook) as Worksheet;

        const cellRef = cmd.args.cell;
        const cell = worksheet.getCell(cellRef);

        if (cmd.args.locked != undefined) {
            cell.protection.locked = cmd.args.locked;
        }
        if (cmd.args.hidden != undefined) {
            cell.protection.hidden = cmd.args.hidden;
        }

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} protection updated`,
                cellReference: cellRef,
                protection: {
                    locked: cell.protection.locked || false,
                    hidden: cell.protection.hidden || false
                }
            }
        };
    },
);
