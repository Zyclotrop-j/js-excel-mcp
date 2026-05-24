import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const columnsTool = new FileBasedTool(
    "columns",
    "Add column headers and define column keys and widths for worksheets.",
    z.codec(
        z.object({
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional(),
            columns: z.array(z.object({
                header: z.string(),
                key: z.string(),
                width: z.number().optional(),
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
                    numFmt: z.string().optional()
                }).optional(),
                outlineLevel: z.number().optional()
            })),
            hidden: z.boolean().optional(),
            getValues: z.boolean().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            columns: z.array(z.object({
                header: z.string(),
                key: z.string(),
                width: z.number().nullable(),
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
                    numFmt: z.string().nullable()
                }).nullable(),
                outlineLevel: z.number().nullable()
            })).nullable(),
            hidden: z.boolean().nullable(),
            getValues: z.boolean().nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId != undefined ? args.worksheetId : null,
                columns: args.columns || null,
                hidden: args.hidden != undefined ? args.hidden : null,
                getValues: args.getValues != undefined ? args.getValues : null
            }),
            encode: (value) => ({
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId !== null ? value.worksheetId : undefined,
                columns: value.columns || undefined,
                hidden: value.hidden !== null ? value.hidden : undefined,
                getValues: value.getValues !== null ? value.getValues : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            columnCount: z.number(),
            columns: z.array(z.object({
                header: z.string(),
                key: z.string(),
                width: z.number().nullable(),
                outlineLevel: z.number().nullable()
            }))
        }),
        z.object({
            message: z.string(),
            worksheetName: z.string(),
            worksheetId: z.number(),
            columnCount: z.number(),
            columns: z.array(z.object({
                header: z.string(),
                key: z.string(),
                width: z.number().nullable(),
                outlineLevel: z.number().nullable()
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

        // Set columns
        if (cmd.args.columns) {
            worksheet.columns = cmd.args.columns;
        }

        // Hide rows if requested
        if (cmd.args.hidden) {
            worksheet.eachRow((row, rowNumber) => {
                row.hidden = true;
            });
        }

        return {
            file: workbook,
            output: {
                message: `Columns configured for worksheet`,
                worksheetName: worksheet.name,
                worksheetId: worksheet.id,
                columnCount: worksheet.columns.length,
                columns: worksheet.columns.map(col => ({
                    header: col.header,
                    key: col.key,
                    width: col.width,
                    outlineLevel: col.outlineLevel
                }))
            }
        };
    },
);