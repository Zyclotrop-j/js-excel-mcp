import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const fontsTool = new FileBasedTool(
    "fonts",
    "Configure font properties (name, size, color, bold, italic).",
    z.codec(
        z.object({
            cellReference: z.string(),
            font: z.object({
                name: z.string().optional(),
                size: z.number().optional(),
                bold: z.boolean().optional(),
                italic: z.boolean().optional(),
                underline: z.boolean().optional(),
                strike: z.boolean().optional(),
                color: z.object({
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
            font: z.object({
                name: z.string().nullable(),
                size: z.number().nullable(),
                bold: z.boolean().nullable(),
                italic: z.boolean().nullable(),
                underline: z.boolean().nullable(),
                strike: z.boolean().nullable(),
                color: z.object({
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
                font: args.font || null,
                worksheetName: args.worksheetName || null,
                worksheetId: args.worksheetId || null
            }),
            encode: (value) => ({
                cellReference: value.cell,
                font: value.font || undefined,
                worksheetName: value.worksheetName || undefined,
                worksheetId: value.worksheetId || undefined
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string(),
            cellReference: z.string(),
            font: z.object({
                name: z.string().nullable(),
                size: z.number().nullable(),
                bold: z.boolean().nullable(),
                italic: z.boolean().nullable(),
                underline: z.boolean().nullable(),
                strike: z.boolean().nullable()
            })
        }),
        z.object({
            message: z.string(),
            cellReference: z.string(),
            font: z.object({
                name: z.string().nullable(),
                size: z.number().nullable(),
                bold: z.boolean().nullable(),
                italic: z.boolean().nullable(),
                underline: z.boolean().nullable(),
                strike: z.boolean().nullable()
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

        const cell = worksheet.getCell(cmd.args.cell);
        
        if (cmd.args.font) {
            if (cmd.args.font.name) cell.font.name = cmd.args.font.name;
            if (cmd.args.font.size != undefined) cell.font.size = cmd.args.font.size;
            if (cmd.args.font.bold != undefined) cell.font.bold = cmd.args.font.bold;
            if (cmd.args.font.italic != undefined) cell.font.italic = cmd.args.font.italic;
            if (cmd.args.font.underline != undefined) cell.font.underline = cmd.args.font.underline;
            if (cmd.args.font.strike != undefined) cell.font.strike = cmd.args.font.strike;
            if (cmd.args.font.color) {
                cell.font.color ??= {};
                if (cmd.args.font.color.argb) cell.font.color = { argb: cmd.args.font.color.argb };
                if (cmd.args.font.color.theme) cell.font.color.theme = cmd.args.font.color.theme;
            }
        }

        return {
            file: workbook,
            output: {
                message: `Cell ${cellRef} font updated`,
                cellReference: cellRef,
                font: {
                    name: cell.font.name,
                    size: cell.font.size,
                    bold: cell.font.bold,
                    italic: cell.font.italic,
                    underline: cell.font.underline,
                    strike: cell.font.strike
                }
            }
        };
    },
);