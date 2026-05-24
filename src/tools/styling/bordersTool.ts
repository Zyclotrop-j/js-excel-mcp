import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const bordersTool = new FileBasedTool(
    "borders",
    "Add cell borders with styles and colors.",
    z.codec(
        z.object({
            cellReference: z.string(),
            border: z.object({
                top: z.object({
                    style: z.string(),
                    color: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional()
                }).optional(),
                bottom: z.object({
                    style: z.string(),
                    color: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional()
                }).optional(),
                left: z.object({
                    style: z.string(),
                    color: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional()
                }).optional(),
                right: z.object({
                    style: z.string(),
                    color: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional()
                }).optional(),
                diagonal: z.object({
                    style: z.string(),
                    color: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional()
                }).optional()
            }),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            border: z.object({
                top: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                bottom: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                left: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                right: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                diagonal: z.object({
                    style: z.string().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                border: args.border || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                border: value.border || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            border: z.object({
                top: z.object({ style: z.string() }).nullable(),
                bottom: z.object({ style: z.string() }).nullable(),
                left: z.object({ style: z.string() }).nullable(),
                right: z.object({ style: z.string() }).nullable(),
                diagonal: z.object({ style: z.string() }).nullable()
            })
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            border: z.object({
                top: z.object({ style: z.string() }).nullable(),
                bottom: z.object({ style: z.string() }).nullable(),
                left: z.object({ style: z.string() }).nullable(),
                right: z.object({ style: z.string() }).nullable(),
                diagonal: z.object({ style: z.string() }).nullable()
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
        cell.border = cmd.args.border;

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} border updated`,
                cellReference: cellRef,
                border: cmd.args.border
            }
        };
    },
);
