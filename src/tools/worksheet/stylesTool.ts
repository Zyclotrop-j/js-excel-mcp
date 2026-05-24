import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";

export const stylesTool = new FileBasedTool(
    "styles",
    "Apply formatting to cells, rows, columns.",
    z.codec(
        z.object({
            target: z.string(),
            style: z.object({
                font: z.object({
                    name: z.string().optional(),
                    size: z.number().optional(),
                    bold: z.boolean().optional(),
                    italic: z.boolean().optional(),
                    color: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional()
                }).optional(),
                fill: z.object({
                    type: z.string().optional(),
                    fgColor: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional(),
                    bgColor: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional()
                }).optional(),
                border: z.object({
                    top: z.object({
                        style: z.string().optional(),
                        color: z.object({
                            argb: z.string().optional(),
                            theme: z.number().optional()
                        }).optional()
                    }).optional(),
                    bottom: z.object({
                        style: z.string().optional(),
                        color: z.object({
                            argb: z.string().optional(),
                            theme: z.number().optional()
                        }).optional()
                    }).optional(),
                    left: z.object({
                        style: z.string().optional(),
                        color: z.object({
                            argb: z.string().optional(),
                            theme: z.number().optional()
                        }).optional()
                    }).optional(),
                    right: z.object({
                        style: z.string().optional(),
                        color: z.object({
                            argb: z.string().optional(),
                            theme: z.number().optional()
                        }).optional()
                    }).optional()
                }).optional(),
                alignment: z.object({
                    horizontal: z.string().optional(),
                    vertical: z.string().optional(),
                    wrapText: z.boolean().optional(),
                    textRotation: z.number().optional()
                }).optional(),
                numFmt: z.string().optional()
            }),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            target: z.string(),
            style: z.object({
                font: z.object({
                    name: z.string().nullable(),
                    size: z.number().nullable(),
                    bold: z.boolean().nullable(),
                    italic: z.boolean().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
                fill: z.object({
                    type: z.string().nullable(),
                    fgColor: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable(),
                    bgColor: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable(),
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
                    }).nullable()
                }).nullable(),
                alignment: z.object({
                    horizontal: z.string().nullable(),
                    vertical: z.string().nullable(),
                    wrapText: z.boolean().nullable(),
                    textRotation: z.number().nullable()
                }).nullable(),
                numFmt: z.string().nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                target: args.target,
                style: args.style || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                target: value.target,
                style: value.style || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            target: z.string()
        }),
        z.object({
            message: z.string(),
            target: z.string()
        }),
        {
            decode: (value) => value,
            encode: (value) => value
        }
    ),
    ExcelFileSerialiser,
    async (cmd, ctx) => {
        const workbook = cmd.file;
        let worksheet = null;
        
        if (cmd.args.worksheetName) {
            worksheet = workbook.getWorksheet(cmd.args.worksheetName);
        } else if (cmd.args.worksheetId !== undefined) {
            workbook.eachSheet((ws, sheetId) => {
                if (sheetId === cmd.args.worksheetId) {
                    worksheet = ws;
                }
            });
        } else {
            worksheet = workbook.getWorksheet(1);
        }

        if (!worksheet) {
            throw new Error(`Worksheet not found`);
        }

        const target = cmd.args.target;
        const style = cmd.args.style;
        
        if (target.includes(':')) {
            // Range formatting
            const range = worksheet.getRange(target);
            range.style = style;
        } else {
            // Single cell
            const cell = worksheet.getCell(target);
            cell.style = style;
        }

        return {
            file: workbook,
            output: {
                message: `Styles applied to ${target}`,
                target
            }
        };
    },
);