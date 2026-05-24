import { FileBasedTool } from "../toolClasses/fileBasedTools.js";
import { z } from "zod/v4";
import { ExcelFileSerialiser, parseExcelReference } from "../../services/excelutils.js";
import { cellValue } from "../../services/exceltypes.js";
import getWorksheet from "../../services/getWorkSheet.js";

export const fontsTool = new FileBasedTool(
    "fonts",
    "Configure font properties (name, size, color, bold, italic).",
    z.codec(
        z.object({
            cellReference: z.string(),
            font: z.object({
                name: z.string().optional().meta({description: "Font name. Examples: \"Arial\", \"Calibri\", \"Times New Roman\""}),
                size: z.number().optional().meta({description: "Font size in points. Range: 1-400. Examples: 8, 10, 12, 16"}),
                bold: z.boolean().optional().meta({description: "Whether the font is bold. Examples: true, false"}),
                italic: z.boolean().optional().meta({description: "Whether the font is italic. Examples: true, false"}),
                underline: z.union([z.boolean(), z.enum(["none", "single", "double", "singleAccounting", "doubleAccounting"])]).optional().meta({description: "Whether the text is underlined. Examples: true, false"}),
                strike: z.boolean().optional().meta({description: "Whether the text has strikethrough. Examples: true, false"}),
                color: z.object({
                    argb: z.string().regex(/^[0-9A-F]{8}$/i).optional().meta({description: "ARGB color code. Hex format: 8 characters. Range: 00000000 to FFFFFFFF. Examples: \"FF000000\" (black), \"FFFFFFFF\" (white), \"FFFF0000\" (red)"}),
                    theme: z.number().min(0).max(65).optional().meta({description: "Theme color index. Range: 0-65. Examples: 0 (none), 1 (black), 2 (white), 3 (red)"})
                }).optional().meta({description: "Font color. Either theme (number) or ARGB (hex string)"})
            }).optional()
        }),
        z.object({
            sheet: z.string().nullable(),
            cell: z.string(),
            font: z.object({
                name: z.string().optional(),
                size: z.number().optional(),
                bold: z.boolean().optional(),
                italic: z.boolean().optional(),
                underline: z.union([z.boolean(), z.enum(["none", "single", "double", "singleAccounting", "doubleAccounting"])]).optional(),
                strike: z.boolean().optional(),
                color: z.object({
                    argb: z.string().optional(),
                    theme: z.number().optional()
                }).optional()
            }).optional()
        }),
        {
            decode: (args) => ({
                sheet: parseExcelReference(args.cellReference).sheet,
                cell: parseExcelReference(args.cellReference).cell,
                font: args.font || undefined,
            }),
            encode: (value) => ({
                cellReference: value.cell,
                font: value.font || undefined,
            }),
        }
    ),
    z.codec(
        z.object({
            message: z.string().meta({description: "Success message describing the font update operation"}),
            cellReference: z.string().meta({description: "Reference to the cell that was updated. Examples: \"A1\", \"B2\""}),
            font: z.object({
                name: z.string().optional().meta({description: "Font name that was applied. Examples: \"Arial\", \"Calibri\""}),
                size: z.number().optional().meta({description: "Font size in points that was applied. Examples: 10, 12"}),
                bold: z.boolean().optional().meta({description: "Bold status that was applied. Examples: true, false"}),
                italic: z.boolean().optional().meta({description: "Italic status that was applied. Examples: true, false"}),
                underline: z.union([z.boolean(), z.enum(["none", "single", "double", "singleAccounting", "doubleAccounting"])]).optional().meta({description: "Underline status that was applied. Examples: true, false"}),
                strike: z.boolean().optional().meta({description: "Strikethrough status that was applied. Examples: true, false"})
            }).meta({description: "Font properties that were applied to the cell"})
        }).optional().meta({description: "Result of the font update operation with applied formatting"}),
         z.object({
            message: z.string().meta({description: "Success message describing the font update operation"}),
            cellReference: z.string().meta({description: "Reference to the cell that was updated. Examples: \"A1\", \"B2\""}),
            font: z.object({
                name: z.string().optional().meta({description: "Font name that was applied. Examples: \"Arial\", \"Calibri\""}),
                size: z.number().optional().meta({description: "Font size in points that was applied. Examples: 10, 12"}),
                bold: z.boolean().optional().meta({description: "Bold status that was applied. Examples: true, false"}),
                italic: z.boolean().optional().meta({description: "Italic status that was applied. Examples: true, false"}),
                underline: z.union([z.boolean(), z.enum(["none", "single", "double", "singleAccounting", "doubleAccounting"])]).optional().meta({description: "Underline status that was applied. Examples: true, false"}),
                strike: z.boolean().optional().meta({description: "Strikethrough status that was applied. Examples: true, false"})
            }).meta({description: "Font properties that were applied to the cell"})
        }).optional().meta({description: "Result of the font update operation with applied formatting"}),
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
                message: `Cell ${cmd.args.cell} font updated`,
                cellReference: cmd.args.cell,
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