import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const richTextTool = new FileBasedTool(
    "rich_text_formatting",
    "Apply multiple text styles in one cell.",
    z.codec(
        z.object({
            cellReference: z.string(),
            richText: z.array(z.object({
                text: z.string(),
                font: z.object({
                    name: z.string().optional(),
                    size: z.number().optional(),
                    bold: z.boolean().optional(),
                    italic: z.boolean().optional(),
                    color: z.object({
                        argb: z.string().optional(),
                        theme: z.number().optional()
                    }).optional()
                }).optional()
            })),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            richText: z.array(z.object({
                text: z.string(),
                font: z.object({
                    name: z.string().nullable(),
                    size: z.number().nullable(),
                    bold: z.boolean().nullable(),
                    italic: z.boolean().nullable(),
                    color: z.object({
                        argb: z.string().nullable(),
                        theme: z.number().nullable()
                    }).nullable()
                }).nullable()
            })).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                richText: args.richText || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                richText: value.richText || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            richText: z.array(z.object({
                text: z.string(),
                font: z.object({
                    name: z.string().nullable(),
                    size: z.number().nullable(),
                    bold: z.boolean().nullable(),
                    italic: z.boolean().nullable()
                })
            }))
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            richText: z.array(z.object({
                text: z.string(),
                font: z.object({
                    name: z.string().nullable(),
                    size: z.number().nullable(),
                    bold: z.boolean().nullable(),
                    italic: z.boolean().nullable()
                })
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
        const worksheet = getWorksheet(cmd.args, workbook);

        const cellRef = cmd.args.cellReference;
        const cell = worksheet.getCell(cellRef);
        cell.value = {
            richText: cmd.args.richText.map(rt => ({
                text: rt.text,
                font: {
                    name: rt.font?.name,
                    size: rt.font?.size,
                    bold: rt.font?.bold,
                    italic: rt.font?.italic,
                    color: rt.font?.color ? { argb: rt.font.color.argb } : undefined
                }
            }))
        };

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} set to rich text`,
                cellReference: cellRef,
                richText: cmd.args.richText
            }
        };
    },
);
