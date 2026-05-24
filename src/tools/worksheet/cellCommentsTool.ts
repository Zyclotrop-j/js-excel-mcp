import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import { getWorksheet } from "../../services/getWorkSheet.js";

export const cellCommentsTool = new FileBasedTool(
    "cell_comments",
    "Add and format cell comments with rich text support.",
    z.codec(
        z.object({
            cellReference: z.string(),
            author: z.string(),
            text: z.string(),
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
                alignment: z.object({
                    horizontal: z.string().optional(),
                    vertical: z.string().optional()
                }).optional()
            }).optional(),
            worksheetName: z.string().optional(),
            worksheetId: z.number().optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            author: z.string(),
            text: z.string(),
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
                alignment: z.object({
                    horizontal: z.string().nullable(),
                    vertical: z.string().nullable()
                }).nullable()
            }).nullable(),
            worksheetName: z.string().nullable(),
            worksheetId: z.number().nullable()
        }),
        {
            decode: (args) => ({
                sheet: args.worksheetName || args.worksheetId ? String(args.worksheetName || args.worksheetId) : null,
                cell: args.cellReference,
                author: args.author,
                text: args.text,
                style: args.style || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                author: value.author,
                text: value.text,
                style: value.style || undefined,
                worksheetName: value.sheet || undefined,
                worksheetId: value.sheet ? undefined : undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            author: z.string(),
            text: z.string()
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            author: z.string(),
            text: z.string()
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

        cell.note = {
            text: cmd.args.text,
            author: cmd.args.author,
            style: cmd.args.style
        };

        return {
            file: workbook,
            output: {
                message: `Comment added to ${cellRef}`,
                cellReference: cellRef,
                author: cmd.args.author,
                text: cmd.args.text
            }
        };
    },
);