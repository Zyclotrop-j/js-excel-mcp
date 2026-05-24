import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const fillsTool = new FileBasedTool(
    "fills",
    "Apply pattern and gradient fills to cells.",
    z.codec(
        z.object({
            cellReference: z.string(),
            fill: z.object({
                type: z.string(),
                fgColor: z.object({
                    argb: z.string().optional(),
                    theme: z.number().optional()
                }).optional(),
                pattern: z.string().optional(),
                bgColor: z.object({
                    argb: z.string().optional(),
                    theme: z.number().optional()
                }).optional()
            }),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            fill: z.object({
                type: z.string().nullable(),
                fgColor: z.object({
                    argb: z.string().nullable(),
                    theme: z.number().nullable()
                }).nullable(),
                pattern: z.string().nullable(),
                bgColor: z.object({
                    argb: z.string().nullable(),
                    theme: z.number().nullable()
                }).nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                fill: args.fill || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                fill: value.fill || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            fill: z.object({
                type: z.string(),
                pattern: z.string().nullable()
            })
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            fill: z.object({
                type: z.string(),
                pattern: z.string().nullable()
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
        cell.fill = cmd.args.fill;

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} fill updated`,
                cellReference: cellRef,
                fill: cmd.args.fill
            }
        };
    },
);
